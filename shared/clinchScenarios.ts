export interface ClinchTeam {
  rosterId: number;
  wins: number;
  ties: number;
  division?: number | null;
}

export interface ClinchGame {
  team1: number;
  team2: number;
}

export interface ClinchInput {
  teams: ClinchTeam[];
  /** Total playoff berths, including division winners. */
  playoffTeams: number;
  hasDivisions: boolean;
  /** The games to annotate. */
  previewGames: ClinchGame[];
  /** Every other unplayed regular-season game (later weeks of the preview week included). */
  futureGames: ClinchGame[];
  /** Overrides MAX_EXACT_GAMES; mostly useful for tests. */
  maxExactGames?: number;
}

/** What a single game decides for one of its teams. */
export interface TeamStake {
  /** A win locks up a playoff berth that was not already locked. */
  clinchPlayoff: boolean;
  /** A win locks up the division title (and so a berth) that was not already locked. */
  clinchDivision: boolean;
  /** A win locks up the top seed. */
  clinchOneSeed: boolean;
  /** A loss ends the team's playoff chances for certain. */
  eliminated: boolean;
}

export interface GameStakes {
  team1: TeamStake;
  team2: TeamStake;
}

export interface ClinchAnalysis {
  /** Aligned with ClinchInput.previewGames. */
  games: GameStakes[];
  /**
   * "exact" enumerates every combination of remaining results. "bound" is used when there are too
   * many games left for that: it only reports outcomes that hold even in the most extreme case.
   */
  method: "exact" | "bound";
}

/** 2^22 result combinations is roughly the last three-and-a-half weeks of a 12-team league. */
export const MAX_EXACT_GAMES = 22;

/**
 * Tiebreakers beyond record (points for) are unknown for future games, so every check is
 * conservative: a team only "clinches" if it makes it even when it loses every record tie, and
 * is only "eliminated" if it misses even when it wins every record tie.
 */
class SeedEvaluator {
  gp = 0;
  gd = 0;
  g1 = 0;
  pp = 0;
  pd = 0;
  p1 = 0;

  private readonly hist: Int32Array;
  private readonly ge: Int32Array;
  private readonly top1: Int32Array;
  private readonly top2: Int32Array;
  private readonly top1Idx: Int32Array;
  private readonly slots: number;

  constructor(
    private readonly n: number,
    private readonly division: Int32Array | null,
    private readonly divisionCount: number,
    playoffTeams: number,
    maxScore: number,
  ) {
    this.hist = new Int32Array(maxScore + 3);
    this.ge = new Int32Array(maxScore + 4);
    this.top1 = new Int32Array(divisionCount);
    this.top2 = new Int32Array(divisionCount);
    this.top1Idx = new Int32Array(divisionCount);
    this.slots = division ? playoffTeams - divisionCount : playoffTeams;
  }

  evaluate(s: Int32Array): void {
    const { n, hist, ge, division, divisionCount, slots } = this;
    hist.fill(0);
    let maxS = 0;
    for (let i = 0; i < n; i++) {
      hist[s[i]]++;
      if (s[i] > maxS) maxS = s[i];
    }
    ge[maxS + 1] = 0;
    for (let v = maxS; v >= 0; v--) ge[v] = ge[v + 1] + hist[v];

    if (division) {
      this.top1.fill(-1);
      this.top2.fill(-1);
      this.top1Idx.fill(-1);
      for (let i = 0; i < n; i++) {
        const d = division[i];
        const v = s[i];
        if (v > this.top1[d]) {
          this.top2[d] = this.top1[d];
          this.top1[d] = v;
          this.top1Idx[d] = i;
        } else if (v > this.top2[d]) {
          this.top2[d] = v;
        }
      }
    }

    let gp = 0;
    let gd = 0;
    let g1 = 0;
    let pp = 0;
    let pd = 0;
    let p1 = 0;
    for (let t = 0; t < n; t++) {
      const sT = s[t];
      const bit = 1 << t;
      const cntGE = ge[sT] - 1;
      const cntGT = ge[sT + 1];
      if (sT === maxS && hist[sT] === 1) g1 |= bit;

      if (division) {
        const d = division[t];
        const mateMax = this.top1Idx[d] === t ? this.top2[d] : this.top1[d];
        const guaranteedWinner = sT > mateMax;
        const possibleWinner = sT >= mateMax;
        let winnersGE = 0;
        let winnersGT = 0;
        for (let dd = 0; dd < divisionCount; dd++) {
          const m = dd === d ? mateMax : this.top1[dd];
          if (m >= sT) winnersGE++;
          if (m > sT) winnersGT++;
        }
        if (guaranteedWinner) {
          gd |= bit;
          gp |= bit;
        } else if (cntGE - winnersGE < slots) {
          gp |= bit;
        }
        if (possibleWinner || cntGT - winnersGT < slots) pp |= bit;
        if (possibleWinner) pd |= bit;
        if (possibleWinner && sT === maxS) p1 |= bit;
      } else {
        if (cntGE < slots) gp |= bit;
        if (cntGT < slots) pp |= bit;
        if (sT === maxS) p1 |= bit;
      }
    }
    this.gp = gp;
    this.gd = gd;
    this.g1 = g1;
    this.pp = pp;
    this.pd = pd;
    this.p1 = p1;
  }
}

