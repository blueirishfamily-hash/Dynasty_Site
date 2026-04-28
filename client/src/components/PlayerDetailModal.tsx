import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Users,
  GraduationCap,
  Ruler,
  Calendar,
  Star,
  DollarSign,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface PlayerDetailData {
  player: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    number?: number;
    age?: number;
    height?: string;
    weight?: string;
    college?: string;
    yearsExp?: number;
    status?: string;
    injuryStatus?: string | null;
  };
  weeklyData: {
    week: number;
    actual: number | null;
    projected: number;
  }[];
  boomBust: {
    boom: number;
    bust: number;
    boomPct: number;
    bustPct: number;
    avgPoints: number;
    gamesPlayed: number;
  };
  projectedTotal: number;
  news: {
    type: string;
    text: string;
    date?: string;
  }[];
  selectedWeek: number;
}

interface PlayerContract {
  playerId: string;
  rosterId: number;
  salaries: Record<string, number> | string;
  isRookieContract?: number;
  extensionApplied?: number;
  hasBeenExtended?: number;
  franchiseTagApplied?: number;
}

interface DraftPosition {
  round: number | null;
  draftSlot: number | null;
  season: string | null;
  draftId: string | null;
}

export interface PlayerDetailModalProps {
  playerId: string | null;
  playerName: string;
  week: number;
  leagueId?: string;
  isOffseason?: boolean;
  season?: string;
  onClose: () => void;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-emerald-600 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

const injuryColors: Record<string, string> = {
  Out: "text-red-500 bg-red-500/10 border-red-500/30",
  Doubtful: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  Questionable: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30",
  IR: "text-red-600 bg-red-600/10 border-red-600/30",
};

function parseSalaries(raw: Record<string, number> | string): Record<string, number> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw || {};
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function PlayerDetailModal({ playerId, playerName, week, leagueId, isOffseason = false, season, onClose }: PlayerDetailModalProps) {
  // During offseason, fetch the last completed season's full stats by passing leagueId
  // (server uses league.season which is the last completed season)
  const detailUrl = leagueId
    ? `/api/sleeper/player/${playerId}/detail?week=${week}&leagueId=${leagueId}`
    : `/api/sleeper/player/${playerId}/detail?week=${week}`;

  const { data, isLoading } = useQuery<PlayerDetailData>({
    queryKey: ["/api/sleeper/player", playerId, "detail", week, leagueId],
    queryFn: async () => {
      const res = await fetch(detailUrl);
      if (!res.ok) throw new Error("Failed to fetch player detail");
      return res.json();
    },
    enabled: !!playerId,
  });

  // Derive display labels for offseason vs in-season
  const displaySeason = season ?? new Date().getFullYear().toString();
  const lastSeason = String(parseInt(displaySeason) - 1);
  const seasonLabel = isOffseason ? `${lastSeason} Season` : `${displaySeason} Season`;

  const { data: allContracts } = useQuery<PlayerContract[]>({
    queryKey: ["/api/league", leagueId, "contracts"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/contracts`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
    enabled: !!leagueId && !!playerId,
  });

  const { data: draftPos } = useQuery<DraftPosition>({
    queryKey: ["/api/league", leagueId, "player", playerId, "draft-position"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/player/${playerId}/draft-position`);
      if (!res.ok) return { round: null, draftSlot: null, season: null, draftId: null };
      return res.json();
    },
    enabled: !!leagueId && !!playerId,
  });

  const contract = allContracts?.find(c => c.playerId === playerId);
  const salaries = contract ? parseSalaries(contract.salaries as any) : {};
  const salaryEntries = Object.entries(salaries)
    .map(([yr, val]) => ({ year: parseInt(yr), value: (val as number) / 10 }))
    .filter(e => e.value > 0)
    .sort((a, b) => a.year - b.year);

  const currentYear = new Date().getFullYear();
  const yearsRemaining = salaryEntries.filter(e => e.year >= currentYear).length;
  const totalContractValue = salaryEntries.reduce((s, e) => s + e.value, 0);
  const currentYearSalary = salaryEntries.find(e => e.year === currentYear)?.value ?? 0;

  const chartData = data?.weeklyData.map(d => ({
    week: `W${d.week}`,
    actual: d.actual,
    projected: d.projected,
  })) ?? [];

