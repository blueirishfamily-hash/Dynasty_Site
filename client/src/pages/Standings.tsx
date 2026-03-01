import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import StandingsTable from "@/components/StandingsTable";
import PlayoffPredictor from "@/components/PlayoffPredictor";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ListOrdered, Target, Trophy, Crown } from "lucide-react";

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

interface BracketMatchup {
  round: number;
  matchupId: number;
  team1: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  team2: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  winner: number | null;
  loser: number | null;
  team1From?: { w?: number; l?: number };
  team2From?: { w?: number; l?: number };
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

interface ConsolationMatchup {
  gameType?: string;
  round: number;
  matchupId: number;
  team1: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  team2: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  winner: number | null;
  loser: number | null;
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

interface BracketData {
  matchups: BracketMatchup[];
  rounds: number;
  teams: Record<number, { name: string; initials: string; avatar: string | null }>;
  consolationMatchups?: ConsolationMatchup[];
}

export default function Standings() {
  const { user, league } = useSleeper();
  const [activeTab, setActiveTab] = useState<"standings" | "predictions" | "bracket">("standings");

  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  // Fetch playoff predictions for clinched status
  const { data: predictions } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch playoff bracket
  const { data: bracketData, isLoading: bracketLoading } = useQuery<BracketData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "bracket"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/bracket`);
      if (!res.ok) throw new Error("Failed to fetch playoff bracket");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view standings.
          </p>
        </div>
      </div>
    );
  }

  const formattedStandings = (standings || []).map((team: any, index: number) => ({
    rank: team.rank || index + 1,
    name: team.name,
    initials: team.initials,
    avatar: team.avatar,
    wins: team.wins,
    losses: team.losses,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    maxPointsFor: team.maxPointsFor,
    streak: team.streak || "—",
    trend: team.previousRank != null ? [team.previousRank, team.rank || index + 1] : [team.rank || index + 1, team.rank || index + 1],
    isUser: team.isUser,
    rosterId: team.rosterId,
  }));

  // Extract playoff probabilities from predictions
  const playoffProbabilities = predictions?.predictions?.map((p: any) => ({
    rosterId: p.rosterId,
    makePlayoffsPct: p.makePlayoffsPct,
  })) || [];

  const pointsData = formattedStandings
    .map((team: any) => ({
      name: team.initials,
      pf: team.pointsFor,
      pa: team.pointsAgainst,
      isUser: team.isUser,
    }))
    .sort((a: any, b: any) => b.pf - a.pf);

  const playoffTeams = league.playoffTeams || 6;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">League Standings</h1>
        <p className="text-muted-foreground">
          Full standings and scoring analysis for {league.name}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "standings" | "predictions" | "bracket")}>
        <TabsList className="mb-4">
          <TabsTrigger value="standings" className="gap-2" data-testid="tab-standings">
            <ListOrdered className="w-4 h-4" />
            Standings
          </TabsTrigger>
          <TabsTrigger value="predictions" className="gap-2" data-testid="tab-predictions">
            <Target className="w-4 h-4" />
            Playoff Predictor
          </TabsTrigger>
          <TabsTrigger value="bracket" className="gap-2" data-testid="tab-bracket">
            <Trophy className="w-4 h-4" />
            Playoff Bracket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standings" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {standingsLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full mb-2" />
                    ))}
                  </CardContent>
                </Card>
              ) : formattedStandings.length > 0 ? (
                <StandingsTable 
                  standings={formattedStandings} 
                  playoffTeams={playoffTeams}
                  playoffProbabilities={playoffProbabilities}
                />
              ) : null}
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-lg">Top Scorers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {standingsLoading ? (
                    [...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))
                  ) : (
                    [...formattedStandings].sort((a, b) => b.pointsFor - a.pointsFor).slice(0, 5).map((team: any, i: number) => (
                      <div key={team.rank} className="flex items-center gap-3">
                        <Badge
                          variant={i === 0 ? "default" : "secondary"}
                          className="w-6 h-6 p-0 flex items-center justify-center rounded-full"
                        >
                          {i + 1}
                        </Badge>
                        <Avatar className="w-8 h-8">
                          <AvatarFallback
                            className={`text-xs ${
                              team.isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                            }`}
                          >
                            {team.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`flex-1 text-sm font-medium ${team.isUser ? "text-primary" : ""}`}>
                          {team.name}
                        </span>
                        <span className="text-sm tabular-nums font-semibold">
                          {team.pointsFor.toFixed(1)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-lg">Points For vs Against</CardTitle>
                </CardHeader>
                <CardContent>
                  {standingsLoading ? (
                    <Skeleton className="h-80 w-full" />
                  ) : (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={pointsData} layout="horizontal">
                          <XAxis 
                            type="category" 
                            dataKey="name" 
                            tick={{ fontSize: 10 }} 
                            stroke="hsl(var(--muted-foreground))"
                            interval={0}
                          />
                          <YAxis 
                            type="number" 
                            tick={{ fontSize: 10 }} 
                            stroke="hsl(var(--muted-foreground))"
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--popover))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "6px",
                            }}
                            formatter={(value: number, name: string) => [
                              value.toFixed(1),
                              name === "pf" ? "Points For" : "Points Against"
                            ]}
                          />
                          <Bar dataKey="pf" name="pf" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="pa" name="pa" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm bg-chart-1" />
                          <span>Points For</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded-sm bg-destructive" />
                          <span>Points Against</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-lg">Playoff Picture</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      <span className="text-muted-foreground">Clinched (100%)</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-chart-4" />
                      <span className="text-muted-foreground">In Playoff Position</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-chart-3" />
                      <span className="text-muted-foreground">Still In The Hunt</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-muted" />
                      <span className="text-muted-foreground">Eliminated (0%)</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      Top {playoffTeams} teams make the playoffs.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="predictions" className="mt-0">
          <PlayoffPredictor userId={user.userId} />
        </TabsContent>

        <TabsContent value="bracket" className="mt-0">
          {bracketLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
              </div>
            </div>
          ) : !bracketData || bracketData.matchups.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-heading text-lg font-semibold mb-2">No Playoff Bracket Yet</h3>
                  <p className="text-muted-foreground">
                    The playoff bracket will appear once the regular season ends and playoffs begin.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" />
                    Winners Bracket
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Championship tournament - Reseeding format</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto pb-4">
                    <div className="flex items-start min-w-max gap-4">
                      {Array.from({ length: bracketData.rounds }, (_, i) => i + 1).map((round) => {
                        const roundMatchups = bracketData.matchups
                          .filter((m) => m.round === round)
                          .filter((m) => !m.placement || m.placement === 1) // Only show championship (placement 1) or no placement
                          .sort((a, b) => a.matchupId - b.matchupId);
                        
                        const roundName = round === bracketData.rounds 
                          ? "Championship" 
                          : round === bracketData.rounds - 1 
                            ? "Semifinals" 
                            : `Round ${round}`;
                        
                        const isLastRound = round === bracketData.rounds;
                        const matchupHeight = 88;
                        const matchupSpacing = 16;
                        
                        // Calculate total height needed for this round
                        const totalMatchups = roundMatchups.length;
                        const totalHeight = totalMatchups * (matchupHeight * 2 + matchupSpacing) - matchupSpacing;

                        return (
                          <div key={round} className="flex items-start">
                            {/* Round Column */}
                            <div className="flex flex-col" style={{ minWidth: 200 }}>
                              <div className="text-center mb-4 px-2">
                                <span className="font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  {roundName}
                                </span>
                              </div>
                              <div 
                                className="flex flex-col"
                                style={{ gap: matchupSpacing }}
                              >
                                {roundMatchups.map((matchup, matchupIndex) => {
                                  const isChampionship = matchup.placement === 1;
                                  const champion = matchup.winner ? bracketData.teams[matchup.winner] : null;
                                  
                                  return (
                                    <div
                                      key={matchup.matchupId}
                                      className="relative"
                                      style={{ height: matchupHeight * 2 }}
                                      data-testid={`bracket-matchup-${round}-${matchup.matchupId}`}
                                    >
                                      {isChampionship && champion && (
                                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 text-primary z-10">
                                          <Crown className="w-4 h-4" />
                                          <span className="font-heading font-bold text-xs whitespace-nowrap">Champion</span>
                                        </div>
                                      )}
                                      <div className={`flex flex-col border rounded-lg overflow-hidden h-full ${isChampionship ? "border-primary border-2 ring-2 ring-primary/20" : "border-border"}`}>
                                        <BracketTeamRow
                                          team={matchup.team1}
                                          seed={matchup.team1?.seed}
                                          isWinner={matchup.winner === matchup.team1?.rosterId}
                                          isLoser={matchup.loser === matchup.team1?.rosterId}
                                          fromMatchup={matchup.team1From}
                                          isTop
                                          score={matchup.team1Score}
                                        />
                                        <div className="border-t border-border" />
                                        <BracketTeamRow
                                          team={matchup.team2}
                                          seed={matchup.team2?.seed}
                                          isWinner={matchup.winner === matchup.team2?.rosterId}
                                          isLoser={matchup.loser === matchup.team2?.rosterId}
                                          fromMatchup={matchup.team2From}
                                          score={matchup.team2Score}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            
                            {/* Connecting Lines */}
                            {!isLastRound && (
                              <div 
                                className="relative"
                                style={{ 
                                  width: 80,
                                  height: totalHeight,
                                }}
                              >
                                {roundMatchups.map((matchup, matchupIndex) => {
                                  const isEven = matchupIndex % 2 === 0;
                                  
                                  if (!isEven) return null;
                                  
                                  // Calculate position for this pair of matchups
                                  const matchupPairHeight = (matchupHeight * 2 + matchupSpacing) * 2;
                                  const lineTop = matchupIndex * (matchupHeight * 2 + matchupSpacing);
                                  const centerY = matchupHeight * 2 + matchupSpacing;
                                  
                                  return (
                                    <div
                                      key={`connector-${matchup.matchupId}`}
                                      className="absolute left-0"
                                      style={{
                                        top: `${lineTop}px`,
                                        height: `${matchupPairHeight}px`,
                                        width: '80px',
                                      }}
                                    >
                                      {/* Vertical line from top matchup center going down */}
                                      <div 
                                        className="absolute bg-border"
                                        style={{
                                          left: '0px',
                                          top: `${matchupHeight}px`,
                                          width: '2px',
                                          height: `${centerY}px`,
                                        }}
                                      />
                                      
                                      {/* Vertical line from bottom matchup center going up */}
                                      <div 
                                        className="absolute bg-border"
                                        style={{
                                          left: '0px',
                                          bottom: `${matchupHeight}px`,
                                          width: '2px',
                                          height: `${centerY}px`,
                                        }}
                                      />
                                      
                                      {/* Horizontal connector line in the middle */}
                                      <div 
                                        className="absolute bg-border"
                                        style={{
                                          left: '0px',
                                          top: '50%',
                                          width: '100%',
                                          height: '2px',
                                          transform: 'translateY(-50%)',
                                        }}
                                      />
                                      
                                      {/* Right edge arrow pointing to next round */}
                                      <div 
                                        className="absolute bg-border"
                                        style={{
                                          right: '0px',
                                          top: '50%',
                                          width: '20px',
                                          height: '2px',
                                          transform: 'translateY(-50%)',
                                        }}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Consolation/Placement Games Section */}
              {bracketData.consolationMatchups && bracketData.consolationMatchups.length > 0 && (
                <>
                  {/* Visual separator */}
                  <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t-2 border-border"></div>
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-background px-4 text-sm font-medium text-muted-foreground">
                        Placement Games
                      </span>
                    </div>
                  </div>
                  
                  {/* Consolation bracket card */}
                  <Card className="border-muted">
                    <CardHeader className="bg-muted/30">
                      <CardTitle className="font-heading flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-muted-foreground" />
                        Placement Games
                      </CardTitle>
                      <CardDescription>Games determine final standings and draft positions for eliminated teams</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {bracketData.consolationMatchups
                          .filter(matchup => matchup.placement === 7 || matchup.placement === 5 || matchup.placement === 3)
                          .sort((a, b) => {
                            // Sort by placement (3rd, 5th, 7th)
                            const order = [3, 5, 7];
                            const aIndex = order.indexOf(a.placement ?? 999);
                            const bIndex = order.indexOf(b.placement ?? 999);
                            return aIndex - bIndex;
                          })
                          .map((matchup) => (
                            <div key={`${matchup.placement || matchup.matchupId}-${matchup.matchupId}`}>
                              <div className="text-center mb-3">
                                <span className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                  {matchup.placement ? `${matchup.placement}${getOrdinalSuffix(matchup.placement)} Place Game` : "Consolation Game"}
                                </span>
                              </div>
                              <div className="flex flex-col border rounded-lg overflow-hidden border-border">
                                <BracketTeamRow
                                  team={matchup.team1}
                                  seed={matchup.team1?.seed}
                                  isWinner={matchup.winner === matchup.team1?.rosterId}
                                  isLoser={matchup.loser === matchup.team1?.rosterId}
                                  isTop
                                  score={matchup.team1Score}
                                />
                                <div className="border-t border-border" />
                                <BracketTeamRow
                                  team={matchup.team2}
                                  seed={matchup.team2?.seed}
                                  isWinner={matchup.winner === matchup.team2?.rosterId}
                                  isLoser={matchup.loser === matchup.team2?.rosterId}
                                  score={matchup.team2Score}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-lg">Legend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded bg-primary" />
                      <span className="text-muted-foreground">Advanced</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded bg-destructive/20 border border-destructive/30" />
                      <span className="text-muted-foreground">Eliminated</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded border border-border bg-card" />
                      <span className="text-muted-foreground">Pending</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Crown className="w-4 h-4 text-primary" />
                      <span className="text-muted-foreground">Champion</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BracketTeamRow({
  team,
  seed,
  isWinner,
  isLoser,
  fromMatchup,
  isTop,
  draftPick,
  score,
}: {
  team: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  seed?: number;
  isWinner: boolean;
  isLoser: boolean;
  fromMatchup?: { w?: number; l?: number };
  isTop?: boolean;
  draftPick?: number;
  score?: number;
}) {
  // Use seed from team object if available, otherwise use prop
  const displaySeed = team?.seed ?? seed;
  if (!team) {
    const fromText = fromMatchup?.w 
      ? `W${fromMatchup.w}` 
      : fromMatchup?.l 
        ? `L${fromMatchup.l}` 
        : "TBD";
    
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-muted/30 h-11 ${isTop ? "" : ""}`}>
        <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <span className="text-[10px] text-muted-foreground">?</span>
        </div>
        <span className="text-xs text-muted-foreground italic truncate">{fromText}</span>
      </div>
    );
  }

  const hasScore = score !== undefined && score !== null && score > 0;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 h-11 transition-colors ${
        isWinner
          ? "bg-primary/15"
          : isLoser
            ? "bg-destructive/10 opacity-50"
            : "bg-card"
      }`}
      data-testid={`bracket-team-${team.rosterId}`}
    >
      <Avatar className="w-6 h-6 shrink-0">
        {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
        <AvatarFallback className={`text-[10px] ${isWinner ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {team.initials}
        </AvatarFallback>
      </Avatar>
      <span className={`text-xs font-medium truncate flex-1 ${isWinner ? "text-primary font-semibold" : isLoser ? "text-muted-foreground line-through" : ""}`}>
        {displaySeed !== undefined && displaySeed !== null ? (
          <>
            <span className="text-muted-foreground font-semibold mr-1.5">#{displaySeed}</span>
            {team.name}
          </>
        ) : (
          team.name
        )}
      </span>
      {hasScore && (
        <span className={`text-xs font-semibold tabular-nums shrink-0 ${isWinner ? "text-primary" : isLoser ? "text-muted-foreground" : "text-muted-foreground"}`}>
          {score.toFixed(2)}
        </span>
      )}
      {isWinner && (
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary-foreground">W</span>
        </div>
      )}
    </div>
  );
}
