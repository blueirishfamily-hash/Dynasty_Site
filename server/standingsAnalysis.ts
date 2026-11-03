import type {
  AnalysisTeam,
  LuckSummary,
  ScheduleDifficulty,
  ScheduleSimRow,
  ScheduleSimSummary,
  SimRecord,
  StandingsAnalysis,
  SwapSummary,
} from "../shared/standingsAnalysis";

export interface WeeklyMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  points: number;
}

export interface WeeklyMatchups {
  week: number;
  matchups: WeeklyMatchupEntry[];
}

interface WeekGames {
  score: Map<number, number>;
  opponent: Map<number, number>;
}

const winsOf = (r: SimRecord) => r.wins + r.ties * 0.5;

/**
 * Pairs up each week's matchups. Weeks (or pairings) where both sides scored zero are
 * treated as unplayed, matching how the standings route detects unplayed games.
 */
function buildWeekGames(weekly: WeeklyMatchups[]): Map<number, WeekGames> {
  const result = new Map<number, WeekGames>();

  for (const { week, matchups } of weekly) {
    const groups = new Map<number, WeeklyMatchupEntry[]>();
    for (const m of matchups) {
      if (m.matchup_id == null) continue;
      const group = groups.get(m.matchup_id) ?? [];
      group.push(m);
      groups.set(m.matchup_id, group);
    }

    const games: WeekGames = { score: new Map(), opponent: new Map() };
    groups.forEach((group) => {
      if (group.length !== 2) return;
      const [a, b] = group;
      const pointsA = a.points || 0;
      const pointsB = b.points || 0;
      if (pointsA === 0 && pointsB === 0) return;
      games.score.set(a.roster_id, pointsA);
      games.score.set(b.roster_id, pointsB);
      games.opponent.set(a.roster_id, b.roster_id);
      games.opponent.set(b.roster_id, a.roster_id);
    });

    if (games.score.size > 0) result.set(week, games);
  }

  return result;
}

/**
 * Plays `rosterId`'s weekly scores against the opponents faced by `scheduleId`.
 * When the schedule's opponent in a week is the team itself, the team instead faces the
 * schedule's owner (using the owner's own score that week).
 */
function simulate(
  rosterId: number,
  scheduleId: number,
  weeks: number[],
  games: Map<number, WeekGames>,
): SimRecord {
  const record: SimRecord = { wins: 0, losses: 0, ties: 0 };

  for (const week of weeks) {
    const g = games.get(week);
    if (!g) continue;
    const myScore = g.score.get(rosterId);
    const scheduleOpponent = g.opponent.get(scheduleId);
    if (myScore === undefined || scheduleOpponent === undefined) continue;

    const opponentRoster = scheduleOpponent === rosterId ? scheduleId : scheduleOpponent;
    const opponentScore = g.score.get(opponentRoster);
    if (opponentScore === undefined) continue;

    if (myScore > opponentScore) record.wins++;
    else if (myScore < opponentScore) record.losses++;
    else record.ties++;
  }

  return record;
}

function pickExtreme<T>(items: T[], score: (item: T) => number, mode: "max" | "min", tiebreak?: (item: T) => number): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (best === null) {
      best = item;
      continue;
    }
    const diff = score(item) - score(best);
    const better = mode === "max" ? diff > 1e-9 : diff < -1e-9;
    const tied = Math.abs(diff) <= 1e-9;
    if (better || (tied && tiebreak && tiebreak(item) > tiebreak(best))) best = item;
  }
  return best;
}

