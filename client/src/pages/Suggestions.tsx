import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MessageSquare, Send, Trash2, Check } from "lucide-react";
import type { Suggestion } from "@shared/schema";

const COMMISSIONER_USER_IDS = ["900186363130503168"];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Suggestions() {
  const { user, league } = useSleeper();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ["/api/league", league?.leagueId, "suggestions", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/league/${league?.leagueId}/suggestions?userId=${user?.userId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId && isCommissioner,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/league/${league!.leagueId}/suggestions`, {
        authorId: user!.userId,
        authorName: user!.displayName || user!.username || "Unknown",
        content: content.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setContent("");
      setSubmitted(true);
      toast({ title: "Suggestion submitted!", description: "Your suggestion has been sent to the commissioner." });
      if (isCommissioner) {
        queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "suggestions"] });
      }
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to submit", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/league/${league!.leagueId}/suggestions/${id}`, {
        userId: user!.userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "suggestions"] });
      toast({ title: "Suggestion deleted" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to delete", description: err.message });
    },
  });

  const handleSubmit = () => {
    if (!content.trim()) {
      toast({ variant: "destructive", title: "Content required", description: "Please enter your suggestion." });
      return;
    }
    createMutation.mutate();
  };

  if (!league) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-muted-foreground">Select a league to submit suggestions.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="w-6 h-6" />
          Suggestions
        </h1>
        <p className="text-muted-foreground mt-1">
          Share feedback and ideas with your commissioner.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit a suggestion</CardTitle>
          <CardDescription>
            Your suggestion will be sent to the commissioner for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="What would you like to suggest? (e.g., rule changes, feature requests, improvements...)"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || !content.trim()}
          >
            <Send className="w-4 h-4 mr-2" />
            Submit
          </Button>
          {submitted && !isCommissioner && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <Check className="w-4 h-4" />
              Your suggestion has been submitted to the commissioner.
            </p>
          )}
        </CardContent>
      </Card>

      {isCommissioner && (
        <Card>
          <CardHeader>
            <CardTitle>Submitted suggestions</CardTitle>
            <CardDescription>
              Suggestions from league members. Only you can see this list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suggestionsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : suggestionsData?.suggestions?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions yet.</p>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {suggestionsData?.suggestions?.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 rounded-lg border bg-muted/30 space-y-2"
                    >
                      <p className="text-sm whitespace-pre-wrap">{s.content}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {s.authorName} • {formatTimestamp(s.createdAt)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
