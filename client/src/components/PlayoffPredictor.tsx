import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Target, Info, Hash, AlertCircle, CheckCircle2, XCircle, ArrowUp, ArrowDown } from "lucide-react";

interface TeamPrediction {
  rosterId: number;
  ownerId: string;
  name: string;
  initials: string;
  currentWins: number;
  currentLosses: number;
  pointsFor: number;
  pointsRank: number;
  pointsBehind: number | null;
  pointsAhead: number | null;
  projectedPointsPerWeek: number;
  division?: number;
  oneSeedPct: number;
  divisionWinnerPct?: number;
  makePlayoffsPct: number;
  projectedWins: number;
  projectedPointsFor: number;
  byePct?: number;
  seedPct?: number[];
  gamesLeft?: number;
}

interface LeverageGame {
  week: number;
  teamA: number;
  teamB: number;
  rootFor: number;
  oddsIfRootWins: number;
  oddsIfRootLoses: number;
  swing: number;
}

interface UserOutlook {
  rosterId: number;
  baselinePct: number;
  bestCasePct: number;
  worstCasePct: number;
  ownGame: { week: number; opponent: number; oddsIfWin: number; oddsIfLose: number } | null;
  leverage: LeverageGame[];
  winsNeeded: Array<{ wins: number; pct: number; samples: number }>;
}

interface OutlookData {
  cutoffWins: number;
  cutoffWinsPrev: number | null;
  history: { weeks: number[]; series: Record<string, number[]> };
  user: UserOutlook | null;
}

interface PlayoffPredictionData {
  predictions: TeamPrediction[];
  playoffTeams: number;
  remainingWeeks: number;
  currentWeek: number;
  hasDivisions: boolean;
  simulationCount: number;
  byes?: number;
  outlook?: OutlookData | null;
}

interface PlayoffPredictorProps {
  userId?: string;
}

/** Format a simulated percentage without claiming certainty: ">99%" / "<1%" unless it is exactly 100 / 0. */
function fmtPct(pct: number, decimals = 0): string {
  if (pct <= 0) return "0%";
  if (pct >= 100) return "100%";
  if (pct < 1) return "<1%";
  if (pct > 99) return ">99%";
  return `${pct.toFixed(decimals)}%`;
}

function getProbabilityColor(pct: number): string {
  const clampedPct = Math.min(pct, 100);
  if (clampedPct >= 100) return "bg-primary";
  if (clampedPct >= 70) return "bg-chart-2";
  if (clampedPct >= 50) return "bg-chart-4";
  if (clampedPct >= 25) return "bg-chart-3";
  if (clampedPct > 0) return "bg-destructive";
  return "bg-muted-foreground/50"; // 0% = grey
}

function getTextColor(pct: number): string {
  const clampedPct = Math.min(pct, 100);
  if (clampedPct >= 100) return "text-primary";
  if (clampedPct >= 70) return "text-chart-2";
  if (clampedPct >= 50) return "text-chart-4";
  if (clampedPct >= 25) return "text-chart-3";
  if (clampedPct > 0) return "text-destructive";
  return "text-muted-foreground"; // 0% = grey
}

