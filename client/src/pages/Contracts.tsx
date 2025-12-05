import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
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

interface PlayerContract {
  playerId: string;
  name: string;
  position: string;
  salary: number;
  yearsRemaining: number;
  deadCap: number;
  status: "active" | "ir" | "pup";
}

interface PlayerContractInput {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  salaries: Record<number, number>;
  fifthYearOption: boolean | null;
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

const sampleCapData: Record<number, { salaries: number; deadCap: number }> = {
  1: { salaries: 180, deadCap: 15 },
  2: { salaries: 165, deadCap: 8 },
  3: { salaries: 195, deadCap: 22 },
  4: { salaries: 142, deadCap: 5 },
  5: { salaries: 210, deadCap: 18 },
  6: { salaries: 155, deadCap: 12 },
  7: { salaries: 175, deadCap: 10 },
  8: { salaries: 188, deadCap: 7 },
  9: { salaries: 162, deadCap: 25 },
  10: { salaries: 198, deadCap: 14 },
  11: { salaries: 145, deadCap: 3 },
  12: { salaries: 172, deadCap: 20 },
};

const positionColors: Record<string, string> = {
  QB: "bg-rose-500 text-white",
  RB: "bg-emerald-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

function generatePlayerContracts(
  players: string[],
  allPlayers: Record<string, any>,
  totalSalary: number,
  totalDeadCap: number
): PlayerContract[] {
  if (!players || players.length === 0) return [];

  const validPlayers = players
    .filter(id => allPlayers[id])
    .map(id => ({
      id,
      player: allPlayers[id],
    }));

  if (validPlayers.length === 0) return [];

  const salaryPerPlayer = totalSalary / validPlayers.length;
  const deadCapPerPlayer = totalDeadCap / Math.max(3, Math.floor(validPlayers.length * 0.2));

  return validPlayers.map((p, index) => {
    const positionMultiplier = 
      p.player.position === "QB" ? 1.8 :
      p.player.position === "RB" ? 1.2 :
      p.player.position === "WR" ? 1.3 :
      p.player.position === "TE" ? 1.0 :
      0.5;

    const baseSalary = salaryPerPlayer * positionMultiplier * (0.5 + Math.random());
    const hasDeadCap = index < 3;
    const status: "active" | "ir" | "pup" = 
      p.player.injury_status === "IR" ? "ir" : 
      p.player.injury_status === "PUP" ? "pup" : "active";

    return {
      playerId: p.id,
      name: `${p.player.first_name} ${p.player.last_name}`,
      position: p.player.position || "NA",
      salary: Math.round(baseSalary * 10) / 10,
      yearsRemaining: Math.floor(Math.random() * 4) + 1,
      deadCap: hasDeadCap ? Math.round(deadCapPerPlayer * (0.5 + Math.random()) * 10) / 10 : 0,
      status,
    };
  }).sort((a, b) => b.salary - a.salary);
}

function getPlayerContractInputs(
  players: string[],
  allPlayers: Record<string, any>,
  savedContracts: Record<string, { salaries: Record<number, number>; fifthYearOption: boolean | null }>
): PlayerContractInput[] {
  if (!players || players.length === 0) return [];

  return players
    .filter(id => allPlayers[id])
    .map(id => {
      const player = allPlayers[id];
      const yearsExp = player.years_exp ?? 0;
      const isRookie = yearsExp <= 4;
      const saved = savedContracts[id];

      return {
        playerId: id,
        name: `${player.first_name} ${player.last_name}`,
        position: player.position || "NA",
        nflTeam: player.team || null,
        yearsExp,
        salaries: saved?.salaries || CONTRACT_YEARS.reduce((acc, year) => ({ ...acc, [year]: 0 }), {}),
        fifthYearOption: isRookie ? (saved?.fifthYearOption ?? null) : null,
      };
    })
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name);
    });
}

