/**
 * Weekly league report: builds the data behind the commissioner PDF export.
 *
 * Week N is the report week (the matchups being previewed). Results are for week N-1.
 *
 * Projections follow the app's existing model (see matchup-detail in routes.ts):
 *   - each player's projection is the mean of his recent weekly points, blended toward a
 *     position baseline when he has fewer than 3 games;
 *   - players who are out, on IR/PUP, or on a bye for the report week project to 0;
 *   - a team's projection is its optimal lineup (best eligible player per slot).
 * Win odds use a normal approximation of the score difference, with each team's variance
 * taken from the variances of its optimal lineup. Players are treated as independent.
 */
import type { SleeperMatchup } from "./sleeper";
import type { ReportData, TeamRef, WeekGame, Award, PreviewMatchup } from "../shared/weeklyReport";

const POSITION_BASELINES: Record<string, { mean: number; stdDev: number }> = {
  QB: { mean: 18, stdDev: 6 },
  RB: { mean: 12, stdDev: 6 },
  WR: { mean: 11, stdDev: 6 },
  TE: { mean: 8, stdDev: 5 },
  K: { mean: 8, stdDev: 3 },
  DEF: { mean: 7, stdDev: 4 },
};

/** 2025 NFL bye weeks, the same table the matchup-detail endpoint uses. Update each season. */
export const BYE_WEEKS: Record<number, string[]> = {
  5: ["ATL", "CHI", "GB", "PIT"],
  6: ["HOU", "MIN"],
  7: ["BAL", "BUF"],
  8: ["ARI", "DET", "JAX", "LV", "LAR", "SEA"],
  9: ["CLE", "NYJ", "PHI", "TB"],
  10: ["CIN", "DAL", "KC", "TEN"],
  11: ["IND", "NO"],
  12: ["DEN", "LAC", "MIA", "WAS"],
  14: ["CAR", "NE", "NYG", "SF"],
};

const INACTIVE_STATUSES = ["Out", "IR", "PUP", "Sus", "NFI", "COV", "Injured Reserve"];
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];
const HISTORY_WEEKS = 8;

// ─── Input / output types ─────────────────────────────────────────────────────

export interface ReportPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  injuryStatus: string | null;
}

export interface ReportTeam {
  rosterId: number;
  name: string;
  initials: string;
  avatar: string | null;
  /** All players on the roster (starters and bench). */
  playerIds: string[];
}

export interface ReportInput {
  week: number;
  season: string;
  leagueName: string;
  /** Roster slots from the league settings, e.g. ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN"]. */
  rosterPositions: string[];
  teams: ReportTeam[];
  /** Matchups keyed by week number, for every week from 1 to `week`. */
  matchupsByWeek: Record<number, SleeperMatchup[]>;
  players: Record<string, ReportPlayer>;
  /** NFL teams on bye during the report week. */
  byeTeams: string[];
}

// ─── Model helpers ────────────────────────────────────────────────────────────

