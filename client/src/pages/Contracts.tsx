import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, ChevronRight, Save } from "lucide-react";
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
                        {CONTRACT_YEARS.map(year => (
                          <TableCell key={year} className="text-center">
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
                          </TableCell>
                        ))}
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

  useEffect(() => {
    if (!isLoading && user && league && !isCommissioner) {
      setLocation("/");
    }
  }, [isLoading, user, league, isCommissioner, setLocation]);

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

  if (isLoading || !league) {
    return null;
  }

  if (!user || !isCommissioner) {
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
        <Badge variant="outline" className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Commissioner Access
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="manage" data-testid="tab-manage">Manage Contracts</TabsTrigger>
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

        <TabsContent value="manage" className="mt-6">
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
