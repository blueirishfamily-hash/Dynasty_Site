import { useState } from "react";
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

interface PlayerContract {
  playerId: string;
  rosterId: number;
  salary2025: number;
  salary2026: number;
  salary2027: number;
  salary2028: number;
  salary2029: number;
}

interface TradeCenterProps {
  userTeam: TeamAssets;
  leagueTeams: TeamAssets[];
  contracts?: PlayerContract[];
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

interface SalaryBreakdown {
  s2025: number;
  s2026: number;
  s2027: number;
  s2028: number;
}

function SalaryImpactSection({
  userGiving,
  userReceiving,
  userTeamName,
  theirTeamName,
  userCurrentTotal,
  theirCurrentTotal,
}: {
  userGiving: SalaryBreakdown;
  userReceiving: SalaryBreakdown;
  userTeamName: string;
  theirTeamName: string;
  userCurrentTotal: SalaryBreakdown;
  theirCurrentTotal: SalaryBreakdown;
}) {
  const years = [
    { key: "s2025", label: "2025" },
    { key: "s2026", label: "2026" },
    { key: "s2027", label: "2027" },
    { key: "s2028", label: "2028" },
  ] as const;

  const userNet = {
    s2025: userReceiving.s2025 - userGiving.s2025,
    s2026: userReceiving.s2026 - userGiving.s2026,
    s2027: userReceiving.s2027 - userGiving.s2027,
    s2028: userReceiving.s2028 - userGiving.s2028,
  };

  const theirNet = {
    s2025: userGiving.s2025 - userReceiving.s2025,
    s2026: userGiving.s2026 - userReceiving.s2026,
    s2027: userGiving.s2027 - userReceiving.s2027,
    s2028: userGiving.s2028 - userReceiving.s2028,
  };

  // Calculate new totals after trade
  const userNewTotal = {
    s2025: userCurrentTotal.s2025 + userNet.s2025,
    s2026: userCurrentTotal.s2026 + userNet.s2026,
    s2027: userCurrentTotal.s2027 + userNet.s2027,
    s2028: userCurrentTotal.s2028 + userNet.s2028,
  };

  const theirNewTotal = {
    s2025: theirCurrentTotal.s2025 + theirNet.s2025,
    s2026: theirCurrentTotal.s2026 + theirNet.s2026,
    s2027: theirCurrentTotal.s2027 + theirNet.s2027,
    s2028: theirCurrentTotal.s2028 + theirNet.s2028,
  };

  const formatSalary = (val: number) => {
    if (val === 0) return "-";
    return `$${val.toFixed(1)}M`;
  };

  const formatNet = (val: number) => {
    if (val === 0) return "-";
    const sign = val > 0 ? "+" : "";
    return `${sign}$${val.toFixed(1)}M`;
  };

  const getNetColor = (val: number) => {
    if (val < 0) return "text-green-500"; // Cap relief
    if (val > 0) return "text-red-500"; // Adding salary
    return "text-muted-foreground";
  };

  const hasSalaryData = userGiving.s2025 > 0 || userGiving.s2026 > 0 || userGiving.s2027 > 0 || userGiving.s2028 > 0 ||
    userReceiving.s2025 > 0 || userReceiving.s2026 > 0 || userReceiving.s2027 > 0 || userReceiving.s2028 > 0;

  if (!hasSalaryData) {
    return null;
  }

  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-medium mb-3 flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4" />
        Salary Cap Impact
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        {/* Your Team */}
        <div className="bg-background rounded-md p-3 border">
          <p className="font-medium mb-2 text-sm">{userTeamName}</p>
          <table className="w-full">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left pb-1"></th>
                {years.map((y) => (
                  <th key={y.key} className="text-right pb-1 font-normal">{y.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td className="text-muted-foreground py-0.5">Current</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-muted-foreground">{formatSalary(userCurrentTotal[y.key])}</td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground py-0.5">Giving</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-red-400">{formatSalary(userGiving[y.key])}</td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground py-0.5">Getting</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-green-400">{formatSalary(userReceiving[y.key])}</td>
                ))}
              </tr>
              <tr className="border-t border-border">
                <td className="text-muted-foreground pt-1">Net</td>
                {years.map((y) => (
                  <td key={y.key} className={`text-right pt-1 ${getNetColor(userNet[y.key])}`}>
                    {formatNet(userNet[y.key])}
                  </td>
                ))}
              </tr>
              <tr className="bg-muted/50">
                <td className="font-semibold py-1">New Total</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right font-semibold py-1">
                    {formatSalary(userNewTotal[y.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Their Team */}
        <div className="bg-background rounded-md p-3 border">
          <p className="font-medium mb-2 text-sm">{theirTeamName}</p>
          <table className="w-full">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left pb-1"></th>
                {years.map((y) => (
                  <th key={y.key} className="text-right pb-1 font-normal">{y.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                <td className="text-muted-foreground py-0.5">Current</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-muted-foreground">{formatSalary(theirCurrentTotal[y.key])}</td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground py-0.5">Giving</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-red-400">{formatSalary(userReceiving[y.key])}</td>
                ))}
              </tr>
              <tr>
                <td className="text-muted-foreground py-0.5">Getting</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right text-green-400">{formatSalary(userGiving[y.key])}</td>
                ))}
              </tr>
              <tr className="border-t border-border">
                <td className="text-muted-foreground pt-1">Net</td>
                {years.map((y) => (
                  <td key={y.key} className={`text-right pt-1 ${getNetColor(theirNet[y.key])}`}>
                    {formatNet(theirNet[y.key])}
                  </td>
                ))}
              </tr>
              <tr className="bg-muted/50">
                <td className="font-semibold py-1">New Total</td>
                {years.map((y) => (
                  <td key={y.key} className="text-right font-semibold py-1">
                    {formatSalary(theirNewTotal[y.key])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        <span className="text-green-500">Green = cap relief</span> • <span className="text-red-500">Red = added salary</span>
      </p>
    </div>
  );
}

export default function TradeCenter({
  userTeam,
  leagueTeams,
  contracts = [],
  onProposeTrade,
}: TradeCenterProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(leagueTeams[0]?.teamId || "");
  const [selectedUserPlayers, setSelectedUserPlayers] = useState<Set<string>>(new Set());
  const [selectedUserPicks, setSelectedUserPicks] = useState<Set<string>>(new Set());
  const [selectedTheirPlayers, setSelectedTheirPlayers] = useState<Set<string>>(new Set());
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<Set<string>>(new Set());

  const selectedTeam = leagueTeams.find((t) => t.teamId === selectedTeamId);

  // Create a map of playerId -> contract for quick lookup
  const contractMap = new Map<string, PlayerContract>();
  contracts.forEach((c) => contractMap.set(c.playerId, c));

  // Get current year salary for a player
  const getPlayerSalary = (playerId: string): number => {
    const contract = contractMap.get(playerId);
    if (!contract) return 0;
    return contract.salary2025 / 10; // Convert from stored value to millions
  };

  // Get full salary breakdown for a player
  const getPlayerSalaryBreakdown = (playerId: string) => {
    const contract = contractMap.get(playerId);
    if (!contract) return { s2025: 0, s2026: 0, s2027: 0, s2028: 0 };
    return {
      s2025: contract.salary2025 / 10,
      s2026: contract.salary2026 / 10,
      s2027: contract.salary2027 / 10,
      s2028: contract.salary2028 / 10,
    };
  };

  // Calculate total salary for selected players
  const calculateSalaryImpact = (playerIds: Set<string>) => {
    let s2025 = 0, s2026 = 0, s2027 = 0, s2028 = 0;
    playerIds.forEach((id) => {
      const breakdown = getPlayerSalaryBreakdown(id);
      s2025 += breakdown.s2025;
      s2026 += breakdown.s2026;
      s2027 += breakdown.s2027;
      s2028 += breakdown.s2028;
    });
    return { s2025, s2026, s2027, s2028 };
  };

  // Calculate total salary for a team's entire roster
  const calculateTeamTotal = (players: Player[]) => {
    let s2025 = 0, s2026 = 0, s2027 = 0, s2028 = 0;
    players.forEach((player) => {
      const breakdown = getPlayerSalaryBreakdown(player.id);
      s2025 += breakdown.s2025;
      s2026 += breakdown.s2026;
      s2027 += breakdown.s2027;
      s2028 += breakdown.s2028;
    });
    return { s2025, s2026, s2027, s2028 };
  };

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
        {players.map((player) => {
          const salary = getPlayerSalary(player.id);
          return (
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
              {salary > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  ${salary.toFixed(1)}M
                </span>
              )}
              <Badge className={`text-xs ${positionColors[player.position]}`}>
                {player.position}
              </Badge>
            </div>
          );
        })}

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
              {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`}
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
          <div className="mt-4 p-4 bg-muted/30 rounded-md space-y-4">
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

            {/* Salary Impact Section */}
            {(selectedUserPlayers.size > 0 || selectedTheirPlayers.size > 0) && (
              <SalaryImpactSection
                userGiving={calculateSalaryImpact(selectedUserPlayers)}
                userReceiving={calculateSalaryImpact(selectedTheirPlayers)}
                userTeamName={userTeam.teamName}
                theirTeamName={selectedTeam?.teamName || "Trade Partner"}
                userCurrentTotal={calculateTeamTotal(userTeam.players)}
                theirCurrentTotal={selectedTeam ? calculateTeamTotal(selectedTeam.players) : { s2025: 0, s2026: 0, s2027: 0, s2028: 0 }}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}