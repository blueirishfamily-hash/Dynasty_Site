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

export default function Metrics() {
  const { user, league } = useSleeper();
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  
  const { data: luckData, isLoading } = useQuery<TeamLuckResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "team-luck"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/team-luck`);
      if (!res.ok) throw new Error("Failed to fetch team luck");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const toggleExpanded = (rosterId: number) => {
    setExpandedTeam(expandedTeam === rosterId ? null : rosterId);
  };

  const luckiestTeam = luckData?.teams[0];
  const unluckiestTeam = luckData?.teams[luckData.teams.length - 1];
  const userTeam = luckData?.teams.find(t => t.ownerId === user?.userId);

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
        </TabsList>

        <TabsContent value="luck" className="space-y-6">
          {/* Summary Cards */}
          {isLoading ? (
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
              {isLoading ? (
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
      </Tabs>
    </div>
  );
}
