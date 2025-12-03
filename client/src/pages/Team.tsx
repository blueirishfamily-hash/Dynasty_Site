import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import PlayerTable from "@/components/PlayerTable";
import PositionDepthChart from "@/components/PositionDepthChart";
import PlayerModal from "@/components/PlayerModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Users, 
  Swords, 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Minus,
} from "lucide-react";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type RosterStatus = "starter" | "bench" | "taxi" | "ir";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age?: number;
  status: RosterStatus;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
}

interface DepthPlayer {
  id: string;
  name: string;
  team: string | null;
  points: number;
  medianPoints: number;
  percentAboveMedian: number;
}

interface DepthData {
  grade: string;
  players: DepthPlayer[];
}

type ModalPosition = "QB" | "RB" | "WR" | "TE";

interface RivalryMatchup {
  season: string;
  week: number;
  userPoints: number;
  oppPoints: number;
  won: boolean;
}

interface Rivalry {
  ownerId: string;
  name: string;
  initials: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  matchups: RivalryMatchup[];
}

interface RivalryResponse {
  rivalries: Rivalry[];
  seasons: string[];
  totalSeasons: number;
}

const getPlayerDetails = (player: Player) => ({
  id: player.id,
  name: player.name,
  position: player.position as ModalPosition,
  team: player.team || "FA",
  age: player.age || 0,
  seasonPoints: player.seasonPoints,
  weeklyAvg: player.weeklyAvg,
  positionRank: player.positionRank,
  weeklyStats: Array.from({ length: 11 }, (_, i) => ({
    week: i + 1,
    points: player.weeklyAvg + (Math.random() - 0.5) * 15,
  })),
  news: [
    `${player.name} had a strong performance in the recent game`,
    `${player.team || "The"} offense continues to feature ${player.name} heavily`,
  ],
  schedule: [
    { week: 12, opponent: "KC", isHome: true },
    { week: 13, opponent: "SF", isHome: false },
    { week: 14, opponent: "LAR", isHome: true },
    { week: 15, opponent: "DET", isHome: false },
  ],
});

