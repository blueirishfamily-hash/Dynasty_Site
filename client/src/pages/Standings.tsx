import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import StandingsTable from "@/components/StandingsTable";
import PlayoffPredictor from "@/components/PlayoffPredictor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface BracketMatchup {
  round: number;
  matchupId: number;
  team1: { rosterId: number; name: string; initials: string; avatar: string | null } | null;
  team2: { rosterId: number; name: string; initials: string; avatar: string | null } | null;
  winner: number | null;
  loser: number | null;
  team1From?: { w?: number; l?: number };
  team2From?: { w?: number; l?: number };
  placement?: number;
}

interface BracketData {
  matchups: BracketMatchup[];
  rounds: number;
  teams: Record<number, { name: string; initials: string; avatar: string | null }>;
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
    streak: team.streak || "—",
    trend: [100, 110, 105, 115, 120],
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
                    Playoff Bracket
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <div className="flex gap-8 min-w-max p-4">
                      {Array.from({ length: bracketData.rounds }, (_, i) => i + 1).map((round) => {
                        const roundMatchups = bracketData.matchups
                          .filter((m) => m.round === round)
                          .sort((a, b) => a.matchupId - b.matchupId);
                        
                        const roundName = round === bracketData.rounds 
                          ? "Championship" 
                          : round === bracketData.rounds - 1 
                            ? "Semifinals" 
                            : `Round ${round}`;

                        return (
                          <div key={round} className="flex flex-col gap-4">
                            <h3 className="font-heading text-sm font-semibold text-muted-foreground text-center border-b border-border pb-2">
                              {roundName}
                            </h3>
                            <div className="flex flex-col gap-6 justify-center flex-1">
                              {roundMatchups.map((matchup) => {
                                const isChampionship = matchup.placement === 1;
                                const champion = matchup.winner ? bracketData.teams[matchup.winner] : null;
                                
                                return (
                                  <div
                                    key={matchup.matchupId}
                                    className={`flex flex-col gap-1 ${isChampionship ? "border-2 border-primary rounded-lg p-2" : ""}`}
                                    data-testid={`bracket-matchup-${round}-${matchup.matchupId}`}
                                  >
                                    {isChampionship && champion && (
                                      <div className="flex items-center justify-center gap-2 mb-2 text-primary">
                                        <Crown className="w-5 h-5" />
                                        <span className="font-heading font-bold text-sm">Champion</span>
                                      </div>
                                    )}
                                    <BracketTeamSlot
                                      team={matchup.team1}
                                      isWinner={matchup.winner === matchup.team1?.rosterId}
                                      isLoser={matchup.loser === matchup.team1?.rosterId}
                                      fromMatchup={matchup.team1From}
                                    />
                                    <div className="text-center text-xs text-muted-foreground">vs</div>
                                    <BracketTeamSlot
                                      team={matchup.team2}
                                      isWinner={matchup.winner === matchup.team2?.rosterId}
                                      isLoser={matchup.loser === matchup.team2?.rosterId}
                                      fromMatchup={matchup.team2From}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading text-lg">Bracket Legend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded bg-primary" />
                      <span className="text-muted-foreground">Winner</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded bg-destructive/30" />
                      <span className="text-muted-foreground">Eliminated</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded border border-border bg-card" />
                      <span className="text-muted-foreground">Pending</span>
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

function BracketTeamSlot({
  team,
  isWinner,
  isLoser,
  fromMatchup,
}: {
  team: { rosterId: number; name: string; initials: string; avatar: string | null } | null;
  isWinner: boolean;
  isLoser: boolean;
  fromMatchup?: { w?: number; l?: number };
}) {
  if (!team) {
    const fromText = fromMatchup?.w 
      ? `Winner of M${fromMatchup.w}` 
      : fromMatchup?.l 
        ? `Loser of M${fromMatchup.l}` 
        : "TBD";
    
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-dashed border-muted-foreground/30 bg-muted/30 min-w-[180px]">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground">?</span>
        </div>
        <span className="text-sm text-muted-foreground italic">{fromText}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 p-2 rounded min-w-[180px] transition-colors ${
        isWinner
          ? "bg-primary/20 border border-primary"
          : isLoser
            ? "bg-destructive/10 border border-destructive/30 opacity-60"
            : "bg-card border border-border"
      }`}
      data-testid={`bracket-team-${team.rosterId}`}
    >
      <Avatar className="w-8 h-8">
        {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
        <AvatarFallback className={`text-xs ${isWinner ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {team.initials}
        </AvatarFallback>
      </Avatar>
      <span className={`text-sm font-medium truncate ${isWinner ? "text-primary font-semibold" : ""}`}>
        {team.name}
      </span>
      {isWinner && (
        <Badge variant="default" className="ml-auto text-xs">W</Badge>
      )}
      {isLoser && (
        <Badge variant="secondary" className="ml-auto text-xs opacity-70">L</Badge>
      )}
    </div>
  );
}