  const getAgeColor = (age: number) => {
    if (age <= 24) return "text-emerald-500";
    if (age <= 28) return "text-foreground";
    return "text-red-400";
  };

  const getNewsIcon = (type: string) => {
    switch (type) {
      case "injury": return <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
      case "practice": return <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case "depth": return <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
      default: return null;
    }
  };

  const injuryBadgeClass = data?.player.injuryStatus
    ? (injuryColors[data.player.injuryStatus] ?? "text-yellow-500 bg-yellow-500/10 border-yellow-500/30")
    : "";

  return (
    <Dialog open={!!playerId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* ── Header banner ── */}
        <div className="relative bg-gradient-to-br from-card to-muted/60 border-b border-border px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-start gap-4">
              {/* Headshot */}
              <Avatar className="w-20 h-20 rounded-xl border-2 border-border shadow-lg shrink-0">
                <AvatarImage
                  src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
                  alt={playerName}
                  className="object-cover"
                />
                <AvatarFallback className="text-2xl font-bold bg-muted rounded-xl">
                  {playerName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {data?.player.position && (
                    <Badge className={`${positionColors[data.player.position] ?? "bg-muted"} text-xs font-semibold px-2`}>
                      {data.player.position}
                    </Badge>
                  )}
                  {data?.player.injuryStatus && (
                    <Badge variant="outline" className={`text-xs px-2 ${injuryBadgeClass}`}>
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {data.player.injuryStatus}
                    </Badge>
                  )}
                  {isLoading && <Skeleton className="h-5 w-16" />}
                </div>

                <h2 className="text-xl font-bold tracking-tight leading-tight truncate">{playerName}</h2>

                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {data?.player.team && (
                    <span className="font-medium text-foreground">{data.player.team}</span>
                  )}
                  {data?.player.number && (
                    <span className="text-muted-foreground">#{data.player.number}</span>
                  )}
                  {data?.player.age && (
                    <span className={`font-semibold ${getAgeColor(data.player.age)}`}>
                      {data.player.age} yrs
                    </span>
                  )}
                  {data?.player.yearsExp !== undefined && (
                    <span>
                      {data.player.yearsExp === 0
                        ? <Badge variant="secondary" className="text-xs">Rookie</Badge>
                        : `${data.player.yearsExp} yr${data.player.yearsExp !== 1 ? "s" : ""} exp`}
                    </span>
                  )}
                </div>

                {/* Bio badges */}
                {!isLoading && data && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {data.player.height && data.player.weight && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Ruler className="w-3 h-3" />
                        {data.player.height} · {data.player.weight}lb
                      </Badge>
                    )}
                    {data.player.college && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <GraduationCap className="w-3 h-3" />
                        {data.player.college}
                      </Badge>
                    )}
                    {draftPos?.round && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Star className="w-3 h-3 text-amber-400" />
                        {draftPos.season} · Rd {draftPos.round} Pk {draftPos.draftSlot}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-5">
          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
              </div>
              <Skeleton className="h-48 w-full" />
            </div>
          ) : data ? (
            <>
              {/* ── Stat summary row ── */}
              {isOffseason && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  Showing {lastSeason} season performance stats
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-card/50">
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">
                      {isOffseason ? `${lastSeason} Pts` : "Season Pts"}
                    </p>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                      {data.boomBust.avgPoints > 0
                        ? (data.boomBust.avgPoints * data.boomBust.gamesPlayed).toFixed(1)
                        : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{data.boomBust.gamesPlayed}g played</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50">
                  <CardContent className="pt-3 pb-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Avg / Wk</p>
                    <p className="text-2xl font-bold tabular-nums">{data.boomBust.avgPoints.toFixed(1)}</p>
                    <p className="text-[10px] text-muted-foreground">pts per game</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-emerald-600/20">
                  <CardContent className="pt-3 pb-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                      <p className="text-xs text-emerald-500">Boom</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-emerald-500">{data.boomBust.boom}</p>
                    <p className="text-[10px] text-muted-foreground">{data.boomBust.boomPct}% rate</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/50 border-red-500/20">
                  <CardContent className="pt-3 pb-3 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingDown className="w-3 h-3 text-red-400" />
                      <p className="text-xs text-red-400">Bust</p>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-red-400">{data.boomBust.bust}</p>
                    <p className="text-[10px] text-muted-foreground">{data.boomBust.bustPct}% rate</p>
                  </CardContent>
                </Card>
              </div>

              {/* ── Season performance chart ── */}
              <Card className="bg-card/50">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">Season Performance</h3>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{seasonLabel}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                        <span>Actual</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-px border-t-2 border-dashed border-muted-foreground" />
                        <span>Projected</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.4} />
                        <XAxis
                          dataKey="week"
                          tick={{ fontSize: 10 }}
                          className="text-muted-foreground"
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          className="text-muted-foreground"
                          domain={[0, "auto"]}
                          axisLine={false}
                          tickLine={false}
                          width={30}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                          formatter={(value: number, name: string) => [
                            value?.toFixed(1) ?? "—",
                            name === "actual" ? "Actual" : "Projected",
                          ]}
                        />
                        <ReferenceLine
                          y={data.boomBust.avgPoints}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="3 3"
                          strokeOpacity={0.5}
                        />
                        <Line
                          type="monotone"
                          dataKey="projected"
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="5 5"
                          strokeWidth={1.5}
                          dot={false}
                          name="projected"
                        />
                        <Line
                          type="monotone"
                          dataKey="actual"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
                          activeDot={{ r: 5, fill: "#10b981" }}
                          connectNulls={false}
                          name="actual"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* ── Week projection pill (in-season only) ── */}
              {!isOffseason && data.projectedTotal > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-muted/50 border border-border">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-muted-foreground">Week {week} projection:</span>
                  <span className="text-sm font-bold tabular-nums">{data.projectedTotal.toFixed(1)} pts</span>
                </div>
              )}

              {/* ── Contract section ── */}
              {contract && salaryEntries.length > 0 && (
                <Card className="bg-card/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-3">
                      <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
                      <h3 className="text-sm font-semibold">League Contract</h3>
                      <div className="flex gap-1.5 ml-auto flex-wrap justify-end">
                        {contract.isRookieContract === 1 && (
                          <Badge variant="secondary" className="text-xs">Rookie</Badge>
                        )}
                        {(contract.hasBeenExtended === 1 || contract.extensionApplied === 1) && (
                          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/40">Extended</Badge>
                        )}
                        {contract.franchiseTagApplied === 1 && (
                          <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/40">Tagged</Badge>
                        )}
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div className="text-center">
                        <p className="text-lg font-bold tabular-nums font-mono text-emerald-500">
                          ${currentYearSalary.toFixed(1)}M
                        </p>
                        <p className="text-[10px] text-muted-foreground">{currentYear} salary</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold tabular-nums font-mono">{yearsRemaining}</p>
                        <p className="text-[10px] text-muted-foreground">yrs remaining</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold tabular-nums font-mono">${totalContractValue.toFixed(1)}M</p>
                        <p className="text-[10px] text-muted-foreground">total value</p>
                      </div>
                    </div>

                    {/* Year-by-year salary bars */}
                    <div className="space-y-1.5">
                      {salaryEntries.map(({ year, value }) => {
                        const maxVal = Math.max(...salaryEntries.map(e => e.value), 1);
                        const pct = (value / maxVal) * 100;
                        const isPast = year < currentYear;
                        return (
                          <div key={year} className="flex items-center gap-2">
                            <span className={`text-xs tabular-nums w-10 shrink-0 ${isPast ? "text-muted-foreground" : "text-foreground"}`}>
                              {year}
                            </span>
                            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isPast ? "bg-muted-foreground/40" : "bg-emerald-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={`text-xs tabular-nums font-mono w-14 text-right shrink-0 ${isPast ? "text-muted-foreground" : "font-semibold text-emerald-400"}`}>
                              ${value.toFixed(1)}M
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── News / status section ── */}
              {data.news.length > 0 && (
                <Card className="bg-card/50">
                  <CardContent className="pt-4 pb-3">
                    <h3 className="text-sm font-semibold mb-3">Status &amp; News</h3>
                    <div className="space-y-2">
                      {data.news.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2.5 bg-muted/40 rounded-lg text-xs"
                        >
                          {getNewsIcon(item.type)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                {item.type}
                              </Badge>
                              {item.date && (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {item.date}
                                </span>
                              )}
                            </div>
                            <p className="text-muted-foreground leading-relaxed">{item.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PlayerDetailModal;