export function analyzeClinchScenarios(input: ClinchInput): ClinchAnalysis | null {
  const { teams, previewGames, futureGames, playoffTeams } = input;
  const n = teams.length;
  if (n < 2 || n > 30 || previewGames.length === 0) return null;

  const indexOf = new Map<number, number>();
  teams.forEach((t, i) => indexOf.set(t.rosterId, i));

  const games: Array<[number, number]> = [];
  for (const g of [...previewGames, ...futureGames]) {
    const a = indexOf.get(g.team1);
    const b = indexOf.get(g.team2);
    if (a === undefined || b === undefined || a === b) return null;
    games.push([a, b]);
  }
  const previewCount = previewGames.length;
  const gameCount = games.length;

  let division: Int32Array | null = null;
  let divisionCount = 0;
  if (input.hasDivisions) {
    const ids = Array.from(new Set(teams.map((t) => t.division))).filter((d): d is number => d != null);
    if (ids.length > 0 && teams.every((t) => t.division != null)) {
      ids.sort((a, b) => a - b);
      division = Int32Array.from(teams.map((t) => ids.indexOf(t.division as number)));
      divisionCount = ids.length;
    }
  }
  if (division && playoffTeams - divisionCount < 0) return null;

  const base = Int32Array.from(teams.map((t) => 2 * t.wins + t.ties));
  const remaining = new Int32Array(n);
  games.forEach(([a, b]) => {
    remaining[a]++;
    remaining[b]++;
  });
  let maxScore = 0;
  for (let i = 0; i < n; i++) maxScore = Math.max(maxScore, base[i] + 2 * remaining[i]);
  const evaluator = new SeedEvaluator(n, division, divisionCount, playoffTeams, maxScore);

  const bitOf = (mask: number, t: number) => (mask >> t) & 1;
  const results: GameStakes[] = [];

  if (gameCount <= (input.maxExactGames ?? MAX_EXACT_GAMES)) {
    const full = (1 << n) - 1;
    const outcomes = previewCount * 2;
    const gpAnd = new Int32Array(outcomes).fill(full);
    const gdAnd = new Int32Array(outcomes).fill(full);
    const g1And = new Int32Array(outcomes).fill(full);
    const ppOr = new Int32Array(outcomes);
    let allGp = full;
    let allGd = full;
    let allG1 = full;
    let allPp = 0;

    const scores = Int32Array.from(base);
    const outcome = new Uint8Array(gameCount);
    games.forEach(([a]) => {
      scores[a] += 2;
    });

    const total = 2 ** gameCount;
    for (let k = 0; k < total; k++) {
      if (k > 0) {
        const bit = 31 - Math.clz32(k & -k);
        const [a, b] = games[bit];
        if (outcome[bit] === 0) {
          outcome[bit] = 1;
          scores[a] -= 2;
          scores[b] += 2;
        } else {
          outcome[bit] = 0;
          scores[a] += 2;
          scores[b] -= 2;
        }
      }
      evaluator.evaluate(scores);
      const { gp, gd, g1, pp } = evaluator;
      allGp &= gp;
      allGd &= gd;
      allG1 &= g1;
      allPp |= pp;
      for (let p = 0; p < previewCount; p++) {
        const idx = p * 2 + outcome[p];
        gpAnd[idx] &= gp;
        gdAnd[idx] &= gd;
        g1And[idx] &= g1;
        ppOr[idx] |= pp;
      }
    }

    for (let p = 0; p < previewCount; p++) {
      const [a, b] = games[p];
      const stakeFor = (t: number, winIdx: number, loseIdx: number): TeamStake => ({
        clinchPlayoff: !!bitOf(gpAnd[winIdx], t) && !bitOf(allGp, t),
        clinchDivision: !!division && !!bitOf(gdAnd[winIdx], t) && !bitOf(allGd, t),
        clinchOneSeed: !!bitOf(g1And[winIdx], t) && !bitOf(allG1, t),
        eliminated: !bitOf(ppOr[loseIdx], t) && !!bitOf(allPp, t),
      });
      results.push({
        team1: stakeFor(a, p * 2, p * 2 + 1),
        team2: stakeFor(b, p * 2 + 1, p * 2),
      });
    }
    return { games: results, method: "exact" };
  }

  // Too many games left to enumerate: test the two extreme cases for each team instead. Every
  // other team is pushed as far from the team as possible, ignoring that opponents in later weeks
  // cannot both win, so a stake is only reported when it holds even in that unrealistic case.
  const scores = new Int32Array(n);
  const worstCase = (t: number, p: number, tWins: boolean) => {
    const [a, b] = games[p];
    const opp = a === t ? b : a;
    for (let i = 0; i < n; i++) scores[i] = base[i] + 2 * remaining[i];
    scores[t] = base[t] + (tWins ? 2 : 0);
    scores[opp] = base[opp] + 2 * (remaining[opp] - (tWins ? 1 : 0));
  };
  const bestCase = (t: number, p: number, tWins: boolean) => {
    const [a, b] = games[p];
    const opp = a === t ? b : a;
    for (let i = 0; i < n; i++) scores[i] = base[i];
    scores[t] = base[t] + 2 * (remaining[t] - (tWins ? 0 : 1));
    scores[opp] = base[opp] + (tWins ? 0 : 2);
  };

  // The extremes above cannot prove that a team has not *already* clinched or been eliminated,
  // so look for a concrete season in which it hasn't before claiming a game changes things.
  const SAMPLES = 1500;
  const rng = mulberry32(0x5eed);
  const witness = (t: number, tWins: boolean, test: (e: SeedEvaluator) => number): number => {
    let found = 0;
    for (let i = 0; i < SAMPLES && found !== 7; i++) {
      const variant = i % 3;
      for (let k = 0; k < n; k++) scores[k] = base[k];
      for (let g = 0; g < gameCount; g++) {
        const [a, b] = games[g];
        let aWins: boolean;
        if (a === t || b === t) aWins = (a === t) === tWins;
        else if (variant === 0) aWins = rng() < 0.5;
        else {
          const favorStronger = tWins ? variant === 2 : variant === 1;
          const stronger = base[a] >= base[b] ? a : b;
          const weaker = stronger === a ? b : a;
          const winner = rng() < 0.75 ? (favorStronger ? stronger : weaker) : favorStronger ? weaker : stronger;
          aWins = winner === a;
        }
        scores[aWins ? a : b] += 2;
      }
      evaluator.evaluate(scores);
      found |= test(evaluator);
    }
    return found;
  };

  for (let p = 0; p < previewCount; p++) {
    const [a, b] = games[p];
    const stakeFor = (t: number): TeamStake => {
      worstCase(t, p, true);
      evaluator.evaluate(scores);
      const win = { gp: bitOf(evaluator.gp, t), gd: bitOf(evaluator.gd, t), g1: bitOf(evaluator.g1, t) };
      bestCase(t, p, false);
      evaluator.evaluate(scores);
      const outIfLose = !bitOf(evaluator.pp, t);

      let clinchPlayoff = !!win.gp;
      let clinchDivision = !!division && !!win.gd;
      let clinchOneSeed = !!win.g1;
      if (clinchPlayoff || clinchDivision || clinchOneSeed) {
        const missed = witness(
          t,
          false,
          (e) => (bitOf(e.gp, t) ? 0 : 1) | (bitOf(e.gd, t) ? 0 : 2) | (bitOf(e.g1, t) ? 0 : 4),
        );
        clinchPlayoff = clinchPlayoff && !!(missed & 1);
        clinchDivision = clinchDivision && !!(missed & 2);
        clinchOneSeed = clinchOneSeed && !!(missed & 4);
      }
      let eliminated = false;
      if (outIfLose) {
        eliminated = !!(witness(t, true, (e) => (bitOf(e.pp, t) ? 7 : 0)) & 1);
      }
      return { clinchPlayoff, clinchDivision, clinchOneSeed, eliminated };
    };
    results.push({ team1: stakeFor(a), team2: stakeFor(b) });
  }
  return { games: results, method: "bound" };
}

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

