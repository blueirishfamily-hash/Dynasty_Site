export type RadarCategory = "passYards" | "passTds" | "rushYards" | "rushTds" | "receptions";

export const RADAR_CATEGORIES: ReadonlyArray<{ key: RadarCategory; label: string; statKey: string }> = [
  { key: "passYards", label: "Pass Yards", statKey: "pass_yd" },
  { key: "passTds", label: "Pass TDs", statKey: "pass_td" },
  { key: "rushYards", label: "Rush Yards", statKey: "rush_yd" },
  { key: "rushTds", label: "Rush TDs", statKey: "rush_td" },
  { key: "receptions", label: "Receptions", statKey: "rec" },
];

export interface PreviewTeam {
  rosterId: number;
  name: string;
  initials: string;
  avatar: string | null;
}

export interface RadarTeamStats {
  rosterId: number;
  /** Season totals produced by this team's started players. */
  totals: Record<RadarCategory, number>;
  /** 1 = best in the league. */
  leagueRank: Record<RadarCategory, number>;
  /** Total as a percentage of the league-best total for that category (0-100). */
  pctOfLeagueBest: Record<RadarCategory, number>;
}

export interface WeekResult {
  week: number;
  points: number;
  opponentPoints: number;
  /** points - opponentPoints */
  margin: number;
  result: "W" | "L" | "T";
}

export interface HeadToHeadMeeting {
  season: string;
  week: number;
  teamAPoints: number;
  teamBPoints: number;
  winner: "A" | "B" | "T";
  /** Winner's margin of victory (0 for ties). */
  margin: number;
}

export interface HeadToHeadSummary {
  games: number;
  teamAWins: number;
  teamBWins: number;
  ties: number;
  teamAAvgScore: number;
  teamBAvgScore: number;
  /** Average of (A - B) across meetings. Positive favors team A. */
  avgMarginForA: number;
  teamABiggestWin: HeadToHeadMeeting | null;
  teamBBiggestWin: HeadToHeadMeeting | null;
  /** Current streak: who won the most recent consecutive meetings. */
  streak: { winner: "A" | "B"; count: number } | null;
}

export interface MatchupPreviewData {
  teamA: PreviewTeam;
  teamB: PreviewTeam;
  /** Completed regular-season weeks used for the season stats. */
  weeks: number[];
  leagueSize: number;
  radar: {
    teamA: RadarTeamStats;
    teamB: RadarTeamStats;
    gamesPlayed: number;
  };
  form: {
    teamA: WeekResult[];
    teamB: WeekResult[];
  };
  headToHead: {
    meetings: HeadToHeadMeeting[];
    summary: HeadToHeadSummary;
    seasonsSearched: string[];
  };
}
