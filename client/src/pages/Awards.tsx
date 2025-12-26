import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Trophy,
  Star,
  Sparkles,
  Plus,
  Vote,
  Check,
  Award,
  Medal,
  Lock,
  Clock,
  Eye,
  EyeOff,
  Crown,
  Users,
} from "lucide-react";
import type { AwardNomination, AwardBallot } from "@shared/schema";

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
};

interface Player {
  id: string;
  name: string;
  position: string;
  team: string | null;
  yearsExp?: number;
}

interface NominationWithScore extends AwardNomination {
  score: number;
  firstPlaceVotes: number;
  secondPlaceVotes: number;
  thirdPlaceVotes: number;
}

interface AwardResults {
  results: NominationWithScore[];
  totalBallots: number;
  totalTeams: number;
}

// Nominations and proposals lock on 12/9/2025 at 12pm EST
const LOCK_DATE = new Date("2025-12-09T12:00:00-05:00");

// Additional users with commissioner privileges
const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

function CountdownTimer({ targetDate, label }: { targetDate: Date; label: string }) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = targetDate.getTime() - now.getTime();
      
      if (difference <= 0) {
        return null;
      }
      
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border" data-testid="countdown-timer">
      <Clock className="w-5 h-5 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-2 text-lg font-mono font-bold text-primary">
          <span>{timeLeft.days}d</span>
          <span className="text-muted-foreground">:</span>
          <span>{String(timeLeft.hours).padStart(2, "0")}h</span>
          <span className="text-muted-foreground">:</span>
          <span>{String(timeLeft.minutes).padStart(2, "0")}m</span>
          <span className="text-muted-foreground">:</span>
          <span>{String(timeLeft.seconds).padStart(2, "0")}s</span>
        </div>
      </div>
    </div>
  );
}

