import { useState } from "react";
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

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
  FLEX: "bg-teal-500 text-white",
};

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

  const userTeam = matchup?.userTeam;
  const opponentTeam = matchup?.opponentTeam;
  const userWinning = userTeam && opponentTeam && userTeam.score > opponentTeam.score;
  const scoreDiff = userTeam && opponentTeam 
    ? Math.abs(userTeam.score - opponentTeam.score).toFixed(1)
    : "0.0";

  const renderPlayerRow = (player: MatchupPlayer, isOpponent: boolean = false) => {
    return (
      <div 
        key={player.id} 
        className={`flex items-center justify-between p-2 rounded-md ${
          isOpponent ? "bg-muted/50" : "bg-primary/5"
        }`}
        data-testid={`player-row-${player.id}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Badge className={`text-[10px] px-1.5 shrink-0 ${positionColors[player.position] || "bg-muted"}`}>
            {player.position}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{player.name}</p>
            <p className="text-xs text-muted-foreground">{player.team || "FA"}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold tabular-nums">{player.points.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground">pts</p>
        </div>
      </div>
    );
  };

  const renderTeamRoster = (team: MatchupTeam, isOpponent: boolean = false) => (
    <Card className={isOpponent ? "" : "border-primary/30"}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar className={`w-12 h-12 ${isOpponent ? "" : "ring-2 ring-primary ring-offset-2 ring-offset-background"}`}>
              <AvatarFallback className={`text-lg font-bold ${isOpponent ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                {team.initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="font-heading text-base" data-testid={isOpponent ? "text-opponent-name" : "text-user-name"}>
                {team.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{team.record}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${
              !isOpponent && userWinning ? "text-primary" : 
              isOpponent && !userWinning ? "text-primary" : ""
            }`} data-testid={isOpponent ? "text-opponent-score" : "text-user-score"}>
              {team.score.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">points</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            Starters
          </h4>
          <div className="space-y-1">
            {team.starters.map((player) => renderPlayerRow(player, isOpponent))}
          </div>
        </div>
        {team.bench.length > 0 && (
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              Bench
            </h4>
            <div className="space-y-1">
              {team.bench.slice(0, 5).map((player) => renderPlayerRow(player, isOpponent))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : userTeam && opponentTeam ? (
        <>
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
                    <p className="font-heading font-bold text-lg">{userTeam.name}</p>
                    <p className="text-sm text-muted-foreground">{userTeam.record}</p>
                  </div>
                </div>
                
                <div className="flex flex-col items-center px-8">
                  <p className={`text-4xl font-bold tabular-nums ${userWinning ? "text-primary" : ""}`}>
                    {userTeam.score.toFixed(1)}
                  </p>
                  <div className="flex items-center gap-2 my-2">
                    <span className="text-2xl font-bold text-muted-foreground">VS</span>
                  </div>
                  <p className={`text-4xl font-bold tabular-nums ${!userWinning ? "text-primary" : ""}`}>
                    {opponentTeam.score.toFixed(1)}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-heading font-bold text-lg">{opponentTeam.name}</p>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderTeamRoster(userTeam, false)}
            {renderTeamRoster(opponentTeam, true)}
          </div>
        </>
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
