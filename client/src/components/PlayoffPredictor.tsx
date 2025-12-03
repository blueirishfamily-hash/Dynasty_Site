import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Trophy, Target, Medal, TrendingUp, Info, Hash, Zap, AlertCircle, CheckCircle2, XCircle, ArrowUp, ArrowDown } from "lucide-react";

interface TeamPrediction {
  rosterId: number;
  ownerId: string;
  name: string;
  initials: string;
  currentWins: number;
  currentLosses: number;
  pointsFor: number;
  pointsRank: number;
  pointsBehind: number | null;
  pointsAhead: number | null;
  projectedPointsPerWeek: number;
  division?: number;
  oneSeedPct: number;
  divisionWinnerPct?: number;
  makePlayoffsPct: number;
  projectedWins: number;
  projectedPointsFor: number;
}

interface PlayoffPredictionData {
  predictions: TeamPrediction[];
  playoffTeams: number;
  remainingWeeks: number;
  currentWeek: number;
  hasDivisions: boolean;
  simulationCount: number;
}

interface PlayoffPredictorProps {
  userId?: string;
}

function ProbabilityBar({ 
  value, 
  colorClass = "bg-primary" 
}: { 
  value: number; 
  colorClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-32">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums w-12 text-right">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function getProbabilityColor(pct: number): string {
  const clampedPct = Math.min(pct, 100);
  if (clampedPct >= 100) return "bg-primary";
  if (clampedPct >= 70) return "bg-chart-2";
  if (clampedPct >= 50) return "bg-chart-4";
  if (clampedPct >= 25) return "bg-chart-3";
  if (clampedPct > 0) return "bg-destructive";
  return "bg-muted-foreground/50"; // 0% = grey
}

function getTextColor(pct: number): string {
  const clampedPct = Math.min(pct, 100);
  if (clampedPct >= 100) return "text-primary";
  if (clampedPct >= 70) return "text-chart-2";
  if (clampedPct >= 50) return "text-chart-4";
  if (clampedPct >= 25) return "text-chart-3";
  if (clampedPct > 0) return "text-destructive";
  return "text-muted-foreground"; // 0% = grey
}

function getStandingsBadgeClass(playoffPct: number): string {
  const clampedPct = Math.min(playoffPct, 100);
  if (clampedPct >= 100) return "bg-primary text-primary-foreground";
  if (clampedPct >= 70) return "bg-chart-2 text-white";
  if (clampedPct >= 50) return "bg-chart-4 text-white";
  if (clampedPct >= 25) return "bg-chart-3 text-white";
  if (clampedPct > 0) return "bg-destructive text-destructive-foreground";
  return "bg-muted text-muted-foreground"; // 0% = grey
}

export default function PlayoffPredictor({ userId }: PlayoffPredictorProps) {
  const { league } = useSleeper();

  const { data, isLoading, error } = useQuery<PlayoffPredictionData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  if (!league) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Connect your league to view playoff predictions
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load playoff predictions
        </CardContent>
      </Card>
    );
  }

  const { predictions, playoffTeams, remainingWeeks, hasDivisions, simulationCount } = data;

  const userTeam = predictions.find(p => p.ownerId === userId);

  return (
    <div className="space-y-6">
      {userTeam && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Your Playoff Outlook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Trophy className="w-4 h-4" />
                  <span className="text-sm">1-Seed</span>
                </div>
                <span className={`text-2xl font-bold ${getTextColor(userTeam.oneSeedPct)}`}>
                  {userTeam.oneSeedPct.toFixed(1)}%
                </span>
              </div>
              {hasDivisions && userTeam.divisionWinnerPct !== undefined && (
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Medal className="w-4 h-4" />
                    <span className="text-sm">Win Division</span>
                  </div>
                  <span className={`text-2xl font-bold ${getTextColor(userTeam.divisionWinnerPct)}`}>
                    {userTeam.divisionWinnerPct.toFixed(1)}%
                  </span>
                </div>
              )}
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">Make Playoffs</span>
                </div>
                <span className={`text-2xl font-bold ${getTextColor(userTeam.makePlayoffsPct)}`}>
                  {userTeam.makePlayoffsPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Projected final record: <span className="font-semibold text-foreground">{userTeam.projectedWins.toFixed(1)}-{(14 - userTeam.projectedWins).toFixed(1)}</span>
                {remainingWeeks > 0 && (
                  <span className="ml-2">({remainingWeeks} games remaining)</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Playoff Predictions
              </CardTitle>
              <CardDescription className="mt-1">
                Based on {simulationCount.toLocaleString()} Monte Carlo simulations
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="gap-1">
                  <Info className="w-3 h-3" />
                  {remainingWeeks} weeks left
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tiebreakers: 1) Record, 2) Points Scored,</p>
                <p>3) Head-to-Head Wins</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-center">Record</TableHead>
                  <TableHead className="text-center">Proj.</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Trophy className="w-3 h-3" />
                      1-Seed
                    </div>
                  </TableHead>
                  {hasDivisions && (
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Medal className="w-3 h-3" />
                        Division
                      </div>
                    </TableHead>
                  )}
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Playoffs
                    </div>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 cursor-help">
                          <Hash className="w-3 h-3" />
                          PF Rank
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Points For standings rank</p>
                        <p className="text-xs text-muted-foreground">Used as tiebreaker</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1 cursor-help">
                          <Zap className="w-3 h-3" />
                          Proj PF
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Projected points for</p>
                        <p className="text-xs text-muted-foreground">Based on roster projections</p>
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {predictions.map((team, index) => {
                  const isInPlayoffPosition = index < playoffTeams;
                  const isUser = team.ownerId === userId;

                  return (
                    <TableRow 
                      key={team.rosterId}
                      className={isUser ? "bg-primary/5" : undefined}
                      data-testid={`row-prediction-${team.rosterId}`}
                    >
                      <TableCell className="font-medium">
                        <div 
                          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${getStandingsBadgeClass(team.makePlayoffsPct)}`}
                        >
                          {index + 1}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback 
                              className={`text-xs ${
                                isUser 
                                  ? "bg-primary text-primary-foreground" 
                                  : "bg-muted"
                              }`}
                            >
                              {team.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className={`font-medium ${isUser ? "text-primary" : ""}`}>
                            {team.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {team.currentWins}-{team.currentLosses}
                      </TableCell>
                      <TableCell className="text-center tabular-nums font-medium">
                        {team.projectedWins.toFixed(1)}
                      </TableCell>
                      <TableCell>
                        <ProbabilityBar 
                          value={team.oneSeedPct} 
                          colorClass={getProbabilityColor(team.oneSeedPct)}
                        />
                      </TableCell>
                      {hasDivisions && (
                        <TableCell>
                          <ProbabilityBar 
                            value={team.divisionWinnerPct || 0}
                            colorClass={getProbabilityColor(team.divisionWinnerPct || 0)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <ProbabilityBar 
                          value={team.makePlayoffsPct}
                          colorClass={getProbabilityColor(team.makePlayoffsPct)}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              <Badge variant="outline" className="tabular-nums">
                                #{team.pointsRank}
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{team.pointsFor.toFixed(1)} PF</p>
                            {team.pointsBehind !== null && (
                              <p className="text-xs">
                                <span className="text-chart-2">{team.pointsBehind.toFixed(1)}</span> pts behind #{team.pointsRank - 1}
                              </p>
                            )}
                            {team.pointsAhead !== null && (
                              <p className="text-xs">
                                <span className="text-destructive">{team.pointsAhead.toFixed(1)}</span> pts ahead of #{team.pointsRank + 1}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <span className="text-sm tabular-nums font-medium">
                                {team.projectedPointsFor.toFixed(1)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">Projected End-of-Season PF</p>
                            <p className="text-xs">
                              Current: {team.pointsFor.toFixed(1)}
                            </p>
                            <p className="text-xs">
                              +{(team.projectedPointsFor - team.pointsFor).toFixed(1)} projected
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              ~{team.projectedPointsPerWeek.toFixed(1)} pts/week
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span>Clinched (100%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-2" />
                <span>Good chance (70-99%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-4" />
                <span>Coin flip (50-69%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-chart-3" />
                <span>Longshot (25-49%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span>Unlikely (1-24%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
                <span>Eliminated (0%)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bubble Watch - Qualification Conditions */}
      {(() => {
        const bubbleTeams = predictions.filter(p => p.makePlayoffsPct > 0 && p.makePlayoffsPct < 100);
        const playoffCutoffTeam = predictions[playoffTeams - 1];
        const firstOutTeam = predictions[playoffTeams];
        
        if (bubbleTeams.length === 0 || remainingWeeks === 0) return null;
        
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-chart-4" />
                Bubble Watch
              </CardTitle>
              <CardDescription>
                How teams on the bubble can qualify for playoffs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bubbleTeams.map((team, idx) => {
                const standingIndex = predictions.findIndex(p => p.rosterId === team.rosterId);
                const isInPlayoffPosition = standingIndex < playoffTeams;
                const gamesBack = playoffCutoffTeam ? team.currentWins - playoffCutoffTeam.currentWins : 0;
                const gamesAhead = firstOutTeam ? team.currentWins - firstOutTeam.currentWins : 0;
                
                const conditions: { type: "positive" | "negative" | "neutral"; text: string }[] = [];
                
                if (isInPlayoffPosition) {
                  if (gamesAhead >= remainingWeeks) {
                    conditions.push({ type: "positive", text: `Can clinch with ${remainingWeeks - gamesAhead} more win${remainingWeeks - gamesAhead !== 1 ? 's' : ''}` });
                  } else if (gamesAhead > 0) {
                    conditions.push({ type: "positive", text: `${gamesAhead} game${gamesAhead !== 1 ? 's' : ''} ahead of ${firstOutTeam?.name || 'next team'}` });
                  } else if (gamesAhead === 0) {
                    conditions.push({ type: "neutral", text: `Tied with ${firstOutTeam?.name || 'next team'} - tiebreakers matter` });
                  }
                  
                  if (team.pointsRank <= playoffTeams) {
                    conditions.push({ type: "positive", text: `#${team.pointsRank} in points - wins tiebreaker` });
                  } else {
                    conditions.push({ type: "negative", text: `#${team.pointsRank} in points - loses tiebreaker` });
                  }
                  
                  conditions.push({ type: "neutral", text: "Win remaining games to secure spot" });
                } else {
                  const winsNeeded = Math.abs(gamesBack) + 1;
                  if (winsNeeded <= remainingWeeks) {
                    conditions.push({ type: "neutral", text: `Need to win ${winsNeeded}+ of remaining ${remainingWeeks} games` });
                  } else {
                    conditions.push({ type: "negative", text: `${Math.abs(gamesBack)} game${Math.abs(gamesBack) !== 1 ? 's' : ''} back - needs help` });
                  }
                  
                  const teamsToPass = predictions
                    .slice(0, playoffTeams)
                    .filter(p => p.rosterId !== team.rosterId && p.makePlayoffsPct < 100);
                  
                  if (teamsToPass.length > 0) {
                    const teamNames = teamsToPass.slice(0, 2).map(t => t.name);
                    const moreCount = teamsToPass.length - 2;
                    conditions.push({ 
                      type: "neutral", 
                      text: `Need ${teamNames.join(' or ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''} to lose` 
                    });
                  }
                  
                  if (team.pointsRank <= playoffTeams) {
                    conditions.push({ type: "positive", text: `#${team.pointsRank} in points - favorable tiebreaker` });
                  } else if (team.pointsBehind !== null && team.pointsBehind < 50) {
                    conditions.push({ type: "neutral", text: `Only ${team.pointsBehind.toFixed(1)} pts behind #${team.pointsRank - 1}` });
                  }
                }
                
                return (
                  <div 
                    key={team.rosterId}
                    className={`p-4 rounded-lg border ${team.ownerId === userId ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'}`}
                    data-testid={`bubble-team-${team.rosterId}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback 
                            className={`text-xs ${team.ownerId === userId ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                          >
                            {team.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className={`font-medium ${team.ownerId === userId ? 'text-primary' : ''}`}>
                            {team.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {team.currentWins}-{team.currentLosses} • #{standingIndex + 1} in standings
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStandingsBadgeClass(team.makePlayoffsPct)}>
                          {team.makePlayoffsPct.toFixed(1)}%
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isInPlayoffPosition ? "In playoff position" : "Outside looking in"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Path to Playoffs
                      </p>
                      <ul className="space-y-1.5">
                        {conditions.map((condition, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            {condition.type === "positive" ? (
                              <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                            ) : condition.type === "negative" ? (
                              <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            ) : (
                              <ArrowUp className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                            )}
                            <span className={condition.type === "negative" ? "text-muted-foreground" : ""}>
                              {condition.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