export default function Awards() {
  const { user, league, season } = useSleeper();
  const { toast } = useToast();
  const [selectedSeason, setSelectedSeason] = useState<string>(season);
  const [awardType, setAwardType] = useState<"mvp" | "roy" | "gm">("mvp");
  const [nominateDialogOpen, setNominateDialogOpen] = useState(false);
  const [ballotDialogOpen, setBallotDialogOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [firstPlace, setFirstPlace] = useState<string>("");
  const [secondPlace, setSecondPlace] = useState<string>("");
  const [thirdPlace, setThirdPlace] = useState<string>("");

  useEffect(() => {
    setSelectedSeason(season);
  }, [season]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(playerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [playerSearch]);

  // Calculate lock status
  const now = new Date();
  const isLocked = now >= LOCK_DATE;

  // Generate available seasons (current year and past 5 years)
  const currentYear = parseInt(season) || new Date().getFullYear();
  const availableSeasons = Array.from({ length: 6 }, (_, i) => (currentYear - i).toString());

  // Fetch user's roster ID from standings
  const { data: standings } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const userRosterId = standings?.find((s: any) => s.isUser)?.rosterId;
  const userTeamName = standings?.find((s: any) => s.isUser)?.name || user?.displayName || "Your Team";
  
  // Check if current user is the commissioner
  const isCommissioner = user?.userId && (
    (league?.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  );

  // Fetch award results for all categories
  const { data: mvpResults, isLoading: mvpLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, "mvp", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${selectedSeason}/mvp/results`);
      if (!res.ok) throw new Error("Failed to fetch MVP results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!selectedSeason,
  });

  const { data: royResults, isLoading: royLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, "roy", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${selectedSeason}/roy/results`);
      if (!res.ok) throw new Error("Failed to fetch ROY results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!selectedSeason,
  });

  const { data: gmResults, isLoading: gmLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, "gm", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${selectedSeason}/gm/results`);
      if (!res.ok) throw new Error("Failed to fetch Best GM results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!selectedSeason,
  });

  // Fetch user's current ballot
  const { data: userBallot } = useQuery<AwardBallot | null>({
    queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "ballot", userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${selectedSeason}/${awardType}/ballot/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch ballot");
      return res.json();
    },
    enabled: !!league?.leagueId && !!selectedSeason && !!userRosterId,
  });

  // Fetch nomination count for user
  const { data: nominationCount } = useQuery<{ count: number; remaining: number }>({
    queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "nominations", "count", userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${selectedSeason}/${awardType}/nominations/count/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch nomination count");
      return res.json();
    },
    enabled: !!league?.leagueId && !!selectedSeason && !!userRosterId,
  });

  // Fetch visibility setting for award points
  const { data: pointsVisibility } = useQuery<{ value: string | null }>({
    queryKey: ["/api/league", league?.leagueId, "settings", "award_points_visible"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/settings/award_points_visible`);
      if (!res.ok) throw new Error("Failed to fetch visibility setting");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const pointsVisibleToAll = pointsVisibility?.value === "true";
  const canViewPoints = isCommissioner || pointsVisibleToAll;

  // Search players for nomination
  const { data: searchedPlayers, isLoading: playersLoading } = useQuery<Player[]>({
    queryKey: ["/api/sleeper/players/search", debouncedSearch, awardType],
    queryFn: async () => {
      const rookiesParam = awardType === "roy" ? "&rookies=true" : "";
      const res = await fetch(`/api/sleeper/players/search?q=${encodeURIComponent(debouncedSearch)}${rookiesParam}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    enabled: nominateDialogOpen && debouncedSearch.length >= 2,
  });

  // Mutations
  const nominateMutation = useMutation({
    mutationFn: async (player: Player) => {
      return apiRequest("POST", `/api/league/${league?.leagueId}/awards/${selectedSeason}/${awardType}/nominate`, {
        playerId: player.id,
        playerName: player.name,
        playerPosition: player.position,
        playerTeam: player.team,
        nominatedBy: user?.userId || "guest",
        nominatedByName: user?.displayName || "Guest",
        nominatedByRosterId: userRosterId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "nominations", "count", userRosterId] });
      setNominateDialogOpen(false);
      setSelectedPlayer(null);
      setPlayerSearch("");
      toast({ title: "Nomination submitted!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to submit nomination", variant: "destructive" });
    },
  });

  const submitBallotMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/league/${league?.leagueId}/awards/${selectedSeason}/${awardType}/ballot`, {
        rosterId: userRosterId,
        voterName: userTeamName,
        firstPlaceId: firstPlace,
        secondPlaceId: secondPlace,
        thirdPlaceId: thirdPlace,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", selectedSeason, awardType, "ballot", userRosterId] });
      setBallotDialogOpen(false);
      setFirstPlace("");
      setSecondPlace("");
      setThirdPlace("");
      toast({ title: "Ballot submitted!" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to submit ballot", variant: "destructive" });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      return apiRequest("POST", `/api/league/${league?.leagueId}/settings/award_points_visible`, {
        value: visible ? "true" : "false",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "settings", "award_points_visible"] });
      toast({ title: pointsVisibleToAll ? "Point totals are now hidden" : "Point totals are now visible to all" });
    },
    onError: () => {
      toast({ title: "Failed to update visibility setting", variant: "destructive" });
    },
  });

  const filteredPlayers = searchedPlayers || [];
  const currentResults = awardType === "mvp" ? mvpResults : awardType === "roy" ? royResults : gmResults;
  const resultsLoading = awardType === "mvp" ? mvpLoading : awardType === "roy" ? royLoading : gmLoading;
  const nominations = currentResults?.results || [];

  const getAwardLabel = (type: "mvp" | "roy" | "gm") => {
    switch (type) {
      case "mvp": return "Most Valuable Player";
      case "roy": return "Rookie of the Year";
      case "gm": return "Best General Manager";
    }
  };

  const getAwardIcon = (type: "mvp" | "roy" | "gm") => {
    switch (type) {
      case "mvp": return <Trophy className="w-5 h-5" />;
      case "roy": return <Star className="w-5 h-5" />;
      case "gm": return <Users className="w-5 h-5" />;
    }
  };

  const isValidBallot = firstPlace && secondPlace && thirdPlace && 
    firstPlace !== secondPlace && firstPlace !== thirdPlace && secondPlace !== thirdPlace;

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Award className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view and vote on awards.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" />
            Yearly Awards
          </h1>
          <p className="text-muted-foreground">
            Nominate players and vote for league awards
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="season-select" className="text-sm font-medium">Season:</Label>
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger id="season-select" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableSeasons.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Countdown Timer */}
      {!isLocked && selectedSeason === season && (
        <CountdownTimer targetDate={LOCK_DATE} label="Nominations lock in" />
      )}

      {/* Commissioner Controls */}
      {isCommissioner && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                <span className="font-medium">Commissioner Controls</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="visibility-toggle"
                  checked={pointsVisibleToAll}
                  onCheckedChange={(checked) => toggleVisibilityMutation.mutate(checked)}
                  disabled={toggleVisibilityMutation.isPending}
                />
                <Label htmlFor="visibility-toggle" className="text-sm cursor-pointer flex items-center gap-2">
                  {pointsVisibleToAll ? (
                    <>
                      <Eye className="w-4 h-4" />
                      Point totals visible to all
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-4 h-4" />
                      Point totals hidden
                    </>
                  )}
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Award Tabs */}
      <Tabs value={awardType} onValueChange={(v) => setAwardType(v as "mvp" | "roy" | "gm")}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="mvp" className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            MVP
          </TabsTrigger>
          <TabsTrigger value="roy" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            ROY
          </TabsTrigger>
          <TabsTrigger value="gm" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Best GM
          </TabsTrigger>
        </TabsList>

        <TabsContent value={awardType} className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="font-heading text-xl flex items-center gap-2">
                    {getAwardIcon(awardType)}
                    {getAwardLabel(awardType)}
                  </CardTitle>
                  <CardDescription>
                    {selectedSeason} Season
                    {currentResults && ` • ${currentResults.totalBallots}/${currentResults.totalTeams} ballots cast`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Nominate Button */}
                  {!isLocked && selectedSeason === season && (
                    <Dialog open={nominateDialogOpen} onOpenChange={setNominateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          disabled={!userRosterId || (nominationCount?.remaining ?? 0) <= 0}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Nominate ({nominationCount?.remaining ?? 3} left)
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Nominate for {getAwardLabel(awardType)}</DialogTitle>
                          <DialogDescription>
                            Search for a {awardType === "gm" ? "team manager" : "player"} to nominate
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <Input
                            placeholder={awardType === "gm" ? "Search managers..." : "Search players..."}
                            value={playerSearch}
                            onChange={(e) => setPlayerSearch(e.target.value)}
                          />
                          <ScrollArea className="h-64">
                            {playersLoading ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                  <Skeleton key={i} className="h-12 w-full" />
                                ))}
                              </div>
                            ) : filteredPlayers.length > 0 ? (
                              <div className="space-y-2">
                                {filteredPlayers.map((player) => (
                                  <button
                                    key={player.id}
                                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                                      selectedPlayer?.id === player.id 
                                        ? "border-primary bg-primary/10" 
                                        : "hover:bg-muted"
                                    }`}
                                    onClick={() => setSelectedPlayer(player)}
                                  >
                                    <div className="flex items-center gap-3">
                                      <Badge className={positionColors[player.position] || "bg-gray-500"}>
                                        {player.position}
                                      </Badge>
                                      <div>
                                        <p className="font-medium">{player.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {player.team || "FA"}
                                          {player.yearsExp !== undefined && ` • ${player.yearsExp === 0 ? "Rookie" : `${player.yearsExp} yrs`}`}
                                        </p>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : playerSearch.length >= 2 ? (
                              <p className="text-center text-muted-foreground py-8">No players found</p>
                            ) : (
                              <p className="text-center text-muted-foreground py-8">Type at least 2 characters to search</p>
                            )}
                          </ScrollArea>
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => selectedPlayer && nominateMutation.mutate(selectedPlayer)}
                            disabled={!selectedPlayer || nominateMutation.isPending}
                          >
                            {nominateMutation.isPending ? "Submitting..." : "Submit Nomination"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  {/* Vote Button */}
                  <Dialog open={ballotDialogOpen} onOpenChange={setBallotDialogOpen}>
                    <DialogTrigger asChild>
                      <Button disabled={!userRosterId || nominations.length < 3}>
                        <Vote className="w-4 h-4 mr-2" />
                        {userBallot ? "Update Vote" : "Cast Vote"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Cast Your Ballot</DialogTitle>
                        <DialogDescription>
                          Rank your top 3 choices for {getAwardLabel(awardType)}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {nominations.length < 3 ? (
                          <p className="text-center text-muted-foreground py-4">
                            Need at least 3 nominations before voting can begin
                          </p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label>1st Place (5 points)</Label>
                              <Select value={firstPlace} onValueChange={setFirstPlace}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select 1st place..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {nominations.map((n) => (
                                    <SelectItem key={n.id} value={n.id} disabled={n.id === secondPlace || n.id === thirdPlace}>
                                      {n.playerName} ({n.playerPosition})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>2nd Place (3 points)</Label>
                              <Select value={secondPlace} onValueChange={setSecondPlace}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select 2nd place..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {nominations.map((n) => (
                                    <SelectItem key={n.id} value={n.id} disabled={n.id === firstPlace || n.id === thirdPlace}>
                                      {n.playerName} ({n.playerPosition})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>3rd Place (1 point)</Label>
                              <Select value={thirdPlace} onValueChange={setThirdPlace}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select 3rd place..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {nominations.map((n) => (
                                    <SelectItem key={n.id} value={n.id} disabled={n.id === firstPlace || n.id === secondPlace}>
                                      {n.playerName} ({n.playerPosition})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => submitBallotMutation.mutate()}
                          disabled={!isValidBallot || submitBallotMutation.isPending || nominations.length < 3}
                        >
                          {submitBallotMutation.isPending ? "Submitting..." : userBallot ? "Update Ballot" : "Submit Ballot"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {resultsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : nominations.length > 0 ? (
                <div className="space-y-3">
                  {nominations.map((nomination, index) => (
                    <Card
                      key={nomination.id}
                      className={`p-4 ${index === 0 && nomination.score > 0 ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold text-sm">
                            {index + 1}
                          </div>
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className={positionColors[nomination.playerPosition] || "bg-gray-500"}>
                              {nomination.playerPosition}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{nomination.playerName}</p>
                              {index === 0 && nomination.score > 0 && (
                                <Crown className="w-4 h-4 text-yellow-500" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {nomination.playerTeam || "FA"} • Nominated by {nomination.nominatedByName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {canViewPoints ? (
                            <>
                              <p className="font-bold text-lg">{nomination.score} pts</p>
                              <p className="text-xs text-muted-foreground">
                                {nomination.firstPlaceVotes}×1st • {nomination.secondPlaceVotes}×2nd • {nomination.thirdPlaceVotes}×3rd
                              </p>
                            </>
                          ) : (
                            <Badge variant="outline">
                              <Lock className="w-3 h-3 mr-1" />
                              Hidden
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No nominations yet</h3>
                  {!isLocked && selectedSeason === season ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Be the first to nominate {awardType === "gm" ? "a team manager" : "a player"} for {getAwardLabel(awardType)}!
                      </p>
                      <Button onClick={() => setNominateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        {awardType === "gm" ? "Nominate Manager" : "Nominate Player"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No nominations for this season.
                    </p>
                  )}
                </div>
              )}

              {/* User's ballot status */}
              {userBallot && (
                <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="font-medium">Your ballot has been submitted</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { type: "mvp" as const, label: "MVP", results: mvpResults, loading: mvpLoading, icon: Trophy },
          { type: "roy" as const, label: "Rookie of the Year", results: royResults, loading: royLoading, icon: Star },
          { type: "gm" as const, label: "Best GM", results: gmResults, loading: gmLoading, icon: Users },
        ].map(({ type, label, results, loading, icon: Icon }) => {
          const leader = results?.results?.[0];
          return (
            <Card 
              key={type} 
              className={`cursor-pointer transition-colors hover:border-primary/50 ${awardType === type ? "border-primary" : ""}`}
              onClick={() => setAwardType(type)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-full" />
                ) : leader ? (
                  <div className="flex items-center gap-2">
                    <Badge className={positionColors[leader.playerPosition] || "bg-gray-500"}>
                      {leader.playerPosition}
                    </Badge>
                    <span className="font-semibold truncate">{leader.playerName}</span>
                    {canViewPoints && (
                      <span className="text-sm text-muted-foreground ml-auto">{leader.score} pts</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No nominations</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {results?.results?.length || 0} nominations • {results?.totalBallots || 0} votes
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}





