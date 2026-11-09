export type PlayoffResult = "champion" | "runner_up" | "third" | "fourth" | "playoffs" | "missed";

export type GameKind = "regular" | "playoff" | "consolation";

export interface HistoryFranchise {
  /** Owner user id; falls back to `roster-<id>` for an unowned roster. */
  id: string;
  /** Most recent team name. */
  name: string;
  initials: string;
  avatar: string | null;
  ownerName: string | null;
}

export interface HistoryTeamSeason {
  franchiseId: string;
  rosterId: number;
  /** Team name that season. */
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Regular-season rank by record, then points for. */
  rank: number;
  division: number | null;
  /** Null while the season is still being played. */
  madePlayoffs: boolean | null;
  result: PlayoffResult | null;
}

export interface HistorySeason {
  season: string;
  leagueId: string;
  complete: boolean;
  /** First playoff week; regular season is every week before it. */
  playoffWeekStart: number;
  playoffTeams: number;
  teams: HistoryTeamSeason[];
  championId: string | null;
  runnerUpId: string | null;
  thirdId: string | null;
}

export interface HistoryGame {
  season: string;
  week: number;
  kind: GameKind;
  /** e.g. "Championship", "Semifinal"; only for playoff and consolation games. */
  label?: string;
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
}

/** What gets stored per season, and the unit the history is built from. */
export interface SeasonHistory {
  season: HistorySeason;
  games: HistoryGame[];
  /** Owner display name by franchise id, as of that season. */
  owners: Record<string, string>;
  avatars: Record<string, string | null>;
}

export interface LeagueHistory {
  leagueName: string;
  generatedAt: string;
  franchises: HistoryFranchise[];
  seasons: HistorySeason[];
  games: HistoryGame[];
}

export interface GameFilter {
  /** Defaults to regular season and playoffs; consolation games are never counted unless asked for. */
  kinds?: GameKind[];
  seasons?: string[];
}

const DEFAULT_KINDS: GameKind[] = ["regular", "playoff"];

export const resultLabel: Record<PlayoffResult, string> = {
  champion: "Champion",
  runner_up: "Runner-up",
  third: "3rd place",
  fourth: "4th place",
  playoffs: "Made playoffs",
  missed: "Missed playoffs",
};

export function filterGames(history: LeagueHistory, filter: GameFilter = {}): HistoryGame[] {
  const kinds = filter.kinds ?? DEFAULT_KINDS;
  const seasons = filter.seasons?.length ? new Set(filter.seasons) : null;
  return history.games.filter((g) => kinds.includes(g.kind) && (!seasons || seasons.has(g.season)));
}

const gameKey = (g: HistoryGame) => g.season + String(g.week).padStart(2, "0");

export function sortChronological(games: HistoryGame[]): HistoryGame[] {
  return [...games].sort((x, y) => (gameKey(x) < gameKey(y) ? -1 : gameKey(x) > gameKey(y) ? 1 : 0));
}

export function franchiseOf(history: LeagueHistory, id: string): HistoryFranchise | undefined {
  return history.franchises.find((f) => f.id === id);
}

export function winnerOf(g: HistoryGame): string | null {
  if (g.scoreA > g.scoreB) return g.a;
  if (g.scoreB > g.scoreA) return g.b;
  return null;
}

/* ---------------------------------------------------------------- all-time table */

export interface FranchiseTotals {
  franchiseId: string;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsPerGame: number;
  playoffWins: number;
  playoffLosses: number;
  titles: number;
  finals: number;
  playoffAppearances: number;
  bestSeason: HistoryTeamSeason & { season: string } | null;
  worstSeason: HistoryTeamSeason & { season: string } | null;
}

const seasonWinPct = (t: HistoryTeamSeason) => {
  const games = t.wins + t.losses + t.ties;
  return games > 0 ? (t.wins + t.ties / 2) / games : 0;
};

