import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Trophy, Crown, TrendingUp, TrendingDown, Frown, Smile } from "lucide-react";
import { Fragment } from "react";

interface RosterData {
  owner_name: string;
  team_name: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  avatar?: string;
}

export default function SeasonRecap() {
  const { league, season } = useSleeper();

  const { data: rosters, isLoading, error } = useQuery<RosterData[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "rosters", season],
    queryFn: async () => {
      if (!league?.leagueId || !season) return [];
      // For a season recap, we typically want data from the *previous* completed season.
      // Assuming `season` from useSleeper is the current active season, 
      // we might need to adjust or query historical data if the API supports it.
      // For now, we'll use the current 'season' value, which in the live data is '2025'.
      const res = await fetch(`/api/sleeper/league/${league.leagueId}/rosters?season=${season}`);
      if (!res.ok) throw new Error("Failed to fetch rosters");
      const rosterData = await res.json();

      const usersRes = await fetch(`/api/sleeper/league/${league.leagueId}/users`);
      if (!usersRes.ok) throw new Error("Failed to fetch users");
      const users = await usersRes.json();

      return rosterData.map((roster: any) => {
        const user = users.find((u: any) => u.user_id === roster.owner_id);
        return {
          owner_name: user?.display_name || 'Unknown Owner',
          team_name: user?.metadata?.team_name || 'Unknown Team',
          wins: roster.settings?.wins || 0,
          losses: roster.settings?.losses || 0,
          ties: roster.settings?.ties || 0,
          fpts: roster.settings?.fpts || 0,
          avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
        };
      });
    },
    enabled: !!league?.leagueId && !!season,
  });

  const sortedRosters = (rosters || []).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins; // More wins first
    if (a.ties !== b.ties) return b.ties - a.ties; // More ties (better record) second
    return b.fpts - a.fpts; // Higher points for as tie-breaker
  });

  const leagueWinner = sortedRosters.length > 0 ? sortedRosters[0] : null;
  const highestScoringTeam = rosters?.reduce((max, team) => (team.fpts > max.fpts ? team : max), rosters[0] || null);
  const lowestScoringTeam = rosters?.reduce((min, team) => (team.fpts < min.fpts ? team : min), rosters[0] || null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading season recap...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">
        <p>Error loading season recap: {error.message}</p>
      </div>
    );
  }

  if (!league || !season || !rosters || rosters.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>No season data available for {season}.</p>
        <p>Please ensure your league has completed a season.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading text-3xl font-bold">
          {league?.name} Season Recap
        </h1>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          Season {season}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {leagueWinner && (
          <Card className="text-center hover-elevate">
            <CardHeader className="pb-2">
              <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
              <CardTitle className="text-xl font-heading">League Champion</CardTitle>
              <CardDescription className="text-xs">Most Wins & Best Record</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <Avatar className="w-20 h-20 mb-2 border-2 border-primary">
                {leagueWinner.avatar && <AvatarImage src={leagueWinner.avatar} alt={leagueWinner.team_name} />}
                <AvatarFallback className="text-xl bg-primary text-primary-foreground">
                  {leagueWinner.team_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <p className="font-bold text-lg">{leagueWinner.team_name}</p>
              <p className="text-sm text-muted-foreground">{leagueWinner.owner_name}</p>
              <Badge variant="default" className="mt-2 px-3 py-1">
                {leagueWinner.wins}-{leagueWinner.losses}{leagueWinner.ties > 0 ? `-${leagueWinner.ties}` : ''}
              </Badge>
              <p className="text-xs text-muted-foreground mt-1">{leagueWinner.fpts.toFixed(2)} FPTS</p>
            </CardContent>
          </Card>
        )}

        {highestScoringTeam && (
          <Card className="text-center hover-elevate">
            <CardHeader className="pb-2">
              <Smile className="w-8 h-8 text-chart-2 mx-auto mb-2" />
              <CardTitle className="text-xl font-heading">Highest Scorer</CardTitle>
              <CardDescription className="text-xs">Most Regular Season Points For</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <Avatar className="w-20 h-20 mb-2 border-2 border-chart-2">
                {highestScoringTeam.avatar && <AvatarImage src={highestScoringTeam.avatar} alt={highestScoringTeam.team_name} />}
                <AvatarFallback className="text-xl bg-chart-2 text-primary-foreground">
                  {highestScoringTeam.team_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <p className="font-bold text-lg">{highestScoringTeam.team_name}</p>
              <p className="text-sm text-muted-foreground">{highestScoringTeam.owner_name}</p>
              <Badge variant="default" className="bg-chart-2/20 text-chart-2 mt-2 px-3 py-1">
                {highestScoringTeam.fpts.toFixed(2)} FPTS
              </Badge>
            </CardContent>
          </Card>
        )}

        {lowestScoringTeam && (
          <Card className="text-center hover-elevate">
            <CardHeader className="pb-2">
              <Frown className="w-8 h-8 text-destructive mx-auto mb-2" />
              <CardTitle className="text-xl font-heading">Lowest Scorer</CardTitle>
              <CardDescription className="text-xs">Least Regular Season Points For</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <Avatar className="w-20 h-20 mb-2 border-2 border-destructive">
                {lowestScoringTeam.avatar && <AvatarImage src={lowestScoringTeam.avatar} alt={lowestScoringTeam.team_name} />}
                <AvatarFallback className="text-xl bg-destructive text-primary-foreground">
                  {lowestScoringTeam.team_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <p className="font-bold text-lg">{lowestScoringTeam.team_name}</p>
              <p className="text-sm text-muted-foreground">{lowestScoringTeam.owner_name}</p>
              <Badge variant="default" className="bg-destructive/20 text-destructive mt-2 px-3 py-1">
                {lowestScoringTeam.fpts.toFixed(2)} FPTS
              </Badge>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Final Standings</CardTitle>
          <CardDescription>Overall records and points scored.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">W-L-T</TableHead>
                <TableHead className="text-right">FPTS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRosters.map((team, index) => (
                <TableRow key={team.owner_name} className={team === leagueWinner ? "bg-primary/5" : ""}>
                  <TableCell className="text-center">
                    <Badge
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                        team === leagueWinner ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {index + 1}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        {team.avatar && <AvatarImage src={team.avatar} alt={team.team_name} />}
                        <AvatarFallback className="text-xs bg-muted">
                          {team.team_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{team.team_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums font-medium">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {team.fpts.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
