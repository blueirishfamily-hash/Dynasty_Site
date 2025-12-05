import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, X, ChevronRight } from "lucide-react";
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

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const TOTAL_CAP = 250;

const COLORS = {
  available: "#3b82f6",
  salaries: "#22c55e",
  deadCap: "#ef4444",
};

interface PlayerContract {
  playerId: string;
  name: string;
  position: string;
  salary: number;
  yearsRemaining: number;
  deadCap: number;
  status: "active" | "ir" | "pup";
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

export default function Contracts() {
  const { user, league, isLoading } = useSleeper();
  const [, setLocation] = useLocation();
  const [selectedTeam, setSelectedTeam] = useState<TeamCapData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

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

      <TeamContractModal
        team={selectedTeam}
        contracts={selectedTeamContracts}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