export function computeFranchiseTotals(history: LeagueHistory): FranchiseTotals[] {
  const rows = new Map<string, FranchiseTotals>();
  history.franchises.forEach((f) =>
    rows.set(f.id, {
      franchiseId: f.id,
      seasons: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPct: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointsPerGame: 0,
      playoffWins: 0,
      playoffLosses: 0,
      titles: 0,
      finals: 0,
      playoffAppearances: 0,
      bestSeason: null,
      worstSeason: null,
    }),
  );

  history.seasons.forEach((season) => {
    season.teams.forEach((team) => {
      const row = rows.get(team.franchiseId);
      if (!row) return;
      row.seasons++;
      row.wins += team.wins;
      row.losses += team.losses;
      row.ties += team.ties;
      row.pointsFor += team.pointsFor;
      row.pointsAgainst += team.pointsAgainst;
      if (team.madePlayoffs) row.playoffAppearances++;
      if (team.result === "champion") row.titles++;
      if (team.result === "champion" || team.result === "runner_up") row.finals++;
      // Only finished seasons count toward best / worst
      if (season.complete) {
        const entry = { ...team, season: season.season };
        if (!row.bestSeason || compareSeasons(entry, row.bestSeason) > 0) row.bestSeason = entry;
        if (!row.worstSeason || compareSeasons(entry, row.worstSeason) < 0) row.worstSeason = entry;
      }
    });
  });

  history.games
    .filter((g) => g.kind === "playoff")
    .forEach((g) => {
      const winner = winnerOf(g);
      if (!winner) return;
      const loser = winner === g.a ? g.b : g.a;
      const w = rows.get(winner);
      const l = rows.get(loser);
      if (w) w.playoffWins++;
      if (l) l.playoffLosses++;
    });

  rows.forEach((row) => {
    const games = row.wins + row.losses + row.ties;
    row.winPct = games > 0 ? (row.wins + row.ties / 2) / games : 0;
    row.pointsPerGame = games > 0 ? row.pointsFor / games : 0;
  });
  return Array.from(rows.values());
}

function compareSeasons(a: HistoryTeamSeason, b: HistoryTeamSeason): number {
  const diff = seasonWinPct(a) - seasonWinPct(b);
  if (Math.abs(diff) > 1e-9) return diff;
  return a.pointsFor - b.pointsFor;
}

/* ---------------------------------------------------------------- records book */

export interface RecordEntry {
  franchiseId: string;
  /** Opponent, for single-game records. */
  opponentId?: string;
  season: string;
  /** Null for whole-season records. */
  week: number | null;
  value: number;
  /** Secondary value, such as the opponent's score. */
  other?: number;
  label?: string;
  /** Streak length with the span it covers. */
  span?: string;
}

export interface RecordCategory {
  id: string;
  title: string;
  description: string;
  unit: "points" | "wins" | "games" | "record";
  entries: RecordEntry[];
}

const TOP = 5;

function topBy<T>(items: T[], score: (item: T) => number, direction: "desc" | "asc", limit = TOP): T[] {
  return [...items].sort((a, b) => (direction === "desc" ? score(b) - score(a) : score(a) - score(b))).slice(0, limit);
}

interface SideGame {
  franchiseId: string;
  opponentId: string;
  season: string;
  week: number;
  label?: string;
  score: number;
  opponentScore: number;
}

function sideGames(games: HistoryGame[]): SideGame[] {
  return games.flatMap((g) => [
    { franchiseId: g.a, opponentId: g.b, season: g.season, week: g.week, label: g.label, score: g.scoreA, opponentScore: g.scoreB },
    { franchiseId: g.b, opponentId: g.a, season: g.season, week: g.week, label: g.label, score: g.scoreB, opponentScore: g.scoreA },
  ]);
}

function streaks(games: HistoryGame[], franchiseIds: string[], wantWins: boolean): RecordEntry[] {
  const ordered = sortChronological(games);
  const out: RecordEntry[] = [];
  franchiseIds.forEach((id) => {
    let current: HistoryGame[] = [];
    let best: HistoryGame[] = [];
    ordered.forEach((g) => {
      if (g.a !== id && g.b !== id) return;
      const winner = winnerOf(g);
      const isWin = winner === id;
      const isLoss = winner !== null && winner !== id;
      const counts = wantWins ? isWin : isLoss;
      if (counts) {
        current.push(g);
        if (current.length > best.length) best = [...current];
      } else {
        current = [];
      }
    });
    if (best.length > 0) {
      const first = best[0];
      const last = best[best.length - 1];
      out.push({
        franchiseId: id,
        season: last.season,
        week: null,
        value: best.length,
        span: `${first.season} W${first.week} to ${last.season} W${last.week}`,
      });
    }
  });
  return out;
}

