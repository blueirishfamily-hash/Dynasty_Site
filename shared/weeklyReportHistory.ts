import { computeHeadToHead, filterGames, type LeagueHistory } from "./leagueHistory";
import type { PreviewMatchup } from "./weeklyReport";

export type MatchupHistory = NonNullable<PreviewMatchup["history"]>;

/**
 * All-time series for each previewed matchup. Regular season and playoff games count, consolation games do not.
 *
 * History is kept per franchise (the owner's Sleeper user id, or `roster-<id>` for an unowned roster). A roster that
 * changed hands therefore has a separate history for each owner; they are not merged here.
 *
 * Returns one entry per matchup, in the same order. An entry is null when a roster has no franchise id.
 */
export function headToHeadForMatchups(
  history: LeagueHistory,
  matchups: Array<Pick<PreviewMatchup, "a" | "b">>,
  rosterToFranchise: Map<number, string>,
): Array<MatchupHistory | null> {
  const games = filterGames(history);
  const seasonsCovered = new Set(games.map(g => g.season)).size;
  return matchups.map(m => {
    const aId = rosterToFranchise.get(m.a.rosterId);
    const bId = rosterToFranchise.get(m.b.rosterId);
    if (!aId || !bId || aId === bId) return null;
    const h = computeHeadToHead(games, aId, bId);
    const lastGame = h.games.length ? h.games[h.games.length - 1] : null;
    return {
      aWins: h.aWins,
      bWins: h.bWins,
      ties: h.ties,
      aPoints: h.aPoints,
      bPoints: h.bPoints,
      streak: h.streak,
      meetings: h.games.length,
      seasonsCovered,
      last: lastGame
        ? {
            season: lastGame.season,
            week: lastGame.week,
            aScore: lastGame.a === aId ? lastGame.scoreA : lastGame.scoreB,
            bScore: lastGame.a === aId ? lastGame.scoreB : lastGame.scoreA,
            label: lastGame.label,
          }
        : null,
    };
  });
}
