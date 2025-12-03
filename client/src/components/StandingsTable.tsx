import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface TeamStanding {
  rank: number;
  name: string;
  initials: string;
  avatar?: string | null;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string;
  trend: number[];
  isUser?: boolean;
  rosterId?: number;
}

interface PlayoffProbability {
  rosterId: number;
  makePlayoffsPct: number;
}

interface StandingsTableProps {
  standings: TeamStanding[];
  division?: string;
  playoffTeams?: number;
  playoffProbabilities?: PlayoffProbability[];
}

function getRankBadgeClass(rank: number, playoffTeams: number, playoffPct?: number): string {
  // If we have probability data, use it to determine status
  if (playoffPct !== undefined) {
    if (playoffPct >= 100) return "bg-primary text-primary-foreground"; // Clinched
    if (rank <= playoffTeams) return "bg-chart-4 text-white"; // In playoff position but not clinched
    if (playoffPct > 0) return "bg-chart-3 text-white"; // Outside playoffs but still has a chance (orange)
    return ""; // 0% = grey (default secondary)
  }
  // Fallback: just use position
  if (rank <= playoffTeams) return "bg-chart-4 text-white";
  return "";
}

export default function StandingsTable({ standings, division, playoffTeams = 6, playoffProbabilities }: StandingsTableProps) {
  // Create a map for quick lookup of playoff probabilities by rosterId
  const probMap = new Map(playoffProbabilities?.map(p => [p.rosterId, p.makePlayoffsPct]) || []);
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-heading text-lg">
            {division ? `${division} Standings` : "League Standings"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">W-L</TableHead>
              <TableHead className="text-right">PF</TableHead>
              <TableHead className="text-right">PA</TableHead>
              <TableHead className="text-center">Streak</TableHead>
              <TableHead className="w-24">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map((team) => {
              const playoffPct = team.rosterId !== undefined ? probMap.get(team.rosterId) : undefined;
              const badgeClass = getRankBadgeClass(team.rank, playoffTeams, playoffPct);
              
              return (
              <TableRow
                key={team.rank}
                className={team.isUser ? "bg-primary/5" : ""}
                data-testid={`row-team-${team.rank}`}
              >
                <TableCell className="text-center">
                  <div
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                      badgeClass || "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {team.rank}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      {team.avatar && (
                        <AvatarImage src={team.avatar} alt={team.name} />
                      )}
                      <AvatarFallback
                        className={`text-xs ${
                          team.isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {team.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className={`font-medium ${team.isUser ? "text-primary" : ""}`}>
                      {team.name}
                    </span>
                    {team.isUser && (
                      <Badge variant="outline" className="text-xs">
                        You
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center tabular-nums font-medium">
                  {team.wins}-{team.losses}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {team.pointsFor.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {team.pointsAgainst.toFixed(1)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      team.streak.startsWith("W")
                        ? "border-primary/50 text-primary"
                        : "border-destructive/50 text-destructive"
                    }`}
                  >
                    {team.streak}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="w-20 h-8">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={team.trend.map((v, i) => ({ v, i }))}>
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke={team.trend[team.trend.length - 1] > team.trend[0] ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