export function computeStandingsAnalysis(teams: AnalysisTeam[], weekly: WeeklyMatchups[]): StandingsAnalysis {
  const games = buildWeekGames(weekly);
  const weeks = Array.from(games.keys()).sort((a, b) => a - b);

  const weeklyPoints: Record<number, Array<number | null>> = {};
  const cumulative: Record<number, number[]> = {};
  for (const team of teams) {
    let running = 0;
    weeklyPoints[team.rosterId] = [];
    cumulative[team.rosterId] = [];
    for (const week of weeks) {
      const score = games.get(week)?.score.get(team.rosterId);
      weeklyPoints[team.rosterId].push(score ?? null);
      running += score ?? 0;
      cumulative[team.rosterId].push(Math.round(running * 100) / 100);
    }
  }

  const matrix = new Map<number, Map<number, SimRecord>>();
  for (const team of teams) {
    const row = new Map<number, SimRecord>();
    for (const schedule of teams) {
      row.set(schedule.rosterId, simulate(team.rosterId, schedule.rosterId, weeks, games));
    }
    matrix.set(team.rosterId, row);
  }

  const pointsFor = (rosterId: number) => cumulative[rosterId]?.[weeks.length - 1] ?? 0;

  const rows: ScheduleSimRow[] = teams.map((team) => {
    const row = matrix.get(team.rosterId)!;
    const actual = row.get(team.rosterId)!;
    const others = teams.filter((t) => t.rosterId !== team.rosterId);
    const expectedWins = others.length
      ? others.reduce((sum, t) => sum + winsOf(row.get(t.rosterId)!), 0) / others.length
      : winsOf(actual);
    return {
      rosterId: team.rosterId,
      actual,
      results: teams.map((t) => row.get(t.rosterId)!),
      expectedWins,
      luck: winsOf(actual) - expectedWins,
      pointsFor: pointsFor(team.rosterId),
    };
  });

  const difficulty: ScheduleDifficulty[] = teams.map((schedule) => {
    const others = teams.filter((t) => t.rosterId !== schedule.rosterId);
    const avgWinsAllowed = others.length
      ? others.reduce((sum, t) => sum + winsOf(matrix.get(t.rosterId)!.get(schedule.rosterId)!), 0) / others.length
      : 0;

    let opponentTotal = 0;
    let opponentGames = 0;
    for (const week of weeks) {
      const g = games.get(week);
      const opponent = g?.opponent.get(schedule.rosterId);
      const opponentScore = opponent !== undefined ? g?.score.get(opponent) : undefined;
      if (opponentScore !== undefined) {
        opponentTotal += opponentScore;
        opponentGames++;
      }
    }

    return {
      rosterId: schedule.rosterId,
      avgWinsAllowed,
      avgOpponentPoints: opponentGames ? opponentTotal / opponentGames : 0,
    };
  });

  const swaps: SwapSummary[] = [];
  for (const row of rows) {
    const actualWins = winsOf(row.actual);
    teams.forEach((schedule, idx) => {
      if (schedule.rosterId === row.rosterId) return;
      const simulated = row.results[idx];
      swaps.push({
        rosterId: row.rosterId,
        scheduleRosterId: schedule.rosterId,
        actualWins,
        simulatedWins: winsOf(simulated),
        delta: winsOf(simulated) - actualWins,
        actual: row.actual,
        simulated,
      });
    });
  }

  const luckEntries: LuckSummary[] = rows.map((row) => ({
    rosterId: row.rosterId,
    actualWins: winsOf(row.actual),
    expectedWins: row.expectedWins,
    luck: row.luck,
  }));

  const oppPoints = new Map(difficulty.map((d) => [d.rosterId, d.avgOpponentPoints]));
  const pf = (id: number) => pointsFor(id);

  const summary: ScheduleSimSummary = {
    toughestSchedule: pickExtreme(difficulty, (d) => d.avgWinsAllowed, "min", (d) => oppPoints.get(d.rosterId) ?? 0),
    easiestSchedule: pickExtreme(difficulty, (d) => d.avgWinsAllowed, "max", (d) => -(oppPoints.get(d.rosterId) ?? 0)),
    biggestUpgrade: pickExtreme(swaps, (s) => s.delta, "max", (s) => -pf(s.rosterId)),
    biggestDowngrade: pickExtreme(swaps, (s) => s.delta, "min", (s) => pf(s.rosterId)),
    unluckiest: pickExtreme(luckEntries, (l) => l.luck, "min", (l) => pf(l.rosterId)),
    luckiest: pickExtreme(luckEntries, (l) => l.luck, "max", (l) => -pf(l.rosterId)),
  };

  const rowOrder = [...rows].sort((a, b) => {
    const diff = winsOf(b.actual) - winsOf(a.actual);
    return diff !== 0 ? diff : b.pointsFor - a.pointsFor;
  });
  const teamOrder = rowOrder.map((r) => r.rosterId);
  const orderedTeams = teamOrder.map((id) => teams.find((t) => t.rosterId === id)!);
  const teamIndex = new Map(teams.map((t, i) => [t.rosterId, i]));

  return {
    teams: orderedTeams,
    weeks,
    cumulative,
    weeklyPoints,
    simulation: {
      rows: rowOrder.map((row) => ({
        ...row,
        results: teamOrder.map((id) => row.results[teamIndex.get(id)!]),
      })),
      difficulty: teamOrder.map((id) => difficulty.find((d) => d.rosterId === id)!),
    },
    summary,
  };
}