export function computeRecordsBook(history: LeagueHistory): RecordCategory[] {
  const games = filterGames(history);
  const sides = sideGames(games).filter((s) => s.score > 0 || s.opponentScore > 0);
  const completed = history.seasons.flatMap((s) => (s.complete ? s.teams.map((t) => ({ ...t, season: s.season })) : []));
  const ids = history.franchises.map((f) => f.id);

  const gameEntry = (s: SideGame, value: number, other: number): RecordEntry => ({
    franchiseId: s.franchiseId,
    opponentId: s.opponentId,
    season: s.season,
    week: s.week,
    value,
    other,
    label: s.label,
  });

  const wins = sides.filter((s) => s.score > s.opponentScore);
  const margin = (s: SideGame) => s.score - s.opponentScore;
  const combinedGames = games.filter((g) => g.scoreA + g.scoreB > 0);

  const categories: RecordCategory[] = [
    {
      id: "high-score",
      title: "Highest score",
      description: "Most points by a team in a single game",
      unit: "points",
      entries: topBy(sides, (s) => s.score, "desc").map((s) => gameEntry(s, s.score, s.opponentScore)),
    },
    {
      id: "low-score",
      title: "Lowest score",
      description: "Fewest points by a team in a single game",
      unit: "points",
      entries: topBy(sides.filter((s) => s.score > 0), (s) => s.score, "asc").map((s) => gameEntry(s, s.score, s.opponentScore)),
    },
    {
      id: "blowout",
      title: "Biggest blowout",
      description: "Largest margin of victory",
      unit: "points",
      entries: topBy(wins, margin, "desc").map((s) => gameEntry(s, margin(s), s.opponentScore)),
    },
    {
      id: "nail-biter",
      title: "Closest win",
      description: "Smallest margin of victory",
      unit: "points",
      entries: topBy(wins, margin, "asc").map((s) => gameEntry(s, margin(s), s.opponentScore)),
    },
    {
      id: "shootout",
      title: "Highest-scoring game",
      description: "Most combined points in a single game",
      unit: "points",
      entries: topBy(combinedGames, (g) => g.scoreA + g.scoreB, "desc").map((g) => {
        const winnerIsA = g.scoreA >= g.scoreB;
        return {
          franchiseId: winnerIsA ? g.a : g.b,
          opponentId: winnerIsA ? g.b : g.a,
          season: g.season,
          week: g.week,
          value: g.scoreA + g.scoreB,
          other: winnerIsA ? g.scoreA : g.scoreB,
          label: g.label,
        };
      }),
    },
    {
      id: "season-pf",
      title: "Most points in a season",
      description: "Regular-season points for",
      unit: "points",
      entries: topBy(completed, (t) => t.pointsFor, "desc").map((t) => ({ franchiseId: t.franchiseId, season: t.season, week: null, value: t.pointsFor })),
    },
    {
      id: "season-pf-low",
      title: "Fewest points in a season",
      description: "Regular-season points for",
      unit: "points",
      entries: topBy(completed, (t) => t.pointsFor, "asc").map((t) => ({ franchiseId: t.franchiseId, season: t.season, week: null, value: t.pointsFor })),
    },
    {
      id: "season-wins",
      title: "Best regular season",
      description: "Most wins in a regular season",
      unit: "record",
      entries: topBy(completed, (t) => seasonWinPct(t) * 1000 + t.pointsFor / 100000, "desc").map((t) => ({
        franchiseId: t.franchiseId,
        season: t.season,
        week: null,
        value: t.wins,
        other: t.losses,
      })),
    },
    {
      id: "win-streak",
      title: "Longest win streak",
      description: "Consecutive wins across seasons, playoffs included",
      unit: "games",
      entries: topBy(streaks(games, ids, true), (e) => e.value, "desc"),
    },
    {
      id: "loss-streak",
      title: "Longest losing streak",
      description: "Consecutive losses across seasons, playoffs included",
      unit: "games",
      entries: topBy(streaks(games, ids, false), (e) => e.value, "desc"),
    },
  ];
  return categories.filter((c) => c.entries.length > 0);
}