function slotEligible(position: string, slot: string): boolean {
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  if (slot === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
  if (slot === "WRRB") return ["WR", "RB"].includes(position);
  if (slot === "WRRBTE") return ["WR", "RB", "TE"].includes(position);
  return position === slot;
}

/** Fill fixed positions before flex slots, as the app's optimal-lineup code does. */
function orderSlots(rosterPositions: string[]): string[] {
  const starting = rosterPositions.filter(p => !["BN", "IR", "TAXI"].includes(p));
  const flexes = ["SUPER_FLEX", "WRRBTE", "WRRB", "FLEX"];
  const fixed = starting.filter(s => POSITION_ORDER.includes(s));
  const flex = starting.filter(s => !POSITION_ORDER.includes(s) && flexes.includes(s));
  return [...fixed, ...flex];
}

function calcStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length === 1) return { mean, stdDev: mean * 0.3 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

/** Mirrors the app's projection: recent history, blended toward the position baseline. */
export function projectPlayer(
  history: number[],
  position: string,
  willNotPlay: boolean,
): { mean: number; stdDev: number } {
  if (willNotPlay) return { mean: 0, stdDev: 0 };
  const base = POSITION_BASELINES[position] || { mean: 10, stdDev: 5 };
  const n = history.length;
  if (n >= 3) return calcStats(history);
  if (n > 0) {
    const own = calcStats(history);
    const w = n / 3;
    return {
      mean: own.mean * w + base.mean * (1 - w),
      stdDev: own.stdDev * w + base.stdDev * (1 - w),
    };
  }
  return { mean: base.mean, stdDev: base.stdDev };
}

interface Candidate {
  id: string;
  position: string;
  points: number;
  variance: number;
}

/** Greedy optimal lineup: best eligible player for each slot in order. */
export function optimalLineup(
  candidates: Candidate[],
  rosterPositions: string[],
): { total: number; variance: number; ids: string[] } {
  const used = new Set<string>();
  let total = 0;
  let variance = 0;
  const ids: string[] = [];
  for (const slot of orderSlots(rosterPositions)) {
    const best = candidates
      .filter(c => !used.has(c.id) && slotEligible(c.position, slot))
      .sort((a, b) => b.points - a.points)[0];
    if (best) {
      used.add(best.id);
      total += best.points;
      variance += best.variance;
      ids.push(best.id);
    }
  }
  return { total, variance, ids };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    (((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592;
  const erf = 1 - poly * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function winProbability(meanA: number, varA: number, meanB: number, varB: number): number {
  const sd = Math.sqrt(varA + varB);
  if (sd < 1e-9) return meanA > meanB ? 1 : meanA < meanB ? 0 : 0.5;
  return normalCdf((meanA - meanB) / sd);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Report builder ───────────────────────────────────────────────────────────

interface Pair {
  a: { rosterId: number; points: number };
  b: { rosterId: number; points: number };
}

/** Pair matchup entries by matchup_id. */
function pairsForWeek(matchups: SleeperMatchup[]): Pair[] {
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const list = byId.get(m.matchup_id) || [];
    list.push(m);
    byId.set(m.matchup_id, list);
  }
  const pairs: Pair[] = [];
  for (const list of byId.values()) {
    if (list.length !== 2) continue;
    const [x, y] = list;
    pairs.push({
      a: { rosterId: x.roster_id, points: x.points || 0 },
      b: { rosterId: y.roster_id, points: y.points || 0 },
    });
  }
  return pairs;
}

export function buildWeeklyReport(input: ReportInput): ReportData {
  const { week, season, leagueName, rosterPositions, teams, matchupsByWeek, players, byeTeams } = input;
  const resultsWeek = week - 1;
  const teamByRoster = new Map(teams.map(t => [t.rosterId, t]));
  const ref = (rosterId: number): TeamRef => {
    const t = teamByRoster.get(rosterId);
    return {
      rosterId,
      name: t?.name ?? `Team ${rosterId}`,
      initials: t?.initials ?? "?",
      avatar: t?.avatar ?? null,
    };
  };

  // Season scoring history for each team, weeks 1..resultsWeek.
  const scores = new Map<number, Map<number, number>>(); // rosterId -> week -> points
  const record = new Map<number, { w: number; l: number; t: number; pf: number }>();
  for (const t of teams) {
    scores.set(t.rosterId, new Map());
    record.set(t.rosterId, { w: 0, l: 0, t: 0, pf: 0 });
  }
  for (let w = 1; w <= resultsWeek; w++) {
    for (const p of pairsForWeek(matchupsByWeek[w] || [])) {
      for (const [me, opp] of [[p.a, p.b], [p.b, p.a]] as const) {
        scores.get(me.rosterId)?.set(w, me.points);
        const r = record.get(me.rosterId);
        if (!r) continue;
        r.pf += me.points;
        if (me.points > opp.points) r.w++;
        else if (me.points < opp.points) r.l++;
        else r.t++;
      }
    }
  }

  // Power rank = rank by season points for, as the app's report shows.
  const byPf = [...teams].sort((x, y) => (record.get(y.rosterId)?.pf ?? 0) - (record.get(x.rosterId)?.pf ?? 0));
  const power = new Map(byPf.map((t, i) => [t.rosterId, i + 1]));

  // ─── Last week (results for resultsWeek) ────────────────────────────────────
  const lastPairs = pairsForWeek(matchupsByWeek[resultsWeek] || []);
  const lastMatchups = matchupsByWeek[resultsWeek] || [];

  const games: WeekGame[] = lastPairs.map(p => {
    const aWins = p.a.points > p.b.points;
    const tie = p.a.points === p.b.points;
    const winner = aWins || tie ? p.a : p.b;
    const loser = aWins || tie ? p.b : p.a;
    return {
      winner: { ...ref(winner.rosterId), points: winner.points },
      loser: { ...ref(loser.rosterId), points: loser.points },
      tie,
      margin: round2(Math.abs(p.a.points - p.b.points)),
    };
  });

  const allScores = lastMatchups.map(m => m.points || 0);
  const leagueAvg = mean(allScores);
  const totalPoints = allScores.reduce((a, b) => a + b, 0);
  const avgMargin = games.length ? mean(games.map(g => g.margin)) : 0;
  const nailBiters = games.filter(g => g.margin < 10).length;

  const awards: Award[] = [];
  if (lastMatchups.length) {
    const topScore = [...lastMatchups].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
    const lowest = [...lastMatchups].sort((a, b) => (a.points || 0) - (b.points || 0))[0];
    awards.push({ title: "Top score", team: ref(topScore.roster_id), value: `${round1(topScore.points).toFixed(2)} pts`, detail: "" });
    awards.push({ title: "Lowest score", team: ref(lowest.roster_id), value: `${round2(lowest.points).toFixed(2)} pts`, detail: "" });
  }
  if (games.length) {
    const nonTie = games.filter(g => !g.tie);
    if (nonTie.length) {
      const closest = [...nonTie].sort((a, b) => a.margin - b.margin)[0];
      awards.push({ title: "Closest finish", team: closest.winner, value: `Won by ${closest.margin.toFixed(2)}`, detail: `vs ${closest.loser.name}` });
      const blowout = [...nonTie].sort((a, b) => b.margin - a.margin)[0];
      awards.push({ title: "Biggest blowout", team: blowout.winner, value: `Won by ${blowout.margin.toFixed(1)}`, detail: `vs ${blowout.loser.name}` });
    }
    // Luckiest win: lowest-scoring winner.
    const winners = games.filter(g => !g.tie).map(g => g.winner);
    if (winners.length) {
      const luckiest = [...winners].sort((a, b) => a.points - b.points)[0];
      const game = games.find(g => g.winner.rosterId === luckiest.rosterId)!;
      awards.push({ title: "Luckiest win", team: luckiest, value: `Won with only ${luckiest.points.toFixed(2)}`, detail: `vs ${game.loser.name}` });
    }
    // Unluckiest loss: a loss scored in the top half of the league, highest such score.
    const topHalfCount = Math.floor(allScores.length / 2);
    const topHalf = new Set(
      [...lastMatchups]
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .slice(0, topHalfCount)
        .map(m => m.roster_id),
    );
    const losses = games.filter(g => !g.tie).map(g => g.loser).filter(l => topHalf.has(l.rosterId));
    if (losses.length) {
      const unlucky = [...losses].sort((a, b) => b.points - a.points)[0];
      const game = games.find(g => g.loser.rosterId === unlucky.rosterId)!;
      awards.push({ title: "Unluckiest loss", team: unlucky, value: `Lost with ${unlucky.points.toFixed(2)}`, detail: `vs ${game.winner.name}` });
    }
  }

  // Player history for projections: non-zero weekly points over the last HISTORY_WEEKS completed weeks.
  const history = new Map<string, number[]>();
  for (let w = Math.max(1, resultsWeek - HISTORY_WEEKS + 1); w <= resultsWeek; w++) {
    for (const m of matchupsByWeek[w] || []) {
      for (const [pid, pts] of Object.entries(m.players_points || {})) {
        if (pts > 0) {
          if (!history.has(pid)) history.set(pid, []);
          history.get(pid)!.push(pts);
        }
      }
    }
  }

  // Top individual performances and position leaders (starters only).
  const starterRows: Array<{ pid: string; rosterId: number; points: number }> = [];
  for (const m of lastMatchups) {
    for (const pid of m.starters || []) {
      if (!pid || pid === "0") continue;
      starterRows.push({ pid, rosterId: m.roster_id, points: m.players_points?.[pid] ?? 0 });
    }
  }
  const topIndividual = [...starterRows]
    .sort((a, b) => b.points - a.points)
    .slice(0, 10)
    .map(r => ({
      name: players[r.pid]?.name ?? r.pid,
      position: players[r.pid]?.position ?? "",
      team: ref(r.rosterId),
      points: round1(r.points),
    }));

  const positionLeaders: ReportData["lastWeek"]["positionLeaders"] = [];
  for (const pos of POSITION_ORDER) {
    const best = starterRows
      .filter(r => players[r.pid]?.position === pos)
      .sort((a, b) => b.points - a.points)[0];
    if (best) {
      positionLeaders.push({
        position: pos,
        name: players[best.pid]?.name ?? best.pid,
        team: ref(best.rosterId),
        points: round1(best.points),
      });
    }
  }

  const highestTeamScores = [...lastMatchups]
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 5)
    .map(m => ({ ...ref(m.roster_id), points: round1(m.points || 0) }));

  // Lineup efficiency: actual starters vs the best lineup from the same roster's players.
  const efficiency = lastMatchups
    .map(m => {
      const roster = teamByRoster.get(m.roster_id);
      const candidates: Candidate[] = (roster?.playerIds || []).map(pid => ({
        id: pid,
        position: players[pid]?.position || "UNK",
        points: m.players_points?.[pid] ?? 0,
        variance: 0,
      }));
      const optimal = optimalLineup(candidates, rosterPositions).total;
      const actual = m.points || 0;
      return {
        ...ref(m.roster_id),
        actual: round1(actual),
        optimal: round1(optimal),
        pct: optimal > 0 ? Math.round((actual / optimal) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // ─── Preview (week) ─────────────────────────────────────────────────────────
  const byeSet = new Set(byeTeams);
  const projectionFor = (rosterId: number) => {
    const roster = teamByRoster.get(rosterId);
    const candidates: Candidate[] = (roster?.playerIds || []).map(pid => {
      const p = players[pid];
      const injured = !!p?.injuryStatus && INACTIVE_STATUSES.includes(p.injuryStatus);
      const onBye = !!p?.team && byeSet.has(p.team);
      const proj = projectPlayer(history.get(pid) || [], p?.position || "UNK", injured || onBye);
      return {
        id: pid,
        position: p?.position || "UNK",
        points: proj.mean,
        variance: proj.stdDev ** 2,
      };
    });
    return optimalLineup(candidates, rosterPositions);
  };

  const previewPairs = pairsForWeek(matchupsByWeek[week] || []);
  const matchups: PreviewMatchup[] = previewPairs.map(p => {
    const pa = projectionFor(p.a.rosterId);
    const pb = projectionFor(p.b.rosterId);
    const ra = record.get(p.a.rosterId);
    const rb = record.get(p.b.rosterId);
    const recText = (r?: { w: number; l: number; t: number }) =>
      r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "";
    return {
      a: {
        ...ref(p.a.rosterId),
        record: recText(ra),
        power: power.get(p.a.rosterId) ?? 0,
        projected: round1(pa.total),
      },
      b: {
        ...ref(p.b.rosterId),
        record: recText(rb),
        power: power.get(p.b.rosterId) ?? 0,
        projected: round1(pb.total),
      },
      probA: winProbability(pa.total, pa.variance, pb.total, pb.variance),
    };
  });

  const tossUp = matchups.length
    ? [...matchups].sort((x, y) => Math.abs(x.probA - 0.5) - Math.abs(y.probA - 0.5))[0]
    : null;
  const biggestMismatch = matchups.length
    ? [...matchups].sort((x, y) => Math.abs(y.probA - 0.5) - Math.abs(x.probA - 0.5))[0]
    : null;
  const shootout = matchups.length
    ? [...matchups].sort((x, y) => y.a.projected + y.b.projected - (x.a.projected + x.b.projected))[0]
    : null;

  // ─── Hot & cold (needs at least 5 completed weeks) ─────────────────────────
  let hotCold: ReportData["hotCold"] = null;
  if (resultsWeek >= 5) {
    const lastFour = [resultsWeek - 3, resultsWeek - 2, resultsWeek - 1, resultsWeek];
    const rows = teams
      .map(t => {
        const weekly = scores.get(t.rosterId) || new Map<number, number>();
        const recent = lastFour.map(w => weekly.get(w)).filter((v): v is number => v !== undefined);
        const earlier = [...weekly.entries()].filter(([w]) => !lastFour.includes(w)).map(([, v]) => v);
        if (recent.length === 0 || earlier.length === 0) return null;
        const last4 = mean(recent);
        const earlierAvg = mean(earlier);
        return { ...ref(t.rosterId), delta: round1(last4 - earlierAvg), last4: round1(last4), earlier: round1(earlierAvg) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const sorted = [...rows].sort((a, b) => b.delta - a.delta);
    hotCold = {
      hot: sorted.filter(r => r.delta > 0).slice(0, 2),
      cold: sorted.filter(r => r.delta < 0).slice(-3).reverse(),
      all: sorted,
    };
  }

  return {
    week,
    resultsWeek,
    season,
    leagueName,
    lastWeek: {
      games,
      leagueAvgScore: round1(leagueAvg),
      totalPoints: round1(totalPoints),
      gameCount: games.length,
      avgMargin: round1(avgMargin),
      nailBiters,
      awards,
      topIndividual,
      positionLeaders,
      highestTeamScores,
      efficiency,
    },
    preview: { matchups, tossUp, biggestMismatch, shootout },
    hotCold,
  };
}
