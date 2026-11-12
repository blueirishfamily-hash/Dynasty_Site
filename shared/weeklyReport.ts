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

export interface PreviewMatchup {
  a: TeamRef & { record: string; power: number; projected: number };
  b: TeamRef & { record: string; power: number; projected: number };
  /** Probability that team A wins, 0-1. */
  probA: number;
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
  };
  preview: {
    matchups: PreviewMatchup[];
    tossUp: PreviewMatchup | null;
    biggestMismatch: PreviewMatchup | null;
    shootout: PreviewMatchup | null;
  };
  hotCold: {
    hot: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
    cold: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
    all: Array<TeamRef & { delta: number; last4: number; earlier: number }>;
  } | null;
}
