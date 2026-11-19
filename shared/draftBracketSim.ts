// Plays the playoff bracket once and returns the rookie draft pick each playoff team ends up with.
//
// Picks for playoff teams follow how the playoff finishes (worst finisher gets the first of these picks):
//   champion -> last pick            runner-up -> second-to-last
//   semifinal losers play a third-place game: loser -> 9th..., winner -> one higher
//   first-round losers play placement games for the remaining picks
// Seeds come from the caller (a simulated regular season), so a team's seed is never assumed.
//
// Supported brackets: 7 teams (seed 1 has a bye) and 6 teams (seeds 1 and 2 have byes), fixed bracket:
//   7 teams  round 1: 2v7, 3v6, 4v5      semifinals: 1 v W(4v5), W(2v7) v W(3v6)
//   6 teams  round 1: 3v6, 4v5           semifinals: 1 v W(4v5), 2 v W(3v6)
// First-round losers: the best-seeded loser waits; the other two (7 teams) play first, and the winner of
// that game meets the waiting loser. This is how the placement games are laid out from the league's
// bracket mapping (7th-place game loser gets the first pick, 5th-place game loser/winner the next two).

export interface BracketTeam {
  rosterId: number;
  /** Expected points in a week */
  mean: number;
  /** Standard deviation of weekly points */
  sd: number;
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Chance that `a` outscores `b` in one game. */
export function winProbability(a: BracketTeam, b: BracketTeam): number {
  const spread = Math.sqrt(a.sd * a.sd + b.sd * b.sd);
  if (spread === 0) return a.mean === b.mean ? 0.5 : a.mean > b.mean ? 1 : 0;
  return normalCdf((a.mean - b.mean) / spread);
}

export function isSupportedBracket(playoffTeams: number): boolean {
  return playoffTeams === 6 || playoffTeams === 7;
}

/**
 * @param seeded     playoff teams in seed order (seed 1 first)
 * @param firstPick  0-based draft pick index of the worst playoff finisher (teams that miss the playoffs take the picks before it)
 * @param rand       uniform [0, 1) source
 * @returns rosterId -> 0-based pick index, or null if this bracket size is not supported
 */
export function simulateBracketPicks(
  seeded: BracketTeam[],
  firstPick: number,
  rand: () => number = Math.random
): Map<number, number> | null {
  const n = seeded.length;
  if (!isSupportedBracket(n)) return null;
  const seedOf = new Map<number, number>();
  seeded.forEach((t, i) => seedOf.set(t.rosterId, i + 1));

  const play = (a: BracketTeam, b: BracketTeam) => {
    const aWins = rand() < winProbability(a, b);
    return aWins ? { winner: a, loser: b } : { winner: b, loser: a };
  };
  const byBestSeed = (x: BracketTeam, y: BracketTeam) => seedOf.get(x.rosterId)! - seedOf.get(y.rosterId)!;
  const picks = new Map<number, number>();
  const give = (t: BracketTeam, offset: number) => picks.set(t.rosterId, firstPick + offset);

  const s = (k: number) => seeded[k - 1];
  let semiA: [BracketTeam, BracketTeam];
  let semiB: [BracketTeam, BracketTeam];
  const firstRoundLosers: BracketTeam[] = [];

  if (n === 7) {
    const g45 = play(s(4), s(5));
    const g27 = play(s(2), s(7));
    const g36 = play(s(3), s(6));
    firstRoundLosers.push(g45.loser, g27.loser, g36.loser);
    semiA = [s(1), g45.winner];
    semiB = [g27.winner, g36.winner];
  } else {
    const g45 = play(s(4), s(5));
    const g36 = play(s(3), s(6));
    firstRoundLosers.push(g45.loser, g36.loser);
    semiA = [s(1), g45.winner];
    semiB = [s(2), g36.winner];
  }

  // Placement games for the first-round losers
  const losers = [...firstRoundLosers].sort(byBestSeed);
  if (n === 7) {
    const [waiting, x, y] = losers;
    const g7 = play(x, y); // loser finishes last of the playoff teams
    give(g7.loser, 0);
    const g5 = play(waiting, g7.winner);
    give(g5.loser, 1);
    give(g5.winner, 2);
  } else {
    const g = play(losers[0], losers[1]);
    give(g.loser, 0);
    give(g.winner, 1);
  }

  // Semifinals, third-place game, final
  const sfA = play(semiA[0], semiA[1]);
  const sfB = play(semiB[0], semiB[1]);
  const third = play(sfA.loser, sfB.loser);
  give(third.loser, n - 4);
  give(third.winner, n - 3);
  const final = play(sfA.winner, sfB.winner);
  give(final.loser, n - 2);
  give(final.winner, n - 1);
  return picks;
}
