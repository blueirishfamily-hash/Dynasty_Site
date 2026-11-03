export interface AnalysisTeam {
  rosterId: number;
  name: string;
  initials: string;
  avatar: string | null;
  isUser: boolean;
}

export interface SimRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface ScheduleSimRow {
  rosterId: number;
  actual: SimRecord;
  /** Record this team would have had on each schedule, aligned with `teams` order. */
  results: SimRecord[];
  /** Average wins across every other team's schedule (ties count as half a win). */
  expectedWins: number;
  /** Actual wins minus expectedWins. Positive means the team was lucky. */
  luck: number;
  pointsFor: number;
}

export interface ScheduleDifficulty {
  rosterId: number;
  /** Average wins the other teams would have earned on this schedule. */
  avgWinsAllowed: number;
  /** Average points scored by this team's actual opponents. */
  avgOpponentPoints: number;
}

export interface SwapSummary {
  rosterId: number;
  scheduleRosterId: number;
  actualWins: number;
  simulatedWins: number;
  delta: number;
  actual: SimRecord;
  simulated: SimRecord;
}

export interface LuckSummary {
  rosterId: number;
  actualWins: number;
  expectedWins: number;
  luck: number;
}

export interface ScheduleSimSummary {
  toughestSchedule: ScheduleDifficulty | null;
  easiestSchedule: ScheduleDifficulty | null;
  biggestUpgrade: SwapSummary | null;
  biggestDowngrade: SwapSummary | null;
  unluckiest: LuckSummary | null;
  luckiest: LuckSummary | null;
}

export interface StandingsAnalysis {
  teams: AnalysisTeam[];
  weeks: number[];
  /** Cumulative points per roster id, one entry per element of `weeks`. */
  cumulative: Record<number, number[]>;
  /** Points scored per roster id, one entry per element of `weeks` (null if no game). */
  weeklyPoints: Record<number, Array<number | null>>;
  simulation: {
    rows: ScheduleSimRow[];
    difficulty: ScheduleDifficulty[];
  };
  summary: ScheduleSimSummary;
}