export function hasAnyStake(stake: TeamStake | undefined): boolean {
  return !!stake && (stake.clinchPlayoff || stake.clinchDivision || stake.clinchOneSeed || stake.eliminated);
}

export interface OutcomeBounds {
  rosterId: number;
  /** False when the team cannot make the playoffs even if it wins out and everyone else loses. */
  canMakePlayoffs: boolean;
  canWinDivision: boolean;
  canGetOneSeed: boolean;
  /** True when the team makes the playoffs even if it loses out and everyone else wins out. */
  lockedPlayoffs: boolean;
  lockedDivision: boolean;
  lockedOneSeed: boolean;
}

/**
 * Season-long certainties, ignoring the schedule: a team "cannot" do something only if it fails
 * even in its best imaginable season, and is "locked" only if it succeeds even in its worst.
 * Meant for pinning simulation odds to exactly 0% or 100% when the outcome is already decided.
 */
export function computeOutcomeBounds(
  teams: ClinchTeam[],
  playoffTeams: number,
  hasDivisions: boolean,
  remainingGamesPerTeam: number,
): OutcomeBounds[] {
  const n = teams.length;
  if (n < 2 || n > 30) return [];

  let division: Int32Array | null = null;
  let divisionCount = 0;
  if (hasDivisions && teams.every((t) => t.division != null)) {
    const ids = Array.from(new Set(teams.map((t) => t.division as number))).sort((a, b) => a - b);
    division = Int32Array.from(teams.map((t) => ids.indexOf(t.division as number)));
    divisionCount = ids.length;
    if (playoffTeams - divisionCount < 0) return [];
  }

  const base = Int32Array.from(teams.map((t) => 2 * t.wins + t.ties));
  const extra = 2 * Math.max(0, remainingGamesPerTeam);
  const maxScore = Math.max(...Array.from(base)) + extra;
  const evaluator = new SeedEvaluator(n, division, divisionCount, playoffTeams, maxScore);
  const scores = new Int32Array(n);
  const bit = (mask: number, t: number) => ((mask >> t) & 1) === 1;

  return teams.map((team, t) => {
    for (let i = 0; i < n; i++) scores[i] = base[i];
    scores[t] = base[t] + extra;
    evaluator.evaluate(scores);
    const best = { pp: bit(evaluator.pp, t), pd: bit(evaluator.pd, t), p1: bit(evaluator.p1, t) };

    for (let i = 0; i < n; i++) scores[i] = base[i] + extra;
    scores[t] = base[t];
    evaluator.evaluate(scores);
    const worst = { gp: bit(evaluator.gp, t), gd: bit(evaluator.gd, t), g1: bit(evaluator.g1, t) };

    return {
      rosterId: team.rosterId,
      canMakePlayoffs: best.pp,
      canWinDivision: division ? best.pd : best.p1,
      canGetOneSeed: best.p1,
      lockedPlayoffs: worst.gp,
      lockedDivision: !!division && worst.gd,
      lockedOneSeed: worst.g1,
    };
  });
}
