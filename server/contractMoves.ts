// Automatic contract moves from Sleeper activity: trades, drops and pickups. The rules live in
// server/contractMovePlanner.ts; this file fetches the data, writes the move log, and applies moves to the contracts.
//
// Automatic moves are ON by default. The moment a league first uses this, that moment is recorded as the start: Sleeper
// activity from then on is applied automatically. Older moves from this season (back to the start of the regular
// season) are not applied; they wait as proposals in League Settings for the commissioner to approve or reject, so a
// season of history is never rewritten without a look. The commissioner can switch it off in League Settings (it then
// stays off, and the older behaviour in server/deadCap.ts runs instead). Each Sleeper transaction is handled once:
// the log has one row per (transaction, player, kind).
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { getAllPlayers, getLeagueRosters, getLeagueTransactions, getLeagueUsers, getNFLState } from "./sleeper";
import { currentSandboxId } from "./testSandbox";
import { getPhaseState } from "./contractHubRoutes";
import { isOffseasonPhase } from "../shared/contractRules";
import { rulesForSleeperLeague } from "./leagueRules";
import { getDeadCapSetting, REGULAR_SEASON_STARTED_AT_KEY } from "./deadCap";
import { moveKey, planContractMoves, type MoveEffect, type MoveFlag } from "./contractMovePlanner";
import type { ContractMove } from "../shared/schema";

export const CONTRACT_MOVES_LIVE_AT_KEY = "contract_moves_live_at";

const SLEEPER_WEEKS = 18;
const RUN_EVERY_MS = 5 * 60 * 1000;

export interface RunResult {
  /** New log rows written this run */
  logged: number;
  /** Of those, moves applied to contracts */
  applied: number;
  /** Of those, moves left as proposals for the commissioner */
  proposed: number;
  failed: number;
}
const EMPTY: RunResult = { logged: 0, applied: 0, proposed: 0, failed: 0 };

/** The stored value that means the commissioner switched automatic moves off. */
const OFF = "off";

/**
 * When automatic moves started, or null while they are off.
 * Never set means the league has not used this yet: that is the default, ON, and this moment becomes the start.
 */
export async function getContractMovesLiveAt(leagueId: string): Promise<number | null> {
  const value = await storage.getLeagueSetting(leagueId, CONTRACT_MOVES_LIVE_AT_KEY);
  if (value === undefined || value === null) {
    // A contracts test session must not write settings; treat it as not started.
    if (currentSandboxId()) return null;
    const now = Date.now();
    await storage.setLeagueSetting(leagueId, CONTRACT_MOVES_LIVE_AT_KEY, String(now));
    return now;
  }
  const at = Number(value);
  return at > 0 ? at : null; // "off" (and the empty value an earlier version used for off) is not a number
}

export async function setContractMovesLive(leagueId: string, on: boolean): Promise<number | null> {
  const before = await getContractMovesLiveAt(leagueId);
  if (on && before) return before;
  await storage.setLeagueSetting(leagueId, CONTRACT_MOVES_LIVE_AT_KEY, on ? String(Date.now()) : OFF);
  lastRun.clear();
  return getContractMovesLiveAt(leagueId);
}

const lastRun = new Map<string, number>();
const inFlight = new Map<string, Promise<RunResult>>();

/**
 * Plans moves from the league's Sleeper transactions, writes new ones to the log, and (when automatic moves are on)
 * applies the ones from after it was turned on. Safe to call often: it runs at most every few minutes per league
 * unless forced, and never handles a transaction twice.
 */
export function runContractMoves(leagueId: string, opts: { force?: boolean } = {}): Promise<RunResult> {
  // A contracts test session must not write to the real tables (the storage proxy would skip the writes anyway).
  if (currentSandboxId()) return Promise.resolve(EMPTY);
  const running = inFlight.get(leagueId);
  if (running) return running;
  if (!opts.force && Date.now() - (lastRun.get(leagueId) ?? 0) < RUN_EVERY_MS) return Promise.resolve(EMPTY);
  const run = execute(leagueId)
    .catch((err) => {
      console.warn(`[contract-moves] skipped for ${leagueId}:`, (err as Error).message);
      return EMPTY;
    })
    .finally(() => {
      lastRun.set(leagueId, Date.now());
      inFlight.delete(leagueId);
    });
  inFlight.set(leagueId, run);
  return run;
}

