import { createContext, useContext, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import {
  resultLabel,
  type HistoryFranchise,
  type LeagueHistory,
  type PlayoffResult,
} from "@shared/leagueHistory";

export function useLeagueHistory() {
  const { league } = useSleeper();
  return useQuery<LeagueHistory>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/history`);
      if (!res.ok) throw new Error("Failed to load league history");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });
}

interface HistoryContextValue {
  history: LeagueHistory;
  franchiseById: Map<string, HistoryFranchise>;
  myFranchiseId: string | null;
}

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ history, children }: { history: LeagueHistory; children: ReactNode }) {
  const { user } = useSleeper();
  const franchiseById = new Map(history.franchises.map((f) => [f.id, f]));
  const myFranchiseId = user?.userId && franchiseById.has(user.userId) ? user.userId : null;
  return <HistoryContext.Provider value={{ history, franchiseById, myFranchiseId }}>{children}</HistoryContext.Provider>;
}

export function useHistoryContext(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error("HistoryProvider missing");
  return ctx;
}

export const formatPoints = (value: number, digits = 2) =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatPct = (value: number) => (value >= 1 ? "1.000" : value.toFixed(3).replace(/^0/, ""));

export const recordText = (wins: number, losses: number, ties: number) =>
  ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

export function TeamAvatar({ franchise, size = 28 }: { franchise: HistoryFranchise | undefined; size?: number }) {
  return (
    <Avatar style={{ width: size, height: size }} className="shrink-0">
      {franchise?.avatar && <AvatarImage src={franchise.avatar} alt={franchise.name} />}
      <AvatarFallback className="text-[10px]">{franchise?.initials ?? "?"}</AvatarFallback>
    </Avatar>
  );
}

export function YouBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-primary/50 text-primary">
      You
    </Badge>
  );
}

/** Team avatar and name, linking to that team's history page. */
export function TeamLink({
  id,
  size = 24,
  name,
  className = "",
  link = true,
  showAvatar = true,
}: {
  id: string;
  size?: number;
  /** Overrides the franchise's current name, e.g. the name it had that season. */
  name?: string;
  className?: string;
  link?: boolean;
  showAvatar?: boolean;
}) {
  const { franchiseById, myFranchiseId } = useHistoryContext();
  const franchise = franchiseById.get(id);
  const content = (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      {showAvatar && <TeamAvatar franchise={franchise} size={size} />}
      <span className="truncate">{name ?? franchise?.name ?? "Unknown team"}</span>
      {myFranchiseId === id && <YouBadge />}
    </span>
  );
  if (!link) return content;
  return (
    <Link href={`/history/teams/${encodeURIComponent(id)}`} className="hover:underline" data-testid={`link-team-${id}`}>
      {content}
    </Link>
  );
}

const RESULT_STYLE: Record<PlayoffResult, string> = {
  champion: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/40",
  runner_up: "bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/40",
  third: "bg-amber-700/15 text-amber-700 dark:text-amber-500 border-amber-700/40",
  fourth: "bg-muted text-muted-foreground border-border",
  playoffs: "bg-primary/10 text-primary border-primary/30",
  missed: "bg-muted text-muted-foreground border-border",
};

export function ResultBadge({ result }: { result: PlayoffResult | null }) {
  if (!result) return <span className="text-xs text-muted-foreground">In progress</span>;
  return (
    <Badge variant="outline" className={`gap-1 font-normal ${RESULT_STYLE[result]}`}>
      {result === "champion" && <Crown className="w-3 h-3" />}
      {resultLabel[result]}
    </Badge>
  );
}

export function weekLabel(season: string, week: number, label?: string) {
  return label ? `${season} - ${label}` : `${season} - Week ${week}`;
}