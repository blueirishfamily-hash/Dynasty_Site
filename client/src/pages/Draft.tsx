import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  originalOwner: { name: string; initials: string; avatar?: string | null };
  currentOwner: { name: string; initials: string; avatar?: string | null };
  player?: { id: string; name: string; position: string; team: string };
  fantasyTeam?: string;
  isUserPick?: boolean;
}

interface TeamStanding {
  rosterId: number;
  rank: number;
  name: string;
  initials: string;
  avatar?: string | null;
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
  makePlayoffsPct?: number;
  projectedWins?: number;
  status: "eliminated" | "clinched" | "bubble";
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

  const { data: playoffPredictions } = useQuery<{ predictions: PlayoffPrediction[]; remainingWeeks: number }>({
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

  const rosterNameMap = new Map<number, { name: string; initials: string; avatar?: string | null }>();
  standings?.forEach((s: any) => {
    rosterNameMap.set(s.rosterId, { name: s.name, initials: s.initials, avatar: s.avatar });
  });

  const formattedFuturePicks: DraftPick[] = (draftPicks || [])
    .filter((p: any) => p.season === currentYear.toString())
    .filter((p: any) => p.round <= totalRounds)
    .map((pick: any) => {
      const originalOwner = rosterNameMap.get(pick.originalOwnerId) || { name: `Team ${pick.originalOwnerId}`, initials: "??", avatar: null };
      const currentOwner = rosterNameMap.get(pick.currentOwnerId) || { name: `Team ${pick.currentOwnerId}`, initials: "??", avatar: null };
      
      return {
        round: pick.round,
        pick: pick.rosterId,
        originalOwner: { name: originalOwner.name, initials: originalOwner.initials, avatar: originalOwner.avatar },
        currentOwner: { name: currentOwner.name, initials: currentOwner.initials, avatar: currentOwner.avatar },
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
      const owner = rosterNameMap.get(pick.rosterId) || { name: `Team ${pick.rosterId}`, initials: "??", avatar: null };
      
      return {
        round: pick.round,
        pick: pick.draftSlot,
        originalOwner: { name: owner.name, initials: owner.initials, avatar: owner.avatar },
        currentOwner: { name: owner.name, initials: owner.initials, avatar: owner.avatar },
        isUserPick: pick.pickedBy === user?.userId,
        fantasyTeam: pick.fantasyTeam,
        player: {
          id: pick.playerId,
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

  // Calculate draft odds using Monte Carlo simulation
  // Non-playoff teams get picks 1-5 based on max points (lowest = pick 1)
  // Playoff teams get picks 6-12 based on postseason finish (worst finisher = pick 6, champion = pick 12)
  // Bubble teams have odds spread across all picks based on their playoff probability
  // After regular season ends (remainingWeeks === 0), eliminated teams are locked into draft slots by points scored
  const calculateDraftOdds = (): DraftOddsTeam[] => {
    if (!standings) return [];

    const SIMULATIONS = 10000;
    const NON_PLAYOFF_PICKS = 5; // Picks 1-5 for non-playoff teams
    const regularSeasonEnded = playoffPredictions?.remainingWeeks === 0;

    const predictionMap = new Map(
      (playoffPredictions?.predictions || []).map(p => [p.rosterId, p])
    );

    // Build list of teams with prediction data
    const teamsWithData: DraftOddsTeam[] = standings.map(team => {
      const prediction = predictionMap.get(team.rosterId);
      const makePlayoffsPct = prediction?.makePlayoffsPct ?? (team.rank <= playoffTeams ? 100 : 0);
      
      // Determine team status
      let status: "eliminated" | "clinched" | "bubble";
      if (makePlayoffsPct === 0) {
        status = "eliminated";
      } else if (makePlayoffsPct >= 100) {
        status = "clinched";
      } else {
        status = "bubble";
      }
      
      return {
        rosterId: team.rosterId,
        name: team.name,
        initials: team.initials,
        record: `${team.wins}-${team.losses}`,
        wins: team.wins,
        losses: team.losses,
        pointsFor: team.pointsFor,
        isPlayoffTeam: makePlayoffsPct >= 50,
        projectedFinish: undefined,
        maxPoints: team.pointsFor,
        pickOdds: new Array(totalTeams).fill(0),
        isUser: team.isUser,
        missPlayoffsPct: 100 - makePlayoffsPct,
        makePlayoffsPct,
        projectedWins: prediction?.projectedWins ?? team.wins,
        status,
      };
    });

    // Track pick counts per team across simulations
    const pickCounts: Map<number, number[]> = new Map();
    teamsWithData.forEach(team => {
      pickCounts.set(team.rosterId, new Array(totalTeams).fill(0));
    });

    // If regular season has ended, lock eliminated teams into draft slots by points scored
    // Lowest points = Pick 1, highest points among eliminated = Pick 5
    if (regularSeasonEnded) {
      const eliminatedTeams = teamsWithData.filter(t => t.status === "eliminated");
      const clinched = teamsWithData.filter(t => t.status === "clinched");
      
      // Sort eliminated teams by points (lowest first = pick 1)
      eliminatedTeams.sort((a, b) => a.pointsFor - b.pointsFor);
      
      // Assign 100% odds for eliminated teams (locked in)
      eliminatedTeams.forEach((team, index) => {
        if (index < NON_PLAYOFF_PICKS) {
          team.pickOdds[index] = 100;
        }
      });
      
      // For playoff teams, still run Monte Carlo for picks 6-12 based on playoff finish
      for (let sim = 0; sim < SIMULATIONS; sim++) {
        // Sort clinched teams with random variance for playoff finish
        const sortedClinched = [...clinched].sort((a, b) => {
          const varianceA = (Math.random() - 0.5) * 2;
          const varianceB = (Math.random() - 0.5) * 2;
          const winsA = (a.projectedWins ?? a.wins) + varianceA;
          const winsB = (b.projectedWins ?? b.wins) + varianceB;
          if (Math.abs(winsA - winsB) > 0.1) return winsA - winsB;
          return a.pointsFor - b.pointsFor;
        });
        
        sortedClinched.forEach((team, index) => {
          const pickPosition = NON_PLAYOFF_PICKS + index;
          if (pickPosition < totalTeams) {
            const counts = pickCounts.get(team.rosterId)!;
            counts[pickPosition]++;
          }
        });
      }
      
      // Convert counts to percentages for playoff teams only
      clinched.forEach(team => {
        const counts = pickCounts.get(team.rosterId)!;
        team.pickOdds = counts.map(count => (count / SIMULATIONS) * 100);
      });
      
      // Sort teams by their most likely pick position
      teamsWithData.sort((a, b) => {
        const maxOddsA = Math.max(...a.pickOdds);
        const maxOddsB = Math.max(...b.pickOdds);
        const bestPickA = a.pickOdds.indexOf(maxOddsA);
        const bestPickB = b.pickOdds.indexOf(maxOddsB);
        return bestPickA - bestPickB;
      });
      
      return teamsWithData;
    }

    // Run Monte Carlo simulations (regular season still ongoing)
    for (let sim = 0; sim < SIMULATIONS; sim++) {
      // For each simulation, determine which teams make playoffs
      const madePlayoffs: DraftOddsTeam[] = [];
      const missedPlayoffs: DraftOddsTeam[] = [];

      teamsWithData.forEach(team => {
        const rand = Math.random() * 100;
        if (rand < (team.makePlayoffsPct ?? 0)) {
          madePlayoffs.push(team);
        } else {
          missedPlayoffs.push(team);
        }
      });

      // Ensure we have exactly playoffTeams making playoffs
      // If too many made it, remove the ones with lowest probability
      while (madePlayoffs.length > playoffTeams) {
        madePlayoffs.sort((a, b) => (a.makePlayoffsPct ?? 0) - (b.makePlayoffsPct ?? 0));
        const removed = madePlayoffs.shift()!;
        missedPlayoffs.push(removed);
      }
      // If too few made it, add the ones with highest probability
      while (madePlayoffs.length < playoffTeams && missedPlayoffs.length > 0) {
        missedPlayoffs.sort((a, b) => (b.makePlayoffsPct ?? 0) - (a.makePlayoffsPct ?? 0));
        const added = missedPlayoffs.shift()!;
        madePlayoffs.push(added);
      }

      // Sort missed playoff teams by max points (with random variance for ties)
      // Lowest max points = Pick 1
      const sortedMissed = [...missedPlayoffs].sort((a, b) => {
        // Add small random variance to create uncertainty in close races
        const varianceA = (Math.random() - 0.5) * 50; // +/- 25 points variance
        const varianceB = (Math.random() - 0.5) * 50;
        const pointsA = a.maxPoints + varianceA;
        const pointsB = b.maxPoints + varianceB;
        if (Math.abs(pointsA - pointsB) > 0.1) return pointsA - pointsB;
        return a.wins - b.wins;
      });

      // Sort made playoff teams by projected finish (with random variance)
      // Worst finish = Pick 6, Best finish (champion) = Pick 12
      const sortedMade = [...madePlayoffs].sort((a, b) => {
        // More variance for playoff finish since playoffs are more unpredictable
        const varianceA = (Math.random() - 0.5) * 2; // +/- 1 win variance
        const varianceB = (Math.random() - 0.5) * 2;
        const winsA = (a.projectedWins ?? a.wins) + varianceA;
        const winsB = (b.projectedWins ?? b.wins) + varianceB;
        if (Math.abs(winsA - winsB) > 0.1) return winsA - winsB; // Fewer wins = earlier pick
        return a.pointsFor - b.pointsFor;
      });

      // Assign picks for this simulation
      // Non-playoff teams get picks 1-5
      sortedMissed.forEach((team, index) => {
        if (index < NON_PLAYOFF_PICKS) {
          const counts = pickCounts.get(team.rosterId)!;
          counts[index]++;
        }
      });

      // Playoff teams get picks 6-12 (or 6 to totalTeams)
      sortedMade.forEach((team, index) => {
        const pickPosition = NON_PLAYOFF_PICKS + index;
        if (pickPosition < totalTeams) {
          const counts = pickCounts.get(team.rosterId)!;
          counts[pickPosition]++;
        }
      });
    }

    // Convert counts to percentages (preserve to thousandth place)
    teamsWithData.forEach(team => {
      const counts = pickCounts.get(team.rosterId)!;
      team.pickOdds = counts.map(count => (count / SIMULATIONS) * 100);
    });

    // Apply minimum floor of 0.001% for all picks within each team's competitive range
    // This represents the "upset" factor - any team can theoretically get any pick in their range
    const MIN_ODDS = 0.001;
    teamsWithData.forEach(team => {
      // Determine the pick range for this team based on status
      let pickRange: [number, number];
      if (team.status === "eliminated") {
        // Eliminated teams compete for picks 1-5 (indices 0-4)
        pickRange = [0, NON_PLAYOFF_PICKS - 1];
      } else if (team.status === "clinched") {
        // Clinched teams compete for picks 6-12 (indices 5-11)
        pickRange = [NON_PLAYOFF_PICKS, totalTeams - 1];
      } else {
        // Bubble teams can get any pick
        pickRange = [0, totalTeams - 1];
      }

      // Apply minimum floor within the range
      let adjustmentNeeded = 0;
      for (let i = pickRange[0]; i <= pickRange[1]; i++) {
        if (team.pickOdds[i] < MIN_ODDS) {
          adjustmentNeeded += MIN_ODDS - team.pickOdds[i];
          team.pickOdds[i] = MIN_ODDS;
        }
      }

      // Redistribute the adjustment from picks that have room to spare
      if (adjustmentNeeded > 0) {
        const picksWithRoom = [];
        for (let i = pickRange[0]; i <= pickRange[1]; i++) {
          if (team.pickOdds[i] > MIN_ODDS) {
            picksWithRoom.push(i);
          }
        }
        if (picksWithRoom.length > 0) {
          const reduction = adjustmentNeeded / picksWithRoom.length;
          picksWithRoom.forEach(i => {
            team.pickOdds[i] = Math.max(MIN_ODDS, team.pickOdds[i] - reduction);
          });
        }
      }
    });

    // Sort teams by their most likely pick position
    teamsWithData.sort((a, b) => {
      const maxOddsA = Math.max(...a.pickOdds);
      const maxOddsB = Math.max(...b.pickOdds);
      const bestPickA = a.pickOdds.indexOf(maxOddsA);
      const bestPickB = b.pickOdds.indexOf(maxOddsB);
      return bestPickA - bestPickB;
    });

    return teamsWithData;
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
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${pick.player.id}.jpg`}
                              alt={pick.player.name}
                            />
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
                            {pick.currentOwner.avatar && (
                              <AvatarImage src={pick.currentOwner.avatar} alt={pick.currentOwner.name} />
                            )}
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
        <p className="text-muted-foreground">View draft capital, historical picks, and projected draft order</p>
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
                Probabilities based on 10,000 Monte Carlo simulations. Non-playoff teams compete for picks 1-5 (lowest max points = Pick 1). 
                Playoff teams get picks 6-12 based on postseason finish (worst = Pick 6, champion = Pick 12). 
                Bubble teams have odds spread across all picks based on their playoff probability.
              </CardDescription>
              
              <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span>Eliminated (Picks 1-5)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-chart-3" />
                  <span>Bubble (Any Pick)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span>Clinched (Picks 6-12)</span>
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
                          {team.status === "clinched" ? (
                            <Badge className="bg-primary text-primary-foreground">
                              <Trophy className="w-3 h-3 mr-1" />
                              Clinched
                            </Badge>
                          ) : team.status === "eliminated" ? (
                            <Badge variant="destructive">
                              <TrendingDown className="w-3 h-3 mr-1" />
                              Eliminated
                            </Badge>
                          ) : (
                            <Badge className="bg-chart-3 text-white">
                              {Math.round(team.makePlayoffsPct ?? 0)}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {team.pointsFor.toFixed(1)}
                        </TableCell>
                        {Array.from({ length: Math.min(totalTeams, 12) }, (_, pickIndex) => {
                          const odds = team.pickOdds[pickIndex] || 0;
                          const maxOdds = Math.max(...team.pickOdds);
                          const isHighest = odds === maxOdds && odds > 0;
                          
                          let bgClass = "";
                          if (odds >= 50) {
                            bgClass = "bg-primary/30 font-bold text-primary";
                          } else if (odds >= 25) {
                            bgClass = "bg-primary/15 font-medium";
                          } else if (odds >= 10) {
                            bgClass = "bg-muted/80";
                          } else if (odds > 0) {
                            bgClass = "bg-muted/40 text-muted-foreground";
                          }
                          
                          return (
                            <TableCell 
                              key={pickIndex} 
                              className={`text-center tabular-nums text-sm ${bgClass} ${isHighest ? "ring-2 ring-primary ring-inset" : ""}`}
                            >
                              {odds > 0 ? `${odds.toFixed(3)}%` : "—"}
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
