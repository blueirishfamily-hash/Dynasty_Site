import React, { useState, useEffect } from "react";
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
  ReferenceArea,
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
  Ghost,
  Flame,
  Crown,
  RefreshCw,
  BarChart2,
  Swords,
  Sparkles,
  TrendingDown,
  Check,
  Medal,
  Shield,
  Sword,
  ArrowRight,
} from "lucide-react";

interface YearRecapData {
  powerWinVsAge: Array<{ rosterId: number; teamName: string; avatar: string | null; allPlayWinPct: number; avgAge: number; isChampion: boolean; isPlayoff: boolean }>;
  powerWinVsUniqueStarters: Array<{ rosterId: number; teamName: string; avatar?: string | null; allPlayWinPct: number; uniqueStarters: number; isChampion: boolean; isPlayoff: boolean }>;
  streaks: Array<{ rosterId: number; teamName: string; longestWinStreak: number; longestLossStreak: number }>;
  bouncebacks: Array<{ rosterId: number; teamName: string; bouncebacks: number; losses: number; bouncebackPct: number }>;
  superlativeGames: {
    highestScoring: Array<{ week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; score1: number; score2: number; combined: number; margin: number }>;
    lowestScoring: Array<{ week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; score1: number; score2: number; combined: number; margin: number }>;
    closest: Array<{ week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; score1: number; score2: number; combined: number; margin: number }>;
    blowouts: Array<{ week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; score1: number; score2: number; combined: number; margin: number }>;
  };
  biggestUpsets: Array<{ week: number; winner: string; loser: string; winnerPctAtWeek: number; loserPctAtWeek: number; upsetMargin: number; winnerScore: number; loserScore: number }>;
  managementEfficiencyVsPoints: Array<{ rosterId: number; teamName: string; avatar?: string | null; managementEfficiency: number; totalPoints: number; isChampion: boolean; isPlayoff: boolean }>;
  wrongDecisions: Array<{ rosterId: number; teamName: string; wrongDecisions: number; details: Array<{ week: number; starterName: string; starterPoints: number; benchName: string; benchPoints: number }> }>;
  peakPerformance: Record<string, Array<{ playerId: string; playerName: string; teamName: string; week: number; points: number; isHonorableMention: boolean }>>;
  hiddenPeaks: Array<{ playerName: string; teamName: string; week: number; points: number; position: string; wouldHaveBeenRank: number }>;
  allLeagueTeams: Array<{ team: 1 | 2 | 3; slot: string; playerId: string; playerName: string; position: string; totalPoints: number; gamesStarted: number; teamName: string }>;
  allRookieTeam: Array<{ slot: string; playerId: string; playerName: string; position: string; totalPoints: number; gamesStarted: number; teamName: string }>;
  activityVsPower: Array<{ rosterId: number; teamName: string; avatar?: string | null; activity: number; allPlayWinPct: number; isChampion: boolean; isPlayoff: boolean }>;
  playoffGames: Array<{ week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; avatar1: string | null; avatar2: string | null; score1: number; score2: number; combined: number; margin: number; winner: string; bracket: 'winners' | 'losers' | 'championship'; isChampionship: boolean; placement: number | null; isChampionshipEligibleSemifinal?: boolean }>;
  playoffWeekStart?: number;
  championRosterId: number | null;
  championName: string | null;
  championAvatar: string | null;
  championshipMvp: { playerId: string; playerName: string; points: number; position: string; teamName: string } | null;
  playoffTeams: number[];
}

interface PlayerAwardCounts {
  votedMvps: number;
  championshipMvps: number;
  allLeague: number;
  allLeague1st: number;
  allLeague2nd: number;
  allLeague3rd: number;
  rookieOfYear: number;
  allRookie: number;
}

const CHART_COLORS = {
  champion: "#FFD700",
  playoff: "#22c55e",
  nonPlayoff: "#6b7280",
};

const POSITION_COLORS: Record<string, string> = {
  QB: "from-red-500 to-red-600",
  RB: "from-blue-500 to-blue-600",
  WR: "from-emerald-500 to-emerald-600",
  TE: "from-amber-500 to-amber-600",
  K: "from-violet-500 to-violet-600",
  DEF: "from-slate-500 to-slate-600",
  FLEX: "from-slate-400 to-slate-500",
};

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


// ── TeamScatterChart ──────────────────────────────────────────────────────────
type LeaderboardEntry = {
  rosterId: number;
  teamName: string;
  avatar?: string | null;
  isChampion: boolean;
  isPlayoff: boolean;
  [key: string]: unknown;
};

function scaledDomain(values: number[], padPct = 0.12): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return [min - range * padPct, max + range * padPct];
}

