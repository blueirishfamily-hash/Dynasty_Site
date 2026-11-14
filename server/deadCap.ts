/**
 * Dead cap for players dropped in Sleeper.
 *
 * The commissioner turns dead cap on or off in Settings. It is not retroactive: only drops made after it was
 * turned on count. A drop during the regular season (or after the Week 14 deadline, until the league year rolls
 * over) ends the contract and leaves dead cap on the team that dropped him. A drop in the offseason ends the
 * contract with no dead cap. Trades never create dead cap; the contract moves with the player.
 *
 * In-season pickups: a player added from free agency or waivers during the regular season, who is still on that
 * team and has no contract with it, gets a 1-year $1 contract for the current season. This does not depend on the
 * dead cap setting. Team defenses are left out: they get no pickup contract (they can still be tagged or extended
 * if they have a contract).
 *
 * Dead cap rule: this season's remaining salary is 100% dead. Each later season's salary is dead by how many
 * contract years are left from that season on: 1 left = 0%, 2 = 25%, 3 = 50%, 4 = 75%, 5 or more = 100%.
 */
import { storage } from "./storage";
import { getLeagueRosters, getLeagueTransactions, getAllPlayers, getNFLState } from "./sleeper";
import { currentSandboxId } from "./testSandbox";
import { getPhaseState } from "./contractHubRoutes";
import { isOffseasonPhase, deadCapForEndedContract } from "../shared/contractRules";

export const DEAD_CAP_ENABLED_KEY = "dead_cap_enabled";
export const DEAD_CAP_ENABLED_AT_KEY = "dead_cap_enabled_at";
/** Set when the commissioner starts the regular season; drops before it are offseason drops. */
export const REGULAR_SEASON_STARTED_AT_KEY = "regular_season_started_at";

const SLEEPER_WEEKS = 18;
const SYNC_EVERY_MS = 5 * 60 * 1000;
/** In-season free agent pickups: 1 year at $1M, stored in tenths. */
const IN_SEASON_SIGNING_TENTHS = 10;

export async function getDeadCapSetting(leagueId: string): Promise<{ enabled: boolean; enabledAt: number | null }> {
  const [value, at] = await Promise.all([
    storage.getLeagueSetting(leagueId, DEAD_CAP_ENABLED_KEY),
    storage.getLeagueSetting(leagueId, DEAD_CAP_ENABLED_AT_KEY),
  ]);
  const enabled = value === "true";
  const enabledAt = Number(at) || null;
  return { enabled, enabledAt: enabled ? enabledAt : null };
}

export async function setDeadCapEnabled(leagueId: string, enabled: boolean) {
  const before = await getDeadCapSetting(leagueId);
  await storage.setLeagueSetting(leagueId, DEAD_CAP_ENABLED_KEY, enabled ? "true" : "false");
  // Turning it on starts the clock. Turning it off and on again starts a new clock, so drops made while it was off
  // never count.
  if (enabled && !before.enabled) await storage.setLeagueSetting(leagueId, DEAD_CAP_ENABLED_AT_KEY, String(Date.now()));
  lastSync.clear();
  return getDeadCapSetting(leagueId);
}

export { deadCapForEndedContract };

const lastSync = new Map<string, number>();
const inFlight = new Map<string, Promise<number>>();

/**
 * Looks through the league's Sleeper transactions: ends the contracts of players dropped since dead cap was turned
 * on, then gives in-season free agent pickups their $1 contracts. Runs at most every few minutes per league (and
 * per test session). Returns how many contracts it ended or created.
 */
export function syncSleeperContractMoves(leagueId: string, force = false): Promise<number> {
  const key = `${currentSandboxId() ?? "live"}:${leagueId}`;
  const running = inFlight.get(key);
  if (running) return running;
  if (!force && Date.now() - (lastSync.get(key) ?? 0) < SYNC_EVERY_MS) return Promise.resolve(0);
  const run = processDrops(leagueId)
    .catch(err => {
      console.warn(`[contracts] Sleeper transaction sync skipped for ${leagueId}:`, (err as Error).message);
      return 0;
    })
    .finally(() => {
      lastSync.set(key, Date.now());
      inFlight.delete(key);
    });
  inFlight.set(key, run);
  return run;
}

