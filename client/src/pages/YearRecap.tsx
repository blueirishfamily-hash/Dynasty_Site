import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Trophy,
  Target,
  Zap,
  TrendingUp,
  AlertTriangle,
  Star,
  Users,
  Activity,
} from "lucide-react";

interface YearRecapData {
  powerWinVsAge: Array<{ rosterId: number; teamName: string; avatar: string | null; allPlayWinPct: number; avgAge: number; isChampion: boolean; isPlayoff: boolean }>;
  powerWinVsUniqueStarters: Array<{ rosterId: number; teamName: string; avatar?: string | null; allPlayWinPct: number; uniqueStarters: number; isChampion: boolean; isPlayoff: boolean }>;
  streaks: Array<{ rosterId: number; teamName: string; longestWinStreak: number; longestLossStreak: number }>;
  bouncebacks: Array<{ rosterId: number; teamName: string; bouncebacks: number; losses: number; bouncebackPct: number }>;
  superlativeGames: {
    highestScoring: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }>;
    lowestScoring: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }>;
    closest: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }>;
    blowouts: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }>;
  };
  biggestUpsets: Array<{ week: number; winner: string; loser: string; winnerPctAtWeek: number; loserPctAtWeek: number; upsetMargin: number; winnerScore: number; loserScore: number }>;
  managementEfficiencyVsPoints: Array<{ rosterId: number; teamName: string; avatar?: string | null; managementEfficiency: number; totalPoints: number; isChampion: boolean; isPlayoff: boolean }>;
  wrongDecisions: Array<{ rosterId: number; teamName: string; wrongDecisions: number; details: Array<{ week: number; starterName: string; starterPoints: number; benchName: string; benchPoints: number }> }>;
  peakPerformance: Record<string, Array<{ playerName: string; teamName: string; week: number; points: number; isHonorableMention: boolean }>>;
  hiddenPeaks: Array<{ playerName: string; teamName: string; week: number; points: number; position: string; wouldHaveBeenRank: number }>;
  allLeagueTeams: Array<{ team: 1 | 2; slot: string; playerName: string; position: string; avgPoints: number; teamName: string; gamesStarted: number }>;
  activityVsPower: Array<{ rosterId: number; teamName: string; avatar?: string | null; activity: number; allPlayWinPct: number; isChampion: boolean; isPlayoff: boolean }>;
  playoffGames: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }>;
  championRosterId: number | null;
  playoffTeams: number[];
}

const CHART_COLORS = {
  champion: "#FFD700",
  playoff: "#22c55e",
  nonPlayoff: "#6b7280",
};

const COMMISSIONER_USER_IDS = ["900186363130503168"];

function WrongDecisionsTable({ wrongDecisions }: { wrongDecisions: YearRecapData["wrongDecisions"] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const sorted = [...wrongDecisions].sort((a, b) => b.wrongDecisions - a.wrongDecisions);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].wrongDecisions : 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Wrong Decisions (Bench Outscored Starter)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead className="text-center">Count</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((w) => (
              <React.Fragment key={w.rosterId}>
                <TableRow>
                  <TableCell className="font-medium">{w.teamName}</TableCell>
                  <TableCell className={`text-center font-medium ${w.wrongDecisions <= median ? "text-green-600" : "text-red-600"}`}>{w.wrongDecisions}</TableCell>
                  <TableCell>
                    {w.details.length > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(expandedId === w.rosterId ? null : w.rosterId)}
                      >
                        Details {expandedId === w.rosterId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
                {expandedId === w.rosterId && w.details.slice(0, 10).map((d, i) => (
                  <TableRow key={`${w.rosterId}-${i}`}>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      Week {d.week}: Started {d.starterName} ({d.starterPoints.toFixed(1)} pts) over {d.benchName} ({d.benchPoints.toFixed(1)} pts)
                    </TableCell>
                  </TableRow>
                ))}
                {expandedId === w.rosterId && w.details.length > 10 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      ... and {w.details.length - 10} more
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs mt-2">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.champion }} />
        Champion
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.playoff }} />
        Playoff Team
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS.nonPlayoff }} />
        Non-Playoff
      </span>
    </div>
  );
}

const AVATAR_SIZE = 28;
const AVATAR_BORDER_WIDTH = 2;

