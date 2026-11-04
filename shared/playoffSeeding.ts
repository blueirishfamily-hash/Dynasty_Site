export interface SeedingTeam {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  division?: number | null;
}

export interface SeededTeam extends SeedingTeam {
  seed: number;
  isDivisionWinner: boolean;
  divisionRank?: number;
}

export interface DivisionStanding {
  division: number;
  rosterIds: number[];
}

export interface PlayoffSeeding {
  hasDivisions: boolean;
  seeds: SeededTeam[];
  divisions: DivisionStanding[];
}

const winPct = (t: SeedingTeam): number => {
  const games = t.wins + t.losses + t.ties;
  return games > 0 ? (t.wins + t.ties * 0.5) / games : 0;
};

export function compareSeedingTeams(a: SeedingTeam, b: SeedingTeam): number {
  const pctDiff = winPct(b) - winPct(a);
  if (Math.abs(pctDiff) > 1e-9) return pctDiff;
  if (Math.abs(b.pointsFor - a.pointsFor) > 0.005) return b.pointsFor - a.pointsFor;
  return a.rosterId - b.rosterId;
}

/**
 * Division winners take the top seeds (ordered by record, then points for); every other team
 * is seeded behind them by record, then points for. Without a complete division setup this
 * degrades to plain record-based seeding.
 */
export function computePlayoffSeeding(teams: SeedingTeam[], divisionCount: number): PlayoffSeeding {
  const hasDivisions =
    divisionCount > 0 &&
    teams.length > 0 &&
    teams.every((t) => t.division != null && t.division > 0);

  if (!hasDivisions) {
    const seeds = [...teams]
      .sort(compareSeedingTeams)
      .map((t, i) => ({ ...t, seed: i + 1, isDivisionWinner: false }));
    return { hasDivisions: false, seeds, divisions: [] };
  }

  const byDivision = new Map<number, SeedingTeam[]>();
  teams.forEach((t) => {
    const list = byDivision.get(t.division as number) ?? [];
    list.push(t);
    byDivision.set(t.division as number, list);
  });

  const divisions: DivisionStanding[] = [];
  const winners: SeededTeam[] = [];
  const rest: SeedingTeam[] = [];
  const divisionRankOf = new Map<number, number>();

  Array.from(byDivision.keys())
    .sort((a, b) => a - b)
    .forEach((division) => {
      const ranked = [...(byDivision.get(division) as SeedingTeam[])].sort(compareSeedingTeams);
      divisions.push({ division, rosterIds: ranked.map((t) => t.rosterId) });
      ranked.forEach((t, i) => divisionRankOf.set(t.rosterId, i + 1));
      winners.push({ ...ranked[0], seed: 0, isDivisionWinner: true });
      rest.push(...ranked.slice(1));
    });

  winners.sort(compareSeedingTeams);
  rest.sort(compareSeedingTeams);

  const seeds: SeededTeam[] = [
    ...winners,
    ...rest.map((t) => ({ ...t, seed: 0, isDivisionWinner: false })),
  ].map((t, i) => ({ ...t, seed: i + 1, divisionRank: divisionRankOf.get(t.rosterId) }));

  return { hasDivisions: true, seeds, divisions };
}
