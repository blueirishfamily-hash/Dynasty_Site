/**
 * Playoff outlook simulation.
 *
 * Pure functions (no network, no database) so they can be unit tested. The playoff-predictions
 * route gathers league data, calls simulateOutlook(), and merges the result into its response.
 *
 * Unlike a "play an average opponent" simulation, this plays every remaining game against the
 * team's real opponent from the schedule, which is what makes game-by-game leverage possible.
 *
 * Standings use wins only, then points for, then head-to-head wins (same as the existing predictor).
 */

export interface OutlookTeam {
  rosterId: number;
  wins: number;
  losses: number;
  pointsFor: number;
  /** Projected points per week */
  mean: number;
  /** Weekly standard deviation */
  std: number;
}

export type OutlookSchedule = Record<number, Array<[number, number]>>;

export interface WeeklyRecord {
  week: number;
  /** Cumulative wins through this week, by roster id */
  wins: Record<number, number>;
  /** Cumulative points for through this week, by roster id */
  pf: Record<number, number>;
}

export interface OutlookInput {
  teams: OutlookTeam[];
  playoffTeams: number;
  /** Last regular season week */
  regularSeasonWeeks: number;
  /** First week that has not been played yet (the current week counts as remaining) */
  firstRemainingWeek: number;
  /** week -> list of [rosterIdA, rosterIdB] games. Weeks with no entry fall back to an average opponent. */
  schedule: OutlookSchedule;
  h2h: (a: number, b: number) => number;
  userRosterId?: number;
  /** Completed weeks, used to replay odds week by week */
  weekly?: WeeklyRecord[];
  sims?: number;
  seed?: number;
}

export interface TeamOutlook {
  rosterId: number;
  makePlayoffsPct: number;
  byePct: number;
  oneSeedPct: number;
  /** seedPct[s - 1] = chance of finishing with seed s */
  seedPct: number[];
  projectedWins: number;
  projectedPointsFor: number;
  gamesLeft: number;
  /** Average win rate of the remaining opponents, or null with no games left */
  sosLeft: number | null;
  clinchedPlayoffs: boolean;
  clinchedBye: boolean;
  eliminated: boolean;
  /** Wins (own wins plus rival losses) still needed to clinch a spot. 0 once clinched. */
  magic: number;
  /** Losses (own losses plus rival wins) until eliminated. 0 once eliminated. */
  elim: number;
}

export interface LeverageGame {
  week: number;
  teamA: number;
  teamB: number;
  /** The team the user should root for */
  rootFor: number;
  /** User's playoff odds (%) if rootFor wins */
  oddsIfRootWins: number;
  /** User's playoff odds (%) if the other team wins */
  oddsIfRootLoses: number;
  /** oddsIfRootWins minus oddsIfRootLoses, in percentage points. Under about 1.5 is simulation noise. */
  swing: number;
}

export interface UserOutlook {
  rosterId: number;
  baselinePct: number;
  bestCasePct: number;
  worstCasePct: number;
  /** The user's game this week, if any */
  ownGame: { week: number; opponent: number; oddsIfWin: number; oddsIfLose: number } | null;
  leverage: LeverageGame[];
  /** Chance of making the playoffs at each final win total */
  winsNeeded: Array<{ wins: number; pct: number; samples: number }>;
}

/** Playoff odds for both teams in one game, as they stand now and with each result forced. */
export interface GameSwing {
  week: number;
  teamA: number;
  teamB: number;
  a: { now: number; ifWin: number; ifLose: number };
  b: { now: number; ifWin: number; ifLose: number };
}

export interface OutlookResult {
  sims: number;
  /** Finishing orders (roster ids, seed 1 first) of the first SEED_SAMPLES simulated seasons */
  seedSamples: number[][];
  byes: number;
  teams: TeamOutlook[];
  /** Average wins of the last playoff seed now, and as of the previous week's replay */
  cutoffWins: number;
  cutoffWinsPrev: number | null;
  /** Odds history. weeks[k] is the week after which the odds were computed. */
  history: { weeks: number[]; series: Record<number, number[]> };
  user: UserOutlook | null;
  /** Both-team swing for each game of the first remaining week. */
  gameSwings: GameSwing[];
}

