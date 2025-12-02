import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import type { RuleSuggestion, AwardNomination } from "@shared/schema";

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

export default function LeagueHub() {
  const { user, league, season } = useSleeper();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"rules" | "awards">("rules");
  const [awardType, setAwardType] = useState<"mvp" | "roy">("mvp");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [nominateDialogOpen, setNominateDialogOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(playerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [playerSearch]);

  const { data: ruleSuggestions, isLoading: rulesLoading } = useQuery<RuleSuggestion[]>({
    queryKey: ["/api/league", league?.leagueId, "rule-suggestions"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`);
      if (!res.ok) throw new Error("Failed to fetch rule suggestions");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: mvpNominations, isLoading: mvpLoading } = useQuery<AwardNomination[]>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, "mvp"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/mvp`);
      if (!res.ok) throw new Error("Failed to fetch MVP nominations");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,
  });

  const { data: royNominations, isLoading: royLoading } = useQuery<AwardNomination[]>({
    queryKey: ["/api/league", league?.leagueId, "awards", season, "roy"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/awards/${season}/roy`);
      if (!res.ok) throw new Error("Failed to fetch ROY nominations");
      return res.json();
    },
    enabled: !!league?.leagueId && !!season,
  });

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
    mutationFn: async ({ id, voteType }: { id: string; voteType: "up" | "down" }) => {
      return apiRequest("POST", `/api/rule-suggestions/${id}/vote`, {
        voterId: user?.userId || "guest",
        voteType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
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
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "awards", season, awardType] });
      setNominateDialogOpen(false);
      setSelectedPlayer(null);
      setPlayerSearch("");
      toast({ title: "Nomination submitted!" });
    },
    onError: () => {
      toast({ title: "Failed to submit nomination", variant: "destructive" });
    },
  });

  const voteAwardMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/awards/${id}/vote`, {
        voterId: user?.userId || "guest",
      });
    },
    onSuccess: () => {
      if (league?.leagueId && season) {
        queryClient.invalidateQueries({ queryKey: ["/api/league", league.leagueId, "awards", season, "mvp"] });
        queryClient.invalidateQueries({ queryKey: ["/api/league", league.leagueId, "awards", season, "roy"] });
      }
      toast({ title: "Vote recorded!" });
    },
  });

  const filteredPlayers = searchedPlayers || [];

  const currentNominations = awardType === "mvp" ? mvpNominations : royNominations;
  const nominationsLoading = awardType === "mvp" ? mvpLoading : royLoading;

  const hasUserVoted = (nomination: AwardNomination) => {
    return nomination.votes.includes(user?.userId || "");
  };

  const hasUserVotedRule = (suggestion: RuleSuggestion, type: "up" | "down") => {
    if (type === "up") return suggestion.upvotes.includes(user?.userId || "");
    return suggestion.downvotes.includes(user?.userId || "");
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
                    Propose and vote on rule changes for the league
                  </CardDescription>
                </div>
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
                    <Card key={suggestion.id} className="p-4" data-testid={`rule-card-${suggestion.id}`}>
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center gap-1 min-w-[60px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={hasUserVotedRule(suggestion, "up") ? "text-primary" : ""}
                            onClick={() => voteRuleMutation.mutate({ id: suggestion.id, voteType: "up" })}
                            data-testid={`upvote-${suggestion.id}`}
                          >
                            <ThumbsUp className="w-5 h-5" />
                          </Button>
                          <span className="text-lg font-bold">
                            {suggestion.upvotes.length - suggestion.downvotes.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={hasUserVotedRule(suggestion, "down") ? "text-destructive" : ""}
                            onClick={() => voteRuleMutation.mutate({ id: suggestion.id, voteType: "down" })}
                            data-testid={`downvote-${suggestion.id}`}
                          >
                            <ThumbsDown className="w-5 h-5" />
                          </Button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{suggestion.title}</h3>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {suggestion.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>by {suggestion.authorName}</span>
                            <span>•</span>
                            <span>{formatTimeAgo(suggestion.createdAt)}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {suggestion.upvotes.length + suggestion.downvotes.length} votes
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageSquarePlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No suggestions yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Be the first to suggest a rule change!
                  </p>
                  <Button onClick={() => setRuleDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    New Suggestion
                  </Button>
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
                    Nominate and vote for league awards
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={awardType} onValueChange={(v) => setAwardType(v as "mvp" | "roy")}>
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
                    </SelectContent>
                  </Select>
                  <Dialog open={nominateDialogOpen} onOpenChange={setNominateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-nominate">
                        <Plus className="w-4 h-4 mr-2" />
                        Nominate
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>
                          Nominate for {awardType === "mvp" ? "MVP" : "Rookie of the Year"}
                        </DialogTitle>
                        <DialogDescription>
                          Search for a player to nominate
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
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
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {nominationsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : currentNominations && currentNominations.length > 0 ? (
                <div className="space-y-3">
                  {currentNominations.map((nomination, index) => (
                    <Card
                      key={nomination.id}
                      className={`p-4 ${index === 0 ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                      data-testid={`nomination-card-${nomination.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-lg font-bold">
                          {index === 0 ? (
                            <Trophy className="w-5 h-5 text-primary" />
                          ) : (
                            <span className="text-muted-foreground">{index + 1}</span>
                          )}
                        </div>
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="text-sm">
                            {nomination.playerName.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{nomination.playerName}</h3>
                            <Badge className={`text-xs ${positionColors[nomination.playerPosition] || "bg-muted"}`}>
                              {nomination.playerPosition}
                            </Badge>
                            {nomination.playerTeam && (
                              <span className="text-sm text-muted-foreground">{nomination.playerTeam}</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Nominated by {nomination.nominatedByName}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-lg font-bold">{nomination.votes.length}</p>
                            <p className="text-xs text-muted-foreground">votes</p>
                          </div>
                          <Button
                            variant={hasUserVoted(nomination) ? "default" : "outline"}
                            size="sm"
                            onClick={() => voteAwardMutation.mutate(nomination.id)}
                            disabled={voteAwardMutation.isPending}
                            data-testid={`vote-${nomination.id}`}
                          >
                            <Vote className="w-4 h-4 mr-1" />
                            {hasUserVoted(nomination) ? "Voted" : "Vote"}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">No nominations yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Be the first to nominate a player for {awardType === "mvp" ? "MVP" : "Rookie of the Year"}!
                  </p>
                  <Button onClick={() => setNominateDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Nominate Player
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
