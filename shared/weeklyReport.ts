export interface WeeklyReportTeam {
  rosterId: number;
  name: string;
  initials: string;
  /** PNG/JPEG data URI so the PDF renders without cross-origin image fetches. */
  avatar: string | null;
  isUser: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  division?: number;
}

export interface RecapGame {
  matchupId: number;
  team1: number;
  team2: number;
  score1: number;
  score2: number;
  winner: number | null;
  margin: number;
  optimal1: number | null;
  optimal2: number | null;
}

export interface GameCallout {
  matchupId: number;
  rosterId: number;
  opponentId: number;
  points: number;
  opponentPoints: number;
}

export interface RecapCallouts {
  highestScore: GameCallout | null;
  lowestScore: GameCallout | null;
  closestGame: GameCallout | null;
  biggestBlowout: GameCallout | null;
  unluckiestLoss: GameCallout | null;
  luckiestWin: GameCallout | null;
}

export interface HighPerformerPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  rosterId: number;
  points: number;
}

export interface TeamEfficiency {
  rosterId: number;
  points: number;
  optimalPoints: number;
  /** points / optimalPoints, 0-1 */
  efficiency: number;
}

export interface TeamTrend {
  rosterId: number;
  recentAvg: number;
  earlierAvg: number;
  difference: number;
  recentWeeks: number;
}

export interface WeeklyHighPerformers {
  topPlayers: HighPerformerPlayer[];
  positionLeaders: HighPerformerPlayer[];
  topTeamScores: Array<{ rosterId: number; points: number }>;
  efficiency: TeamEfficiency[];
  hot: TeamTrend[];
  cold: TeamTrend[];
}

export interface PreviewGame {
  matchupId: number;
  team1: number;
  team2: number;
  /** Present once the week has started producing points. */
  score1: number | null;
  score2: number | null;
}

export interface ReportSeed {
  rosterId: number;
  seed: number;
  isDivisionWinner: boolean;
  division?: number;
}

export interface WeeklyReportData {
  league: { name: string; season: string };
  generatedAt: string;
  week: number;
  recapWeek: number | null;
  previewWeek: number;
  phase: "regular" | "playoffs" | "complete";
  previewHasScores: boolean;
  /** True when the preview week is already over (historical week or completed season). */
  previewFinal: boolean;
  /** The league's current week; standings and playoff odds always reflect this point in time. */
  currentWeek: number;
  /** Standard deviation of a single team's weekly score, used for win probability. */
  scoreStdDev: number;
  teams: Record<number, WeeklyReportTeam>;
  recap: { games: RecapGame[]; callouts: RecapCallouts } | null;
  highPerformers: WeeklyHighPerformers | null;
  preview: { games: PreviewGame[] };
  seeding: {
    hasDivisions: boolean;
    playoffTeams: number;
    seeds: ReportSeed[];
    divisions: Array<{ division: number; name: string; rosterIds: number[] }>;
  };
}