/** Small fast seeded generator so repeated page loads show the same numbers. */
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

/** Number of first-round byes for a single-elimination bracket of this size. */
export function byesFor(playoffTeams: number): number {
  if (playoffTeams <= 1) return 0;
  let size = 1;
  while (size < playoffTeams) size *= 2;
  return size - playoffTeams;
}

interface SimAgg {
  made: number[];
  bye: number[];
  seeds: number[][];
  winsSum: number[];
  pfSum: number[];
  /** [team][finalWins] counts, and how many of those made the playoffs */
  winsTotal: number[][];
  winsMade: number[][];
  cutoffSum: number;
  n: number;
  /** Finishing order (roster ids, seed 1 first) of the first few simulated seasons */
  orders: number[][];
}

interface SimOptions {
  /** Keep the finishing order of this many simulated seasons */
  sample?: number;
  /** Forced results: key "week:minId-maxId" -> winning roster id */
  forced?: Map<string, number>;
  n: number;
  seed: number;
  startWeek: number;
  baseWins: number[];
  basePf: number[];
}

const forcedKey = (week: number, a: number, b: number) => `${week}:${Math.min(a, b)}-${Math.max(a, b)}`;

function normal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function runSims(input: OutlookInput, opt: SimOptions): SimAgg {
  const { teams, playoffTeams, regularSeasonWeeks, schedule } = input;
  const byes = byesFor(playoffTeams);
  const T = teams.length;
  const idx = new Map<number, number>();
  teams.forEach((t, i) => idx.set(t.rosterId, i));
  const maxWins = regularSeasonWeeks + 1;
  const avgMean = teams.reduce((s, t) => s + t.mean, 0) / T;
  const avgStd = Math.sqrt(teams.reduce((s, t) => s + t.std * t.std, 0) / T);
  const rng = mulberry32(opt.seed);

  const agg: SimAgg = {
    made: new Array(T).fill(0),
    bye: new Array(T).fill(0),
    seeds: teams.map(() => new Array(T).fill(0)),
    winsSum: new Array(T).fill(0),
    pfSum: new Array(T).fill(0),
    winsTotal: teams.map(() => new Array(maxWins + 1).fill(0)),
    winsMade: teams.map(() => new Array(maxWins + 1).fill(0)),
    cutoffSum: 0,
    n: opt.n,
    orders: [],
  };

  const wins = new Array(T).fill(0);
  const pf = new Array(T).fill(0);
  const order = new Array(T).fill(0).map((_, i) => i);

  for (let s = 0; s < opt.n; s++) {
    for (let i = 0; i < T; i++) {
      wins[i] = opt.baseWins[i];
      pf[i] = opt.basePf[i];
    }
    for (let week = opt.startWeek; week <= regularSeasonWeeks; week++) {
      const games = schedule[week];
      if (games && games.length > 0) {
        const played = new Set<number>();
        for (const [ra, rb] of games) {
          const a = idx.get(ra);
          const b = idx.get(rb);
          if (a === undefined || b === undefined) continue;
          played.add(a);
          played.add(b);
          // Always draw both scores so forced and unforced runs stay in step.
          const sa = teams[a].mean + normal(rng) * teams[a].std;
          const sb = teams[b].mean + normal(rng) * teams[b].std;
          pf[a] += Math.max(50, sa);
          pf[b] += Math.max(50, sb);
          let winner: number;
          const f = opt.forced?.get(forcedKey(week, ra, rb));
          if (f !== undefined) winner = f === ra ? a : b;
          else winner = sa >= sb ? a : b;
          wins[winner] += 1;
        }
        // Teams with no game this week (bye week) score nothing and win nothing.
      } else {
        // No published schedule for this week: play an average opponent.
        for (let i = 0; i < T; i++) {
          const sa = teams[i].mean + normal(rng) * teams[i].std;
          const so = avgMean + normal(rng) * avgStd;
          pf[i] += Math.max(50, sa);
          if (sa > so) wins[i] += 1;
        }
      }
    }
    order.sort((x, y) => {
      if (wins[y] !== wins[x]) return wins[y] - wins[x];
      if (Math.abs(pf[y] - pf[x]) > 0.01) return pf[y] - pf[x];
      return input.h2h(teams[y].rosterId, teams[x].rosterId) - input.h2h(teams[x].rosterId, teams[y].rosterId);
    });
    if (opt.sample && agg.orders.length < opt.sample) agg.orders.push(order.map((i) => teams[i].rosterId));
    for (let pos = 0; pos < T; pos++) {
      const i = order[pos];
      agg.seeds[i][pos] += 1;
      const made = pos < playoffTeams;
      if (made) agg.made[i] += 1;
      if (pos < byes) agg.bye[i] += 1;
      agg.winsSum[i] += wins[i];
      agg.pfSum[i] += pf[i];
      const w = Math.min(maxWins, Math.max(0, wins[i]));
      agg.winsTotal[i][w] += 1;
      if (made) agg.winsMade[i][w] += 1;
    }
    agg.cutoffSum += wins[order[Math.min(playoffTeams, T) - 1]];
  }
  return agg;
}