function RivalryRow({ 
  rivalry, 
  rank,
  expanded,
  onToggle,
}: { 
  rivalry: Rivalry; 
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = rivalry.wins + rivalry.losses + rivalry.ties;
  const winRate = total > 0 ? (rivalry.wins / total) * 100 : 0;
  const avgPointsFor = total > 0 ? rivalry.pointsFor / total : 0;
  const avgPointsAgainst = total > 0 ? rivalry.pointsAgainst / total : 0;
  const pointDiff = rivalry.pointsFor - rivalry.pointsAgainst;
  
  const dominanceLevel = winRate >= 70 ? "Dominant" : 
                         winRate >= 55 ? "Winning" :
                         winRate >= 45 ? "Even" :
                         winRate >= 30 ? "Losing" : "Dominated";
  
  const dominanceColor = winRate >= 70 ? "text-emerald-500" : 
                         winRate >= 55 ? "text-emerald-400" :
                         winRate >= 45 ? "text-muted-foreground" :
                         winRate >= 30 ? "text-red-400" : "text-red-500";
  
  return (
    <>
      <TableRow 
        className="cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`row-rivalry-${rivalry.ownerId}`}
      >
        <TableCell className="font-medium text-center w-10">
          {rank}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              {rivalry.avatar && <AvatarImage src={rivalry.avatar} alt={rivalry.name} />}
              <AvatarFallback className="text-xs bg-muted">
                {rivalry.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{rivalry.name}</p>
              <p className="text-xs text-muted-foreground">
                {total} game{total !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="text-emerald-500 font-semibold">{rivalry.wins}</span>
            <span className="text-muted-foreground">-</span>
            <span className="text-red-500 font-semibold">{rivalry.losses}</span>
            {rivalry.ties > 0 && (
              <>
                <span className="text-muted-foreground">-</span>
                <span className="text-muted-foreground font-semibold">{rivalry.ties}</span>
              </>
            )}
          </div>
        </TableCell>
        <TableCell className="text-center">
          <span className={dominanceColor + " font-medium"}>
            {winRate.toFixed(0)}%
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className={dominanceColor}>
            {dominanceLevel}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <span className={pointDiff >= 0 ? "text-emerald-500" : "text-red-500"}>
            {pointDiff >= 0 ? "+" : ""}{pointDiff.toFixed(1)}
          </span>
        </TableCell>
        <TableCell className="text-center w-10">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="p-4 bg-muted/30">
            <div className="space-y-4">
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Avg PF:</span>
                  <span className="ml-1 font-medium">{avgPointsFor.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg PA:</span>
                  <span className="ml-1 font-medium">{avgPointsAgainst.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total PF:</span>
                  <span className="ml-1 font-medium">{rivalry.pointsFor.toFixed(1)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total PA:</span>
                  <span className="ml-1 font-medium">{rivalry.pointsAgainst.toFixed(1)}</span>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-2">Match History</p>
                <div className="flex flex-wrap gap-1.5">
                  {rivalry.matchups.map((m, idx) => (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <div 
                          className={`w-7 h-7 rounded-sm flex items-center justify-center text-xs font-medium cursor-help ${
                            m.won 
                              ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" 
                              : m.userPoints === m.oppPoints
                              ? "bg-muted text-muted-foreground border border-border"
                              : "bg-red-500/20 text-red-500 border border-red-500/30"
                          }`}
                          data-testid={`matchup-${m.season}-${m.week}`}
                        >
                          {m.won ? "W" : m.userPoints === m.oppPoints ? "T" : "L"}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-medium">{m.season} Week {m.week}</p>
                        <p className="text-xs">
                          {m.userPoints.toFixed(1)} - {m.oppPoints.toFixed(1)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Team() {
  const { user, league } = useSleeper();
  const [selectedPlayer, setSelectedPlayer] = useState<ReturnType<typeof getPlayerDetails> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedRivalry, setExpandedRivalry] = useState<string | null>(null);

  const { data: roster, isLoading: rosterLoading } = useQuery<Player[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "roster", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/roster/${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const { data: depthData, isLoading: depthLoading } = useQuery<Record<string, DepthData>>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "depth", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/depth/${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch depth analysis");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const { data: rivalryData, isLoading: rivalryLoading } = useQuery<RivalryResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "rivalry", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/rivalry/${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch rivalry data");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(getPlayerDetails(player));
    setModalOpen(true);
  };

  const toggleRivalry = (ownerId: string) => {
    setExpandedRivalry(expandedRivalry === ownerId ? null : ownerId);
  };

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view your team.
          </p>
        </div>
      </div>
    );
  }

  // Calculate rivalry stats
  const totalGames = rivalryData?.rivalries.reduce((acc, r) => acc + r.wins + r.losses + r.ties, 0) || 0;
  const totalWins = rivalryData?.rivalries.reduce((acc, r) => acc + r.wins, 0) || 0;
  const totalLosses = rivalryData?.rivalries.reduce((acc, r) => acc + r.losses, 0) || 0;
  const overallWinRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
  
  // Find best and worst rivalry
  const bestRivalry = rivalryData?.rivalries.filter(r => r.wins + r.losses >= 2)
    .sort((a, b) => {
      const aRate = a.wins / (a.wins + a.losses + a.ties);
      const bRate = b.wins / (b.wins + b.losses + b.ties);
      return bRate - aRate;
    })[0];
  
  const worstRivalry = rivalryData?.rivalries.filter(r => r.wins + r.losses >= 2)
    .sort((a, b) => {
      const aRate = a.wins / (a.wins + a.losses + a.ties);
      const bRate = b.wins / (b.wins + b.losses + b.ties);
      return aRate - bRate;
    })[0];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold" data-testid="text-team-title">My Team</h1>
        <p className="text-muted-foreground">Manage your roster and analyze your performance</p>
      </div>

      <Tabs defaultValue="roster" className="space-y-6">
        <TabsList data-testid="tabs-team">
          <TabsTrigger value="roster" data-testid="tab-roster">
            <Users className="w-4 h-4 mr-2" />
            Roster
          </TabsTrigger>
          <TabsTrigger value="rivalry" data-testid="tab-rivalry">
            <Swords className="w-4 h-4 mr-2" />
            Rivalry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              {rosterLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full mb-2" />
                    ))}
                  </CardContent>
                </Card>
              ) : roster && roster.length > 0 ? (
                <PlayerTable players={roster} onPlayerClick={handlePlayerClick} />
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No roster data available
                  </CardContent>
                </Card>
              )}
            </div>
            <div>
              {depthLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-40" />
                  </CardHeader>
                  <CardContent>
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full mb-3" />
                    ))}
                  </CardContent>
                </Card>
              ) : depthData ? (
                <PositionDepthChart depthData={depthData} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rivalry" className="space-y-6">
          {/* Summary Cards */}
          {rivalryLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                    All-Time Record
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-xl font-bold">
                    <span className="text-emerald-500">{totalWins}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-red-500">{totalLosses}</span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid="text-all-time-record">
                    {overallWinRate.toFixed(1)}% win rate
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5 text-muted-foreground" />
                    Seasons Tracked
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold" data-testid="text-seasons-tracked">
                    {rivalryData?.totalSeasons || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {rivalryData?.seasons.join(", ") || "No data"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    Best Matchup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bestRivalry ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        {bestRivalry.avatar && <AvatarImage src={bestRivalry.avatar} alt={bestRivalry.name} />}
                        <AvatarFallback className="text-xs bg-emerald-500 text-white">
                          {bestRivalry.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm truncate" data-testid="text-best-rivalry">{bestRivalry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bestRivalry.wins}-{bestRivalry.losses}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not enough data</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    Toughest Matchup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {worstRivalry ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        {worstRivalry.avatar && <AvatarImage src={worstRivalry.avatar} alt={worstRivalry.name} />}
                        <AvatarFallback className="text-xs bg-red-500 text-white">
                          {worstRivalry.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm truncate" data-testid="text-worst-rivalry">{worstRivalry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {worstRivalry.wins}-{worstRivalry.losses}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not enough data</span>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Rivalry Table */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" />
                Head-to-Head Records
              </CardTitle>
              <CardDescription>
                Historical matchup results against each team in your league
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rivalryLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : rivalryData?.rivalries && rivalryData.rivalries.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Opponent</TableHead>
                      <TableHead className="text-center">Record</TableHead>
                      <TableHead className="text-center">Win %</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Pt Diff</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rivalryData.rivalries.map((rivalry, idx) => (
                      <RivalryRow 
                        key={rivalry.ownerId}
                        rivalry={rivalry}
                        rank={idx + 1}
                        expanded={expandedRivalry === rivalry.ownerId}
                        onToggle={() => toggleRivalry(rivalry.ownerId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Swords className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No rivalry data available yet.</p>
                  <p className="text-sm">Check back after playing some matchups.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PlayerModal player={selectedPlayer} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
