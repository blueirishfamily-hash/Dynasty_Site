import { storage } from "./storage";
import { getLeague, getLeagueRosters, getLeagueDrafts, getDraftPicks } from "./sleeper";

/** Rookie pay scale in $M for a rookie draft pick. Rounds after the third have no scale. */
export function rookiePayScale(round: number, draftSlot: number): number {
  if (round === 1) {
    const firstRound: Record<number, number> = { 1: 12, 2: 11, 3: 11, 4: 9, 5: 9, 6: 9, 7: 7, 8: 7, 9: 7, 10: 6, 11: 6, 12: 6 };
    return firstRound[draftSlot] || 4;
  }
  if (round === 2) return 4;
  if (round === 3) return 2;
  return 0;
}

export interface RookieSyncResult {
  season: number;
  created: string[];
  flagged: string[];
  skipped: Array<{ name: string; reason: string }>;
  draftFound: boolean;
}

interface DraftedPlayer {
  playerId: string;
  name: string;
  round: number;
  draftSlot: number;
}

async function loadDraftedPlayers(leagueId: string, season: number): Promise<DraftedPlayer[]> {
  const out: DraftedPlayer[] = [];
  const seen = new Set<string>();
  const add = (p: { player_id: string; round: number; draft_slot: number; metadata?: any }) => {
    const id = String(p.player_id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(" ") || id;
    out.push({ playerId: id, name, round: p.round, draftSlot: p.draft_slot });
  };

  // Saved snapshots first, then the live Sleeper draft for this season.
  try {
    const snapshots = await storage.getDraftSnapshots(leagueId, String(season));
    for (const snap of snapshots) {
      try {
        (JSON.parse(snap.picksData) as any[]).forEach(add);
      } catch { /* malformed snapshot */ }
    }
  } catch { /* snapshots unavailable */ }
  if (out.length > 0) return out;

  const drafts = await getLeagueDrafts(leagueId);
  const rookieDrafts = drafts.filter(
    d => String(d.season) === String(season) &&
      String(d.status || "").toLowerCase().trim() === "complete" &&
      ["rookie", "linear", "snake"].includes(d.type),
  );
  for (const draft of rookieDrafts) {
    const picks = await getDraftPicks(draft.draft_id);
    picks.forEach(add);
  }
  return out;
}

/**
 * Gives every player drafted in this season's rookie draft a rookie contract: three years at the pay scale,
 * starting this season, flagged as a rookie deal. Safe to run any number of times.
 *  - no contract (or no salaries): one is created
 *  - an existing pay-scale contract that is missing the rookie flag: the flag is set
 *  - anything else is left alone and reported
 */
export async function syncRookieContracts(leagueId: string): Promise<RookieSyncResult> {
  const league = await getLeague(leagueId);
  const season = parseInt(league.season || "", 10) || new Date().getFullYear();
  const result: RookieSyncResult = { season, created: [], flagged: [], skipped: [], draftFound: false };

  const drafted = await loadDraftedPlayers(leagueId, season);
  result.draftFound = drafted.length > 0;
  if (!result.draftFound) return result;

  const rosters = await getLeagueRosters(leagueId);
  const rosterOf = new Map<string, number>();
  for (const r of rosters) {
    for (const pid of r.players || []) rosterOf.set(String(pid), r.roster_id);
  }

  const contracts = await storage.getPlayerContracts(leagueId);
  const years = [season, season + 1, season + 2];

  for (const p of drafted) {
    const rosterId = rosterOf.get(p.playerId);
    if (rosterId == null) {
      result.skipped.push({ name: p.name, reason: "not on a roster" });
      continue;
    }
    const scale = rookiePayScale(p.round, p.draftSlot);
    if (scale <= 0) {
      result.skipped.push({ name: p.name, reason: `round ${p.round} has no pay scale` });
      continue;
    }
    const tenths = Math.round(scale * 10);
    const existing = contracts.find(c => c.playerId === p.playerId && c.rosterId === rosterId);

    let salaries: Record<string, number> = {};
    if (existing) {
      try {
        const raw = typeof existing.salaries === "string" ? JSON.parse(existing.salaries || "{}") : (existing.salaries as any) || {};
        for (const [y, v] of Object.entries(raw)) if (Number(v) > 0) salaries[y] = Number(v);
      } catch { salaries = {}; }
    }
    const hasSalaries = Object.keys(salaries).length > 0;

    if (!existing || !hasSalaries) {
      await storage.upsertPlayerContract({
        leagueId,
        rosterId,
        playerId: p.playerId,
        salaries: JSON.stringify(Object.fromEntries(years.map(y => [String(y), tenths]))),
        fifthYearOption: null,
        isOnIr: (existing as any)?.isOnIr ?? 0,
        franchiseTagUsed: 0,
        franchiseTagYear: null,
        originalContractYears: 3,
        isRookieContract: 1,
      } as any);
      result.created.push(p.name);
      continue;
    }

    if ((existing as any).isRookieContract === 1) continue;

    const keys = Object.keys(salaries);
    const matchesScale =
      keys.length === 3 && years.every(y => salaries[String(y)] === tenths);
    if (matchesScale) {
      await storage.upsertPlayerContract({
        leagueId,
        rosterId,
        playerId: p.playerId,
        salaries: existing.salaries,
        originalContractYears: 3,
        isRookieContract: 1,
      } as any);
      result.flagged.push(p.name);
    } else {
      result.skipped.push({ name: p.name, reason: "already has a different contract" });
    }
  }
  return result;
}
