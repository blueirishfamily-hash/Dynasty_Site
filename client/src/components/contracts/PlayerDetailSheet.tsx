/**
 * PlayerDetailSheet — slide-in panel showing a player's career production history,
 * contract timeline, and soft-select extension / franchise-tag preview.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useSleeper } from "@/lib/sleeper-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Legend,
  Bar,
  Cell,
} from "recharts";
import {
  Shield,
  TrendingUp,
  Loader2,
  Calendar,
  User,
  CheckCircle,
  Eye,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CareerSeason {
  season: number;
  points: number;
  ppg: number;
  gamesPlayed: number;
  teamName: string | null;
  rosterId: number | null;
  teamAvatar: string | null;
}

interface CareerData {
  player: {
    id: string;
    name: string;
    position: string;
    team: string | null;
    age: number | null;
    yearsExp: number | null;
    injuryStatus: string | null;
    college: string | null;
  };
  seasons: CareerSeason[];
}

interface ParsedContract {
  playerId: string;
  rosterId: number;
  parsedSalaries: Record<number, number>;
  contractThrough: number | null;
  franchiseTagUsed: number;
  hasBeenFranchiseTagged: number;
  extensionApplied: number;
  hasBeenExtended: number;
  isRookieContract: number;
  extensionYear: number | null;
  extensionSalary: number | null;
}

export interface PlayerCardTarget {
  playerId: string;
  rosterId: number;
  contract: ParsedContract | null;
  teamName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_CAP = 250;

const TEAM_PALETTE = [
  "#f59e0b", "#3b82f6", "#22c55e", "#ec4899", "#8b5cf6",
  "#f97316", "#14b8a6", "#ef4444", "#a3e635", "#06b6d4",
  "#d946ef", "#64748b",
];

const POSITION_COLORS: Record<string, string> = {
  QB: "#ef4444",
  RB: "#22c55e",
  WR: "#3b82f6",
  TE: "#f97316",
  K: "#8b5cf6",
  DEF: "#64748b",
};

const EXTENSION_TYPES = [
  { value: 1, label: "1-Year", multiplier: 1.2 },
  { value: 2, label: "2-Year", multiplier: 1.5 },
  { value: 3, label: "3-Year", multiplier: 1.8 },
  { value: 4, label: "4-Year", multiplier: 2.0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return `$${v.toFixed(1)}`;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function teamColor(rosterId: number | null) {
  if (rosterId === null) return "#6b7280";
  return TEAM_PALETTE[(rosterId - 1) % TEAM_PALETTE.length];
}

// Custom dot rendered per-season colored by fantasy team
function CareerDot(props: any) {
  const { cx, cy, payload } = props;
  if (!cx || !cy) return null;
  const color = teamColor(payload.rosterId);
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} stroke="hsl(var(--background))" strokeWidth={2} />
    </g>
  );
}

// Custom tooltip for career chart
function CareerTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold">{label} Season</p>
      {d?.teamName && (
        <p className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: teamColor(d.rosterId) }} />
          {d.teamName}
        </p>
      )}
      <p>Total: <span className="font-medium">{d?.points?.toFixed(1)} pts</span></p>
      <p>PPG: <span className="font-medium">{d?.ppg?.toFixed(1)}</span></p>
      <p>Games: <span className="font-medium">{d?.gamesPlayed}</span></p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SleeperPlayerMin {
  position: string;
  name: string;
}

interface PlayerDetailSheetProps {
  target: PlayerCardTarget | null;
  onClose: () => void;
  allRosters: { rosterId: number; teamName: string }[];
  parsedContracts: ParsedContract[];
  currentYear: number;
  playerMap: Record<string, SleeperPlayerMin>;
}

export function PlayerDetailSheet({
  target,
  onClose,
  allRosters,
  parsedContracts,
  currentYear,
  playerMap,
}: PlayerDetailSheetProps) {
  const { league, user } = useSleeper();
  const { toast } = useToast();

  const [chartMode, setChartMode] = useState<"total" | "ppg">("total");
  const [previewExtType, setPreviewExtType] = useState<number | null>(null);
  const [previewTag, setPreviewTag] = useState(false);
  const [applyingExt, setApplyingExt] = useState(false);
  const [applyingTag, setApplyingTag] = useState(false);

  const contract = target?.contract ?? null;
  const playerId = target?.playerId ?? "";
  const leagueId = league?.leagueId ?? "";

  // Reset preview on target change
  const prevPlayerId = useMemo(() => playerId, [playerId]);
  if (prevPlayerId !== playerId) {
    setPreviewExtType(null);
    setPreviewTag(false);
  }

  // ── Career data fetch ──
  const { data: careerData, isLoading } = useQuery<CareerData>({
    queryKey: ["/api/sleeper/league", leagueId, "player", playerId, "career"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/player/${playerId}/career`);
      if (!res.ok) throw new Error("Failed to load career data");
      return res.json();
    },
    enabled: !!playerId && !!leagueId,
    staleTime: 10 * 60 * 1000,
  });

  // ── Team color legend ──
  const teamColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of allRosters) {
      map[String(r.rosterId)] = teamColor(r.rosterId);
    }
    return map;
  }, [allRosters]);

  // ── Build chart data (career + preview extension) ──
  const seasons = careerData?.seasons ?? [];

  // Add salary into each career season from contracts
  const chartData = useMemo(() => {
    return seasons.map(s => {
      const contract = parsedContracts.find(c => c.playerId === playerId);
      const salary = contract?.parsedSalaries[s.season] ?? null;
      return { ...s, salary };
    });
  }, [seasons, parsedContracts, playerId]);

  // ── Contract timeline data for bar chart ──
  const contractTimelineYears = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  // Position average salary per year
  const positionAvgData = useMemo(() => {
    const position = careerData?.player?.position;
    if (!position) return {} as Record<string, number>;
    const result: Record<string, number> = {};
    for (const year of contractTimelineYears) {
      const salaries = parsedContracts
        .filter(c => {
          const pos = playerMap[c.playerId]?.position;
          return pos === position && (c.parsedSalaries[year] || 0) > 0;
        })
        .map(c => c.parsedSalaries[year]);
      if (salaries.length > 0) {
        result[String(year)] = Math.round((salaries.reduce((a, b) => a + b, 0) / salaries.length) * 10) / 10;
      }
    }
    return result;
  }, [careerData?.player?.position, parsedContracts, playerMap, currentYear]);

  const contractTimelineData = useMemo(() => {
    if (!contract) return [];
    return contractTimelineYears.map(year => {
      const salary = contract.parsedSalaries[year] ?? 0;

      // Extension preview: add projected salary for extension year
      let extensionPreview: number | undefined;
      if (previewExtType !== null && salary === 0) {
        const baseSalary = contract.parsedSalaries[currentYear] ?? 0;
        const mult = EXTENSION_TYPES.find(t => t.value === previewExtType)?.multiplier ?? 1;
        const contractThrough = contract.contractThrough ?? currentYear;
        // Show extension only for the first N years past contractThrough
        if (year > contractThrough && year <= contractThrough + previewExtType) {
          extensionPreview = Math.round(baseSalary * mult * 10) / 10;
        }
      }

      // Tag preview
      let tagPreview: number | undefined;
      if (previewTag && salary === 0) {
        const contractThrough = contract.contractThrough ?? currentYear;
        const tagYear = contractThrough + 1;
        if (year === tagYear) {
          tagPreview = -1; // sentinel: will display as "Top-5 avg"
        }
      }

      return {
        year: String(year),
        salary: salary > 0 ? salary : undefined,
        extensionPreview,
        tagPreview,
        posAvg: positionAvgData[String(year)],
        isPast: year < currentYear,
        isCurrent: year === currentYear,
      };
    });
  }, [contract, currentYear, previewExtType, previewTag, contractTimelineYears, positionAvgData]);

  // ── Dynamic Y domain for contract timeline ──
  const timelineMax = useMemo(() => {
    if (!contractTimelineData.length) return 50;
    const vals = contractTimelineData.flatMap(d => [
      d.salary ?? 0,
      d.extensionPreview ?? 0,
      d.posAvg ?? 0,
    ]);
    const max = Math.max(...vals, 1);
    return Math.ceil(max * 1.35);
  }, [contractTimelineData]);

  // ── Canonical tag/extension eligibility ──
  const canExtend = contract && contract.hasBeenExtended === 0 && contract.extensionApplied === 0;
  const canTag = contract && contract.hasBeenFranchiseTagged === 0 && contract.franchiseTagUsed === 0;

  // ── Extension mutation ──
  const extensionMutation = useMutation({
    mutationFn: async (extensionType: number) => {
      if (!contract) throw new Error("No contract");
      const baseSalary = contract.parsedSalaries[currentYear] ?? 0;
      const contractThrough = contract.contractThrough ?? currentYear;
      const extensionYear = contractThrough + 1;
      const res = await fetch(`/api/league/${leagueId}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId: contract.rosterId,
          playerId,
          playerName: careerData?.player.name ?? "Player",
          currentSalary: Math.round(baseSalary * 10),
          extensionType,
          extensionYear,
          season: currentYear,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "extensions", String(currentYear)] });
      setPreviewExtType(null);
      setApplyingExt(false);
      toast({ title: "Extension Applied" });
      onClose();
    },
    onError: (e: Error) => {
      setApplyingExt(false);
      toast({ title: "Extension Failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Franchise tag mutation ──
  const tagMutation = useMutation({
    mutationFn: async () => {
      if (!contract || !user?.userId) throw new Error("No contract or user");
      const playerInfo = careerData?.player;
      const res = await fetch(`/api/league/${leagueId}/franchise-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          rosterId: contract.rosterId,
          playerId,
          position: playerInfo?.position ?? "FLEX",
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      setPreviewTag(false);
      setApplyingTag(false);
      toast({ title: "Franchise Tag Applied" });
      onClose();
    },
    onError: (e: Error) => {
      setApplyingTag(false);
      toast({ title: "Tag Failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Render ──
  const player = careerData?.player;
  const posColor = player ? (POSITION_COLORS[player.position] || "#6b7280") : "#6b7280";

  return (
    <Sheet open={!!target} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="w-14 h-14">
                <AvatarImage
                  src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`}
                  className="object-cover"
                />
                <AvatarFallback className="text-sm">
                  {player ? getInitials(player.name) : "?"}
                </AvatarFallback>
              </Avatar>
              <span
                className="absolute -bottom-1 -right-1 text-[9px] font-bold px-1 py-0.5 rounded text-white"
                style={{ backgroundColor: posColor }}
              >
                {player?.position ?? "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl font-heading mb-0.5">
                {isLoading ? "Loading…" : (player?.name ?? "Unknown Player")}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {player?.team && <span>{player.team}</span>}
                {player?.age && <span>Age {player.age}</span>}
                {player?.yearsExp !== null && player?.yearsExp !== undefined && (
                  <span>{player.yearsExp} yr{player.yearsExp !== 1 ? "s" : ""} exp</span>
                )}
                {player?.college && <span>{player.college}</span>}
              </div>
              {player?.injuryStatus && (
                <Badge variant="destructive" className="mt-1 text-xs">
                  {player.injuryStatus}
                </Badge>
              )}
              {target?.teamName && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: teamColor(target.rosterId) }}
                  />
                  {target.teamName}
                </p>
              )}
            </div>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-6">

            {/* Career Production Chart */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Career Production
                </h3>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={chartMode === "total" ? "default" : "ghost"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setChartMode("total")}
                  >
                    Total pts
                  </Button>
                  <Button
                    size="sm"
                    variant={chartMode === "ppg" ? "default" : "ghost"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setChartMode("ppg")}
                  >
                    PPG
                  </Button>
                </div>
              </div>

              {chartData.length > 0 ? (
                <>
                  <div className="rounded-xl bg-gradient-to-b from-muted/50 via-muted/20 to-transparent border border-border/40 p-1 pb-0">
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="careerBg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.08} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />
                      <XAxis
                        dataKey="season"
                        tick={{ fontSize: 11 }}
                        tickFormatter={v => String(v)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CareerTooltip />} />

                      {/* Shade contract period */}
                      {contract?.contractThrough && (
                        <ReferenceArea
                          x1={Math.max(chartData[0]?.season ?? currentYear, currentYear - 1)}
                          x2={contract.contractThrough}
                          fill="hsl(var(--primary))"
                          fillOpacity={0.06}
                          label={{ value: "Contract", position: "insideTopLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                        />
                      )}

                      {/* Current year marker */}
                      <ReferenceLine
                        x={currentYear}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: String(currentYear), position: "top", fontSize: 9, fill: "#f59e0b" }}
                      />

                      <Line
                        type="monotone"
                        dataKey={chartMode === "total" ? "points" : "ppg"}
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={2}
                        dot={<CareerDot />}
                        activeDot={{ r: 7 }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>

                  {/* Team legend */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Array.from(
                      new Map(
                        chartData
                          .filter(d => d.teamName && d.rosterId !== null)
                          .map(d => [d.rosterId, d.teamName])
                      ).entries()
                    ).map(([rid, name]) => (
                      <span key={rid} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: teamColor(rid) }}
                        />
                        {name}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                  No historical production data found
                </div>
              )}
            </section>

            <Separator />

            {/* Contract Timeline */}
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Contract Timeline
              </h3>

              {contract ? (
                <>
                  {/* Salary bar + position avg line chart */}
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={contractTimelineData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        domain={[0, timelineMax]}
                        tickFormatter={v => `$${v}`}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => {
                          if (name === "posAvg") return [`${fmt(v)}`, `${careerData?.player?.position ?? "Pos"} avg`];
                          if (name === "extensionPreview") return [`${fmt(v)} (preview)`, "Extension"];
                          if (name === "tagPreview") return ["Top-5 avg (preview)", "Franchise Tag"];
                          return [fmt(v), "Salary"];
                        }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: "11px",
                        }}
                      />

                      {/* Actual contracted salary */}
                      <Bar dataKey="salary" radius={[3, 3, 0, 0]} name="salary" maxBarSize={40}>
                        {contractTimelineData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={
                              entry.isCurrent
                                ? "#f59e0b"
                                : entry.isPast
                                ? "hsl(var(--muted-foreground))"
                                : "hsl(var(--primary))"
                            }
                            fillOpacity={entry.isPast ? 0.5 : 1}
                          />
                        ))}
                      </Bar>

                      {/* Extension preview */}
                      <Bar
                        dataKey="extensionPreview"
                        radius={[3, 3, 0, 0]}
                        fill="#f59e0b"
                        fillOpacity={0.4}
                        name="extensionPreview"
                        stroke="#f59e0b"
                        strokeWidth={1}
                        maxBarSize={40}
                      />

                      {/* Tag preview */}
                      <Bar
                        dataKey="tagPreview"
                        radius={[3, 3, 0, 0]}
                        fill="#8b5cf6"
                        fillOpacity={0.4}
                        name="tagPreview"
                        stroke="#8b5cf6"
                        strokeWidth={1}
                        maxBarSize={40}
                      />

                      {/* Position average salary line */}
                      <Line
                        type="monotone"
                        dataKey="posAvg"
                        name="posAvg"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        strokeDasharray="5 3"
                        dot={{ r: 3, fill: "#14b8a6", strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>

                  {/* Timeline legend */}
                  <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-primary" />Salary</span>
                    <span className="flex items-center gap-1">
                      <svg width="14" height="8"><line x1="0" y1="4" x2="14" y2="4" stroke="#14b8a6" strokeWidth="2" strokeDasharray="4 2" /></svg>
                      {careerData?.player?.position ?? "Pos"} Avg
                    </span>
                    {previewExtType !== null && (
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-amber-500 opacity-50" />Extension Preview</span>
                    )}
                    {previewTag && (
                      <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-purple-500 opacity-50" />Tag Preview</span>
                    )}
                  </div>

                  {/* Year-by-year salary table */}
                  <div className="mt-3 rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Year</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Salary</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">% Cap</th>
                          <th className="px-3 py-2 font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {contractTimelineData.map(row => {
                          const extSal = row.extensionPreview;
                          const isPreviewRow = extSal !== undefined || row.tagPreview !== undefined;
                          const displaySal = row.salary ?? extSal;
                          return (
                            <tr
                              key={row.year}
                              className={`${row.isPast ? "opacity-50" : ""} ${isPreviewRow ? "bg-amber-500/5" : ""}`}
                            >
                              <td className="px-3 py-1.5 font-mono font-medium">
                                {row.year}
                                {row.isCurrent && (
                                  <span className="ml-1 text-[9px] text-amber-500 font-semibold">NOW</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold">
                                {displaySal ? (
                                  <span className={isPreviewRow ? "text-amber-500" : ""}>
                                    {fmt(displaySal)}
                                    {isPreviewRow && <span className="text-[9px] ml-0.5 opacity-70">preview</span>}
                                  </span>
                                ) : row.tagPreview !== undefined ? (
                                  <span className="text-purple-500">Tag avg<span className="text-[9px] ml-0.5 opacity-70">preview</span></span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right text-muted-foreground">
                                {displaySal ? `${((displaySal / TOTAL_CAP) * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {row.isCurrent && contract.franchiseTagUsed === 1 && (
                                  <span className="text-amber-500">Tagged</span>
                                )}
                                {row.isCurrent && contract.extensionApplied === 1 && (
                                  <span className="text-blue-500">Extended</span>
                                )}
                                {isPreviewRow && extSal !== undefined && (
                                  <span className="text-amber-500/70 text-[10px]">
                                    {EXTENSION_TYPES.find(t => t.value === previewExtType)?.label} ext · {EXTENSION_TYPES.find(t => t.value === previewExtType)?.multiplier}×
                                  </span>
                                )}
                                {isPreviewRow && row.tagPreview !== undefined && (
                                  <span className="text-purple-500/70 text-[10px]">Franchise tag</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Contract meta */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {contract.isRookieContract === 1 && (
                      <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-600">Rookie</Badge>
                    )}
                    {contract.franchiseTagUsed === 1 && (
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600">Franchise Tagged</Badge>
                    )}
                    {contract.extensionApplied === 1 && (
                      <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600">Extended</Badge>
                    )}
                    {contract.contractThrough && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        Through {contract.contractThrough}
                      </Badge>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-20 flex items-center justify-center text-muted-foreground text-sm border border-dashed border-border rounded-lg">
                  No contract on file
                </div>
              )}
            </section>

            {/* Extension & Tag Actions */}
            {(canExtend || canTag) && (
              <>
                <Separator />
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Contract Actions
                  </h3>

                  {/* Extension soft-select */}
                  {canExtend && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-semibold text-blue-600">Extension</span>
                        {previewExtType !== null && (
                          <Badge className="text-[10px] px-1.5 bg-blue-500/20 text-blue-600 border-blue-500/30 border">
                            Preview Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select an extension type to preview its effect, then apply when ready.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {EXTENSION_TYPES.map(et => {
                          const baseSal = contract?.parsedSalaries[currentYear] ?? 0;
                          const projSal = Math.round(baseSal * et.multiplier * 10) / 10;
                          const isSelected = previewExtType === et.value;
                          return (
                            <button
                              key={et.value}
                              onClick={() => {
                                setPreviewExtType(isSelected ? null : et.value);
                                setPreviewTag(false);
                              }}
                              className={`text-left rounded-lg border p-2.5 text-xs transition-all ${
                                isSelected
                                  ? "border-blue-500 bg-blue-500/15"
                                  : "border-border hover:border-blue-500/50 hover:bg-blue-500/5"
                              }`}
                            >
                              <div className="font-semibold mb-0.5">{et.label}</div>
                              <div className="text-muted-foreground">{et.multiplier}× · {fmt(projSal)}/yr</div>
                              {isSelected && (
                                <div className="text-blue-500 mt-1 text-[10px] flex items-center gap-1">
                                  <Eye className="w-3 h-3" /> Previewing
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {previewExtType !== null && (
                        <Button
                          className="w-full h-8 text-sm bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            setApplyingExt(true);
                            extensionMutation.mutate(previewExtType);
                          }}
                          disabled={extensionMutation.isPending || applyingExt}
                        >
                          {extensionMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4 mr-2" />
                          )}
                          Apply {EXTENSION_TYPES.find(t => t.value === previewExtType)?.label} Extension
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Franchise tag soft-select */}
                  {canTag && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-600">Franchise Tag</span>
                        {previewTag && (
                          <Badge className="text-[10px] px-1.5 bg-amber-500/20 text-amber-600 border-amber-500/30 border">
                            Preview Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Salary will be set to the top-5 average at {player?.position ?? "this position"}.
                        A player can only be tagged once per stint on this roster.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className={`w-full h-8 text-sm transition-all ${
                          previewTag
                            ? "border-amber-500 bg-amber-500/15 text-amber-600"
                            : "border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                        }`}
                        onClick={() => {
                          setPreviewTag(!previewTag);
                          setPreviewExtType(null);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        {previewTag ? "Previewing Tag — Click to Cancel" : "Preview Franchise Tag Effect"}
                      </Button>
                      {previewTag && (
                        <Button
                          className="w-full h-8 text-sm"
                          onClick={() => {
                            setApplyingTag(true);
                            tagMutation.mutate();
                          }}
                          disabled={tagMutation.isPending || applyingTag}
                        >
                          {tagMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Shield className="w-4 h-4 mr-2" />
                          )}
                          Apply Franchise Tag
                        </Button>
                      )}
                    </div>
                  )}
                </section>
              </>
            )}

          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
