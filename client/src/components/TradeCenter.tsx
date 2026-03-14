import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight, Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Position = "QB" | "RB" | "WR" | "TE";

interface Player {
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

interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalOwner?: string;
  grade?: string;
  draftSlot?: number;
}

interface TeamAssets {
  teamId: string;
  teamName: string;
  teamInitials: string;
  teamAvatar?: string | null;
  players: Player[];
  draftPicks: DraftPick[];
}

interface PlayerContractData {
  salaries: Record<number, number>;
  fifthYearOption: "accepted" | "declined" | null;
  isOnIr: boolean;
  originalContractYears: number;
  isRookieContract?: boolean;
}

type ContractDataStore = Record<string, Record<string, PlayerContractData>>;

interface DbPlayerContract {
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

interface TradeCenterProps {
  userTeam: TeamAssets;
  leagueTeams: TeamAssets[];
  leagueId?: string;
  userRosterId?: number;
  getRosterId?: (teamId: string) => number | undefined;
  onProposeTrade?: (
    userAssets: { players: string[]; picks: string[] },
    theirAssets: { players: string[]; picks: string[] },
    targetTeamId: string
  ) => void;
}

const positionColors: Record<Position, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
};

const TOTAL_CAP = 250;

interface SalaryCapImpact {
  year: number;
  netChange: number;
}

