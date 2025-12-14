import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Users } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PlayerDetailData {
  player: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    number?: number;
    age?: number;
    height?: string;
    weight?: string;
    college?: string;
    yearsExp?: number;
    status?: string;
    injuryStatus?: string | null;
  };
  weeklyData: {
    week: number;
    actual: number | null;
    projected: number;
  }[];
  boomBust: {
    boom: number;
    bust: number;
    boomPct: number;
    bustPct: number;
    avgPoints: number;
    gamesPlayed: number;
  };
  projectedTotal: number;
  news: {
    type: string;
    text: string;
    date?: string;
  }[];
  selectedWeek: number;
}

interface PlayerDetailModalProps {
  playerId: string | null;
  playerName: string;
  week: number;
  onClose: () => void;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500",
  RB: "bg-primary",
  WR: "bg-blue-500",
  TE: "bg-orange-500",
  K: "bg-purple-500",
  DEF: "bg-gray-500",
};

export function PlayerDetailModal({ playerId, playerName, week, onClose }: PlayerDetailModalProps) {
  const { data, isLoading } = useQuery<PlayerDetailData>({
    queryKey: ["/api/sleeper/player", playerId, "detail", week],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/player/${playerId}/detail?week=${week}`);
      if (!res.ok) throw new Error("Failed to fetch player detail");
      return res.json();
    },
    enabled: !!playerId,
  });

  const chartData = data?.weeklyData.map(d => ({
    week: `W${d.week}`,
    actual: d.actual,
    projected: d.projected,
  })) || [];

  const getNewsIcon = (type: string) => {
    switch (type) {
      case "injury":
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case "practice":
        return <Activity className="w-4 h-4 text-primary" />;
      case "depth":
        return <Users className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={!!playerId} onOpenChange={() => onClose()}> 
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {data?.player.position && (
              <Badge className={`${positionColors[data.player.position] || "bg-muted"} text-white`}>
                {data.player.position}
              </Badge>
            )}
            <span className="font-heading text-xl">{playerName}</span>
            {data?.player.team && (
              <span className="text-muted-foreground text-base font-normal">
                {data.player.team}
                {data.player.number && ` #${data.player.number}`}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Season Performance</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="week"
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        className="text-muted-foreground"
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: number, name: string) => [
                          value?.toFixed(1) || "â€”",
                          name === "actual" ? "Actual" : "Projected"
                        ]}
                      />
                      <ReferenceLine
                        y={data.boomBust.avgPoints}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                      />
                      <Line
                        type="monotone"
                        dataKey="projected"
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        dot={false}
                        name="projected"
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                        connectNulls={false}
                        name="actual"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-primary" />
                    <span>Actual Points</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-muted-foreground border-dashed" style={{ borderBottom: '2px dashed' }} />
                    <span>Projected</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Week {week} Projection</p>
                  <p className="text-2xl font-bold tabular-nums">{data.projectedTotal.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">pts</p>
                </CardContent>
              </Card>
              
              <Card className="border-chart-2/30">
                <CardContent className="pt-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-3 h-3 text-chart-2" />
                    <p className="text-xs text-chart-2">Boom</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-chart-2">{data.boomBust.boom}</p>
                  <p className="text-xs text-muted-foreground">{data.boomBust.boomPct}% chance</p>
                </CardContent>
              </Card>
              
              <Card className="border-destructive/30">
                <CardContent className="pt-4 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingDown className="w-3 h-3 text-destructive" />
                    <p className="text-xs text-destructive">Bust</p>
                  </div>
                  <p className="text-2xl font-bold tabular-nums text-destructive">{data.boomBust.bust}</p>
                  <p className="text-xs text-muted-foreground">{data.boomBust.bustPct}% chance</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Player Info & News</h3>
                
                <div className="flex flex-wrap gap-2 mb-4 text-xs">
                  {data.player.age && (
                    <Badge variant="outline">Age: {data.player.age}</Badge>
                  )}
                  {data.player.yearsExp !== undefined && (
                    <Badge variant="outline">
                      {data.player.yearsExp === 0 ? "Rookie" : `${data.player.yearsExp} yrs exp`}
                    </Badge>
                  )}
                  {data.player.height && data.player.weight && (
                    <Badge variant="outline">{data.player.height} / {data.player.weight}</Badge>
                  )}
                  {data.player.college && (
                    <Badge variant="outline">{data.player.college}</Badge>
                  )}
                  {data.boomBust.gamesPlayed > 0 && (
                    <Badge variant="secondary">{data.boomBust.gamesPlayed} games played</Badge>
                  )}
                </div>
                
                {data.news.length > 0 ? (
                  <div className="space-y-2">
                    {data.news.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 p-2 rounded-md bg-muted/50"
                        data-testid={`news-item-${idx}`}
                      >
                        {getNewsIcon(item.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{item.text}</p>
                          {item.date && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.date}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent news or updates
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
