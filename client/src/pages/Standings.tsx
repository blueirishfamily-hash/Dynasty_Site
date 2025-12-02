import StandingsTable from "@/components/StandingsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// todo: remove mock functionality
const mockStandings = [
  { rank: 1, name: "Gridiron Kings", initials: "GK", wins: 9, losses: 2, pointsFor: 1542.3, pointsAgainst: 1298.7, streak: "W4", trend: [120, 145, 132, 158, 142], isUser: true },
  { rank: 2, name: "TD Machines", initials: "TD", wins: 8, losses: 3, pointsFor: 1498.1, pointsAgainst: 1345.2, streak: "W2", trend: [135, 128, 142, 138, 155] },
  { rank: 3, name: "Fantasy Legends", initials: "FL", wins: 7, losses: 4, pointsFor: 1456.8, pointsAgainst: 1389.4, streak: "L1", trend: [142, 151, 138, 145, 128] },
  { rank: 4, name: "Champion Squad", initials: "CS", wins: 6, losses: 5, pointsFor: 1412.5, pointsAgainst: 1401.3, streak: "W1", trend: [128, 135, 142, 125, 148] },
  { rank: 5, name: "Dynasty Builders", initials: "DB", wins: 5, losses: 6, pointsFor: 1378.2, pointsAgainst: 1425.8, streak: "L3", trend: [145, 138, 125, 118, 112] },
  { rank: 6, name: "Waiver Wire Warriors", initials: "WW", wins: 4, losses: 7, pointsFor: 1345.9, pointsAgainst: 1456.1, streak: "L2", trend: [132, 125, 138, 122, 115] },
  { rank: 7, name: "Playoff Bound", initials: "PB", wins: 4, losses: 7, pointsFor: 1312.4, pointsAgainst: 1478.3, streak: "W1", trend: [118, 125, 112, 135, 128] },
  { rank: 8, name: "Tank Commander", initials: "TC", wins: 3, losses: 8, pointsFor: 1289.7, pointsAgainst: 1512.6, streak: "L4", trend: [125, 118, 108, 112, 105] },
  { rank: 9, name: "Trade Master", initials: "TM", wins: 3, losses: 8, pointsFor: 1267.3, pointsAgainst: 1534.2, streak: "L2", trend: [112, 118, 122, 108, 115] },
  { rank: 10, name: "Rookie Hunters", initials: "RH", wins: 2, losses: 9, pointsFor: 1234.8, pointsAgainst: 1567.5, streak: "L5", trend: [108, 112, 105, 98, 102] },
  { rank: 11, name: "Sleeper Elite", initials: "SE", wins: 2, losses: 9, pointsFor: 1198.5, pointsAgainst: 1589.2, streak: "W1", trend: [102, 108, 98, 105, 118] },
  { rank: 12, name: "Dynasty Dominators", initials: "DD", wins: 1, losses: 10, pointsFor: 1156.2, pointsAgainst: 1612.8, streak: "L6", trend: [98, 95, 102, 92, 88] },
];

const pointsData = mockStandings
  .map((team) => ({
    name: team.initials,
    pf: team.pointsFor,
    pa: team.pointsAgainst,
    isUser: team.isUser,
  }))
  .sort((a, b) => b.pf - a.pf);

export default function Standings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">League Standings</h1>
        <p className="text-muted-foreground">Full standings and scoring analysis</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StandingsTable standings={mockStandings} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Top Scorers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockStandings.slice(0, 5).map((team, i) => (
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
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Points For vs Against</CardTitle>
            </CardHeader>
            <CardContent>
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
                      {pointsData.map((entry, index) => (
                        <Cell
                          key={`pf-${index}`}
                          fill={entry.isUser ? "hsl(var(--primary))" : "hsl(var(--chart-2))"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
                  Top 6 teams make the playoffs. Gridiron Kings has clinched a bye week.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