function AvatarShape(props: { cx?: number; cy?: number; payload?: { avatar?: string | null; isChampion?: boolean; isPlayoff?: boolean; rosterId?: number }; chartId?: string }) {
  const { cx = 0, cy = 0, payload, chartId = "" } = props;
  const avatar = payload?.avatar;
  const isChampion = payload?.isChampion;
  const isPlayoff = payload?.isPlayoff;
  const clipId = `avatar-clip-${chartId}-${payload?.rosterId ?? 0}`;
  const r = AVATAR_SIZE / 2;
  const borderColor = isChampion ? CHART_COLORS.champion : isPlayoff ? CHART_COLORS.playoff : CHART_COLORS.nonPlayoff;
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <defs>
        <clipPath id={clipId}>
          <circle r={r} cx={0} cy={0} />
        </clipPath>
      </defs>
      {avatar ? (
        <>
          <image href={avatar} x={-r} y={-r} width={AVATAR_SIZE} height={AVATAR_SIZE} clipPath={`url(#${clipId})`} preserveAspectRatio="xMidYMid slice" />
          <circle r={r} fill="none" stroke={borderColor} strokeWidth={AVATAR_BORDER_WIDTH} />
        </>
      ) : (
        <circle r={r} fill={borderColor} />
      )}
    </g>
  );
}

function scaledDomain(values: number[], paddingPct = 0.08): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = range * paddingPct;
  return [min - pad, max + pad];
}