function getStandingsBadgeClass(playoffPct: number): string {
  const clampedPct = Math.min(playoffPct, 100);
  if (clampedPct >= 100) return "bg-primary text-primary-foreground";
  if (clampedPct >= 70) return "bg-chart-2 text-white";
  if (clampedPct >= 50) return "bg-chart-4 text-white";
  if (clampedPct >= 25) return "bg-chart-3 text-white";
  if (clampedPct > 0) return "bg-destructive text-destructive-foreground";
  return "bg-muted text-muted-foreground"; // 0% = grey
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

const CHART_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

/** Playoff odds by week: your team in the primary color, and the most uncertain teams around you. */
function OddsHistoryChart({
  weeks,
  series,
  nowLabel,
  lines,
}: {
  weeks: number[];
  series: Record<string, number[]>;
  nowLabel: number;
  lines: Array<{ rosterId: number; name: string; color: string; now: number; emphasis: boolean }>;
}) {
  const W = 640;
  const H = 260;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const labels = [...weeks, nowLabel];
  const n = labels.length;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Playoff odds by week">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="hsl(var(--border))" />
          <text x={pad.l - 6} y={y(g) + 3} fontSize="10" textAnchor="end" fill="hsl(var(--muted-foreground))">{g}%</text>
        </g>
      ))}
      {labels.map((w, i) => (
        <text key={`${w}-${i}`} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="hsl(var(--muted-foreground))">
          {i === n - 1 ? "Now" : w}
        </text>
      ))}
      {lines.map((l) => {
        const vals = [...(series[l.rosterId] || []), l.now];
        const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        return (
          <g key={l.rosterId}>
            <polyline points={pts} fill="none" stroke={l.color} strokeWidth={l.emphasis ? 3 : 2} strokeLinejoin="round" />
            <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={l.emphasis ? 4 : 3} fill={l.color} />
          </g>
        );
      })}
    </svg>
  );
}

