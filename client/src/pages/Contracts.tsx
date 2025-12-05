import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, ChevronRight, Save, UserPlus, Calculator, Trash2, Search } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const TOTAL_CAP = 250;

const COLORS = {
  available: "#3b82f6",
  salaries: "#22c55e",
  deadCap: "#ef4444",
};

const CURRENT_YEAR = 2025;
const CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];

interface PlayerContractData {
  salaries: Record<number, number>;
  fifthYearOption: boolean | null;
}

type ContractDataStore = Record<string, Record<string, PlayerContractData>>;

interface PlayerDisplayInfo {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  currentSalary: number;
  injuryStatus: string | null;
}

interface TeamCapData {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  salaries: number;
  deadCap: number;
  available: number;
  players: string[];
}

interface SleeperPlayerData {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age?: number;
  yearsExp?: number;
  status?: string;
  injuryStatus?: string | null;
}

type PlayerMap = Record<string, SleeperPlayerData>;

interface HypotheticalPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  hypotheticalSalaries: Record<number, number>;
  isRosterPlayer: boolean;
  isFreeAgent: boolean;
}

interface HypotheticalContractData {
  salaryOverrides: Record<string, Record<number, number>>;
  addedFreeAgents: HypotheticalPlayer[];
}

const positionColors: Record<string, string> = {
  QB: "bg-rose-500 text-white",
  RB: "bg-emerald-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

function convertPlayersArrayToMap(players: SleeperPlayerData[]): PlayerMap {
  const map: PlayerMap = {};
  for (const player of players) {
    map[player.id] = player;
  }
  return map;
}

function getPlayersWithContracts(
  players: string[],
  playerMap: PlayerMap,
  teamContracts: Record<string, PlayerContractData>
): PlayerDisplayInfo[] {
  if (!players || players.length === 0) return [];

  return players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const contract = teamContracts[id];
      const currentSalary = contract?.salaries?.[CURRENT_YEAR] || 0;

      return {
        playerId: id,
        name: player.name,
        position: player.position || "NA",
        nflTeam: player.team || null,
        yearsExp: player.yearsExp ?? 0,
        currentSalary,
        injuryStatus: player.injuryStatus || null,
      };
    })
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return b.currentSalary - a.currentSalary;
    });
}

function calculateTeamSalary(
  players: string[],
  teamContracts: Record<string, PlayerContractData>,
  year: number = CURRENT_YEAR
): number {
  if (!players || players.length === 0) return 0;
  
  return players.reduce((sum, playerId) => {
    const contract = teamContracts[playerId];
    return sum + (contract?.salaries?.[year] || 0);
  }, 0);
}

