import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Swords } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RADAR_CATEGORIES,
  type HeadToHeadMeeting,
  type MatchupPreviewData,
  type PreviewTeam,
  type WeekResult,
} from "@shared/matchupPreview";

const COLOR_A = "#4FD1C5";
const COLOR_B = "#F6AD55";
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: 12,
};

interface StandingRow {
  rosterId: number;
  rank: number;
  wins: number;
  losses: number;
  ties?: number;
  pointsFor: number;
  pointsAgainst: number;
  streak?: string;
}

interface PowerRankRow {
  rosterId: number;
  currentRank: number;
  allPlayWinPct: number;
}

interface MatchupScoutingReportProps {
  leagueId: string;
  userId: string;
  userRosterId: number;
  opponentRosterId: number;
  week: number;
}

function TeamAvatar({ team, className = "w-6 h-6", color }: { team: PreviewTeam; className?: string; color?: string }) {
  return (
    <Avatar className={`${className} shrink-0`} style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}>
      {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
      <AvatarFallback className="text-[10px] bg-muted">{team.initials}</AvatarFallback>
    </Avatar>
  );
}

const fmt1 = (value: number) => value.toFixed(1);
const fmtSigned = (value: number, digits = 1) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

function SnapshotRow({
  label,
  a,
  b,
  edge,
  testId,
}: {
  label: string;
  a: string;
  b: string;
  edge: "a" | "b" | "even";
  testId: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 border-b border-border/60 last:border-0" data-testid={testId}>
      <span
        className={`text-right tabular-nums text-sm rounded-md px-2 py-1 ${edge === "a" ? "font-bold bg-[#4FD1C5]/15 text-[#4FD1C5]" : "text-muted-foreground"}`}
      >
        {a}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-24 text-center">{label}</span>
      <span
        className={`text-left tabular-nums text-sm rounded-md px-2 py-1 ${edge === "b" ? "font-bold bg-[#F6AD55]/15 text-[#F6AD55]" : "text-muted-foreground"}`}
      >
        {b}
      </span>
    </div>
  );
}

function edgeOf(a: number, b: number, higherIsBetter: boolean): "a" | "b" | "even" {
  if (Math.abs(a - b) < 1e-9) return "even";
  return (a > b) === higherIsBetter ? "a" : "b";
}