export default function PlayoffPredictor({ userId }: PlayoffPredictorProps) {
  const { league } = useSleeper();

  const { data, isLoading, error } = useQuery<PlayoffPredictionData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions", userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions?userId=${userId ?? ""}`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  if (!league) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Connect your league to view playoff predictions
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Unable to load playoff predictions
        </CardContent>
      </Card>
    );
  }

  const { predictions, playoffTeams, remainingWeeks, simulationCount, outlook } = data;
  const nameOf = (rosterId: number) => predictions.find((p) => p.rosterId === rosterId)?.name ?? `Team ${rosterId}`;
  const userTeam = predictions.find((p) => p.ownerId === userId);
  const me = outlook?.user ?? null;

  // Most likely finish: the seed with the highest chance
  const seedPct = userTeam?.seedPct;
  const likelySeed = seedPct && seedPct.length > 0 ? seedPct.indexOf(Math.max(...seedPct)) + 1 : null;
  const seedMax = seedPct ? Math.max(...seedPct, 1) : 1;

  // Chart lines: you, plus up to four of the most uncertain other teams
  const chartLines = (() => {
    if (!outlook || !userTeam) return [] as Array<{ rosterId: number; name: string; color: string; now: number; emphasis: boolean }>;
    const others = predictions
      .filter((p) => p.rosterId !== userTeam.rosterId && p.makePlayoffsPct > 0 && p.makePlayoffsPct < 100)
      .sort((a, b) => Math.abs(a.makePlayoffsPct - 50) - Math.abs(b.makePlayoffsPct - 50))
      .slice(0, 4);
    return [
      { rosterId: userTeam.rosterId, name: userTeam.name, color: "hsl(var(--primary))", now: userTeam.makePlayoffsPct, emphasis: true },
      ...others.map((p, i) => ({ rosterId: p.rosterId, name: p.name, color: CHART_COLORS[i % CHART_COLORS.length], now: p.makePlayoffsPct, emphasis: false })),
    ];
  })();

  // Wins-needed rows: from the first total with a real chance up to the first guaranteed total
  const winsRows = (() => {
    const rows = me?.winsNeeded ?? [];
    const firstReal = rows.findIndex((r) => r.pct >= 0.5);
    if (firstReal < 0) return [];
    const firstSure = rows.findIndex((r, i) => i >= firstReal && r.pct >= 99.5);
    return rows.slice(firstReal, firstSure < 0 ? rows.length : firstSure + 1).slice(-6);
  })();
  const projectedRow = userTeam ? winsRows.find((r) => r.wins === Math.round(userTeam.projectedWins)) : undefined;

  const hero = userTeam ? (
    <Card className="order-1 lg:order-none" data-testid="card-outlook">
      <CardContent className="pt-6 space-y-5">
        <div className="flex items-center gap-5 flex-wrap">
          <div
            className="relative w-28 h-28 rounded-full shrink-0 flex items-center justify-center"
            style={{ background: `conic-gradient(hsl(var(--primary)) ${Math.min(100, userTeam.makePlayoffsPct) * 3.6}deg, hsl(var(--muted)) 0)` }}
            aria-label={`${fmtPct(userTeam.makePlayoffsPct, 1)} chance to make the playoffs`}
          >
            <div className="w-[88px] h-[88px] rounded-full bg-card flex flex-col items-center justify-center">
              <span className={`font-heading text-2xl font-bold ${getTextColor(userTeam.makePlayoffsPct)}`}>
                {fmtPct(userTeam.makePlayoffsPct)}
              </span>
              <span className="text-[11px] text-muted-foreground">make it</span>
            </div>
          </div>
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your playoff outlook</p>
            {likelySeed && <p className="font-heading text-xl font-bold">Most likely: {ordinal(likelySeed)} seed</p>}
            <p className="text-sm text-muted-foreground">
              Projected {userTeam.projectedWins.toFixed(1)} wins
              {remainingWeeks > 0 && ` · ${remainingWeeks} game${remainingWeeks === 1 ? "" : "s"} left`}
            </p>
            <div className="flex flex-wrap gap-2">
              {userTeam.byePct !== undefined && userTeam.byePct > 0 && (
                <Badge variant="outline" className="border-chart-4/50 text-chart-4">Bye {fmtPct(userTeam.byePct)}</Badge>
              )}
              <Badge variant="outline">1 seed {fmtPct(userTeam.oneSeedPct)}</Badge>
              {me && <Badge variant="outline" className="border-primary/50 text-primary">Best {fmtPct(me.bestCasePct)}</Badge>}
              {me && <Badge variant="outline" className="border-destructive/50 text-destructive">Worst {fmtPct(me.worstCasePct)}</Badge>}
            </div>
          </div>
        </div>

        {me?.ownGame && (
          <div className="grid grid-cols-2 gap-3" data-testid="own-game">
            <div className="rounded-lg bg-primary/10 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">If you win wk {me.ownGame.week}</p>
              <p className="font-heading text-2xl font-bold text-primary">{fmtPct(me.ownGame.oddsIfWin)}</p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">If you lose</p>
              <p className="font-heading text-2xl font-bold text-destructive">{fmtPct(me.ownGame.oddsIfLose)}</p>
            </div>
          </div>
        )}

        {seedPct && seedPct.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where you finish, by seed</p>
            <div className="flex items-end gap-1 h-24" data-testid="seed-bars">
              {seedPct.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <div
                    className={`w-full rounded-t ${i < playoffTeams ? "bg-primary" : "bg-muted-foreground/40"}`}
                    style={{ height: `${p <= 0 ? 0 : Math.max(2, (p / seedMax) * 70)}px` }}
                    title={`${ordinal(i + 1)} seed: ${fmtPct(p, 1)}`}
                  />
                  <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  ) : null;

  const leverageCard = me ? (
    <Card className="order-2 lg:order-none" data-testid="card-leverage">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Games that move your odds</CardTitle>
        <CardDescription>
          {me.leverage.length > 0 ? `Week ${me.leverage[0].week}, ranked by swing` : "No other games this week"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {me.leverage.map((g) => {
          const other = g.rootFor === g.teamA ? g.teamB : g.teamA;
          const meaningful = g.swing >= 1.5;
          return (
            <div key={`${g.teamA}-${g.teamB}`} className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3" data-testid={`leverage-${g.teamA}-${g.teamB}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{nameOf(g.teamA)} vs {nameOf(g.teamB)}</p>
                <p className="text-xs text-muted-foreground">
                  {meaningful
                    ? `Your odds: ${fmtPct(g.oddsIfRootWins)} if ${nameOf(g.rootFor)} wins, ${fmtPct(g.oddsIfRootLoses)} if ${nameOf(other)} wins`
                    : "Little effect on your odds"}
                </p>
              </div>
              {meaningful && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Root for</p>
                  <p className="text-sm font-semibold max-w-[110px] truncate">{nameOf(g.rootFor)}</p>
                </div>
              )}
              <Badge
                variant="outline"
                className={`shrink-0 tabular-nums ${meaningful ? "border-primary/50 text-primary" : "text-muted-foreground"}`}
              >
                {meaningful ? `+${g.swing.toFixed(0)}%` : "—"}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  ) : null;

  const chartCard =
    outlook && chartLines.length > 0 ? (
      <Card className="order-3 lg:order-none" data-testid="card-odds-history">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Playoff odds by week</CardTitle>
          <CardDescription>Replayed from each week's results. You and the teams closest to the cut line.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {outlook.history.weeks.length > 0 ? (
            <OddsHistoryChart
              weeks={outlook.history.weeks}
              series={outlook.history.series}
              nowLabel={data.currentWeek}
              lines={chartLines}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Odds history appears after the first completed week.</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {chartLines.map((l) => (
              <span key={l.rosterId} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-[3px] rounded" style={{ background: l.color }} />
                <span className={l.emphasis ? "font-semibold" : "text-muted-foreground"}>{l.name}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    ) : null;

  const winsCard =
    winsRows.length > 0 && userTeam ? (
      <Card className="order-4 lg:order-none" data-testid="card-wins-needed">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Wins needed to make it</CardTitle>
          <CardDescription>Your chance of making the playoffs at each final win total</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {winsRows.map((r) => (
            <div key={r.wins} className="grid grid-cols-[56px_1fr_48px] items-center gap-3">
              <span className="text-sm font-medium">{r.wins} wins</span>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${getProbabilityColor(r.pct)}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
              </div>
              <span className={`text-sm font-semibold tabular-nums text-right ${getTextColor(r.pct)}`}>{fmtPct(r.pct)}</span>
            </div>
          ))}
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
            <span className="font-semibold">You are projected for {userTeam.projectedWins.toFixed(1)} wins.</span>{" "}
            {projectedRow && (
              <span className="text-muted-foreground">
                {projectedRow.wins} wins makes the field {fmtPct(projectedRow.pct)} of the time.
              </span>
            )}
          </div>
          {outlook && (
            <div className="flex items-baseline justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Last playoff seed projects to</span>
              <span className="font-heading text-lg font-bold tabular-nums">
                {outlook.cutoffWins.toFixed(1)} wins
                {outlook.cutoffWinsPrev !== null && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">was {outlook.cutoffWinsPrev.toFixed(1)}</span>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    ) : null;

  const tableCard = (
    <Card className="order-5 lg:order-none" data-testid="card-all-teams">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              All teams
            </CardTitle>
            <CardDescription className="mt-1">
              Based on {simulationCount.toLocaleString()} simulations of the real schedule
            </CardDescription>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="gap-1">
                <Info className="w-3 h-3" />
                {remainingWeeks} weeks left
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Tiebreakers: 1) Record, 2) Points Scored,</p>
              <p>3) Head-to-Head Wins</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Team</TableHead>
              <TableHead className="text-center">Rec</TableHead>
              <TableHead>Make playoffs</TableHead>
              <TableHead className="text-right">Bye</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {predictions.map((team, index) => {
              const isUser = team.ownerId === userId;
              return (
                <TableRow
                  key={team.rosterId}
                  className={isUser ? "bg-primary/5" : undefined}
                  data-testid={`row-prediction-${team.rosterId}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-full text-xs font-semibold ${getStandingsBadgeClass(team.makePlayoffsPct)}`}>
                        {index + 1}
                      </div>
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarFallback className={`text-xs ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {team.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`text-sm font-medium truncate ${isUser ? "text-primary" : ""}`}>{team.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums text-sm">{team.currentWins}-{team.currentLosses}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-24">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${getProbabilityColor(team.makePlayoffsPct)}`} style={{ width: `${Math.min(team.makePlayoffsPct, 100)}%` }} />
                      </div>
                      <span className={`text-sm font-semibold tabular-nums w-12 text-right ${getTextColor(team.makePlayoffsPct)}`}>
                        {fmtPct(team.makePlayoffsPct, 1)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {team.byePct !== undefined ? fmtPct(team.byePct) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {hero}
          {chartCard}
          {winsCard}
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {leverageCard}
          {tableCard}
        </div>
      </div>

      {/* Bubble Watch - Qualification Conditions */}
      {(() => {
        const bubbleTeams = predictions.filter(p => p.makePlayoffsPct > 0 && p.makePlayoffsPct < 100);
        const playoffCutoffTeam = predictions[playoffTeams - 1];
        const firstOutTeam = predictions[playoffTeams];
        
        if (bubbleTeams.length === 0 || remainingWeeks === 0) return null;
        
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-chart-4" />
                Bubble Watch
              </CardTitle>
              <CardDescription>
                How teams on the bubble can qualify for playoffs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bubbleTeams.map((team, idx) => {
                const standingIndex = predictions.findIndex(p => p.rosterId === team.rosterId);
                const isInPlayoffPosition = standingIndex < playoffTeams;
                const gamesBack = playoffCutoffTeam ? team.currentWins - playoffCutoffTeam.currentWins : 0;
                const gamesAhead = firstOutTeam ? team.currentWins - firstOutTeam.currentWins : 0;
                
                const conditions: { type: "positive" | "negative" | "neutral"; text: string }[] = [];
                
                const bubbleTeamsWithSameRecord = predictions.filter(
                  p => p.rosterId !== team.rosterId && 
                       p.currentWins === team.currentWins && 
                       p.currentLosses === team.currentLosses &&
                       p.makePlayoffsPct > 0 && p.makePlayoffsPct < 100
                );
                
                const pointsScenarios: { type: "positive" | "negative" | "neutral"; text: string }[] = [];
                
                // Calculate tiebreaker status among bubble teams only
                const hasHighestPointsAmongBubble = bubbleTeamsWithSameRecord.length === 0 || 
                  bubbleTeamsWithSameRecord.every(rival => team.pointsFor > rival.pointsFor);
                const teamsAheadInPoints = bubbleTeamsWithSameRecord.filter(rival => rival.pointsFor > team.pointsFor);
                
                if (isInPlayoffPosition) {
                  if (gamesAhead >= remainingWeeks) {
                    conditions.push({ type: "positive", text: `Can clinch with ${remainingWeeks - gamesAhead} more win${remainingWeeks - gamesAhead !== 1 ? 's' : ''}` });
                  } else if (gamesAhead > 0) {
                    conditions.push({ type: "positive", text: `${gamesAhead} game${gamesAhead !== 1 ? 's' : ''} ahead of ${firstOutTeam?.name || 'next team'}` });
                  } else if (gamesAhead === 0) {
                    conditions.push({ type: "neutral", text: `Tied with ${firstOutTeam?.name || 'next team'} - tiebreakers matter` });
                  }
                  
                  conditions.push({ type: "neutral", text: "Win remaining games to secure spot" });
                  
                  // Show tiebreaker status among bubble teams
                  if (bubbleTeamsWithSameRecord.length > 0) {
                    if (hasHighestPointsAmongBubble) {
                      conditions.push({ type: "positive", text: `Highest points among bubble teams at ${team.currentWins}-${team.currentLosses} - wins tiebreaker` });
                    } else {
                      const closestRival = teamsAheadInPoints.reduce((closest, rival) => 
                        (rival.pointsFor - team.pointsFor) < (closest.pointsFor - team.pointsFor) ? rival : closest
                      );
                      const pointsNeeded = closestRival.pointsFor - team.pointsFor;
                      pointsScenarios.push({ 
                        type: "negative", 
                        text: `${pointsNeeded.toFixed(1)} pts behind ${closestRival.name} (same record) - outscore to win tiebreaker` 
                      });
                    }
                  }
                } else {
                  const winsNeeded = Math.abs(gamesBack) + 1;
                  if (winsNeeded <= remainingWeeks) {
                    conditions.push({ type: "neutral", text: `Need to win ${winsNeeded}+ of remaining ${remainingWeeks} games` });
                  } else {
                    conditions.push({ type: "negative", text: `${Math.abs(gamesBack)} game${Math.abs(gamesBack) !== 1 ? 's' : ''} back - needs help` });
                  }
                  
                  // Only show bubble teams that need to lose (exclude clinched teams)
                  const bubbleTeamsToPass = predictions
                    .slice(0, playoffTeams)
                    .filter(p => p.rosterId !== team.rosterId && p.makePlayoffsPct > 0 && p.makePlayoffsPct < 100);
                  
                  if (bubbleTeamsToPass.length > 0) {
                    const teamNames = bubbleTeamsToPass.slice(0, 2).map(t => t.name);
                    const moreCount = bubbleTeamsToPass.length - 2;
                    conditions.push({ 
                      type: "neutral", 
                      text: `Need ${teamNames.join(' or ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''} to lose` 
                    });
                  }
                  
                  // Show tiebreaker status among bubble teams with same record
                  if (bubbleTeamsWithSameRecord.length > 0) {
                    if (hasHighestPointsAmongBubble) {
                      conditions.push({ type: "positive", text: `Highest points among bubble teams at ${team.currentWins}-${team.currentLosses} - wins tiebreaker` });
                    } else {
                      // Show how much they need to outscore the bubble teams ahead of them
                      teamsAheadInPoints.forEach(rival => {
                        const pointsNeeded = rival.pointsFor - team.pointsFor;
                        const rivalStandingIdx = predictions.findIndex(p => p.rosterId === rival.rosterId);
                        
                        if (rivalStandingIdx < playoffTeams) {
                          pointsScenarios.push({ 
                            type: "neutral", 
                            text: `Outscore ${rival.name} by ${pointsNeeded.toFixed(1)}+ pts to take their spot (same ${team.currentWins}-${team.currentLosses} record)` 
                          });
                        } else {
                          pointsScenarios.push({ 
                            type: "negative", 
                            text: `${pointsNeeded.toFixed(1)} pts behind ${rival.name} (same record) - outscore to win tiebreaker` 
                          });
                        }
                      });
                    }
                  }
                }
                
                return (
                  <div 
                    key={team.rosterId}
                    className={`p-4 rounded-lg border ${team.ownerId === userId ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'}`}
                    data-testid={`bubble-team-${team.rosterId}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback 
                            className={`text-xs ${team.ownerId === userId ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                          >
                            {team.initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className={`font-medium ${team.ownerId === userId ? 'text-primary' : ''}`}>
                            {team.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {team.currentWins}-{team.currentLosses} • #{standingIndex + 1} in standings
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className={getStandingsBadgeClass(team.makePlayoffsPct)}>
                          {fmtPct(team.makePlayoffsPct, 1)}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isInPlayoffPosition ? "In playoff position" : "Outside looking in"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Path to Playoffs
                        </p>
                        <ul className="space-y-1.5">
                          {conditions.map((condition, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              {condition.type === "positive" ? (
                                <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                              ) : condition.type === "negative" ? (
                                <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                              ) : (
                                <ArrowUp className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                              )}
                              <span className={condition.type === "negative" ? "text-muted-foreground" : ""}>
                                {condition.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      {pointsScenarios.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            Points Tiebreaker Scenarios
                          </p>
                          <ul className="space-y-1.5">
                            {pointsScenarios.map((scenario, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm">
                                {scenario.type === "positive" ? (
                                  <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                                ) : scenario.type === "negative" ? (
                                  <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                                ) : (
                                  <ArrowDown className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                                )}
                                <span className={scenario.type === "negative" ? "text-muted-foreground" : ""}>
                                  {scenario.text}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
