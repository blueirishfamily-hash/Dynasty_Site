// Projects each team's FINAL Max PF (the sum of its best possible lineup score every regular season week).
//
// Draft order for teams that miss the playoffs goes lowest final Max PF first, but while the season is
// still going a team's Max PF is only the sum of the weeks played so far. This estimates where each team
// will end up so the draft odds can reflect weeks still to play.
//
// Model: a team's remaining weekly values look like its weekly values so far.
//   expected final = current Max PF + weeks left * (the team's average week, pulled toward the league average)
//   spread         = weekly spread (the same for every team) * sqrt(weeks left)
// With no weeks left the projection is exactly the current Max PF and there is no spread.

export interface TeamWeeklyMaxPf {
  rosterId: number;
  /** Optimal-lineup points for each completed regular season week, oldest first */
  weekly: number[];
}

export interface MaxPfProjection {
  rosterId: number;
  /** Max PF so far (sum of the weeks played) */
  current: number;
  /** Expected Max PF after the regular season */
  mean: number;
  /** Standard deviation of the final Max PF (0 when no weeks are left) */
  sd: number;
}

/** How many weeks of the league average each team's own average is blended with (a small pull toward the middle). */
export const SHRINK_WEEKS = 4;

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function projectFinalMaxPf(
  teams: TeamWeeklyMaxPf[],
  regularSeasonWeeks: number
): Map<number, MaxPfProjection> {
  const result = new Map<number, MaxPfProjection>();
  const all = teams.flatMap((t) => t.weekly.filter((w) => Number.isFinite(w)));
  const leagueMean = all.length > 0 ? sum(all) / all.length : 0;

  // Weekly spread inside teams, pooled across the league (a single team's spread over ~10 weeks is too noisy).
  let sumSq = 0;
  let dof = 0;
  for (const t of teams) {
    const w = t.weekly.filter((x) => Number.isFinite(x));
    if (w.length < 2) continue;
    const m = sum(w) / w.length;
    sumSq += w.reduce((s, x) => s + (x - m) ** 2, 0);
    dof += w.length - 1;
  }
  const weeklySd = dof > 0 ? Math.sqrt(sumSq / dof) : 0;

  for (const t of teams) {
    const w = t.weekly.filter((x) => Number.isFinite(x));
    const played = w.length;
    const remaining = Math.max(0, regularSeasonWeeks - played);
    const current = sum(w);
    const ownMean = played > 0 ? current / played : leagueMean;
    const blendedMean = (played * ownMean + SHRINK_WEEKS * leagueMean) / (played + SHRINK_WEEKS);
    result.set(t.rosterId, {
      rosterId: t.rosterId,
      current,
      mean: current + remaining * blendedMean,
      sd: weeklySd * Math.sqrt(remaining),
    });
  }
  return result;
}

/** One random final Max PF for a team. `z` is a standard normal draw. */
export function drawFinalMaxPf(p: MaxPfProjection, z: number): number {
  return p.mean + p.sd * z;
}

/** Standard normal draw (Box-Muller). `rand` is a uniform [0, 1) source, so tests can seed it. */
export function randomNormal(rand: () => number = Math.random): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
