import { useState } from "react";
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
  Database,
  ExternalLink,
} from "lucide-react";
import type { RuleSuggestion, RuleVote } from "@shared/schema";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

interface RuleSuggestionWithVoting extends RuleSuggestion {
  votingEnabled?: boolean;
}

interface RuleVoteData {
  votes: RuleVote[];
  approveCount: number;
  rejectCount: number;
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleSuggestionWithVoting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
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

  const { data: ruleSuggestions, isLoading: rulesLoading, isError: rulesError, error: rulesErrorDetails, refetch: refetchRules } = useQuery<RuleSuggestionWithVoting[]>({
    queryKey: ["/api/league", league?.leagueId, "rule-suggestions"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`);
      if (!res.ok) throw new Error("Failed to fetch rule suggestions");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  // Create rule suggestion mutation
  const createRuleMutation = useMutation({
    mutationFn: async (data: { title: string; description: string }) => {
      if (!hasSelectedTeam) {
        throw new Error("Please select your team first");
      }
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorId: user?.userId,
          authorName: user?.displayName || user?.username || "Unknown",
          rosterId: userRosterId,
          title: data.title,
          description: data.description,
        }),
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

  // Toggle voting mutation
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

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: async ({ ruleId, vote }: { ruleId: string; vote: "approve" | "reject" }) => {
      if (!hasSelectedTeam) {
        throw new Error("Please select your team first");
      }
      const res = await fetch(`/api/rule-suggestions/${ruleId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId: userRosterId,
          voterName: user?.displayName || user?.username || "Unknown",
          vote,
          leagueId: league?.leagueId,
        }),
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
    mutationFn: async ({ ruleId, title, description }: { ruleId: string; title: string; description: string }) => {
      const res = await fetch(`/api/league/${league?.leagueId}/rule-suggestions/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.userId,
          title,
          description,
        }),
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

    // All validations passed, submit the rule
    createRuleMutation.mutate({
      title: ruleTitle.trim(),
      description: ruleDescription.trim(),
    });
  };

  const handleEditRule = (rule: RuleSuggestionWithVoting) => {
    setEditingRule(rule);
    setEditTitle(rule.title);
    setEditDescription(rule.description);
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
    updateRuleMutation.mutate({
      ruleId: editingRule.id,
      title: editTitle.trim(),
      description: editDescription.trim(),
    });
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Navigate to database viewer for rule_suggestions table
                  window.open(`/admin/database?table=rule_suggestions&leagueId=${league?.leagueId}`, '_blank');
                }}
                title="View rule_suggestions table in Database Viewer"
              >
                <Database className="w-4 h-4 mr-2" />
                View in Database
                <ExternalLink className="w-3 h-3 ml-2" />
              </Button>
            )}
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

        {rulesError && !ruleSuggestions && (
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
                 (rulesErrorDetails.message.includes("does not exist") || 
                  rulesErrorDetails.message.includes("migrations") ||
                  rulesErrorDetails.message.includes("db:push")) && (
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

        {!rulesLoading && !rulesError && ruleSuggestions !== undefined && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>
                {Array.isArray(ruleSuggestions) 
                  ? `${ruleSuggestions.length} rule${ruleSuggestions.length !== 1 ? 's' : ''} found`
                  : 'Loading rule count...'}
                {isCommissioner && (
                  <span className="ml-2 text-xs">
                    (from rule_suggestions table)
                  </span>
                )}
              </span>
            </div>
            {isCommissioner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Verify connection by checking database viewer
                  window.open(`/admin/database?table=rule_suggestions&leagueId=${league?.leagueId}`, '_blank');
                }}
                className="text-xs"
              >
                <Database className="w-3 h-3 mr-1" />
                Verify Connection
              </Button>
            )}
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
        ) : !rulesError && Array.isArray(ruleSuggestions) ? (
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
                    onVote={(vote) => voteMutation.mutate({ ruleId: rule.id, vote })}
                    onToggleVoting={(enabled) =>
                      toggleVotingMutation.mutate({ ruleId: rule.id, enabled })
                    }
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
  onVote,
  onToggleVoting,
  onEdit,
  onDelete,
  leagueId,
}: {
  rule: RuleSuggestionWithVoting;
  userRosterId?: number;
  hasSelectedTeam: boolean;
  isCommissioner: boolean;
  userId?: string;
  onVote: (vote: "approve" | "reject") => void;
  onToggleVoting: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  leagueId: string;
}) {
  const { toast } = useToast();

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

  // Fetch user's vote
  const { data: userVoteData } = useQuery<RuleVote | null>({
    queryKey: ["/api/rule-suggestions", rule.id, "votes", userRosterId],
    queryFn: async () => {
      if (!userRosterId) return null;
      const res = await fetch(`/api/rule-suggestions/${rule.id}/votes/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch user vote");
      return res.json();
    },
    enabled: !!userRosterId && !!rule.id,
  });

  const votingEnabled = rule.votingEnabled !== false; // Default to true if not set
  const approveCount = votesData?.approveCount || 0;
  const rejectCount = votesData?.rejectCount || 0;
  const currentUserVote = userVoteData?.vote;

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
            {isCommissioner && (
              <div className="flex items-center gap-2 ml-2">
                <Switch
                  checked={votingEnabled}
                  onCheckedChange={onToggleVoting}
                  id={`voting-toggle-${rule.id}`}
                />
                <Label htmlFor={`voting-toggle-${rule.id}`} className="text-sm">
                  Voting {votingEnabled ? "On" : "Off"}
                </Label>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-wrap">{rule.description}</p>

        {votingEnabled && (
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

