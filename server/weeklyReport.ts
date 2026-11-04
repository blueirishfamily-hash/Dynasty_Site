import type {
  GameCallout,
  HighPerformerPlayer,
  PreviewGame,
  RecapCallouts,
  RecapGame,
  TeamEfficiency,
  TeamTrend,
  WeeklyHighPerformers,
} from "../shared/weeklyReport";

export interface ReportMatchupEntry {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters: string[] | null;
  starters_points: number[] | null;
  players: string[] | null;
  players_points: Record<string, number> | null;
}

export interface ReportPlayerInfo {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  team?: string | null;
}

export type ReportPlayers = Record<string, ReportPlayerInfo | undefined>;

const FLEX_ELIGIBILITY: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  REC_FLEX: ["WR", "TE"],
  WRRB_FLEX: ["WR", "RB"],
  WRRB: ["WR", "RB"],
  WRRBTE: ["WR", "RB", "TE"],
  IDP_FLEX: ["DL", "LB", "DB"],
};

const NON_STARTING_SLOTS = new Set(["BN", "IR", "TAXI"]);

const eligibleFor = (slot: string, position: string): boolean => {
  const flex = FLEX_ELIGIBILITY[slot];
  return flex ? flex.includes(position) : position === slot;
};

/** Best possible lineup total for the week given the league's starting slots. */
export function computeOptimalPoints(
  rosterPositions: string[],
  playerIds: string[],
  playerPoints: Record<string, number>,
  players: ReportPlayers,
): number {
  const slots = rosterPositions
    .filter((slot) => !NON_STARTING_SLOTS.has(slot))
    .sort((a, b) => (FLEX_ELIGIBILITY[a]?.length ?? 1) - (FLEX_ELIGIBILITY[b]?.length ?? 1));

  const used = new Set<string>();
  let total = 0;
  for (const slot of slots) {
    let best: { pid: string; points: number } | null = null;
    for (const pid of playerIds) {
      if (used.has(pid)) continue;
      const position = players[pid]?.position ?? "";
      if (!eligibleFor(slot, position)) continue;
      const points = playerPoints[pid] ?? 0;
      if (!best || points > best.points) best = { pid, points };
    }
    if (best) {
      used.add(best.pid);
      total += best.points;
    }
  }
  return Math.round(total * 100) / 100;
}

export interface PairedGame {
  matchupId: number;
  a: ReportMatchupEntry;
  b: ReportMatchupEntry;
}

export function pairMatchups(entries: ReportMatchupEntry[]): PairedGame[] {
  const groups = new Map<number, ReportMatchupEntry[]>();
  for (const entry of entries) {
    if (entry.matchup_id == null) continue;
    const group = groups.get(entry.matchup_id) ?? [];
    group.push(entry);
    groups.set(entry.matchup_id, group);
  }
  const games: PairedGame[] = [];
  groups.forEach((group, matchupId) => {
    if (group.length === 2) games.push({ matchupId, a: group[0], b: group[1] });
  });
  return games.sort((x, y) => x.matchupId - y.matchupId);
}

