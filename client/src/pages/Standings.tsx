import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import StandingsTable from "@/components/StandingsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export default function Standings() {
  const { user, league } = useSleeper();

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
    wins: team.wins,
    losses: team.losses,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    streak: team.streak || "—",
    trend: [100, 110, 105, 115, 120],
    isUser: team.isUser,
  }));

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
            <StandingsTable standings={formattedStandings} />
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
                formattedStandings.slice(0, 5).map((team: any, i: number) => (
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
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pointsData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        width={30}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                        }}
                      />
                      <Bar dataKey="pf" name="Points For">
                        {pointsData.map((entry: any, index: number) => (
                          <Cell
                            key={`pf-${index}`}
                            fill={entry.isUser ? "hsl(var(--primary))" : "hsl(var(--chart-2))"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
                  <span className="text-muted-foreground">Clinched Playoff Spot</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-chart-4" />
                  <span className="text-muted-foreground">In Playoff Position</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-muted" />
                  <span className="text-muted-foreground">Outside Looking In</span>
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
    </div>
  );
}
