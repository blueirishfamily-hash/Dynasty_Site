import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Trophy, Check } from "lucide-react";
import { useSleeper } from "@/lib/sleeper-context";
import type { UserInfo } from "@shared/schema";

interface SetupModalProps {
  open: boolean;
  onComplete: () => void;
}

interface LeagueUser {
  userId: string;
  displayName: string;
  username: string;
  avatar: string | null;
  teamName: string;
  rosterId: number;
}

export default function SetupModal({ open, onComplete }: SetupModalProps) {
  const { setUser, league, user } = useSleeper();

  const { data: leagueUsers, isLoading, isFetching } = useQuery<LeagueUser[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "users-rosters", open],
    queryFn: async () => {
      if (!league?.leagueId) return [];
      const [usersRes, rostersRes] = await Promise.all([
        fetch(`/api/sleeper/league/${league.leagueId}/users`),
        fetch(`/api/sleeper/league/${league.leagueId}/rosters`),
      ]);
      
      if (!usersRes.ok || !rostersRes.ok) {
        throw new Error("Failed to fetch league data");
      }
      
      const users = await usersRes.json();
      const rosters = await rostersRes.json();
      
      return rosters.map((roster: any) => {
        const leagueUser = users.find((u: any) => u.user_id === roster.owner_id);
        return {
          userId: roster.owner_id,
          displayName: leagueUser?.display_name || `Team ${roster.roster_id}`,
          username: leagueUser?.display_name?.toLowerCase().replace(/\s+/g, '') || `team${roster.roster_id}`,
          avatar: leagueUser?.avatar || null,
          teamName: leagueUser?.metadata?.team_name || leagueUser?.display_name || `Team ${roster.roster_id}`,
          rosterId: roster.roster_id,
        };
      });
    },
    enabled: !!league?.leagueId && open,
    staleTime: 0,
  });

  const showLoading = isLoading || isFetching || !leagueUsers;

  const handleTeamSelect = (leagueUser: LeagueUser) => {
    const userInfo: UserInfo = {
      userId: leagueUser.userId,
      username: leagueUser.username,
      displayName: leagueUser.displayName,
      avatar: leagueUser.avatar,
    };
    setUser(userInfo);
    onComplete();
  };

  const handleContinueAsGuest = () => {
    onComplete();
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {league?.name || "Dynasty League"}
          </DialogTitle>
          <DialogDescription>
            Select your team to see personalized stats and insights
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {showLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : leagueUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No teams found in this league.
              </p>
            ) : (
              leagueUsers.map((leagueUser) => (
                <Card
                  key={leagueUser.rosterId}
                  className={`p-3 cursor-pointer hover-elevate transition-all ${
                    user?.userId === leagueUser.userId ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => handleTeamSelect(leagueUser)}
                  data-testid={`team-card-${leagueUser.rosterId}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {leagueUser.teamName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{leagueUser.teamName}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {leagueUser.displayName}
                      </p>
                    </div>
                    {user?.userId === leagueUser.userId && (
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <Button
            variant="ghost"
            className="w-full"
            onClick={handleContinueAsGuest}
            data-testid="button-continue-guest"
          >
            Continue as Guest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