const playerName = (pid: string, info: ReportPlayerInfo | undefined): string => {
  if (!info) return pid;
  const name = info.full_name || [info.first_name, info.last_name].filter(Boolean).join(" ");
  return name || pid;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildRecap(
  entries: ReportMatchupEntry[],
  rosterPositions: string[],
  players: ReportPlayers,
): { games: RecapGame[]; callouts: RecapCallouts } | null {
  const paired = pairMatchups(entries).filter((g) => (g.a.points || 0) > 0 || (g.b.points || 0) > 0);
  if (paired.length === 0) return null;

  const optimalOf = (entry: ReportMatchupEntry): number | null => {
    if (!entry.players || !entry.players_points) return null;
    return computeOptimalPoints(rosterPositions, entry.players, entry.players_points, players);
  };

  const games: RecapGame[] = paired.map(({ matchupId, a, b }) => {
    const s1 = a.points || 0;
    const s2 = b.points || 0;
    return {
      matchupId,
      team1: a.roster_id,
      team2: b.roster_id,
      score1: s1,
      score2: s2,
      winner: s1 === s2 ? null : s1 > s2 ? a.roster_id : b.roster_id,
      margin: Math.abs(s1 - s2),
      optimal1: optimalOf(a),
      optimal2: optimalOf(b),
    };
  });

  const sides = games.flatMap((g): GameCallout[] => [
    { matchupId: g.matchupId, rosterId: g.team1, opponentId: g.team2, points: g.score1, opponentPoints: g.score2 },
    { matchupId: g.matchupId, rosterId: g.team2, opponentId: g.team1, points: g.score2, opponentPoints: g.score1 },
  ]);
  const pick = (list: GameCallout[], better: (a: GameCallout, b: GameCallout) => boolean): GameCallout | null =>
    list.reduce<GameCallout | null>((best, cur) => (best == null || better(cur, best) ? cur : best), null);

  const winners = sides.filter((s) => s.points > s.opponentPoints);
  const losers = sides.filter((s) => s.points < s.opponentPoints);
  const margin = (s: GameCallout) => Math.abs(s.points - s.opponentPoints);

  const callouts: RecapCallouts = {
    highestScore: pick(sides, (a, b) => a.points > b.points),
    lowestScore: pick(sides, (a, b) => a.points < b.points),
    closestGame: pick(winners, (a, b) => margin(a) < margin(b)),
    biggestBlowout: pick(winners, (a, b) => margin(a) > margin(b)),
    unluckiestLoss: pick(losers, (a, b) => a.points > b.points),
    luckiestWin: pick(winners, (a, b) => a.points < b.points),
  };

  return { games, callouts };
}

export function buildTrends(weeklyPoints: Map<number, number[]>): { hot: TeamTrend[]; cold: TeamTrend[] } {
  const trends: TeamTrend[] = [];
  weeklyPoints.forEach((points, rosterId) => {
    if (points.length < 3) return;
    const recentWeeks = Math.min(4, Math.floor(points.length / 2));
    const recent = points.slice(-recentWeeks);
    const earlier = points.slice(0, -recentWeeks);
    if (earlier.length === 0) return;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    trends.push({
      rosterId,
      recentAvg: round1(avg(recent)),
      earlierAvg: round1(avg(earlier)),
      difference: round1(avg(recent) - avg(earlier)),
      recentWeeks,
    });
  });
  trends.sort((a, b) => b.difference - a.difference);
  return {
    hot: trends.filter((t) => t.difference > 0).slice(0, 3),
    cold: trends
      .filter((t) => t.difference < 0)
      .slice(-3)
      .reverse(),
  };
}

export function buildHighPerformers(
  entries: ReportMatchupEntry[],
  recap: { games: RecapGame[] },
  rosterPositions: string[],
  players: ReportPlayers,
  trends: { hot: TeamTrend[]; cold: TeamTrend[] },
): WeeklyHighPerformers {
  const starters: HighPerformerPlayer[] = [];
  for (const entry of entries) {
    const ids = entry.starters ?? [];
    const pts = entry.starters_points ?? [];
    ids.forEach((pid, i) => {
      if (!pid || pid === "0") return;
      const info = players[pid];
      starters.push({
        playerId: pid,
        name: playerName(pid, info),
        position: info?.position ?? "?",
        nflTeam: info?.team ?? null,
        rosterId: entry.roster_id,
        points: round1(pts[i] ?? 0),
      });
    });
  }
  starters.sort((a, b) => b.points - a.points);

  const positionOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const positionLeaders: HighPerformerPlayer[] = [];
  for (const position of positionOrder) {
    if (!rosterPositions.some((slot) => slot === position || FLEX_ELIGIBILITY[slot]?.includes(position))) continue;
    const leader = starters.find((p) => p.position === position);
    if (leader) positionLeaders.push(leader);
  }

  const teamScores = recap.games
    .flatMap((g) => [
      { rosterId: g.team1, points: g.score1 },
      { rosterId: g.team2, points: g.score2 },
    ])
    .sort((a, b) => b.points - a.points);

  const efficiency: TeamEfficiency[] = recap.games
    .flatMap((g) => [
      { rosterId: g.team1, points: g.score1, optimal: g.optimal1 },
      { rosterId: g.team2, points: g.score2, optimal: g.optimal2 },
    ])
    .filter((t): t is { rosterId: number; points: number; optimal: number } => t.optimal != null && t.optimal > 0)
    .map((t) => ({
      rosterId: t.rosterId,
      points: t.points,
      optimalPoints: t.optimal,
      efficiency: Math.min(1, t.points / t.optimal),
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  return {
    topPlayers: starters.slice(0, 10),
    positionLeaders,
    topTeamScores: teamScores.slice(0, 5),
    efficiency,
    hot: trends.hot,
    cold: trends.cold,
  };
}

export function buildPreview(entries: ReportMatchupEntry[]): { games: PreviewGame[]; hasScores: boolean } {
  const paired = pairMatchups(entries);
  const hasScores = paired.some((g) => (g.a.points || 0) > 0 || (g.b.points || 0) > 0);
  return {
    hasScores,
    games: paired.map(({ matchupId, a, b }) => ({
      matchupId,
      team1: a.roster_id,
      team2: b.roster_id,
      score1: hasScores ? a.points || 0 : null,
      score2: hasScores ? b.points || 0 : null,
    })),
  };
}

/** Std dev of a single team-week score around that team's own mean. */
export function computeScoreStdDev(weeklyPoints: Map<number, number[]>): number {
  const deviations: number[] = [];
  weeklyPoints.forEach((points) => {
    if (points.length < 2) return;
    const mean = points.reduce((a, b) => a + b, 0) / points.length;
    points.forEach((p) => deviations.push((p - mean) ** 2));
  });
  if (deviations.length === 0) return 25;
  const variance = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  return Math.max(10, Math.sqrt(variance));
}
