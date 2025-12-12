import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, ChevronRight, Save, UserPlus, Calculator, Trash2, Search, AlertTriangle, UserMinus, ArrowRightLeft, DollarSign, Star, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Send, Loader2, PieChart as PieChartIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const TOTAL_CAP = 250;

const COLORS = {
  available: "#3b82f6",
  salaries: "#22c55e",
  deadCap: "#ef4444",
};

// Dynamic year calculation - derived from Sleeper season or current date
// These will be overridden by the component using useSleeper().season
const getContractYears = (currentYear: number) => ({
  CURRENT_YEAR: currentYear,
  CONTRACT_YEARS: [currentYear, currentYear + 1, currentYear + 2, currentYear + 3],
  OPTION_YEAR: currentYear + 4, // Year 5 for extensions, tags, options on 4-year contracts
});

interface PlayerContractData {
  salaries: Record<number, number>;
  fifthYearOption: "accepted" | "declined" | null;
  isOnIr: boolean;
  originalContractYears: number;
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
  teamContracts: Record<string, PlayerContractData>,
  currentYear: number
): PlayerDisplayInfo[] {
  if (!players || players.length === 0) return [];

  return players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const contract = teamContracts[id];
      const currentSalary = contract?.salaries?.[currentYear] || 0;

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
  year: number
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
                <RechartsTooltip
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
  const { season } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  
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
  onContractChange: (rosterId: string, playerId: string, field: "salaries" | "fifthYearOption" | "isOnIr" | "originalContractYears", value: any) => void;
  onSave: () => void;
  hasChanges: boolean;
}