/* ---------------------------------------------------------------- head to head */

export interface HeadToHead {
  aId: string;
  bId: string;
  aWins: number;
  bWins: number;
  ties: number;
  aPoints: number;
  bPoints: number;
  games: HistoryGame[];
  biggestWinA: HistoryGame | null;
  biggestWinB: HistoryGame | null;
  /** Current streak: positive for a, negative for b. */
  streak: number;
}

export function computeHeadToHead(games: HistoryGame[], aId: string, bId: string): HeadToHead {
  const meetings = sortChronological(games.filter((g) => (g.a === aId && g.b === bId) || (g.a === bId && g.b === aId)));
  const h2h: HeadToHead = {
    aId,
    bId,
    aWins: 0,
    bWins: 0,
    ties: 0,
    aPoints: 0,
    bPoints: 0,
    games: meetings,
    biggestWinA: null,
    biggestWinB: null,
    streak: 0,
  };
  let bestA = 0;
  let bestB = 0;
  meetings.forEach((g) => {
    const aScore = g.a === aId ? g.scoreA : g.scoreB;
    const bScore = g.a === aId ? g.scoreB : g.scoreA;
    h2h.aPoints += aScore;
    h2h.bPoints += bScore;
    if (aScore > bScore) {
      h2h.aWins++;
      if (aScore - bScore > bestA) {
        bestA = aScore - bScore;
        h2h.biggestWinA = g;
      }
      h2h.streak = h2h.streak > 0 ? h2h.streak + 1 : 1;
    } else if (bScore > aScore) {
      h2h.bWins++;
      if (bScore - aScore > bestB) {
        bestB = bScore - aScore;
        h2h.biggestWinB = g;
      }
      h2h.streak = h2h.streak < 0 ? h2h.streak - 1 : -1;
    } else {
      h2h.ties++;
      h2h.streak = 0;
    }
  });
  return h2h;
}

export interface HeadToHeadCell {
  rowId: string;
  colId: string;
  wins: number;
  losses: number;
  ties: number;
}

/** Win/loss record of each franchise (row) against each other franchise (column). */
export function computeHeadToHeadMatrix(games: HistoryGame[], franchiseIds: string[]): Map<string, HeadToHeadCell> {
  const cells = new Map<string, HeadToHeadCell>();
  const key = (r: string, c: string) => `${r}|${c}`;
  franchiseIds.forEach((r) =>
    franchiseIds.forEach((c) => {
      if (r !== c) cells.set(key(r, c), { rowId: r, colId: c, wins: 0, losses: 0, ties: 0 });
    }),
  );
  games.forEach((g) => {
    const ab = cells.get(key(g.a, g.b));
    const ba = cells.get(key(g.b, g.a));
    if (!ab || !ba) return;
    if (g.scoreA > g.scoreB) {
      ab.wins++;
      ba.losses++;
    } else if (g.scoreB > g.scoreA) {
      ba.wins++;
      ab.losses++;
    } else {
      ab.ties++;
      ba.ties++;
    }
  });
  return cells;
}

export const matrixKey = (r: string, c: string) => `${r}|${c}`;

/* ---------------------------------------------------------------- game lists */

export interface GameListEntry {
  game: HistoryGame;
  margin: number;
  combined: number;
}

export function computeGameLists(games: HistoryGame[], limit = 10) {
  const played = games.filter((g) => g.scoreA + g.scoreB > 0 && g.scoreA !== g.scoreB);
  const entries: GameListEntry[] = played.map((game) => ({
    game,
    margin: Math.abs(game.scoreA - game.scoreB),
    combined: game.scoreA + game.scoreB,
  }));
  return {
    closest: [...entries].sort((a, b) => a.margin - b.margin).slice(0, limit),
    blowouts: [...entries].sort((a, b) => b.margin - a.margin).slice(0, limit),
    highestScoring: [...entries].sort((a, b) => b.combined - a.combined).slice(0, limit),
  };
}