const pct1 = (count: number, n: number) => Math.round((count / n) * 1000) / 10;

function gamesLeftFor(schedule: OutlookSchedule, firstRemainingWeek: number, last: number, rosterId: number): number {
  let n = 0;
  for (let w = firstRemainingWeek; w <= last; w++) {
    const games = schedule[w];
    if (!games || games.length === 0) {
      n += 1;
    } else if (games.some(([a, b]) => a === rosterId || b === rosterId)) {
      n += 1;
    }
  }
  return n;
}

/** n-th largest value (1-based) of a list, or -Infinity when the list is shorter. */
function nthLargest(values: number[], n: number): number {
  const sorted = [...values].sort((a, b) => b - a);
  return n >= 1 && n <= sorted.length ? sorted[n - 1] : -Infinity;
}

/** How many simulated seasons' finishing orders are kept (the Draft Odds play the playoff bracket from them). */
export const SEED_SAMPLES = 1000;

export function simulateOutlook(input: OutlookInput): OutlookResult {
  const { teams, playoffTeams, regularSeasonWeeks, firstRemainingWeek, schedule } = input;
  const sims = input.sims ?? 10000;
  const baseSeed = input.seed ?? 12345;
  const byes = byesFor(playoffTeams);
  const T = teams.length;
  const idx = new Map<number, number>();
  teams.forEach((t, i) => idx.set(t.rosterId, i));
  const baseWins = teams.map((t) => t.wins);
  const basePf = teams.map((t) => t.pointsFor);

  const main = runSims(input, {
    n: sims,
    seed: baseSeed,
    startWeek: firstRemainingWeek,
    baseWins,
    basePf,
    sample: SEED_SAMPLES,
  });

  const gamesLeft = teams.map((t) => gamesLeftFor(schedule, firstRemainingWeek, regularSeasonWeeks, t.rosterId));
  const played = teams.map((t) => {
    const g = t.wins + t.losses;
    return g > 0 ? t.wins / g : 0.5;
  });

  // Strength of the remaining schedule
  const sos = teams.map((t) => {
    const opps: number[] = [];
    for (let w = firstRemainingWeek; w <= regularSeasonWeeks; w++) {
      const games = schedule[w] || [];
      for (const [a, b] of games) {
        if (a === t.rosterId && idx.has(b)) opps.push(played[idx.get(b)!]);
        if (b === t.rosterId && idx.has(a)) opps.push(played[idx.get(a)!]);
      }
    }
    return opps.length ? opps.reduce((s, v) => s + v, 0) / opps.length : null;
  });

  // Clinch and elimination math (wins only, tiebreakers not counted, so it is conservative)
  const maxFinal = teams.map((t, i) => t.wins + gamesLeft[i]);
  const teamOutlooks: TeamOutlook[] = teams.map((t, i) => {
    const othersMax = maxFinal.filter((_, j) => j !== i);
    const othersNow = teams.filter((_, j) => j !== i).map((o) => o.wins);
    const rivalMax = nthLargest(othersMax, playoffTeams);
    const rivalNow = nthLargest(othersNow, playoffTeams);
    const magic = Math.max(0, rivalMax === -Infinity ? 0 : rivalMax - t.wins + 1);
    const elim = rivalNow === -Infinity ? 99 : Math.max(0, maxFinal[i] - rivalNow + 1);
    const byeRivalMax = nthLargest(othersMax, byes);
    const clinchedPlayoffs = magic === 0;
    const clinchedBye = byes > 0 && (byeRivalMax === -Infinity ? true : byeRivalMax < t.wins);
    const eliminated = !clinchedPlayoffs && elim === 0;
    return {
      rosterId: t.rosterId,
      makePlayoffsPct: pct1(main.made[i], main.n),
      byePct: pct1(main.bye[i], main.n),
      oneSeedPct: pct1(main.seeds[i][0], main.n),
      seedPct: main.seeds[i].map((c) => pct1(c, main.n)),
      projectedWins: Math.round((main.winsSum[i] / main.n) * 10) / 10,
      projectedPointsFor: Math.round((main.pfSum[i] / main.n) * 10) / 10,
      gamesLeft: gamesLeft[i],
      sosLeft: sos[i],
      clinchedPlayoffs,
      clinchedBye,
      eliminated,
      magic,
      elim,
    };
  });

  // Odds history: replay the simulation as of the end of each completed week.
  const history: OutlookResult["history"] = { weeks: [], series: {} };
  teams.forEach((t) => (history.series[t.rosterId] = []));
  let cutoffWinsPrev: number | null = null;
  const weekly = (input.weekly || []).filter((w) => w.week < firstRemainingWeek).sort((a, b) => a.week - b.week);
  weekly.forEach((rec, k) => {
    const hist = runSims(input, {
      n: Math.min(sims, 2000),
      seed: baseSeed + 7919 * (k + 1),
      startWeek: rec.week + 1,
      baseWins: teams.map((t) => rec.wins[t.rosterId] ?? 0),
      basePf: teams.map((t) => rec.pf[t.rosterId] ?? 0),
    });
    history.weeks.push(rec.week);
    teams.forEach((t, i) => history.series[t.rosterId].push(pct1(hist.made[i], hist.n)));
    if (k === weekly.length - 1) cutoffWinsPrev = Math.round((hist.cutoffSum / hist.n) * 10) / 10;
  });

  // Leverage for one team
  let user: UserOutlook | null = null;
  if (input.userRosterId !== undefined && idx.has(input.userRosterId) && firstRemainingWeek <= regularSeasonWeeks) {
    const u = idx.get(input.userRosterId)!;
    const baseline = teamOutlooks[u].makePlayoffsPct;
    const games = schedule[firstRemainingWeek] || [];
    const nLev = Math.min(sims, 6000);
    const oddsWith = (week: number, ra: number, rb: number, winner: number): number => {
      const forced = new Map<string, number>([[forcedKey(week, ra, rb), winner]]);
      const agg = runSims(input, { n: nLev, seed: baseSeed + 104729, startWeek: firstRemainingWeek, baseWins, basePf, forced });
      return pct1(agg.made[u], agg.n);
    };
    const leverage: LeverageGame[] = [];
    let ownGame: UserOutlook["ownGame"] = null;
    let best = baseline;
    let worst = baseline;
    for (const [ra, rb] of games) {
      const oa = oddsWith(firstRemainingWeek, ra, rb, ra);
      const ob = oddsWith(firstRemainingWeek, ra, rb, rb);
      if (ra === input.userRosterId || rb === input.userRosterId) {
        const opp = ra === input.userRosterId ? rb : ra;
        ownGame = {
          week: firstRemainingWeek,
          opponent: opp,
          oddsIfWin: ra === input.userRosterId ? oa : ob,
          oddsIfLose: ra === input.userRosterId ? ob : oa,
        };
        continue;
      }
      const rootA = oa >= ob;
      leverage.push({
        week: firstRemainingWeek,
        teamA: ra,
        teamB: rb,
        rootFor: rootA ? ra : rb,
        oddsIfRootWins: rootA ? oa : ob,
        oddsIfRootLoses: rootA ? ob : oa,
        swing: Math.round(Math.abs(oa - ob) * 10) / 10,
      });
    }
    leverage.sort((a, b) => Math.abs(b.oddsIfRootWins - b.oddsIfRootLoses) - Math.abs(a.oddsIfRootWins - a.oddsIfRootLoses));
    // Best and worst case this week, simulated jointly: every game in the helpful (or harmful) direction.
    const bestForced = new Map<string, number>();
    const worstForced = new Map<string, number>();
    for (const g of leverage) {
      const other = g.rootFor === g.teamA ? g.teamB : g.teamA;
      bestForced.set(forcedKey(g.week, g.teamA, g.teamB), g.rootFor);
      worstForced.set(forcedKey(g.week, g.teamA, g.teamB), other);
    }
    if (ownGame) {
      bestForced.set(forcedKey(ownGame.week, input.userRosterId, ownGame.opponent), input.userRosterId);
      worstForced.set(forcedKey(ownGame.week, input.userRosterId, ownGame.opponent), ownGame.opponent);
    }
    const bestAgg = runSims(input, { n: nLev, seed: baseSeed + 104729, startWeek: firstRemainingWeek, baseWins, basePf, forced: bestForced });
    const worstAgg = runSims(input, { n: nLev, seed: baseSeed + 104729, startWeek: firstRemainingWeek, baseWins, basePf, forced: worstForced });
    best = pct1(bestAgg.made[u], bestAgg.n);
    worst = pct1(worstAgg.made[u], worstAgg.n);
    const winsNeeded: UserOutlook["winsNeeded"] = [];
    for (let w = 0; w < main.winsTotal[u].length; w++) {
      const total = main.winsTotal[u][w];
      if (total >= 20) winsNeeded.push({ wins: w, pct: pct1(main.winsMade[u][w], total), samples: total });
    }
    user = {
      rosterId: input.userRosterId,
      baselinePct: baseline,
      bestCasePct: best,
      worstCasePct: worst,
      ownGame,
      leverage: leverage.slice(0, 6),
      winsNeeded,
    };
  }

  // Swing for both teams in each game of the first remaining week. One forced run per result gives
  // the odds of every team at once, so both sides of a game come from the same two runs.
  const gameSwings: GameSwing[] = [];
  if (firstRemainingWeek <= regularSeasonWeeks) {
    const nSwing = Math.min(sims, 3000);
    for (const [ra, rb] of schedule[firstRemainingWeek] || []) {
      const a = idx.get(ra);
      const b = idx.get(rb);
      if (a === undefined || b === undefined) continue;
      const run = (winner: number) =>
        runSims(input, {
          n: nSwing,
          seed: baseSeed + 15485863,
          startWeek: firstRemainingWeek,
          baseWins,
          basePf,
          forced: new Map<string, number>([[forcedKey(firstRemainingWeek, ra, rb), winner]]),
        });
      const aWins = run(ra);
      const bWins = run(rb);
      gameSwings.push({
        week: firstRemainingWeek,
        teamA: ra,
        teamB: rb,
        a: { now: teamOutlooks[a].makePlayoffsPct, ifWin: pct1(aWins.made[a], aWins.n), ifLose: pct1(bWins.made[a], bWins.n) },
        b: { now: teamOutlooks[b].makePlayoffsPct, ifWin: pct1(bWins.made[b], bWins.n), ifLose: pct1(aWins.made[b], aWins.n) },
      });
    }
  }

  return {
    sims,
    seedSamples: main.orders,
    byes,
    teams: teamOutlooks,
    cutoffWins: Math.round((main.cutoffSum / main.n) * 10) / 10,
    cutoffWinsPrev,
    history,
    user,
    gameSwings,
  };
}
