import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Trophy, Info } from "lucide-react";

interface MatchupPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  points: number;
  projectedPoints: number;
  boom: number;
  bust: number;
  gamesPlayed: number;
}

interface MatchupTeam {
  rosterId: number;
  name: string;
  initials: string;
  score: number;
  projectedTotal: number;
  record: string;
  starters: MatchupPlayer[];
  bench: MatchupPlayer[];
}

interface MatchupData {
  userTeam: MatchupTeam;
  opponentTeam: MatchupTeam | null;
  week: number;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
  FLEX: "bg-teal-500 text-white",
};

interface RosterSlot {
  slotLabel: string;
  position: string;
  userPlayer: MatchupPlayer | null;
  opponentPlayer: MatchupPlayer | null;
}

function DualSidedBar({
  userPoints,
  opponentPoints,
  maxPoints,
}: {
  userPoints: number;
  opponentPoints: number;
  maxPoints: number;
}) {
  const userWidth = maxPoints > 0 ? (userPoints / maxPoints) * 100 : 0;
  const opponentWidth = maxPoints > 0 ? (opponentPoints / maxPoints) * 100 : 0;
  const userWins = userPoints > opponentPoints;
  const opponentWins = opponentPoints > userPoints;

  return (
    <div className="flex items-center gap-1 w-full">
      <div className="flex-1 flex justify-end">
        <div className="relative h-6 w-full flex justify-end items-center">
          <div 
            className={`absolute right-0 h-full rounded-l-sm transition-all ${
              userWins ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            style={{ width: `${userWidth}%` }}
          />
          <span className="relative z-10 pr-2 text-xs font-bold tabular-nums text-foreground">
            {userPoints.toFixed(1)}
          </span>
        </div>
      </div>
      <div className="w-px h-6 bg-border shrink-0" />
      <div className="flex-1">
        <div className="relative h-6 w-full flex justify-start items-center">
          <div 
            className={`absolute left-0 h-full rounded-r-sm transition-all ${
              opponentWins ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            style={{ width: `${opponentWidth}%` }}
          />
          <span className="relative z-10 pl-2 text-xs font-bold tabular-nums text-foreground">
            {opponentPoints.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Matchup() {
  const { user, league, currentWeek } = useSleeper();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);

  const { data: matchup, isLoading } = useQuery<MatchupData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "matchup-detail", user?.userId, selectedWeek],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/matchup-detail?userId=${user?.userId}&week=${selectedWeek}`
      );
      if (!res.ok) throw new Error("Failed to fetch matchup");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const handlePrevWeek = () => {
    if (selectedWeek > 1) setSelectedWeek(selectedWeek - 1);
  };

  const handleNextWeek = () => {
    if (selectedWeek < 18) setSelectedWeek(selectedWeek + 1);
  };

  const userTeam = matchup?.userTeam;
  const opponentTeam = matchup?.opponentTeam;
  const userWinning = userTeam && opponentTeam && userTeam.score > opponentTeam.score;
  const scoreDiff = userTeam && opponentTeam 
    ? Math.abs(userTeam.score - opponentTeam.score).toFixed(1)
    : "0.0";

  const { rosterSlots, maxPoints } = useMemo(() => {
    if (!userTeam) {
      return { rosterSlots: [], maxPoints: 0 };
    }

    const userStarters = [...userTeam.starters];
    const opponentStarters = opponentTeam ? [...opponentTeam.starters] : [];

    const allPoints = [
      ...userStarters.map(p => p.points),
      ...opponentStarters.map(p => p.points),
    ];
    const maxPts = Math.max(...allPoints, 1);

    const assignPlayersToSlots = (starters: MatchupPlayer[]): Map<string, MatchupPlayer | null> => {
      const slots = new Map<string, MatchupPlayer | null>();
      const slotOrder = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX1", "FLEX2", "K", "DEF"];
      slotOrder.forEach(slot => slots.set(slot, null));

      const available = [...starters];
      
      const findAndAssign = (slotName: string, positions: string[]) => {
        const idx = available.findIndex(p => positions.includes(p.position));
        if (idx !== -1) {
          slots.set(slotName, available.splice(idx, 1)[0]);
        }
      };

      findAndAssign("QB", ["QB"]);
      findAndAssign("RB1", ["RB"]);
      findAndAssign("RB2", ["RB"]);
      findAndAssign("WR1", ["WR"]);
      findAndAssign("WR2", ["WR"]);
      findAndAssign("TE", ["TE"]);
      findAndAssign("FLEX1", ["RB", "WR", "TE"]);
      findAndAssign("FLEX2", ["RB", "WR", "TE"]);
      findAndAssign("K", ["K"]);
      findAndAssign("DEF", ["DEF"]);

      return slots;
    };

    const userSlots = assignPlayersToSlots(userStarters);
    const opponentSlots = assignPlayersToSlots(opponentStarters);

    const slotOrder = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX1", "FLEX2", "K", "DEF"];
    const slots: RosterSlot[] = slotOrder.map(slotLabel => {
      const basePosition = slotLabel.replace(/[0-9]/g, "");
      return {
        slotLabel,
        position: basePosition,
        userPlayer: userSlots.get(slotLabel) || null,
        opponentPlayer: opponentSlots.get(slotLabel) || null,
      };
    });

    return { rosterSlots: slots, maxPoints: maxPts };
  }, [userTeam, opponentTeam]);

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view your matchup.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl font-bold">Matchup</h1>
          <p className="text-muted-foreground">View your weekly head-to-head matchup</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handlePrevWeek}
            disabled={selectedWeek <= 1}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className="px-3 py-1.5" data-testid="badge-current-week">
            Week {selectedWeek}
          </Badge>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={handleNextWeek}
            disabled={selectedWeek >= 18}
            data-testid="button-next-week"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : userTeam && opponentTeam ? (
        <div className="space-y-6">
          <Card className="bg-gradient-to-r from-primary/10 via-transparent to-muted/50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-16 h-16 ring-2 ring-primary ring-offset-2 ring-offset-background">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                      {userTeam.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-heading font-bold text-lg" data-testid="text-user-name">{userTeam.name}</p>
                    <p className="text-sm text-muted-foreground">{userTeam.record}</p>
                  </div>
                </div>
                
                <div className="flex flex-col items-center px-8">
                  <div className="text-center">
                    <p className={`text-4xl font-bold tabular-nums ${userWinning ? "text-primary" : ""}`} data-testid="text-user-score">
                      {userTeam.score.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Proj: {userTeam.projectedTotal.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-2xl font-bold text-muted-foreground">VS</span>
                  </div>
                  <div className="text-center">
                    <p className={`text-4xl font-bold tabular-nums ${!userWinning ? "text-primary" : ""}`} data-testid="text-opponent-score">
                      {opponentTeam.score.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Proj: {opponentTeam.projectedTotal.toFixed(1)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg" data-testid="text-opponent-name">{opponentTeam.name}</p>
                    <p className="text-sm text-muted-foreground">{opponentTeam.record}</p>
                  </div>
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xl font-bold">
                      {opponentTeam.initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              
              <div className="flex justify-center mt-4">
                <Badge variant={userWinning ? "default" : "secondary"} className="px-4 py-1">
                  {userWinning ? (
                    <>
                      <Trophy className="w-3 h-3 mr-1" />
                      Winning by {scoreDiff} pts
                    </>
                  ) : (
                    `Trailing by ${scoreDiff} pts`
                  )}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Positional Matchup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[minmax(100px,140px)_minmax(200px,1fr)_minmax(100px,140px)] gap-3 mb-4 items-center">
                <div className="text-right">
                  <p className="text-sm font-medium text-primary truncate">{userTeam.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-chart-2">Boom</span>/<span className="text-destructive">Bust</span>
                  </p>
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-center">
                  Points Comparison
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-muted-foreground truncate">{opponentTeam.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-chart-2">Boom</span>/<span className="text-destructive">Bust</span>
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                {rosterSlots.map((slot, index) => {
                  const userPts = slot.userPlayer?.points ?? 0;
                  const oppPts = slot.opponentPlayer?.points ?? 0;

                  return (
                    <div 
                      key={`${slot.slotLabel}-${index}`}
                      className="grid grid-cols-[minmax(100px,140px)_minmax(200px,1fr)_minmax(100px,140px)] gap-3 items-center py-2 border-b border-border last:border-0"
                      data-testid={`matchup-row-${slot.slotLabel}`}
                    >
                      <div className="flex items-center justify-end gap-2">
                        <div className="text-right min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {slot.userPlayer?.name || "—"}
                          </p>
                          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                            <span>{slot.userPlayer?.team || ""}</span>
                            {slot.userPlayer && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="tabular-nums cursor-help">
                                    <span className="text-chart-2">{slot.userPlayer.boom}</span>
                                    <span className="mx-0.5">/</span>
                                    <span className="text-destructive">{slot.userPlayer.bust}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">Boom/Bust Range</p>
                                  <p>Based on {slot.userPlayer.gamesPlayed >= 3 ? `${slot.userPlayer.gamesPlayed} games` : slot.userPlayer.gamesPlayed > 0 ? `${slot.userPlayer.gamesPlayed} game (blended)` : "position avg"}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge 
                          className={`text-[10px] px-1.5 h-5 w-14 justify-center shrink-0 ${positionColors[slot.position] || "bg-muted text-muted-foreground"}`}
                        >
                          {slot.slotLabel}
                        </Badge>
                        <DualSidedBar
                          userPoints={userPts}
                          opponentPoints={oppPts}
                          maxPoints={maxPoints}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-left min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {slot.opponentPlayer?.name || "—"}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {slot.opponentPlayer && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="tabular-nums cursor-help">
                                    <span className="text-chart-2">{slot.opponentPlayer.boom}</span>
                                    <span className="mx-0.5">/</span>
                                    <span className="text-destructive">{slot.opponentPlayer.bust}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">Boom/Bust Range</p>
                                  <p>Based on {slot.opponentPlayer.gamesPlayed >= 3 ? `${slot.opponentPlayer.gamesPlayed} games` : slot.opponentPlayer.gamesPlayed > 0 ? `${slot.opponentPlayer.gamesPlayed} game (blended)` : "position avg"}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <span>{slot.opponentPlayer?.team || ""}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-heading text-lg font-bold mb-2">No Matchup Found</h3>
            <p className="text-muted-foreground">
              There's no matchup data available for week {selectedWeek}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
