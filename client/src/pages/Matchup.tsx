import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

interface MatchupPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  points: number;
}

interface MatchupTeam {
  rosterId: number;
  name: string;
  initials: string;
  score: number;
  record: string;
  starters: MatchupPlayer[];
  bench: MatchupPlayer[];
}

interface MatchupData {
  userTeam: MatchupTeam;
  opponentTeam: MatchupTeam | null;
  week: number;
}

interface PositionalMatchup {
  position: string;
  slotLabel: string;
  userPlayer: MatchupPlayer | null;
  opponentPlayer: MatchupPlayer | null;
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

const positionOrder = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];

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

  const { positionalMatchups, maxPoints } = useMemo(() => {
    if (!userTeam) {
      return { positionalMatchups: [], maxPoints: 0 };
    }

    const userStarters = [...userTeam.starters];
    const opponentStarters = opponentTeam ? [...opponentTeam.starters] : [];

    const slotCounts: Record<string, number> = {};
    const matchups: PositionalMatchup[] = [];

    const allPoints = [
      ...userStarters.map(p => p.points),
      ...opponentStarters.map(p => p.points),
    ];
    const maxPts = Math.max(...allPoints, 1);

    positionOrder.forEach(pos => {
      const userPlayers = userStarters.filter(p => p.position === pos);
      const oppPlayers = opponentStarters.filter(p => p.position === pos);
      const maxSlots = Math.max(userPlayers.length, oppPlayers.length, 0);

      if (maxSlots === 0) return;

      for (let i = 0; i < maxSlots; i++) {
        slotCounts[pos] = (slotCounts[pos] || 0) + 1;
        const slotNum = slotCounts[pos];
        const slotLabel = maxSlots > 1 ? `${pos}${slotNum}` : pos;

        matchups.push({
          position: pos,
          slotLabel,
          userPlayer: userPlayers[i] || null,
          opponentPlayer: oppPlayers[i] || null,
        });
      }
    });

    return { positionalMatchups: matchups, maxPoints: maxPts };
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
                  <p className={`text-4xl font-bold tabular-nums ${userWinning ? "text-primary" : ""}`} data-testid="text-user-score">
                    {userTeam.score.toFixed(1)}
                  </p>
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-2xl font-bold text-muted-foreground">VS</span>
                  </div>
                  <p className={`text-4xl font-bold tabular-nums ${!userWinning ? "text-primary" : ""}`} data-testid="text-opponent-score">
                    {opponentTeam.score.toFixed(1)}
                  </p>
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
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-4">
                <div className="text-sm font-medium text-primary text-right">
                  {userTeam.name}
                </div>
                <div className="w-12" />
                <div className="text-sm font-medium text-muted-foreground text-left">
                  {opponentTeam.name}
                </div>
              </div>

              <div className="space-y-1">
                {positionalMatchups.map((matchup, index) => (
                  <div 
                    key={`${matchup.position}-${index}`}
                    className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-2 border-b border-border last:border-0"
                    data-testid={`matchup-row-${matchup.slotLabel}`}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <div className="text-right min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {matchup.userPlayer?.name || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {matchup.userPlayer?.team || ""}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums w-12 text-right">
                        {(matchup.userPlayer?.points ?? 0).toFixed(1)}
                      </span>
                    </div>

                    <Badge 
                      className={`text-[10px] px-1.5 h-5 w-12 justify-center ${positionColors[matchup.position] || "bg-muted text-muted-foreground"}`}
                    >
                      {matchup.slotLabel}
                    </Badge>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums w-12 text-left">
                        {(matchup.opponentPlayer?.points ?? 0).toFixed(1)}
                      </span>
                      <div className="text-left min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {matchup.opponentPlayer?.name || "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {matchup.opponentPlayer?.team || ""}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                  Points Comparison
                </h4>
                <div className="space-y-2">
                  {positionalMatchups.map((matchup, index) => (
                    <div 
                      key={`bar-${matchup.position}-${index}`}
                      className="flex items-center gap-2"
                      data-testid={`bar-${matchup.slotLabel}`}
                    >
                      <Badge 
                        className={`text-[10px] px-1.5 h-5 w-12 justify-center shrink-0 ${positionColors[matchup.position] || "bg-muted text-muted-foreground"}`}
                      >
                        {matchup.slotLabel}
                      </Badge>
                      <DualSidedBar
                        userPoints={matchup.userPlayer?.points || 0}
                        opponentPoints={matchup.opponentPlayer?.points || 0}
                        maxPoints={maxPoints}
                      />
                    </div>
                  ))}
                </div>
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
