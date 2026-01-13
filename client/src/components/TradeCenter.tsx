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
import { ArrowLeftRight, Check, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Position = "QB" | "RB" | "WR" | "TE";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
}

interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalOwner?: string;
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
  salary2025: number;
  salary2026: number;
  salary2027: number;
  salary2028: number;
  salary2029: number;
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
    let contractEndYear = year;
    for (let y = year; y <= 2029; y++) {
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

  const selectedTeam = leagueTeams.find((t) => t.teamId === selectedTeamId);

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
      store[rosterIdStr][contract.playerId] = {
        salaries: {
          2025: contract.salary2025 / 10,
          2026: contract.salary2026 / 10,
          2027: contract.salary2027 / 10,
          2028: contract.salary2028 / 10,
          2029: contract.salary2029 / 10,
        },
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

  const renderAssetList = (
    players: Player[],
    picks: DraftPick[],
    selectedPlayers: Set<string>,
    selectedPicks: Set<string>,
    onTogglePlayer: (id: string) => void,
    onTogglePick: (id: string) => void,
    side: "user" | "opponent"
  ) => (
    <ScrollArea className="h-[300px]">
      <div className="space-y-1 p-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Players
        </p>
        {players.map((player) => (
          <div
            key={player.id}
            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
              selectedPlayers.has(player.id) ? "bg-primary/10" : "bg-muted/30"
            }`}
            onClick={() => onTogglePlayer(player.id)}
            data-testid={`${side}-player-${player.id}`}
          >
            <Checkbox checked={selectedPlayers.has(player.id)} />
            <Avatar className="w-7 h-7">
              <AvatarImage 
                src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`}
                alt={player.name}
              />
              <AvatarFallback className="text-xs">
                {player.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 text-sm font-medium truncate">{player.name}</span>
            <Badge className={`text-xs ${positionColors[player.position]}`}>
              {player.position}
            </Badge>
          </div>
        ))}

        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-4 mb-2">
          Draft Picks
        </p>
        {picks.map((pick) => (
          <div
            key={pick.id}
            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate ${
              selectedPicks.has(pick.id) ? "bg-primary/10" : "bg-muted/30"
            }`}
            onClick={() => onTogglePick(pick.id)}
            data-testid={`${side}-pick-${pick.id}`}
          >
            <Checkbox checked={selectedPicks.has(pick.id)} />
            <span className="flex-1 text-sm">
              {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : `${pick.round}rd`}
              {pick.originalOwner && (
                <span className="text-muted-foreground"> (via {pick.originalOwner})</span>
              )}
            </span>
            <Badge
              variant="outline"
              className={`text-xs ${
                pick.round === 1 ? "border-primary text-primary" : ""
              }`}
            >
              Rd {pick.round}
            </Badge>
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="font-heading text-lg">Trade Center</CardTitle>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-48" data-testid="select-trade-partner">
              <SelectValue placeholder="Select team" />
            </SelectTrigger>
            <SelectContent>
              {leagueTeams.map((team) => (
                <SelectItem key={team.teamId} value={team.teamId}>
                  {team.teamName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-md">
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
                <div>
                  <p className="font-medium text-sm">{userTeam.teamName}</p>
                  <p className="text-xs text-muted-foreground">Your Team</p>
                </div>
              </div>
            </div>
            {renderAssetList(
              userTeam.players,
              userTeam.draftPicks,
              selectedUserPlayers,
              selectedUserPicks,
              (id) => toggleSelection(id, selectedUserPlayers, setSelectedUserPlayers),
              (id) => toggleSelection(id, selectedUserPicks, setSelectedUserPicks),
              "user"
            )}
          </div>

          <div className="border border-border rounded-md">
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
                <div>
                  <p className="font-medium text-sm">{selectedTeam?.teamName || "Select Team"}</p>
                  <p className="text-xs text-muted-foreground">Trade Partner</p>
                </div>
              </div>
            </div>
            {selectedTeam &&
              renderAssetList(
                selectedTeam.players,
                selectedTeam.draftPicks,
                selectedTheirPlayers,
                selectedTheirPicks,
                (id) => toggleSelection(id, selectedTheirPlayers, setSelectedTheirPlayers),
                (id) => toggleSelection(id, selectedTheirPicks, setSelectedTheirPicks),
                "opponent"
              )}
          </div>
        </div>

        {hasSelection && (
          <>
            <div className="mt-4 p-4 bg-muted/30 rounded-md">
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