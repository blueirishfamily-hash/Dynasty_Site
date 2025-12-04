import { useEffect } from "react";
import { useSleeper } from "@/lib/sleeper-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  Trophy, 
  Crown, 
  Target, 
  Star, 
  Sparkles,
  Award,
  Medal,
} from "lucide-react";

interface TrophyWinner {
  season: string;
  rosterId: number;
  ownerId: string;
  teamName: string;
  initials: string;
  avatar: string | null;
  value?: number;
  managerName?: string;
  playerId?: string;
  playerName?: string;
  playerPosition?: string;
  playerTeam?: string | null;
}

interface TrophyResponse {
  champions: TrophyWinner[];
  highestScorers: TrophyWinner[];
  mvpWinners: TrophyWinner[];
  royWinners: TrophyWinner[];
  gmWinners: TrophyWinner[];
  seasonsTracked: number;
}

function TrophyCase({ 
  title, 
  description, 
  icon: Icon, 
  winners, 
  isLoading,
  iconColor,
  showPoints = false,
  showPlayer = false,
}: { 
  title: string;
  description: string;
  icon: typeof Trophy;
  winners: TrophyWinner[];
  isLoading: boolean;
  iconColor: string;
  showPoints?: boolean;
  showPlayer?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${iconColor}`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const testIdBase = title.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <Card className="flex flex-col" data-testid={`card-trophy-${testIdBase}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${iconColor}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle className="text-lg font-heading" data-testid={`text-trophy-title-${testIdBase}`}>{title}</CardTitle>
            <CardDescription className="text-sm">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {winners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Icon className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">No winners yet</p>
            <p className="text-sm">Check back after the season</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {winners.map((winner, idx) => (
                <div 
                  key={`${winner.season}-${winner.rosterId}`}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover-elevate ${
                    idx === 0 ? "bg-primary/5 border-primary/20" : "bg-card"
                  }`}
                  data-testid={`trophy-${title.toLowerCase().replace(/\s+/g, '-')}-${winner.season}`}
                >
                  <div className="flex-shrink-0 relative">
                    <Avatar className="w-12 h-12 ring-2 ring-offset-2 ring-offset-background ring-primary/20">
                      {winner.avatar && <AvatarImage src={winner.avatar} alt={winner.teamName} />}
                      <AvatarFallback className={`text-sm font-medium ${
                        idx === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        {winner.initials}
                      </AvatarFallback>
                    </Avatar>
                    {idx === 0 && (
                      <div className="absolute -top-1 -right-1">
                        <Crown className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium truncate ${idx === 0 ? "text-primary" : ""}`}>
                        {showPlayer && winner.playerName ? winner.playerName : winner.teamName}
                      </span>
                      <Badge variant="outline" className="text-xs font-mono shrink-0">
                        {winner.season}
                      </Badge>
                    </div>
                    {showPlayer && winner.playerPosition && (
                      <p className="text-xs text-muted-foreground">
                        {winner.playerPosition} - {winner.playerTeam || "FA"}
                      </p>
                    )}
                    {showPoints && winner.value && (
                      <p className="text-sm text-muted-foreground">
                        {winner.value.toFixed(1)} pts
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <ScrollBar />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function TrophyBanner({ winners, title, icon: Icon, iconColor }: { 
  winners: TrophyWinner[]; 
  title: string;
  icon: typeof Trophy;
  iconColor: string;
}) {
  if (winners.length === 0) return null;
  
  const latestWinner = winners[0];
  const testIdBase = title.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <div 
      className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
      data-testid={`banner-reigning-${testIdBase}`}
    >
      <div className={`p-3 rounded-xl bg-gradient-to-br ${iconColor}`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground">Reigning {title}</p>
        <div className="flex items-center gap-2">
          <Avatar className="w-8 h-8">
            {latestWinner.avatar && <AvatarImage src={latestWinner.avatar} alt={latestWinner.teamName} />}
            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
              {latestWinner.initials}
            </AvatarFallback>
          </Avatar>
          <span className="font-bold text-lg truncate" data-testid={`text-reigning-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {latestWinner.teamName}
          </span>
          <Badge className="bg-primary/20 text-primary border-primary/30 shrink-0">
            {latestWinner.season}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function TrophyRoom() {
  const { league } = useSleeper();
  
  const { data: trophyData, isLoading } = useQuery<TrophyResponse>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "trophies"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/trophies`);
      if (!res.ok) throw new Error("Failed to fetch trophies");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  useEffect(() => {
    document.title = `Trophy Room | ${league?.name || "Dynasty Command"}`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'View all dynasty league champions, highest scorers, MVP awards, Rookie of the Year, and Best GM winners across all seasons.');
    }
  }, [league?.name]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-3" data-testid="text-trophy-room-title">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Trophy Room
        </h1>
        <p className="text-muted-foreground">
          {isLoading 
            ? "Loading dynasty history..." 
            : `${trophyData?.seasonsTracked || 0} season${(trophyData?.seasonsTracked || 0) !== 1 ? "s" : ""} of dynasty history`
          }
        </p>
      </div>

      {/* Reigning Champions Banner */}
      {!isLoading && trophyData && (
        <div className="grid gap-4 md:grid-cols-2">
          <TrophyBanner 
            winners={trophyData.champions} 
            title="Champion" 
            icon={Crown}
            iconColor="from-yellow-500 to-amber-600"
          />
          <TrophyBanner 
            winners={trophyData.highestScorers} 
            title="Scoring Champion" 
            icon={Target}
            iconColor="from-emerald-500 to-teal-600"
          />
        </div>
      )}

      {/* Trophy Cases Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <TrophyCase
          title="Season Champions"
          description="Dynasty league champions"
          icon={Crown}
          winners={trophyData?.champions || []}
          isLoading={isLoading}
          iconColor="from-yellow-500 to-amber-600"
        />
        
        <TrophyCase
          title="Highest Scorers"
          description="Top scoring teams by season"
          icon={Target}
          winners={trophyData?.highestScorers || []}
          isLoading={isLoading}
          iconColor="from-emerald-500 to-teal-600"
          showPoints
        />
        
        <TrophyCase
          title="MVP Award"
          description="Most Valuable Player winners"
          icon={Star}
          winners={trophyData?.mvpWinners || []}
          isLoading={isLoading}
          iconColor="from-purple-500 to-violet-600"
          showPlayer
        />
        
        <TrophyCase
          title="Rookie of the Year"
          description="Top rookie performers"
          icon={Sparkles}
          winners={trophyData?.royWinners || []}
          isLoading={isLoading}
          iconColor="from-blue-500 to-cyan-600"
          showPlayer
        />
        
        <TrophyCase
          title="Best GM Award"
          description="Best general manager winners"
          icon={Award}
          winners={trophyData?.gmWinners || []}
          isLoading={isLoading}
          iconColor="from-orange-500 to-red-600"
          showPlayer
        />
      </div>

      {/* Trophy Counter Summary */}
      {!isLoading && trophyData && (
        <Card data-testid="card-trophy-summary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" data-testid="text-trophy-summary-title">
              <Medal className="w-4 h-4" />
              Dynasty Trophy Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/20">
                <Crown className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                <p className="text-2xl font-bold" data-testid="text-total-championships">{trophyData.champions.length}</p>
                <p className="text-xs text-muted-foreground">Championships</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                <Target className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
                <p className="text-2xl font-bold" data-testid="text-total-scoring-titles">{trophyData.highestScorers.length}</p>
                <p className="text-xs text-muted-foreground">Scoring Titles</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-500/10 to-violet-500/10 border border-purple-500/20">
                <Star className="w-6 h-6 mx-auto mb-2 text-purple-500" />
                <p className="text-2xl font-bold" data-testid="text-total-mvps">{trophyData.mvpWinners.length}</p>
                <p className="text-xs text-muted-foreground">MVPs</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                <Sparkles className="w-6 h-6 mx-auto mb-2 text-blue-500" />
                <p className="text-2xl font-bold" data-testid="text-total-roys">{trophyData.royWinners.length}</p>
                <p className="text-xs text-muted-foreground">ROY Awards</p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20">
                <Award className="w-6 h-6 mx-auto mb-2 text-orange-500" />
                <p className="text-2xl font-bold" data-testid="text-total-gms">{trophyData.gmWinners.length}</p>
                <p className="text-xs text-muted-foreground">Best GM Awards</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