function ContractInputTab({ teams, playerMap, contractData, onContractChange, onSave, hasChanges }: ContractInputTabProps) {
  const { season } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
  const OPTION_YEAR = CURRENT_YEAR + 4;
  
  const [selectedRosterId, setSelectedRosterId] = useState<string>(teams[0]?.rosterId.toString() || "");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");

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
          isOnIr: contract?.isOnIr ?? false,
          originalContractYears: contract?.originalContractYears ?? 0,
        };
      })
      .filter(p => positionFilter === "ALL" || p.position === positionFilter)
      .sort((a, b) => {
        const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
        const posA = posOrder.indexOf(a.position);
        const posB = posOrder.indexOf(b.position);
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name);
      });
  }, [selectedTeam, playerMap, contractData, selectedRosterId, positionFilter]);

  const handleSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const currentSalaries = contractData[selectedRosterId]?.[playerId]?.salaries || {};
    onContractChange(selectedRosterId, playerId, "salaries", {
      ...currentSalaries,
      [year]: numValue
    });
  };

  const handleFifthYearOptionChange = (playerId: string, value: "accepted" | "declined") => {
    onContractChange(selectedRosterId, playerId, "fifthYearOption", value);
  };

  const handleIrToggle = (playerId: string, isOnIr: boolean) => {
    onContractChange(selectedRosterId, playerId, "isOnIr", isOnIr);
  };

  const totalSalaryByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
    const total = playerInputs.reduce((sum, p) => {
      const isVoided = p.isOnIr && year === CURRENT_YEAR;
      if (year === OPTION_YEAR && p.fifthYearOption !== "accepted") return sum;
      return sum + (isVoided ? 0 : (p.salaries[year] || 0));
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
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

          <Label className="text-sm font-medium whitespace-nowrap ml-4">
            Position:
          </Label>
          <Select 
            value={positionFilter} 
            onValueChange={setPositionFilter}
          >
            <SelectTrigger className="w-[140px]" data-testid="select-position-filter-league">
              <SelectValue placeholder="All Positions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Positions</SelectItem>
              <SelectItem value="QB">QB</SelectItem>
              <SelectItem value="RB">RB</SelectItem>
              <SelectItem value="WR">WR</SelectItem>
              <SelectItem value="TE">TE</SelectItem>
              <SelectItem value="K">K</SelectItem>
              <SelectItem value="DEF">DEF</SelectItem>
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
            <div className="grid grid-cols-5 gap-3 mb-6 p-3 bg-muted/50 rounded-lg">
              {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                <div key={year} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    {idx === 4 ? `${year} (Ext)` : year} Total
                  </div>
                  <div className="font-bold" style={{ color: (totalSalaryByYear[year] || 0) > TOTAL_CAP ? COLORS.deadCap : COLORS.salaries }}>
                    ${(totalSalaryByYear[year] || 0).toFixed(1)}M
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
                    <TableHead className="text-center w-[55px]">Len</TableHead>
                    <TableHead className="text-center w-[55px]">Rem</TableHead>
                    <TableHead className="text-center w-[70px]">NFL Yrs</TableHead>
                    <TableHead className="text-center w-[70px]">IR Void</TableHead>
                    {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                      <TableHead key={year} className="text-center w-[90px]">
                        {year}{idx === 4 ? " (Ext)" : ""}
                      </TableHead>
                    ))}
                    <TableHead className="text-center w-[80px]">Total</TableHead>
                    <TableHead className="text-center w-[80px]">Remaining</TableHead>
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
                          <Select
                            value={player.originalContractYears?.toString() || "0"}
                            onValueChange={(value) => onContractChange(selectedRosterId, player.playerId, "originalContractYears", parseInt(value))}
                          >
                            <SelectTrigger className="h-7 w-12 text-center" data-testid={`select-len-${player.playerId}`}>
                              <SelectValue placeholder="-" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">-</SelectItem>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const contractYears = [...CONTRACT_YEARS, OPTION_YEAR].filter(y => (player.salaries[y] || 0) > 0);
                            const lastYear = contractYears.length > 0 ? Math.max(...contractYears) : 0;
                            const remainingYears = lastYear >= CURRENT_YEAR ? lastYear - CURRENT_YEAR + 1 : 0;
                            return (
                              <span className="text-sm tabular-nums font-medium">
                                {remainingYears > 0 ? remainingYears : "-"}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm tabular-nums">
                            {player.yearsExp === 0 ? "R" : player.yearsExp}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={player.isOnIr}
                            onCheckedChange={(checked) => handleIrToggle(player.playerId, checked)}
                            data-testid={`switch-ir-${player.playerId}`}
                          />
                        </TableCell>
                        {[...CONTRACT_YEARS, OPTION_YEAR].map((year, yearIndex) => {
                          const salaryValue = player.salaries[year] || 0;
                          // Find contract end year (last year with salary > 0)
                          const contractEndYear = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(y => (player.salaries[y] || 0) > 0)
                            .pop() || year;
                          const yearsRemaining = contractEndYear - year + 1;
                          // Current year = 100% dead cap; future years based on years remaining
                          // Years remaining: 1yr=0%, 2yr=25%, 3yr=50%, 4yr=75%, 5yr=100%
                          const deadCapByYearsRemaining: Record<number, number> = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0 };
                          const deadCapPercent = year === CURRENT_YEAR ? 1.0 : (deadCapByYearsRemaining[yearsRemaining] || 0);
                          const deadCapValue = salaryValue * deadCapPercent;
                          const isCurrentYearVoided = player.isOnIr && year === CURRENT_YEAR;
                          const isVetOnlyYear = year === OPTION_YEAR;
                          const canEditYear = !isVetOnlyYear || !isRookie;

                          return (
                            <TableCell key={year} className="text-center">
                              {!canEditYear ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  {isCurrentYearVoided ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                                        IR VOID
                                      </Badge>
                                      {salaryValue > 0 && (
                                        <span className="text-[10px] text-muted-foreground line-through">
                                          ${salaryValue}M
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <>
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
                                      {salaryValue > 0 && deadCapPercent > 0 && (
                                        <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                          DC: ${Math.ceil(deadCapValue)}M ({Math.round(deadCapPercent * 100)}%)
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {(() => {
                            // Total = only completed seasons (years before current year)
                            const totalValue = [...CONTRACT_YEARS, OPTION_YEAR]
                              .filter(year => year < CURRENT_YEAR)
                              .reduce((sum, year) => {
                                if (year === OPTION_YEAR && player.fifthYearOption !== "accepted") return sum;
                                return sum + (player.salaries[year] || 0);
                              }, 0);
                            return totalValue > 0 ? (
                              <span className="font-medium text-primary tabular-nums">${totalValue.toFixed(1)}M</span>
                            ) : "-";
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            // Remaining = current + future years
                            const remainingValue = [...CONTRACT_YEARS, OPTION_YEAR]
                              .filter(year => year >= CURRENT_YEAR)
                              .reduce((sum, year) => {
                                if (year === OPTION_YEAR && player.fifthYearOption !== "accepted") return sum;
                                return sum + (player.salaries[year] || 0);
                              }, 0);
                            return remainingValue > 0 ? (
                              <span className="font-medium text-emerald-600 tabular-nums">${remainingValue.toFixed(1)}M</span>
                            ) : "-";
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {playerInputs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
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
  dbContracts: DbPlayerContract[];
  leagueId: string;
}

function ManageTeamContractsTab({ 
  userTeam, 
  playerMap, 
  leagueContractData, 
  allPlayers,
  rosterPlayerIds,
  dbContracts,
  leagueId
}: ManageTeamContractsTabProps) {
  const { toast } = useToast();
  const { season } = useSleeper();
  
  // Dynamic year calculation from Sleeper season
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
  const OPTION_YEAR = CURRENT_YEAR + 4;
  const [hypotheticalData, setHypotheticalData] = useState<HypotheticalContractData>({
    salaryOverrides: {},
    addedFreeAgents: [],
  });
  const [freeAgentSearch, setFreeAgentSearch] = useState("");
  const [showFreeAgentSearch, setShowFreeAgentSearch] = useState(false);
  const [franchiseTaggedPlayers, setFranchiseTaggedPlayers] = useState<Set<string>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [activeView, setActiveView] = useState<"contracts" | "salary-breakdown">("contracts");

  // Query for pending approval requests
  const { data: pendingApprovalData } = useQuery<{ hasPending: boolean; request: { id: string; status: string; submittedAt: number } | null }>({
    queryKey: ['/api/league', leagueId, 'contract-approvals', 'pending', userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
  });

  // Query for saved contract drafts
  interface SavedDraft {
    id: string;
    playerId: string;
    playerName: string;
    playerPosition: string;
    salary2025: number;
    salary2026: number;
    salary2027: number;
    salary2028: number;
    salary2029: number;
    franchiseTagApplied: number;
    updatedAt: number;
  }
  
  const { data: savedDrafts } = useQuery<SavedDraft[]>({
    queryKey: ['/api/league', leagueId, 'contract-drafts', userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
  });

  // Query for team extension status
  interface TeamExtension {
    id: string;
    leagueId: string;
    rosterId: number;
    season: number;
    playerId: string;
    playerName: string;
    extensionSalary: number;
    extensionYear: number;
    extensionType: number; // 1 = 1-year at 1.2x, 2 = 2-year at 1.5x
    extensionSalary2: number | null;
    createdAt: number;
  }

  const { data: extensionStatus } = useQuery<{ hasUsedExtension: boolean; extension: TeamExtension | null }>({
    queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
  });

  // Extension mutation - now supports 1-year (1.2x) or 2-year (1.5x) extensions
  const applyExtensionMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      playerName: string;
      currentSalary: number; // Current salary in tenths (e.g., 230 = $23.0M)
      extensionType: 1 | 2; // 1 = 1-year at 1.2x, 2 = 2-year at 1.5x
      extensionYear: number;
    }) => {
      return apiRequest("POST", `/api/league/${leagueId}/extensions`, {
        rosterId: userTeam?.rosterId,
        season: CURRENT_YEAR,
        ...data,
      });
    },
    onSuccess: (_, variables) => {
      const extensionTypeText = variables.extensionType === 1 
        ? "1 additional year at 1.2x salary" 
        : "2 additional years at 1.5x salary";
      toast({
        title: "Extension Applied",
        description: `The player's contract has been extended for ${extensionTypeText}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contracts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Extension Failed",
        description: error.message || "Failed to apply extension",
        variant: "destructive",
      });
    },
  });

  // Track the league contract data to detect commissioner changes
  const [prevLeagueContractDataRef, setPrevLeagueContractDataRef] = useState<string | null>(null);

  // Sync with league contract changes - reset overrides when commissioner updates contracts
  useEffect(() => {
    if (!userTeam) return;
    
    const rosterId = userTeam.rosterId.toString();
    const currentTeamContracts = leagueContractData[rosterId];
    const currentContractsJson = JSON.stringify(currentTeamContracts);
    
    // If league contracts changed after initial load, reset local overrides to sync
    if (prevLeagueContractDataRef !== null && currentContractsJson !== prevLeagueContractDataRef) {
      // League contracts were updated by commissioner - clear local overrides
      // Keep draftsLoaded = true so old saved drafts don't get reloaded
      setHypotheticalData({
        salaryOverrides: {},
        addedFreeAgents: [],
      });
      setFranchiseTaggedPlayers(new Set());
      setLastSavedAt(null);
      // Don't set draftsLoaded to false - we want to keep using league values
    }
    
    setPrevLeagueContractDataRef(currentContractsJson);
  }, [leagueContractData, userTeam]);

  // Load saved drafts - but DON'T override league contract values
  // Drafts are now only used as a reference; league contracts are always the source of truth
  useEffect(() => {
    if (savedDrafts && savedDrafts.length > 0 && !draftsLoaded) {
      const taggedPlayers = new Set<string>();
      let latestUpdatedAt = 0;
      
      for (const draft of savedDrafts) {
        if (draft.franchiseTagApplied === 1) {
          taggedPlayers.add(draft.playerId);
        }
        
        if (draft.updatedAt > latestUpdatedAt) {
          latestUpdatedAt = draft.updatedAt;
        }
      }
      
      // Only load franchise tag info, NOT salary overrides
      // This ensures league contracts are always displayed
      setFranchiseTaggedPlayers(taggedPlayers);
      setLastSavedAt(latestUpdatedAt);
      setDraftsLoaded(true);
    }
  }, [savedDrafts, draftsLoaded]);

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (drafts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salary2025: number;
      salary2026: number;
      salary2027: number;
      salary2028: number;
      salary2029: number;
      franchiseTagApplied: number;
    }>) => {
      return apiRequest("POST", `/api/league/${leagueId}/contract-drafts`, {
        rosterId: userTeam?.rosterId,
        drafts,
      });
    },
    onSuccess: () => {
      setLastSavedAt(Date.now());
      toast({
        title: "Draft Saved",
        description: "Your contract changes have been saved for later.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contract-drafts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save draft.",
        variant: "destructive",
      });
    },
  });

  // Submit for approval mutation
  const submitForApprovalMutation = useMutation({
    mutationFn: async (contracts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salary2025: number;
      salary2026: number;
      salary2027: number;
      salary2028: number;
      salary2029: number;
      franchiseTagApplied: boolean;
    }>) => {
      return apiRequest("POST", `/api/league/${leagueId}/contract-approvals`, {
        rosterId: userTeam?.rosterId,
        teamName: userTeam?.teamName,
        ownerName: userTeam?.ownerName,
        contracts,
      });
    },
    onSuccess: () => {
      toast({
        title: "Contracts Submitted",
        description: "Your contracts have been submitted for commissioner approval.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contract-approvals'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit contracts for approval.",
        variant: "destructive",
      });
    },
  });

  const allRosterPlayerIdsSet = useMemo(() => {
    return new Set(rosterPlayerIds);
  }, [rosterPlayerIds]);

  // Calculate top 5 salaries by position for franchise tag calculation
  const top5SalariesByPosition = useMemo(() => {
    const salariesByPosition: Record<string, number[]> = {};
    
    for (const contract of dbContracts) {
      const player = playerMap[contract.playerId];
      if (!player?.position) continue;
      
      const salary2025 = contract.salary2025 / 10; // Convert from stored format
      if (salary2025 <= 0) continue;
      
      if (!salariesByPosition[player.position]) {
        salariesByPosition[player.position] = [];
      }
      salariesByPosition[player.position].push(salary2025);
    }
    
    // Sort and take top 5, calculate average rounded up
    const result: Record<string, number> = {};
    for (const position of Object.keys(salariesByPosition)) {
      const sorted = salariesByPosition[position].sort((a, b) => b - a);
      const top5 = sorted.slice(0, 5);
      if (top5.length > 0) {
        const avg = top5.reduce((sum, s) => sum + s, 0) / top5.length;
        result[position] = Math.ceil(avg);
      } else {
        result[position] = 0;
      }
    }
    
    return result;
  }, [dbContracts, playerMap]);

  // Check if player has been previously franchise tagged (from database)
  const isPlayerPreviouslyFranchiseTagged = (playerId: string): boolean => {
    const contract = dbContracts.find(c => c.playerId === playerId);
    return contract?.franchiseTagUsed === 1;
  };

  // Check if player is eligible for extension
  // Eligible if: 1) In last year of contract, 2) Was originally signed to multi-year deal (2+ years)
  // Extension types: 1 = 1-year at 1.2x salary, 2 = 2-year at 1.5x salary (both rounded up)
  interface ExtensionEligibility {
    eligible: boolean;
    reason: string;
    extensionYear: number;
    currentSalary: number; // In millions (display format)
    currentSalaryTenths: number; // In tenths for API
    canDo1Year: boolean;
    canDo2Year: boolean;
    oneYearSalary: number; // 1.2x rounded up
    twoYearSalary: number; // 1.5x rounded up
  }

  const isPlayerEligibleForExtension = (playerId: string): ExtensionEligibility => {
    const defaultResult: ExtensionEligibility = {
      eligible: false,
      reason: "No contract found",
      extensionYear: 0,
      currentSalary: 0,
      currentSalaryTenths: 0,
      canDo1Year: false,
      canDo2Year: false,
      oneYearSalary: 0,
      twoYearSalary: 0,
    };

    const contract = dbContracts.find(c => c.playerId === playerId && c.rosterId === userTeam?.rosterId);
    if (!contract) {
      return defaultResult;
    }

    // Check if originally signed to multi-year deal
    const originalYears = contract.originalContractYears || 1;
    if (originalYears < 2) {
      return { ...defaultResult, reason: "Player was not originally signed to a multi-year deal" };
    }

    // Check if already has an extension applied
    if (contract.extensionApplied === 1) {
      return { ...defaultResult, reason: "Extension already applied" };
    }

    // Get salaries to determine if player is in last year (stored in tenths of millions)
    const salary2025 = (contract.salary2025 || 0) / 10;
    const salary2026 = (contract.salary2026 || 0) / 10;
    const salary2027 = (contract.salary2027 || 0) / 10;
    const salary2028 = (contract.salary2028 || 0) / 10;
    const salary2029 = ((contract as any).salary2029 || 0) / 10;

    // Find last contract year - player must be in their final year
    let lastYearWithSalary = 0;
    let currentSalary = 0;
    
    // Check years in reverse order to find the last year with salary
    if (salary2029 > 0) { lastYearWithSalary = 2029; currentSalary = salary2029; }
    else if (salary2028 > 0) { lastYearWithSalary = 2028; currentSalary = salary2028; }
    else if (salary2027 > 0) { lastYearWithSalary = 2027; currentSalary = salary2027; }
    else if (salary2026 > 0) { lastYearWithSalary = 2026; currentSalary = salary2026; }
    else if (salary2025 > 0) { lastYearWithSalary = 2025; currentSalary = salary2025; }

    // Cannot extend if already at 2029 (max year in schema)
    if (lastYearWithSalary === 2029) {
      return { ...defaultResult, reason: "Cannot extend - 2029 is the maximum contract year" };
    }

    // Must be in last year of contract (current year is the only remaining year)
    if (lastYearWithSalary !== CURRENT_YEAR) {
      return { ...defaultResult, reason: "Player is not in the final year of their contract" };
    }

    // Calculate extension year and salary options
    const extensionYear = lastYearWithSalary + 1;
    const oneYearSalary = Math.ceil(currentSalary * 1.2); // 1.2x rounded up
    const twoYearSalary = Math.ceil(currentSalary * 1.5); // 1.5x rounded up
    
    // Check if we can do 1-year or 2-year extension (max year is 2029)
    const canDo1Year = extensionYear <= 2029;
    const canDo2Year = extensionYear + 1 <= 2029;

    return {
      eligible: canDo1Year,
      reason: canDo1Year ? "Eligible for extension" : "Cannot extend - would exceed 2029",
      extensionYear,
      currentSalary,
      currentSalaryTenths: Math.round(currentSalary * 10),
      canDo1Year,
      canDo2Year,
      oneYearSalary,
      twoYearSalary,
    };
  };

  // Handle applying extension with type selection
  const handleApplyExtension = (playerId: string, playerName: string, extensionYear: number, currentSalaryTenths: number, extensionType: 1 | 2) => {
    applyExtensionMutation.mutate({
      playerId,
      playerName,
      currentSalary: currentSalaryTenths,
      extensionType,
      extensionYear,
    });
  };

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

  // Always use league contracts as the source of truth
  // Overrides are only used for the approval workflow (proposing changes)
  const getEffectiveSalary = (playerId: string, year: number): number => {
    // Check if there's a local override for proposal purposes
    const override = hypotheticalData.salaryOverrides[playerId]?.[year];
    if (override !== undefined) return override;
    // Default to league contract value (commissioner-set)
    return getLeagueSalary(playerId, year);
  };

  // Check if player has any local overrides (for display purposes)
  const hasLocalOverride = (playerId: string): boolean => {
    const overrides = hypotheticalData.salaryOverrides[playerId];
    if (!overrides) return false;
    // Check if any override differs from league value
    return CONTRACT_YEARS.some(year => {
      const override = overrides[year];
      const leagueValue = getLeagueSalary(playerId, year);
      return override !== undefined && override !== leagueValue;
    });
  };

  const rosterPlayers: HypotheticalPlayer[] = userTeam.players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const hypotheticalSalaries: Record<number, number> = {};
      [...CONTRACT_YEARS, OPTION_YEAR].forEach(year => {
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
    .filter(p => positionFilter === "ALL" || p.position === positionFilter)
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name);
    });

  const allHypotheticalPlayers = [...rosterPlayers, ...hypotheticalData.addedFreeAgents];

  const hypotheticalTotalsByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
    const total = allHypotheticalPlayers.reduce((sum, p) => {
      return sum + (p.hypotheticalSalaries[year] || 0);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  const leagueTotalsByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
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
    [...CONTRACT_YEARS, OPTION_YEAR].forEach(year => {
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
    setFranchiseTaggedPlayers(new Set());
  };

  const handleFranchiseTag = (playerId: string, position: string) => {
    const franchiseSalary = top5SalariesByPosition[position] || 0;
    if (franchiseSalary === 0) return;
    
    // Find last year with salary to determine franchise year
    const currentSalaries = leagueContractData[userTeam!.rosterId.toString()]?.[playerId]?.salaries || {};
    let lastYearWithSalary = 0;
    if (currentSalaries[2028] > 0) lastYearWithSalary = 2028;
    else if (currentSalaries[2027] > 0) lastYearWithSalary = 2027;
    else if (currentSalaries[2026] > 0) lastYearWithSalary = 2026;
    else if (currentSalaries[2025] > 0) lastYearWithSalary = 2025;
    
    const franchiseYear = lastYearWithSalary < OPTION_YEAR ? lastYearWithSalary + 1 : OPTION_YEAR;
    
    // Toggle franchise tag
    setFranchiseTaggedPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
        // Reset the franchise tag year to 0
        setHypotheticalData(prevData => ({
          ...prevData,
          salaryOverrides: {
            ...prevData.salaryOverrides,
            [playerId]: {
              ...prevData.salaryOverrides[playerId],
              [franchiseYear]: 0,
            }
          }
        }));
      } else {
        newSet.add(playerId);
        // Add 1 year to contract at franchise tag salary
        setHypotheticalData(prevData => ({
          ...prevData,
          salaryOverrides: {
            ...prevData.salaryOverrides,
            [playerId]: {
              ...prevData.salaryOverrides[playerId],
              [franchiseYear]: franchiseSalary,
            }
          }
        }));
      }
      return newSet;
    });
  };

  const hasHypotheticalChanges = Object.keys(hypotheticalData.salaryOverrides).length > 0 || 
    hypotheticalData.addedFreeAgents.length > 0;

  // Build contracts array for submission
  const buildContractsForSubmission = () => {
    const contracts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salary2025: number;
      salary2026: number;
      salary2027: number;
      salary2028: number;
      salary2029: number;
      franchiseTagApplied: boolean;
    }> = [];

    // Add roster players with their salaries
    for (const player of rosterPlayers) {
      const salary2025 = player.hypotheticalSalaries[2025] || 0;
      const salary2026 = player.hypotheticalSalaries[2026] || 0;
      const salary2027 = player.hypotheticalSalaries[2027] || 0;
      const salary2028 = player.hypotheticalSalaries[2028] || 0;
      const salary2029 = player.hypotheticalSalaries[2029] || 0;

      // Only include players with at least one salary value
      if (salary2025 > 0 || salary2026 > 0 || salary2027 > 0 || salary2028 > 0 || salary2029 > 0) {
        contracts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salary2025: Math.round(salary2025 * 10), // Store in tenths of millions
          salary2026: Math.round(salary2026 * 10),
          salary2027: Math.round(salary2027 * 10),
          salary2028: Math.round(salary2028 * 10),
          salary2029: Math.round(salary2029 * 10),
          franchiseTagApplied: franchiseTaggedPlayers.has(player.playerId),
        });
      }
    }

    // Add free agents with their salaries
    for (const player of hypotheticalData.addedFreeAgents) {
      const salary2025 = player.hypotheticalSalaries[2025] || 0;
      const salary2026 = player.hypotheticalSalaries[2026] || 0;
      const salary2027 = player.hypotheticalSalaries[2027] || 0;
      const salary2028 = player.hypotheticalSalaries[2028] || 0;
      const salary2029 = player.hypotheticalSalaries[2029] || 0;

      if (salary2025 > 0 || salary2026 > 0 || salary2027 > 0 || salary2028 > 0 || salary2029 > 0) {
        contracts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salary2025: Math.round(salary2025 * 10),
          salary2026: Math.round(salary2026 * 10),
          salary2027: Math.round(salary2027 * 10),
          salary2028: Math.round(salary2028 * 10),
          salary2029: Math.round(salary2029 * 10),
          franchiseTagApplied: false,
        });
      }
    }

    return contracts;
  };

  const handleSubmitForApproval = () => {
    const contracts = buildContractsForSubmission();
    if (contracts.length === 0) {
      toast({
        title: "No Contracts",
        description: "Please add salary values to at least one player before submitting.",
        variant: "destructive",
      });
      return;
    }
    submitForApprovalMutation.mutate(contracts);
  };

  const handleSaveDraft = () => {
    // Build drafts array with all players that have salary values
    const drafts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salary2025: number;
      salary2026: number;
      salary2027: number;
      salary2028: number;
      salary2029: number;
      franchiseTagApplied: number;
    }> = [];

    // Add roster players with their hypothetical salaries
    for (const player of rosterPlayers) {
      const salary2025 = player.hypotheticalSalaries[2025] || 0;
      const salary2026 = player.hypotheticalSalaries[2026] || 0;
      const salary2027 = player.hypotheticalSalaries[2027] || 0;
      const salary2028 = player.hypotheticalSalaries[2028] || 0;
      const salary2029 = player.hypotheticalSalaries[2029] || 0;

      // Include if there's any salary value or overrides
      if (salary2025 > 0 || salary2026 > 0 || salary2027 > 0 || salary2028 > 0 || salary2029 > 0 ||
          hypotheticalData.salaryOverrides[player.playerId]) {
        drafts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salary2025: Math.round(salary2025 * 10),
          salary2026: Math.round(salary2026 * 10),
          salary2027: Math.round(salary2027 * 10),
          salary2028: Math.round(salary2028 * 10),
          salary2029: Math.round(salary2029 * 10),
          franchiseTagApplied: franchiseTaggedPlayers.has(player.playerId) ? 1 : 0,
        });
      }
    }

    // Add free agents with their salaries
    for (const player of hypotheticalData.addedFreeAgents) {
      const salary2025 = player.hypotheticalSalaries[2025] || 0;
      const salary2026 = player.hypotheticalSalaries[2026] || 0;
      const salary2027 = player.hypotheticalSalaries[2027] || 0;
      const salary2028 = player.hypotheticalSalaries[2028] || 0;
      const salary2029 = player.hypotheticalSalaries[2029] || 0;

      if (salary2025 > 0 || salary2026 > 0 || salary2027 > 0 || salary2028 > 0 || salary2029 > 0) {
        drafts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salary2025: Math.round(salary2025 * 10),
          salary2026: Math.round(salary2026 * 10),
          salary2027: Math.round(salary2027 * 10),
          salary2028: Math.round(salary2028 * 10),
          salary2029: Math.round(salary2029 * 10),
          franchiseTagApplied: 0,
        });
      }
    }

    if (drafts.length === 0) {
      toast({
        title: "Nothing to Save",
        description: "Make changes to contract values before saving.",
        variant: "destructive",
      });
      return;
    }

    saveDraftMutation.mutate(drafts);
  };

  const hasPendingApproval = pendingApprovalData?.hasPending;

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
            <div className="flex gap-2 flex-wrap items-center">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending}
                data-testid="button-save-draft"
              >
                {saveDraftMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Draft
              </Button>
              {hasPendingApproval ? (
                <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pending Approval
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmitForApproval}
                  disabled={submitForApprovalMutation.isPending}
                  data-testid="button-submit-for-approval"
                >
                  {submitForApprovalMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit for Approval
                </Button>
              )}
              {lastSavedAt && (
                <span className="text-xs text-muted-foreground ml-2">
                  Last saved: {new Date(lastSavedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <div className="px-6 pb-4">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "contracts" | "salary-breakdown")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="contracts" data-testid="tab-contracts">
                <FileText className="w-4 h-4 mr-2" />
                Contracts
              </TabsTrigger>
              <TabsTrigger value="salary-breakdown" data-testid="tab-salary-breakdown">
                <PieChartIcon className="w-4 h-4 mr-2" />
                Salary Breakdown
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeView === "salary-breakdown" ? (
          <CardContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                View your team's salary allocation by position for the next four years.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => {
                  const positionTotals: Record<string, number> = {};
                  
                  allHypotheticalPlayers.forEach(player => {
                    const salary = player.hypotheticalSalaries[year] || 0;
                    if (salary > 0) {
                      const pos = player.position || "OTHER";
                      positionTotals[pos] = (positionTotals[pos] || 0) + salary;
                    }
                  });
                  
                  const pieData = Object.entries(positionTotals)
                    .map(([position, total]) => ({
                      name: position,
                      value: Math.round(total * 10) / 10,
                    }))
                    .sort((a, b) => b.value - a.value);
                  
                  const totalSalary = pieData.reduce((sum, d) => sum + d.value, 0);
                  
                  const PIE_COLORS: Record<string, string> = {
                    QB: "#ef4444",
                    RB: "#10b981",
                    WR: "#3b82f6",
                    TE: "#f97316",
                    K: "#8b5cf6",
                    DEF: "#6b7280",
                    OTHER: "#a3a3a3",
                  };
                  
                  return (
                    <Card key={year} className="p-4">
                      <div className="text-center mb-2">
                        <h3 className="font-semibold text-lg">
                          {idx === 4 ? `${year} (Ext)` : year}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Total: ${totalSalary.toFixed(1)}M
                        </p>
                      </div>
                      
                      {pieData.length > 0 ? (
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                label={({ name, value, percent }) => 
                                  `${name}: $${value}M (${(percent * 100).toFixed(0)}%)`
                                }
                                labelLine={true}
                              >
                                {pieData.map((entry, index) => (
                                  <Cell 
                                    key={`cell-${index}`} 
                                    fill={PIE_COLORS[entry.name] || PIE_COLORS.OTHER}
                                  />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                formatter={(value: number) => [`$${value.toFixed(1)}M`, 'Salary']}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-64 flex items-center justify-center text-muted-foreground">
                          No salary data for {year}
                        </div>
                      )}
                      
                      <div className="mt-4 space-y-1">
                        {pieData.map(({ name, value }) => (
                          <div key={name} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: PIE_COLORS[name] || PIE_COLORS.OTHER }}
                              />
                              <span>{name}</span>
                            </div>
                            <span className="font-medium tabular-nums">${value.toFixed(1)}M</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </CardContent>
        ) : (
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

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => {
              const leagueTotal = leagueTotalsByYear[year] || 0;
              const hypotheticalTotal = hypotheticalTotalsByYear[year] || 0;
              const difference = hypotheticalTotal - leagueTotal;
              const isOverCap = hypotheticalTotal > TOTAL_CAP;

              return (
                <Card key={year} className="p-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">
                      {idx === 4 ? `${year} (Ext)` : year}
                    </div>
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

          <div className="flex items-center gap-4 mb-4">
            <Label className="text-sm font-medium whitespace-nowrap">
              Filter by Position:
            </Label>
            <Select 
              value={positionFilter} 
              onValueChange={setPositionFilter}
            >
              <SelectTrigger className="w-[160px]" data-testid="select-position-filter-team">
                <SelectValue placeholder="All Positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Positions</SelectItem>
                <SelectItem value="QB">QB</SelectItem>
                <SelectItem value="RB">RB</SelectItem>
                <SelectItem value="WR">WR</SelectItem>
                <SelectItem value="TE">TE</SelectItem>
                <SelectItem value="K">K</SelectItem>
                <SelectItem value="DEF">DEF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[450px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Player</TableHead>
                  <TableHead className="text-center w-[60px]">Pos</TableHead>
                  <TableHead className="text-center w-[60px]">Team</TableHead>
                  <TableHead className="text-center w-[55px]">Len</TableHead>
                  <TableHead className="text-center w-[55px]">Rem</TableHead>
                  <TableHead className="text-center w-[50px]">Type</TableHead>
                  {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                    <TableHead key={year} className="text-center w-[100px]">
                      {idx === 4 ? `${year} (Ext)` : year}
                    </TableHead>
                  ))}
                  <TableHead className="text-center w-[80px]">Total</TableHead>
                  <TableHead className="text-center w-[80px]">Remaining</TableHead>
                  <TableHead className="text-center w-[50px]">Tag</TableHead>
                  <TableHead className="text-center w-[50px]">Extend</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
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
                        {(() => {
                          // Get contract length from league data (read-only display)
                          const rosterId = userTeam?.rosterId?.toString() || "";
                          const leaguePlayerData = leagueContractData[rosterId]?.[player.playerId];
                          const contractLength = leaguePlayerData?.originalContractYears || 0;
                          return (
                            <span className="text-sm tabular-nums font-medium">
                              {contractLength > 0 ? contractLength : "-"}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const contractYears = [...CONTRACT_YEARS, OPTION_YEAR].filter(y => (player.hypotheticalSalaries[y] || 0) > 0);
                          const lastYear = contractYears.length > 0 ? Math.max(...contractYears) : 0;
                          const remainingYears = lastYear >= CURRENT_YEAR ? lastYear - CURRENT_YEAR + 1 : 0;
                          return (
                            <span className="text-sm tabular-nums font-medium">
                              {remainingYears > 0 ? remainingYears : "-"}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={player.isFreeAgent ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {player.isFreeAgent ? "FA+" : isModified ? "Mod" : "Roster"}
                        </Badge>
                      </TableCell>
                      {[...CONTRACT_YEARS, OPTION_YEAR].map((year, yearIndex) => {
                        const leagueSalary = player.isRosterPlayer ? getLeagueSalary(player.playerId, year) : 0;
                        const currentValue = player.hypotheticalSalaries[year] || 0;
                        const isDifferent = player.isRosterPlayer && currentValue !== leagueSalary;
                        // Find contract end year (last year with salary > 0)
                        const contractEndYear = [...CONTRACT_YEARS, OPTION_YEAR]
                          .filter(y => (player.hypotheticalSalaries[y] || 0) > 0)
                          .pop() || year;
                        const yearsRemaining = contractEndYear - year + 1;
                        // Current year = 100% dead cap; future years based on years remaining
                        // Years remaining: 1yr=0%, 2yr=25%, 3yr=50%, 4yr=75%, 5yr=100%
                        const deadCapByYearsRemaining: Record<number, number> = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0 };
                        const deadCapPercent = year === CURRENT_YEAR ? 1.0 : (deadCapByYearsRemaining[yearsRemaining] || 0);
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
                              {currentValue > 0 && deadCapPercent > 0 && (
                                <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                  DC: ${Math.ceil(deadCapValue)}M ({Math.round(deadCapPercent * 100)}%)
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
                      <TableCell className="text-center">
                        {(() => {
                          // Total = only completed seasons (years before current year)
                          const totalValue = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(year => year < CURRENT_YEAR)
                            .reduce((sum, year) => sum + (player.hypotheticalSalaries[year] || 0), 0);
                          return totalValue > 0 ? (
                            <span className="font-medium text-primary tabular-nums">${totalValue.toFixed(1)}M</span>
                          ) : "-";
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          // Remaining = current + future years
                          const remainingValue = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(year => year >= CURRENT_YEAR)
                            .reduce((sum, year) => sum + (player.hypotheticalSalaries[year] || 0), 0);
                          return remainingValue > 0 ? (
                            <span className="font-medium text-emerald-600 tabular-nums">${remainingValue.toFixed(1)}M</span>
                          ) : "-";
                        })()}
                      </TableCell>
                      {/* Franchise Tag Column */}
                      <TableCell className="text-center">
                        {player.isRosterPlayer && !player.isFreeAgent && (() => {
                          const franchiseSalary = top5SalariesByPosition[player.position] || 0;
                          const isPreviouslyTagged = isPlayerPreviouslyFranchiseTagged(player.playerId);
                          const noPositionData = franchiseSalary === 0;
                          const isThisPlayerTagged = franchiseTaggedPlayers.has(player.playerId);
                          const teamAlreadyUsedTag = franchiseTaggedPlayers.size > 0 && !isThisPlayerTagged;
                          const isDisabled = isPreviouslyTagged || noPositionData || teamAlreadyUsedTag;
                          
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant={isThisPlayerTagged ? "default" : "ghost"}
                                  className={`h-7 w-7 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                                  onClick={() => !isDisabled && handleFranchiseTag(player.playerId, player.position)}
                                  disabled={isDisabled}
                                  data-testid={`button-franchise-tag-${player.playerId}`}
                                >
                                  <Star className={`w-4 h-4 ${isThisPlayerTagged ? "fill-current" : ""}`} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isPreviouslyTagged 
                                  ? "Previously franchise tagged" 
                                  : noPositionData
                                    ? "No position salary data available"
                                    : teamAlreadyUsedTag
                                      ? "Team can only use 1 franchise tag per season"
                                      : isThisPlayerTagged
                                        ? `Franchise tag applied: $${franchiseSalary}M`
                                        : `Apply franchise tag ($${franchiseSalary}M - avg of top 5 ${player.position}s)`
                                }
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </TableCell>
                      
                      {/* Extension Column */}
                      <TableCell className="text-center">
                        {player.isRosterPlayer && !player.isFreeAgent && (() => {
                          const extensionEligibility = isPlayerEligibleForExtension(player.playerId);
                          const teamUsedExtension = extensionStatus?.hasUsedExtension || false;
                          const extensionDisabled = !extensionEligibility.eligible || teamUsedExtension || applyExtensionMutation.isPending;
                          
                          return (
                            <Popover>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PopoverTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant={extensionEligibility.eligible && !extensionDisabled ? "outline" : "ghost"}
                                      className={`h-7 w-7 ${extensionDisabled ? "opacity-50 cursor-not-allowed" : "text-emerald-600 border-emerald-600"}`}
                                      disabled={extensionDisabled}
                                      data-testid={`button-extend-${player.playerId}`}
                                    >
                                      <ArrowRightLeft className="w-4 h-4" />
                                    </Button>
                                  </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {teamUsedExtension 
                                    ? `Team has already used their ${CURRENT_YEAR} extension`
                                    : extensionEligibility.eligible 
                                      ? `Extend player (1 per team per season)`
                                      : extensionEligibility.reason
                                  }
                                </TooltipContent>
                              </Tooltip>
                              <PopoverContent className="w-72 p-3" align="end">
                                <div className="space-y-3">
                                  <div className="text-sm font-medium">Extend {player.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Current salary: ${extensionEligibility.currentSalary.toFixed(1)}M
                                  </div>
                                  <div className="space-y-2">
                                    {extensionEligibility.canDo1Year && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full justify-between"
                                        onClick={() => handleApplyExtension(
                                          player.playerId,
                                          player.name,
                                          extensionEligibility.extensionYear,
                                          extensionEligibility.currentSalaryTenths,
                                          1
                                        )}
                                        disabled={applyExtensionMutation.isPending}
                                        data-testid={`button-extend-1yr-${player.playerId}`}
                                      >
                                        <span>1-Year Extension</span>
                                        <span className="text-emerald-600 font-medium">${extensionEligibility.oneYearSalary}M (1.2x)</span>
                                      </Button>
                                    )}
                                    {extensionEligibility.canDo2Year && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full justify-between"
                                        onClick={() => handleApplyExtension(
                                          player.playerId,
                                          player.name,
                                          extensionEligibility.extensionYear,
                                          extensionEligibility.currentSalaryTenths,
                                          2
                                        )}
                                        disabled={applyExtensionMutation.isPending}
                                        data-testid={`button-extend-2yr-${player.playerId}`}
                                      >
                                        <span>2-Year Extension</span>
                                        <span className="text-emerald-600 font-medium">${extensionEligibility.twoYearSalary}M/yr (1.5x)</span>
                                      </Button>
                                    )}
                                    {!extensionEligibility.canDo2Year && extensionEligibility.canDo1Year && (
                                      <div className="text-xs text-muted-foreground italic">
                                        2-year option unavailable (would exceed {CURRENT_YEAR + 4})
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground border-t pt-2">
                                    Each team gets 1 extension per season. Applies to final-year players on multi-year deals.
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </TableCell>
                      
                      {/* Remove Free Agent Column */}
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
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                      No players on this roster
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              <span>Click "Save Draft" to save your contract changes for later. Saved drafts are automatically loaded when you return to this page.</span>
            </p>
            <p className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>Click "Submit for Approval" to send your contracts to the commissioner for review. Once approved, they become official league contracts.</span>
            </p>
            <p className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              <span>Franchise tag adds 1 year at the average of top 5 salaries at that position (rounded up). Each team gets 1 tag per season.</span>
            </p>
            <p className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              <span>Extension options: 1-year at 1.2x salary OR 2-year at 1.5x salary (rounded up). Only for players in final contract year who were originally signed to multi-year deals. Each team gets 1 extension per season.</span>
            </p>
          </div>
        </CardContent>
        )}
      </Card>
    </div>
  );
}

interface PlayerBiddingTabProps {
  userTeam: TeamCapData;
  allPlayers: SleeperPlayerData[];
  rosterPlayerIds: string[];
  teamContracts: Record<string, PlayerContractData>;
}

interface PlayerBid {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  playerTeam: string | null;
  bidAmount: number;
  maxBid: number | null;
  contractYears: number;
  notes: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

function PlayerBiddingTab({ userTeam, allPlayers, rosterPlayerIds, teamContracts }: PlayerBiddingTabProps) {
  const { league } = useSleeper();
  const leagueId = league?.leagueId;
  const { toast } = useToast();
  const [freeAgentSearch, setFreeAgentSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<SleeperPlayerData | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [maxBid, setMaxBid] = useState("");
  const [contractYears, setContractYears] = useState("1");
  const [notes, setNotes] = useState("");
  const [editingBid, setEditingBid] = useState<PlayerBid | null>(null);

  const allRosterPlayerIdsSet = useMemo(() => {
    return new Set(rosterPlayerIds);
  }, [rosterPlayerIds]);

  // Contract limits: 2 four-year, 3 three-year, 3 two-year
  const CONTRACT_LIMITS = {
    4: 2,
    3: 3,
    2: 3,
  };

  // Calculate existing contract counts by duration
  const existingContractCounts = useMemo(() => {
    const counts: Record<number, number> = { 4: 0, 3: 0, 2: 0, 1: 0 };
    
    for (const playerId of Object.keys(teamContracts)) {
      const contract = teamContracts[playerId];
      if (!contract?.salaries) continue;
      
      const salary2025 = contract.salaries[2025] || 0;
      const salary2026 = contract.salaries[2026] || 0;
      const salary2027 = contract.salaries[2027] || 0;
      const salary2028 = contract.salaries[2028] || 0;
      
      // Count years with non-zero salary
      let yearsWithSalary = 0;
      if (salary2025 > 0) yearsWithSalary++;
      if (salary2026 > 0) yearsWithSalary++;
      if (salary2027 > 0) yearsWithSalary++;
      if (salary2028 > 0) yearsWithSalary++;
      
      if (yearsWithSalary >= 1 && yearsWithSalary <= 4) {
        counts[yearsWithSalary]++;
      }
    }
    
    return counts;
  }, [teamContracts]);

  const { data: bids = [], isLoading, refetch } = useQuery<PlayerBid[]>({
    queryKey: ['/api/league', leagueId, 'bids', userTeam.rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/${userTeam.rosterId}`);
      if (!res.ok) throw new Error("Failed to fetch bids");
      return res.json();
    },
    enabled: !!leagueId && !!userTeam,
  });

  const createBidMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      playerName: string;
      playerPosition: string;
      playerTeam: string | null;
      bidAmount: number;
      maxBid: number | null;
      contractYears: number;
      notes: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/league/${leagueId}/bids`, {
        rosterId: userTeam.rosterId,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid placed successfully" });
      refetch();
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to place bid", variant: "destructive" });
    },
  });

  const updateBidMutation = useMutation({
    mutationFn: async (data: { bidId: string; updates: Partial<PlayerBid> }) => {
      const res = await apiRequest("PATCH", `/api/league/${leagueId}/bids/${data.bidId}`, {
        rosterId: userTeam.rosterId,
        ...data.updates,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid updated successfully" });
      refetch();
      setEditingBid(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update bid", variant: "destructive" });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async (bidId: string) => {
      const res = await apiRequest("DELETE", `/api/league/${leagueId}/bids/${bidId}/${userTeam.rosterId}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid removed" });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to remove bid", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedPlayer(null);
    setBidAmount("");
    setMaxBid("");
    setContractYears("1");
    setNotes("");
    setFreeAgentSearch("");
  };

  const freeAgentResults = useMemo(() => {
    if (!freeAgentSearch.trim() || freeAgentSearch.length < 2) return [];
    
    const searchLower = freeAgentSearch.toLowerCase();
    const biddedPlayerIds = new Set(bids.map(b => b.playerId));
    
    return allPlayers
      .filter(player => {
        if (!player.name || !player.position) return false;
        if (!["QB", "RB", "WR", "TE", "K"].includes(player.position)) return false;
        if (allRosterPlayerIdsSet.has(player.id)) return false;
        if (biddedPlayerIds.has(player.id)) return false;
        return player.name.toLowerCase().includes(searchLower);
      })
      .slice(0, 10);
  }, [freeAgentSearch, allPlayers, allRosterPlayerIdsSet, bids]);

  const handleSubmitBid = () => {
    if (!selectedPlayer || !bidAmount) return;

    const bidData = {
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      playerPosition: selectedPlayer.position,
      playerTeam: selectedPlayer.team || null,
      bidAmount: parseFloat(bidAmount),
      maxBid: maxBid ? parseFloat(maxBid) : null,
      contractYears: parseInt(contractYears),
      notes: notes || null,
    };

    if (editingBid) {
      updateBidMutation.mutate({ bidId: editingBid.id, updates: bidData });
    } else {
      createBidMutation.mutate(bidData);
    }
  };

  const handleEditBid = (bid: PlayerBid) => {
    setEditingBid(bid);
    setSelectedPlayer({
      id: bid.playerId,
      name: bid.playerName,
      position: bid.playerPosition,
      team: bid.playerTeam,
    });
    setBidAmount(bid.bidAmount.toString());
    setMaxBid(bid.maxBid?.toString() || "");
    setContractYears(bid.contractYears.toString());
    setNotes(bid.notes || "");
  };

  const handleCancelEdit = () => {
    setEditingBid(null);
    resetForm();
  };

  const activeBids = bids.filter(b => b.status === "active");

  // Count active bids by contract years
  const bidContractCounts = useMemo(() => {
    const counts: Record<number, number> = { 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const bid of activeBids) {
      if (bid.contractYears >= 1 && bid.contractYears <= 4) {
        counts[bid.contractYears]++;
      }
    }
    return counts;
  }, [activeBids]);

  // Calculate remaining slots for each contract type
  const remainingSlots = useMemo(() => {
    return {
      4: Math.max(0, CONTRACT_LIMITS[4] - existingContractCounts[4] - bidContractCounts[4]),
      3: Math.max(0, CONTRACT_LIMITS[3] - existingContractCounts[3] - bidContractCounts[3]),
      2: Math.max(0, CONTRACT_LIMITS[2] - existingContractCounts[2] - bidContractCounts[2]),
    };
  }, [existingContractCounts, bidContractCounts]);

  // Check if selected contract years would exceed limit
  const isContractYearDisabled = (years: number): boolean => {
    if (years === 1) return false; // No limit on 1-year contracts
    const limit = CONTRACT_LIMITS[years as 2 | 3 | 4];
    if (!limit) return false;
    
    const existing = existingContractCounts[years] || 0;
    const bidsCount = bidContractCounts[years] || 0;
    
    // If editing, don't count the current bid being edited
    const adjustedBidsCount = editingBid && editingBid.contractYears === years 
      ? bidsCount - 1 
      : bidsCount;
    
    return (existing + adjustedBidsCount) >= limit;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">
                {activeBids.length}
              </div>
              <p className="text-sm text-muted-foreground">Active Bids</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                ${activeBids.reduce((sum, b) => sum + (b.bidAmount * b.contractYears), 0).toFixed(1)}M
              </div>
              <p className="text-sm text-muted-foreground">Total Contract Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-muted-foreground">
                {userTeam.teamName}
              </div>
              <p className="text-sm text-muted-foreground">Your Team</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contract Limits (Existing + Pending Bids)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className={`text-lg font-bold ${remainingSlots[4] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[4] + bidContractCounts[4]}/{CONTRACT_LIMITS[4]}
              </div>
              <p className="text-xs text-muted-foreground">4-Year Contracts</p>
            </div>
            <div>
              <div className={`text-lg font-bold ${remainingSlots[3] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[3] + bidContractCounts[3]}/{CONTRACT_LIMITS[3]}
              </div>
              <p className="text-xs text-muted-foreground">3-Year Contracts</p>
            </div>
            <div>
              <div className={`text-lg font-bold ${remainingSlots[2] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[2] + bidContractCounts[2]}/{CONTRACT_LIMITS[2]}
              </div>
              <p className="text-xs text-muted-foreground">2-Year Contracts</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {editingBid ? "Edit Bid" : "Place New Bid"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedPlayer ? (
              <div className="space-y-2">
                <Label>Search Free Agents</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for a player..."
                    value={freeAgentSearch}
                    onChange={(e) => setFreeAgentSearch(e.target.value)}
                    className="pl-9"
                    data-testid="input-bid-search"
                  />
                </div>
                {freeAgentResults.length > 0 && (
                  <div className="border rounded-md max-h-60 overflow-auto">
                    {freeAgentResults.map(player => (
                      <div
                        key={player.id}
                        className="p-3 hover-elevate cursor-pointer flex items-center justify-between border-b last:border-b-0"
                        onClick={() => {
                          setSelectedPlayer(player);
                          setFreeAgentSearch("");
                        }}
                        data-testid={`player-option-${player.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge className={positionColors[player.position] || "bg-gray-500"}>
                            {player.position}
                          </Badge>
                          <span className="font-medium">{player.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {player.team || "FA"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <Badge className={positionColors[selectedPlayer.position] || "bg-gray-500"}>
                      {selectedPlayer.position}
                    </Badge>
                    <span className="font-medium">{selectedPlayer.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {selectedPlayer.team || "FA"}
                    </span>
                  </div>
                  {!editingBid && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPlayer(null)}
                      data-testid="button-clear-player"
                    >
                      Change
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bid Amount Per Year ($M)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="e.g., 15.5"
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      data-testid="input-bid-amount"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max Bid Per Year ($M)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      placeholder="Optional"
                      value={maxBid}
                      onChange={(e) => setMaxBid(e.target.value)}
                      data-testid="input-max-bid"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Contract Length (Years)</Label>
                  <Select value={contractYears} onValueChange={setContractYears}>
                    <SelectTrigger data-testid="select-contract-years">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Year (No limit)</SelectItem>
                      <SelectItem value="2" disabled={isContractYearDisabled(2)}>
                        2 Years ({remainingSlots[2]}/{CONTRACT_LIMITS[2]} remaining)
                      </SelectItem>
                      <SelectItem value="3" disabled={isContractYearDisabled(3)}>
                        3 Years ({remainingSlots[3]}/{CONTRACT_LIMITS[3]} remaining)
                      </SelectItem>
                      <SelectItem value="4" disabled={isContractYearDisabled(4)}>
                        4 Years ({remainingSlots[4]}/{CONTRACT_LIMITS[4]} remaining)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Limits: 2 four-year, 3 three-year, 3 two-year contracts per team
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    placeholder="Optional notes for this bid..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="input-bid-notes"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitBid}
                    disabled={!bidAmount || createBidMutation.isPending || updateBidMutation.isPending}
                    className="flex-1"
                    data-testid="button-submit-bid"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingBid ? "Update Bid" : "Place Bid"}
                  </Button>
                  {editingBid && (
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Your Bids
              <Badge variant="secondary" className="ml-auto">
                Private to your team
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading bids...</div>
            ) : activeBids.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No active bids yet.</p>
                <p className="text-sm mt-1">Search for free agents to place your first bid.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {activeBids.map((bid) => (
                    <div
                      key={bid.id}
                      className="p-3 border rounded-md space-y-2"
                      data-testid={`bid-card-${bid.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={positionColors[bid.playerPosition] || "bg-gray-500"}>
                            {bid.playerPosition}
                          </Badge>
                          <span className="font-medium">{bid.playerName}</span>
                          <span className="text-sm text-muted-foreground">
                            {bid.playerTeam || "FA"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditBid(bid)}
                            data-testid={`button-edit-bid-${bid.id}`}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteBidMutation.mutate(bid.id)}
                            data-testid={`button-delete-bid-${bid.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Per Year:</span>{" "}
                          <span className="font-medium">${bid.bidAmount}M</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Years:</span>{" "}
                          <span className="font-medium">{bid.contractYears}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Value:</span>{" "}
                          <span className="font-medium" style={{ color: COLORS.salaries }}>
                            ${(bid.bidAmount * bid.contractYears).toFixed(1)}M
                          </span>
                        </div>
                        {bid.maxBid && (
                          <div>
                            <span className="text-muted-foreground">Max/Yr:</span>{" "}
                            <span className="font-medium">${bid.maxBid}M</span>
                          </div>
                        )}
                      </div>
                      {bid.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          {bid.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4" />
            <span>
              Your bids are private and only visible to you. Other teams cannot see your bid amounts or target players.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ExpiringContractsTabProps {
  teams: TeamCapData[];
  playerMap: PlayerMap;
  contractData: ContractDataStore;
  leagueUsers: any[];
}

interface ExpiringPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  currentSalary: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  rosterId: number;
}

function ExpiringContractsTab({ teams, playerMap, contractData, leagueUsers }: ExpiringContractsTabProps) {
  const { season } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  
  // Build a map of playerId -> team info for roster players
  const playerTeamMap = useMemo(() => {
    const map = new Map<string, { teamName: string; ownerName: string; avatar: string | null; rosterId: number }>();
    for (const team of teams) {
      for (const playerId of team.players) {
        map.set(playerId, {
          teamName: team.teamName,
          ownerName: team.ownerName,
          avatar: team.avatar,
          rosterId: team.rosterId,
        });
      }
    }
    return map;
  }, [teams]);

  const expiringPlayers = useMemo(() => {
    const players: ExpiringPlayer[] = [];
    
    // Iterate over ALL contracts in the database
    for (const rosterId of Object.keys(contractData)) {
      const teamContracts = contractData[rosterId];
      const team = teams.find(t => t.rosterId.toString() === rosterId);
      
      for (const playerId of Object.keys(teamContracts)) {
        const player = playerMap[playerId];
        if (!player) continue;
        
        const contract = teamContracts[playerId];
        if (!contract) continue;
        
        // Check if player is on current roster (either this team or any team)
        const playerTeam = playerTeamMap.get(playerId);
        if (!playerTeam) continue; // Player not on any roster
        
        const salary2025 = contract.salaries[2025] || 0;
        const salary2026 = contract.salaries[2026] || 0;
        const salary2027 = contract.salaries[2027] || 0;
        const salary2028 = contract.salaries[2028] || 0;
        const salary2029 = contract.salaries[2029] || 0;
        
        // Find the last year with a non-zero salary
        let lastPaidYear = 0;
        if (salary2029 > 0) lastPaidYear = 2029;
        else if (salary2028 > 0) lastPaidYear = 2028;
        else if (salary2027 > 0) lastPaidYear = 2027;
        else if (salary2026 > 0) lastPaidYear = 2026;
        else if (salary2025 > 0) lastPaidYear = 2025;
        
        // Player is expiring if their last paid year is the current year (2025)
        if (lastPaidYear === CURRENT_YEAR && salary2025 > 0) {
          players.push({
            playerId,
            name: player.name,
            position: player.position || "NA",
            nflTeam: player.team || null,
            yearsExp: player.yearsExp ?? 0,
            currentSalary: salary2025,
            teamName: playerTeam.teamName,
            ownerName: playerTeam.ownerName,
            avatar: playerTeam.avatar,
            rosterId: playerTeam.rosterId,
          });
        }
      }
    }
    
    return players.sort((a, b) => b.currentSalary - a.currentSalary);
  }, [teams, playerMap, contractData, playerTeamMap]);

  const totalExpiringValue = expiringPlayers.reduce((sum, p) => sum + p.currentSalary, 0);
  const positionCounts = expiringPlayers.reduce((acc, p) => {
    acc[p.position] = (acc[p.position] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {expiringPlayers.length}
              </div>
              <p className="text-sm text-muted-foreground">Expiring Contracts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                ${totalExpiringValue.toFixed(1)}M
              </div>
              <p className="text-sm text-muted-foreground">Total Expiring Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex justify-center gap-2 flex-wrap">
                {Object.entries(positionCounts).map(([pos, count]) => (
                  <Badge key={pos} className={`${positionColors[pos] || "bg-gray-500 text-white"}`}>
                    {pos}: {count}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-2">By Position</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Players in Final Contract Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Player</TableHead>
                  <TableHead className="text-center w-[60px]">Pos</TableHead>
                  <TableHead className="text-center w-[60px]">NFL</TableHead>
                  <TableHead className="text-center w-[60px]">Exp</TableHead>
                  <TableHead className="text-right w-[100px]">2025 Salary</TableHead>
                  <TableHead className="text-right w-[100px]">Dead Cap</TableHead>
                  <TableHead className="w-[180px]">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringPlayers.map((player) => {
                  const deadCap = Math.ceil(player.currentSalary * 0.5);
                  
                  return (
                    <TableRow key={`${player.rosterId}-${player.playerId}`} data-testid={`row-expiring-${player.playerId}`}>
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
                      <TableCell className="text-right">
                        <span className="font-medium tabular-nums" style={{ color: COLORS.salaries }}>
                          ${player.currentSalary.toFixed(1)}M
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums" style={{ color: COLORS.deadCap }}>
                          ${deadCap}M
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {player.avatar ? (
                              <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${player.avatar}`} />
                            ) : null}
                            <AvatarFallback className="text-[8px]">
                              {player.teamName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{player.teamName}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {expiringPlayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No players with expiring contracts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span>Players shown have salary for 2025 only, with no contract beyond this season.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  franchiseTagUsed: number;
  franchiseTagYear: number | null;
  originalContractYears: number;
  extensionApplied: number;
  extensionYear: number | null;
  extensionSalary: number | null;
  updatedAt: number;
}

interface DbDeadCapEntry {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  reason: string;
  deadCap2025: number;
  deadCap2026: number;
  deadCap2027: number;
  deadCap2028: number;
  deadCap2029: number;
  createdAt: number;
}

interface OrphanedContract {
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  contract: {
    salary2025: number;
    salary2026: number;
    salary2027: number;
    salary2028: number;
    salary2029: number;
  };
  teamName: string;
}

interface ContractApprovalRequest {
  id: string;
  leagueId: string;
  rosterId: number;
  teamName: string;
  ownerName: string;
  contractsJson: string;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewerNotes: string | null;
}

interface ApprovalContractData {
  playerId: string;
  playerName: string;
  playerPosition: string;
  salary2025: number;
  salary2026: number;
  salary2027: number;
  salary2028: number;
  salary2029: number;
  franchiseTagApplied?: number;
}

interface ContractApprovalsTabProps {
  leagueId: string;
}

function ContractApprovalsTab({ leagueId }: ContractApprovalsTabProps) {
  const { toast } = useToast();
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [reviewDialog, setReviewDialog] = useState<{ request: ContractApprovalRequest; action: "approve" | "reject" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: approvalRequests, isLoading: isLoadingRequests } = useQuery<ContractApprovalRequest[]>({
    queryKey: ["/api/league", leagueId, "contract-approvals"],
    enabled: !!leagueId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status, notes }: { requestId: string; status: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/league/${leagueId}/contract-approvals/${requestId}`, {
        status,
        reviewerNotes: notes,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contract-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      toast({
        title: variables.status === "approved" ? "Contracts Approved" : "Contracts Rejected",
        description: variables.status === "approved" 
          ? "The contracts have been approved and are now official."
          : "The contract request has been rejected.",
      });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process the request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const pendingRequests = approvalRequests?.filter(r => r.status === "pending") || [];
  const reviewedRequests = approvalRequests?.filter(r => r.status !== "pending") || [];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const parseContracts = (json: string): ApprovalContractData[] => {
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  const calculateTotalSalary = (contracts: ApprovalContractData[], year: number) => {
    const key = `salary${year}` as keyof ApprovalContractData;
    return contracts.reduce((sum, c) => sum + (Number(c[key]) || 0), 0) / 10;
  };

  if (isLoadingRequests) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (pendingRequests.length === 0 && reviewedRequests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Approval Requests</h2>
            <p className="text-muted-foreground">
              Teams haven't submitted any contracts for approval yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Contract Approval Requests</h2>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="w-3 h-3" />
          {pendingRequests.length} Pending
        </Badge>
      </div>

      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-yellow-500" />
            Pending Requests ({pendingRequests.length})
          </h3>
          
          {pendingRequests.map(request => {
            const contracts = parseContracts(request.contractsJson);
            const isExpanded = expandedRequests.has(request.id);
            
            return (
              <Card key={request.id} data-testid={`card-approval-${request.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {request.teamName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{request.teamName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{contracts.length} players</Badge>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatDate(request.submittedAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[2025, 2026, 2027, 2028].map(year => (
                      <Card key={year} className="p-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">{year}</div>
                          <div className="font-bold text-sm text-primary">
                            ${calculateTotalSalary(contracts, year).toFixed(1)}M
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mb-3"
                    onClick={() => toggleExpanded(request.id)}
                    data-testid={`button-expand-${request.id}`}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Contract Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Contract Details ({contracts.length} players)
                      </>
                    )}
                  </Button>

                  {isExpanded && (
                    <ScrollArea className="h-[300px] mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Player</TableHead>
                            <TableHead className="text-center">Pos</TableHead>
                            {[2025, 2026, 2027, 2028, 2029].map((year, idx) => (
                              <TableHead key={year} className="text-center">{idx === 4 ? `${year} (Ext)` : year}</TableHead>
                            ))}
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Remaining</TableHead>
                            <TableHead className="text-center">Tag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contracts.map(contract => {
                            const salary2025 = (Number(contract.salary2025) || 0) / 10;
                            const salary2026 = (Number(contract.salary2026) || 0) / 10;
                            const salary2027 = (Number(contract.salary2027) || 0) / 10;
                            const salary2028 = (Number(contract.salary2028) || 0) / 10;
                            const salary2029 = (Number(contract.salary2029) || 0) / 10;
                            const totalValue = salary2025 + salary2026 + salary2027 + salary2028 + salary2029;
                            const remainingValue = salary2026 + salary2027 + salary2028 + salary2029;
                            
                            return (
                              <TableRow key={contract.playerId}>
                                <TableCell className="font-medium">{contract.playerName}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className={`${positionColors[contract.playerPosition] || "bg-gray-500 text-white"} text-[10px]`}>
                                    {contract.playerPosition}
                                  </Badge>
                                </TableCell>
                                {[2025, 2026, 2027, 2028, 2029].map(year => {
                                  const key = `salary${year}` as keyof ApprovalContractData;
                                  const salary = (Number(contract[key]) || 0) / 10;
                                  return (
                                    <TableCell key={year} className="text-center">
                                      {salary > 0 ? `$${salary.toFixed(1)}M` : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-medium text-primary">
                                  {totalValue > 0 ? `$${totalValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center font-medium text-emerald-600">
                                  {remainingValue > 0 ? `$${remainingValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {contract.franchiseTagApplied ? (
                                    <Badge variant="default" className="text-[10px]">FT</Badge>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}

                  <Separator className="my-3" />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setReviewDialog({ request, action: "reject" })}
                      data-testid={`button-reject-${request.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => setReviewDialog({ request, action: "approve" })}
                      data-testid={`button-approve-${request.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reviewedRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <CheckCircle className="w-4 h-4" />
            Previously Reviewed ({reviewedRequests.length})
          </h3>
          
          {reviewedRequests.map(request => {
            const contracts = parseContracts(request.contractsJson);
            const isExpanded = expandedRequests.has(request.id);
            
            return (
              <Card key={request.id} className="opacity-90" data-testid={`card-reviewed-${request.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {request.teamName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{request.teamName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{contracts.length} players</Badge>
                      <Badge 
                        variant={request.status === "approved" ? "default" : "destructive"}
                      >
                        {request.status === "approved" ? (
                          <><CheckCircle className="w-3 h-3 mr-1" /> Approved</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" /> Rejected</>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {request.reviewedAt && formatDate(request.reviewedAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {request.reviewerNotes && (
                    <p className="text-sm text-muted-foreground italic mb-3">
                      "{request.reviewerNotes}"
                    </p>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => toggleExpanded(request.id)}
                    data-testid={`button-expand-reviewed-${request.id}`}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Contract Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Contract Details ({contracts.length} players)
                      </>
                    )}
                  </Button>

                  {isExpanded && (
                    <ScrollArea className="h-[300px] mt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Player</TableHead>
                            <TableHead className="text-center">Pos</TableHead>
                            {[2025, 2026, 2027, 2028, 2029].map((year, idx) => (
                              <TableHead key={year} className="text-center">{idx === 4 ? `${year} (Ext)` : year}</TableHead>
                            ))}
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Remaining</TableHead>
                            <TableHead className="text-center">Tag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contracts.map(contract => {
                            const salary2025 = (Number(contract.salary2025) || 0) / 10;
                            const salary2026 = (Number(contract.salary2026) || 0) / 10;
                            const salary2027 = (Number(contract.salary2027) || 0) / 10;
                            const salary2028 = (Number(contract.salary2028) || 0) / 10;
                            const salary2029 = (Number(contract.salary2029) || 0) / 10;
                            const totalValue = salary2025 + salary2026 + salary2027 + salary2028 + salary2029;
                            const remainingValue = salary2026 + salary2027 + salary2028 + salary2029;
                            
                            return (
                              <TableRow key={contract.playerId}>
                                <TableCell className="font-medium">{contract.playerName}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className={`${positionColors[contract.playerPosition] || "bg-gray-500 text-white"} text-[10px]`}>
                                    {contract.playerPosition}
                                  </Badge>
                                </TableCell>
                                {[2025, 2026, 2027, 2028, 2029].map(year => {
                                  const key = `salary${year}` as keyof ApprovalContractData;
                                  const salary = (Number(contract[key]) || 0) / 10;
                                  return (
                                    <TableCell key={year} className="text-center">
                                      {salary > 0 ? `$${salary.toFixed(1)}M` : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-medium text-primary">
                                  {totalValue > 0 ? `$${totalValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center font-medium text-emerald-600">
                                  {remainingValue > 0 ? `$${remainingValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {contract.franchiseTagApplied ? (
                                    <Badge variant="default" className="text-[10px]">FT</Badge>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve Contracts" : "Reject Contracts"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewDialog?.action === "approve" 
                ? `Are you sure you want to approve the contracts for ${reviewDialog?.request.teamName}? This will make these contracts official.`
                : `Are you sure you want to reject the contracts for ${reviewDialog?.request.teamName}?`
              }
            </p>
            
            <div>
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes for the team owner..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-1"
                data-testid="input-review-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === "approve" ? "default" : "destructive"}
              onClick={() => {
                if (reviewDialog) {
                  reviewMutation.mutate({
                    requestId: reviewDialog.request.id,
                    status: reviewDialog.action === "approve" ? "approved" : "rejected",
                    notes: reviewNotes || undefined,
                  });
                }
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "Processing..." : reviewDialog?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Contracts() {
  const { toast } = useToast();
  const { user, league, isLoading, season } = useSleeper();
  const [, setLocation] = useLocation();
  const [selectedTeam, setSelectedTeam] = useState<TeamCapData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [contractData, setContractData] = useState<ContractDataStore>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Memoized year constants from Sleeper season - used consistently across all components
  const yearConstants = useMemo(() => {
    const currentYear = parseInt(season) || new Date().getFullYear();
    return {
      CURRENT_YEAR: currentYear,
      CONTRACT_YEARS: [currentYear, currentYear + 1, currentYear + 2, currentYear + 3],
      OPTION_YEAR: currentYear + 4,
    };
  }, [season]);
  
  const { CURRENT_YEAR, CONTRACT_YEARS, OPTION_YEAR } = yearConstants;

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

  const { data: dbContracts, refetch: refetchContracts } = useQuery<DbPlayerContract[]>({
    queryKey: ["/api/league", league?.leagueId, "contracts"],
    enabled: !!league?.leagueId,
  });

  const { data: deadCapEntries, refetch: refetchDeadCap } = useQuery<DbDeadCapEntry[]>({
    queryKey: ["/api/leagues", league?.leagueId, "dead-cap"],
    enabled: !!league?.leagueId,
  });

  useEffect(() => {
    if (dbContracts && dbContracts.length > 0) {
      const contractStore: ContractDataStore = {};
      for (const contract of dbContracts) {
        const rosterId = contract.rosterId.toString();
        if (!contractStore[rosterId]) {
          contractStore[rosterId] = {};
        }
        contractStore[rosterId][contract.playerId] = {
          salaries: {
            2025: contract.salary2025 / 10,
            2026: contract.salary2026 / 10,
            2027: contract.salary2027 / 10,
            2028: contract.salary2028 / 10,
          },
          fifthYearOption: contract.fifthYearOption as "accepted" | "declined" | null,
          isOnIr: contract.isOnIr === 1,
          originalContractYears: contract.originalContractYears || 0,
        };
      }
      setContractData(contractStore);
    }
  }, [dbContracts]);

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

  const rosterPlayerMap = useMemo(() => {
    if (!rosters) return new Map<number, Set<string>>();
    const map = new Map<number, Set<string>>();
    for (const roster of rosters) {
      map.set(roster.roster_id, new Set(roster.players || []));
    }
    return map;
  }, [rosters]);

  const orphanedContracts = useMemo(() => {
    if (!dbContracts || !rosters || !leagueUsers || !playerMap) return [];
    
    const userMap = new Map(
      (leagueUsers || []).map((u: any) => [u.user_id, u])
    );
    
    const rosterOwnerMap = new Map(
      (rosters || []).map((r: any) => {
        const owner = userMap.get(r.owner_id);
        return [r.roster_id, owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`];
      })
    );
    
    const orphans: OrphanedContract[] = [];
    
    for (const contract of dbContracts) {
      const rosterPlayers = rosterPlayerMap.get(contract.rosterId);
      const isOnRoster = rosterPlayers?.has(contract.playerId) ?? false;
      const hasSalary = contract.salary2025 > 0 || contract.salary2026 > 0 || 
                        contract.salary2027 > 0 || contract.salary2028 > 0 ||
                        (contract.salary2029 || 0) > 0;
      
      if (!isOnRoster && hasSalary) {
        const player = playerMap[contract.playerId];
        orphans.push({
          rosterId: contract.rosterId,
          playerId: contract.playerId,
          playerName: player?.name || `Unknown (${contract.playerId})`,
          playerPosition: player?.position || "NA",
          contract: {
            salary2025: contract.salary2025,
            salary2026: contract.salary2026,
            salary2027: contract.salary2027,
            salary2028: contract.salary2028,
            salary2029: contract.salary2029 || 0,
          },
          teamName: rosterOwnerMap.get(contract.rosterId) || `Team ${contract.rosterId}`,
        });
      }
    }
    
    return orphans;
  }, [dbContracts, rosters, leagueUsers, playerMap, rosterPlayerMap]);

  const processCutTradeMutation = useMutation({
    mutationFn: async (data: { 
      rosterId: number; 
      playerId: string; 
      playerName: string;
      playerPosition: string;
      reason: string; 
      contract: any;
    }) => {
      const response = await apiRequest("POST", `/api/leagues/${league?.leagueId}/process-cut-trade`, data);
      return response.json();
    },
    onSuccess: () => {
      refetchContracts();
      refetchDeadCap();
      toast({
        title: "Contract Processed",
        description: "The contract has been converted to dead cap.",
      });
    },
    onError: (error) => {
      console.error("Error processing cut/trade:", error);
      toast({
        title: "Error",
        description: "Failed to process the cut/trade. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContractChange = (
    rosterId: string, 
    playerId: string, 
    field: "salaries" | "fifthYearOption" | "isOnIr" | "originalContractYears", 
    value: any
  ) => {
    setContractData(prev => {
      const teamContracts = prev[rosterId] || {};
      const playerContract = teamContracts[playerId] || { 
        salaries: {},
        fifthYearOption: null,
        isOnIr: false,
        originalContractYears: 0
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

  const saveContractsMutation = useMutation({
    mutationFn: async (contracts: any[]) => {
      const response = await apiRequest("POST", `/api/league/${league?.leagueId}/contracts`, {
        contracts,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "contracts"] });
      toast({
        title: "Contracts Saved",
        description: "All contract data has been saved to the database.",
      });
      setHasChanges(false);
    },
    onError: (error) => {
      console.error("Error saving contracts:", error);
      toast({
        title: "Error",
        description: "Failed to save contracts. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = async () => {
    if (!league?.leagueId) return;

    const contractsToSave: any[] = [];
    const contractsToDelete: Array<{rosterId: number, playerId: string}> = [];
    const invalidContracts: string[] = []; // Track players with invalid contract length
    
    for (const rosterId of Object.keys(contractData)) {
      const teamContracts = contractData[rosterId];
      for (const playerId of Object.keys(teamContracts)) {
        const contract = teamContracts[playerId];
        const hasSalary = Object.values(contract.salaries).some(s => s > 0);
        
        // Calculate salaries
        const salary2025 = Math.round((contract.salaries[2025] || 0) * 10);
        const salary2026 = Math.round((contract.salaries[2026] || 0) * 10);
        const salary2027 = Math.round((contract.salaries[2027] || 0) * 10);
        const salary2028 = Math.round((contract.salaries[2028] || 0) * 10);
        
        if (hasSalary || contract.isOnIr) {
          // Determine originalContractYears: use commissioner-set value if valid,
          // otherwise preserve existing DB value
          let originalContractYears = 0;
          const existingContract = dbContracts?.find(c => c.playerId === playerId && c.rosterId === parseInt(rosterId));
          
          if (contract.originalContractYears >= 1 && contract.originalContractYears <= 4) {
            // Commissioner explicitly set a valid value
            originalContractYears = contract.originalContractYears;
          } else if (existingContract?.originalContractYears && existingContract.originalContractYears >= 1) {
            // Preserve existing DB value
            originalContractYears = existingContract.originalContractYears;
          } else {
            // New contract without valid length - this is invalid
            // Track this player for validation error
            invalidContracts.push(playerId);
            continue; // Skip this contract, don't save it
          }
          
          contractsToSave.push({
            rosterId: parseInt(rosterId),
            playerId,
            salary2025,
            salary2026,
            salary2027,
            salary2028,
            fifthYearOption: contract.fifthYearOption,
            isOnIr: contract.isOnIr ? 1 : 0,
            originalContractYears,
          });
        } else {
          // All salaries are 0 and not on IR - check if this player had a contract before
          const existingContract = dbContracts?.find(c => c.playerId === playerId && c.rosterId === parseInt(rosterId));
          if (existingContract) {
            // Player had a contract, now all zeros - mark for deletion
            contractsToDelete.push({
              rosterId: parseInt(rosterId),
              playerId,
            });
          }
        }
      }
    }

    // Show validation error if any new contracts are missing contract length
    if (invalidContracts.length > 0) {
      toast({
        title: "Missing Contract Length",
        description: `${invalidContracts.length} player(s) have salaries but no contract length set. Please set a contract length (1-4 years) for all new contracts.`,
        variant: "destructive",
      });
      // Still continue to save valid contracts and delete cleared ones
    }

    // Delete contracts that were cleared (set to all zeros)
    for (const { rosterId, playerId } of contractsToDelete) {
      try {
        await apiRequest("DELETE", `/api/league/${league.leagueId}/contracts/${rosterId}/${playerId}`);
      } catch (error) {
        console.error(`Failed to delete contract for player ${playerId}:`, error);
      }
    }

    // Save/update contracts with non-zero values
    if (contractsToSave.length > 0) {
      saveContractsMutation.mutate(contractsToSave);
    } else if (contractsToDelete.length > 0) {
      // If we only deleted contracts (no saves), still refresh and show success
      queryClient.invalidateQueries({ queryKey: ["/api/league", league.leagueId, "contracts"] });
      toast({
        title: "Contracts Updated",
        description: `${contractsToDelete.length} contract(s) cleared successfully.`,
      });
      setHasChanges(false);
    } else if (invalidContracts.length === 0) {
      // No contracts to save, delete, or invalid - nothing changed
      toast({
        title: "No Changes",
        description: "No contract changes to save.",
      });
    }
  };

  if (isLoading || !league || !user) {
    return null;
  }

  const userMap = new Map(
    (leagueUsers || []).map((u: any) => [u.user_id, u])
  );

  const teamDeadCapMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!deadCapEntries) return map;
    
    for (const entry of deadCapEntries) {
      const currentDeadCap = map.get(entry.rosterId) || 0;
      map.set(entry.rosterId, currentDeadCap + (entry.deadCap2025 / 10));
    }
    return map;
  }, [deadCapEntries]);

  const teamCapData: TeamCapData[] = (rosters || []).map((roster: any) => {
    const owner = userMap.get(roster.owner_id);
    const rosterId = roster.roster_id.toString();
    const teamContracts = contractData[rosterId] || {};
    const salaries = calculateTeamSalary(roster.players || [], teamContracts, CURRENT_YEAR);
    const deadCap = teamDeadCapMap.get(roster.roster_id) || 0;
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
        contractData[selectedTeam.rosterId.toString()] || {},
        CURRENT_YEAR
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
          <TabsTrigger value="expiring" data-testid="tab-expiring">Expiring Contracts</TabsTrigger>
          <TabsTrigger value="manage-team" data-testid="tab-manage-team">Manage Team Contracts</TabsTrigger>
          <TabsTrigger value="bidding" data-testid="tab-bidding">Player Bidding</TabsTrigger>
          {isCommissioner && (
            <>
              <TabsTrigger value="manage-league" data-testid="tab-manage-league">Manage League Contracts</TabsTrigger>
              <TabsTrigger value="approvals" data-testid="tab-approvals">Approvals</TabsTrigger>
            </>
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

        <TabsContent value="expiring" className="mt-6">
          {Object.keys(playerMap).length > 0 && (
            <ExpiringContractsTab
              teams={teamCapData}
              playerMap={playerMap}
              contractData={contractData}
              leagueUsers={leagueUsers || []}
            />
          )}
        </TabsContent>

        <TabsContent value="manage-team" className="mt-6">
          {Object.keys(playerMap).length > 0 && playersArray && (
            <ManageTeamContractsTab
              userTeam={userTeam}
              playerMap={playerMap}
              leagueContractData={contractData}
              allPlayers={playersArray}
              rosterPlayerIds={allRosterPlayerIds}
              dbContracts={dbContracts || []}
              leagueId={league?.leagueId || ""}
            />
          )}
        </TabsContent>

        <TabsContent value="bidding" className="mt-6">
          {Object.keys(playerMap).length > 0 && playersArray && userTeam && (
            <PlayerBiddingTab
              userTeam={userTeam}
              allPlayers={playersArray}
              rosterPlayerIds={allRosterPlayerIds}
              teamContracts={contractData[userTeam.rosterId.toString()] || {}}
            />
          )}
        </TabsContent>

        {isCommissioner && (
          <>
          <TabsContent value="manage-league" className="mt-6 space-y-6">
            {orphanedContracts.length > 0 && (
              <Card className="border-orange-500/50">
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading flex items-center gap-2 text-orange-500">
                    <AlertTriangle className="w-5 h-5" />
                    Cut/Traded Players Requiring Action ({orphanedContracts.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These players have contracts but are no longer on their assigned roster. 
                    Process them to convert their remaining contract to dead cap.
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-3">
                      {orphanedContracts.map((orphan) => {
                        const totalRemaining = (orphan.contract.salary2025 + orphan.contract.salary2026 + 
                                                orphan.contract.salary2027 + orphan.contract.salary2028) / 10;
                        const deadCapY1 = orphan.contract.salary2025 * 0.4 / 10;
                        const deadCapY2 = (orphan.contract.salary2025 * 0.3 + orphan.contract.salary2026 * 0.4) / 10;
                        
                        return (
                          <div 
                            key={`${orphan.rosterId}-${orphan.playerId}`}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage 
                                  src={`https://sleepercdn.com/content/nfl/players/${orphan.playerId}.jpg`}
                                  alt={orphan.playerName}
                                />
                                <AvatarFallback className="text-xs">
                                  {orphan.playerName.split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{orphan.playerName}</span>
                                  <Badge className={positionColors[orphan.playerPosition] || "bg-gray-500"}>
                                    {orphan.playerPosition}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {orphan.teamName} • Remaining: ${totalRemaining.toFixed(1)}M
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => processCutTradeMutation.mutate({
                                  rosterId: orphan.rosterId,
                                  playerId: orphan.playerId,
                                  playerName: orphan.playerName,
                                  playerPosition: orphan.playerPosition,
                                  reason: "cut",
                                  contract: orphan.contract,
                                })}
                                disabled={processCutTradeMutation.isPending}
                                data-testid={`button-process-cut-${orphan.playerId}`}
                              >
                                <UserMinus className="w-4 h-4 mr-1" />
                                Cut
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => processCutTradeMutation.mutate({
                                  rosterId: orphan.rosterId,
                                  playerId: orphan.playerId,
                                  playerName: orphan.playerName,
                                  playerPosition: orphan.playerPosition,
                                  reason: "traded",
                                  contract: orphan.contract,
                                })}
                                disabled={processCutTradeMutation.isPending}
                                data-testid={`button-process-trade-${orphan.playerId}`}
                              >
                                <ArrowRightLeft className="w-4 h-4 mr-1" />
                                Traded
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {deadCapEntries && deadCapEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading flex items-center gap-2" style={{ color: COLORS.deadCap }}>
                    <DollarSign className="w-5 h-5" />
                    Dead Cap Entries ({deadCapEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-center">Reason</TableHead>
                          <TableHead className="text-center">2025</TableHead>
                          <TableHead className="text-center">2026</TableHead>
                          <TableHead className="text-center">2027</TableHead>
                          <TableHead className="text-center">2028</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deadCapEntries.map((entry) => {
                          const team = teamCapData.find(t => t.rosterId === entry.rosterId);
                          return (
                            <TableRow key={entry.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge className={positionColors[entry.playerPosition] || "bg-gray-500"}>
                                    {entry.playerPosition}
                                  </Badge>
                                  <span className="font-medium">{entry.playerName}</span>
                                </div>
                              </TableCell>
                              <TableCell>{team?.teamName || `Team ${entry.rosterId}`}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="capitalize">
                                  {entry.reason}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center tabular-nums" style={{ color: COLORS.deadCap }}>
                                ${(entry.deadCap2025 / 10).toFixed(1)}M
                              </TableCell>
                              <TableCell className="text-center tabular-nums" style={{ color: COLORS.deadCap }}>
                                ${(entry.deadCap2026 / 10).toFixed(1)}M
                              </TableCell>
                              <TableCell className="text-center tabular-nums" style={{ color: COLORS.deadCap }}>
                                ${(entry.deadCap2027 / 10).toFixed(1)}M
                              </TableCell>
                              <TableCell className="text-center tabular-nums" style={{ color: COLORS.deadCap }}>
                                ${(entry.deadCap2028 / 10).toFixed(1)}M
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

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

          <TabsContent value="approvals" className="mt-6">
            {league?.leagueId && (
              <ContractApprovalsTab leagueId={league.leagueId} />
            )}
          </TabsContent>
          </>
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
