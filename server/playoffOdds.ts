import { computePlayoffSeeding } from "../shared/playoffSeeding";
import { computeOutcomeBounds } from "../shared/clinchScenarios";
import { computeScoreStdDev } from "./weeklyReport";

export interface OddsTeam {
  rosterId: number;
  wins: number;
  ties: number;
  pointsFor: number;
  division: number | null;
}

export interface OddsInput {
  teams: OddsTeam[];
  /** Weekly scores through the as-of week, per roster. */
  weeklyScores: Map<number, number[]>;
  /** One entry per unplayed regular-season week, each a list of [rosterId, rosterId] games. */
  remainingWeeks: Array<Array<[number, number]>>;
  /** Games every team has already played. */
  gamesPlayed: number;
  playoffTeams: number;
  divisionCount: number;
  simulations?: number;
  seed?: number;
}

export interface TeamOdds {
  rosterId: number;
  makePlayoffsPct: number;
  divisionWinnerPct?: number;
  oneSeedPct: number;
  projectedPointsPerWeek: number;
  projectedWins: number;
}

export interface OddsResult {
  predictions: TeamOdds[];
  simulationCount: number;
}

const SHRINK_GAMES = 3;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Exact 0 / 100 only when the result never / always happened; otherwise keep a little room.
const smoothed = (successes: number, trials: number) => round2(((successes + 1) / (trials + 2)) * 100);
const raw = (successes: number, trials: number) => {
  if (successes <= 0) return 0;
  if (successes >= trials) return 100;
  return Math.min(99.99, Math.max(0.01, round2((successes / trials) * 100)));
};

/**
 * Season simulation for a past point in time. Scores are drawn from each team's own scoring
 * history up to that point (shrunk toward the league average early on), and the real remaining
 * schedule is played out. Seeded, so the same inputs always give the same odds.
 */
export function simulatePlayoffOdds(input: OddsInput): OddsResult {
  const { teams, weeklyScores, remainingWeeks, playoffTeams, divisionCount } = input;
  const sims = input.simulations ?? 10000;
  const rng = mulberry32(input.seed ?? 1);
  const gauss = () => {
    const u1 = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
  };

  const allScores = Array.from(weeklyScores.values()).flat();
  const leagueMean = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 100;
  const sigma = computeScoreStdDev(weeklyScores);

  const index = new Map<number, number>();
  teams.forEach((t, i) => index.set(t.rosterId, i));
  const mean = teams.map((t) => {
    const scores = weeklyScores.get(t.rosterId) ?? [];
    const sum = scores.reduce((a, b) => a + b, 0);
    return (sum + SHRINK_GAMES * leagueMean) / (scores.length + SHRINK_GAMES);
  });
  const meanSpread = teams.map((t) => sigma / Math.sqrt((weeklyScores.get(t.rosterId)?.length ?? 0) + SHRINK_GAMES));

  const remaining = remainingWeeks.length;
  const totalGames = input.gamesPlayed + remaining;
  const makePlayoffs = new Int32Array(teams.length);
  const divisionWins = new Int32Array(teams.length);
  const oneSeeds = new Int32Array(teams.length);
  const sumWins = new Float64Array(teams.length);

  const strength = new Float64Array(teams.length);
  const wins = new Float64Array(teams.length);
  const pointsFor = new Float64Array(teams.length);

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < teams.length; i++) {
      strength[i] = mean[i] + gauss() * meanSpread[i];
      wins[i] = teams[i].wins;
      pointsFor[i] = teams[i].pointsFor;
    }
    for (const week of remainingWeeks) {
      for (const [a, b] of week) {
        const ia = index.get(a);
        const ib = index.get(b);
        if (ia === undefined || ib === undefined) continue;
        const sa = Math.max(0, strength[ia] + gauss() * sigma);
        const sb = Math.max(0, strength[ib] + gauss() * sigma);
        pointsFor[ia] += sa;
        pointsFor[ib] += sb;
        if (sa > sb) wins[ia]++;
        else wins[ib]++;
      }
    }

    const seeding = computePlayoffSeeding(
      teams.map((t, i) => ({
        rosterId: t.rosterId,
        wins: wins[i],
        losses: Math.max(0, totalGames - wins[i] - t.ties),
        ties: t.ties,
        pointsFor: pointsFor[i],
        division: t.division,
      })),
      divisionCount,
    );
    seeding.seeds.forEach((seed) => {
      const i = index.get(seed.rosterId) as number;
      if (seed.seed <= playoffTeams) makePlayoffs[i]++;
      if (seed.seed === 1) oneSeeds[i]++;
      if (seed.isDivisionWinner) divisionWins[i]++;
    });
    for (let i = 0; i < teams.length; i++) sumWins[i] += wins[i];
  }

  const bounds = new Map(
    remaining > 0
      ? computeOutcomeBounds(
          teams.map((t) => ({ rosterId: t.rosterId, wins: t.wins, ties: t.ties, division: t.division })),
          playoffTeams,
          seedingHasDivisions(teams, divisionCount),
          remaining,
        ).map((b) => [b.rosterId, b] as const)
      : [],
  );
  const hasDivisions = seedingHasDivisions(teams, divisionCount);

  const predictions: TeamOdds[] = teams.map((t, i) => {
    const pct = remaining > 0 ? smoothed : raw;
    let makePlayoffsPct = pct(makePlayoffs[i], sims);
    let oneSeedPct = pct(oneSeeds[i], sims);
    let divisionWinnerPct = hasDivisions ? pct(divisionWins[i], sims) : undefined;
    const b = bounds.get(t.rosterId);
    if (b) {
      if (!b.canMakePlayoffs) makePlayoffsPct = 0;
      else if (b.lockedPlayoffs) makePlayoffsPct = 100;
      if (!b.canGetOneSeed) oneSeedPct = 0;
      else if (b.lockedOneSeed) oneSeedPct = 100;
      if (hasDivisions) {
        if (!b.canWinDivision) divisionWinnerPct = 0;
        else if (b.lockedDivision) divisionWinnerPct = 100;
      }
    }
    return {
      rosterId: t.rosterId,
      makePlayoffsPct,
      divisionWinnerPct,
      oneSeedPct,
      projectedPointsPerWeek: Math.round(mean[i] * 10) / 10,
      projectedWins: Math.round((sumWins[i] / sims) * 10) / 10,
    };
  });

  return { predictions, simulationCount: sims };
}

function seedingHasDivisions(teams: OddsTeam[], divisionCount: number): boolean {
  return divisionCount > 0 && teams.length > 0 && teams.every((t) => t.division != null && t.division > 0);
}
