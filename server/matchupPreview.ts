import {
  RADAR_CATEGORIES,
  type HeadToHeadMeeting,
  type HeadToHeadSummary,
  type RadarCategory,
  type RadarTeamStats,
  type WeekResult,
} from "../shared/matchupPreview";

export interface PreviewMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters?: string[] | null;
}

export interface PreviewWeek {
  week: number;
  matchups: PreviewMatchupEntry[];
}

export type WeeklyPlayerStats = Record<string, Record<string, number>>;

const emptyTotals = (): Record<RadarCategory, number> => ({
  passYards: 0,
  passTds: 0,
  rushYards: 0,
  rushTds: 0,
  receptions: 0,
});

/** Last regular-season week whose scores are final. The in-progress week is excluded. */
export function lastCompletedRegularSeasonWeek(opts: {
  playoffWeekStart: number;
  currentWeek: number;
  seasonComplete: boolean;
}): number {
  const regularSeasonWeeks = opts.playoffWeekStart - 1;
  if (opts.seasonComplete || opts.currentWeek >= opts.playoffWeekStart) return regularSeasonWeeks;
  return Math.max(0, Math.min(opts.currentWeek - 1, regularSeasonWeeks));
}

/** Pairs each roster with its opponent for a week, ignoring unplayed (0-0) games. */
function pairWeek(matchups: PreviewMatchupEntry[]): Map<number, { self: PreviewMatchupEntry; opponent: PreviewMatchupEntry }> {
  const groups = new Map<number, PreviewMatchupEntry[]>();
  for (const m of matchups) {
    if (m.matchup_id == null) continue;
    const group = groups.get(m.matchup_id) ?? [];
    group.push(m);
    groups.set(m.matchup_id, group);
  }

  const result = new Map<number, { self: PreviewMatchupEntry; opponent: PreviewMatchupEntry }>();
  groups.forEach((group) => {
    if (group.length !== 2) return;
    const [a, b] = group;
    if ((a.points || 0) === 0 && (b.points || 0) === 0) return;
    result.set(a.roster_id, { self: a, opponent: b });
    result.set(b.roster_id, { self: b, opponent: a });
  });
  return result;
}

export function computeForm(weekly: PreviewWeek[], rosterId: number): WeekResult[] {
  const results: WeekResult[] = [];
  for (const { week, matchups } of [...weekly].sort((a, b) => a.week - b.week)) {
    const pair = pairWeek(matchups).get(rosterId);
    if (!pair) continue;
    const points = pair.self.points || 0;
    const opponentPoints = pair.opponent.points || 0;
    results.push({
      week,
      points,
      opponentPoints,
      margin: Math.round((points - opponentPoints) * 100) / 100,
      result: points > opponentPoints ? "W" : points < opponentPoints ? "L" : "T",
    });
  }
  return results;
}

/** Sums the radar stats produced by each roster's started players across the given weeks. */
export function computeRadarTotals(
  weekly: PreviewWeek[],
  statsByWeek: Map<number, WeeklyPlayerStats>,
  rosterIds: number[],
): Map<number, Record<RadarCategory, number>> {
  const totals = new Map<number, Record<RadarCategory, number>>();
  rosterIds.forEach((id) => totals.set(id, emptyTotals()));

  for (const { week, matchups } of weekly) {
    const stats = statsByWeek.get(week);
    if (!stats) continue;
    const played = pairWeek(matchups);

    for (const rosterId of rosterIds) {
      const entry = played.get(rosterId)?.self;
      if (!entry?.starters) continue;
      const target = totals.get(rosterId)!;
      for (const playerId of entry.starters) {
        const line = stats[playerId];
        if (!line) continue;
        for (const category of RADAR_CATEGORIES) {
          target[category.key] += line[category.statKey] || 0;
        }
      }
    }
  }

  return totals;
}

export function buildRadarStats(
  totalsByRoster: Map<number, Record<RadarCategory, number>>,
  rosterId: number,
): RadarTeamStats {
  const totals = totalsByRoster.get(rosterId) ?? emptyTotals();
  const leagueRank = emptyTotals();
  const pctOfLeagueBest = emptyTotals();

  for (const { key } of RADAR_CATEGORIES) {
    const all = Array.from(totalsByRoster.values()).map((t) => t[key]);
    const best = Math.max(...all, 0);
    leagueRank[key] = 1 + all.filter((value) => value > totals[key]).length;
    pctOfLeagueBest[key] = best > 0 ? Math.round((totals[key] / best) * 1000) / 10 : 0;
  }

  return {
    rosterId,
    totals: Object.fromEntries(
      RADAR_CATEGORIES.map(({ key }) => [key, Math.round(totals[key] * 10) / 10]),
    ) as Record<RadarCategory, number>,
    leagueRank,
    pctOfLeagueBest,
  };
}

export interface SeasonMatchups {
  season: string;
  rosterIdA: number;
  rosterIdB: number;
  weekly: PreviewWeek[];
}

export function computeHeadToHead(seasons: SeasonMatchups[]): HeadToHeadMeeting[] {
  const meetings: HeadToHeadMeeting[] = [];

  for (const { season, rosterIdA, rosterIdB, weekly } of seasons) {
    for (const { week, matchups } of weekly) {
      const pair = pairWeek(matchups).get(rosterIdA);
      if (!pair || pair.opponent.roster_id !== rosterIdB) continue;
      const teamAPoints = pair.self.points || 0;
      const teamBPoints = pair.opponent.points || 0;
      meetings.push({
        season,
        week,
        teamAPoints,
        teamBPoints,
        winner: teamAPoints > teamBPoints ? "A" : teamAPoints < teamBPoints ? "B" : "T",
        margin: Math.round(Math.abs(teamAPoints - teamBPoints) * 100) / 100,
      });
    }
  }

  return meetings.sort((a, b) => (a.season === b.season ? a.week - b.week : Number(a.season) - Number(b.season)));
}

export function summarizeHeadToHead(meetings: HeadToHeadMeeting[]): HeadToHeadSummary {
  const games = meetings.length;
  const teamAWins = meetings.filter((m) => m.winner === "A").length;
  const teamBWins = meetings.filter((m) => m.winner === "B").length;
  const ties = games - teamAWins - teamBWins;
  const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

  const biggest = (winner: "A" | "B") =>
    meetings
      .filter((m) => m.winner === winner)
      .reduce<HeadToHeadMeeting | null>((best, m) => (best === null || m.margin > best.margin ? m : best), null);

  let streak: HeadToHeadSummary["streak"] = null;
  for (let i = meetings.length - 1; i >= 0; i--) {
    const winner = meetings[i].winner;
    if (winner === "T") break;
    if (streak === null) streak = { winner, count: 1 };
    else if (streak.winner === winner) streak.count++;
    else break;
  }

  return {
    games,
    teamAWins,
    teamBWins,
    ties,
    teamAAvgScore: avg(meetings.map((m) => m.teamAPoints)),
    teamBAvgScore: avg(meetings.map((m) => m.teamBPoints)),
    avgMarginForA: avg(meetings.map((m) => m.teamAPoints - m.teamBPoints)),
    teamABiggestWin: biggest("A"),
    teamBBiggestWin: biggest("B"),
    streak,
  };
}
