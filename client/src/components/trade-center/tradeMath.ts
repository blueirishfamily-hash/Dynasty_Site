import { DEFAULT_DEAD_CAP_SHARES, type DeadCapShares } from "@shared/contractRules";

export type Position = "QB" | "RB" | "WR" | "TE";

export interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
  seasonPoints?: number | null;
  weeklyAvg?: number | null;
  positionRank?: number | null;
  positionRankTotal?: number | null;
  age?: number | null;
  yearsExp?: number | null;
  injuryStatus?: string | null;
  tradeValue?: number | null;
  gamesStarted?: number | null;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalOwner?: string;
  grade?: string;
  draftSlot?: number;
}

export interface TeamAssets {
  teamId: string;
  teamName: string;
  teamInitials: string;
  teamAvatar?: string | null;
  players: Player[];
  draftPicks: DraftPick[];
}

export interface PlayerContractData {
  salaries: Record<number, number>;
  fifthYearOption: "accepted" | "declined" | null;
  isOnIr: boolean;
  originalContractYears: number;
  isRookieContract?: boolean;
}

export type ContractDataStore = Record<string, Record<string, PlayerContractData>>;

export interface DbPlayerContract {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  salaries: string;
  fifthYearOption: string | null;
  isOnIr: number;
  originalContractYears: number;
  isRookieContract: number;
  updatedAt: number;
}

export interface SalaryCapImpact {
  year: number;
  netChange: number;
}

// Current team salary for a given year.
export function calculateCurrentTeamSalary(
  playerIds: string[],
  contractData: ContractDataStore,
  rosterId: number | undefined,
  year: number
): number {
  if (!rosterId || !playerIds || playerIds.length === 0) return 0;

  const rosterIdStr = rosterId.toString();
  const teamContracts = contractData[rosterIdStr] || {};

  return playerIds.reduce((sum, playerId) => {
    const contract = teamContracts[playerId];
    return sum + (contract?.salaries?.[year] || 0);
  }, 0);
}

export function calculateSalaryCapImpactWithOpponent(
  userOutgoingPlayers: string[],
  userIncomingPlayers: string[],
  opponentOutgoingPlayers: string[],
  opponentIncomingPlayers: string[],
  userRosterId: number | undefined,
  opponentRosterId: number | undefined,
  contractData: ContractDataStore,
  currentYear: number,
  contractYears: number[],
  deadCapEnabled: boolean,
  deadCapShares: DeadCapShares = DEFAULT_DEAD_CAP_SHARES
): {
  userImpact: SalaryCapImpact[];
  opponentImpact: SalaryCapImpact[];
} {
  const userImpactByYear = new Map<number, number>();
  const opponentImpactByYear = new Map<number, number>();
  contractYears.forEach((year) => {
    userImpactByYear.set(year, 0);
    opponentImpactByYear.set(year, 0);
  });

  // Dead cap for a contract year
  const getDeadCap = (
    contract: PlayerContractData,
    year: number,
    currentYear: number
  ): number => {
    if (!deadCapEnabled) return 0;

    // Find contract end year (last year with salary > 0)
    const salaryYears = Object.keys(contract.salaries || {}).map(Number).filter((y) => !isNaN(y));
    const maxYear = salaryYears.length > 0 ? Math.max(...salaryYears) : year;
    let contractEndYear = year;
    for (let y = year; y <= maxYear; y++) {
      if ((contract.salaries[y] || 0) > 0) {
        contractEndYear = y;
      }
    }

    const yearsRemaining = contractEndYear - year + 1;
    // The league's dead cap share by years left (ATL: 0/25/50/75/100%).
    const deadCapPercent =
      year === currentYear
        ? 1.0 // Current year: 100% dead cap
        : yearsRemaining >= 5
          ? deadCapShares["5plus"]
          : deadCapShares[String(Math.max(1, yearsRemaining)) as "1" | "2" | "3" | "4"] ?? 0;

    const salary = contract.salaries[year] || 0;
    return salary * deadCapPercent;
  };

  // User outgoing players: subtract contracts + add dead cap
  if (userRosterId) {
    const userContracts = contractData[userRosterId.toString()] || {};
    userOutgoingPlayers.forEach((playerId) => {
      const contract = userContracts[playerId];
      if (!contract) return;
      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        const deadCap = getDeadCap(contract, year, currentYear);
        userImpactByYear.set(year, (userImpactByYear.get(year) || 0) + (-salary + deadCap));
      });
    });
  }

  // User incoming players: add contracts from opponent roster
  if (opponentRosterId) {
    const opponentContracts = contractData[opponentRosterId.toString()] || {};
    userIncomingPlayers.forEach((playerId) => {
      const contract = opponentContracts[playerId];
      if (!contract) return;
      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        userImpactByYear.set(year, (userImpactByYear.get(year) || 0) + salary);
      });
    });
  }

  // Opponent outgoing players: subtract contracts + add dead cap
  if (opponentRosterId) {
    const opponentContracts = contractData[opponentRosterId.toString()] || {};
    opponentOutgoingPlayers.forEach((playerId) => {
      const contract = opponentContracts[playerId];
      if (!contract) return;
      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        const deadCap = getDeadCap(contract, year, currentYear);
        opponentImpactByYear.set(
          year,
          (opponentImpactByYear.get(year) || 0) + (-salary + deadCap)
        );
      });
    });
  }

  // Opponent incoming players: add contracts from user roster
  if (userRosterId) {
    const userContracts = contractData[userRosterId.toString()] || {};
    opponentIncomingPlayers.forEach((playerId) => {
      const contract = userContracts[playerId];
      if (!contract) return;
      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        opponentImpactByYear.set(year, (opponentImpactByYear.get(year) || 0) + salary);
      });
    });
  }

  return {
    userImpact: contractYears.map((year) => ({
      year,
      netChange: userImpactByYear.get(year) || 0,
    })),
    opponentImpact: contractYears.map((year) => ({
      year,
      netChange: opponentImpactByYear.get(year) || 0,
    })),
  };
}

