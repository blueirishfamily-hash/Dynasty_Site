import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  ThumbsUp,
  ThumbsDown,
  Plus,
  Trophy,
  Star,
  Sparkles,
  MessageSquarePlus,
  Vote,
  Check,
  Users,
  Award,
  Medal,
  Lock,
  Clock,
  Eye,
  EyeOff,
  Crown,
} from "lucide-react";
import type { RuleSuggestion, AwardNomination, RuleVote, AwardBallot } from "@shared/schema";

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

interface RuleVoteData {
  votes: RuleVote[];
  approveCount: number;
  rejectCount: number;
}

interface NFLState {
  week: number;
  season: string;
  seasonType: string;
  displayWeek: number;
}

// Nominations and proposals lock on 12/9/2025 at 12pm EST
const LOCK_DATE = new Date("2025-12-09T12:00:00-05:00");

// Additional users with commissioner privileges (can view hidden point totals)
const COMMISSIONER_USER_IDS = [
  "900186363130503168", // elwthree
];

function CountdownTimer({ targetDate, label, icon: Icon }: { targetDate: Date; label: string; icon: typeof Clock }) {
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
      <Icon className="w-5 h-5 text-muted-foreground" />
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

export default function LeagueHub() {
  const { user, league, season } = useSleeper();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"rules" | "awards">("rules");
  const [awardType, setAwardType] = useState<"mvp" | "roy" | "gm">("mvp");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [nominateDialogOpen, setNominateDialogOpen] = useState(false);
  const [ballotDialogOpen, setBallotDialogOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [firstPlace, setFirstPlace] = useState<string>("");
  const [secondPlace, setSecondPlace] = useState<string>("");
  const [thirdPlace, setThirdPlace] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(playerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [playerSearch]);

  // Fetch NFL state to determine current week
  const { data: nflState } = useQuery<NFLState>({
    queryKey: ["/api/sleeper/nfl-state"],
  });

  // Calculate lock status based on date only
  const now = new Date();
  const isLocked = now >= LOCK_DATE;

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
  
  // Check if current user is the commissioner or has commissioner privileges
  const isCommissioner = user?.userId && (
    (league?.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  );

  const { data: ruleSuggestions, isLoading: rulesLoading } = useQuery<RuleSuggestion[]>({
    queryKey: ["/api/league", league?.leagueId, "rule-suggestions"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`);
      if (!res.ok) throw new Error("Failed to fetch rule suggestions");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  // Fetch award results with scores
  const { data: mvpResults, isLoading: mvpLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, "mvp", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/mvp/results`);
      if (!res.ok) throw new Error("Failed to fetch MVP results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,
  });

  const { data: royResults, isLoading: royLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, "roy", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/roy/results`);
      if (!res.ok) throw new Error("Failed to fetch ROY results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,
  });

  const { data: gmResults, isLoading: gmLoading } = useQuery<AwardResults>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, "gm", "results"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/gm/results`);
      if (!res.ok) throw new Error("Failed to fetch Best GM results");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,
  });

  // Fetch user's current ballot
  const { data: userBallot } = useQuery<AwardBallot | null>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "ballot", userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}/ballot/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch ballot");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season && !!userRosterId,
  });

  // Fetch nomination count for user
  const { data: nominationCount } = useQuery<{ count: number; remaining: number }>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "nominations", "count", userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/${awardType}/nominations/count/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch nomination count");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season && !!userRosterId,
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

  // Determine if points should be visible
  const pointsVisibleToAll = pointsVisibility?.value === "true";
  const canViewPoints = isCommissioner || pointsVisibleToAll;

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

  const createRuleMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      return apiRequest("POST", `/api/league/${league?.leagueId}/rule-suggestions`, {
        ...data,
        authorId: user?.userId || "guest",
        authorName: user?.displayName || "Guest",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
      setRuleDialogOpen(false);
      setRuleTitle("");
      setRuleDescription("");
      toast({ title: "Rule suggestion submitted!" });
    },
    onError: () => {
      toast({ title: "Failed to submit suggestion", variant: "destructive" });
    },
  });

  const voteRuleMutation = useMutation({
    mutationFn: async ({ id, vote }: { id: string; vote: "approve" | "reject" }) => {
      return apiRequest("POST", `/api/rule-suggestions/${id}/vote`, {
        rosterId: userRosterId,
        voterName: userTeamName,
        vote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
      ruleSuggestions?.forEach((s) => {
        queryClient.invalidateQueries({ queryKey: ["/api/rule-suggestions", s.id, "votes"] });
      });
    },
  });

  const nominateMutation = useMutation({
    mutationFn: async (player: Player) => {
      return apiRequest("POST", `/api/league/${league?.leagueId}/awards/${season}/${awardType}/nominate`, {
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
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "nominations", "count", userRosterId] });
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
      return apiRequest("POST", `/api/league/${league?.leagueId}/awards/${season}/${awardType}/ballot`, {
        rosterId: userRosterId,
        voterName: userTeamName,
        firstPlaceId: firstPlace,
        secondPlaceId: secondPlace,
        thirdPlaceId: thirdPlace,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", season, awardType, "ballot", userRosterId] });
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
      case "mvp": return "MVP";
      case "roy": return "Rookie of the Year";
      case "gm": return "Best GM";
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const openBallotDialog = () => {
    if (userBallot) {
      setFirstPlace(userBallot.firstPlaceId);
      setSecondPlace(userBallot.secondPlaceId);
      setThirdPlace(userBallot.thirdPlaceId);
    }
    setBallotDialogOpen(true);
  };

  const isValidBallot = firstPlace && secondPlace && thirdPlace && 
    firstPlace !== secondPlace && firstPlace !== thirdPlace && secondPlace !== thirdPlace;

  if (!league) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to access League Hub.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">League Hub</h1>
        <p className="text-muted-foreground">Rule suggestions and league awards</p>
      </div>

      {/* Status Banner */}
      {isLocked && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-500" />
              <div className="flex-1">
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  Nominations and proposals are now locked
                </p>
                <p className="text-sm text-muted-foreground">
                  Voting is still open
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLocked && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <CountdownTimer 
              targetDate={LOCK_DATE} 
              label="Nominations and proposals lock in" 
              icon={Lock} 
            />
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "rules" | "awards")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="rules" data-testid="tab-rules">
            <MessageSquarePlus className="w-4 h-4 mr-2" />
            Rule Suggestions
          </TabsTrigger>
          <TabsTrigger value="awards" data-testid="tab-awards">
            <Trophy className="w-4 h-4 mr-2" />
            League Awards
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <MessageSquarePlus className="w-5 h-5 text-primary" />
                    Rule Change Suggestions
                  </CardTitle>
                  <CardDescription>
                    {isLocked 
                      ? "Proposals are locked. Voting is still open."
                      : "Propose and vote on rule changes (1 vote per team per rule)"
                    }
                  </CardDescription>
                </div>
                {!isLocked && (
                  <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-new-rule">
                        <Plus className="w-4 h-4 mr-2" />
                        New Suggestion
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Suggest a Rule Change</DialogTitle>
                        <DialogDescription>
                          Describe the rule you'd like to add or change
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="rule-title">Title</Label>
                          <Input
                            id="rule-title"
                            placeholder="e.g., Add a flex spot"
                            value={ruleTitle}
                            onChange={(e) => setRuleTitle(e.target.value)}
                            data-testid="input-rule-title"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="rule-description">Description</Label>
                          <Textarea
                            id="rule-description"
                            placeholder="Explain your suggestion in detail..."
                            value={ruleDescription}
                            onChange={(e) => setRuleDescription(e.target.value)}
                            rows={4}
                            data-testid="input-rule-description"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => createRuleMutation.mutate({ title: ruleTitle, description: ruleDescription })}
                          disabled={!ruleTitle || !ruleDescription || createRuleMutation.isPending}
                          data-testid="button-submit-rule"
                        >
                          {createRuleMutation.isPending ? "Submitting..." : "Submit Suggestion"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                {isLocked && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Locked
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {rulesLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : ruleSuggestions && ruleSuggestions.length > 0 ? (
                <div className="space-y-4">
                  {ruleSuggestions.map((suggestion) => (
                    <RuleCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      userRosterId={userRosterId}
                      onVote={(vote) => voteRuleMutation.mutate({ id: suggestion.id, vote })}
                      formatTimeAgo={formatTimeAgo}
                      isLocked={isLocked}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageSquarePlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No suggestions yet</h3>
                  {!isLocked ? (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Be the first to suggest a rule change!
                      </p>
                      <Button onClick={() => setRuleDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        New Suggestion
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Proposals are locked for this season.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="awards" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="font-heading text-lg flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" />
                    {season} League Awards
                  </CardTitle>
                  <CardDescription>
                    {isLocked 
                      ? "Nominations locked. Voting is still open."
                      : "Nominate players (max 3 per award) and cast your ranked ballot"
                    }
                  </CardDescription>
                  {isCommissioner && (
                    <div className="flex items-center gap-2 mt-3 p-2 bg-muted/50 rounded-md">
                      <Switch
                        id="visibility-toggle"
                        checked={pointsVisibleToAll}
                        onCheckedChange={(checked) => toggleVisibilityMutation.mutate(checked)}
                        disabled={toggleVisibilityMutation.isPending}
                        data-testid="toggle-points-visibility"
                      />
                      <Label 
                        htmlFor="visibility-toggle" 
                        className="text-sm cursor-pointer flex items-center gap-2"
                      >
                        {pointsVisibleToAll ? (
                          <>
                            <Eye className="w-4 h-4" />
                            Point totals visible to all
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-4 h-4" />
                            Point totals hidden (commissioner only)
                          </>
                        )}
                      </Label>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={awardType} onValueChange={(v) => setAwardType(v as "mvp" | "roy" | "gm")}>
                    <SelectTrigger className="w-[180px]" data-testid="select-award-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mvp">
                        <div className="flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          MVP
                        </div>
                      </SelectItem>
                      <SelectItem value="roy">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Rookie of the Year
                        </div>
                      </SelectItem>
                      <SelectItem value="gm">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4" />
                          Best GM
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {!isLocked && (
                    <Dialog open={nominateDialogOpen} onOpenChange={setNominateDialogOpen}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline"
                          disabled={nominationCount?.remaining === 0}
                          data-testid="button-nominate"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Nominate ({nominationCount?.remaining ?? 3} left)
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>
                            Nominate for {getAwardLabel(awardType)}
                          </DialogTitle>
                          <DialogDescription>
                            {awardType === "gm" 
                              ? "Select a team manager to nominate (you can nominate up to 3 per award)"
                              : "Search for a player to nominate (you can nominate up to 3 players per award)"
                            }
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {awardType === "gm" ? (
                            <ScrollArea className="h-60 border rounded-md">
                              <div className="p-2 space-y-1">
                                {standings?.filter((team: any) => team.rosterId !== userRosterId).map((team: any) => (
                                  <div
                                    key={team.rosterId}
                                    className={`p-2 rounded-md cursor-pointer hover-elevate flex items-center gap-3 ${
                                      selectedPlayer?.id === String(team.rosterId) ? "bg-primary/10 ring-1 ring-primary" : "bg-card"
                                    }`}
                                    onClick={() => setSelectedPlayer({
                                      id: String(team.rosterId),
                                      name: team.name,
                                      position: "GM" as any,
                                      team: null,
                                    })}
                                    data-testid={`team-option-${team.rosterId}`}
                                  >
                                    <Avatar className="w-8 h-8">
                                      {team.avatar && (
                                        <AvatarImage src={team.avatar} alt={team.name} />
                                      )}
                                      <AvatarFallback className="text-xs">
                                        {team.initials}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{team.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {team.wins}-{team.losses} • {team.pointsFor.toFixed(1)} PF
                                      </p>
                                    </div>
                                    {selectedPlayer?.id === String(team.rosterId) && (
                                      <Check className="w-4 h-4 text-primary" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <Label htmlFor="player-search">Search Player</Label>
                                <Input
                                  id="player-search"
                                  placeholder="Type player name..."
                                  value={playerSearch}
                                  onChange={(e) => setPlayerSearch(e.target.value)}
                                  data-testid="input-player-search"
                                />
                              </div>
                              {playerSearch.length > 0 && (
                                <ScrollArea className="h-60 border rounded-md">
                                  <div className="p-2 space-y-1">
                                    {playerSearch.length < 2 ? (
                                      <p className="text-center text-muted-foreground py-4">
                                        Type at least 2 characters to search
                                      </p>
                                    ) : playersLoading ? (
                                      <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                                      </div>
                                    ) : filteredPlayers.length > 0 ? (
                                      filteredPlayers.map((player) => (
                                        <div
                                          key={player.id}
                                          className={`p-2 rounded-md cursor-pointer hover-elevate flex items-center gap-3 ${
                                            selectedPlayer?.id === player.id ? "bg-primary/10 ring-1 ring-primary" : "bg-card"
                                          }`}
                                          onClick={() => setSelectedPlayer(player)}
                                          data-testid={`player-option-${player.id}`}
                                        >
                                          <Avatar className="w-8 h-8">
                                            <AvatarImage 
                                              src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`}
                                              alt={player.name}
                                            />
                                            <AvatarFallback className="text-xs">
                                              {player.name.split(" ").map((n) => n[0]).join("")}
                                            </AvatarFallback>
                                          </Avatar>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{player.name}</p>
                                            <div className="flex items-center gap-1">
                                              <Badge className={`text-[10px] px-1.5 ${positionColors[player.position] || "bg-muted"}`}>
                                                {player.position}
                                              </Badge>
                                              {player.team && (
                                                <span className="text-xs text-muted-foreground">{player.team}</span>
                                              )}
                                            </div>
                                          </div>
                                          {selectedPlayer?.id === player.id && (
                                            <Check className="w-4 h-4 text-primary" />
                                          )}
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-center text-muted-foreground py-4">No players found</p>
                                    )}
                                  </div>
                                </ScrollArea>
                              )}
                            </>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={() => selectedPlayer && nominateMutation.mutate(selectedPlayer)}
                            disabled={!selectedPlayer || nominateMutation.isPending}
                            data-testid="button-submit-nomination"
                          >
                            {nominateMutation.isPending ? "Submitting..." : "Submit Nomination"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}

                  <Button onClick={openBallotDialog} data-testid="button-cast-ballot">
                    <Vote className="w-4 h-4 mr-2" />
                    {userBallot ? "Update Ballot" : "Cast Ballot"}
                  </Button>

                  {isLocked && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Nominations Locked
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Ballot Dialog */}
              <Dialog open={ballotDialogOpen} onOpenChange={setBallotDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Vote className="w-5 h-5" />
                      Cast Your {getAwardLabel(awardType)} Ballot
                    </DialogTitle>
                    <DialogDescription>
                      Rank your top 3 picks (1st = 3pts, 2nd = 2pts, 3rd = 1pt)
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
                          <Label className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-yellow-500" />
                            1st Place (3 points)
                          </Label>
                          <Select value={firstPlace} onValueChange={setFirstPlace}>
                            <SelectTrigger data-testid="select-first-place">
                              <SelectValue placeholder="Select 1st place..." />
                            </SelectTrigger>
                            <SelectContent>
                              {nominations.map((n) => (
                                <SelectItem 
                                  key={n.id} 
                                  value={n.id}
                                  disabled={n.id === secondPlace || n.id === thirdPlace}
                                >
                                  {n.playerName} ({n.playerPosition})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Medal className="w-4 h-4 text-gray-400" />
                            2nd Place (2 points)
                          </Label>
                          <Select value={secondPlace} onValueChange={setSecondPlace}>
                            <SelectTrigger data-testid="select-second-place">
                              <SelectValue placeholder="Select 2nd place..." />
                            </SelectTrigger>
                            <SelectContent>
                              {nominations.map((n) => (
                                <SelectItem 
                                  key={n.id} 
                                  value={n.id}
                                  disabled={n.id === firstPlace || n.id === thirdPlace}
                                >
                                  {n.playerName} ({n.playerPosition})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Medal className="w-4 h-4 text-orange-700" />
                            3rd Place (1 point)
                          </Label>
                          <Select value={thirdPlace} onValueChange={setThirdPlace}>
                            <SelectTrigger data-testid="select-third-place">
                              <SelectValue placeholder="Select 3rd place..." />
                            </SelectTrigger>
                            <SelectContent>
                              {nominations.map((n) => (
                                <SelectItem 
                                  key={n.id} 
                                  value={n.id}
                                  disabled={n.id === firstPlace || n.id === secondPlace}
                                >
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
                      data-testid="button-submit-ballot"
                    >
                      {submitBallotMutation.isPending ? "Submitting..." : userBallot ? "Update Ballot" : "Submit Ballot"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Voting Status */}
              {userBallot && (
                <div className="mb-4 p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-sm flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    <span className="font-medium">Your ballot has been submitted</span>
                  </p>
                </div>
              )}

              {/* Results Stats */}
              {currentResults && currentResults.totalBallots > 0 && (
                <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {currentResults.totalBallots} ballot{currentResults.totalBallots !== 1 ? "s" : ""} cast
                  </span>
                </div>
              )}

              {resultsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : nominations.length > 0 ? (
                <div className="space-y-3">
                  {nominations.map((nomination, index) => (
                    <Card
                      key={nomination.id}
                      className={`p-4 ${index === 0 && nomination.score > 0 ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                      data-testid={`nomination-card-${nomination.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-lg font-bold">
                          {index === 0 && nomination.score > 0 ? (
                            <Trophy className="w-5 h-5 text-primary" />
                          ) : (
                            <span className="text-muted-foreground">{index + 1}</span>
                          )}
                        </div>
                        <Avatar className="w-12 h-12">
                          {nomination.playerPosition === "GM" ? (
                            (() => {
                              const team = standings?.find((t: any) => String(t.rosterId) === nomination.playerId);
                              return team?.avatar ? <AvatarImage src={team.avatar} alt={nomination.playerName} /> : null;
                            })()
                          ) : (
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${nomination.playerId}.jpg`}
                              alt={nomination.playerName}
                            />
                          )}
                          <AvatarFallback className="text-sm">
                            {nomination.playerName.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{nomination.playerName}</h3>
                            <Badge className={`text-xs ${positionColors[nomination.playerPosition] || "bg-muted"}`}>
                              {nomination.playerPosition}
                            </Badge>
                            {nomination.playerTeam && (
                              <span className="text-sm text-muted-foreground">{nomination.playerTeam}</span>
                            )}
                          </div>
                        </div>
                        {canViewPoints ? (
                          <div className="text-right" title={isCommissioner && !pointsVisibleToAll ? "Commissioner view - hidden from other members" : "Point totals"}>
                            {isCommissioner && !pointsVisibleToAll && (
                              <div className="flex items-center justify-end gap-1 mb-1">
                                <Eye className="w-3 h-3 text-muted-foreground" />
                              </div>
                            )}
                            <p className="text-2xl font-bold text-primary">{nomination.score}</p>
                            <p className="text-xs text-muted-foreground">points</p>
                          </div>
                        ) : (
                          <div className="text-right text-muted-foreground" title="Point totals are hidden">
                            <EyeOff className="w-5 h-5" />
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No nominations yet</h3>
                  {!isLocked ? (
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
                      Nominations are locked for this season.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Rule Card component with vote fetching
function RuleCard({ 
  suggestion, 
  userRosterId, 
  onVote, 
  formatTimeAgo,
  isLocked,
}: { 
  suggestion: RuleSuggestion; 
  userRosterId: number | undefined;
  onVote: (vote: "approve" | "reject") => void;
  formatTimeAgo: (timestamp: number) => string;
  isLocked: boolean;
}) {
  const { data: voteData } = useQuery<RuleVoteData>({
    queryKey: ["/api/rule-suggestions", suggestion.id, "votes"],
    queryFn: async () => {
      const res = await fetch(`/api/rule-suggestions/${suggestion.id}/votes`);
      if (!res.ok) throw new Error("Failed to fetch votes");
      return res.json();
    },
  });

  const userVote = voteData?.votes.find(v => v.rosterId === userRosterId);
  const approveCount = voteData?.approveCount || 0;
  const rejectCount = voteData?.rejectCount || 0;
  const netVotes = approveCount - rejectCount;
  const totalVotes = voteData?.votes.length || 0;

  return (
    <Card className="p-4" data-testid={`rule-card-${suggestion.id}`}>
      <div className="flex gap-4">
        <div className="flex flex-col items-center gap-1 min-w-[80px]">
          {isLocked ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className={userVote?.vote === "approve" ? "text-primary bg-primary/10" : ""}
                onClick={() => onVote("approve")}
                disabled={!userRosterId}
                data-testid={`approve-${suggestion.id}`}
              >
                <ThumbsUp className="w-5 h-5" />
              </Button>
              <div className="text-center">
                <span className={`text-lg font-bold ${netVotes > 0 ? "text-primary" : netVotes < 0 ? "text-destructive" : ""}`}>
                  {netVotes > 0 ? "+" : ""}{netVotes}
                </span>
                <div className="text-[10px] text-muted-foreground">
                  {approveCount}A / {rejectCount}R
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={userVote?.vote === "reject" ? "text-destructive bg-destructive/10" : ""}
                onClick={() => onVote("reject")}
                disabled={!userRosterId}
                data-testid={`reject-${suggestion.id}`}
              >
                <ThumbsDown className="w-5 h-5" />
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground" title="Voting opens after proposals lock">
              <Lock className="w-5 h-5 mb-1" />
              <span className="text-[10px]">Vote later</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium">{suggestion.title}</h3>
            <Badge variant="outline" className="text-xs">
              {suggestion.status}
            </Badge>
            {userVote && (
              <Badge variant="secondary" className="text-xs">
                You voted: {userVote.vote}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {suggestion.description}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{formatTimeAgo(suggestion.createdAt)}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {totalVotes} team{totalVotes !== 1 ? "s" : ""} voted
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
