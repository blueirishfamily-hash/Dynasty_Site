// Max PF: for every completed regular season week, the best lineup a team could have started from the
// players it had that week; Max PF is the sum of those weekly values.
//
// Moved out of server/routes/standings.ts unchanged so the standings and the rookie draft order use the
// same definition. A short cache keeps the draft-picks endpoint (which several pages call) from re-fetching a
// season of transactions and matchups every time.
import {
  getAllPlayers,
  getLeagueMatchups,
  getLeagueTransactions,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
  type SleeperTransaction,
} from "./sleeper";

/** Max PF counts at most this many regular season weeks. */
const MAX_PF_WEEKS = 14;
const CACHE_MS = 2 * 60 * 1000;

const cache = new Map<string, { at: number; value: Promise<Map<number, number[]>> }>();

/**
 * How many regular season weeks are finished: all of them once the regular season is over, otherwise the
 * weeks before the current one. Same rule the standings use for PF and PA.
 */
export function completedRegularSeasonWeeksFor(opts: {
  seasonType: string | undefined;
  currentWeek: number;
  playoffWeekStart: number;
}): number {
  const regularSeasonWeeks = opts.playoffWeekStart - 1;
  const complete =
    opts.seasonType === "post" || opts.seasonType === "off" || opts.currentWeek >= opts.playoffWeekStart;
  return complete ? regularSeasonWeeks : Math.max(1, Math.min(opts.currentWeek - 1, regularSeasonWeeks));
}

