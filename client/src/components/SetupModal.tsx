import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Trophy, Users, Calendar } from "lucide-react";
import { useSleeper } from "@/lib/sleeper-context";
import { apiRequest } from "@/lib/queryClient";
import type { LeagueInfo, UserInfo } from "@shared/schema";

interface SetupModalProps {
  open: boolean;
  onComplete: () => void;
}

export default function SetupModal({ open, onComplete }: SetupModalProps) {
  const { setUser, setLeague } = useSleeper();
  const [username, setUsername] = useState("");
  const [step, setStep] = useState<"username" | "league">("username");
  const [foundUser, setFoundUser] = useState<UserInfo | null>(null);

  const userMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await fetch(`/api/sleeper/user/${username}`);
      if (!res.ok) throw new Error("User not found");
      return res.json() as Promise<UserInfo>;
    },
    onSuccess: (user) => {
      setFoundUser(user);
      setStep("league");
    },
  });

  const { data: leagues, isLoading: leaguesLoading } = useQuery<LeagueInfo[]>({
    queryKey: ["/api/sleeper/user", foundUser?.userId, "leagues"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/user/${foundUser?.userId}/leagues`);
      if (!res.ok) throw new Error("Failed to fetch leagues");
      return res.json();
    },
    enabled: !!foundUser?.userId,
  });

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      userMutation.mutate(username.trim());
    }
  };

  const handleLeagueSelect = (league: LeagueInfo) => {
    if (foundUser) {
      setUser(foundUser);
      setLeague(league);
      onComplete();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            {step === "username" ? "Connect to Sleeper" : "Select Your League"}
          </DialogTitle>
          <DialogDescription>
            {step === "username"
              ? "Enter your Sleeper username to get started"
              : "Choose which dynasty league to manage"}
          </DialogDescription>
        </DialogHeader>

        {step === "username" && (
          <form onSubmit={handleUsernameSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="username">Sleeper Username</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="username"
                  placeholder="Enter your username..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  data-testid="input-sleeper-username"
                  disabled={userMutation.isPending}
                />
              </div>
              {userMutation.isError && (
                <p className="text-sm text-destructive">
                  User not found. Please check the username and try again.
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!username.trim() || userMutation.isPending}
              data-testid="button-find-user"
            >
              {userMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                "Find My Account"
              )}
            </Button>
          </form>
        )}

        {step === "league" && (
          <div className="space-y-4 mt-4">
            {foundUser && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                  {foundUser.displayName?.charAt(0).toUpperCase() || "?"}
                </div>
                <div>
                  <p className="font-medium">{foundUser.displayName}</p>
                  <p className="text-sm text-muted-foreground">@{foundUser.username}</p>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {leaguesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : leagues?.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No dynasty leagues found for this season.
                </p>
              ) : (
                leagues?.map((league) => (
                  <Card
                    key={league.leagueId}
                    className="p-4 cursor-pointer hover-elevate transition-all"
                    onClick={() => handleLeagueSelect(league)}
                    data-testid={`league-card-${league.leagueId}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{league.name}</h3>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {league.totalRosters} teams
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {league.season}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="flex-shrink-0">
                        <Trophy className="w-3 h-3 mr-1" />
                        Dynasty
                      </Badge>
                    </div>
                  </Card>
                ))
              )}
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("username");
                setFoundUser(null);
              }}
              data-testid="button-back-username"
            >
              Use a different username
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