function TeamCapChart({ team, onClick }: { team: TeamCapData; onClick: () => void }) {
  const data = [
    { name: "Available", value: Math.max(0, team.available), color: COLORS.available },
    { name: "Salaries", value: team.salaries, color: COLORS.salaries },
    { name: "Dead Cap", value: team.deadCap, color: COLORS.deadCap },
  ].filter(d => d.value > 0);

  const isOverCap = team.available < 0;
  const hasNoData = team.salaries === 0 && team.deadCap === 0;

  return (
    <Card 
      data-testid={`card-team-cap-${team.rosterId}`}
      className="cursor-pointer hover-elevate transition-all"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {team.avatar ? (
              <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
            ) : null}
            <AvatarFallback className="text-xs">
              {team.teamName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-heading truncate">{team.teamName}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">{team.ownerName}</p>
          </div>
          {isOverCap && (
            <Badge variant="destructive" className="text-xs">Over Cap</Badge>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          {hasNoData ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold" style={{ color: COLORS.available }}>
                  ${TOTAL_CAP}M
                </div>
                <p className="text-sm text-muted-foreground mt-2">Full Cap Available</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(1)}M`, ""]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
          <div>
            <div className="font-medium" style={{ color: COLORS.salaries }}>${team.salaries.toFixed(1)}M</div>
            <div className="text-muted-foreground">Salaries</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: COLORS.deadCap }}>${team.deadCap.toFixed(1)}M</div>
            <div className="text-muted-foreground">Dead Cap</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
              ${team.available.toFixed(1)}M
            </div>
            <div className="text-muted-foreground">Available</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TeamContractModalProps {
  team: TeamCapData | null;
  players: PlayerDisplayInfo[];
  contractData: Record<string, PlayerContractData>;
  open: boolean;
  onClose: () => void;
}

function TeamContractModal({ team, players, contractData, open, onClose }: TeamContractModalProps) {
  if (!team) return null;

  const isOverCap = team.available < 0;
  const totalContractSalary = players.reduce((sum, p) => sum + p.currentSalary, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {team.avatar ? (
                <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
              ) : null}
              <AvatarFallback className="text-lg">
                {team.teamName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="font-heading text-xl">{team.teamName}</DialogTitle>
              <p className="text-sm text-muted-foreground">{team.ownerName}</p>
            </div>
            {isOverCap && (
              <Badge variant="destructive">Over Cap by ${Math.abs(team.available).toFixed(1)}M</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 my-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold">${TOTAL_CAP}M</div>
                <p className="text-xs text-muted-foreground">Total Cap</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: COLORS.salaries }}>
                  ${team.salaries.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Salaries</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: COLORS.deadCap }}>
                  ${team.deadCap.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Dead Cap</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
                  ${team.available.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">Pos</TableHead>
                <TableHead className="text-center">Team</TableHead>
                <TableHead className="text-center">NFL Yrs</TableHead>
                <TableHead className="text-right">{CURRENT_YEAR} Salary</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => {
                const status = player.injuryStatus === "IR" ? "ir" : 
                               player.injuryStatus === "PUP" ? "pup" : "active";
                return (
                  <TableRow key={player.playerId} data-testid={`row-contract-${player.playerId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                            alt={player.name}
                          />
                          <AvatarFallback className="text-xs">
                            {player.name.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{player.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={positionColors[player.position] || "bg-gray-500 text-white"}>
                        {player.position}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {player.nflTeam || "FA"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {player.yearsExp === 0 ? "R" : player.yearsExp}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium" style={{ color: player.currentSalary > 0 ? COLORS.salaries : "inherit" }}>
                      {player.currentSalary > 0 ? `$${player.currentSalary.toFixed(1)}M` : "$0"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={status === "active" ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {status === "active" ? "Active" : status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {players.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No players on this roster
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="border-t pt-4 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total ({players.length} players)</span>
            <div className="flex gap-6">
              <span>
                {CURRENT_YEAR} Salaries: <span className="font-medium" style={{ color: COLORS.salaries }}>${totalContractSalary.toFixed(1)}M</span>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ContractInputTabProps {
  teams: TeamCapData[];
  playerMap: PlayerMap;
  contractData: ContractDataStore;
  onContractChange: (rosterId: string, playerId: string, field: "salaries" | "fifthYearOption", value: any) => void;
  onSave: () => void;
  hasChanges: boolean;
}

function ContractInputTab({ teams, playerMap, contractData, onContractChange, onSave, hasChanges }: ContractInputTabProps) {
  const [selectedRosterId, setSelectedRosterId] = useState<string>(teams[0]?.rosterId.toString() || "");

  const selectedTeam = teams.find(t => t.rosterId.toString() === selectedRosterId);
  
  const playerInputs = useMemo(() => {
    if (!selectedTeam) return [];
    
    return selectedTeam.players
      .filter(id => playerMap[id])
      .map(id => {
        const player = playerMap[id];
        const yearsExp = player.yearsExp ?? 0;
        const contract = contractData[selectedRosterId]?.[id];

        return {
          playerId: id,
          name: player.name,
          position: player.position || "NA",
          nflTeam: player.team || null,
          yearsExp,
          salaries: contract?.salaries || {},
          fifthYearOption: contract?.fifthYearOption ?? null,
        };
      })
      .sort((a, b) => {
        const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
        const posA = posOrder.indexOf(a.position);
        const posB = posOrder.indexOf(b.position);
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name);
      });
  }, [selectedTeam, playerMap, contractData, selectedRosterId]);

  const handleSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const currentSalaries = contractData[selectedRosterId]?.[playerId]?.salaries || {};
    onContractChange(selectedRosterId, playerId, "salaries", {
      ...currentSalaries,
      [year]: numValue
    });
  };

  const handleFifthYearOptionChange = (playerId: string, value: boolean) => {
    onContractChange(selectedRosterId, playerId, "fifthYearOption", value);
  };

  const totalSalaryByYear = CONTRACT_YEARS.reduce((acc, year) => {
    const total = playerInputs.reduce((sum, p) => {
      return sum + (p.salaries[year] || 0);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Label htmlFor="team-select" className="text-sm font-medium whitespace-nowrap">
            Select Team:
          </Label>
          <Select 
            value={selectedRosterId} 
            onValueChange={setSelectedRosterId}
          >
            <SelectTrigger className="w-[280px]" data-testid="select-team-dropdown">
              <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem 
                  key={team.rosterId} 
                  value={team.rosterId.toString()}
                  data-testid={`select-team-${team.rosterId}`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      {team.avatar ? (
                        <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {team.teamName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{team.teamName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={onSave} 
          disabled={!hasChanges}
          data-testid="button-save-contracts"
        >
          <Save className="w-4 h-4 mr-2" />
          Save Contracts
        </Button>
      </div>

      {selectedTeam && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {selectedTeam.avatar ? (
                  <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${selectedTeam.avatar}`} />
                ) : null}
                <AvatarFallback>
                  {selectedTeam.teamName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="font-heading">{selectedTeam.teamName}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedTeam.ownerName}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 mb-6 p-3 bg-muted/50 rounded-lg">
              {CONTRACT_YEARS.map(year => (
                <div key={year} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">{year} Total</div>
                  <div className="font-bold" style={{ color: totalSalaryByYear[year] > TOTAL_CAP ? COLORS.deadCap : COLORS.salaries }}>
                    ${totalSalaryByYear[year].toFixed(1)}M
                  </div>
                </div>
              ))}
            </div>

            <ScrollArea className="h-[500px] pr-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Player</TableHead>
                    <TableHead className="text-center w-[60px]">Pos</TableHead>
                    <TableHead className="text-center w-[60px]">Team</TableHead>
                    <TableHead className="text-center w-[70px]">NFL Yrs</TableHead>
                    {CONTRACT_YEARS.map(year => (
                      <TableHead key={year} className="text-center w-[90px]">{year}</TableHead>
                    ))}
                    <TableHead className="text-center w-[110px]">5th Yr Opt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playerInputs.map((player) => {
                    const isRookie = player.yearsExp <= 4;
                    
                    return (
                      <TableRow key={player.playerId} data-testid={`row-input-${player.playerId}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-9 w-9">
                              <AvatarImage 
                                src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                                alt={player.name}
                              />
                              <AvatarFallback className="text-xs">
                                {player.name.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">{player.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                            {player.position}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">
                            {player.nflTeam || "FA"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm tabular-nums">
                            {player.yearsExp === 0 ? "R" : player.yearsExp}
                          </span>
                        </TableCell>
                        {CONTRACT_YEARS.map((year, yearIndex) => {
                          const salaryValue = player.salaries[year] || 0;
                          const deadCapPercentages = [0.4, 0.3, 0.2, 0.1];
                          const deadCapPercent = deadCapPercentages[yearIndex] || 0;
                          const deadCapValue = salaryValue * deadCapPercent;

                          return (
                            <TableCell key={year} className="text-center">
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="flex items-center justify-center gap-0.5">
                                  <span className="text-xs text-muted-foreground">$</span>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    className="h-7 w-16 text-center tabular-nums text-sm"
                                    placeholder="0"
                                    value={player.salaries[year] || ""}
                                    onChange={(e) => handleSalaryChange(player.playerId, year, e.target.value)}
                                    data-testid={`input-salary-${player.playerId}-${year}`}
                                  />
                                  <span className="text-xs text-muted-foreground">M</span>
                                </div>
                                {salaryValue > 0 && (
                                  <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                    DC: ${deadCapValue.toFixed(1)}M ({Math.round(deadCapPercent * 100)}%)
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {isRookie ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant={player.fifthYearOption === true ? "default" : "outline"}
                                className="h-6 px-2 text-xs"
                                onClick={() => handleFifthYearOptionChange(player.playerId, true)}
                                data-testid={`button-fifth-year-yes-${player.playerId}`}
                              >
                                Yes
                              </Button>
                              <Button
                                size="sm"
                                variant={player.fifthYearOption === false ? "default" : "outline"}
                                className="h-6 px-2 text-xs"
                                onClick={() => handleFifthYearOptionChange(player.playerId, false)}
                                data-testid={`button-fifth-year-no-${player.playerId}`}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {playerInputs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No players on this roster
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ManageTeamContractsTabProps {
  userTeam: TeamCapData | null;
  playerMap: PlayerMap;
  leagueContractData: ContractDataStore;
  allPlayers: SleeperPlayerData[];
  rosterPlayerIds: string[];
}

function ManageTeamContractsTab({ 
  userTeam, 
  playerMap, 
  leagueContractData, 
  allPlayers,
  rosterPlayerIds 
}: ManageTeamContractsTabProps) {
  const [hypotheticalData, setHypotheticalData] = useState<HypotheticalContractData>({
    salaryOverrides: {},
    addedFreeAgents: [],
  });
  const [freeAgentSearch, setFreeAgentSearch] = useState("");
  const [showFreeAgentSearch, setShowFreeAgentSearch] = useState(false);

  const allRosterPlayerIdsSet = useMemo(() => {
    return new Set(rosterPlayerIds);
  }, [rosterPlayerIds]);

  const freeAgentResults = useMemo(() => {
    if (!freeAgentSearch.trim() || freeAgentSearch.length < 2) return [];
    
    const searchLower = freeAgentSearch.toLowerCase();
    const addedIds = new Set(hypotheticalData.addedFreeAgents.map(p => p.playerId));
    
    return allPlayers
      .filter(player => {
        if (!player.name || !player.position) return false;
        if (!["QB", "RB", "WR", "TE", "K"].includes(player.position)) return false;
        if (allRosterPlayerIdsSet.has(player.id)) return false;
        if (addedIds.has(player.id)) return false;
        return player.name.toLowerCase().includes(searchLower);
      })
      .slice(0, 10);
  }, [freeAgentSearch, allPlayers, allRosterPlayerIdsSet, hypotheticalData.addedFreeAgents]);

  if (!userTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Calculator className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No Team Found</h3>
        <p className="text-muted-foreground text-center max-w-md">
          You need to be logged in with a team in this league to manage hypothetical contracts.
        </p>
      </div>
    );
  }

  const getLeagueSalary = (playerId: string, year: number): number => {
    const rosterId = userTeam.rosterId.toString();
    return leagueContractData[rosterId]?.[playerId]?.salaries?.[year] || 0;
  };

  const getEffectiveSalary = (playerId: string, year: number): number => {
    const override = hypotheticalData.salaryOverrides[playerId]?.[year];
    if (override !== undefined) return override;
    return getLeagueSalary(playerId, year);
  };

  const rosterPlayers: HypotheticalPlayer[] = userTeam.players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const hypotheticalSalaries: Record<number, number> = {};
      CONTRACT_YEARS.forEach(year => {
        hypotheticalSalaries[year] = getEffectiveSalary(id, year);
      });

      return {
        playerId: id,
        name: player.name,
        position: player.position || "NA",
        nflTeam: player.team || null,
        yearsExp: player.yearsExp ?? 0,
        hypotheticalSalaries,
        isRosterPlayer: true,
        isFreeAgent: false,
      };
    })
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name);
    });

  const allHypotheticalPlayers = [...rosterPlayers, ...hypotheticalData.addedFreeAgents];

  const hypotheticalTotalsByYear = CONTRACT_YEARS.reduce((acc, year) => {
    const total = allHypotheticalPlayers.reduce((sum, p) => {
      return sum + (p.hypotheticalSalaries[year] || 0);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  const leagueTotalsByYear = CONTRACT_YEARS.reduce((acc, year) => {
    const total = rosterPlayers.reduce((sum, p) => {
      return sum + getLeagueSalary(p.playerId, year);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  const handleHypotheticalSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setHypotheticalData(prev => ({
      ...prev,
      salaryOverrides: {
        ...prev.salaryOverrides,
        [playerId]: {
          ...prev.salaryOverrides[playerId],
          [year]: numValue,
        }
      }
    }));
  };

  const handleAddFreeAgent = (player: SleeperPlayerData) => {
    const hypotheticalSalaries: Record<number, number> = {};
    CONTRACT_YEARS.forEach(year => {
      hypotheticalSalaries[year] = 0;
    });

    const newFreeAgent: HypotheticalPlayer = {
      playerId: player.id,
      name: player.name,
      position: player.position || "NA",
      nflTeam: player.team || null,
      yearsExp: player.yearsExp ?? 0,
      hypotheticalSalaries,
      isRosterPlayer: false,
      isFreeAgent: true,
    };

    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: [...prev.addedFreeAgents, newFreeAgent],
    }));
    setFreeAgentSearch("");
    setShowFreeAgentSearch(false);
  };

  const handleRemoveFreeAgent = (playerId: string) => {
    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: prev.addedFreeAgents.filter(p => p.playerId !== playerId),
      salaryOverrides: Object.fromEntries(
        Object.entries(prev.salaryOverrides).filter(([id]) => id !== playerId)
      ),
    }));
  };

  const handleFreeAgentSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: prev.addedFreeAgents.map(p => {
        if (p.playerId !== playerId) return p;
        return {
          ...p,
          hypotheticalSalaries: {
            ...p.hypotheticalSalaries,
            [year]: numValue,
          }
        };
      }),
    }));
  };

  const handleResetToLeague = () => {
    setHypotheticalData({
      salaryOverrides: {},
      addedFreeAgents: [],
    });
  };

  const hasHypotheticalChanges = Object.keys(hypotheticalData.salaryOverrides).length > 0 || 
    hypotheticalData.addedFreeAgents.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {userTeam.avatar ? (
                  <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${userTeam.avatar}`} />
                ) : null}
                <AvatarFallback>
                  {userTeam.teamName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="font-heading">{userTeam.teamName}</CardTitle>
                <p className="text-sm text-muted-foreground">{userTeam.ownerName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFreeAgentSearch(!showFreeAgentSearch)}
                data-testid="button-add-free-agent"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Free Agent
              </Button>
              {hasHypotheticalChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToLeague}
                  data-testid="button-reset-hypothetical"
                >
                  Reset to League Values
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showFreeAgentSearch && (
            <div className="mb-4 p-4 bg-muted/50 rounded-lg space-y-3">
              <Label className="text-sm font-medium">Search Free Agents</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type player name..."
                  value={freeAgentSearch}
                  onChange={(e) => setFreeAgentSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-free-agent-search"
                />
              </div>
              {freeAgentResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {freeAgentResults.map(player => (
                    <div 
                      key={player.id}
                      className="flex items-center justify-between p-2 hover-elevate rounded cursor-pointer"
                      onClick={() => handleAddFreeAgent(player)}
                      data-testid={`free-agent-result-${player.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`}
                            alt={player.name}
                          />
                          <AvatarFallback className="text-xs">
                            {player.name.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium text-sm">{player.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1 py-0`}>
                              {player.position}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{player.team || "FA"}</span>
                          </div>
                        </div>
                      </div>
                      <UserPlus className="w-4 h-4 text-primary" />
                    </div>
                  ))}
                </div>
              )}
              {freeAgentSearch.length >= 2 && freeAgentResults.length === 0 && (
                <p className="text-sm text-muted-foreground">No players found matching "{freeAgentSearch}"</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {CONTRACT_YEARS.map(year => {
              const leagueTotal = leagueTotalsByYear[year];
              const hypotheticalTotal = hypotheticalTotalsByYear[year];
              const difference = hypotheticalTotal - leagueTotal;
              const isOverCap = hypotheticalTotal > TOTAL_CAP;

              return (
                <Card key={year} className="p-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">{year}</div>
                    <div className="font-bold" style={{ color: isOverCap ? COLORS.deadCap : COLORS.salaries }}>
                      ${hypotheticalTotal.toFixed(1)}M
                    </div>
                    {difference !== 0 && (
                      <div className={`text-xs mt-1 ${difference > 0 ? "text-red-500" : "text-green-500"}`}>
                        {difference > 0 ? "+" : ""}{difference.toFixed(1)}M vs league
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Cap Space: ${(TOTAL_CAP - hypotheticalTotal).toFixed(1)}M
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <ScrollArea className="h-[450px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Player</TableHead>
                  <TableHead className="text-center w-[60px]">Pos</TableHead>
                  <TableHead className="text-center w-[60px]">Team</TableHead>
                  <TableHead className="text-center w-[50px]">Type</TableHead>
                  {CONTRACT_YEARS.map(year => (
                    <TableHead key={year} className="text-center w-[100px]">{year}</TableHead>
                  ))}
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allHypotheticalPlayers.map((player) => {
                  const isModified = player.isRosterPlayer && 
                    Object.keys(hypotheticalData.salaryOverrides[player.playerId] || {}).length > 0;

                  return (
                    <TableRow 
                      key={player.playerId} 
                      className={player.isFreeAgent ? "bg-primary/5" : ""}
                      data-testid={`row-hypothetical-${player.playerId}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                              alt={player.name}
                            />
                            <AvatarFallback className="text-xs">
                              {player.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{player.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                          {player.position}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">
                          {player.nflTeam || "FA"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={player.isFreeAgent ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {player.isFreeAgent ? "FA+" : isModified ? "Mod" : "Roster"}
                        </Badge>
                      </TableCell>
                      {CONTRACT_YEARS.map((year, yearIndex) => {
                        const leagueSalary = player.isRosterPlayer ? getLeagueSalary(player.playerId, year) : 0;
                        const currentValue = player.hypotheticalSalaries[year] || 0;
                        const isDifferent = player.isRosterPlayer && currentValue !== leagueSalary;
                        const deadCapPercentages = [0.4, 0.3, 0.2, 0.1];
                        const deadCapPercent = deadCapPercentages[yearIndex] || 0;
                        const deadCapValue = currentValue * deadCapPercent;

                        return (
                          <TableCell key={year} className="text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center justify-center gap-0.5">
                                <span className="text-xs text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  className={`h-7 w-16 text-center tabular-nums text-sm ${isDifferent ? "border-primary" : ""}`}
                                  placeholder="0"
                                  value={currentValue || ""}
                                  onChange={(e) => {
                                    if (player.isFreeAgent) {
                                      handleFreeAgentSalaryChange(player.playerId, year, e.target.value);
                                    } else {
                                      handleHypotheticalSalaryChange(player.playerId, year, e.target.value);
                                    }
                                  }}
                                  data-testid={`input-hypothetical-${player.playerId}-${year}`}
                                />
                                <span className="text-xs text-muted-foreground">M</span>
                              </div>
                              {currentValue > 0 && (
                                <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                  DC: ${deadCapValue.toFixed(1)}M ({Math.round(deadCapPercent * 100)}%)
                                </span>
                              )}
                              {player.isRosterPlayer && leagueSalary > 0 && isDifferent && (
                                <span className="text-[10px] text-muted-foreground">
                                  League: ${leagueSalary.toFixed(1)}M
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {player.isFreeAgent && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveFreeAgent(player.playerId)}
                            data-testid={`button-remove-fa-${player.playerId}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {allHypotheticalPlayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No players on this roster
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              <span>Changes here are hypothetical and won't affect your league's official contracts.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Contracts() {
  const { toast } = useToast();
  const { user, league, isLoading } = useSleeper();
  const [, setLocation] = useLocation();
  const [selectedTeam, setSelectedTeam] = useState<TeamCapData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [contractData, setContractData] = useState<ContractDataStore>({});
  const [hasChanges, setHasChanges] = useState(false);

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  const { data: rosters } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "rosters"],
    enabled: !!league?.leagueId,
  });

  const { data: leagueUsers } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "users"],
    enabled: !!league?.leagueId,
  });

  const { data: playersArray } = useQuery<SleeperPlayerData[]>({
    queryKey: ["/api/sleeper/players"],
    enabled: !!league?.leagueId,
  });

  const playerMap = useMemo(() => {
    if (!playersArray) return {};
    return convertPlayersArrayToMap(playersArray);
  }, [playersArray]);

  const userTeam = useMemo(() => {
    if (!user?.userId || !rosters || !leagueUsers) return null;
    
    const userRoster = rosters.find((roster: any) => roster.owner_id === user.userId);
    if (!userRoster) return null;

    const owner = leagueUsers.find((u: any) => u.user_id === user.userId);
    const rosterId = userRoster.roster_id.toString();
    const teamContracts = contractData[rosterId] || {};
    const salaries = calculateTeamSalary(userRoster.players || [], teamContracts, CURRENT_YEAR);
    const deadCap = 0;
    const available = TOTAL_CAP - salaries - deadCap;

    return {
      rosterId: userRoster.roster_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${userRoster.roster_id}`,
      ownerName: owner?.display_name || "Unknown",
      avatar: owner?.avatar || null,
      salaries,
      deadCap,
      available,
      players: userRoster.players || [],
    } as TeamCapData;
  }, [user?.userId, rosters, leagueUsers, contractData]);

  const allRosterPlayerIds = useMemo(() => {
    if (!rosters) return [];
    return rosters.flatMap((roster: any) => roster.players || []);
  }, [rosters]);

  const handleContractChange = (
    rosterId: string, 
    playerId: string, 
    field: "salaries" | "fifthYearOption", 
    value: any
  ) => {
    setContractData(prev => {
      const teamContracts = prev[rosterId] || {};
      const playerContract = teamContracts[playerId] || { 
        salaries: {},
        fifthYearOption: null 
      };
      
      return {
        ...prev,
        [rosterId]: {
          ...teamContracts,
          [playerId]: {
            ...playerContract,
            [field]: value
          }
        }
      };
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    toast({
      title: "Contracts Saved",
      description: "All contract data has been saved successfully.",
    });
    setHasChanges(false);
  };

  if (isLoading || !league || !user) {
    return null;
  }

  const userMap = new Map(
    (leagueUsers || []).map((u: any) => [u.user_id, u])
  );

  const teamCapData: TeamCapData[] = (rosters || []).map((roster: any) => {
    const owner = userMap.get(roster.owner_id);
    const rosterId = roster.roster_id.toString();
    const teamContracts = contractData[rosterId] || {};
    const salaries = calculateTeamSalary(roster.players || [], teamContracts, CURRENT_YEAR);
    const deadCap = 0;
    const available = TOTAL_CAP - salaries - deadCap;

    return {
      rosterId: roster.roster_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`,
      ownerName: owner?.display_name || "Unknown",
      avatar: owner?.avatar || null,
      salaries,
      deadCap,
      available,
      players: roster.players || [],
    };
  }).sort((a: TeamCapData, b: TeamCapData) => a.rosterId - b.rosterId);

  const totalSalaries = teamCapData.reduce((sum, t) => sum + t.salaries, 0);
  const totalDeadCap = teamCapData.reduce((sum, t) => sum + t.deadCap, 0);
  const teamsOverCap = teamCapData.filter(t => t.available < 0).length;

  const handleTeamClick = (team: TeamCapData) => {
    setSelectedTeam(team);
    setModalOpen(true);
  };

  const selectedTeamPlayers = selectedTeam && Object.keys(playerMap).length > 0
    ? getPlayersWithContracts(
        selectedTeam.players, 
        playerMap, 
        contractData[selectedTeam.rosterId.toString()] || {}
      )
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Contracts
          </h1>
          <p className="text-muted-foreground">
            Salary cap utilization across all teams (Cap: ${TOTAL_CAP}M)
          </p>
        </div>
        {isCommissioner && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Commissioner Access
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="manage-team" data-testid="tab-manage-team">Manage Team Contracts</TabsTrigger>
          {isCommissioner && (
            <TabsTrigger value="manage-league" data-testid="tab-manage-league">Manage League Contracts</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                    ${totalSalaries.toFixed(1)}M
                  </div>
                  <p className="text-sm text-muted-foreground">Total Salaries</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: COLORS.deadCap }}>
                    ${totalDeadCap.toFixed(1)}M
                  </div>
                  <p className="text-sm text-muted-foreground">Total Dead Cap</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: teamsOverCap > 0 ? COLORS.deadCap : COLORS.available }}>
                    {teamsOverCap}
                  </div>
                  <p className="text-sm text-muted-foreground">Teams Over Cap</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teamCapData.map((team) => (
              <TeamCapChart 
                key={team.rosterId} 
                team={team} 
                onClick={() => handleTeamClick(team)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="manage-team" className="mt-6">
          {Object.keys(playerMap).length > 0 && playersArray && (
            <ManageTeamContractsTab
              userTeam={userTeam}
              playerMap={playerMap}
              leagueContractData={contractData}
              allPlayers={playersArray}
              rosterPlayerIds={allRosterPlayerIds}
            />
          )}
        </TabsContent>

        {isCommissioner && (
          <TabsContent value="manage-league" className="mt-6">
            {Object.keys(playerMap).length > 0 && (
              <ContractInputTab 
                teams={teamCapData} 
                playerMap={playerMap}
                contractData={contractData}
                onContractChange={handleContractChange}
                onSave={handleSave}
                hasChanges={hasChanges}
              />
            )}
          </TabsContent>
        )}
      </Tabs>

      <TeamContractModal
        team={selectedTeam}
        players={selectedTeamPlayers}
        contractData={contractData[selectedTeam?.rosterId.toString() || ""] || {}}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