async function processDrops(leagueId: string): Promise<number> {
  const setting = await getDeadCapSetting(leagueId);
  const phase = await getPhaseState(leagueId);
  const offseasonNow = isOffseasonPhase(phase.current);
  // Nothing to do in the offseason with dead cap off: offseason pickups come through free agency bidding.
  if (!setting.enabled && offseasonNow) return 0;
  const enabledAt = setting.enabledAt ?? Date.now();
  // When this league year's regular season began. Drops before it are offseason drops (no dead cap).
  let seasonStart = Number(await storage.getLeagueSetting(leagueId, REGULAR_SEASON_STARTED_AT_KEY)) || 0;
  if (!seasonStart && !offseasonNow) {
    const nfl = await getNFLState().catch(() => null as any);
    if (nfl && Number(nfl.season) === phase.contractYear) seasonStart = Date.parse(String(nfl.season_start_date || "")) || 0;
  }

  const weeks = await Promise.all(
    Array.from({ length: SLEEPER_WEEKS }, (_, i) => getLeagueTransactions(leagueId, i + 1).catch(() => [])),
  );
  const drops: Array<{ playerId: string; rosterId: number; at: number }> = [];
  const pickups: Array<{ playerId: string; rosterId: number; at: number }> = [];
  for (const tx of weeks.flat()) {
    if (!tx || tx.type === "trade" || tx.status !== "complete") continue;
    const at = Number(tx.status_updated || tx.created) || 0;
    if ((tx.type === "free_agent" || tx.type === "waiver") && tx.adds && !offseasonNow && seasonStart > 0 && at >= seasonStart) {
      for (const [playerId, rosterId] of Object.entries(tx.adds)) {
        pickups.push({ playerId: String(playerId), rosterId: Number(rosterId), at });
      }
    }
    if (!setting.enabled || !tx.drops || at < enabledAt) continue;
    for (const [playerId, rosterId] of Object.entries(tx.drops)) {
      // A commissioner move drops and adds the same player in one transaction: that is a move, not a cut.
      if (tx.adds && tx.adds[playerId] != null && tx.adds[playerId] !== rosterId) continue;
      drops.push({ playerId: String(playerId), rosterId: Number(rosterId), at });
    }
  }
  if (drops.length === 0 && pickups.length === 0) return 0;
  drops.sort((a, b) => a.at - b.at);

  const [contracts, deadCap, rosters] = await Promise.all([
    storage.getPlayerContracts(leagueId),
    storage.getDeadCapEntriesByLeague(leagueId),
    getLeagueRosters(leagueId),
  ]);
  const onRoster = new Map<number, Set<string>>(rosters.map(r => [r.roster_id, new Set((r.players || []).map(String))]));

  let ended = 0;
  let players: Record<string, any> | null = null;
  for (const drop of drops) {
    const contract = contracts.find(c => c.rosterId === drop.rosterId && c.playerId === drop.playerId);
    if (!contract) continue;
    // The contract must predate the drop (a later contract for the same player is a new deal) and the team must
    // not have picked him back up.
    if (Number(contract.updatedAt) > drop.at) continue;
    if (onRoster.get(drop.rosterId)?.has(drop.playerId)) continue;
    if (deadCap.some(d => d.rosterId === drop.rosterId && d.playerId === drop.playerId && Number(d.createdAt) >= drop.at)) continue;

    let salaries: Record<string, number> = {};
    try {
      salaries = JSON.parse(contract.salaries || "{}");
    } catch { /* treat as no salary */ }
    // A contract with no salary left (it expired) is already over; it stays on file for the free agent pool.
    if (!Object.entries(salaries).some(([y, v]) => Number(y) >= phase.contractYear && Number(v) > 0)) continue;

    const inSeason = !offseasonNow && seasonStart > 0 && drop.at >= seasonStart;
    if (inSeason) {
      const dead = deadCapForEndedContract(salaries, phase.contractYear);
      if (Object.keys(dead).length > 0) {
        players ??= await getAllPlayers().catch(() => ({}));
        const p = players[drop.playerId] || {};
        const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || drop.playerId;
        await storage.createDeadCapEntry({
          leagueId,
          rosterId: drop.rosterId,
          playerId: drop.playerId,
          playerName: String(name).slice(0, 128),
          playerPosition: String(p.position || "").slice(0, 16),
          reason: "dropped",
          deadCapSalaries: JSON.stringify(dead),
        } as any);
      }
    }
    await storage.deletePlayerContract(leagueId, drop.rosterId, drop.playerId);
    ended++;
    console.log(
      `[dead-cap] ${leagueId}: roster ${drop.rosterId} dropped ${drop.playerId}; contract ended ${inSeason ? "with dead cap" : "(offseason, no dead cap)"}`,
    );
  }

  // In-season pickups still on the team that added them, with no contract there yet: 1 year at $1.
  let signed = 0;
  const current = ended > 0 ? await storage.getPlayerContracts(leagueId) : contracts;
  const byKey = new Map(current.map(c => [`${c.rosterId}:${c.playerId}`, c]));
  const year = String(phase.contractYear);
  if (pickups.length > 0) players ??= await getAllPlayers().catch(() => ({}));
  for (const pickup of pickups) {
    const key = `${pickup.rosterId}:${pickup.playerId}`;
    // Team defenses have ids like "CIN" rather than a number.
    if (players?.[pickup.playerId]?.position === "DEF" || !/^\d+$/.test(pickup.playerId)) continue;
    if (!onRoster.get(pickup.rosterId)?.has(pickup.playerId)) continue;
    // A contract with this team that pays him this season already covers him. An old, expired one with this team
    // keeps its past seasons and gets this season added.
    let past: Record<string, number> = {};
    const existing = byKey.get(key);
    if (existing) {
      try {
        past = JSON.parse(existing.salaries || "{}");
      } catch { /* ignore */ }
      if (Number(past[year]) > 0 || Object.keys(past).some(y => Number(y) > phase.contractYear && Number(past[y]) > 0)) continue;
    }
    await storage.upsertPlayerContract({
      leagueId,
      rosterId: pickup.rosterId,
      playerId: pickup.playerId,
      salaries: JSON.stringify({ ...past, [year]: IN_SEASON_SIGNING_TENTHS }),
      fifthYearOption: null,
      isOnIr: 0,
      franchiseTagUsed: 0,
      franchiseTagYear: null,
      originalContractYears: 1,
      isRookieContract: 0,
      extensionApplied: 0,
      hasBeenExtended: 0,
      hasBeenFranchiseTagged: 0,
    } as any);
    byKey.set(key, { ...(existing ?? {}), salaries: JSON.stringify({ ...past, [year]: IN_SEASON_SIGNING_TENTHS }) } as any);
    signed++;
    console.log(`[in-season] ${leagueId}: roster ${pickup.rosterId} picked up ${pickup.playerId}; 1-year $1 contract for ${phase.contractYear}`);
  }
  return ended + signed;
}
