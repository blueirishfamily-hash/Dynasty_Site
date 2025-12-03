import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Calendar, Dice1, Trophy, TrendingDown } from "lucide-react";

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
  fantasyTeam: string;
}

interface DraftPick {
  round: number;
  pick: number;
  originalOwner: { name: string; initials: string };
  currentOwner: { name: string; initials: string };
  player?: { name: string; position: string; team: string };
  fantasyTeam?: string;
  isUserPick?: boolean;
}

interface TeamStanding {
  rosterId: number;
  rank: number;
  name: string;
  initials: string;
  wins: number;
  losses: number;
  pointsFor: number;
  isUser?: boolean;
}

interface PlayoffPrediction {
  rosterId: number;
  name: string;
  initials: string;
  makePlayoffsPct: number;
  oneSeedPct: number;
  projectedWins: number;
}

interface DraftOddsTeam {
  rosterId: number;
  name: string;
  initials: string;
  record: string;
  wins: number;
  losses: number;
  pointsFor: number;
  isPlayoffTeam: boolean;
  projectedFinish?: number;
  maxPoints: number;
  pickOdds: number[];
  isUser?: boolean;
  missPlayoffsPct?: number;
  projectedWins?: number;
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
  const [activeTab, setActiveTab] = useState<"future" | "historical" | "odds">("future");
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