function TeamCapChart({ team, onClick }: { team: TeamCapData; onClick: () => void }) {
  const data = [
    { name: "Available", value: Math.max(0, team.available), color: COLORS.available },
    { name: "Salaries", value: team.salaries, color: COLORS.salaries },
    { name: "Dead Cap", value: team.deadCap, color: COLORS.deadCap },
  ].filter(d => d.value > 0);

  const isOverCap = team.available < 0;

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
                formatter={(value: number) => [`$${value}M`, ""]}
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
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
          <div>
            <div className="font-medium" style={{ color: COLORS.salaries }}>${team.salaries}M</div>
            <div className="text-muted-foreground">Salaries</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: COLORS.deadCap }}>${team.deadCap}M</div>
            <div className="text-muted-foreground">Dead Cap</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
              ${team.available}M
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
  contracts: PlayerContract[];
  open: boolean;
  onClose: () => void;
}

function TeamContractModal({ team, contracts, open, onClose }: TeamContractModalProps) {
  if (!team) return null;

  const isOverCap = team.available < 0;
  const totalContractSalary = contracts.reduce((sum, c) => sum + c.salary, 0);
  const totalContractDeadCap = contracts.reduce((sum, c) => sum + c.deadCap, 0);

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
              <Badge variant="destructive">Over Cap by ${Math.abs(team.available)}M</Badge>
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
                  ${team.salaries}M
                </div>
                <p className="text-xs text-muted-foreground">Salaries</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: COLORS.deadCap }}>
                  ${team.deadCap}M
                </div>
                <p className="text-xs text-muted-foreground">Dead Cap</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
                  ${team.available}M
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
                <TableHead className="text-center">Position</TableHead>
                <TableHead className="text-center">Years</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Dead Cap</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.playerId} data-testid={`row-contract-${contract.playerId}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage 
                          src={`https://sleepercdn.com/content/nfl/players/${contract.playerId}.jpg`}
                          alt={contract.name}
                        />
                        <AvatarFallback className="text-xs">
                          {contract.name.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{contract.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={positionColors[contract.position] || "bg-gray-500 text-white"}>
                      {contract.position}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {contract.yearsRemaining}yr
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium" style={{ color: COLORS.salaries }}>
                    ${contract.salary.toFixed(1)}M
                  </TableCell>
                  <TableCell className="text-right tabular-nums" style={{ color: contract.deadCap > 0 ? COLORS.deadCap : "inherit" }}>
                    {contract.deadCap > 0 ? `$${contract.deadCap.toFixed(1)}M` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={contract.status === "active" ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {contract.status === "active" ? "Active" : contract.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {contracts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No contract data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="border-t pt-4 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total ({contracts.length} players)</span>
            <div className="flex gap-6">
              <span>
                Salaries: <span className="font-medium" style={{ color: COLORS.salaries }}>${totalContractSalary.toFixed(1)}M</span>
              </span>
              <span>
                Dead Cap: <span className="font-medium" style={{ color: COLORS.deadCap }}>${totalContractDeadCap.toFixed(1)}M</span>
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
  allPlayers: Record<string, any>;
}

function ContractInputTab({ teams, allPlayers }: ContractInputTabProps) {
  const { toast } = useToast();
  const [selectedRosterId, setSelectedRosterId] = useState<string>(teams[0]?.rosterId.toString() || "");
  const [contractData, setContractData] = useState<Record<string, Record<string, { salaries: Record<number, number>; fifthYearOption: boolean | null }>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const selectedTeam = teams.find(t => t.rosterId.toString() === selectedRosterId);
  
  const playerInputs = selectedTeam 
    ? getPlayerContractInputs(
        selectedTeam.players, 
        allPlayers, 
        contractData[selectedRosterId] || {}
      )
    : [];

  const handleSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setContractData(prev => {
      const teamContracts = prev[selectedRosterId] || {};
      const playerContract = teamContracts[playerId] || { 
        salaries: CONTRACT_YEARS.reduce((acc, y) => ({ ...acc, [y]: 0 }), {}),
        fifthYearOption: null 
      };
      return {
        ...prev,
        [selectedRosterId]: {
          ...teamContracts,
          [playerId]: {
            ...playerContract,
            salaries: {
              ...playerContract.salaries,
              [year]: numValue
            }
          }
        }
      };
    });
    setHasChanges(true);
  };

  const handleFifthYearOptionChange = (playerId: string, value: boolean) => {
    setContractData(prev => {
      const teamContracts = prev[selectedRosterId] || {};
      const playerContract = teamContracts[playerId] || { 
        salaries: CONTRACT_YEARS.reduce((acc, y) => ({ ...acc, [y]: 0 }), {}),
        fifthYearOption: null 
      };
      return {
        ...prev,
        [selectedRosterId]: {
          ...teamContracts,
          [playerId]: {
            ...playerContract,
            fifthYearOption: value
          }
        }
      };
    });
    setHasChanges(true);
  };

  const handleSave = () => {
    toast({
      title: "Contracts Saved",
      description: `Contract data for ${selectedTeam?.teamName} has been saved.`,
    });
    setHasChanges(false);
  };

  const totalSalaryByYear = CONTRACT_YEARS.reduce((acc, year) => {
    const total = playerInputs.reduce((sum, p) => {
      const saved = contractData[selectedRosterId]?.[p.playerId];
      return sum + (saved?.salaries?.[year] || 0);
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
          onClick={handleSave} 
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
                    <TableHead className="w-[200px]">Player</TableHead>
                    {CONTRACT_YEARS.map(year => (
                      <TableHead key={year} className="text-center w-[100px]">{year}</TableHead>
                    ))}
                    <TableHead className="text-center w-[120px]">5th Year Option</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playerInputs.map((player) => {
                    const isRookie = player.yearsExp <= 4;
                    const savedContract = contractData[selectedRosterId]?.[player.playerId];
                    
                    return (
                      <TableRow key={player.playerId} data-testid={`row-input-${player.playerId}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-10 w-10">
                              <AvatarImage 
                                src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                                alt={player.name}
                              />
                              <AvatarFallback className="text-xs">
                                {player.name.split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">{player.name}</div>
                              <div className="flex items-center gap-1">
                                <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                                  {player.position}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {player.nflTeam || "FA"}
                                </span>
                                {isRookie && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary text-primary">
                                    Yr {player.yearsExp + 1}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        {CONTRACT_YEARS.map(year => (
                          <TableCell key={year} className="text-center">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">$</span>
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                className="h-8 w-20 text-center tabular-nums"
                                placeholder="0.0"
                                value={savedContract?.salaries?.[year] || ""}
                                onChange={(e) => handleSalaryChange(player.playerId, year, e.target.value)}
                                data-testid={`input-salary-${player.playerId}-${year}`}
                              />
                              <span className="text-xs text-muted-foreground">M</span>
                            </div>
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          {isRookie ? (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant={savedContract?.fifthYearOption === true ? "default" : "outline"}
                                className="h-7 px-3 text-xs"
                                onClick={() => handleFifthYearOptionChange(player.playerId, true)}
                                data-testid={`button-fifth-year-yes-${player.playerId}`}
                              >
                                Yes
                              </Button>
                              <Button
                                size="sm"
                                variant={savedContract?.fifthYearOption === false ? "default" : "outline"}
                                className="h-7 px-3 text-xs"
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
  const { user, league, isLoading } = useSleeper();
  const [, setLocation] = useLocation();
  const [selectedTeam, setSelectedTeam] = useState<TeamCapData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

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

  const { data: allPlayers } = useQuery<Record<string, any>>({
    queryKey: ["/api/sleeper/players"],
    enabled: !!league?.leagueId,
  });

  useEffect(() => {
    if (!isLoading && user && league && !isCommissioner) {
      setLocation("/");
    }
  }, [isLoading, user, league, isCommissioner, setLocation]);

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
    const capInfo = sampleCapData[roster.roster_id] || { salaries: 150, deadCap: 10 };
    const available = TOTAL_CAP - capInfo.salaries - capInfo.deadCap;

    return {
      rosterId: roster.roster_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`,
      ownerName: owner?.display_name || "Unknown",
      avatar: owner?.avatar || null,
      salaries: capInfo.salaries,
      deadCap: capInfo.deadCap,
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

  const selectedTeamContracts = selectedTeam && allPlayers
    ? generatePlayerContracts(selectedTeam.players, allPlayers, selectedTeam.salaries, selectedTeam.deadCap)
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
                    ${totalSalaries}M
                  </div>
                  <p className="text-sm text-muted-foreground">Total Salaries</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: COLORS.deadCap }}>
                    ${totalDeadCap}M
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
          {allPlayers && (
            <ContractInputTab teams={teamCapData} allPlayers={allPlayers} />
          )}
        </TabsContent>
      </Tabs>

      <TeamContractModal
        team={selectedTeam}
        contracts={selectedTeamContracts}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
