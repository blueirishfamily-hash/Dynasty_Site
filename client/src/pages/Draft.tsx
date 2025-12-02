import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface DraftInfo {
  draftId: string;
  leagueId: string;
  season: string;
  status: string;
  type: string;
  rounds: number;
  startTime: number;
  created: number;
}

interface DraftPickData {
  round: number;
  rosterId: number;
  playerId: string;
  pickedBy: string;
  pickNo: number;
  draftSlot: number;
  playerName: string;
  position: string;
  team: string;
}

interface DraftPick {
  round: number;
  pick: number;
  originalOwner: { name: string; initials: string };
  currentOwner: { name: string; initials: string };
  player?: { name: string; position: string; team: string };
  isUserPick?: boolean;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
};

function getTeamInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function Draft() {
  const { user, league, season } = useSleeper();
  const [activeTab, setActiveTab] = useState<"future" | "historical">("future");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const { data: draftPicks, isLoading: picksLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: standings } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId || ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery<DraftInfo[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "drafts"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/drafts`);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: historicalPicks, isLoading: historicalLoading } = useQuery<DraftPickData[]>({
    queryKey: ["/api/sleeper/draft", selectedDraftId, "picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/draft/${selectedDraftId}/picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!selectedDraftId,
  });

  const userTeamStanding = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeamStanding?.rosterId;
  const currentYear = parseInt(season) + 1;
  const totalRounds = 3;

  const rosterNameMap = new Map<number, { name: string; initials: string }>();
  standings?.forEach((s: any) => {
    rosterNameMap.set(s.rosterId, { name: s.name, initials: s.initials });
  });

  const formattedFuturePicks: DraftPick[] = (draftPicks || [])
    .filter((p: any) => p.season === currentYear.toString())
    .filter((p: any) => p.round <= totalRounds)
    .map((pick: any) => {
      const originalOwner = rosterNameMap.get(pick.originalOwnerId) || { name: `Team ${pick.originalOwnerId}`, initials: "??" };
      const currentOwner = rosterNameMap.get(pick.currentOwnerId) || { name: `Team ${pick.currentOwnerId}`, initials: "??" };
      
      return {
        round: pick.round,
        pick: pick.rosterId,
        originalOwner: { name: originalOwner.name, initials: originalOwner.initials },
        currentOwner: { name: currentOwner.name, initials: currentOwner.initials },
        isUserPick: pick.currentOwnerId === userRosterId,
        player: undefined,
      };
    })
    .sort((a: DraftPick, b: DraftPick) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.pick - b.pick;
    });

  const formattedHistoricalPicks: DraftPick[] = (historicalPicks || [])
    .filter((p) => p.round <= totalRounds)
    .map((pick) => {
      const owner = rosterNameMap.get(pick.rosterId) || { name: `Team ${pick.rosterId}`, initials: "??" };
      
      return {
        round: pick.round,
        pick: pick.draftSlot,
        originalOwner: owner,
        currentOwner: owner,
        isUserPick: pick.pickedBy === user?.userId,
        player: {
          name: pick.playerName,
          position: pick.position,
          team: pick.team || "",
        },
      };
    })
    .sort((a: DraftPick, b: DraftPick) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.pick - b.pick;
    });

  const completedDrafts = (drafts || [])
    .filter(d => d.status === "complete")
    .sort((a, b) => parseInt(b.season) - parseInt(a.season));

  const renderDraftGrid = (picks: DraftPick[], showPlayers: boolean) => {
    const teamsCount = league?.totalRosters || 12;
    
    return (
      <ScrollArea className="w-full">
        <div className="min-w-[600px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(180px, 1fr))` }}>
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
                style={{ gridTemplateColumns: `repeat(${totalRounds}, minmax(180px, 1fr))` }}
              >
                {Array.from({ length: totalRounds }, (_, roundIndex) => {
                  const pick = picks.find(
                    (p) => p.round === roundIndex + 1 && p.pick === teamIndex + 1
                  );
                  if (!pick) return <div key={roundIndex} className="h-20" />;

                  const isTraded = pick.originalOwner.initials !== pick.currentOwner.initials;

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
                        {isTraded && !showPlayers && (
                          <Badge variant="outline" className="text-[10px] px-1">
                            via {pick.originalOwner.initials}
                          </Badge>
                        )}
                      </div>

                      {pick.player ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs">
                              {pick.player.name.split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{pick.player.name}</p>
                            <div className="flex items-center gap-1">
                              <Badge
                                className={`text-[10px] px-1.5 ${
                                  positionColors[pick.player.position] || "bg-muted"
                                }`}
                              >
                                {pick.player.position}
                              </Badge>
                              {pick.player.team && (
                                <span className="text-xs text-muted-foreground">
                                  {pick.player.team}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback
                              className={`text-xs ${
                                pick.isUserPick
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              {pick.currentOwner.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground truncate">
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

  if (!league) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view draft capital.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Draft Board</h1>
        <p className="text-muted-foreground">View draft capital and historical picks</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <CardTitle className="font-heading text-lg">Draft Picks</CardTitle>
              <Badge variant="outline">
                {activeTab === "future" ? currentYear : selectedDraftId ? completedDrafts.find(d => d.draftId === selectedDraftId)?.season : ""}
              </Badge>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "future" | "historical")}>
              <TabsList>
                <TabsTrigger value="future" data-testid="tab-future-draft">
                  Future Picks
                </TabsTrigger>
                <TabsTrigger value="historical" data-testid="tab-historical-draft">
                  Historical
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === "future" ? (
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
              {picksLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : formattedFuturePicks.length > 0 ? (
                renderDraftGrid(formattedFuturePicks, false)
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No draft pick data available
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {draftsLoading ? (
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-9 w-32" />
                  ))}
                </div>
              ) : completedDrafts.length > 0 ? (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {completedDrafts.map((draft) => (
                      <Button
                        key={draft.draftId}
                        variant={selectedDraftId === draft.draftId ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedDraftId(draft.draftId)}
                        data-testid={`draft-button-${draft.season}`}
                      >
                        <Calendar className="w-4 h-4 mr-1.5" />
                        {draft.season} {draft.type === "startup" ? "Startup" : "Rookie"}
                      </Button>
                    ))}
                  </div>

                  {selectedDraftId ? (
                    historicalLoading ? (
                      <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : formattedHistoricalPicks.length > 0 ? (
                      <>
                        <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.QB}`}>QB</Badge>
                            <span>Quarterback</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.RB}`}>RB</Badge>
                            <span>Running Back</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.WR}`}>WR</Badge>
                            <span>Wide Receiver</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.TE}`}>TE</Badge>
                            <span>Tight End</span>
                          </div>
                        </div>
                        {renderDraftGrid(formattedHistoricalPicks, true)}
                      </>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No picks found for this draft
                      </p>
                    )
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Select a draft to view results
                    </p>
                  )}
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No historical drafts found
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
