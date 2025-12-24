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
  Crown,
} from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

interface HeatCheckTeam {
  rosterId: number;
  ownerId: string;
  name: string;
  initials: string;
  avatar: string | null;
  recentAvg: number;
  seasonAvg: number;
  difference: number;
  percentChange: number;
  recentWeeks: number;
  earlierWeeks: number;
  weeklyPoints: { week: number; points: number }[];
  isHot: boolean;
}

interface HeatCheckResponse {
  teams: HeatCheckTeam[];
  currentWeek: number;
  recentWeeksCount: number;
  message?: string;
}

interface PowerRankingTeam {
  rosterId: number;
  name: string;
  ownerId: string;
  initials: string;
  avatar: string | null;
  allPlayWins: number;
  allPlayLosses: number;
  allPlayWinPct: number;
  actualWins: number;
  actualLosses: number;
  weeklyRankings: { week: number; rank: number; points: number }[];
}

interface PowerRankingsResponse {
  teams: PowerRankingTeam[];
  currentWeek: number;
  completedWeeks: number;
  season?: string;
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

function HeatCheckTeamRow({ team, rank, isUser }: { team: HeatCheckTeam; rank: number; isUser: boolean }) {
  const isHot = team.difference > 0;
  const intensity = Math.abs(team.difference);
  
  const getHeatLevel = () => {
    if (intensity >= 20) return isHot ? "On Fire" : "Ice Cold";
    if (intensity >= 10) return isHot ? "Hot" : "Cold";
    if (intensity >= 5) return isHot ? "Warming Up" : "Cooling Down";
    return "Neutral";
  };
  
  const heatLevel = getHeatLevel();
  
  return (
    <TableRow 
      className={isUser ? "bg-primary/5" : ""}
      data-testid={`row-heat-check-${team.rosterId}`}
    >
      <TableCell className="font-medium text-center w-10">
        {rank}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
            <AvatarFallback 
              className={`text-xs ${isUser ? "bg-primary text-primary-foreground" : isHot ? "bg-red-500/20" : "bg-blue-500/20"}`}
            >
              {team.initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className={`font-medium ${isUser ? "text-primary" : ""}`}>
              {team.name}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{team.recentAvg.toFixed(1)}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className="font-medium">{team.seasonAvg.toFixed(1)}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className={`font-bold text-lg ${isHot ? "text-red-500" : "text-blue-500"}`}>
          {team.difference >= 0 ? "+" : ""}{team.difference.toFixed(1)}
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
          {team.percentChange >= 0 ? "+" : ""}{team.percentChange.toFixed(0)}%
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
    queryKey: ["/api/sleeper/league", league?.leagueId, "heat-check"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/heat-check`);
      if (!res.ok) throw new Error("Failed to fetch heat check");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: powerData, isLoading: powerLoading } = useQuery<PowerRankingsResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/power-rankings`);
      if (!res.ok) throw new Error("Failed to fetch power rankings");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const toggleExpanded = (rosterId: number) => {
    setExpandedTeam(expandedTeam === rosterId ? null : rosterId);
  };

  const luckiestTeam = luckData?.teams[0];
  const unluckiestTeam = luckData?.teams[luckData.teams.length - 1];
  const userLuckTeam = luckData?.teams.find(t => t.ownerId === user?.userId);

  const hottestTeam = heatData?.teams?.filter(t => t.isHot)[0];
  const coldestTeam = heatData?.teams?.filter(t => !t.isHot).slice(-1)[0];
  const userHeatTeam = heatData?.teams?.find(t => t.ownerId === user?.userId);
  const hotTeams = heatData?.teams?.filter(t => t.isHot) || [];
  const coldTeams = heatData?.teams?.filter(t => !t.isHot) || [];

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
          <TabsTrigger value="power" data-testid="tab-power-rankings">
            <Crown className="w-4 h-4 mr-2" />
            Power Rankings
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
                  {userLuckTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {userLuckTeam.avatar && <AvatarImage src={userLuckTeam.avatar} alt={userLuckTeam.name} />}
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {userLuckTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-user-luck-team">{userLuckTeam.name}</span>
                      </div>
                      <LuckBadge luck={userLuckTeam.totalLuck} />
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
                    Hottest Team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hottestTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {hottestTeam.avatar && <AvatarImage src={hottestTeam.avatar} alt={hottestTeam.name} />}
                          <AvatarFallback className="text-xs bg-red-500 text-white">
                            {hottestTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-hottest-team">{hottestTeam.name}</span>
                      </div>
                      <span className="text-red-500 font-bold">+{hottestTeam.difference.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No hot teams</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Snowflake className="w-3.5 h-3.5 text-blue-500" />
                    Coldest Team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {coldestTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {coldestTeam.avatar && <AvatarImage src={coldestTeam.avatar} alt={coldestTeam.name} />}
                          <AvatarFallback className="text-xs bg-blue-500 text-white">
                            {coldestTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-coldest-team">{coldestTeam.name}</span>
                      </div>
                      <span className="text-blue-500 font-bold">{coldestTeam.difference.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No cold teams</span>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <ThermometerSun className="w-3.5 h-3.5 text-primary" />
                    Your Team's Heat
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {userHeatTeam ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {userHeatTeam.avatar && <AvatarImage src={userHeatTeam.avatar} alt={userHeatTeam.name} />}
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                            {userHeatTeam.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium" data-testid="text-user-heat-team">{userHeatTeam.name}</span>
                      </div>
                      <span className={`font-bold ${userHeatTeam.isHot ? "text-red-500" : "text-blue-500"}`}>
                        {userHeatTeam.difference >= 0 ? "+" : ""}{userHeatTeam.difference.toFixed(1)}
                      </span>
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
                How Heat Check Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                We compare each team's <strong>last 4 weeks average score</strong> to their <strong>season average before those 4 weeks</strong>.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  <span className="text-red-500 font-medium">Hot teams:</span> Scoring above their baseline (positive difference)
                </li>
                <li>
                  <span className="text-blue-500 font-medium">Cold teams:</span> Scoring below their baseline (negative difference)
                </li>
              </ul>
              <p className="pt-2">
                Use this to identify which teams are trending up or down compared to their earlier season performance.
              </p>
            </CardContent>
          </Card>

          {/* Heat Check Rankings Table */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <ThermometerSun className="w-5 h-5 text-primary" />
                Team Heat Rankings
              </CardTitle>
              <CardDescription>
                {heatData?.currentWeek 
                  ? `Comparing last 4 weeks to weeks 1-${Math.max(1, heatData.currentWeek - 4)}`
                  : "Calculating heat based on recent performance"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {heatLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : heatData?.teams && heatData.teams.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Recent Avg
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Average points over last 4 weeks</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Prior Avg
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Average points before the last 4 weeks</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-center">Difference</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {heatData.teams.map((team, idx) => (
                      <HeatCheckTeamRow 
                        key={team.rosterId}
                        team={team}
                        rank={idx + 1}
                        isUser={team.ownerId === user?.userId}
                      />
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ThermometerSun className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">No heat check data available yet.</p>
                  <p className="text-sm mt-1">
                    {heatData?.message || "Check back after at least 5 weeks of the season."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="power" className="space-y-6">
          {/* Power Rankings Summary */}
          {powerLoading ? (
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
                    <Crown className="w-3.5 h-3.5 text-yellow-500" />
                    Best All-Play Record
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {powerData?.teams?.[0] ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {powerData.teams[0].avatar && <AvatarImage src={powerData.teams[0].avatar} alt={powerData.teams[0].name} />}
                          <AvatarFallback className="text-xs bg-yellow-500 text-white">
                            {powerData.teams[0].initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{powerData.teams[0].name}</span>
                      </div>
                      <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
                        {powerData.teams[0].allPlayWins}-{powerData.teams[0].allPlayLosses}
                      </Badge>
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
                    Worst All-Play Record
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {powerData?.teams?.[powerData.teams.length - 1] ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                          {powerData.teams[powerData.teams.length - 1].avatar && (
                            <AvatarImage src={powerData.teams[powerData.teams.length - 1].avatar} alt={powerData.teams[powerData.teams.length - 1].name} />
                          )}
                          <AvatarFallback className="text-xs bg-red-500 text-white">
                            {powerData.teams[powerData.teams.length - 1].initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{powerData.teams[powerData.teams.length - 1].name}</span>
                      </div>
                      <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
                        {powerData.teams[powerData.teams.length - 1].allPlayWins}-{powerData.teams[powerData.teams.length - 1].allPlayLosses}
                      </Badge>
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
                    Your All-Play Record
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const userTeam = powerData?.teams?.find(t => t.ownerId === user?.userId);
                    return userTeam ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            {userTeam.avatar && <AvatarImage src={userTeam.avatar} alt={userTeam.name} />}
                            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                              {userTeam.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{userTeam.name}</span>
                        </div>
                        <Badge variant="outline">
                          {userTeam.allPlayWins}-{userTeam.allPlayLosses}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No data</span>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Explanation Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Info className="w-4 h-4" />
                How Power Rankings Work
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>All-Play Record:</strong> Your hypothetical record if you played every team every week.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  If you scored the highest in week 1, you'd beat all 11 opponents (11-0 for that week)
                </li>
                <li>
                  If you scored the lowest, you'd lose to everyone (0-11 for that week)
                </li>
                <li>
                  This removes schedule luck and shows true team strength
                </li>
              </ul>
              <p className="pt-2">
                <strong>Weekly Rankings:</strong> Your scoring rank (1 = highest) compared to all teams each week.
              </p>
            </CardContent>
          </Card>

          {/* All-Play Standings */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                All-Play Standings
              </CardTitle>
              <CardDescription>
                {powerData?.completedWeeks 
                  ? `${powerData.season || ""} Season - ${powerData.completedWeeks} completed week${powerData.completedWeeks !== 1 ? "s" : ""}`
                  : "Calculating all-play records"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {powerLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : powerData?.teams && powerData.teams.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead className="text-center">All-Play Record</TableHead>
                      <TableHead className="text-center">Win %</TableHead>
                      <TableHead className="text-center">Actual Record</TableHead>
                      <TableHead className="text-center">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Diff
                            <Info className="w-3 h-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Difference between all-play wins and actual wins</p>
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {powerData.teams.map((team, idx) => {
                      const isUser = team.ownerId === user?.userId;
                      const numTeams = powerData.teams.length;
                      const expectedWinsPerWeek = (numTeams - 1) / 2;
                      const totalExpectedWins = expectedWinsPerWeek * powerData.completedWeeks;
                      const allPlayDiff = team.allPlayWins - Math.round(totalExpectedWins);
                      const recordDiff = team.allPlayWins - (team.actualWins * (numTeams - 1));
                      
                      return (
                        <TableRow 
                          key={team.rosterId}
                          className={isUser ? "bg-primary/5" : ""}
                          data-testid={`row-power-${team.rosterId}`}
                        >
                          <TableCell className="font-medium text-center w-10">
                            {idx + 1}
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
                              <p className={`font-medium ${isUser ? "text-primary" : ""}`}>
                                {team.name}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-bold">{team.allPlayWins}-{team.allPlayLosses}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              className={
                                team.allPlayWinPct >= 60 
                                  ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30"
                                  : team.allPlayWinPct <= 40
                                    ? "bg-red-500/20 text-red-500 border-red-500/30"
                                    : "bg-muted text-muted-foreground"
                              }
                            >
                              {team.allPlayWinPct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {team.actualWins}-{team.actualLosses}
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              const diff = team.allPlayWins / (powerData.completedWeeks || 1) - (numTeams - 1) / 2;
                              const scaledDiff = Math.round(diff * 10) / 10;
                              return (
                                <span className={
                                  scaledDiff > 0 ? "text-emerald-500" : 
                                  scaledDiff < 0 ? "text-red-500" : 
                                  "text-muted-foreground"
                                }>
                                  {scaledDiff > 0 ? "+" : ""}{scaledDiff.toFixed(1)}/wk
                                </span>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Crown className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No power rankings data available yet.</p>
                  <p className="text-sm">Check back after the first week is complete.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weekly Scoring Rankings Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Weekly Scoring Rankings
              </CardTitle>
              <CardDescription>
                {powerData?.season ? `${powerData.season} Season - ` : ""}Each team's scoring rank (1 = highest scorer) by week
              </CardDescription>
            </CardHeader>
            <CardContent>
              {powerLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : powerData?.teams && powerData.teams.length > 0 && powerData.completedWeeks > 0 ? (
                <ScrollArea className="w-full">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background z-10 min-w-[150px]">Team</TableHead>
                          {Array.from({ length: powerData.completedWeeks }, (_, i) => (
                            <TableHead key={i + 1} className="text-center w-12 px-2">
                              W{i + 1}
                            </TableHead>
                          ))}
                          <TableHead className="text-center px-3">Avg</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {powerData.teams.map((team) => {
                          const isUser = team.ownerId === user?.userId;
                          const avgRank = team.weeklyRankings.length > 0
                            ? team.weeklyRankings.reduce((sum, wr) => sum + wr.rank, 0) / team.weeklyRankings.length
                            : 0;
                          
                          const getRankColor = (rank: number, total: number) => {
                            const percentile = (rank - 1) / (total - 1);
                            if (percentile <= 0.25) return "bg-emerald-500 text-white";
                            if (percentile <= 0.5) return "bg-yellow-500 text-yellow-900 dark:text-yellow-100";
                            if (percentile <= 0.75) return "bg-orange-500 text-orange-900 dark:text-orange-100";
                            return "bg-red-500 text-white";
                          };
                          
                          return (
                            <TableRow 
                              key={team.rosterId}
                              className={isUser ? "bg-primary/5" : ""}
                            >
                              <TableCell className="sticky left-0 bg-background z-10">
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
                                    <AvatarFallback 
                                      className={`text-[10px] ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                                    >
                                      {team.initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className={`text-sm font-medium truncate max-w-[120px] ${isUser ? "text-primary" : ""}`}>
                                    {team.name}
                                  </span>
                                </div>
                              </TableCell>
                              {Array.from({ length: powerData.completedWeeks }, (_, i) => {
                                const weekRanking = team.weeklyRankings.find(wr => wr.week === i + 1);
                                const rank = weekRanking?.rank || "-";
                                const numTeams = powerData.teams.length;
                                
                                return (
                                  <TableCell key={i + 1} className="text-center p-1">
                                    {weekRanking ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div 
                                            className={`w-8 h-8 mx-auto rounded flex items-center justify-center text-xs font-bold cursor-help ${getRankColor(weekRanking.rank, numTeams)}`}
                                          >
                                            {rank}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="font-medium">Week {i + 1}</p>
                                          <p className="text-xs">{weekRanking.points.toFixed(1)} pts</p>
                                          <p className="text-xs text-muted-foreground">Rank #{weekRanking.rank} of {numTeams}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : (
                                      <div className="w-8 h-8 mx-auto rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                        -
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              })}
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-mono">
                                  {avgRank.toFixed(1)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No weekly ranking data available yet.</p>
                  <p className="text-sm">Check back after the first week is complete.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500" />
              <span>Top 25%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-emerald-500/30" />
              <span>25-50%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500/30" />
              <span>50-75%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500" />
              <span>Bottom 25%</span>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
