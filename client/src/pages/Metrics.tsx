import { useSleeper } from "@/lib/sleeper-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  TrendingUp, 
  TrendingDown, 
  Minus,
  Sparkles,
  Clover,
  Info,
  ChevronDown,
  ChevronUp,
  Flame,
  Snowflake,
  ThermometerSun,
} from "lucide-react";
import { useState } from "react";

interface WeeklyLuck {
  week: number;
  luck: number;
  points: number;
  median: number;
  won: boolean;
}

interface TeamLuck {
  rosterId: number;
  name: string;
  ownerId: string;
  initials: string;
  avatar: string | null;
  totalLuck: number;
  weeklyLuck: WeeklyLuck[];
  luckyWins: number;
  unluckyLosses: number;
  wins: number;
  losses: number;
}

interface TeamLuckResponse {
  teams: TeamLuck[];
  currentWeek: number;
  completedWeeks: number;
}

interface HeatCheckPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  recentAvg: number;
  seasonAvg: number;
  difference: number;
  percentChange: number;
  recentGames: number;
  earlierGames: number;
  weeklyPoints: { week: number; points: number }[];
  isHot: boolean;
}

interface HeatCheckResponse {
  players: HeatCheckPlayer[];
  currentWeek: number;
  recentWeeksCount: number;
  message?: string;
}

function LuckBadge({ luck }: { luck: number }) {
  if (luck > 0) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
        <Clover className="w-3 h-3 mr-1" />
        +{luck}
      </Badge>
    );
  } else if (luck < 0) {
    return (
      <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
        <TrendingDown className="w-3 h-3 mr-1" />
        {luck}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Minus className="w-3 h-3 mr-1" />
      0
    </Badge>
  );
}