function ScatterChartWithLegend<T extends { isChampion?: boolean; isPlayoff?: boolean; rosterId?: number; avatar?: string | null }>({
  data,
  xKey,
  yKey,
  nameKey,
  xLabel,
  yLabel,
  title,
  showMedianLines,
  chartId,
}: {
  data: T[];
  xKey: keyof T;
  yKey: keyof T;
  nameKey: keyof T;
  xLabel: string;
  yLabel: string;
  title: string;
  showMedianLines?: boolean;
  chartId?: string;
}) {
  const chartData = data.map((d) => ({
    ...d,
    x: Number(d[xKey]),
    y: Number(d[yKey]),
    name: String(d[nameKey]),
  }));
  const xValues = chartData.map((d) => d.x).filter((v) => !Number.isNaN(v));
  const yValues = chartData.map((d) => d.y).filter((v) => !Number.isNaN(v));
  const xDomain = xValues.length ? scaledDomain(xValues) : undefined;
  const yDomain = yValues.length ? scaledDomain(yValues) : undefined;
  const xMedian = xValues.length ? xValues.slice().sort((a, b) => a - b)[Math.floor(xValues.length / 2)] : undefined;
  const yMedian = yValues.length ? yValues.slice().sort((a, b) => a - b)[Math.floor(yValues.length / 2)] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">{title}</CardTitle>
        <ChartLegend />
      </CardHeader>
      <CardContent>
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 24, bottom: 36, left: 44 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                domain={xDomain}
                tickFormatter={(v) => String(Math.round(v))}
                label={{ value: xLabel, position: "insideBottom", offset: -8 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={yDomain}
                tickFormatter={(v) => String(Math.round(v))}
                label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 0 }}
              />
              {showMedianLines && xMedian != null && <ReferenceLine x={xMedian} stroke="#94a3b8" strokeDasharray="3 3" />}
              {showMedianLines && yMedian != null && <ReferenceLine y={yMedian} stroke="#94a3b8" strokeDasharray="3 3" />}
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const p = payload[0].payload;
                  const xVal = Number(p.x);
                  const yVal = Number(p.y);
                  const xAbove = xMedian != null && xVal >= xMedian;
                  const yAbove = yMedian != null && yVal >= yMedian;
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md">
                      <p className="font-medium">{p.name}</p>
                      <p className={`text-sm ${xMedian != null ? (xAbove ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                        {xLabel}: {xVal.toFixed(1)} {xMedian != null && (xAbove ? "↑" : "↓")}
                      </p>
                      <p className={`text-sm ${yMedian != null ? (yAbove ? "text-green-600" : "text-red-600") : "text-muted-foreground"}`}>
                        {yLabel}: {yVal.toFixed(1)} {yMedian != null && (yAbove ? "↑" : "↓")}
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter data={chartData} shape={(props) => <AvatarShape {...props} chartId={chartId ?? title} />} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default function YearRecap() {
  const { user, league } = useSleeper();
  const [, setLocation] = useLocation();

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  useEffect(() => {
    if (user && league && !isCommissioner) setLocation("/");
  }, [user, league, isCommissioner, setLocation]);

  const { data, isLoading, error } = useQuery<YearRecapData>({
    queryKey: ["/api/league", league?.leagueId, "year-recap"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/year-recap`);
      if (!res.ok) throw new Error("Failed to fetch year recap");
      return res.json();
    },
    enabled: !!league?.leagueId && isCommissioner,
  });

  if (user && league && !isCommissioner) return null;

  if (!league) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">Connect your Sleeper account to view the year recap.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[320px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Unable to Load Year Recap</h2>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : "An error occurred."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <CalendarCheck className="w-8 h-8" />
          Year Recap
        </h1>
        <p className="text-muted-foreground mt-1">
          Full season stats, charts, and awards for {league.season || "the season"}
        </p>
      </div>

      <Tabs defaultValue="regular" className="space-y-6">
        <TabsList>
          <TabsTrigger value="regular">Regular Season</TabsTrigger>
          <TabsTrigger value="playoffs">Playoffs</TabsTrigger>
        </TabsList>

        <TabsContent value="regular" className="space-y-8 mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            <ScatterChartWithLegend
              data={data.powerWinVsAge}
              xKey="avgAge"
              yKey="allPlayWinPct"
              nameKey="teamName"
              xLabel="Avg Team Age"
              yLabel="Power Win %"
              title="Power Win % vs Average Team Age"
              showMedianLines
            />
            <ScatterChartWithLegend
              data={data.powerWinVsUniqueStarters}
              xKey="uniqueStarters"
              yKey="allPlayWinPct"
              nameKey="teamName"
              xLabel="Unique Starters"
              yLabel="Power Win %"
              title="Power Win % vs Unique Starters"
              showMedianLines
              chartId="power-starters"
            />
            <ScatterChartWithLegend
              data={data.managementEfficiencyVsPoints}
              xKey="totalPoints"
              yKey="managementEfficiency"
              nameKey="teamName"
              xLabel="Points Scored"
              yLabel="Management Efficiency %"
              title="Management Efficiency vs Points Scored"
              showMedianLines
              chartId="mgmt-points"
            />
            <ScatterChartWithLegend
              data={data.activityVsPower}
              xKey="activity"
              yKey="allPlayWinPct"
              nameKey="teamName"
              xLabel="Activity (Waivers + Trades)"
              yLabel="Power Win %"
              title="Activity vs Power Win %"
              showMedianLines
              chartId="activity-power"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Longest Win & Loss Streaks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">Longest Win Streak</TableHead>
                    <TableHead className="text-center">Longest Loss Streak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...data.streaks].sort((a, b) => b.longestWinStreak - a.longestWinStreak).map((s) => (
                    <TableRow key={s.rosterId}>
                      <TableCell className="font-medium">{s.teamName}</TableCell>
                      <TableCell className={`text-center font-medium ${s.longestWinStreak > 0 ? "text-green-600" : ""}`}>{s.longestWinStreak}</TableCell>
                      <TableCell className={`text-center font-medium ${s.longestLossStreak > 0 ? "text-red-600" : ""}`}>{s.longestLossStreak}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Target className="w-5 h-5" />
                Bouncebacks (Win After Loss)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-center">Bouncebacks</TableHead>
                    <TableHead className="text-center">Losses</TableHead>
                    <TableHead className="text-center">Bounceback %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const sorted = [...data.bouncebacks].sort((a, b) => b.bouncebackPct - a.bouncebackPct);
                    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].bouncebackPct : 0;
                    return sorted.map((b) => (
                      <TableRow key={b.rosterId}>
                        <TableCell className="font-medium">{b.teamName}</TableCell>
                        <TableCell className="text-center">{b.bouncebacks}</TableCell>
                        <TableCell className="text-center">{b.losses}</TableCell>
                        <TableCell className={`text-center font-medium ${b.bouncebackPct >= median ? "text-green-600" : "text-red-600"}`}>{b.bouncebackPct}%</TableCell>
                      </TableRow>
                    ));
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Highest Scoring Game
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.superlativeGames.highestScoring.map((g, i) => (
                  <div key={i} className={i === 0 ? "font-medium" : "text-sm text-muted-foreground"}>
                    <p>Week {g.week}: {g.team1} vs {g.team2}</p>
                    <p>{g.score1.toFixed(1)} - {g.score2.toFixed(1)} (Combined: {g.combined.toFixed(1)})</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Lowest Scoring Game
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.superlativeGames.lowestScoring.map((g, i) => (
                  <div key={i} className={i === 0 ? "font-medium" : "text-sm text-muted-foreground"}>
                    <p>Week {g.week}: {g.team1} vs {g.team2}</p>
                    <p>{g.score1.toFixed(1)} - {g.score2.toFixed(1)} (Combined: {g.combined.toFixed(1)})</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Closest Game</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.superlativeGames.closest.map((g, i) => (
                  <div key={i} className={i === 0 ? "font-medium" : "text-sm text-muted-foreground"}>
                    <p>Week {g.week}: {g.team1} vs {g.team2}</p>
                    <p>{g.score1.toFixed(1)} - {g.score2.toFixed(1)} (Margin: {g.margin.toFixed(1)})</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">Largest Blowout</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.superlativeGames.blowouts.map((g, i) => (
                  <div key={i} className={i === 0 ? "font-medium" : "text-sm text-muted-foreground"}>
                    <p>Week {g.week}: {g.team1} vs {g.team2}</p>
                    <p>{g.score1.toFixed(1)} - {g.score2.toFixed(1)} (Margin: {g.margin.toFixed(1)})</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Biggest Upsets
              </CardTitle>
              <CardDescription>Lower power-win team beat higher power-win team</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Winner (underdog)</TableHead>
                    <TableHead>Loser</TableHead>
                    <TableHead className="text-center">Upset Margin</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.biggestUpsets.map((u, i) => (
                    <TableRow key={i}>
                      <TableCell>{u.week}</TableCell>
                      <TableCell>{u.winner}</TableCell>
                      <TableCell>{u.loser}</TableCell>
                      <TableCell className="text-center">{u.upsetMargin}%</TableCell>
                      <TableCell className="text-center">{u.winnerScore.toFixed(1)} - {u.loserScore.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <WrongDecisionsTable wrongDecisions={data.wrongDecisions} />

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Star className="w-5 h-5" />
                Peak Performance (Best Single Week by Position)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(data.peakPerformance).map(([pos, entries]) => (
                  <div key={pos} className="rounded-lg border p-4">
                    <h4 className="font-semibold mb-2">{pos}</h4>
                    {entries.map((e, i) => (
                      <div key={i} className={`text-sm ${e.isHonorableMention ? "text-muted-foreground" : ""}`}>
                        {e.playerName} ({e.teamName}) - Week {e.week}: {e.points.toFixed(1)} pts
                        {e.isHonorableMention && " (HM)"}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Star className="w-5 h-5" />
                Hidden Peaks (Bench Would Have Been Peak)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Week</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.hiddenPeaks.slice(0, 15).map((h, i) => (
                    <TableRow key={i}>
                      <TableCell>{h.playerName}</TableCell>
                      <TableCell>{h.teamName}</TableCell>
                      <TableCell>{h.week}</TableCell>
                      <TableCell>{h.position}</TableCell>
                      <TableCell className="text-right">{h.points.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  All-League 1st Team
                </CardTitle>
                <CardDescription>By avg weekly points as starter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.allLeagueTeams.filter((a) => a.team === 1).map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium">{p.slot}:</span>
                      <span>{p.playerName} ({p.teamName}) - {p.avgPoints} avg</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  All-League 2nd Team
                </CardTitle>
                <CardDescription>By avg weekly points as starter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.allLeagueTeams.filter((a) => a.team === 2).map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-medium">{p.slot}:</span>
                      <span>{p.playerName} ({p.teamName}) - {p.avgPoints} avg</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="playoffs" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Playoff Games</CardTitle>
            </CardHeader>
            <CardContent>
              {data.playoffGames.length === 0 ? (
                <p className="text-muted-foreground">No playoff games recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Week</TableHead>
                      <TableHead>Matchup</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead className="text-center">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.playoffGames.map((g, i) => (
                      <TableRow key={i}>
                        <TableCell>{g.week}</TableCell>
                        <TableCell>{g.team1} vs {g.team2}</TableCell>
                        <TableCell className="text-center">{g.score1.toFixed(1)} - {g.score2.toFixed(1)}</TableCell>
                        <TableCell className="text-center">{g.margin.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
