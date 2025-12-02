import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: string;
  trend: number[];
  isUser?: boolean;
}

interface StandingsTableProps {
  standings: TeamStanding[];
  division?: string;
}

export default function StandingsTable({ standings, division }: StandingsTableProps) {
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
            {standings.map((team) => (
              <TableRow
                key={team.rank}
                className={team.isUser ? "bg-primary/5" : ""}
                data-testid={`row-team-${team.rank}`}
              >
                <TableCell className="text-center">
                  <Badge
                    variant={team.rank <= 4 ? "default" : "secondary"}
                    className="w-6 h-6 p-0 flex items-center justify-center rounded-full"
                  >
                    {team.rank}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
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
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