async function execute(leagueId: string): Promise<RunResult> {
  const liveAt = await getContractMovesLiveAt(leagueId);
  const deadCapSetting = await getDeadCapSetting(leagueId);
  const phase = await getPhaseState(leagueId);
  const offseason = isOffseasonPhase(phase.current);

  // When this league year's regular season began (same rule the dead cap sync uses).
  let seasonStart = Number(await storage.getLeagueSetting(leagueId, REGULAR_SEASON_STARTED_AT_KEY)) || 0;
  if (!seasonStart && !offseason) {
    const nfl = await getNFLState().catch(() => null as any);
    if (nfl && Number(nfl.season) === phase.contractYear) seasonStart = Date.parse(String(nfl.season_start_date || "")) || 0;
  }
  // Look back to the start of the regular season. In the offseason there is nothing to look back at: only what
  // happens after the commissioner turns this on.
  const windowStart = seasonStart > 0 ? seasonStart : liveAt ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(windowStart)) return EMPTY;

  const rules = await rulesForSleeperLeague(leagueId);
  const [weeks, rosters, users, contracts, deadCapEntries, logRows, allPlayers] = await Promise.all([
    Promise.all(Array.from({ length: SLEEPER_WEEKS }, (_, i) => getLeagueTransactions(leagueId, i + 1).catch(() => []))),
    getLeagueRosters(leagueId),
    getLeagueUsers(leagueId).catch(() => []),
    storage.getPlayerContracts(leagueId),
    storage.getDeadCapEntriesByLeague(leagueId),
    storage.getContractMoves(leagueId),
    getAllPlayers().catch(() => ({} as Record<string, any>)),
  ]);
  const transactions = weeks.flat().filter((t: any) => !!t);
  if (transactions.length === 0) return EMPTY;

  const userById = new Map<string, any>(users.map((u: any) => [String(u.user_id), u]));
  const teamNames = new Map<number, string>(
    rosters.map((r: any) => {
      const u = userById.get(String(r.owner_id));
      return [r.roster_id, u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`] as [number, string];
    }),
  );
  const rosterPlayers = new Map<number, Set<string>>(rosters.map((r: any) => [r.roster_id, new Set<string>((r.players || []).map(String))]));
  const players: Record<string, { position?: string | null; name?: string | null }> = {};
  for (const [id, p] of Object.entries(allPlayers as Record<string, any>)) {
    players[id] = { position: p.position, name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id };
  }

  const plan = planContractMoves({
    transactions,
    contracts: contracts.map((c) => ({ rosterId: c.rosterId, playerId: c.playerId, salaries: c.salaries, updatedAt: Number(c.updatedAt) || 0 })),
    deadCapEntries: deadCapEntries.map((d) => ({
      rosterId: d.rosterId,
      playerId: d.playerId,
      createdAt: Number(d.createdAt) || 0,
      deadCapSalaries: typeof d.deadCapSalaries === "string" ? d.deadCapSalaries : JSON.stringify(d.deadCapSalaries ?? {}),
    })),
    rosterPlayers,
    teamNames,
    players,
    contractYear: phase.contractYear,
    offseason,
    deadCap: { enabled: deadCapSetting.enabled, enabledAt: deadCapSetting.enabledAt, shares: rules.deadCap.shareByYearsLeft },
    seasonStart,
    windowStart,
    pickup: rules.inSeasonPickup,
    salaryCap: rules.salaryCap,
    logged: new Map(logRows.map((r) => [moveKey(r.transactionId, r.playerId, r.kind as any), r.status] as [string, string])),
  });

  const now = Date.now();
  const rows = plan
    .filter((m) => m.status === "planned")
    .map((m) => ({
      id: randomUUID(),
      leagueId,
      transactionId: m.transactionId,
      kind: m.kind,
      playerId: m.playerId,
      playerName: m.playerName.slice(0, 128),
      playerPosition: m.playerPosition ? String(m.playerPosition).slice(0, 16) : null,
      fromRosterId: m.fromRosterId,
      toRosterId: m.toRosterId,
      status: "proposed",
      summary: m.summary,
      detail: JSON.stringify(m.detail),
      flags: m.flags.length > 0 ? JSON.stringify(m.flags) : null,
      flagStatus: m.flags.length > 0 ? "open" : null,
      txAt: m.at,
      createdAt: now,
      resolvedAt: null,
      resolvedBy: null,
    }));
  // A row for the same transaction, player and kind is never inserted twice, so a second run cannot apply anything twice.
  const inserted = await storage.insertContractMoves(rows);
  const result: RunResult = { logged: inserted.length, applied: 0, proposed: 0, failed: 0 };
  for (const row of inserted) {
    if (liveAt && Number(row.txAt) >= liveAt) {
      const outcome = await applyContractMove(leagueId, row, "automatic");
      if (outcome.ok) result.applied++;
      else result.failed++;
    } else {
      result.proposed++;
    }
  }
  if (inserted.length > 0) {
    console.log(`[contract-moves] ${leagueId}: ${result.logged} new (${result.applied} applied, ${result.proposed} proposed, ${result.failed} failed)`);
  }
  return result;
}

export interface ApplyOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Applies one logged move to the contracts and marks it applied (or failed, with the reason in its detail).
 * `by` is "automatic" or the commissioner's Sleeper user id.
 */
export async function applyContractMove(leagueId: string, row: ContractMove, by: string): Promise<ApplyOutcome> {
  const fail = async (error: string): Promise<ApplyOutcome> => {
    let detail: Record<string, unknown> = {};
    try {
      detail = JSON.parse(row.detail || "{}");
    } catch { /* keep an empty detail */ }
    await storage.updateContractMoveStatus(row.id, {
      status: "failed",
      detail: JSON.stringify({ ...detail, error }),
      resolvedAt: Date.now(),
      resolvedBy: by,
    });
    return { ok: false, error };
  };

  let effect: MoveEffect | undefined;
  try {
    effect = JSON.parse(row.detail || "{}").effect;
  } catch { /* handled below */ }
  if (!effect) return fail("This move has no saved plan.");

  const contracts = await storage.getPlayerContracts(leagueId);
  const find = (rosterId: number) => contracts.find((c) => c.rosterId === rosterId && c.playerId === row.playerId);
  const hasSalaryFrom = (salariesJson: string, year: number) => {
    try {
      return Object.entries(JSON.parse(salariesJson || "{}")).some(([y, v]) => Number(y) >= year && Number(v) > 0);
    } catch {
      return false;
    }
  };

  if (effect.type === "move") {
    const contract = find(effect.fromRosterId);
    if (!contract) return fail("The contract is no longer filed under the team that traded him.");
    await storage.deletePlayerContract(leagueId, effect.fromRosterId, row.playerId);
    await storage.upsertPlayerContract({
      leagueId,
      rosterId: effect.toRosterId,
      playerId: row.playerId,
      salaries: contract.salaries,
      fifthYearOption: contract.fifthYearOption,
      // The contract moves as it is. (The IR flag is carried over too; whether it should reset on a trade may be
      // revisited.) Whether he has been extended or franchise tagged "on this roster" starts over with the new team,
      // the same rule storage.upsertPlayerContract applies when a player changes teams.
      isOnIr: contract.isOnIr,
      franchiseTagUsed: contract.franchiseTagUsed,
      franchiseTagYear: contract.franchiseTagYear,
      originalContractYears: contract.originalContractYears,
      isRookieContract: contract.isRookieContract,
      extensionApplied: contract.extensionApplied,
      extensionYear: contract.extensionYear,
      extensionSalary: contract.extensionSalary,
      extensionType: contract.extensionType,
      hasBeenExtended: 0,
      hasBeenFranchiseTagged: 0,
    } as any);
    // Pending extensions move with the player. This is the current decision and may be revised later (for example a
    // pending extension could be dropped on a trade instead). Pending franchise tags are kept in the owner's browser,
    // so they cannot be moved from here.
    await storage.updatePendingExtensionRoster(leagueId, row.playerId, effect.fromRosterId, effect.toRosterId);
  } else if (effect.type === "end") {
    const contract = find(effect.rosterId);
    if (!contract) return fail("The contract is no longer on file for the team that dropped him.");
    if (effect.deadCapSalaries) {
      await storage.createDeadCapEntry({
        leagueId,
        rosterId: effect.rosterId,
        playerId: row.playerId,
        playerName: row.playerName,
        playerPosition: row.playerPosition ?? "",
        reason: "dropped",
        deadCapSalaries: JSON.stringify(effect.deadCapSalaries),
      } as any);
    }
    await storage.deletePlayerContract(leagueId, effect.rosterId, row.playerId);
  } else {
    const existing = find(effect.rosterId);
    if (existing && hasSalaryFrom(existing.salaries, effect.fromYear)) {
      return fail("The team already has a contract for him this season.");
    }
    await storage.upsertPlayerContract({
      leagueId,
      rosterId: effect.rosterId,
      playerId: row.playerId,
      salaries: JSON.stringify(effect.salaries),
      fifthYearOption: null,
      isOnIr: 0,
      franchiseTagUsed: 0,
      franchiseTagYear: null,
      originalContractYears: effect.years,
      isRookieContract: 0,
      extensionApplied: 0,
      hasBeenExtended: 0,
      hasBeenFranchiseTagged: 0,
    } as any);
  }
  await storage.updateContractMoveStatus(row.id, { status: "applied", resolvedAt: Date.now(), resolvedBy: by });
  return { ok: true };
}

export async function rejectContractMove(leagueId: string, id: string, by: string): Promise<boolean> {
  const row = await storage.getContractMoveById(leagueId, id);
  if (!row || row.status !== "proposed") return false;
  await storage.updateContractMoveStatus(id, { status: "rejected", resolvedAt: Date.now(), resolvedBy: by });
  return true;
}

export async function resolveContractMoveFlag(leagueId: string, id: string, by: string): Promise<boolean> {
  const row = await storage.getContractMoveById(leagueId, id);
  if (!row || row.flagStatus !== "open") return false;
  await storage.updateContractMoveStatus(id, { flagStatus: "resolved", resolvedBy: by });
  return true;
}

export function parseFlags(row: Pick<ContractMove, "flags">): MoveFlag[] {
  try {
    return row.flags ? (JSON.parse(row.flags) as MoveFlag[]) : [];
  } catch {
    return [];
  }
}
