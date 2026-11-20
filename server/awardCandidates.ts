// MVP nominee pool: a player must have finished in the top N at his position in at least a few weeks.
// Pure functions (no network) so the rule can be tested; server/routes/players.ts feeds it the league's weeks.

export interface WeekMatchup {
  players: string[] | null;
  players_points: Record<string, number> | null;
}

export interface Candidate {
  /** Weeks he ranked in the top N at his position (among players on a roster that week) */
  topWeeks: number;
  points: number;
  /** Weeks on a roster */
  games: number;
  ppg: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * For every player, how many played weeks he ranked in the top `topN` at his position, plus his points and games.
 * Ties share a rank. Only positions listed in `positions` are ranked.
 */
export function positionTopWeeks(
  weeks: WeekMatchup[][],
  positionOf: (playerId: string) => string | null | undefined,
  positions: string[],
  topN = 12,
): Map<string, Candidate> {
  const out = new Map<string, Candidate>();
  for (const week of weeks) {
    const scores = new Map<string, number>();
    for (const m of week) {
      const pts = m.players_points ?? {};
      for (const id of m.players ?? []) scores.set(String(id), Number(pts[id]) || 0);
    }
    const byPosition = new Map<string, Array<{ id: string; pts: number }>>();
    scores.forEach((pts, id) => {
      const position = positionOf(id);
      if (!position || !positions.includes(position)) return;
      const list = byPosition.get(position) ?? [];
      list.push({ id, pts });
      byPosition.set(position, list);
    });
    byPosition.forEach((list) => {
      list.forEach(({ id, pts }) => {
        const rank = 1 + list.filter((o) => o.pts > pts).length;
        const cur = out.get(id) ?? { topWeeks: 0, points: 0, games: 0, ppg: 0 };
        cur.points += pts;
        cur.games += 1;
        if (rank <= topN) cur.topWeeks += 1;
        out.set(id, cur);
      });
    });
  }
  out.forEach((c) => {
    c.ppg = c.games > 0 ? round1(c.points / c.games) : 0;
    c.points = round1(c.points);
  });
  return out;
}

/** Players with at least `minWeeks` top-N weeks. */
export function mvpCandidates(stats: Map<string, Candidate>, minWeeks = 3): Map<string, Candidate> {
  const result = new Map<string, Candidate>();
  stats.forEach((c, id) => {
    if (c.topWeeks >= minWeeks) result.set(id, c);
  });
  return result;
}
