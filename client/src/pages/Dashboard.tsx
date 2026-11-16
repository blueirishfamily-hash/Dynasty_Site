import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { useSleeper } from "@/lib/sleeper-context";
import ActivityFeed from "@/components/ActivityFeed";
import MatchupPreview from "@/components/MatchupPreview";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useContractsEnabled, useLeagueRules } from "@/lib/leagueRules";


interface PlayoffPredictionData {
  predictions: { rosterId: number; makePlayoffsPct: number }[];
}

interface RuleSuggestionLite {
  id: string;
  votingEnabled?: boolean;
}

interface RulesData {
  suggestions: RuleSuggestionLite[];
  votingMasterEnabled: boolean;
  votingClosesAt: number | null;
}

interface DbContractLite {
  rosterId: number;
  playerId: string;
  salaries: string;
}

interface DbDeadCapLite {
  rosterId: number;
  deadCapSalaries: string;
}

/** Salaries are stored in tenths of $M, same as the Contracts Hub. */
function parseSalaries(raw: string): Record<number, number> {
  try {
    const obj = JSON.parse(raw || "{}");
    const out: Record<number, number> = {};
    for (const [year, val] of Object.entries(obj)) {
      const y = Number(year);
      if (!isNaN(y)) out[y] = (Number(val) || 0) / 10;
    }
    return out;
  } catch {
    return {};
  }
}

