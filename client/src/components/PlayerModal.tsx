import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Position = "QB" | "RB" | "WR" | "TE";

interface PlayerStats {
  week: number;
  points: number;
}

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
  age: number;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
  weeklyStats: PlayerStats[];
  news?: string[];
  schedule?: { week: number; opponent: string; isHome: boolean }[];
}

interface PlayerModalProps {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const positionColors: Record<Position, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
};

export default function PlayerModal({ player, open, onOpenChange }: PlayerModalProps) {
  if (!player) return null;

  const getAgeColor = (age: number) => {
    if (age <= 24) return "text-primary";
    if (age <= 28) return "text-foreground";
    return "text-destructive";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl bg-muted">
                {player.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="font-heading text-2xl">{player.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={positionColors[player.position]}>{player.position}</Badge>
                <span className="text-sm text-muted-foreground">{player.team}</span>
                <span className={`text-sm font-medium ${getAgeColor(player.age)}`}>
                  Age {player.age}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 my-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{player.seasonPoints.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Season Points</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold tabular-nums">{player.weeklyAvg.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Weekly Avg</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {player.position}
                <span className="text-primary">{player.positionRank}</span>
              </p>
              <p className="text-xs text-muted-foreground">Position Rank</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="stats">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="stats" data-testid="tab-player-stats">Stats</TabsTrigger>
            <TabsTrigger value="news" data-testid="tab-player-news">News</TabsTrigger>
            <TabsTrigger value="schedule" data-testid="tab-player-schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="mt-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={player.weeklyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `W${v}`}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                    labelFormatter={(v) => `Week ${v}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="points"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="news" className="mt-4">
            <div className="space-y-3">
              {player.news && player.news.length > 0 ? (
                player.news.map((item, i) => (
                  <div key={i} className="p-3 rounded-md bg-muted/50 text-sm">
                    {item}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No recent news for this player
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="mt-4">
            <div className="grid grid-cols-4 gap-2">
              {player.schedule && player.schedule.length > 0 ? (
                player.schedule.map((game) => (
                  <div
                    key={game.week}
                    className="p-2 rounded-md bg-muted/50 text-center"
                  >
                    <p className="text-xs text-muted-foreground">Week {game.week}</p>
                    <p className="font-medium">
                      {game.isHome ? "" : "@"}
                      {game.opponent}
                    </p>
                  </div>
                ))
              ) : (
                <p className="col-span-4 text-sm text-muted-foreground text-center py-8">
                  Schedule not available
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