function ResultStrip({ team, results, color }: { team: PreviewTeam; results: WeekResult[]; color: string }) {
  const wins = results.filter((r) => r.result === "W").length;
  const losses = results.filter((r) => r.result === "L").length;
  const ties = results.filter((r) => r.result === "T").length;
  const avgMargin = results.length ? results.reduce((s, r) => s + r.margin, 0) / results.length : 0;

  return (
    <div className="space-y-2" data-testid={`result-strip-${team.rosterId}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <TeamAvatar team={team} className="w-6 h-6" color={color} />
        <span className="text-sm font-semibold">{team.name}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {wins}-{losses}
          {ties > 0 ? `-${ties}` : ""}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">avg margin {fmtSigned(avgMargin)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {results.map((r) => (
          <div
            key={r.week}
            title={`Week ${r.week}: ${r.points.toFixed(1)} - ${r.opponentPoints.toFixed(1)}`}
            className={`w-9 rounded-md text-center py-1 border ${
              r.result === "W"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : r.result === "L"
                  ? "bg-red-500/15 border-red-500/40 text-red-300"
                  : "bg-muted border-border text-muted-foreground"
            }`}
          >
            <div className="text-xs font-bold leading-none">{r.result}</div>
            <div className="text-[9px] opacity-70 leading-none mt-1">{r.week}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatchupScoutingReport({
  leagueId,
  userId,
  userRosterId,
  opponentRosterId,
  week,
}: MatchupScoutingReportProps) {
  const { data, isLoading, isError } = useQuery<MatchupPreviewData>({
    queryKey: ["/api/sleeper/league", leagueId, "matchup-preview", userRosterId, opponentRosterId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${leagueId}/matchup-preview?rosterIdA=${userRosterId}&rosterIdB=${opponentRosterId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch matchup preview");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: standings } = useQuery<StandingRow[]>({
    queryKey: ["/api/sleeper/league", leagueId, "standings", userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/standings?userId=${userId}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
  });

  const { data: powerRankings } = useQuery<{ teams: PowerRankRow[] }>({
    queryKey: ["/api/sleeper/league", leagueId, "power-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/power-rankings`);
      if (!res.ok) throw new Error("Failed to fetch power rankings");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const radarRows = useMemo(() => {
    if (!data) return [];
    return RADAR_CATEGORIES.map(({ key, label }) => ({
      category: label,
      a: data.radar.teamA.pctOfLeagueBest[key],
      b: data.radar.teamB.pctOfLeagueBest[key],
      aRaw: data.radar.teamA.totals[key],
      bRaw: data.radar.teamB.totals[key],
      aRank: data.radar.teamA.leagueRank[key],
      bRank: data.radar.teamB.leagueRank[key],
    }));
  }, [data]);

  const formRows = useMemo(() => {
    if (!data) return [];
    const byWeek = new Map<number, { week: number; a?: number; b?: number }>();
    data.form.teamA.forEach((r) => byWeek.set(r.week, { ...(byWeek.get(r.week) ?? { week: r.week }), a: r.margin }));
    data.form.teamB.forEach((r) => byWeek.set(r.week, { ...(byWeek.get(r.week) ?? { week: r.week }), b: r.margin }));
    let cumA = 0;
    let cumB = 0;
    return Array.from(byWeek.values())
      .sort((x, y) => x.week - y.week)
      .map((row) => {
        cumA += row.a ?? 0;
        cumB += row.b ?? 0;
        return {
          week: row.week,
          a: row.a,
          b: row.b,
          cumA: Math.round(cumA * 100) / 100,
          cumB: Math.round(cumB * 100) / 100,
        };
      });
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="scouting-loading">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Unable to load the matchup preview right now. Please try again in a moment.
        </CardContent>
      </Card>
    );
  }

  const { teamA, teamB, headToHead } = data;
  const standingA = standings?.find((s) => s.rosterId === teamA.rosterId);
  const standingB = standings?.find((s) => s.rosterId === teamB.rosterId);
  const powerA = powerRankings?.teams.find((t) => t.rosterId === teamA.rosterId);
  const powerB = powerRankings?.teams.find((t) => t.rosterId === teamB.rosterId);
  const gamesPlayed = data.radar.gamesPlayed;
  const lastWeekPlayed = data.weeks.length ? data.weeks[data.weeks.length - 1] : 0;

  const gamesOf = (s: StandingRow) => s.wins + s.losses + (s.ties ?? 0);
  const winPct = (s: StandingRow) => (gamesOf(s) ? (s.wins + (s.ties ?? 0) * 0.5) / gamesOf(s) : 0);
  const perGame = (total: number, s: StandingRow) => (gamesOf(s) ? total / gamesOf(s) : 0);

  const snapshotRows: Array<{ id: string; label: string; a: string; b: string; edge: "a" | "b" | "even" }> = [];
  if (standingA && standingB) {
    snapshotRows.push(
      {
        id: "record",
        label: "Record",
        a: `${standingA.wins}-${standingA.losses}${standingA.ties ? `-${standingA.ties}` : ""}`,
        b: `${standingB.wins}-${standingB.losses}${standingB.ties ? `-${standingB.ties}` : ""}`,
        edge: edgeOf(winPct(standingA), winPct(standingB), true),
      },
      {
        id: "standing",
        label: "Standing",
        a: `#${standingA.rank}`,
        b: `#${standingB.rank}`,
        edge: edgeOf(standingA.rank, standingB.rank, false),
      },
    );
  }
  if (powerA && powerB) {
    snapshotRows.push({
      id: "power",
      label: "Power rank",
      a: `#${powerA.currentRank} (${fmt1(powerA.allPlayWinPct)}%)`,
      b: `#${powerB.currentRank} (${fmt1(powerB.allPlayWinPct)}%)`,
      edge: edgeOf(powerA.currentRank, powerB.currentRank, false),
    });
  }
  if (standingA && standingB) {
    snapshotRows.push(
      {
        id: "pf",
        label: "Points for",
        a: standingA.pointsFor.toFixed(1),
        b: standingB.pointsFor.toFixed(1),
        edge: edgeOf(standingA.pointsFor, standingB.pointsFor, true),
      },
      {
        id: "pa",
        label: "Points against",
        a: standingA.pointsAgainst.toFixed(1),
        b: standingB.pointsAgainst.toFixed(1),
        edge: edgeOf(standingA.pointsAgainst, standingB.pointsAgainst, false),
      },
      {
        id: "pfpg",
        label: "PF / game",
        a: fmt1(perGame(standingA.pointsFor, standingA)),
        b: fmt1(perGame(standingB.pointsFor, standingB)),
        edge: edgeOf(perGame(standingA.pointsFor, standingA), perGame(standingB.pointsFor, standingB), true),
      },
      {
        id: "papg",
        label: "PA / game",
        a: fmt1(perGame(standingA.pointsAgainst, standingA)),
        b: fmt1(perGame(standingB.pointsAgainst, standingB)),
        edge: edgeOf(perGame(standingA.pointsAgainst, standingA), perGame(standingB.pointsAgainst, standingB), false),
      },
      {
        id: "diff",
        label: "Point diff",
        a: fmtSigned(standingA.pointsFor - standingA.pointsAgainst),
        b: fmtSigned(standingB.pointsFor - standingB.pointsAgainst),
        edge: edgeOf(
          standingA.pointsFor - standingA.pointsAgainst,
          standingB.pointsFor - standingB.pointsAgainst,
          true,
        ),
      },
      {
        id: "streak",
        label: "Streak",
        a: standingA.streak || "-",
        b: standingB.streak || "-",
        edge: "even",
      },
    );
  }

  const meetingLabel = (m: HeadToHeadMeeting) => `${m.season} W${m.week}`;
  const h2hChartRows = headToHead.meetings.map((m) => ({
    label: meetingLabel(m),
    diff: Math.round((m.teamAPoints - m.teamBPoints) * 100) / 100,
  }));
  const s = headToHead.summary;
  const winnerTeam = (winner: "A" | "B" | "T") => (winner === "A" ? teamA : winner === "B" ? teamB : null);

  return (
    <div className="space-y-6" data-testid="matchup-scouting-report">
      <Card className="bg-gradient-to-r from-[#4FD1C5]/10 via-transparent to-[#F6AD55]/10">
        <CardContent className="py-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <TeamAvatar team={teamA} className="w-14 h-14" color={COLOR_A} />
              <div>
                <p className="font-heading font-bold text-lg" data-testid="preview-team-a">{teamA.name}</p>
                <p className="text-xs text-muted-foreground">Your team</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Badge variant="outline" className="gap-1">
                <Swords className="w-3 h-3" />
                Week {week} Preview
              </Badge>
              <span className="text-xs text-muted-foreground">
                {gamesPlayed > 0 ? `Season stats through Week ${lastWeekPlayed}` : "No completed games yet"}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-row-reverse sm:flex-row">
              <div className="text-right">
                <p className="font-heading font-bold text-lg" data-testid="preview-team-b">{teamB.name}</p>
                <p className="text-xs text-muted-foreground">Opponent</p>
              </div>
              <TeamAvatar team={teamB} className="w-14 h-14" color={COLOR_B} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
        <Card data-testid="card-season-snapshot">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Season Snapshot</CardTitle>
            <CardDescription>The highlighted side has the edge in each category.</CardDescription>
          </CardHeader>
          <CardContent>
            {snapshotRows.length > 0 ? (
              snapshotRows.map((row) => (
                <SnapshotRow key={row.id} label={row.label} a={row.a} b={row.b} edge={row.edge} testId={`snapshot-${row.id}`} />
              ))
            ) : (
              <Skeleton className="h-64 w-full" />
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-strength-radar">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Team Strengths</CardTitle>
            <CardDescription>
              Production from started players, scaled so the league's best team is 100%. Hover for totals and league rank.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gamesPlayed === 0 ? (
              <p className="py-12 text-center text-muted-foreground">Strength data appears once games have been played.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
                <div className="h-96" data-testid="chart-radar">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarRows} outerRadius="78%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="category" tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name={teamA.name} dataKey="a" stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.3} strokeWidth={2} />
                      <Radar name={teamB.name} dataKey="b" stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.3} strokeWidth={2} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as (typeof radarRows)[number];
                          return (
                            <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md space-y-1">
                              <div className="font-semibold">{row.category}</div>
                              <div style={{ color: COLOR_A }}>
                                {teamA.name}: {row.aRaw.toLocaleString()} (#{row.aRank} of {data.leagueSize})
                              </div>
                              <div style={{ color: COLOR_B }}>
                                {teamB.name}: {row.bRaw.toLocaleString()} (#{row.bRank} of {data.leagueSize})
                              </div>
                            </div>
                          );
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-xs" data-testid="radar-table">
                  <div className="grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-1.5 items-center">
                    {radarRows.map((row) => (
                      <div key={row.category} className="contents">
                        <span className="text-right tabular-nums" style={{ color: COLOR_A }}>
                          {row.aRaw.toLocaleString()} <span className="text-muted-foreground">#{row.aRank}</span>
                        </span>
                        <span className="text-muted-foreground uppercase tracking-wider text-[10px] text-center w-20">
                          {row.category}
                        </span>
                        <span className="tabular-nums" style={{ color: COLOR_B }}>
                          {row.bRaw.toLocaleString()} <span className="text-muted-foreground">#{row.bRank}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-season-form">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-lg">Season Form</CardTitle>
          <CardDescription>Wins, losses and point differential for each team, week by week.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {formRows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No completed games yet this season.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResultStrip team={teamA} results={data.form.teamA} color={COLOR_A} />
                <ResultStrip team={teamB} results={data.form.teamB} color={COLOR_B} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Weekly point differential</p>
                  <div className="h-64" data-testid="chart-weekly-diff">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={formRows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(w) => `Week ${w}`}
                          formatter={(value: number, name: string) => [fmtSigned(value), name === "a" ? teamA.name : teamB.name]}
                        />
                        <Bar dataKey="a" name="a" fill={COLOR_A} radius={[2, 2, 0, 0]} />
                        <Bar dataKey="b" name="b" fill={COLOR_B} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cumulative point differential</p>
                  <div className="h-64" data-testid="chart-cumulative-diff">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={formRows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          labelFormatter={(w) => `Week ${w}`}
                          formatter={(value: number, name: string) => [fmtSigned(value), name === "cumA" ? teamA.name : teamB.name]}
                        />
                        <Line type="monotone" dataKey="cumA" name="cumA" stroke={COLOR_A} strokeWidth={2.5} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="cumB" name="cumB" stroke={COLOR_B} strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="card-head-to-head">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-lg">Head-to-Head History</CardTitle>
          <CardDescription>
            Regular-season meetings between these two teams ({headToHead.seasonsSearched.join(", ")}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {s.games === 0 ? (
            <p className="py-8 text-center text-muted-foreground" data-testid="h2h-empty">
              These teams haven't met in a regular-season game yet.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="h2h-summary">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Series</p>
                  <p className="text-2xl font-bold tabular-nums">
                    <span style={{ color: COLOR_A }}>{s.teamAWins}</span>
                    <span className="text-muted-foreground mx-1">-</span>
                    <span style={{ color: COLOR_B }}>{s.teamBWins}</span>
                    {s.ties > 0 && <span className="text-muted-foreground text-base ml-1">({s.ties} T)</span>}
                  </p>
                  {s.streak && (
                    <p className="text-xs text-muted-foreground">
                      {winnerTeam(s.streak.winner)?.initials} won last {s.streak.count}
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg score</p>
                  <p className="text-lg font-bold tabular-nums">
                    <span style={{ color: COLOR_A }}>{fmt1(s.teamAAvgScore)}</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span style={{ color: COLOR_B }}>{fmt1(s.teamBAvgScore)}</span>
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg margin</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: s.avgMarginForA >= 0 ? COLOR_A : COLOR_B }}>
                    {s.avgMarginForA === 0 ? "Even" : `${s.avgMarginForA > 0 ? teamA.initials : teamB.initials} by ${Math.abs(s.avgMarginForA).toFixed(1)}`}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{teamA.initials} biggest win</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: COLOR_A }}>
                    {s.teamABiggestWin ? `+${s.teamABiggestWin.margin.toFixed(1)}` : "-"}
                  </p>
                  {s.teamABiggestWin && <p className="text-xs text-muted-foreground">{meetingLabel(s.teamABiggestWin)}</p>}
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{teamB.initials} biggest win</p>
                  <p className="text-lg font-bold tabular-nums" style={{ color: COLOR_B }}>
                    {s.teamBBiggestWin ? `+${s.teamBBiggestWin.margin.toFixed(1)}` : "-"}
                  </p>
                  {s.teamBBiggestWin && <p className="text-xs text-muted-foreground">{meetingLabel(s.teamBBiggestWin)}</p>}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Margin by meeting ({teamA.initials} perspective)
                </p>
                <div className="h-56" data-testid="chart-h2h-margin">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={h2hChartRows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number) => [
                          `${value >= 0 ? teamA.name : teamB.name} by ${Math.abs(value).toFixed(2)}`,
                          "Result",
                        ]}
                      />
                      <Bar dataKey="diff" radius={[3, 3, 3, 3]}>
                        {h2hChartRows.map((row) => (
                          <Cell key={row.label} fill={row.diff >= 0 ? COLOR_A : COLOR_B} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <Table data-testid="table-h2h">
                <TableHeader>
                  <TableRow>
                    <TableHead>Season</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead>Winner</TableHead>
                    <TableHead className="text-right">{teamA.initials}</TableHead>
                    <TableHead className="text-right">{teamB.initials}</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...headToHead.meetings].reverse().map((m) => {
                    const winner = winnerTeam(m.winner);
                    return (
                      <TableRow key={`${m.season}-${m.week}`} data-testid={`h2h-row-${m.season}-${m.week}`}>
                        <TableCell className="tabular-nums">{m.season}</TableCell>
                        <TableCell className="tabular-nums">{m.week}</TableCell>
                        <TableCell>
                          {winner ? (
                            <span className="flex items-center gap-2">
                              <TeamAvatar team={winner} className="w-5 h-5" />
                              {winner.name}
                            </span>
                          ) : (
                            "Tie"
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${m.winner === "A" ? "font-bold" : "text-muted-foreground"}`}>
                          {m.teamAPoints.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${m.winner === "B" ? "font-bold" : "text-muted-foreground"}`}>
                          {m.teamBPoints.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.margin.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow data-testid="h2h-averages">
                    <TableCell colSpan={3} className="font-semibold">
                      Average ({s.games} {s.games === 1 ? "game" : "games"})
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold" style={{ color: COLOR_A }}>
                      {s.teamAAvgScore.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold" style={{ color: COLOR_B }}>
                      {s.teamBAvgScore.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {s.avgMarginForA >= 0 ? teamA.initials : teamB.initials} {Math.abs(s.avgMarginForA).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
