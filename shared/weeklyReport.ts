/**
 * Shapes of the weekly league report. Shared by the server (which builds it)
 * and the client (which renders it to PDF).
 */

export interface TeamRef {
  rosterId: number;
  name: string;
  initials: string;
  avatar: string | null;
}

export interface Award {
  title: string;
  team: TeamRef;
  value: string;
  detail: string;
}

export interface WeekGame {
  winner: TeamRef & { points: number };
  loser: TeamRef & { points: number };
  tie: boolean;
  margin: number;
}

export interface PowerRow {
  team: TeamRef;
  rank: number;
  record: string;
  /** Average points per game this season. */
  avgPoints: number;
  /** Places gained (positive) or lost (negative) since the previous week. */
  move: number;
}

export interface SeasonRecords {
  highScore: { team: TeamRef; points: number; week: number } | null;
  lowScore: { team: TeamRef; points: number; week: number } | null;
  longestWinStreak: { team: TeamRef; length: number } | null;
  longestLossStreak: { team: TeamRef; length: number } | null;
}

export interface Storyline {
  lead: string;
  text: string;
}

export interface PreviewMatchup {
  a: TeamRef & { record: string; power: number; projected: number };
  b: TeamRef & { record: string; power: number; projected: number };
  /** Probability that team A wins, 0-1. */
  probA: number;
  /** How the two teams have met earlier this season. Fallback when `history` is null. */
  meeting: { series: string; last: string };
  /** All-time series (regular season and playoffs). Null when league history could not be loaded. */
  history?: {
    aWins: number; bWins: number; ties: number;
    aPoints: number; bPoints: number;
    /** positive = team A on a winning streak, negative = team B, 0 = none */
    streak: number;
    meetings: number;
    seasonsCovered: number;
    last: { season: string; week: number; aScore: number; bScore: number; label?: string } | null;
  } | null;
}

export interface ReportData {
  week: number;
  resultsWeek: number;
  season: string;
  leagueName: string;
  lastWeek: {
    games: WeekGame[];
    leagueAvgScore: number;
    totalPoints: number;
    gameCount: number;
    avgMargin: number;
    nailBiters: number;
    awards: Award[];
    topIndividual: Array<{ name: string; position: string; team: TeamRef; points: number }>;
    positionLeaders: Array<{ position: string; name: string; team: TeamRef; points: number }>;
    highestTeamScores: Array<TeamRef & { points: number }>;
    efficiency: Array<TeamRef & { actual: number; optimal: number; pct: number }>;
    powerRankings: PowerRow[];
    seasonRecords: SeasonRecords;
  };
  preview: {
    matchups: PreviewMatchup[];
    tossUp: PreviewMatchup | null;
    biggestMismatch: PreviewMatchup | null;
    shootout: PreviewMatchup | null;
    storylines: Storyline[];
  };
  hotCold: {
    hot: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
    cold: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
    all: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
  } | null;
}