// Helper function to calculate current team salary for a given year
function calculateCurrentTeamSalary(
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

function calculateSalaryCapImpactWithOpponent(
  userOutgoingPlayers: string[],
  userIncomingPlayers: string[],
  opponentOutgoingPlayers: string[],
  opponentIncomingPlayers: string[],
  userRosterId: number | undefined,
  opponentRosterId: number | undefined,
  contractData: ContractDataStore,
  currentYear: number,
  contractYears: number[],
  deadCapEnabled: boolean
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

  // Helper function to calculate dead cap for a contract year
  const getDeadCap = (
    contract: PlayerContractData,
    year: number,
    currentYear: number
  ): number => {
    if (!deadCapEnabled) return 0;

    // Find contract end year (last year with salary > 0)
    const salaryYears = Object.keys(contract.salaries || {}).map(Number).filter(y => !isNaN(y));
    const maxYear = salaryYears.length > 0 ? Math.max(...salaryYears) : year;
    let contractEndYear = year;
    for (let y = year; y <= maxYear; y++) {
      if ((contract.salaries[y] || 0) > 0) {
        contractEndYear = y;
      }
    }

    const yearsRemaining = contractEndYear - year + 1;
    const deadCapPercentages: Record<number, number> = {
      1: 0,
      2: 0.25,
      3: 0.5,
      4: 0.75,
      5: 1.0,
    };
    const deadCapPercent =
      year === currentYear
        ? 1.0 // Current year: 100% dead cap
        : deadCapPercentages[Math.min(yearsRemaining, 5)] || 0;

    const salary = contract.salaries[year] || 0;
    return salary * deadCapPercent;
  };

  // Calculate user team impact
  if (userRosterId) {
    const userRosterIdStr = userRosterId.toString();
    const userContracts = contractData[userRosterIdStr] || {};

    // User outgoing players: subtract contracts + add dead cap
    userOutgoingPlayers.forEach((playerId) => {
      const contract = userContracts[playerId];
      if (!contract) return;

      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        const deadCap = getDeadCap(contract, year, currentYear);
        const netChange = -salary + deadCap;
        userImpactByYear.set(year, (userImpactByYear.get(year) || 0) + netChange);
      });
    });
  }

  // User incoming players: add contracts from opponent roster
  if (opponentRosterId) {
    const opponentRosterIdStr = opponentRosterId.toString();
    const opponentContracts = contractData[opponentRosterIdStr] || {};

    userIncomingPlayers.forEach((playerId) => {
      const contract = opponentContracts[playerId];
      if (!contract) return;

      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        userImpactByYear.set(year, (userImpactByYear.get(year) || 0) + salary);
      });
    });
  }

  // Calculate opponent team impact
  if (opponentRosterId) {
    const opponentRosterIdStr = opponentRosterId.toString();
    const opponentContracts = contractData[opponentRosterIdStr] || {};

    // Opponent outgoing players: subtract contracts + add dead cap
    opponentOutgoingPlayers.forEach((playerId) => {
      const contract = opponentContracts[playerId];
      if (!contract) return;

      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        const deadCap = getDeadCap(contract, year, currentYear);
        const netChange = -salary + deadCap;
        opponentImpactByYear.set(
          year,
          (opponentImpactByYear.get(year) || 0) + netChange
        );
      });
    });
  }

  // Opponent incoming players: add contracts from user roster
  if (userRosterId) {
    const userRosterIdStr = userRosterId.toString();
    const userContracts = contractData[userRosterIdStr] || {};

    opponentIncomingPlayers.forEach((playerId) => {
      const contract = userContracts[playerId];
      if (!contract) return;

      contractYears.forEach((year) => {
        const salary = contract.salaries[year] || 0;
        opponentImpactByYear.set(
          year,
          (opponentImpactByYear.get(year) || 0) + salary
        );
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

export default function TradeCenter({
  userTeam,
  leagueTeams,
  leagueId,
  userRosterId,
  getRosterId,
  onProposeTrade,
}: TradeCenterProps) {
  const { season } = useSleeper();
  const currentYear = parseInt(season) || new Date().getFullYear();
  const contractYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  const [selectedTeamId, setSelectedTeamId] = useState<string>(leagueTeams[0]?.teamId || "");
  const [selectedUserPlayers, setSelectedUserPlayers] = useState<Set<string>>(new Set());
  const [selectedUserPicks, setSelectedUserPicks] = useState<Set<string>>(new Set());
  const [selectedTheirPlayers, setSelectedTheirPlayers] = useState<Set<string>>(new Set());
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<Set<string>>(new Set());
  const [positionFilterUser, setPositionFilterUser] = useState<string>("all");
  const [positionFilterOpponent, setPositionFilterOpponent] = useState<string>("all");
  const [searchUser, setSearchUser] = useState("");
  const [searchOpponent, setSearchOpponent] = useState("");

  const selectedTeam = leagueTeams.find((t) => t.teamId === selectedTeamId);

  const positionTabs = ["all", "QB", "RB", "WR", "TE", "picks"] as const;

  const teamNeeds = useMemo(() => {
    const allTeams = [userTeam, ...leagueTeams].filter(Boolean) as TeamAssets[];
    const totalTeams = allTeams.length;
    const strengthByTeamAndPos = new Map<string, number>();
    allTeams.forEach((team) => {
      (["QB", "RB", "WR", "TE"] as const).forEach((pos) => {
        const playersAtPos = team.players.filter((p) => p.position === pos);
        let strength = 0;
        if (playersAtPos.length > 0) {
          const sumValTimesStarts = playersAtPos.reduce(
            (s, p) => s + (p.tradeValue ?? 0) * (p.gamesStarted ?? 0),
            0
          );
          const sumStarts = playersAtPos.reduce(
            (s, p) => s + (p.gamesStarted ?? 0),
            0
          );
          strength =
            sumStarts > 0
              ? sumValTimesStarts / sumStarts
              : playersAtPos.reduce((s, p) => s + (p.tradeValue ?? 0), 0) /
                playersAtPos.length;
        }
        strengthByTeamAndPos.set(`${team.teamId}:${pos}`, strength);
      });
    });
    return (team: TeamAssets) => {
      return (["QB", "RB", "WR", "TE"] as const).map((pos) => {
        const myStrength = strengthByTeamAndPos.get(`${team.teamId}:${pos}`) ?? 0;
        const teamsWithLowerStrength = allTeams.filter(
          (t) => (strengthByTeamAndPos.get(`${t.teamId}:${pos}`) ?? 0) < myStrength
        ).length;
        const percentile =
          totalTeams <= 1
            ? 50
            : (teamsWithLowerStrength / (totalTeams - 1)) * 100;
        const strengthLevel =
          percentile >= 75 ? 4 : percentile >= 50 ? 3 : percentile >= 25 ? 2 : 1;
        const strengthColors = [
          "bg-red-500",
          "bg-amber-500",
          "bg-yellow-500",
          "bg-emerald-500",
        ] as const;
        return {
          pos,
          strength: strengthLevel,
          color: strengthColors[strengthLevel - 1],
        };
      });
    };
  }, [userTeam, leagueTeams]);

  // Fetch contract data
  const { data: dbContracts } = useQuery<DbPlayerContract[]>({
    queryKey: ["/api/league", leagueId, "contracts"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/contracts`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
    enabled: !!leagueId,
  });

  // Fetch dead cap enabled setting
  const { data: deadCapEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/league", leagueId, "settings", "dead-cap-enabled"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/settings/dead-cap-enabled`);
      if (!res.ok) throw new Error("Failed to fetch dead cap enabled setting");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const deadCapEnabled = deadCapEnabledData?.enabled ?? true;

  // Transform contract data
  const contractData = useMemo<ContractDataStore>(() => {
    if (!dbContracts || dbContracts.length === 0) return {};
    const store: ContractDataStore = {};
    for (const contract of dbContracts) {
      const rosterIdStr = contract.rosterId.toString();
      if (!store[rosterIdStr]) {
        store[rosterIdStr] = {};
      }
      const parsed = (() => {
        try {
          return JSON.parse(contract.salaries || "{}");
        } catch {
          return {};
        }
      })();
      const salaries: Record<number, number> = {};
      Object.entries(parsed).forEach(([year, value]) => {
        const yearNum = Number(year);
        if (!isNaN(yearNum)) {
          salaries[yearNum] = Number(value || 0) / 10;
        }
      });

      store[rosterIdStr][contract.playerId] = {
        salaries,
        fifthYearOption: contract.fifthYearOption as "accepted" | "declined" | null,
        isOnIr: contract.isOnIr === 1,
        originalContractYears: contract.originalContractYears || 0,
        isRookieContract: contract.isRookieContract === 1,
      };
    }
    return store;
  }, [dbContracts]);

  const opponentRosterId = selectedTeamId && getRosterId
    ? getRosterId(selectedTeamId)
    : undefined;

  // Calculate salary cap impact
  const capImpact = useMemo(() => {
    if (
      !leagueId ||
      !userRosterId ||
      !opponentRosterId ||
      (selectedUserPlayers.size === 0 &&
        selectedUserPicks.size === 0 &&
        selectedTheirPlayers.size === 0 &&
        selectedTheirPicks.size === 0)
    ) {
      return null;
    }

    return calculateSalaryCapImpactWithOpponent(
      Array.from(selectedUserPlayers),
      Array.from(selectedTheirPlayers),
      Array.from(selectedTheirPlayers),
      Array.from(selectedUserPlayers),
      userRosterId,
      opponentRosterId,
      contractData,
      currentYear,
      contractYears,
      deadCapEnabled
    );
  }, [
    leagueId,
    userRosterId,
    opponentRosterId,
    selectedUserPlayers,
    selectedTheirPlayers,
    contractData,
    currentYear,
    contractYears,
    deadCapEnabled,
    getRosterId,
    selectedTeamId,
  ]);

  // Calculate current and new salaries for each team
  const teamSalaries = useMemo(() => {
    if (!capImpact || !userRosterId || !opponentRosterId || !selectedTeam) return null;

    const userCurrentSalaries = contractYears.map(year => 
      calculateCurrentTeamSalary(
        userTeam.players.map(p => p.id),
        contractData,
        userRosterId,
        year
      )
    );

    const opponentCurrentSalaries = contractYears.map(year => 
      calculateCurrentTeamSalary(
        selectedTeam.players.map(p => p.id),
        contractData,
        opponentRosterId,
        year
      )
    );

    const userNewSalaries = userCurrentSalaries.map((current, index) => 
      current + capImpact.userImpact[index].netChange
    );

    const opponentNewSalaries = opponentCurrentSalaries.map((current, index) => 
      current + capImpact.opponentImpact[index].netChange
    );

    return {
      userCurrent: userCurrentSalaries,
      userNew: userNewSalaries,
      opponentCurrent: opponentCurrentSalaries,
      opponentNew: opponentNewSalaries,
    };
  }, [capImpact, userRosterId, opponentRosterId, contractData, contractYears, userTeam.players, selectedTeam]);

  const toggleSelection = (
    id: string,
    set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    const newSet = new Set(set);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setter(newSet);
  };

  const hasSelection =
    selectedUserPlayers.size > 0 ||
    selectedUserPicks.size > 0 ||
    selectedTheirPlayers.size > 0 ||
    selectedTheirPicks.size > 0;

  const clearAll = () => {
    setSelectedUserPlayers(new Set());
    setSelectedUserPicks(new Set());
    setSelectedTheirPlayers(new Set());
    setSelectedTheirPicks(new Set());
  };

  const handlePropose = () => {
    onProposeTrade?.(
      {
        players: Array.from(selectedUserPlayers),
        picks: Array.from(selectedUserPicks),
      },
      {
        players: Array.from(selectedTheirPlayers),
        picks: Array.from(selectedTheirPicks),
      },
      selectedTeamId
    );
    console.log("Trade proposed:", {
      giving: {
        players: Array.from(selectedUserPlayers),
        picks: Array.from(selectedUserPicks),
      },
      receiving: {
        players: Array.from(selectedTheirPlayers),
        picks: Array.from(selectedTheirPicks),
      },
    });
  };

  const filteredUserPlayers = useMemo(() => {
    let list = userTeam.players;
    if (positionFilterUser !== "all" && positionFilterUser !== "picks") {
      list = list.filter((p) => p.position === positionFilterUser);
    }
    if (searchUser.trim()) {
      const q = searchUser.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [userTeam.players, positionFilterUser, searchUser]);

  const filteredUserPicks = useMemo(() => {
    if (positionFilterUser !== "all" && positionFilterUser !== "picks") return [];
    return userTeam.draftPicks;
  }, [userTeam.draftPicks, positionFilterUser]);

  const filteredOpponentPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    let list = selectedTeam.players;
    if (positionFilterOpponent !== "all" && positionFilterOpponent !== "picks") {
      list = list.filter((p) => p.position === positionFilterOpponent);
    }
    if (searchOpponent.trim()) {
      const q = searchOpponent.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [selectedTeam, positionFilterOpponent, searchOpponent]);

  const filteredOpponentPicks = useMemo(() => {
    if (!selectedTeam) return [];
    if (positionFilterOpponent !== "all" && positionFilterOpponent !== "picks") return [];
    return selectedTeam.draftPicks;
  }, [selectedTeam, positionFilterOpponent]);

  const valueComparison = useMemo(() => {
    const playerValue = (p: Player | undefined) =>
      p?.tradeValue ?? (p?.positionRank != null ? Math.max(0, 100 - p.positionRank * 2) : 0);
    const userPlayerTotal = Array.from(selectedUserPlayers).reduce(
      (sum, id) => sum + playerValue(userTeam.players.find((x) => x.id === id)),
      0
    );
    const theirPlayerTotal = Array.from(selectedTheirPlayers).reduce(
      (sum, id) => sum + playerValue(selectedTeam?.players.find((x) => x.id === id)),
      0
    );
    const userPickValue = Array.from(selectedUserPicks).reduce((sum, id) => {
      const pick = userTeam.draftPicks.find((x) => x.id === id);
      const gradeVal = { "A+": 1, A: 2, "B+": 3, B: 4, "C+": 5, C: 6 }[pick?.grade ?? "C"] ?? 6;
      return sum + (7 - gradeVal);
    }, 0);
    const theirPickValue = Array.from(selectedTheirPicks).reduce((sum, id) => {
      const pick = selectedTeam?.draftPicks.find((x) => x.id === id);
      const gradeVal = { "A+": 1, A: 2, "B+": 3, B: 4, "C+": 5, C: 6 }[pick?.grade ?? "C"] ?? 6;
      return sum + (7 - gradeVal);
    }, 0);
    const userTotal = userPlayerTotal + userPickValue * 20;
    const theirTotal = theirPlayerTotal + theirPickValue * 20;
    const diff = theirTotal - userTotal;
    if (Math.abs(diff) < 5) return { label: "Even trade", bias: 0.5 };
    if (diff > 0) return { label: "You are getting the better deal", bias: 0.5 + Math.min(0.4, diff / 100) };
    return { label: "You are overpaying", bias: 0.5 - Math.min(0.4, -diff / 100) };
  }, [selectedUserPlayers, selectedTheirPlayers, selectedUserPicks, selectedTheirPicks, userTeam, selectedTeam]);

  const renderAssetList = (
    players: Player[],
    picks: DraftPick[],
    selectedPlayers: Set<string>,
    selectedPicks: Set<string>,
    onTogglePlayer: (id: string) => void,
    onTogglePick: (id: string) => void,
    side: "user" | "opponent",
    positionFilter: string,
    onPositionFilterChange: (tab: string) => void
  ) => (
    <div className="flex flex-col h-[400px]">
      <div className="flex items-center gap-2 p-2 border-b border-border">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            value={side === "user" ? searchUser : searchOpponent}
            onChange={(e) => (side === "user" ? setSearchUser(e.target.value) : setSearchOpponent(e.target.value))}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>
      <div className="flex gap-1 p-2 border-b border-border">
        {positionTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onPositionFilterChange(tab)}
            className={`px-2 py-1 rounded text-xs font-medium capitalize ${
              positionFilter === tab ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {(positionFilter === "all" || positionFilter !== "picks") && (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Players
              </p>
              {players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedPlayers.has(player.id) ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => onTogglePlayer(player.id)}
                  data-testid={`${side}-player-${player.id}`}
                >
                  <Checkbox checked={selectedPlayers.has(player.id)} />
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`} alt={player.name} />
                    <AvatarFallback className="text-xs bg-muted">
                      {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{player.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {player.team} · {player.position}
                      {player.positionRank != null && player.positionRankTotal != null && (
                        <span className="ml-1"> · {player.position}{player.positionRank}/{player.positionRankTotal}</span>
                      )}
                    </p>
                    {(player.seasonPoints != null || player.weeklyAvg != null) && (
                      <p className="text-xs text-muted-foreground">
                        {player.seasonPoints != null ? `${player.seasonPoints} pts` : ""}
                        {player.seasonPoints != null && player.weeklyAvg != null ? " · " : ""}
                        {player.weeklyAvg != null ? `${player.weeklyAvg}/wk` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {player.injuryStatus && (
                      <span
                        className="inline-flex h-2 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            player.injuryStatus.toLowerCase().includes("out") ||
                            player.injuryStatus.toLowerCase().includes("ir") ||
                            player.injuryStatus.toLowerCase().includes("pup")
                              ? "#ef4444"
                              : player.injuryStatus.toLowerCase().includes("doubtful")
                                ? "#f97316"
                                : "#eab308",
                        }}
                        title={player.injuryStatus}
                      />
                    )}
                    {player.tradeValue != null && (
                      <Badge variant="secondary" className="text-xs font-mono">
                        {Math.round(player.tradeValue)}
                      </Badge>
                    )}
                    <Badge className={`text-xs ${positionColors[player.position]}`}>
                      {player.position}
                    </Badge>
                  </div>
                </div>
              ))}
            </>
          )}
          {(positionFilter === "all" || positionFilter === "picks") && (
            <>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">
                Draft Picks
              </p>
              {picks.map((pick) => (
                <div
                  key={pick.id}
                  className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedPicks.has(pick.id) ? "bg-primary/15 ring-1 ring-primary/30" : "bg-muted/30 hover:bg-muted/50"
                  }`}
                  onClick={() => onTogglePick(pick.id)}
                  data-testid={`${side}-pick-${pick.id}`}
                >
                  <Checkbox checked={selectedPicks.has(pick.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : `${pick.round}rd`} Round
                    </p>
                    {pick.originalOwner && (
                      <p className="text-xs text-muted-foreground">via {pick.originalOwner}</p>
                    )}
                  </div>
                  {pick.grade && (
                    <Badge variant="outline" className="text-xs shrink-0 border-primary/50 text-primary">
                      {pick.grade}
                    </Badge>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="font-heading text-lg">Trade Center</CardTitle>
          <div className="flex flex-col gap-2">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-full sm:w-56" data-testid="select-trade-partner">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {leagueTeams.map((team) => (
                  <SelectItem key={team.teamId} value={team.teamId}>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        {team.teamAvatar && <AvatarImage src={team.teamAvatar} alt={team.teamName} />}
                        <AvatarFallback className="text-xs">{team.teamInitials}</AvatarFallback>
                      </Avatar>
                      {team.teamName}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  {userTeam.teamAvatar && (
                    <AvatarImage src={userTeam.teamAvatar} alt={userTeam.teamName} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {userTeam.teamInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{userTeam.teamName}</p>
                  <p className="text-xs text-muted-foreground">Your Team</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    {teamNeeds(userTeam).map(({ pos, strength, color }) => (
                      <span
                        key={pos}
                        className="flex items-center gap-0.5"
                        title={`${pos}: ${strength === 4 ? "Strong" : strength === 3 ? "Average" : strength === 2 ? "Below avg" : "Need"} vs league`}
                      >
                        {pos}
                        <span className="flex">
                          {[1, 2, 3, 4].map((i) => (
                            <span
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full mx-0.5 ${
                                i <= strength ? color : "bg-muted"
                              }`}
                            />
                          ))}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {renderAssetList(
              filteredUserPlayers,
              filteredUserPicks,
              selectedUserPlayers,
              selectedUserPicks,
              (id) => toggleSelection(id, selectedUserPlayers, setSelectedUserPlayers),
              (id) => toggleSelection(id, selectedUserPicks, setSelectedUserPicks),
              "user",
              positionFilterUser,
              setPositionFilterUser
            )}
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  {selectedTeam?.teamAvatar && (
                    <AvatarImage src={selectedTeam.teamAvatar} alt={selectedTeam.teamName} />
                  )}
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {selectedTeam?.teamInitials || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{selectedTeam?.teamName || "Select Team"}</p>
                  <p className="text-xs text-muted-foreground">Trade Partner</p>
                  {selectedTeam && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      {teamNeeds(selectedTeam).map(({ pos, strength, color }) => (
                        <span
                          key={pos}
                          className="flex items-center gap-0.5"
                          title={`${pos}: ${strength === 4 ? "Strong" : strength === 3 ? "Average" : strength === 2 ? "Below avg" : "Need"} vs league`}
                        >
                          {pos}
                          <span className="flex">
                            {[1, 2, 3, 4].map((i) => (
                              <span
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full mx-0.5 ${
                                  i <= strength ? color : "bg-muted"
                                }`}
                              />
                            ))}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {selectedTeam
              ? renderAssetList(
                  filteredOpponentPlayers,
                  filteredOpponentPicks,
                  selectedTheirPlayers,
                  selectedTheirPicks,
                  (id) => toggleSelection(id, selectedTheirPlayers, setSelectedTheirPlayers),
                  (id) => toggleSelection(id, selectedTheirPicks, setSelectedTheirPicks),
                  "opponent",
                  positionFilterOpponent,
                  setPositionFilterOpponent
                )
              : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
                  Select a trade partner
                </div>
              )}
          </div>
        </div>

        {hasSelection && (
          <>
            <div className="mt-4 p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Giving</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(selectedUserPlayers).map((id) => {
                        const p = userTeam.players.find((x) => x.id === id);
                        const val = p?.tradeValue ?? (p?.positionRank != null ? Math.max(0, 100 - p.positionRank * 2) : 0);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs"
                          >
                            <span className="truncate max-w-[80px]">{p?.name ?? "?"}</span>
                            <Badge className={`text-[10px] px-1 ${positionColors[p?.position ?? "WR"]}`}>
                              {p?.position ?? "?"}
                            </Badge>
                            <span className="font-mono">{Math.round(val)}</span>
                          </span>
                        );
                      })}
                      {Array.from(selectedUserPicks).map((id) => {
                        const pick = userTeam.draftPicks.find((x) => x.id === id);
                        const gradeVal = { "A+": 1, A: 2, "B+": 3, B: 4, "C+": 5, C: 6 }[pick?.grade ?? "C"] ?? 6;
                        const val = (7 - gradeVal) * 20;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs"
                          >
                            {pick?.year ?? "?"} R{pick?.round ?? "?"}
                            <span className="font-mono text-muted-foreground">~{Math.round(val)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Receiving</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(selectedTheirPlayers).map((id) => {
                        const p = selectedTeam?.players.find((x) => x.id === id);
                        const val = p?.tradeValue ?? (p?.positionRank != null ? Math.max(0, 100 - p.positionRank * 2) : 0);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs"
                          >
                            <span className="truncate max-w-[80px]">{p?.name ?? "?"}</span>
                            <Badge className={`text-[10px] px-1 ${positionColors[p?.position ?? "WR"]}`}>
                              {p?.position ?? "?"}
                            </Badge>
                            <span className="font-mono">{Math.round(val)}</span>
                          </span>
                        );
                      })}
                      {Array.from(selectedTheirPicks).map((id) => {
                        const pick = selectedTeam?.draftPicks.find((x) => x.id === id);
                        const gradeVal = { "A+": 1, A: 2, "B+": 3, B: 4, "C+": 5, C: 6 }[pick?.grade ?? "C"] ?? 6;
                        const val = (7 - gradeVal) * 20;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-xs"
                          >
                            {pick?.year ?? "?"} R{pick?.round ?? "?"}
                            <span className="font-mono text-muted-foreground">~{Math.round(val)}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                  <div
                    className="h-full bg-red-500/80 transition-all"
                    style={{ width: `${(1 - valueComparison.bias) * 100}%` }}
                  />
                  <div
                    className="h-full bg-green-500/80 transition-all"
                    style={{ width: `${valueComparison.bias * 100}%` }}
                  />
                </div>
                <p className="text-xs font-medium text-center">{valueComparison.label}</p>
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">Trade Summary</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Giving: {selectedUserPlayers.size + selectedUserPicks.size} assets
                    </span>
                    <span>|</span>
                    <span>
                      Receiving: {selectedTheirPlayers.size + selectedTheirPicks.size} assets
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAll}
                    data-testid="button-reset-trade"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePropose}
                    disabled={!selectedTeam}
                    data-testid="button-propose-trade"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Propose Trade
                  </Button>
                </div>
              </div>
            </div>

            {capImpact && selectedTeam && (
              <div className="mt-4 p-4 bg-muted/30 rounded-md">
                <p className="text-sm font-medium mb-3">Salary Cap Impact (Next 4 Seasons)</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Team</TableHead>
                        {contractYears.map((year) => (
                          <TableHead key={year} className="text-center">
                            {year}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">{userTeam.teamName}</TableCell>
                        {capImpact.userImpact.map((impact) => (
                          <TableCell
                            key={impact.year}
                            className={`text-center ${
                              impact.netChange > 0
                                ? "text-green-600"
                                : impact.netChange < 0
                                ? "text-red-600"
                                : ""
                            }`}
                          >
                            {impact.netChange > 0 ? "+" : ""}
                            {impact.netChange.toFixed(1)}M
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">{selectedTeam.teamName}</TableCell>
                        {capImpact.opponentImpact.map((impact) => (
                          <TableCell
                            key={impact.year}
                            className={`text-center ${
                              impact.netChange > 0
                                ? "text-green-600"
                                : impact.netChange < 0
                                ? "text-red-600"
                                : ""
                            }`}
                          >
                            {impact.netChange > 0 ? "+" : ""}
                            {impact.netChange.toFixed(1)}M
                          </TableCell>
                        ))}
                      </TableRow>
                      {teamSalaries && (
                        <>
                          <TableRow className="border-t-2 border-border">
                            <TableCell className="font-medium text-muted-foreground">
                              {userTeam.teamName} New Salary
                            </TableCell>
                            {teamSalaries.userNew.map((salary, index) => (
                              <TableCell
                                key={contractYears[index]}
                                className={`text-center font-medium ${
                                  salary > TOTAL_CAP
                                    ? "text-red-600"
                                    : salary > TOTAL_CAP * 0.9
                                    ? "text-amber-600"
                                    : "text-foreground"
                                }`}
                              >
                                ${salary.toFixed(1)}M
                                {salary > TOTAL_CAP && (
                                  <span className="text-xs block text-red-600">Over Cap</span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium text-muted-foreground">
                              {selectedTeam.teamName} New Salary
                            </TableCell>
                            {teamSalaries.opponentNew.map((salary, index) => (
                              <TableCell
                                key={contractYears[index]}
                                className={`text-center font-medium ${
                                  salary > TOTAL_CAP
                                    ? "text-red-600"
                                    : salary > TOTAL_CAP * 0.9
                                    ? "text-amber-600"
                                    : "text-foreground"
                                }`}
                              >
                                ${salary.toFixed(1)}M
                                {salary > TOTAL_CAP && (
                                  <span className="text-xs block text-red-600">Over Cap</span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Positive values indicate cap space freed, negative values indicate cap space used.
                  {deadCapEnabled && " Dead cap applies to outgoing players."}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}