import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Award, BarChart3, Star } from "lucide-react";
import { useSleeper } from "@/lib/sleeper-context";

// Mock data based on the provided LIVE SLEEPER API DATA
const mockSeasonData = {
  league_name: "ATL Dynasty",
  season: "2025",
  rosters: [
    {
      owner_name: "crainey0",
      team_name: "All Ws",
      wins: 13,
      losses: 1,
      ties: 0,
      fpts: 2231.24
    },
    {
      owner_name: "NoCapDoNotSleepOnMe",
      team_name: "NoCapDoNotSleepOnMe",
      wins: 9,
      losses: 5,
      ties: 0,
      fpts: 1812.28
    },
    {
      owner_name: "jwilly1306",
      team_name: "PRISON BALL",
      wins: 9,
      losses: 5,
      ties: 0,
      fpts: 1628.82
    },
    {
      owner_name: "RagingParrots",
      team_name: "CoolTeamName_placeholder",
      wins: 8,
      losses: 6,
      ties: 0,
      fpts: 1821.88
    },
    {
      owner_name: "mvprainey",
      team_name: "Wakanda Panthers",
      wins: 8,
      losses: 6,
      ties: 0,
      fpts: 1708.84
    },
    {
      owner_name: "elwthree",
      team_name: "Rough Start",
      wins: 7,
      losses: 7,
      ties: 0,
      fpts: 1687.86
    },
    {
      owner_name: "amweathers",
      team_name: "All Stars",
      wins: 6,
      losses: 8,
      ties: 0,
      fpts: 1579.2
    },
    {
      owner_name: "ecooper1209",
      team_name: "BetterLuckNextTime",
      wins: 6,
      losses: 8,
      ties: 0,
      fpts: 1502.2
    },
    {
      owner_name: "baskettball26",
      team_name: "baskettball26",
      wins: 5,
      losses: 9,
      ties: 0,
      fpts: 1514.86
    },
    {
      owner_name: "PNice7",
      team_name: "PNice7",
      wins: 5,
      losses: 9,
      ties: 0,
      fpts: 1332.24
    },
    {
      owner_name: "DJDougie12",
      team_name: "Just Better",
      wins: 4,
      losses: 10,
      ties: 0,
      fpts: 1706.68
    },
    {
      owner_name: "Twill09",
      team_name: "Twill09",
      wins: 4,
      losses: 10,
      ties: 0,
      fpts: 1548.02
    }
  ]
};

interface TeamStat {
  team_name: string;
  owner_name: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
}

interface SeasonRecapData {
  leagueName: string;
  season: string;
  standings: (
    TeamStat &
    { rank: number; initials: string; record: string }
  )[];
  champion: TeamStat | null;
  mostPointsFor: TeamStat | null;
}

const getInitials = (name: string) => {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
};

export default function SeasonRecap() {
  const { league } = useSleeper();

  // Simulate fetching data, using mock data provided by the prompt
  const { data, isLoading, error } = useQuery<SeasonRecapData>({
    queryKey: ["seasonRecap", league?.leagueId, mockSeasonData.season],
    queryFn: async () => {
      // In a real application, you would fetch from your backend or Sleeper API
      // For now, use the mock data
      const rawRosters = mockSeasonData.rosters;

      const sortedStandings = [...rawRosters].sort((a, b) => {
        if (b.wins !== a.wins) {
          return b.wins - a.wins; // Sort by wins descending
        }
        if (b.ties !== a.ties) {
          return b.ties - a.ties; // Sort by ties descending
        }
        return b.fpts - a.fpts; // Then by points for descending
      });

      const standings = sortedStandings.map((roster, index) => ({
        ...roster,
        rank: index + 1,
        initials: getInitials(roster.team_name || roster.owner_name),
        record: `${roster.wins}-${roster.losses}${roster.ties > 0 ? `-${roster.ties}` : ""}`,
      }));

      const champion = standings.length > 0 ? standings[0] : null;

      const mostPointsFor = standings.length > 0
        ? standings.reduce(
            (prev, current) => (prev.fpts > current.fpts ? prev : current),
            standings[0]
          )
        : null;
      
      return {
        leagueName: mockSeasonData.league_name,
        season: mockSeasonData.season,
        standings,
        champion,
        mostPointsFor: mostPointsFor
      };
    },
    staleTime: Infinity, // Data for a past season is static
  });

  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading season recap...</div>;
  }

  if (error || !data) {
    return <div className="p-6 text-center text-destructive">Failed to load season recap.</div>;
  }

  const { leagueName, season, standings, champion, mostPointsFor } = data;

  return (
    <div className="p-4 sm:px-6 sm:py-8 lg:p-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="font-heading text-3xl font-bold">
          {leagueName} {season} Recap
        </h1>
        <Badge variant="outline" className="text-sm px-3 py-1">
          Season {season}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {champion && (
          <Card className="hover-elevate">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-xl flex items-center gap-2">
                <Trophy className="w-6 h-6 text-yellow-500" />
                League Champion
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Best record in the {season} regular season.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
                  {getInitials(champion.team_name || champion.owner_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {champion.team_name || champion.owner_name}
                </p>
                <p className="text-lg text-muted-foreground">
                  {champion.record} Record
                </p>
                <p className="text-sm text-chart-2">
                  {champion.fpts.toFixed(2)} Points For
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {mostPointsFor && (
          <Card className="hover-elevate">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-xl flex items-center gap-2">
                <Star className="w-6 h-6 text-blue-400" />
                Most Points For
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Highest total points scored during the {season} season.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-chart-2 text-white text-2xl font-bold">
                  {getInitials(mostPointsFor.team_name || mostPointsFor.owner_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {mostPointsFor.team_name || mostPointsFor.owner_name}
                </p>
                <p className="text-lg text-muted-foreground">
                  {mostPointsFor.fpts.toFixed(2)} Total Points
                </p>
                <p className="text-sm text-chart-4">
                  {mostPointsFor.record} Record
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-xl flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            Final Standings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">Rank</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-center">Record</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">Wins</TableHead>
                <TableHead className="text-right">Losses</TableHead>
                {standings.some(s => s.ties > 0) && (
                  <TableHead className="text-right">Ties</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((team) => (
                <TableRow key={team.rank} data-testid={`team-standing-${team.rank}`}>
                  <TableCell className="text-center font-medium">
                    <Badge
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                        team.rank === 1 ? "bg-yellow-500 text-yellow-500-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {team.rank}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                          {team.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{team.team_name || team.owner_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums font-medium">
                    {team.record}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {team.fpts.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-primary">
                    {team.wins}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    {team.losses}
                  </TableCell>
                  {standings.some(s => s.ties > 0) && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {team.ties}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