  const { data: standings } = useQuery<TeamStanding[]>({
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

  const { data: playoffPredictions } = useQuery<{ predictions: PlayoffPrediction[] }>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  // Auto-select 2024 draft when drafts load
  useEffect(() => {
    if (drafts && drafts.length > 0 && !selectedDraftId) {
      const draft2024 = drafts.find(d => d.season === "2024" && d.status === "complete");
      if (draft2024) {
        setSelectedDraftId(draft2024.draftId);
      } else {
        const latestCompleted = drafts
          .filter(d => d.status === "complete")
          .sort((a, b) => parseInt(b.season) - parseInt(a.season))[0];
        if (latestCompleted) {
          setSelectedDraftId(latestCompleted.draftId);
        }
      }
    }
  }, [drafts, selectedDraftId]);

  const userTeamStanding = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeamStanding?.rosterId;
  const currentYear = parseInt(season) + 1;
  const totalRounds = 3;
  const playoffTeams = league?.playoffTeams || 6;
  const totalTeams = league?.totalRosters || 12;

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
        fantasyTeam: pick.fantasyTeam,
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

  // Calculate draft odds based on standings and playoff predictions
  // Uses weighted lottery odds similar to NBA draft lottery system
  const calculateDraftOdds = (): DraftOddsTeam[] => {
    if (!standings) return [];

    const predictionMap = new Map(
      (playoffPredictions?.predictions || []).map(p => [p.rosterId, p])
    );

    // Build list of teams with prediction data
    const teamsWithPredictions = standings.map(team => {
      const prediction = predictionMap.get(team.rosterId);
      return {
        ...team,
        prediction,
        makePlayoffsPct: prediction?.makePlayoffsPct ?? (team.rank <= playoffTeams ? 100 : 0),
        projectedWins: prediction?.projectedWins ?? team.wins,
      };
    });

    // Determine playoff teams vs lottery teams based on predictions or current rank
    const teamsWithData: DraftOddsTeam[] = teamsWithPredictions.map(team => {
      // Use prediction data if available, otherwise use current standings
      const isPlayoffTeam = team.makePlayoffsPct >= 50;
      
      return {
        rosterId: team.rosterId,
        name: team.name,
        initials: team.initials,
        record: `${team.wins}-${team.losses}`,
        wins: team.wins,
        losses: team.losses,
        pointsFor: team.pointsFor,
        isPlayoffTeam,
        projectedFinish: undefined, // Will be assigned after sorting
        maxPoints: team.pointsFor,
        pickOdds: new Array(totalTeams).fill(0),
        isUser: team.isUser,
        missPlayoffsPct: 100 - team.makePlayoffsPct,
        projectedWins: team.projectedWins,
      };
    });

    // Separate playoff and lottery teams
    const playoffTeamsList = teamsWithData.filter(t => t.isPlayoffTeam);
    const lotteryTeams = teamsWithData.filter(t => !t.isPlayoffTeam);

    // Sort lottery teams: worst record first, then by lowest points (for tiebreaker)
    lotteryTeams.sort((a, b) => {
      // Primary: fewer wins = higher pick
      if (a.wins !== b.wins) return a.wins - b.wins;
      // Secondary: lower points = higher pick (for teams that missed playoffs)
      return a.pointsFor - b.pointsFor;
    });

    // Sort playoff teams by projected wins and points - best teams pick last
    // Teams with more projected wins are seeded higher (better), pick later
    playoffTeamsList.sort((a, b) => {
      // Primary: more projected wins = higher seed = later pick
      const winsA = a.projectedWins ?? a.wins;
      const winsB = b.projectedWins ?? b.wins;
      if (winsA !== winsB) return winsA - winsB; // Ascending - fewer wins picks earlier
      // Secondary: higher points = higher seed = later pick
      return a.pointsFor - b.pointsFor; // Ascending - fewer points picks earlier
    });

    // Assign projected finish (seed) based on sorted order
    playoffTeamsList.forEach((team, index) => {
      // Best team (last in sort) gets seed 1, worst playoff team gets highest seed
      team.projectedFinish = playoffTeamsList.length - index;
    });

    // Generate lottery-style weighted odds for non-playoff teams
    // Uses Monte Carlo simulation to calculate realistic pick probabilities
    const lotteryPicks = lotteryTeams.length;
    
    if (lotteryPicks > 0) {
      // Run Monte Carlo simulation to calculate lottery odds
      const SIMULATIONS = 10000;
      const pickCounts: Map<number, number[]> = new Map();
      
      // Initialize pick count arrays for each team
      lotteryTeams.forEach((_, idx) => {
        pickCounts.set(idx, new Array(lotteryPicks).fill(0));
      });
      
      // Get lottery weights (worst team gets highest weight)
      const lotteryWeights = generateLotteryWeights(lotteryPicks);
      
      for (let sim = 0; sim < SIMULATIONS; sim++) {
        // Track which teams have been assigned picks
        const availableTeams = lotteryTeams.map((_, i) => i);
        
        for (let pick = 0; pick < lotteryPicks; pick++) {
          // Calculate total weight of remaining teams
          const totalWeight = availableTeams.reduce((sum, teamIdx) => sum + lotteryWeights[teamIdx], 0);
          
          // Random selection based on weights
          let random = Math.random() * totalWeight;
          let selectedTeamIdx = availableTeams[0];
          
          for (const teamIdx of availableTeams) {
            random -= lotteryWeights[teamIdx];
            if (random <= 0) {
              selectedTeamIdx = teamIdx;
              break;
            }
          }
          
          // Record this pick
          pickCounts.get(selectedTeamIdx)![pick]++;
          
          // Remove selected team from available pool
          const teamArrayIdx = availableTeams.indexOf(selectedTeamIdx);
          availableTeams.splice(teamArrayIdx, 1);
        }
      }
      
      // Convert counts to percentages
      lotteryTeams.forEach((team, teamIdx) => {
        const counts = pickCounts.get(teamIdx)!;
        counts.forEach((count, pickIdx) => {
          team.pickOdds[pickIdx] = Math.round((count / SIMULATIONS) * 1000) / 10;
        });
      });
    }

    // Playoff teams get deterministic picks based on projected finish
    // Best team (seed 1) gets last pick, worst playoff team gets first playoff pick
    playoffTeamsList.forEach((team, index) => {
      const pickPosition = lotteryPicks + index;
      if (pickPosition < totalTeams) {
        team.pickOdds[pickPosition] = 100;
      }
    });

    // Combine lottery teams (ordered by expected pick) and playoff teams
    return [...lotteryTeams, ...playoffTeamsList];
  };

  // Generate weighted lottery odds (worst team gets most weight)
  const generateLotteryWeights = (numTeams: number): number[] => {
    // Weighted lottery odds - worst team gets highest probability
    // These weights are designed to give worst teams advantage while still allowing upsets
    const baseWeights: Record<number, number[]> = {
      1: [100],
      2: [55, 45],
      3: [50, 30, 20],
      4: [40, 27.5, 20, 12.5],
      5: [35, 25, 20, 12.5, 7.5],
      6: [30, 22.5, 17.5, 14, 10, 6],
    };
    
    if (baseWeights[numTeams]) {
      return baseWeights[numTeams];
    }
    
    // For larger lottery pools, create declining weights
    const weights: number[] = [];
    let remaining = 100;
    for (let i = 0; i < numTeams; i++) {
      const weight = Math.max(3, remaining * (0.35 - i * 0.03));
      weights.push(Math.round(weight * 10) / 10);
      remaining -= weight;
    }
    
    // Normalize to ensure weights sum to 100
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => Math.round((w / total) * 1000) / 10);
  };

  const draftOddsTeams = calculateDraftOdds();

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
                            {pick.fantasyTeam && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {pick.fantasyTeam}
                              </p>
                            )}
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
        <p className="text-muted-foreground">View draft capital, historical picks, and draft lottery odds</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <CardTitle className="font-heading text-lg">Draft Picks</CardTitle>
              <Badge variant="outline">
                {activeTab === "future" 
                  ? currentYear 
                  : activeTab === "historical" 
                    ? (selectedDraftId ? completedDrafts.find(d => d.draftId === selectedDraftId)?.season : "")
                    : `${currentYear} Odds`
                }
              </Badge>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "future" | "historical" | "odds")}>
              <TabsList>
                <TabsTrigger value="future" data-testid="tab-future-draft">
                  Future Picks
                </TabsTrigger>
                <TabsTrigger value="historical" data-testid="tab-historical-draft">
                  Historical
                </TabsTrigger>
                <TabsTrigger value="odds" data-testid="tab-draft-odds">
                  <Dice1 className="w-4 h-4 mr-1" />
                  Draft Odds
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
          ) : activeTab === "historical" ? (
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
          ) : (
            <div className="space-y-4">
              <CardDescription>
                Draft order is determined by: 1) Record (worst to best), 2) For non-playoff teams: lowest max points scored gets earlier pick, 
                3) For playoff teams: projected finish determines pick order (champion picks last).
              </CardDescription>
              
              <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span>Lottery Team (Missed Playoffs)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span>Playoff Team</span>
                </div>
              </div>

              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Team</TableHead>
                      <TableHead className="text-center">Record</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Points For</TableHead>
                      {Array.from({ length: Math.min(totalTeams, 12) }, (_, i) => (
                        <TableHead key={i} className="text-center w-16">
                          Pick {i + 1}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftOddsTeams.map((team, index) => (
                      <TableRow 
                        key={team.rosterId}
                        className={team.isUser ? "bg-primary/5" : ""}
                        data-testid={`draft-odds-row-${team.rosterId}`}
                      >
                        <TableCell className="sticky left-0 bg-background z-10">
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
                          {team.record}
                        </TableCell>
                        <TableCell className="text-center">
                          {team.isPlayoffTeam ? (
                            <Badge className="bg-primary text-primary-foreground">
                              <Trophy className="w-3 h-3 mr-1" />
                              Playoff #{team.projectedFinish || "?"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <TrendingDown className="w-3 h-3 mr-1" />
                              Lottery
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {team.pointsFor.toFixed(1)}
                        </TableCell>
                        {Array.from({ length: Math.min(totalTeams, 12) }, (_, pickIndex) => {
                          const odds = team.pickOdds[pickIndex] || 0;
                          return (
                            <TableCell 
                              key={pickIndex} 
                              className={`text-center tabular-nums ${
                                odds === 100 
                                  ? "bg-primary/20 font-bold text-primary" 
                                  : odds > 0 
                                    ? "bg-muted/50" 
                                    : ""
                              }`}
                            >
                              {odds > 0 ? `${odds}%` : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