function TeamScatterChart<T extends LeaderboardEntry>({
  data,
  xKey,
  yKey,
  xLabel,
  yLabel,
  title,
  subtitle,
  accentColor = "#6366f1",
  xFormat,
  yFormat,
}: {
  data: T[];
  xKey: keyof T;
  yKey: keyof T;
  xLabel: string;
  yLabel: string;
  title: string;
  subtitle: string;
  accentColor?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
}) {
  const fmtX = xFormat ?? ((v: number) => v.toFixed(1));
  const fmtY = yFormat ?? ((v: number) => v.toFixed(1));
  // Unique prefix per chart so SVG clip-path IDs don't collide across charts on the same page
  const chartKey = title.replace(/\s+/g, "-").toLowerCase();

  const chartData = data.map((team) => ({
    ...(team as object),
    _x: Number(team[xKey]),
    _y: Number(team[yKey]),
    _dotColor: team.isChampion
      ? CHART_COLORS.champion
      : team.isPlayoff
        ? CHART_COLORS.playoff
        : accentColor,
  })) as (T & { _x: number; _y: number; _dotColor: string })[];

  const xVals = chartData.map((d) => d._x).filter(Number.isFinite);
  const yVals = chartData.map((d) => d._y).filter(Number.isFinite);
  const xDomain = xVals.length ? scaledDomain(xVals) : undefined;
  const yDomain = yVals.length ? scaledDomain(yVals) : undefined;
  const xMedian = xVals.length ? [...xVals].sort((a, b) => a - b)[Math.floor(xVals.length / 2)] : undefined;
  const yMedian = yVals.length ? [...yVals].sort((a, b) => a - b)[Math.floor(yVals.length / 2)] : undefined;

  // Avatar dot rendered in SVG
  const AvatarDot = (props: { cx?: number; cy?: number; payload?: typeof chartData[0] }) => {
    const { cx = 0, cy = 0, payload } = props;
    if (!payload) return null;
    const r = 17;
    const clipId = `sc-clip-${chartKey}-${payload.rosterId}`;
    const { _dotColor } = payload;
  return (
      <g style={{ cursor: "pointer" }}>
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
        </defs>
        {/* soft glow ring */}
        <circle cx={cx} cy={cy} r={r + 5} fill={_dotColor} fillOpacity={0.15} />
        {payload.avatar ? (
          <>
            <image
              href={payload.avatar}
              x={cx - r}
              y={cy - r}
              width={r * 2}
              height={r * 2}
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
            />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={_dotColor} strokeWidth={2.5} />
          </>
        ) : (
          <circle cx={cx} cy={cy} r={r} fill={_dotColor} fillOpacity={0.85} />
        )}
      </g>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="h-1.5" style={{ background: `linear-gradient(to right, ${accentColor}ee, ${accentColor}22)` }} />
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <div className="flex flex-wrap gap-3 text-xs mt-1">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.champion }} />
            Champion
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS.playoff }} />
            Playoff
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
            Non-Playoff
          </span>
          {xMedian != null && yMedian != null && (
            <span className="text-muted-foreground ml-1">· dashed lines = median</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-2">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 24, bottom: 32, left: 16 }}>
              <defs>
                <linearGradient id={`grid-fade-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.04} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="#cbd5e1" strokeOpacity={0.35} />
              {/* Quadrant shading */}
              {xMedian != null && yMedian != null && xDomain && yDomain && (
                <>
                  <ReferenceArea x1={xMedian} x2={xDomain[1]} y1={yMedian} y2={yDomain[1]} fill="#22c55e" fillOpacity={0.06} />
                  <ReferenceArea x1={xDomain[0]} x2={xMedian} y1={yDomain[0]} y2={yMedian} fill="#ef4444" fillOpacity={0.06} />
                  <ReferenceArea x1={xDomain[0]} x2={xMedian} y1={yMedian} y2={yDomain[1]} fill="#94a3b8" fillOpacity={0.04} />
                  <ReferenceArea x1={xMedian} x2={xDomain[1]} y1={yDomain[0]} y2={yMedian} fill="#94a3b8" fillOpacity={0.04} />
                </>
              )}
              <XAxis
                type="number"
                dataKey="_x"
                domain={xDomain}
                tickFormatter={fmtX}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
                label={{ value: xLabel, position: "insideBottom", offset: -12, fontSize: 11, fill: "#64748b" }}
              />
              <YAxis
                type="number"
                dataKey="_y"
                domain={yDomain}
                tickFormatter={fmtY}
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
                width={46}
                label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 8, fontSize: 11, fill: "#64748b" }}
              />
              {xMedian != null && (
                <ReferenceLine
                  x={xMedian}
                  stroke={accentColor}
                  strokeDasharray="5 3"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                />
              )}
              {yMedian != null && (
                <ReferenceLine
                  y={yMedian}
                  stroke={accentColor}
                  strokeDasharray="5 3"
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                />
              )}
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as typeof chartData[0];
                  const xAboveMedian = xMedian != null && d._x >= xMedian;
                  const yAboveMedian = yMedian != null && d._y >= yMedian;
                  return (
                    <div
                      className="rounded-xl border-2 bg-background/95 backdrop-blur-sm p-3 shadow-2xl text-sm min-w-[160px]"
                      style={{ borderColor: d._dotColor + "88" }}
                    >
                      <div className="flex items-center gap-2 mb-2.5">
                        {d.avatar ? (
                          <img
                            src={d.avatar}
                            className="w-9 h-9 rounded-full object-cover border-2 shrink-0"
                            style={{ borderColor: d._dotColor }}
                            alt={d.teamName}
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: d._dotColor }}
                          >
                            {d.teamName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold leading-tight text-sm">{d.teamName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {d.isChampion ? "🏆 Champion" : d.isPlayoff ? "✅ Playoff" : "Regular Season"}
                      </p>
                    </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">{xLabel}</span>
                          <span className="font-semibold text-xs flex items-center gap-0.5">
                            {fmtX(d._x)}
                            <span className={xAboveMedian ? "text-green-500" : "text-red-400"}>{xAboveMedian ? " ↑" : " ↓"}</span>
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground text-xs">{yLabel}</span>
                          <span className="font-semibold text-xs flex items-center gap-0.5">
                            {fmtY(d._y)}
                            <span className={yAboveMedian ? "text-green-500" : "text-red-400"}>{yAboveMedian ? " ↑" : " ↓"}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter
                data={chartData}
                shape={(props: { cx?: number; cy?: number; payload?: typeof chartData[0] }) => <AvatarDot {...props} />}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

type NotableGame = { week: number; team1: string; team2: string; rosterId1?: number; rosterId2?: number; score1: number; score2: number; combined: number; margin: number };

function NotableGameCard({
  title,
  icon: Icon,
  games,
  statType,
  headerGradient,
  leagueId,
}: {
  title: string;
  icon: React.ElementType;
  games: NotableGame[];
  statType: "combined" | "margin";
  headerGradient: string;
  leagueId?: string;
}) {
  const [top, ...rest] = games;
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<{ team1: { name: string; starters: Array<{ playerId: string; name: string; position: string; points: number }> }; team2: { name: string; starters: Array<{ playerId: string; name: string; position: string; points: number }> } } | null>(null);
  const [loading, setLoading] = useState(false);
  const canExpand = top && top.rosterId1 != null && top.rosterId2 != null && leagueId;
  const toggleExpand = () => {
    if (!canExpand) return;
    if (expanded) {
      setExpanded(false);
      setDetails(null);
      return;
    }
    setLoading(true);
    fetch(`/api/league/${leagueId}/game-details?week=${top!.week}&rosterId1=${top!.rosterId1}&rosterId2=${top!.rosterId2}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setDetails(d); setExpanded(true); })
      .catch(() => setExpanded(false))
      .finally(() => setLoading(false));
  };
  return (
    <Card className="overflow-hidden">
      <div className={`h-1.5 ${headerGradient}`} />
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {top && (
          <div
            className={`space-y-2 ${canExpand ? "cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors" : ""}`}
            onClick={canExpand ? toggleExpand : undefined}
            role={canExpand ? "button" : undefined}
          >
            <Badge variant="secondary" className="text-xs">Week {top.week}</Badge>
            <div className="flex items-center justify-between gap-4 py-2">
              <div className="flex-1 text-right">
                <p className="font-semibold truncate">{top.team1}</p>
                <p className="text-lg font-bold text-primary">{top.score1.toFixed(1)}</p>
              </div>
              <span className="text-muted-foreground font-medium shrink-0">VS</span>
              <div className="flex-1 text-left">
                <p className="font-semibold truncate">{top.team2}</p>
                <p className="text-lg font-bold text-primary">{top.score2.toFixed(1)}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {statType === "combined" ? `Combined: ${top.combined.toFixed(1)}` : `Margin: ${top.margin.toFixed(1)}`}
            </Badge>
            {canExpand && (
              <p className="text-[10px] text-muted-foreground mt-1">Click to view player performance</p>
            )}
          </div>
        )}
        {loading && (
          <div className="text-sm text-muted-foreground animate-pulse">Loading player details...</div>
        )}
        {expanded && details && (
          <div className="border-t pt-3 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{details.team1.name}</p>
                <div className="space-y-1">
                  {details.team1.starters.map((s) => (
                    <div key={s.playerId} className="flex items-center gap-2 text-sm">
                      <Avatar className="w-6 h-6 shrink-0">
                        <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${s.playerId}.jpg`} alt={s.name} />
                        <AvatarFallback className="text-[10px]">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{s.name}</span>
                      <Badge className={`text-[10px] shrink-0 ${POS_BADGE_COLORS[s.position] || "bg-muted"}`}>{s.position}</Badge>
                      <span className="font-mono text-xs tabular-nums">{s.points.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{details.team2.name}</p>
                <div className="space-y-1">
                  {details.team2.starters.map((s) => (
                    <div key={s.playerId} className="flex items-center gap-2 text-sm">
                      <Avatar className="w-6 h-6 shrink-0">
                        <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${s.playerId}.jpg`} alt={s.name} />
                        <AvatarFallback className="text-[10px]">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate flex-1">{s.name}</span>
                      <Badge className={`text-[10px] shrink-0 ${POS_BADGE_COLORS[s.position] || "bg-muted"}`}>{s.position}</Badge>
                      <span className="font-mono text-xs tabular-nums">{s.points.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {rest.length > 0 && (
          <>
            <div className="border-t pt-3 space-y-2">
              {rest.map((g, i) => (
                <div key={i} className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Week {g.week}: {g.team1} vs {g.team2}</span>
                  <span>{g.score1.toFixed(1)} - {g.score2.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const POS_BADGE_COLORS: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-blue-600 text-white",
  WR: "bg-emerald-500 text-white",
  TE: "bg-amber-500 text-white",
  K: "bg-violet-500 text-white",
  DEF: "bg-slate-500 text-white",
  FLEX: "bg-slate-400 text-white",
  SUPER_FLEX: "bg-purple-500 text-white",
  WRRB: "bg-teal-500 text-white",
  WRRBTE: "bg-cyan-500 text-white",
};

type PeakEntry = { playerId: string; playerName: string; teamName: string; week: number; points: number; isHonorableMention: boolean };

function PeakPerformanceCard({ pos, entries }: { pos: string; entries: PeakEntry[] }) {
  const winner = entries.find((e) => !e.isHonorableMention);
  const hms = entries.filter((e) => e.isHonorableMention);
  const gradient = POSITION_COLORS[pos] || "from-slate-500 to-slate-600";
  const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="rounded-xl border overflow-hidden flex flex-col">
      <div className={`bg-gradient-to-r ${gradient} px-4 py-2 flex items-center gap-2`}>
        <span className="text-white font-bold text-sm tracking-widest">{pos}</span>
      </div>
      {winner ? (
        <div className="p-4 flex items-center gap-3 flex-1">
          <Avatar className="w-14 h-14 shrink-0 ring-2 ring-offset-1 ring-amber-400">
            <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${winner.playerId}.jpg`} alt={winner.playerName} />
            <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white text-sm font-bold`}>{initials(winner.playerName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{winner.playerName}</p>
            <p className="text-xs text-muted-foreground truncate">{winner.teamName}</p>
            <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">Wk {winner.week}</Badge>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black tabular-nums text-amber-500">{winner.points.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">pts</p>
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-muted-foreground">No data</div>
      )}
      {hms.length > 0 && (
        <div className="border-t divide-y">
          {hms.map((e, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${e.playerId}.jpg`} alt={e.playerName} />
                <AvatarFallback className={`bg-gradient-to-br ${gradient} text-white text-[10px] font-bold`}>{initials(e.playerName)}</AvatarFallback>
              </Avatar>
              <span className="text-xs flex-1 truncate text-muted-foreground">{e.playerName}</span>
              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{e.points.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AllLeaguePlayer = { team?: 1 | 2 | 3; slot: string; playerId: string; playerName: string; position: string; totalPoints: number; gamesStarted: number; teamName: string };

function AwardBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (!count) return null;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ backgroundColor: color + "22", color, border: `1px solid ${color}44` }}
    >
      {count}× {label}
    </span>
  );
}

function PlayerAwardBadges({ playerId, awards }: { playerId: string; awards: Record<string, PlayerAwardCounts> | undefined }) {
  const a = awards?.[playerId];
  if (!a) return null;
  const badges = [
    { label: "MVP", count: a.votedMvps ?? 0, color: "#f59e0b" },
    { label: "Champ MVP", count: a.championshipMvps ?? 0, color: "#a855f7" },
    { label: "1st Team", count: a.allLeague1st ?? 0, color: "#6366f1" },
    { label: "2nd Team", count: a.allLeague2nd ?? 0, color: "#6366f1" },
    { label: "3rd Team", count: a.allLeague3rd ?? 0, color: "#6366f1" },
    { label: "ROY", count: a.rookieOfYear ?? 0, color: "#10b981" },
    { label: "All-Rookie", count: a.allRookie ?? 0, color: "#0ea5e9" },
  ].filter(b => b.count > 0);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {badges.map(b => <AwardBadge key={b.label} label={b.label} count={b.count} color={b.color} />)}
    </div>
  );
}

function AllLeagueTeamCard({ players, teamNum, playerAwards }: { players: AllLeaguePlayer[]; teamNum: 1 | 2 | 3; playerAwards?: Record<string, PlayerAwardCounts> }) {
  const isFirst = teamNum === 1;
  const isSecond = teamNum === 2;
  const isThird = teamNum === 3;
  const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const headerGradient = isFirst
    ? "bg-gradient-to-r from-amber-400 to-yellow-500"
    : isSecond
      ? "bg-gradient-to-r from-slate-400 to-gray-500"
      : "bg-gradient-to-r from-amber-600 to-amber-800";
  const headerText = isFirst ? "text-amber-900" : isSecond ? "text-slate-900" : "text-amber-100";
  const medalColor = isFirst ? "text-amber-600" : isSecond ? "text-slate-500" : "text-amber-400";
  const ringClass = isFirst ? "ring-amber-300" : isSecond ? "ring-slate-300" : "ring-amber-500";
  const fallbackClass = isFirst ? "bg-amber-100 text-amber-900" : isSecond ? "bg-slate-100 text-slate-900" : "bg-amber-900/30 text-amber-100";
  const title = isFirst ? "1st Team All-League" : isSecond ? "2nd Team All-League" : "3rd Team All-League";
  return (
    <Card className="overflow-hidden">
      <div className={`${headerGradient} px-4 py-3 flex items-center gap-2`}>
        <Trophy className={`w-5 h-5 ${headerText}`} />
        <span className={`font-bold font-heading text-base ${headerText}`}>{title}</span>
      </div>
      <CardContent className="p-0">
        <div className="divide-y">
          {players.map((p, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
              <Avatar className={`w-10 h-10 shrink-0 ring-2 ${ringClass} ring-offset-1 mt-0.5`}>
                <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`} alt={p.playerName} />
                <AvatarFallback className={`text-xs font-bold ${fallbackClass}`}>{initials(p.playerName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_BADGE_COLORS[p.position] || "bg-muted text-muted-foreground"}`}>{p.slot}</span>
                  <span className="text-sm font-semibold truncate">{p.playerName}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{p.teamName}</p>
                <PlayerAwardBadges playerId={p.playerId} awards={playerAwards} />
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-sm font-bold tabular-nums ${medalColor}`}>{p.totalPoints}</span>
                <p className="text-[10px] text-muted-foreground">pts ({p.gamesStarted} wk)</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AllRookieTeamCard({ players, playerAwards }: { players: YearRecapData["allRookieTeam"]; playerAwards?: Record<string, PlayerAwardCounts> }) {
  const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3 flex items-center gap-2">
        <Star className="w-5 h-5 text-emerald-900" />
        <span className="font-bold font-heading text-base text-emerald-900">All-Rookie Team</span>
      </div>
      <CardContent className="p-0">
        <div className="divide-y">
          {players.map((p, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
              <Avatar className="w-10 h-10 shrink-0 ring-2 ring-emerald-300 ring-offset-1 mt-0.5">
                <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`} alt={p.playerName} />
                <AvatarFallback className="text-xs font-bold bg-emerald-100 text-emerald-900">{initials(p.playerName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POS_BADGE_COLORS[p.position] || "bg-muted text-muted-foreground"}`}>{p.slot}</span>
                  <span className="text-sm font-semibold truncate">{p.playerName}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{p.teamName}</p>
                <PlayerAwardBadges playerId={p.playerId} awards={playerAwards} />
              </div>
              <div className="shrink-0 text-right">
                <span className="text-sm font-bold tabular-nums text-emerald-600">{p.totalPoints}</span>
                <p className="text-[10px] text-muted-foreground">pts ({p.gamesStarted} wk)</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── StreaksGrid ─────────────────────────────────────────────────────────────
function StreaksGrid({ data }: { data: YearRecapData["streaks"] }) {
  const sorted = [...data].sort((a, b) => b.longestWinStreak - a.longestWinStreak);
  const maxWin = Math.max(...sorted.map((s) => s.longestWinStreak), 1);
  const maxLoss = Math.max(...sorted.map((s) => s.longestLossStreak), 1);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-emerald-500" />
        <h2 className="font-heading text-xl font-bold">Win &amp; Loss Streaks</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((s) => (
          <div key={s.rosterId} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <p className="font-semibold text-sm truncate">{s.teamName}</p>
            {/* Win streak bar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-0.5">
                <span className="font-medium text-emerald-600">Win Streak</span>
                <span className="font-bold text-emerald-600">{s.longestWinStreak}W</span>
              </div>
              <div className="h-5 w-full bg-emerald-100 dark:bg-emerald-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${Math.max((s.longestWinStreak / maxWin) * 100, 4)}%` }}
                >
                  {s.longestWinStreak > 0 && (
                    <span className="text-[10px] font-black text-white">{s.longestWinStreak}</span>
                  )}
                </div>
              </div>
            </div>
            {/* Loss streak bar */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-0.5">
                <span className="font-medium text-red-500">Loss Streak</span>
                <span className="font-bold text-red-500">{s.longestLossStreak}L</span>
              </div>
              <div className="h-5 w-full bg-red-100 dark:bg-red-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-400 to-red-600 rounded-full flex items-center justify-end pr-2 transition-all"
                  style={{ width: `${Math.max((s.longestLossStreak / maxLoss) * 100, 4)}%` }}
                >
                  {s.longestLossStreak > 0 && (
                    <span className="text-[10px] font-black text-white">{s.longestLossStreak}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BouncebackGrid ───────────────────────────────────────────────────────────
function BouncebackGrid({ data }: { data: YearRecapData["bouncebacks"] }) {
  const sorted = [...data].sort((a, b) => b.bouncebackPct - a.bouncebackPct);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].bouncebackPct : 0;
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-5 h-5 text-sky-500" />
        <h2 className="font-heading text-xl font-bold">Comeback Kings</h2>
        <span className="text-sm font-normal text-muted-foreground ml-1">Win rate after a loss</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((b) => {
          const pct = b.bouncebackPct;
          const isGood = pct >= median;
          const color = isGood ? "#22c55e" : "#ef4444";
          const bg = isGood ? "from-emerald-500/10 to-transparent" : "from-red-500/10 to-transparent";
          const circumference = 2 * Math.PI * 28;
          const dash = (pct / 100) * circumference;
          return (
            <div
              key={b.rosterId}
              className={`rounded-xl border border-border bg-card p-4 flex items-center gap-4 bg-gradient-to-br ${bg}`}
            >
              {/* Circular arc SVG */}
              <div className="relative flex-shrink-0 w-16 h-16">
                <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    stroke={color} strokeWidth="6"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-black tabular-nums" style={{ color }}>{pct}%</span>
                </div>
              </div>
              {/* Text */}
              <div className="min-w-0">
                <p className="font-bold text-sm truncate">{b.teamName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold" style={{ color }}>{b.bouncebacks}</span> bouncebacks
                </p>
                <p className="text-xs text-muted-foreground">{b.losses} total losses</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── UpsetCards ───────────────────────────────────────────────────────────────
function UpsetCards({ upsets }: { upsets: YearRecapData["biggestUpsets"] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h2 className="font-heading text-xl font-bold">Biggest Upsets</h2>
        <span className="text-sm font-normal text-muted-foreground ml-1">Lower power-win % team beat the favorite</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {upsets.map((u, i) => (
          <div
            key={i}
            className="relative rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Crown banner for top upset */}
            {i === 0 && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
            )}
            {/* Header stripe */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {i === 0 && <Crown className="w-4 h-4 text-yellow-300" />}
                <span className="text-xs font-black text-white tracking-wider">
                  {i === 0 ? "#1 BIGGEST UPSET" : `#${i + 1} UPSET`}
                </span>
              </div>
              <span className="text-xs text-emerald-100">Week {u.week}</span>
            </div>
            {/* VS body */}
            <div className="p-4 flex items-center gap-2">
              {/* Winner (underdog) */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Underdog Winner</p>
                <p className="font-bold text-sm truncate">{u.winner}</p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold">
                  {u.winnerPctAtWeek.toFixed(1)}% pwr
                </span>
              </div>
              {/* Center: margin */}
              <div className="flex-shrink-0 text-center px-2">
                <p className="text-2xl font-black tabular-nums text-amber-500">{u.upsetMargin}%</p>
                <p className="text-[10px] text-muted-foreground font-medium">upset margin</p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {u.winnerScore.toFixed(1)}–{u.loserScore.toFixed(1)}
                </p>
              </div>
              {/* Loser (favorite) */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-0.5">Favorite Loser</p>
                <p className="font-bold text-sm truncate">{u.loser}</p>
                <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 font-semibold">
                  {u.loserPctAtWeek.toFixed(1)}% pwr
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WrongDecisionsCards ──────────────────────────────────────────────────────
function WrongDecisionsCards({ wrongDecisions }: { wrongDecisions: YearRecapData["wrongDecisions"] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const sorted = [...wrongDecisions].sort((a, b) => b.wrongDecisions - a.wrongDecisions);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)].wrongDecisions : 0;
  const max = sorted.length ? sorted[0].wrongDecisions : 1;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <BarChart2 className="w-5 h-5 text-red-500" />
        <h2 className="font-heading text-xl font-bold">Wrong Decisions</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Times a bench player outscored a starter that week</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((w) => {
          const isExpanded = expandedId === w.rosterId;
          const isAboveMedian = w.wrongDecisions > median;
          const barPct = max > 0 ? (w.wrongDecisions / max) * 100 : 0;
          const color = isAboveMedian ? "#ef4444" : "#22c55e";
          return (
            <div
              key={w.rosterId}
              className="rounded-xl border border-border bg-card overflow-hidden cursor-pointer select-none"
              onClick={() => w.details.length > 0 && setExpandedId(isExpanded ? null : w.rosterId)}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="font-bold text-sm truncate flex-1">{w.teamName}</p>
                  <span className="text-2xl font-black tabular-nums leading-none" style={{ color }}>
                    {w.wrongDecisions}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barPct}%`, backgroundColor: color }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {isAboveMedian ? "Above average" : "Below average"}
                  </span>
                  {w.details.length > 0 && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      Details
                    </span>
                  )}
                </div>
              </div>
              {/* Expandable details */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1.5">
                  {w.details.slice(0, 10).map((d, di) => (
                    <div key={di} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Wk {d.week}:</span>{" "}
                      Started <span className="text-red-500">{d.starterName}</span> ({d.starterPoints.toFixed(1)} pts) over{" "}
                      <span className="text-emerald-600">{d.benchName}</span> ({d.benchPoints.toFixed(1)} pts)
                    </div>
                  ))}
                  {w.details.length > 10 && (
                    <p className="text-xs text-muted-foreground italic">…and {w.details.length - 10} more</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Position border color map for Hidden Peaks cards
const POS_BORDER_COLORS: Record<string, string> = {
  QB: "border-l-red-500",
  RB: "border-l-blue-600",
  WR: "border-l-emerald-500",
  TE: "border-l-amber-500",
  K: "border-l-violet-500",
  DEF: "border-l-slate-500",
};

// Inline CSS color used for gradient & text tinting (can't use Tailwind dynamic classes)
const POS_HEX: Record<string, string> = {
  QB: "#ef4444",
  RB: "#2563eb",
  WR: "#10b981",
  TE: "#f59e0b",
  K: "#8b5cf6",
  DEF: "#64748b",
};

const RANK_LABELS: Record<number, string> = { 1: "#1", 2: "#2", 3: "#3" };

function HiddenPeaksGrid({ peaks }: { peaks: YearRecapData["hiddenPeaks"] }) {
  const displayed = peaks.slice(0, 15);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {displayed.map((h, i) => {
        const color = POS_HEX[h.position] || "#6b7280";
        const borderClass = POS_BORDER_COLORS[h.position] || "border-l-slate-400";
        const badgeClass = POS_BADGE_COLORS[h.position] || "bg-muted text-muted-foreground";
        const rankLabel = RANK_LABELS[h.wouldHaveBeenRank] ?? `#${h.wouldHaveBeenRank}`;
        return (
          <div
            key={i}
            className={`relative overflow-hidden rounded-xl border border-border border-l-4 ${borderClass} bg-card`}
            style={{ background: `radial-gradient(ellipse at top right, ${color}18 0%, transparent 70%)` }}
          >
            {/* BENCHED ribbon */}
            <div
              className="absolute top-3 right-[-22px] rotate-45 text-[9px] font-black tracking-widest px-6 py-0.5 text-white"
              style={{ backgroundColor: color }}
            >
              BENCHED
            </div>

            <div className="p-4 flex flex-col gap-2">
              {/* Top row: position badge + week */}
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeClass}`}>{h.position}</span>
                <span className="text-[10px] text-muted-foreground font-medium ml-auto">Week {h.week}</span>
              </div>

              {/* Player name */}
              <p className="font-bold text-base leading-tight truncate pr-6">{h.playerName}</p>
              <p className="text-xs text-muted-foreground truncate">{h.teamName}</p>

              {/* Points big display */}
              <div className="flex items-end justify-between mt-1">
                <div className="flex items-center gap-1">
                  <Flame className="w-5 h-5" style={{ color }} />
                  <span className="text-3xl font-black tabular-nums leading-none" style={{ color }}>
                    {h.points.toFixed(1)}
                  </span>
                  <span className="text-sm text-muted-foreground mb-0.5">pts</span>
                </div>

                {/* Would've been rank */}
                <div
                  className="text-right"
                  title={`Would have been the ${rankLabel} scorer`}
                >
                  <span
                    className="text-lg font-black tabular-nums"
                    style={{ color }}
                  >
                    {rankLabel}
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-tight">overall</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── Playoff Components ────────────────────────────────────────────────────────

type PlayoffGame = YearRecapData["playoffGames"][0];

function TeamAvatar({
  src,
  name,
  size = 32,
  borderColor = "#6b7280",
}: {
  src?: string | null;
  name: string;
  size?: number;
  borderColor?: string;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, border: `2px solid ${borderColor}` }}
      />
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, backgroundColor: borderColor, fontSize: size * 0.3 }}
    >
      {initials}
    </div>
  );
}

function ChampionSpotlight({
  championName,
  championAvatar,
  playoffGames,
}: {
  championName: string | null;
  championAvatar: string | null;
  playoffGames: PlayoffGame[];
}) {
  if (!championName) return null;

  // Derive champion playoff record + total points from playoffGames
  let wins = 0, losses = 0, totalPts = 0;
  playoffGames.forEach((g) => {
    const isTeam1 = g.team1 === championName;
    const isTeam2 = g.team2 === championName;
    if (!isTeam1 && !isTeam2) return;
    const champScore = isTeam1 ? g.score1 : g.score2;
    totalPts += champScore;
    if (g.winner === championName) wins++; else losses++;
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 p-6 md:p-8" style={{ borderColor: "#FFD700aa", background: "linear-gradient(135deg, #1a1200 0%, #2d1f00 40%, #1a1200 100%)" }}>
      {/* Background shimmer */}
      <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse at 30% 50%, #FFD700 0%, transparent 60%)" }} />
      <div className="absolute inset-0 opacity-10" style={{ background: "radial-gradient(ellipse at 80% 20%, #FFF8DC 0%, transparent 50%)" }} />

      <div className="relative flex flex-col md:flex-row items-center md:items-start gap-6">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full blur-xl opacity-60" style={{ backgroundColor: "#FFD700", transform: "scale(1.2)" }} />
          <TeamAvatar src={championAvatar} name={championName} size={96} borderColor="#FFD700" />
          <div className="absolute -bottom-1 -right-1 rounded-full p-1.5" style={{ backgroundColor: "#FFD700" }}>
            <Trophy className="w-4 h-4 text-yellow-900" />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-center md:text-left">
          <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: "#FFD700aa" }}>
            League Champion
          </p>
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4" style={{ color: "#FFD700" }}>
            {championName}
          </h2>
          <div className="flex flex-wrap justify-center md:justify-start gap-4">
            <div className="rounded-xl px-4 py-2 text-center" style={{ backgroundColor: "#FFD70022", border: "1px solid #FFD70044" }}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#FFD700aa" }}>Playoff Record</p>
              <p className="text-xl font-bold" style={{ color: "#FFD700" }}>{wins}–{losses}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center" style={{ backgroundColor: "#FFD70022", border: "1px solid #FFD70044" }}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#FFD700aa" }}>Playoff Points</p>
              <p className="text-xl font-bold" style={{ color: "#FFD700" }}>{totalPts.toFixed(1)}</p>
            </div>
            <div className="rounded-xl px-4 py-2 text-center" style={{ backgroundColor: "#FFD70022", border: "1px solid #FFD70044" }}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#FFD700aa" }}>Avg / Game</p>
              <p className="text-xl font-bold" style={{ color: "#FFD700" }}>
                {wins + losses > 0 ? (totalPts / (wins + losses)).toFixed(1) : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Confetti crown accent */}
        <Crown className="hidden md:block w-16 h-16 opacity-10 shrink-0 self-center" style={{ color: "#FFD700" }} />
      </div>
    </div>
  );
}

function PlayoffMatchupCard({ game, championName, leagueId, isLosers }: { game: PlayoffGame; championName: string | null; leagueId?: string; isLosers?: boolean }) {
  const team1Won = game.winner === game.team1;
  const team2Won = game.winner === game.team2;
  const champColor = "#FFD700";
  const winColor = "#22c55e";
  const isChampionship = game.isChampionship;
  const losers = isLosers ?? game.bracket === "losers";
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<{ team1: { name: string; starters: Array<{ playerId: string; name: string; position: string; points: number }> }; team2: { name: string; starters: Array<{ playerId: string; name: string; position: string; points: number }> } } | null>(null);
  const [loading, setLoading] = useState(false);
  const canExpand = !losers && game.rosterId1 != null && game.rosterId2 != null && leagueId;
  const toggleExpand = () => {
    if (!canExpand) return;
    if (expanded) {
      setExpanded(false);
      setDetails(null);
      return;
    }
    setLoading(true);
    fetch(`/api/league/${leagueId}/game-details?week=${game.week}&rosterId1=${game.rosterId1}&rosterId2=${game.rosterId2}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setDetails(d); setExpanded(true); })
      .catch(() => setExpanded(false))
      .finally(() => setLoading(false));
  };

  const winnerBorderColor = (teamName: string) =>
    isChampionship && teamName === championName ? champColor : winColor;

  return (
    <div
      className={`rounded-xl overflow-hidden border`}
      style={
        isChampionship
          ? { background: "linear-gradient(135deg, #1a1200, #0d0d0d)", borderColor: "#FFD70044" }
          : losers
            ? { borderColor: "#f9731633" }
            : {}
      }
    >
      {/* Championship glow stripe */}
      {isChampionship && <div className="h-0.5" style={{ background: "linear-gradient(to right, #FFD700, #FFD70022)" }} />}
      {/* Losers bracket label */}
      {losers && (
        <div className="px-3 py-1 text-[9px] uppercase tracking-widest font-semibold" style={{ color: "#f97316aa", backgroundColor: "#f9731611" }}>
          Consolation
        </div>
      )}

      <div
        className={canExpand ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
        onClick={canExpand ? toggleExpand : undefined}
        role={canExpand ? "button" : undefined}
      >
        {/* Team 1 */}
        <div className={`flex items-center gap-3 px-4 py-3 ${team1Won ? (isChampionship && game.team1 === championName ? "bg-yellow-500/10" : "bg-green-500/8") : ""}`}>
          <TeamAvatar src={game.avatar1} name={game.team1} size={32}
            borderColor={team1Won ? winnerBorderColor(game.team1) : "#4b5563"} />
          <span className={`flex-1 text-sm font-medium truncate ${!team1Won ? "opacity-60" : ""}`}>{game.team1}</span>
          <span
            className={`text-sm font-bold tabular-nums ${!team1Won ? "text-muted-foreground" : ""}`}
            style={team1Won ? { color: winnerBorderColor(game.team1) } : {}}
          >
            {game.score1.toFixed(1)}
          </span>
          {team1Won && (
            isChampionship && game.team1 === championName
              ? <Trophy className="w-4 h-4 shrink-0" style={{ color: champColor }} />
              : <Check className="w-4 h-4 shrink-0" style={{ color: winColor }} />
          )}
        </div>

        <div className="h-px bg-border/50 mx-4" />

        {/* Team 2 */}
        <div className={`flex items-center gap-3 px-4 py-3 ${team2Won ? (isChampionship && game.team2 === championName ? "bg-yellow-500/10" : "bg-green-500/8") : ""}`}>
          <TeamAvatar src={game.avatar2} name={game.team2} size={32}
            borderColor={team2Won ? winnerBorderColor(game.team2) : "#4b5563"} />
          <span className={`flex-1 text-sm font-medium truncate ${!team2Won ? "opacity-60" : ""}`}>{game.team2}</span>
          <span
            className={`text-sm font-bold tabular-nums ${!team2Won ? "text-muted-foreground" : ""}`}
            style={team2Won ? { color: winnerBorderColor(game.team2) } : {}}
          >
            {game.score2.toFixed(1)}
          </span>
          {team2Won && (
            isChampionship && game.team2 === championName
              ? <Trophy className="w-4 h-4 shrink-0" style={{ color: champColor }} />
              : <Check className="w-4 h-4 shrink-0" style={{ color: winColor }} />
          )}
        </div>

        <div className="px-4 py-1.5 bg-muted/30 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Margin</span>
          <span className="text-[10px] font-semibold text-muted-foreground">{game.margin.toFixed(1)} pts</span>
          {canExpand && <span className="text-[10px] text-muted-foreground">Click for player details</span>}
        </div>
      </div>

      {loading && (
        <div className="px-4 py-2 text-sm text-muted-foreground animate-pulse">Loading player details...</div>
      )}
      {expanded && details && (
        <div className="border-t border-border/50 px-4 py-3 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{details.team1.name}</p>
              <div className="space-y-1">
                {details.team1.starters.map((s) => (
                  <div key={s.playerId} className="flex items-center gap-2 text-sm">
                    <Avatar className="w-6 h-6 shrink-0">
                      <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${s.playerId}.jpg`} alt={s.name} />
                      <AvatarFallback className="text-[10px]">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate flex-1">{s.name}</span>
                    <Badge className={`text-[10px] shrink-0 ${POS_BADGE_COLORS[s.position] || "bg-muted"}`}>{s.position}</Badge>
                    <span className="font-mono text-xs tabular-nums">{s.points.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{details.team2.name}</p>
              <div className="space-y-1">
                {details.team2.starters.map((s) => (
                  <div key={s.playerId} className="flex items-center gap-2 text-sm">
                    <Avatar className="w-6 h-6 shrink-0">
                      <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${s.playerId}.jpg`} alt={s.name} />
                      <AvatarFallback className="text-[10px]">{s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate flex-1">{s.name}</span>
                    <Badge className={`text-[10px] shrink-0 ${POS_BADGE_COLORS[s.position] || "bg-muted"}`}>{s.position}</Badge>
                    <span className="font-mono text-xs tabular-nums">{s.points.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const WINNERS_ROUND_ACCENT: Record<string, string> = {
  Championship: "#FFD700",
  "Championship Week": "#FFD700",
  Semifinals: "#8b5cf6",
  Quarterfinals: "#0ea5e9",
};

function PlayoffBracketSection({
  games,
  championName,
  sectionTitle,
  sectionAccent,
  isLosers = false,
  playoffWeekStart = 15,
  leagueId,
}: {
  games: PlayoffGame[];
  championName: string | null;
  sectionTitle: string;
  sectionAccent: string;
  isLosers?: boolean;
  playoffWeekStart?: number;
  leagueId?: string;
}) {
  const byWeek = new Map<number, PlayoffGame[]>();
  games.forEach((g) => {
    if (!byWeek.has(g.week)) byWeek.set(g.week, []);
    byWeek.get(g.week)!.push(g);
  });
  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);

  // Week-based column label: Quarterfinals / Semifinals / Championship Week (winners) or Consolation (losers)
  function weekColumnLabel(week: number): string {
    if (isLosers) return "Consolation";
    const weekIndex = week - playoffWeekStart;
    if (weekIndex === 0) return "Quarterfinals";
    if (weekIndex === 1) return "Semifinals";
    return "Championship Week";
  }

  // Per-game label: Semifinals (Semifinal 1/2), Championship Week (Championship Game), Consolation (3rd/5th/7th Place Game)
  const semifinalsWeek = playoffWeekStart + 1;
  const championshipWeek = playoffWeekStart + 2;
  function gameLabel(game: PlayoffGame, week: number, gameIndex: number, championshipEligibleSemifinalsInWeek: PlayoffGame[]): string | null {
    // Semifinals week: Semifinal 1, Semifinal 2, or Playoff Game
    if (week === semifinalsWeek) {
      if (!game.isChampionshipEligibleSemifinal) return "Playoff Game";
      const idx = championshipEligibleSemifinalsInWeek.findIndex(g => g === game);
      if (idx === 0) return "Semifinal 1";
      if (idx === 1) return "Semifinal 2";
      return null;
    }
    // Championship Week (winners): Championship Game
    if (week === championshipWeek && !isLosers && (game.isChampionship || game.placement === 1)) {
      return "Championship Game";
    }
    // Placement games (3rd, 5th, 7th) - label regardless of winners vs losers section (Sleeper may put them in either bracket). Omit 3rd place label in consolation.
    if (game.placement != null) {
      if (game.placement === 3 && !isLosers) return "3rd Place Game";
      if (game.placement === 5) return "5th Place Game";
      if (game.placement === 7) return "7th Place Game";
    }
    return null;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {isLosers ? <Swords className="w-4 h-4" style={{ color: sectionAccent }} /> : <Shield className="w-4 h-4" style={{ color: sectionAccent }} />}
        <h4 className="font-heading text-base font-bold" style={{ color: sectionAccent }}>{sectionTitle}</h4>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {weeks.map((week) => {
          const weekGames = byWeek.get(week)!;
          const colLabel = weekColumnLabel(week);
          const isChampWeek = weekGames.some(g => g.isChampionship);
          const accent = isChampWeek ? WINNERS_ROUND_ACCENT["Championship"]
            : isLosers ? "#f97316"
            : (WINNERS_ROUND_ACCENT[colLabel] ?? "#6366f1");

          const championshipEligibleSemifinalsInWeek = weekGames.filter(g => g.isChampionshipEligibleSemifinal === true);

          return (
            <div key={week} className="flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-1 rounded-full" style={{ backgroundColor: accent }} />
                <span className="font-heading text-sm font-bold tracking-wide" style={{ color: accent }}>{colLabel}</span>
                <span className="text-xs text-muted-foreground">· Wk {week}</span>
                {isChampWeek && <Trophy className="w-3.5 h-3.5 ml-auto" style={{ color: accent }} />}
              </div>
              <div className="space-y-3 flex-1">
                {weekGames.map((game, gi) => {
                  const label = gameLabel(game, week, gi, championshipEligibleSemifinalsInWeek);
                  return (
                    <div key={gi}>
                      {label && (
                        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: accent }}>{label}</p>
                      )}
                      <PlayoffMatchupCard game={game} championName={championName} leagueId={leagueId} isLosers={isLosers} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayoffBracket({ playoffGames, championName, playoffWeekStart = 15, leagueId }: { playoffGames: PlayoffGame[]; championName: string | null; playoffWeekStart?: number; leagueId?: string }) {
  if (playoffGames.length === 0) return null;

  const winnerGames = playoffGames.filter(g => g.bracket === "winners" || g.bracket === "championship");
  const loserGames = playoffGames.filter(g => g.bracket === "losers");

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-heading text-xl font-bold">Playoff Bracket</h3>
      </div>

      <PlayoffBracketSection
        games={winnerGames}
        championName={championName}
        sectionTitle="Winners Bracket"
        sectionAccent="#FFD700"
        isLosers={false}
        playoffWeekStart={playoffWeekStart}
        leagueId={leagueId}
      />

      {loserGames.length > 0 && (
        <>
          <div className="border-t border-border/50 pt-6">
            <PlayoffBracketSection
              games={loserGames}
              championName={championName}
              sectionTitle="Consolation Bracket"
              sectionAccent="#f97316"
              isLosers={true}
              playoffWeekStart={playoffWeekStart}
              leagueId={leagueId}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ChampionshipMvpCard({ mvp }: { mvp: YearRecapData["championshipMvp"] }) {
  if (!mvp) return null;
  const playerPhotoUrl = `https://sleepercdn.com/content/nfl/players/${mvp.playerId}.jpg`;
  const posColors: Record<string, string> = { QB: "#ef4444", RB: "#3b82f6", WR: "#22c55e", TE: "#f59e0b", K: "#8b5cf6" };
  const accent = posColors[mvp.position] ?? "#a855f7";

  return (
    <Card className="overflow-hidden" style={{ borderColor: "#a855f733" }}>
      <div className="h-1" style={{ backgroundColor: "#a855f7" }} />
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={playerPhotoUrl}
              alt={mvp.playerName}
              className="w-16 h-16 rounded-full object-cover object-top"
              style={{ border: "2px solid #a855f7" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div className="absolute -bottom-1 -right-1 rounded-full p-1" style={{ backgroundColor: "#a855f7" }}>
              <Star className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: "#a855f7aa" }}>Championship MVP</p>
            <p className="text-xl font-bold leading-tight truncate">{mvp.playerName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-semibold px-1.5 py-0.5 rounded mr-1.5" style={{ backgroundColor: accent + "22", color: accent }}>{mvp.position}</span>
              {mvp.teamName} · <span className="font-semibold" style={{ color: accent }}>{mvp.points} pts</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const STAT_CARDS = [
  {
    id: "highScore",
    label: "Highest Score",
    icon: Zap,
    accent: "#f97316",
    compute: (games: PlayoffGame[]) => {
      const best = [...games].sort((a, b) => Math.max(b.score1, b.score2) - Math.max(a.score1, a.score2))[0];
      if (!best) return null;
      const isT1 = best.score1 >= best.score2;
      return {
        headline: (isT1 ? best.score1 : best.score2).toFixed(1),
        sub: `${isT1 ? best.team1 : best.team2} · Wk ${best.week}`,
        avatar: isT1 ? best.avatar1 : best.avatar2,
      };
    },
  },
  {
    id: "closest",
    label: "Closest Game",
    icon: Target,
    accent: "#8b5cf6",
    compute: (games: PlayoffGame[]) => {
      const best = [...games].sort((a, b) => a.margin - b.margin)[0];
      if (!best) return null;
      return {
        headline: `${best.margin.toFixed(1)} pts`,
        sub: `${best.team1} vs ${best.team2} · Wk ${best.week}`,
        avatar: best.avatar1,
      };
    },
  },
  {
    id: "blowout",
    label: "Biggest Blowout",
    icon: Sword,
    accent: "#ef4444",
    compute: (games: PlayoffGame[]) => {
      const best = [...games].sort((a, b) => b.margin - a.margin)[0];
      if (!best) return null;
      return {
        headline: `${best.margin.toFixed(1)} pts`,
        sub: `${best.winner} crushed · Wk ${best.week}`,
        avatar: best.winner === best.team1 ? best.avatar1 : best.avatar2,
      };
    },
  },
  {
    id: "combined",
    label: "Highest Scoring",
    icon: TrendingUp,
    accent: "#10b981",
    compute: (games: PlayoffGame[]) => {
      const best = [...games].sort((a, b) => b.combined - a.combined)[0];
      if (!best) return null;
      return {
        headline: `${best.combined.toFixed(1)} pts`,
        sub: `${best.team1} vs ${best.team2} · Wk ${best.week}`,
        avatar: best.avatar1,
      };
    },
  },
] as const;

function PlayoffStatCards({ playoffGames }: { playoffGames: PlayoffGame[] }) {
  if (playoffGames.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-heading text-xl font-bold">Playoff Highlights</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map(({ id, label, icon: Icon, accent, compute }) => {
          const result = compute(playoffGames);
          if (!result) return null;
          return (
            <Card key={id} className="overflow-hidden">
              <div className="h-1" style={{ backgroundColor: accent }} />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="rounded-lg p-2" style={{ backgroundColor: accent + "22" }}>
                    <Icon className="w-4 h-4" style={{ color: accent }} />
                  </div>
                  {result.avatar && (
                    <TeamAvatar src={result.avatar} name={result.sub} size={28} borderColor={accent} />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: accent }}>{result.headline}</p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{result.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function PlayoffTeamSummary({ playoffGames, championName }: { playoffGames: PlayoffGame[]; championName: string | null }) {
  if (playoffGames.length === 0) return null;

  // Build per-team stats
  const teamMap = new Map<string, { wins: number; losses: number; pts: number; avatar: string | null }>();
  playoffGames.forEach((g) => {
    [
      { name: g.team1, score: g.score1, avatar: g.avatar1 },
      { name: g.team2, score: g.score2, avatar: g.avatar2 },
    ].forEach(({ name, score, avatar }) => {
      if (!teamMap.has(name)) teamMap.set(name, { wins: 0, losses: 0, pts: 0, avatar });
      const t = teamMap.get(name)!;
      t.pts += score;
      if (g.winner === name) t.wins++; else t.losses++;
    });
  });

  const sorted = Array.from(teamMap.entries()).sort((a, b) => b[1].wins - a[1].wins || b[1].pts - a[1].pts);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Medal className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-heading text-xl font-bold">Team Performance</h3>
      </div>
      <Card>
        <CardContent className="pt-4 pb-2">
          <div className="space-y-2">
            {sorted.map(([name, stats], i) => {
              const isChamp = name === championName;
              const borderColor = isChamp ? "#FFD700" : stats.wins > stats.losses ? "#22c55e" : "#6b7280";
              return (
                <div
                  key={name}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isChamp ? "bg-yellow-500/8" : "bg-muted/30"}`}
                  style={isChamp ? { border: "1px solid #FFD70033" } : {}}
                >
                  <span className="text-xs text-muted-foreground w-4 shrink-0 text-right">{i + 1}</span>
                  <TeamAvatar src={stats.avatar} name={name} size={30} borderColor={borderColor} />
                  <span className="flex-1 text-sm font-medium truncate">{name}</span>
                  {isChamp && <Trophy className="w-4 h-4 shrink-0" style={{ color: "#FFD700" }} />}
                  <span className="text-xs font-semibold tabular-nums" style={{ color: borderColor }}>
                    {stats.wins}–{stats.losses}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                    {stats.pts.toFixed(1)} pts
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function YearRecap() {
  const { league } = useSleeper();

  const { data, isLoading, error } = useQuery<YearRecapData>({
    queryKey: ["/api/league", league?.leagueId, "year-recap"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/year-recap`);
      if (!res.ok) throw new Error("Failed to fetch year recap");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: playerAwards } = useQuery<Record<string, PlayerAwardCounts>>({
    queryKey: ["/api/league", league?.leagueId, "player-awards"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/player-awards`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 1000 * 60 * 10, // cache for 10 minutes — endpoint is slow
  });

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
            <TeamScatterChart
              data={data.powerWinVsAge}
              xKey="avgAge"
              yKey="allPlayWinPct"
              xLabel="Avg Roster Age"
              yLabel="Power Win %"
              title="Power Rankings"
              subtitle="All-play win % vs avg roster age (lower age = better)"
              accentColor="#8b5cf6"
              xFormat={(v) => `${v.toFixed(1)} yrs`}
              yFormat={(v) => `${v.toFixed(1)}%`}
            />
            <TeamScatterChart
              data={data.powerWinVsUniqueStarters}
              xKey="uniqueStarters"
              yKey="allPlayWinPct"
              xLabel="Unique Starters"
              yLabel="Power Win %"
              title="Roster Depth"
              subtitle="Power win % vs number of unique starters used"
              accentColor="#0ea5e9"
              xFormat={(v) => String(Math.round(v))}
              yFormat={(v) => `${v.toFixed(1)}%`}
            />
            <TeamScatterChart
              data={data.managementEfficiencyVsPoints}
              xKey="totalPoints"
              yKey="managementEfficiency"
              xLabel="Total Points"
              yLabel="Mgmt Efficiency %"
              title="Scoring & Efficiency"
              subtitle="Total points scored vs lineup management efficiency"
              accentColor="#ef4444"
              xFormat={(v) => String(Math.round(v))}
              yFormat={(v) => `${v.toFixed(1)}%`}
            />
            <TeamScatterChart
              data={data.activityVsPower}
              xKey="activity"
              yKey="allPlayWinPct"
              xLabel="Roster Moves"
              yLabel="Power Win %"
              title="Activity vs Results"
              subtitle="Power win % vs roster moves (waivers + trades)"
              accentColor="#f97316"
              xFormat={(v) => String(Math.round(v))}
              yFormat={(v) => `${v.toFixed(1)}%`}
            />
          </div>

          <StreaksGrid data={data.streaks} />

          <BouncebackGrid data={data.bouncebacks} />

          <div className="grid gap-6 md:grid-cols-2">
            <NotableGameCard
              title="Highest Scoring Game"
              icon={Zap}
              games={data.superlativeGames.highestScoring}
              statType="combined"
              headerGradient="bg-gradient-to-r from-amber-500 to-orange-600"
              leagueId={league?.leagueId}
            />
            <NotableGameCard
              title="Lowest Scoring Game"
              icon={Zap}
              games={data.superlativeGames.lowestScoring}
              statType="combined"
              headerGradient="bg-gradient-to-r from-slate-500 to-blue-600"
              leagueId={league?.leagueId}
            />
            <NotableGameCard
              title="Closest Game"
              icon={Target}
              games={data.superlativeGames.closest}
              statType="margin"
              headerGradient="bg-gradient-to-r from-violet-500 to-purple-600"
              leagueId={league?.leagueId}
            />
            <NotableGameCard
              title="Largest Blowout"
              icon={Zap}
              games={data.superlativeGames.blowouts}
              statType="margin"
              headerGradient="bg-gradient-to-r from-red-500 to-rose-600"
              leagueId={league?.leagueId}
            />
          </div>

          <UpsetCards upsets={data.biggestUpsets} />

          <WrongDecisionsCards wrongDecisions={data.wrongDecisions} />

          <div>
            <h2 className="font-heading text-xl font-bold flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-amber-500" />
              Peak Performance
              <span className="text-sm font-normal text-muted-foreground ml-1">Best single-week score by position</span>
            </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.peakPerformance)
                .filter(([pos]) => ["QB", "RB", "WR", "TE", "K"].includes(pos))
                .map(([pos, entries]) => (
                  <PeakPerformanceCard key={pos} pos={pos} entries={entries} />
                    ))}
                  </div>
              </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <Ghost className="w-6 h-6 text-muted-foreground" />
              <div>
                <h2 className="font-heading text-xl font-bold">The Vault — Hidden Peaks</h2>
                <p className="text-sm text-muted-foreground">Bench players whose week score would have landed in the season top 3 at their position (Peak Performance) if they had started.</p>
                    </div>
                </div>
            <HiddenPeaksGrid peaks={data.hiddenPeaks} />
                    </div>

          <div>
            <p className="text-sm text-muted-foreground mb-3">By most total points as a starter (regular season). All-Rookie: players with 1 year of NFL experience. Players can appear on both All-League and All-Rookie.</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <AllLeagueTeamCard players={data.allLeagueTeams.filter((a) => a.team === 1)} teamNum={1} playerAwards={playerAwards} />
              <AllLeagueTeamCard players={data.allLeagueTeams.filter((a) => a.team === 2)} teamNum={2} playerAwards={playerAwards} />
              <AllLeagueTeamCard players={data.allLeagueTeams.filter((a) => a.team === 3)} teamNum={3} playerAwards={playerAwards} />
              <AllRookieTeamCard players={data.allRookieTeam} playerAwards={playerAwards} />
                </div>
          </div>
        </TabsContent>

        <TabsContent value="playoffs" className="space-y-8 mt-0">
              {data.playoffGames.length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center">
                <p className="text-muted-foreground">No playoff games recorded yet.</p>
            </CardContent>
          </Card>
          ) : (
            <>
              <ChampionSpotlight
                championName={data.championName}
                championAvatar={data.championAvatar}
                playoffGames={data.playoffGames}
              />
              {data.championshipMvp && (
                <ChampionshipMvpCard mvp={data.championshipMvp} />
              )}
              <PlayoffStatCards playoffGames={data.playoffGames.filter(g => g.bracket !== "losers")} />
              <PlayoffBracket playoffGames={data.playoffGames} championName={data.championName} playoffWeekStart={data.playoffWeekStart} leagueId={league?.leagueId} />
              <PlayoffTeamSummary playoffGames={data.playoffGames.filter(g => g.bracket !== "losers")} championName={data.championName} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
