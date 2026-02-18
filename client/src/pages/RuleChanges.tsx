import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import SetupModal from "@/components/SetupModal";
import {
  ThumbsUp,
  ThumbsDown,
  Plus,
  Vote,
  Check,
  X,
  FileText,
  Clock,
  Users,
  Settings,
  AlertCircle,
  Edit,
  Trash2,
} from "lucide-react";
import type { RuleSuggestion, RuleVote } from "@shared/schema";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

interface RuleSuggestionWithVoting extends RuleSuggestion {
  votingEnabled?: boolean;
}

interface RuleVoteData {
  votes?: RuleVote[];
  approveCount?: number;
  rejectCount?: number;
  ranked?: boolean;
  pointsByOption?: number[];
  voterCount?: number;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RuleChanges() {
  const { user, league } = useSleeper();
  const { toast } = useToast();
  const [showSetup, setShowSetup] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [ruleVoteType, setRuleVoteType] = useState<"binary" | "multi_choice">("binary");
  const [ruleOptions, setRuleOptions] = useState<string[]>(["", "", ""]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleSuggestionWithVoting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVoteType, setEditVoteType] = useState<"binary" | "multi_choice">("binary");
  const [editOptions, setEditOptions] = useState<string[]>(["", "", ""]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  // Check if user has selected a team
  const { data: standings } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const userTeam = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeam?.rosterId;
  const hasSelectedTeam = !!userRosterId;

  // Check if current user is the commissioner
  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  const { data: rulesData, isLoading: rulesLoading, isError: rulesError, error: rulesErrorDetails, refetch: refetchRules } = useQuery<{ suggestions: RuleSuggestionWithVoting[]; votingMasterEnabled: boolean }>({
    queryKey: ["/api/league", league?.leagueId, "rule-suggestions"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || "Failed to fetch rule suggestions";
        const error = new Error(errorMessage);
        (error as any).details = errorData.details;
        (error as any).code = errorData.code;
        throw error;
      }
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });
  const ruleSuggestions = rulesData?.suggestions ?? [];
  const votingMasterEnabled = rulesData?.votingMasterEnabled ?? false;

  // Create rule suggestion mutation
  const createRuleMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; voteType?: "binary" | "multi_choice"; options?: string[] }) => {
      if (!hasSelectedTeam) {
        throw new Error("Please select your team first");
      }
      const body: Record<string, unknown> = {
        authorId: user?.userId,
        authorName: user?.displayName || user?.username || "Unknown",
        rosterId: userRosterId,
        title: data.title,
        description: data.description,
      };
      if (data.voteType === "multi_choice" && data.options?.length) {
        body.voteType = "multi_choice";
        body.options = data.options.filter((o) => o.trim() !== "");
      }
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create rule suggestion");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rule suggestion submitted",
        description: "Your rule change proposal has been submitted successfully.",
      });
      setRuleDialogOpen(false);
      setRuleTitle("");
      setRuleDescription("");
      setRuleVoteType("binary");
      setRuleOptions(["", "", ""]);
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Master voting switch (commissioner only)
  const setVotingMasterMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-voting-master`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.userId, enabled }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to set voting state");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle voting mutation (kept for backward compat; UI uses master switch only)
  const toggleVotingMutation = useMutation({
    mutationFn: async ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) => {
      const res = await fetch(`/api/rule-suggestions/${ruleId}/toggle-voting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId: league?.leagueId,
          enabled,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to toggle voting");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Vote mutation (binary or ranked)
  const voteMutation = useMutation({
    mutationFn: async ({ ruleId, vote, points }: { ruleId: string; vote?: "approve" | "reject"; points?: number[] }) => {
      if (!hasSelectedTeam) {
        throw new Error("Please select your team first");
      }
      const body: Record<string, unknown> = {
        rosterId: userRosterId,
        voterName: user?.displayName || user?.username || "Unknown",
        leagueId: league?.leagueId,
      };
      if (points != null) {
        body.points = points;
      } else if (vote != null) {
        body.vote = vote;
      } else {
        throw new Error("Either vote or points is required");
      }
      const res = await fetch(`/api/rule-suggestions/${ruleId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to vote");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rule-suggestions", variables.ruleId] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: async ({ ruleId, title, description, voteType, options }: { ruleId: string; title: string; description: string; voteType?: "binary" | "multi_choice"; options?: string[] }) => {
      const body: Record<string, unknown> = {
        userId: user?.userId,
        title,
        description,
      };
      if (voteType !== undefined) body.voteType = voteType;
      if (options !== undefined) body.options = options;
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update rule suggestion");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rule suggestion updated",
        description: "Your rule change has been updated successfully.",
      });
      setEditDialogOpen(false);
      setEditingRule(null);
      setEditTitle("");
      setEditDescription("");
      setEditVoteType("binary");
      setEditOptions(["", "", ""]);
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions/${ruleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.userId,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete rule suggestion");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Rule suggestion deleted",
        description: "The rule change has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      setDeletingRuleId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "rule-suggestions"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmitRule = () => {
    // Validate league ID
    if (!league?.leagueId) {
      toast({
        title: "Validation Error",
        description: "League ID is missing. Please reconnect to your league.",
        variant: "destructive",
      });
      return;
    }

    // Validate user is logged in
    if (!user?.userId) {
      toast({
        title: "Validation Error",
        description: "You must be logged in to submit a rule change.",
        variant: "destructive",
      });
      return;
    }

    // Validate team selection
    if (!hasSelectedTeam || userRosterId === undefined || userRosterId === null) {
      toast({
        title: "Team Selection Required",
        description: "Please select your team before submitting a rule change.",
        variant: "destructive",
      });
      setShowSetup(true);
      return;
    }

    // Validate rosterId is a valid number
    if (typeof userRosterId !== "number" || isNaN(userRosterId) || userRosterId <= 0) {
      toast({
        title: "Invalid Team Selection",
        description: "Your team selection is invalid. Please select your team again.",
        variant: "destructive",
      });
      setShowSetup(true);
      return;
    }

    // Validate title
    if (!ruleTitle.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a title for your rule change proposal.",
        variant: "destructive",
      });
      return;
    }

    // Validate description
    if (!ruleDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a description for your rule change proposal.",
        variant: "destructive",
      });
      return;
    }

    if (ruleVoteType === "multi_choice") {
      const opts = ruleOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 3) {
        toast({
          title: "Validation Error",
          description: "Multi-choice rules require at least 3 options.",
          variant: "destructive",
        });
        return;
      }
    }

    createRuleMutation.mutate({
      title: ruleTitle.trim(),
      description: ruleDescription.trim(),
      voteType: ruleVoteType,
      options: ruleVoteType === "multi_choice" ? ruleOptions.map((o) => o.trim()).filter(Boolean) : undefined,
    });
  };

  const handleEditRule = (rule: RuleSuggestionWithVoting) => {
    setEditingRule(rule);
    setEditTitle(rule.title);
    setEditDescription(rule.description);
    const rv = (rule as any).voteType ?? "binary";
    setEditVoteType(rv);
    const opts = (rule as any).options;
    setEditOptions(Array.isArray(opts) && opts.length >= 3 ? [...opts] : ["", "", ""]);
    setEditDialogOpen(true);
  };

  const handleUpdateRule = () => {
    if (!editingRule) return;
    if (!editTitle.trim() || !editDescription.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in both title and description.",
        variant: "destructive",
      });
      return;
    }
    if (editVoteType === "multi_choice") {
      const opts = editOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 3) {
        toast({
          title: "Validation Error",
          description: "Multi-choice rules require at least 3 options.",
          variant: "destructive",
        });
        return;
      }
    }
    const payload: { ruleId: string; title: string; description: string; voteType?: "binary" | "multi_choice"; options?: string[] | null } = {
      ruleId: editingRule.id,
      title: editTitle.trim(),
      description: editDescription.trim(),
      voteType: editVoteType,
      options: editVoteType === "multi_choice" ? editOptions.map((o) => o.trim()).filter(Boolean) : null,
    };
    updateRuleMutation.mutate(payload);
  };

  const handleDeleteRule = (ruleId: string) => {
    setDeletingRuleId(ruleId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteRule = () => {
    if (!deletingRuleId) return;
    deleteRuleMutation.mutate(deletingRuleId);
  };

  if (!league) {
    console.log("[RuleChanges] No league connected");
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Please connect to a league to view rule changes.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!league?.leagueId) {
    console.log("[RuleChanges] League ID is missing");
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            League ID is missing. Please reconnect to your league.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
      <div className="container mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Rule Changes</h1>
            <p className="text-muted-foreground mt-1">
              Propose and vote on league rule changes
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCommissioner && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={votingMasterEnabled}
                  onCheckedChange={(checked) => setVotingMasterMutation.mutate(checked)}
                  disabled={setVotingMasterMutation.isPending}
                />
                <span className="text-sm text-muted-foreground">
                  Voting {votingMasterEnabled ? "open" : "closed"}
                </span>
              </div>
            )}
            {votingMasterEnabled && !isCommissioner ? (
              <p className="text-sm text-muted-foreground">Suggestions are closed while voting is open.</p>
            ) : (
            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  if (!hasSelectedTeam) {
                    setShowSetup(true);
                    return;
                  }
                }}
                disabled={!hasSelectedTeam}
              >
                <Plus className="w-4 h-4 mr-2" />
                Submit Rule Change
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Rule Change Proposal</DialogTitle>
                <DialogDescription>
                  Propose a change to the league rules. All league members will be able to view and vote on your proposal.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="rule-title">Title</Label>
                  <Input
                    id="rule-title"
                    placeholder="e.g., Increase roster size to 20 players"
                    value={ruleTitle}
                    onChange={(e) => setRuleTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-description">Description</Label>
                  <Textarea
                    id="rule-description"
                    placeholder="Describe the proposed rule change in detail..."
                    value={ruleDescription}
                    onChange={(e) => setRuleDescription(e.target.value)}
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vote type</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="rule-vote-type"
                        checked={ruleVoteType === "binary"}
                        onChange={() => setRuleVoteType("binary")}
                        className="rounded-full"
                      />
                      <span className="text-sm">Binary (Approve / Reject)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="rule-vote-type"
                        checked={ruleVoteType === "multi_choice"}
                        onChange={() => setRuleVoteType("multi_choice")}
                        className="rounded-full"
                      />
                      <span className="text-sm">Multi-choice (ranked)</span>
                    </label>
                  </div>
                </div>
                {ruleVoteType === "multi_choice" && (
                  <div className="space-y-2">
                    <Label>Options (min 3; voters rank 1st to last)</Label>
                    {ruleOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const next = [...ruleOptions];
                            next[i] = e.target.value;
                            setRuleOptions(next);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => ruleOptions.length > 3 && setRuleOptions(ruleOptions.filter((_, j) => j !== i))}
                          disabled={ruleOptions.length <= 3}
                          className="shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRuleOptions([...ruleOptions, ""])}
                    >
                      Add option
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmitRule} disabled={createRuleMutation.isPending}>
                  {createRuleMutation.isPending ? "Submitting..." : "Submit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            )}
        </div>
        </div>

        {!hasSelectedTeam && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium">Team Selection Required</p>
                  <p className="text-sm text-muted-foreground">
                    Please select your team before submitting or voting on rule changes.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}>
                  Select Team
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {rulesError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Rule Suggestions</AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p>
                  {rulesErrorDetails instanceof Error 
                    ? rulesErrorDetails.message 
                    : "Failed to fetch rule suggestions. Please try again."}
                </p>
                {rulesErrorDetails instanceof Error && 
                 ((rulesErrorDetails as any).details || (rulesErrorDetails as any).code) && (
                  <div className="mt-2 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm font-medium mb-1">Error Details</p>
                    {(rulesErrorDetails as any).code && (
                      <p className="text-sm">Error Code: <code className="bg-background px-1 rounded">{(rulesErrorDetails as any).code}</code></p>
                    )}
                    {(rulesErrorDetails as any).details && (
                      <p className="text-sm mt-1">{(rulesErrorDetails as any).details}</p>
                    )}
                  </div>
                )}
                {rulesErrorDetails instanceof Error && 
                 (rulesErrorDetails.message.includes("does not exist") || 
                  rulesErrorDetails.message.includes("migrations") ||
                  rulesErrorDetails.message.includes("db:push") ||
                  rulesErrorDetails.message.includes("Database table")) && (
                  <div className="mt-2 p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm font-medium mb-1">Database Setup Required</p>
                    <p className="text-sm">
                      The rule_suggestions table may not exist. Please run <code className="bg-background px-1 rounded">npm run db:push</code> to create the required database tables.
                    </p>
                  </div>
                )}
                <div className="mt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetchRules()}
                    disabled={rulesLoading}
                  >
                    {rulesLoading ? "Retrying..." : "Retry"}
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {!rulesLoading && !rulesError && rulesData !== undefined && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>
                {`${ruleSuggestions.length} rule${ruleSuggestions.length !== 1 ? 's' : ''} found`}
                {isCommissioner && (
                  <span className="ml-2 text-xs">
                    (from rule_suggestions table)
                  </span>
                )}
              </span>
            </div>
          </div>
        )}

        {rulesLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !rulesError ? (
          ruleSuggestions.length > 0 ? (
            <div className="space-y-4">
              {ruleSuggestions.map((rule) => {
                // Validate rule has required fields
                if (!rule || !rule.id || !rule.title) {
                  console.warn("[RuleChanges] Invalid rule object:", rule);
                  return null;
                }
                return (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    userRosterId={userRosterId}
                    hasSelectedTeam={hasSelectedTeam}
                    isCommissioner={isCommissioner}
                    userId={user?.userId}
                    votingMasterEnabled={votingMasterEnabled}
                    onVote={(vote) => voteMutation.mutate({ ruleId: rule.id, vote })}
                    onVoteRanked={(points) => voteMutation.mutate({ ruleId: rule.id, points })}
                    onEdit={() => handleEditRule(rule)}
                    onDelete={() => handleDeleteRule(rule.id)}
                    leagueId={league.leagueId}
                  />
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No rule changes yet</p>
                <p className="text-muted-foreground">
                  Be the first to propose a rule change for the league.
                </p>
              </CardContent>
            </Card>
          )
        ) : null}

        {/* Edit Rule Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Rule Change Proposal</DialogTitle>
              <DialogDescription>
                Update the title and description of your rule change proposal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rule-title">Title</Label>
                <Input
                  id="edit-rule-title"
                  placeholder="e.g., Increase roster size to 20 players"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rule-description">Description</Label>
                <Textarea
                  id="edit-rule-description"
                  placeholder="Describe the proposed rule change in detail..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={6}
                />
              </div>
              <div className="space-y-2">
                <Label>Vote type</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-vote-type"
                      checked={editVoteType === "binary"}
                      onChange={() => setEditVoteType("binary")}
                      className="rounded-full"
                    />
                    <span className="text-sm">Binary (Approve / Reject)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-vote-type"
                      checked={editVoteType === "multi_choice"}
                      onChange={() => setEditVoteType("multi_choice")}
                      className="rounded-full"
                    />
                    <span className="text-sm">Multi-choice (ranked)</span>
                  </label>
                </div>
              </div>
              {editVoteType === "multi_choice" && (
                <div className="space-y-2">
                  <Label>Options (min 3)</Label>
                  {editOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const next = [...editOptions];
                          next[i] = e.target.value;
                          setEditOptions(next);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => editOptions.length > 3 && setEditOptions(editOptions.filter((_, j) => j !== i))}
                        disabled={editOptions.length <= 3}
                        className="shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOptions([...editOptions, ""])}
                  >
                    Add option
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateRule} disabled={updateRuleMutation.isPending}>
                {updateRuleMutation.isPending ? "Updating..." : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Rule Suggestion?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the rule suggestion
                and all associated votes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteRule}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteRuleMutation.isPending}
              >
                {deleteRuleMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}

function RuleCard({
  rule,
  userRosterId,
  hasSelectedTeam,
  isCommissioner,
  userId,
  votingMasterEnabled,
  onVote,
  onVoteRanked,
  onEdit,
  onDelete,
  leagueId,
}: {
  rule: RuleSuggestionWithVoting;
  userRosterId?: number;
  hasSelectedTeam: boolean;
  isCommissioner: boolean;
  userId?: string;
  votingMasterEnabled: boolean;
  onVote: (vote: "approve" | "reject") => void;
  onVoteRanked: (points: number[]) => void;
  onEdit: () => void;
  onDelete: () => void;
  leagueId: string;
}) {
  const { toast } = useToast();
  const voteType = (rule as any).voteType ?? "binary";
  const options: string[] = Array.isArray((rule as any).options) ? (rule as any).options : [];
  const isMultiChoice = voteType === "multi_choice" && options.length >= 3;

  // Ranked vote: selectedOrder[rankIndex] = optionIndex (0-based rank -> option index)
  const [rankedSelection, setRankedSelection] = useState<number[]>(() => options.map((_, i) => i));

  // Validate rule object early
  if (!rule || !rule.id || !rule.title) {
    console.error("[RuleCard] Invalid rule object:", rule);
    return null;
  }

  // Fetch votes for this rule
  const { data: votesData } = useQuery<RuleVoteData>({
    queryKey: ["/api/rule-suggestions", rule.id, "votes"],
    queryFn: async () => {
      const res = await fetch(`/api/rule-suggestions/${rule.id}/votes`);
      if (!res.ok) throw new Error("Failed to fetch votes");
      return res.json();
    },
    enabled: !!rule.id,
  });

  // Fetch user's vote (binary returns RuleVote; ranked returns { pointsByOption } or null)
  const { data: userVoteData } = useQuery<RuleVote | { pointsByOption: number[] } | null>({
    queryKey: ["/api/rule-suggestions", rule.id, "votes", userRosterId],
    queryFn: async () => {
      if (!userRosterId) return null;
      const res = await fetch(`/api/rule-suggestions/${rule.id}/votes/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch user vote");
      return res.json();
    },
    enabled: !!userRosterId && !!rule.id,
  });

  const votingEnabled = votingMasterEnabled;
  const approveCount = votesData?.approveCount ?? 0;
  const rejectCount = votesData?.rejectCount ?? 0;
  const currentUserVote = !isMultiChoice && userVoteData && "vote" in userVoteData ? userVoteData.vote : undefined;
  const currentUserRankedVote = isMultiChoice && userVoteData && "pointsByOption" in userVoteData ? (userVoteData as { pointsByOption: number[] }).pointsByOption : undefined;
  const pointsByOption = votesData?.ranked ? (votesData.pointsByOption ?? []) : [];
  const voterCount = votesData?.voterCount ?? 0;

  useEffect(() => {
    if (isMultiChoice && currentUserRankedVote && currentUserRankedVote.length === options.length) {
      const order = options
        .map((_, i) => ({ i, p: currentUserRankedVote[i] ?? 0 }))
        .sort((a, b) => b.p - a.p)
        .map((x) => x.i);
      setRankedSelection(order);
    }
  }, [isMultiChoice, currentUserRankedVote, options.length]);

  // Check if user can edit/delete this rule
  const isAuthor = rule.authorId === userId;
  const canEditOrDelete = isAuthor || isCommissioner;

  const handleVote = (vote: "approve" | "reject") => {
    if (!hasSelectedTeam) {
      toast({
        title: "Team Selection Required",
        description: "Please select your team before voting.",
        variant: "destructive",
      });
      return;
    }
    if (!votingEnabled) {
      toast({
        title: "Voting Disabled",
        description: "Voting has been disabled for this rule by the commissioner.",
        variant: "destructive",
      });
      return;
    }
    onVote(vote);
  };

  const handleSubmitRankedVote = () => {
    if (!hasSelectedTeam) {
      toast({
        title: "Team Selection Required",
        description: "Please select your team before voting.",
        variant: "destructive",
      });
      return;
    }
    if (!votingEnabled) {
      toast({
        title: "Voting Disabled",
        description: "Voting has been disabled for this rule by the commissioner.",
        variant: "destructive",
      });
      return;
    }
    const N = options.length;
    const points = new Array<number>(N).fill(0);
    for (let r = 0; r < N; r++) {
      points[rankedSelection[r]] = N - r;
    }
    onVoteRanked(points);
  };

  const getStatusBadge = () => {
    switch (rule.status) {
      case "approved":
        return <Badge className="bg-green-500 text-white">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-500 text-white">Rejected</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="font-heading text-lg">{rule.title}</CardTitle>
              {getStatusBadge()}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Avatar className="w-5 h-5">
                  <AvatarFallback className="text-xs">
                    {rule.authorName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{rule.authorName}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{formatTimeAgo(rule.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEditOrDelete && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  className="h-8 w-8"
                  title="Edit rule"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Delete rule"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-wrap">{rule.description}</p>

        {isMultiChoice && (
          <div className="pt-4 border-t space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Options (ranked choice: 1st = most points)</p>
            <ul className="list-decimal list-inside text-sm space-y-1">
              {options.map((opt, i) => (
                <li key={i}>{opt}</li>
              ))}
            </ul>
          </div>
        )}

        {!votingEnabled && (
          <p className="text-sm text-muted-foreground pt-4 border-t">Voting is closed.</p>
        )}
        {votingEnabled && !isMultiChoice && (
          <div className="flex items-center gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant={currentUserVote === "approve" ? "default" : "outline"}
                size="sm"
                onClick={() => handleVote("approve")}
                disabled={!hasSelectedTeam}
              >
                <ThumbsUp className="w-4 h-4 mr-1" />
                Approve ({approveCount})
              </Button>
              <Button
                variant={currentUserVote === "reject" ? "default" : "outline"}
                size="sm"
                onClick={() => handleVote("reject")}
                disabled={!hasSelectedTeam}
              >
                <ThumbsDown className="w-4 h-4 mr-1" />
                Reject ({rejectCount})
              </Button>
            </div>
            {currentUserVote && (
              <Badge variant="secondary" className="ml-auto">
                You voted {currentUserVote === "approve" ? "Approve" : "Reject"}
              </Badge>
            )}
          </div>
        )}

        {votingEnabled && isMultiChoice && (
          <div className="pt-4 border-t space-y-3">
            <p className="text-sm font-medium">Your ranking (1st = most preferred)</p>
            <div className="flex flex-wrap gap-2">
              {options.map((_, rankIndex) => (
                <div key={rankIndex} className="flex items-center gap-1">
                  <Label className="text-xs whitespace-nowrap">{rankIndex === 0 ? "1st" : rankIndex === 1 ? "2nd" : `${rankIndex + 1}th`}</Label>
                  <select
                    className="border rounded px-2 py-1 text-sm bg-background"
                    value={rankedSelection[rankIndex]}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const next = [...rankedSelection];
                      const prevIdx = next.indexOf(val);
                      if (prevIdx >= 0) next[prevIdx] = next[rankIndex];
                      next[rankIndex] = val;
                      setRankedSelection(next);
                    }}
                  >
                    {options.map((opt, i) => (
                      <option key={i} value={i}>{opt}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSubmitRankedVote}
                disabled={!hasSelectedTeam}
              >
                <Vote className="w-4 h-4 mr-1" />
                Submit vote
              </Button>
              {currentUserRankedVote && (
                <Badge variant="secondary">You voted</Badge>
              )}
            </div>
            {pointsByOption.length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Results ({voterCount} voter{voterCount !== 1 ? "s" : ""})</p>
                {options
                  .map((opt, i) => ({ opt, points: pointsByOption[i] ?? 0, index: i }))
                  .sort((a, b) => b.points - a.points)
                  .map(({ opt, points }, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{idx + 1}. {opt}</span>
                      <span className="font-medium">{points} pts</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {!votingEnabled && (
          <div className="pt-4 border-t">
            <Badge variant="outline" className="flex items-center gap-1 w-fit">
              <X className="w-3 h-3" />
              Voting disabled
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

