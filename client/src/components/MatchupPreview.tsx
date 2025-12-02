import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface Team {
  name: string;
  initials: string;
  projectedScore: number;
  record: string;
  starters: string[];
}

interface MatchupPreviewProps {
  week: number;
  userTeam: Team;
  opponent: Team;
}

export default function MatchupPreview({
  week,
  userTeam,
  opponent,
}: MatchupPreviewProps) {
  const userWinning = userTeam.projectedScore > opponent.projectedScore;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-heading text-lg">Upcoming Matchup</CardTitle>
          <Badge variant="outline">Week {week}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center flex-1">
            <Avatar className="w-16 h-16 mb-2">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {userTeam.initials}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm text-center" data-testid="text-user-team">
              {userTeam.name}
            </span>
            <span className="text-xs text-muted-foreground">{userTeam.record}</span>
            <span
              className={`text-3xl font-bold tabular-nums mt-2 ${
                userWinning ? "text-primary" : "text-foreground"
              }`}
              data-testid="text-user-projection"
            >
              {userTeam.projectedScore.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">projected</span>
            <div className="flex -space-x-2 mt-3">
              {userTeam.starters.slice(0, 5).map((player, i) => (
                <Avatar key={i} className="w-8 h-8 border-2 border-card">
                  <AvatarFallback className="text-[10px] bg-muted">
                    {player
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center px-4">
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
          </div>

          <div className="flex flex-col items-center flex-1">
            <Avatar className="w-16 h-16 mb-2">
              <AvatarFallback className="bg-muted text-muted-foreground text-xl font-bold">
                {opponent.initials}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm text-center" data-testid="text-opponent-team">
              {opponent.name}
            </span>
            <span className="text-xs text-muted-foreground">{opponent.record}</span>
            <span
              className={`text-3xl font-bold tabular-nums mt-2 ${
                !userWinning ? "text-primary" : "text-foreground"
              }`}
              data-testid="text-opponent-projection"
            >
              {opponent.projectedScore.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">projected</span>
            <div className="flex -space-x-2 mt-3">
              {opponent.starters.slice(0, 5).map((player, i) => (
                <Avatar key={i} className="w-8 h-8 border-2 border-card">
                  <AvatarFallback className="text-[10px] bg-muted">
                    {player
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