function WeeklyLuckIndicator({ weekLuck }: { weekLuck: WeeklyLuck }) {
  const { luck, points, median, won } = weekLuck;
  
  let bgColor = "bg-muted";
  let title = "";
  
  if (luck > 0) {
    bgColor = "bg-emerald-500";
    title = `Lucky Win: Scored ${points.toFixed(1)} (below median ${median.toFixed(1)}) but won`;
  } else if (luck < 0) {
    bgColor = "bg-red-500";
    title = `Unlucky Loss: Scored ${points.toFixed(1)} (above median ${median.toFixed(1)}) but lost`;
  } else if (won) {
    bgColor = "bg-primary/50";
    title = `Deserved Win: Scored ${points.toFixed(1)} (above median ${median.toFixed(1)})`;
  } else {
    bgColor = "bg-muted-foreground/30";
    title = `Deserved Loss: Scored ${points.toFixed(1)} (below median ${median.toFixed(1)})`;
  }
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={`w-6 h-6 rounded-sm ${bgColor} flex items-center justify-center text-xs font-medium cursor-help`}
          data-testid={`luck-week-${weekLuck.week}`}
        >
          {weekLuck.week}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">Week {weekLuck.week}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function TeamLuckRow({ team, rank, isUser, expanded, onToggle }: { 
  team: TeamLuck; 
  rank: number; 
  isUser: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const luckRating = team.totalLuck > 2 ? "Very Lucky" : 
                     team.totalLuck > 0 ? "Lucky" :
                     team.totalLuck < -2 ? "Very Unlucky" :
                     team.totalLuck < 0 ? "Unlucky" : "Neutral";
  
  return (
    <>
      <TableRow 
        className={`cursor-pointer ${isUser ? "bg-primary/5" : ""}`}
        onClick={onToggle}
        data-testid={`row-team-luck-${team.rosterId}`}
      >
        <TableCell className="font-medium text-center w-10">
          {rank}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
              <AvatarFallback 
                className={`text-xs ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {team.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className={`font-medium ${isUser ? "text-primary" : ""}`}>
                {team.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {team.wins}-{team.losses}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-center">
          <LuckBadge luck={team.totalLuck} />
        </TableCell>
        <TableCell className="text-center">
          <span className={team.totalLuck > 0 ? "text-emerald-500" : team.totalLuck < 0 ? "text-red-500" : "text-muted-foreground"}>
            {luckRating}
          </span>
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
            {team.luckyWins}
          </Badge>
        </TableCell>
        <TableCell className="text-center">
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">
            {team.unluckyLosses}
          </Badge>
        </TableCell>
        <TableCell className="text-center w-10">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className={isUser ? "bg-primary/5" : ""}>
          <TableCell colSpan={7} className="p-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">Weekly Luck Breakdown</p>
              <div className="flex flex-wrap gap-1.5">
                {team.weeklyLuck.map((wl) => (
                  <WeeklyLuckIndicator key={wl.week} weekLuck={wl} />
                ))}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                  <span>Lucky Win (below median)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-red-500" />
                  <span>Unlucky Loss (above median)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-primary/50" />
                  <span>Deserved Win</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-muted-foreground/30" />
                  <span>Deserved Loss</span>
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function HeatCheckRow({ player }: { player: HeatCheckPlayer }) {
  const isHot = player.difference > 0;
  const intensity = Math.abs(player.difference);
  
  const getHeatLevel = () => {
    if (intensity >= 10) return isHot ? "On Fire" : "Ice Cold";
    if (intensity >= 5) return isHot ? "Hot" : "Cold";
    if (intensity >= 2) return isHot ? "Warming Up" : "Cooling Down";
    return "Neutral";
  };
  
  const heatLevel = getHeatLevel();
  
  return (
    <TableRow data-testid={`row-heat-check-${player.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isHot ? "bg-red-500/20" : "bg-blue-500/20"
          }`}>
            {isHot ? (
              <Flame className="w-5 h-5 text-red-500" />
            ) : (
              <Snowflake className="w-5 h-5 text-blue-500" />
            )}
          </div>
          <div>
            <p className="font-medium">{player.name}</p>
            <p className="text-xs text-muted-foreground">
              {player.position} - {player.team || "FA"}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{player.recentAvg.toFixed(1)}</span>
        <p className="text-xs text-muted-foreground">Last 4 wks</p>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{player.seasonAvg.toFixed(1)}</span>
        <p className="text-xs text-muted-foreground">Prior avg</p>
      </TableCell>
      <TableCell className="text-center">
        <span className={`font-bold text-lg ${isHot ? "text-red-500" : "text-blue-500"}`}>
          {player.difference >= 0 ? "+" : ""}{player.difference.toFixed(1)}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge 
          className={`${
            isHot 
              ? "bg-red-500/20 text-red-500 border-red-500/30" 
              : "bg-blue-500/20 text-blue-500 border-blue-500/30"
          }`}
        >
          {isHot ? <Flame className="w-3 h-3 mr-1" /> : <Snowflake className="w-3 h-3 mr-1" />}
          {heatLevel}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <span className={isHot ? "text-red-500" : "text-blue-500"}>
          {player.percentChange >= 0 ? "+" : ""}{player.percentChange.toFixed(0)}%
        </span>
      </TableCell>
    </TableRow>
  );
}

export default function Metrics() {
  const { user, league } = useSleeper();
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  
  const { data: luckData, isLoading: luckLoading } = useQuery<TeamLuckResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "team-luck"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/team-luck`);
      if (!res.ok) throw new Error("Failed to fetch team luck");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: heatData, isLoading: heatLoading } = useQuery<HeatCheckResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "heat-check", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/heat-check/${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch heat check");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const toggleExpanded = (rosterId: number) => {
    setExpandedTeam(expandedTeam === rosterId ? null : rosterId);
  };

  const luckiestTeam = luckData?.teams[0];
  const unluckiestTeam = luckData?.teams[luckData.teams.length - 1];
  const userTeam = luckData?.teams.find(t => t.ownerId === user?.userId);

  const hottestPlayer = heatData?.players.filter(p => p.isHot)[0];
  const coldestPlayer = heatData?.players.filter(p => !p.isHot)[0];
  const hotPlayers = heatData?.players.filter(p => p.isHot) || [];
  const coldPlayers = heatData?.players.filter(p => !p.isHot) || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold" data-testid="text-metrics-title">
          Advanced Metrics
        </h1>
        <p className="text-muted-foreground">
          Deep analytics and insights for your dynasty league
        </p>
      </div>

      <Tabs defaultValue="luck" className="space-y-6">
        <TabsList data-testid="tabs-metrics">
          <TabsTrigger value="luck" data-testid="tab-luck">
            <Clover className="w-4 h-4 mr-2" />
            Team Luck
          </TabsTrigger>
          <TabsTrigger value="heat" data-testid="tab-heat-check">
            <ThermometerSun className="w-4 h-4 mr-2" />
            Heat Check
          </TabsTrigger>
        </TabsList>

        <TabsContent value="luck" className="space-y-6">
          {/* Summary Cards */}
          {luckLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map(i => (
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
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Clover className="w-3.5 h-3.5 text-emerald-500" />
                    Luckiest Team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {luckiestTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {luckiestTeam.avatar && <AvatarImage src={luckiestTeam.avatar} alt={luckiestTeam.name} />}
                          <AvatarFallback className="text-xs bg-emerald-500 text-white">
                            {luckiestTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-luckiest-team">{luckiestTeam.name}</span>
                      </div>
                      <LuckBadge luck={luckiestTeam.totalLuck} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No data</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    Unluckiest Team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {unluckiestTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {unluckiestTeam.avatar && <AvatarImage src={unluckiestTeam.avatar} alt={unluckiestTeam.name} />}
                          <AvatarFallback className="text-xs bg-red-500 text-white">
                            {unluckiestTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-unluckiest-team">{unluckiestTeam.name}</span>
                      </div>
                      <LuckBadge luck={unluckiestTeam.totalLuck} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No data</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Your Team's Luck
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {userTeam.avatar && <AvatarImage src={userTeam.avatar} alt={userTeam.name} />}
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {userTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-user-luck-team">{userTeam.name}</span>
                      </div>
                      <LuckBadge luck={userTeam.totalLuck} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No data</span>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Explanation Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                How Luck is Calculated
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Each week, we compare your score to the <strong>league median</strong> (the middle score among all teams).
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <span className="text-emerald-500 font-medium">+1 Lucky Win:</span> Won while scoring below the median
                </li>
                <li>
                  <span className="text-red-500 font-medium">-1 Unlucky Loss:</span> Lost while scoring above the median
                </li>
                <li>
                  <span className="text-muted-foreground font-medium">0 Neutral:</span> Won above median or lost below median (deserved outcome)
                </li>
              </ul>
              <p className="pt-2">
                A positive total means you've won games you "shouldn't have" based on weekly performance. 
                A negative total means you've lost games despite outperforming most of the league.
              </p>
            </CardContent>
          </Card>

          {/* Full Standings Table */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Clover className="w-5 h-5 text-emerald-500" />
                Team Luck Rankings
              </CardTitle>
              <CardDescription>
                {luckData?.completedWeeks 
                  ? `Based on ${luckData.completedWeeks} completed week${luckData.completedWeeks !== 1 ? "s" : ""}`
                  : "Calculating luck based on completed weeks"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {luckLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : luckData?.teams && luckData.teams.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-center">Luck Score</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Lucky Ws
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Wins while scoring below league median</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Unlucky Ls
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Losses while scoring above league median</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {luckData.teams.map((team, idx) => (
                      <TeamLuckRow 
                        key={team.rosterId}
                        team={team}
                        rank={idx + 1}
                        isUser={team.ownerId === user?.userId}
                        expanded={expandedTeam === team.rosterId}
                        onToggle={() => toggleExpanded(team.rosterId)}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clover className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No luck data available yet.</p>
                  <p className="text-sm">Check back after the first week is complete.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heat" className="space-y-6">
          {/* Heat Check Summary Cards */}
          {heatLoading ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map(i => (
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
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-red-500" />
                    Hottest Player
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hottestPlayer ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                          <Flame className="w-4 h-4 text-red-500" />
                        </div>
                        <div>
                          <span className="font-medium" data-testid="text-hottest-player">{hottestPlayer.name}</span>
                          <p className="text-xs text-muted-foreground">{hottestPlayer.position}</p>
                        </div>
                      </div>
                      <span className="text-red-500 font-bold">+{hottestPlayer.difference.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No hot players</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Snowflake className="w-3.5 h-3.5 text-blue-500" />
                    Coldest Player
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {coldestPlayer ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <Snowflake className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <span className="font-medium" data-testid="text-coldest-player">{coldestPlayer.name}</span>
                          <p className="text-xs text-muted-foreground">{coldestPlayer.position}</p>
                        </div>
                      </div>
                      <span className="text-blue-500 font-bold">{coldestPlayer.difference.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No cold players</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ThermometerSun className="w-3.5 h-3.5 text-primary" />
                    Roster Temperature
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-red-500" />
                      <span className="font-bold text-red-500" data-testid="text-hot-count">{hotPlayers.length}</span>
                      <span className="text-sm text-muted-foreground">hot</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Snowflake className="w-4 h-4 text-blue-500" />
                      <span className="font-bold text-blue-500" data-testid="text-cold-count">{coldPlayers.length}</span>
                      <span className="text-sm text-muted-foreground">cold</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Explanation Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                How Heat Check Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                We compare each player's <strong>last 4 weeks average</strong> to their <strong>season average before those 4 weeks</strong>.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <span className="text-red-500 font-medium">Hot players:</span> Performing above their baseline (positive difference)
                </li>
                <li>
                  <span className="text-blue-500 font-medium">Cold players:</span> Performing below their baseline (negative difference)
                </li>
              </ul>
              <p className="pt-2">
                Use this to identify players who are trending up or down compared to their earlier season performance.
              </p>
            </CardContent>
          </Card>

          {/* Hot Players Table */}
          {hotPlayers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Flame className="w-5 h-5 text-red-500" />
                  Hot Players
                </CardTitle>
                <CardDescription>
                  Players performing above their season average
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Recent Avg</TableHead>
                      <TableHead className="text-center">Prior Avg</TableHead>
                      <TableHead className="text-center">Difference</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hotPlayers.map(player => (
                      <HeatCheckRow key={player.id} player={player} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Cold Players Table */}
          {coldPlayers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Snowflake className="w-5 h-5 text-blue-500" />
                  Cold Players
                </CardTitle>
                <CardDescription>
                  Players performing below their season average
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Recent Avg</TableHead>
                      <TableHead className="text-center">Prior Avg</TableHead>
                      <TableHead className="text-center">Difference</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coldPlayers.map(player => (
                      <HeatCheckRow key={player.id} player={player} />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* No data state */}
          {!heatLoading && (!heatData?.players || heatData.players.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ThermometerSun className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No heat check data available yet.</p>
                <p className="text-sm mt-1">
                  {heatData?.message || "Check back after at least 5 weeks of the season."}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