// Trade value for a player: the stored trade value, else a rank-based fallback.
export function playerTradeValue(p: Player | undefined): number {
  return p?.tradeValue ?? (p?.positionRank != null ? Math.max(0, 100 - p.positionRank * 2) : 0);
}

const GRADE_SCORE: Record<string, number> = { "A+": 1, A: 2, "B+": 3, B: 4, "C+": 5, C: 6 };

// Approximate trade value for a draft pick, from its grade (A+ = 120 ... C = 20).
export function pickTradeValue(pick: DraftPick | undefined): number {
  const gradeVal = GRADE_SCORE[pick?.grade ?? "C"] ?? 6;
  return (7 - gradeVal) * 20;
}

export interface ValueComparison {
  label: string;
  /** Share of the bar that belongs to "you get" (0.1 to 0.9). */
  bias: number;
  giveTotal: number;
  getTotal: number;
}

export function compareTradeValue(
  give: { players: (Player | undefined)[]; picks: (DraftPick | undefined)[] },
  get: { players: (Player | undefined)[]; picks: (DraftPick | undefined)[] }
): ValueComparison {
  const sum = (side: typeof give) =>
    side.players.reduce((s, p) => s + playerTradeValue(p), 0) +
    side.picks.reduce((s, p) => s + pickTradeValue(p), 0);
  const giveTotal = sum(give);
  const getTotal = sum(get);
  const diff = getTotal - giveTotal;
  if (Math.abs(diff) < 5) return { label: "Even trade", bias: 0.5, giveTotal, getTotal };
  if (diff > 0) {
    return {
      label: "You are getting the better deal",
      bias: 0.5 + Math.min(0.4, diff / 100),
      giveTotal,
      getTotal,
    };
  }
  return {
    label: "You are overpaying",
    bias: 0.5 - Math.min(0.4, -diff / 100),
    giveTotal,
    getTotal,
  };
}

export function pickLabel(pick: DraftPick): string {
  return `${pick.year} R${pick.round}`;
}

/** Years (from `fromYear`) with a salary on the contract, or null if no contract is known. */
export function contractSummary(
  contract: PlayerContractData | undefined,
  fromYear: number
): { salary: number; yearsLeft: number } | null {
  if (!contract) return null;
  const years = Object.entries(contract.salaries)
    .map(([y, v]) => [Number(y), v] as const)
    .filter(([y, v]) => !isNaN(y) && y >= fromYear && v > 0);
  return {
    salary: contract.salaries[fromYear] || 0,
    yearsLeft: years.length,
  };
}