/** Each roster's optimal-lineup points for every completed week (oldest first). */
export function computeWeeklyMaxPf(opts: {
  leagueId: string;
  rosters: SleeperRoster[];
  league: SleeperLeague | null | undefined;
  completedRegularSeasonWeeks: number;
}): Promise<Map<number, number[]>> {
  const key = `${opts.leagueId}:${opts.completedRegularSeasonWeeks}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = compute(opts);
  cache.set(key, { at: Date.now(), value });
  // A failed run must not stay cached.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

async function compute(opts: {
  leagueId: string;
  rosters: SleeperRoster[];
  league: SleeperLeague | null | undefined;
  completedRegularSeasonWeeks: number;
}): Promise<Map<number, number[]>> {
  const { leagueId, rosters, league, completedRegularSeasonWeeks } = opts;
  const weeksToSum = Math.min(completedRegularSeasonWeeks, MAX_PF_WEEKS);
  const players = await getAllPlayers();

  // Transactions for each week, to rebuild who was on each roster
  const weeklyTransactions = await Promise.all(
    Array.from({ length: completedRegularSeasonWeeks }, (_, i) => i + 1).map((week) =>
      getLeagueTransactions(leagueId, week)
        .then((transactions) => ({ week, transactions }))
        .catch((error) => {
          console.warn(`[Max PF] Error fetching transactions for week ${week}:`, error);
          return { week, transactions: [] as SleeperTransaction[] };
        })
    )
  );

  // Roster positions (exclude bench/IR/taxi since they don't affect the optimal lineup)
  const rosterPositions = (league?.roster_positions || []).filter((pos) => !["BN", "IR", "TAXI"].includes(pos));

  // Roster composition per week (transactions apply forward from opening day)
  const buildRosterHistory = () => {
    const rosterState = new Map<number, Set<string>>();
    const rosterWeekly = new Map<number, Map<number, string[]>>();

    // Start from current rosters (players + taxi + reserve) as the Max PF pool
    rosters.forEach((r) => {
      rosterState.set(r.roster_id, new Set([...(r.players || []), ...(r.taxi || []), ...(r.reserve || [])]));
      rosterWeekly.set(r.roster_id, new Map());
    });

    // Reverse-apply all in-season transactions to get the opening day roster
    const allTx = weeklyTransactions
      .flatMap(({ week, transactions }) => transactions.map((t) => ({ week, t })))
      .filter(({ t }) => t.status === "complete")
      .sort((a, b) =>
        b.week !== a.week ? b.week - a.week : (b.t.status_updated || 0) - (a.t.status_updated || 0)
      );
    for (const { t } of allTx) {
      Object.entries(t.adds || {}).forEach(([playerId, rosterId]) => {
        rosterState.get(Number(rosterId))?.delete(playerId);
      });
      Object.entries(t.drops || {}).forEach(([playerId, rosterId]) => {
        rosterState.get(Number(rosterId))?.add(playerId);
      });
    }

    // Forward pass: apply week 1..N transactions and snapshot each week
    for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
      const transactionsForWeek = weeklyTransactions.find((w) => w.week === week)?.transactions || [];
      transactionsForWeek
        .filter((t) => t.status === "complete")
        .forEach((t) => {
          Object.entries(t.adds || {}).forEach(([playerId, rosterId]) => {
            rosterState.get(Number(rosterId))?.add(playerId);
          });
          Object.entries(t.drops || {}).forEach(([playerId, rosterId]) => {
            rosterState.get(Number(rosterId))?.delete(playerId);
          });
        });
      rosterState.forEach((state, rosterId) => {
        rosterWeekly.get(rosterId)?.set(week, Array.from(state));
      });
    }
    return rosterWeekly;
  };
  const rosterHistory = buildRosterHistory();

  // Matchups for each completed week (they carry per-player points)
  const weeklyMatchups = await Promise.all(
    Array.from({ length: completedRegularSeasonWeeks }, (_, i) => i + 1).map((week) =>
      getLeagueMatchups(leagueId, week)
        .then((matchups) => ({ week, matchups }))
        .catch((error) => {
          console.warn(`[Max PF] Error fetching matchups for week ${week}:`, error);
          return { week, matchups: [] as SleeperMatchup[] };
        })
    )
  );
  const matchupByRosterAndWeek = new Map<number, Map<number, SleeperMatchup>>();
  weeklyMatchups.forEach(({ week, matchups }) => {
    const weekMap = new Map<number, SleeperMatchup>();
    matchups.forEach((m) => weekMap.set(m.roster_id, m));
    matchupByRosterAndWeek.set(week, weekMap);
  });

  // Per-week roster from matchup.players (source of truth), with the rebuilt history as the fallback
  const rosterWeeklyRoster = new Map<number, Map<number, string[]>>();
  rosters.forEach((roster) => rosterWeeklyRoster.set(roster.roster_id, new Map()));
  for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
    const weekMatchups = matchupByRosterAndWeek.get(week) || new Map<number, SleeperMatchup>();
    rosters.forEach((roster) => {
      const matchup = weekMatchups.get(roster.roster_id);
      const weekRoster =
        matchup?.players && matchup.players.length > 0
          ? matchup.players
          : rosterHistory.get(roster.roster_id)?.get(week) || [];
      rosterWeeklyRoster.get(roster.roster_id)!.set(week, weekRoster);
    });
  }

  // Weekly player points per roster
  const rosterWeeklyPoints = new Map<number, Map<number, Record<string, number>>>();
  for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
    const weekMatchups = matchupByRosterAndWeek.get(week) || new Map<number, SleeperMatchup>();
    rosters.forEach((roster) => {
      const weekRoster = rosterWeeklyRoster.get(roster.roster_id)?.get(week) || [];
      const playersPoints = weekMatchups.get(roster.roster_id)?.players_points || {};
      if (!rosterWeeklyPoints.has(roster.roster_id)) rosterWeeklyPoints.set(roster.roster_id, new Map());
      const weekPoints: Record<string, number> = {};
      weekRoster.forEach((playerId) => {
        weekPoints[playerId] = typeof playersPoints[playerId] === "number" ? playersPoints[playerId] : 0;
      });
      rosterWeeklyPoints.get(roster.roster_id)!.set(week, weekPoints);
    });
  }

  const isEligibleForSlot = (position: string, slot: string) => {
    if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
    if (slot === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
    if (slot === "WRRB") return ["WR", "RB"].includes(position);
    if (slot === "WRRBTE") return ["WR", "RB", "TE"].includes(position);
    return position === slot;
  };

  const buildSlotOrder = (slots: string[]) => {
    const priority = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const flexes = ["SUPER_FLEX", "WRRBTE", "WRRB", "FLEX"];
    const fixed = slots.filter((s) => priority.includes(s));
    const remaining = slots.filter((s) => !priority.includes(s) && flexes.includes(s));
    return [...fixed, ...remaining];
  };
  const slotOrder = buildSlotOrder(rosterPositions);

  const calculateOptimalLineup = (
    playerIds: string[],
    playerPoints: Record<string, number>,
    slots: string[]
  ): number => {
    const used = new Set<string>();
    let total = 0;
    for (const slot of slots) {
      const best = playerIds
        .filter((pid) => !used.has(pid))
        .map((pid) => ({
          pid,
          position: players[pid]?.position || "FLEX",
          points: playerPoints[pid] ?? 0,
        }))
        .filter((p) => isEligibleForSlot(p.position, slot))
        .sort((a, b) => b.points - a.points)[0];
      if (best) {
        used.add(best.pid);
        total += best.points || 0;
      }
    }
    return total;
  };

  const result = new Map<number, number[]>();
  rosters.forEach((roster) => {
    const weekly: number[] = [];
    for (let week = 1; week <= weeksToSum; week++) {
      const weekRoster = rosterWeeklyRoster.get(roster.roster_id)?.get(week) || [];
      const weekPoints = rosterWeeklyPoints.get(roster.roster_id)?.get(week) || {};
      const weekMax = calculateOptimalLineup(weekRoster, weekPoints, slotOrder);
      if (typeof weekMax !== "number" || isNaN(weekMax)) {
        console.warn(`[Max PF] Invalid weekMax for roster ${roster.roster_id}, week ${week}: ${weekMax}`);
        continue;
      }
      weekly.push(weekMax);
    }
    result.set(roster.roster_id, weekly);
  });
  return result;
}
