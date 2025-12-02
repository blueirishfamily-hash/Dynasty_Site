import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface DraftPick {
  round: number;
  pick: number;
  originalOwner: { name: string; initials: string };
  currentOwner: { name: string; initials: string };
  player?: { name: string; position: string };
  isUserPick?: boolean;
}

interface DraftBoardProps {
  year: number;
  picks: DraftPick[];
  totalRounds: number;
  teamsCount: number;
  viewMode?: "current" | "historical";
}

const positionColors: Record<string, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
};

export default function DraftBoard({
  year,
  picks,
  totalRounds,
  teamsCount,
  viewMode = "current",
}: DraftBoardProps) {
  const [activeTab, setActiveTab] = useState(viewMode);

  const getPicksByRound = (round: number) => {
    return picks.filter((p) => p.round === round).sort((a, b) => a.pick - b.pick);
  };

  const renderDraftGrid = () => {
    return (
      <ScrollArea className="w-full">
        <div className="min-w-[800px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(140px, 1fr))` }}>
            {Array.from({ length: totalRounds }, (_, i) => (
              <div key={i} className="text-center font-medium text-sm p-2 bg-muted rounded-md">
                Round {i + 1}
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-2">
            {Array.from({ length: teamsCount }, (_, teamIndex) => (
              <div
                key={teamIndex}
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(140px, 1fr))` }}
              >
                {Array.from({ length: totalRounds }, (_, roundIndex) => {
                  const pick = picks.find(
                    (p) => p.round === roundIndex + 1 && p.pick === teamIndex + 1
                  );
                  if (!pick) return <div key={roundIndex} className="h-16" />;

                  const isTraded =
                    pick.originalOwner.initials !== pick.currentOwner.initials;

                  return (
                    <div
                      key={roundIndex}
                      className={`p-2 rounded-md border border-border hover-elevate ${
                        pick.isUserPick ? "bg-primary/10 border-primary/30" : "bg-card"
                      }`}
                      data-testid={`pick-${pick.round}-${pick.pick}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {pick.round}.{String(pick.pick).padStart(2, "0")}
                        </span>
                        {isTraded && (
                          <Badge variant="outline" className="text-[10px] px-1">
                            via {pick.originalOwner.initials}
                          </Badge>
                        )}
                      </div>

                      {pick.player ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-[10px]">
                              {pick.player.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{pick.player.name}</p>
                            <Badge
                              className={`text-[10px] ${
                                positionColors[pick.player.position] || "bg-muted"
                              }`}
                            >
                              {pick.player.position}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback
                              className={`text-[10px] ${
                                pick.isUserPick
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              {pick.currentOwner.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground truncate">
                            {pick.currentOwner.name}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="font-heading text-lg">Draft Board</CardTitle>
            <Badge variant="outline">{year}</Badge>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "current" | "historical")}>
            <TabsList>
              <TabsTrigger value="current" data-testid="tab-current-draft">
                Current
              </TabsTrigger>
              <TabsTrigger value="historical" data-testid="tab-historical-draft">
                Historical
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === "current" ? (
          <>
            <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-primary/30 border border-primary/50" />
                <span>Your Picks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] px-1">
                  via XX
                </Badge>
                <span>Traded Pick</span>
              </div>
            </div>
            {renderDraftGrid()}
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              View historical draft results by selecting a previous year.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                2024 Rookie Draft
              </Button>
              <Button variant="outline" size="sm">
                2023 Rookie Draft
              </Button>
              <Button variant="outline" size="sm">
                2022 Startup
              </Button>
            </div>
            {renderDraftGrid()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
