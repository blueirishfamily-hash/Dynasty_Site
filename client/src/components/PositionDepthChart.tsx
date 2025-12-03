import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Position = "QB" | "RB" | "WR" | "TE";

interface PlayerDepth {
  id: string;
  name: string;
  team: string | null;
  points: number;
  medianPoints: number;
  percentAboveMedian: number;
}

interface PositionDepthChartProps {
  depthData: Partial<Record<Position, { players: PlayerDepth[]; grade: string }>>;
}

const gradeColors: Record<string, string> = {
  "A+": "bg-primary text-primary-foreground",
  A: "bg-primary text-primary-foreground",
  "A-": "bg-primary/80 text-primary-foreground",
  "B+": "bg-chart-5 text-white",
  B: "bg-chart-5 text-white",
  "B-": "bg-chart-5/80 text-white",
  "C+": "bg-chart-4 text-white",
  C: "bg-chart-4 text-white",
  "C-": "bg-chart-4/80 text-white",
  "D+": "bg-destructive/80 text-destructive-foreground",
  D: "bg-destructive text-destructive-foreground",
  F: "bg-destructive text-destructive-foreground",
};

export default function PositionDepthChart({ depthData }: PositionDepthChartProps) {
  const [activePosition, setActivePosition] = useState<Position>("QB");

  const renderDepthBar = (player: PlayerDepth) => {
    const isAboveMedian = player.percentAboveMedian >= 0;
    const barWidth = Math.min(Math.abs(player.percentAboveMedian), 100);

    return (
      <div
        key={player.id}
        className="flex items-center gap-3 py-2"
        data-testid={`depth-player-${player.id}`}
      >
        <div className="flex items-center gap-2 w-40 flex-shrink-0">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="text-xs bg-muted">
              {player.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{player.name}</p>
            <p className="text-xs text-muted-foreground">{player.team || "FA"}</p>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <div className="w-full h-6 relative bg-muted rounded-md overflow-hidden">
            <div className="absolute inset-0 flex">
              <div className="w-1/2 border-r border-border" />
              <div className="w-1/2" />
            </div>
            {isAboveMedian ? (
              <div
                className="absolute top-0 bottom-0 left-1/2 bg-primary/80 rounded-r-md transition-all"
                style={{ width: `${barWidth / 2}%` }}
              />
            ) : (
              <div
                className="absolute top-0 bottom-0 right-1/2 bg-destructive/80 rounded-l-md transition-all"
                style={{ width: `${barWidth / 2}%` }}
              />
            )}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-muted-foreground/30" />
          </div>
        </div>

        <div className="w-28 text-right flex-shrink-0">
          <span
            className={`text-sm font-semibold tabular-nums ${
              isAboveMedian ? "text-primary" : "text-destructive"
            }`}
          >
            {isAboveMedian ? "+" : ""}
            {(player.points - player.medianPoints).toFixed(1)} PPG
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="font-heading text-lg">Position Depth</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">PPG vs. League Median</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={activePosition}
          onValueChange={(v) => setActivePosition(v as Position)}
        >
          <TabsList className="mb-4 w-full justify-start">
            {(["QB", "RB", "WR", "TE"] as Position[]).map((pos) => {
              const posData = depthData[pos];
              if (!posData) return null;
              return (
                <TabsTrigger
                  key={pos}
                  value={pos}
                  className="flex items-center gap-2"
                  data-testid={`tab-position-${pos}`}
                >
                  {pos}
                  <Badge
                    className={`text-xs ${gradeColors[posData.grade] || "bg-muted"}`}
                  >
                    {posData.grade}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {(["QB", "RB", "WR", "TE"] as Position[]).map((pos) => {
            const posData = depthData[pos];
            if (!posData) return null;
            return (
              <TabsContent key={pos} value={pos} className="mt-0">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2 px-1">
                    <span>Below Median</span>
                    <span>Median</span>
                    <span>Above Median</span>
                  </div>
                  {posData.players.map(renderDepthBar)}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