function timeLeft(closesAt: number | null): string {
  if (closesAt == null) return "Open now";
  const ms = closesAt - Date.now();
  if (ms <= 0) return "Closing";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

function AttentionRow({
  title,
  detail,
  tag,
  href,
  action,
  testId,
}: {
  title: string;
  detail: string;
  tag: string;
  href: string;
  action: string;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3" data-testid={testId}>
      <div className="flex-1 min-w-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="text-xs">{tag}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
      </div>
      <Button asChild size="sm" className="min-h-[40px]">
        <Link href={href}>{action}</Link>
      </Button>
    </div>
  );
}

export default function Dashboard() {
  const contractsOn = useContractsEnabled();
  const TOTAL_CAP = useLeagueRules().salaryCap;
  const { user, league, currentWeek, season } = useSleeper();
  const leagueId = league?.leagueId;
  const currentYear = parseInt(season) || new Date().getFullYear();

  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["/api/sleeper/league", leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/standings?userId=${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  const { data: playoffData } = useQuery<PlayoffPredictionData>({
    queryKey: ["/api/sleeper/league", leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: matchup, isLoading: matchupLoading } = useQuery({
    queryKey: ["/api/sleeper/league", leagueId, "matchup", user?.userId, currentWeek],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/matchup?userId=${user?.userId}&week=${currentWeek}`);
      if (!res.ok) throw new Error("Failed to fetch matchup");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ["/api/sleeper/league", leagueId, "transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/transactions?limit=15`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!leagueId,
  });

  // Same queries (and cache keys) as the Contracts Hub and Rule Changes pages, so the numbers agree.
  const { data: rulesData } = useQuery<RulesData>({
    queryKey: ["/api/league", leagueId, "rule-suggestions"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/rule-suggestions`);
      if (!res.ok) throw new Error("Failed to fetch rule suggestions");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  const { data: dbContracts = [] } = useQuery<DbContractLite[]>({
    queryKey: ["/api/league", leagueId, "contracts"],
    enabled: !!leagueId,
  });
  const { data: rawRosters = [] } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", leagueId, "rosters"],
    enabled: !!leagueId,
  });
  const { data: deadCapEntries = [] } = useQuery<DbDeadCapLite[]>({
    queryKey: ["/api/leagues", leagueId, "dead-cap"],
    enabled: !!leagueId,
  });

  const userStanding = (standings || []).find((t: any) => t.isUser);
  const myRosterId: number | undefined = userStanding?.rosterId;

  const oddsByRoster = useMemo(() => {
    const m = new Map<number, number>();
    (playoffData?.predictions ?? []).forEach((p) => m.set(p.rosterId, p.makePlayoffsPct));
    return m;
  }, [playoffData]);

  // ----- Rule votes still waiting on you -----
  const votingOpen = !!rulesData?.votingMasterEnabled && (rulesData.votingClosesAt == null || Date.now() < rulesData.votingClosesAt);
  const votableRules = votingOpen ? (rulesData?.suggestions ?? []).filter((s) => s.votingEnabled) : [];
  const voteQueries = useQueries({
    queries: votableRules.map((rule) => ({
      queryKey: ["/api/rule-suggestions", rule.id, "votes", myRosterId],
      queryFn: async () => {
        const res = await fetch(`/api/rule-suggestions/${rule.id}/votes/${myRosterId}`);
        if (!res.ok) throw new Error("Failed to fetch user vote");
        return res.json();
      },
      enabled: !!myRosterId,
    })),
  });
  const votesLoaded = voteQueries.every((q) => !q.isLoading);
  const unvotedCount = votesLoaded
    ? voteQueries.filter((q) => !(q.data && typeof q.data === "object" && ("vote" in q.data || "pointsByOption" in q.data))).length
    : 0;

  // ----- Cap and contracts for your team -----
  const cap = useMemo(() => {
    if (!myRosterId) return null;
    const mine = new Set<string>(((rawRosters.find((r) => r.roster_id === myRosterId)?.players) || []).map((id: unknown) => String(id)));
    let used = 0;
    let expiring = 0;
    for (const c of dbContracts) {
      if (c.rosterId !== myRosterId || !mine.has(String(c.playerId))) continue;
      const sal = parseSalaries(c.salaries);
      used += sal[currentYear] || 0;
      const through = Math.max(0, ...Object.entries(sal).filter(([, v]) => v > 0).map(([y]) => Number(y)));
      if (through === currentYear && (sal[currentYear] || 0) > 0) expiring += 1;
    }
    let dead = 0;
    for (const d of deadCapEntries) {
      if (d.rosterId !== myRosterId) continue;
      try {
        dead += (Number(JSON.parse(d.deadCapSalaries || "{}")[String(currentYear)]) || 0) / 10;
      } catch {
        /* ignore bad row */
      }
    }
    const total = used + dead;
    return { used: total, dead, space: Math.max(0, TOTAL_CAP - total), expiring };
  }, [myRosterId, rawRosters, dbContracts, deadCapEntries, currentYear]);

  const userTeam = matchup?.userTeam
    ? {
        name: matchup.userTeam.name,
        initials: matchup.userTeam.initials,
        projectedScore: matchup.userTeam.projectedScore || 0,
        record: matchup.userTeam.record,
        starters: matchup.userTeam.starters || [],
      }
    : null;
  const opponentTeam = matchup?.opponentTeam
    ? {
        name: matchup.opponentTeam.name,
        initials: matchup.opponentTeam.initials,
        projectedScore: matchup.opponentTeam.projectedScore || 0,
        record: matchup.opponentTeam.record,
        starters: matchup.opponentTeam.starters || [],
      }
    : null;

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Welcome to Dynasty Command</h2>
          <p className="text-muted-foreground">Connect your Sleeper account to get started with your league.</p>
        </div>
      </div>
    );
  }

  const playoffTeams = league.playoffTeams || 6;
  const rows = (standings || []) as any[];
  const picture = rows.slice(0, playoffTeams + 1);
  const myOdds = myRosterId != null ? oddsByRoster.get(myRosterId) : undefined;
  const attentionCount = (unvotedCount > 0 ? 1 : 0) + ((cap?.expiring ?? 0) > 0 ? 1 : 0);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Here is what needs you in {league.name}</p>
        </div>
        <Badge variant="outline">Week {currentWeek}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card data-testid="card-needs-attention">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-heading text-lg">Needs your attention</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {attentionCount} {attentionCount === 1 ? "item" : "items"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {unvotedCount > 0 && (
                <AttentionRow
                  testId="attention-rule-votes"
                  title={`Vote on ${unvotedCount} rule ${unvotedCount === 1 ? "change" : "changes"}`}
                  detail="Voting is open and you haven't cast your vote yet."
                  tag={timeLeft(rulesData?.votingClosesAt ?? null)}
                  href="/rule-changes"
                  action="Vote"
                />
              )}
              {contractsOn && (cap?.expiring ?? 0) > 0 && (
                <AttentionRow
                  testId="attention-expiring"
                  title={`${cap!.expiring} ${cap!.expiring === 1 ? "contract expires" : "contracts expire"} after this season`}
                  detail="Decide on extensions or tags in the Contracts Hub."
                  tag={`${currentYear} season`}
                  href="/contracts-hub"
                  action="Open hub"
                />
              )}
              {attentionCount === 0 && (
                <p className="text-sm text-muted-foreground py-2" data-testid="attention-clear">
                  You're all caught up. No votes or contract decisions are waiting on you.
                </p>
              )}
            </CardContent>
          </Card>

          {matchupLoading ? (
            <Card>
              <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-40 w-32" />
                  <Skeleton className="h-10 w-16" />
                  <Skeleton className="h-40 w-32" />
                </div>
              </CardContent>
            </Card>
          ) : userTeam && opponentTeam ? (
            <MatchupPreview week={currentWeek} userTeam={userTeam} opponent={opponentTeam} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No matchup data available for week {currentWeek}
              </CardContent>
            </Card>
          )}

          {transactionsLoading ? (
            <Card>
              <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
              <CardContent>
                {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-20 w-full mb-2" />))}
              </CardContent>
            </Card>
          ) : (
            <ActivityFeed transactions={transactions || []} />
          )}
        </div>

        <div className="space-y-6">
          <Card data-testid="card-playoff-outlook">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Playoff outlook</CardTitle>
            </CardHeader>
            <CardContent>
              {userStanding ? (
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-[104px] w-[104px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: `conic-gradient(hsl(var(--primary)) ${(myOdds ?? 0) * 3.6}deg, hsl(var(--muted)) 0)` }}
                  >
                    <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full bg-card">
                      <span className="font-heading text-2xl font-bold tabular-nums">{myOdds != null ? `${Math.round(myOdds)}%` : "—"}</span>
                      <span className="text-[10px] text-muted-foreground">to make it</span>
                    </div>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="font-semibold">Currently #{userStanding.rank} seed</div>
                    <div className="text-xs text-muted-foreground">
                      {userStanding.wins}-{userStanding.losses} · top {playoffTeams} make the playoffs
                    </div>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-[104px] w-full" />
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-playoff-picture">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-heading text-lg">Playoff picture</CardTitle>
                <Link href="/standings" className="flex items-center text-xs text-muted-foreground hover:text-foreground">
                  Standings <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-0.5">
              {standingsLoading ? (
                [...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full mb-1" />)
              ) : (
                picture.map((t: any, i: number) => {
                  const odds = oddsByRoster.get(t.rosterId);
                  return (
                    <div key={t.rosterId ?? i}>
                      <div
                        className={`grid grid-cols-[20px_28px_1fr_44px_44px] items-center gap-2.5 rounded-lg border px-2.5 min-h-[44px] ${
                          t.isUser ? "border-primary/60 bg-primary/10" : "border-transparent"
                        }`}
                        data-testid={`picture-row-${t.rosterId}`}
                      >
                        <span className="text-sm font-bold text-muted-foreground">{t.rank ?? i + 1}</span>
                        <Avatar className="w-6 h-6">
                          {t.avatar && <AvatarImage src={t.avatar} alt={t.name} />}
                          <AvatarFallback className="text-[9px]">{t.initials}</AvatarFallback>
                        </Avatar>
                        <span className={`truncate text-sm font-medium ${t.isUser ? "text-primary" : ""}`}>{t.name}</span>
                        <span className="text-right text-sm font-bold tabular-nums">{t.wins}-{t.losses}</span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums">{odds != null ? `${Math.round(odds)}%` : ""}</span>
                      </div>
                      {i + 1 === playoffTeams && picture.length > playoffTeams && (
                        <div className="my-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                          <span className="flex-1 border-t-2 border-dashed border-amber-700" />
                          Playoff line
                          <span className="flex-1 border-t-2 border-dashed border-amber-700" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {contractsOn && cap && (
            <Card data-testid="card-cap-room">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-heading text-lg">Cap room</CardTitle>
                  <Link href="/contracts-hub" className="flex items-center text-xs text-muted-foreground hover:text-foreground">
                    Contracts Hub <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-heading text-2xl font-bold tabular-nums text-primary">${cap.space.toFixed(1)}M</span>
                  <span className="text-xs text-muted-foreground">of ${TOTAL_CAP}M cap</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, (cap.used / TOTAL_CAP) * 100)}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div>
                    <div className="font-heading text-lg font-bold tabular-nums">${cap.dead.toFixed(1)}M</div>
                    <div className="text-xs text-muted-foreground">Dead cap</div>
                  </div>
                  <div>
                    <div className={`font-heading text-lg font-bold tabular-nums ${cap.expiring > 0 ? "text-amber-500" : ""}`}>{cap.expiring}</div>
                    <div className="text-xs text-muted-foreground">Expiring</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
