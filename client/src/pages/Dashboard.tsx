import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import ActivityFeed from "@/components/ActivityFeed";
import MatchupPreview from "@/components/MatchupPreview";
import StandingsTable from "@/components/StandingsTable";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface PlayoffPrediction {
  rosterId: number;
  makePlayoffsPct: number;
}

interface PlayoffPredictionData {
  predictions: PlayoffPrediction[];
}

export default function Dashboard() {
  const { user, league, currentWeek } = useSleeper();

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

  const { data: playoffData } = useQuery<PlayoffPredictionData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: matchup, isLoading: matchupLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "matchup", user?.userId, currentWeek],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/matchup?userId=${user?.userId}&week=${currentWeek}`
      );
      if (!res.ok) throw new Error("Failed to fetch matchup");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/transactions?limit=15`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

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
    rosterId: team.rosterId,
  }));

  const playoffProbabilities = playoffData?.predictions?.map(p => ({
    rosterId: p.rosterId,
    makePlayoffsPct: p.makePlayoffsPct,
  }));

  const userTeam = matchup?.userTeam
    ? {
        name: matchup.userTeam.name,
        initials: matchup.userTeam.initials,
        projectedScore: matchup.userTeam.projectedScore || 0,
        record: matchup.userTeam.record,
        starters: matchup.userTeam.starters || [],
      }
    : null;

  const opponentTeam = matchup?.opponentTeam
    ? {
        name: matchup.opponentTeam.name,
        initials: matchup.opponentTeam.initials,
        projectedScore: matchup.opponentTeam.projectedScore || 0,
        record: matchup.opponentTeam.record,
        starters: matchup.opponentTeam.starters || [],
      }
    : null;

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Welcome to Dynasty Command</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to get started with your league.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, here's what's happening in {league.name}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {matchupLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-40 w-32" />
                  <Skeleton className="h-10 w-16" />
                  <Skeleton className="h-40 w-32" />
                </div>
              </CardContent>
            </Card>
          ) : userTeam && opponentTeam ? (
            <MatchupPreview week={currentWeek} userTeam={userTeam} opponent={opponentTeam} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No matchup data available for week {currentWeek}
              </CardContent>
            </Card>
          )}

          {standingsLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full mb-2" />
                ))}
              </CardContent>
            </Card>
          ) : formattedStandings.length > 0 ? (
            <Link href="/standings" className="block hover-elevate rounded-lg transition-all" data-testid="link-standings">
              <StandingsTable 
                standings={formattedStandings} 
                playoffTeams={league.playoffTeams || 6}
                playoffProbabilities={playoffProbabilities}
              />
            </Link>
          ) : null}
        </div>

        <div>
          {transactionsLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full mb-2" />
                ))}
              </CardContent>
            </Card>
          ) : (
            <ActivityFeed transactions={transactions || []} />
          )}
        </div>
      </div>
    </div>
  );
}
