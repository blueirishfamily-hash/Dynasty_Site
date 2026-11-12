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
import { TeamAllowancePanel, getTeamAllowances, CONTRACT_LENGTH_LIMITS, type AllowanceExtension } from "@/components/contracts-hub/TeamAllowances";
import type { PendingTag } from "@/components/contracts-hub/pendingContracts";
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

interface CareerGame {
  season: number;
  week: number;
  points: number;
  rosterId: number | null;
  teamName: string | null;
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
  franchiseTagYear?: number | null;
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
  { value: 1, label: "1-Year", pct: 80 },
  { value: 2, label: "2-Year", pct: 90 },
  { value: 3, label: "3-Year", pct: 100 },
  { value: 4, label: "4-Year", pct: 110 },
];

/** What the server returns when it prices an extension from the player's PPG rank (salaries in tenths of $M). */
interface ExtensionPricing {
  extensionSalary: number;
  extensionSalaryMillions: number;
  salary1YearMillions?: number;
  salary2YearMillions?: number;
  salary3YearMillions?: number;
  salary4YearMillions?: number;
  rank?: number;
  totalPlayersAtPosition?: number;
  adjustedPPG?: number;
}

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

// Custom dot for per-game scatter — colored by the fantasy team that owned the player
function GameDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = teamColor(payload.rosterId);
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} fillOpacity={0.85} />
    </g>
  );
}

// Custom tooltip for career chart
function CareerTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const isGame = d.week != null;
  return (
    <div className="rounded-lg border border-border bg-card shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold">
        {isGame ? `${d.season} · Week ${d.week}` : `${d.season} Season`}
      </p>
      {d?.teamName && (
        <p className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: teamColor(d.rosterId) }} />
          {d.teamName}
        </p>
      )}
      <p>{isGame ? "Pts" : "Total"}: <span className="font-medium">{d?.points?.toFixed(1)} pts</span></p>
      {!isGame && <p>PPG: <span className="font-medium">{d?.ppg?.toFixed(1)}</span></p>}
      {!isGame && <p>Games: <span className="font-medium">{d?.gamesPlayed}</span></p>}
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
  extensions?: AllowanceExtension[];
  /** Tags applied but not saved yet, and how to add one. */
  pendingTags?: PendingTag[];
  onQueueTag?: (tag: PendingTag) => void;
}

export function PlayerDetailSheet({
  target,
  onClose,
  allRosters,
  parsedContracts,
  currentYear,
  playerMap,
  extensions = [],
  pendingTags = [],
  onQueueTag,
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

  // ── Per-game career fetch (lazy — loads after season data) ──
  const { data: careerGamesData, isLoading: gamesLoading } = useQuery<{ games: CareerGame[] }>({
    queryKey: ["/api/sleeper/league", leagueId, "player", playerId, "career-games"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/player/${playerId}/career-games`);
      if (!res.ok) throw new Error("Failed to load game data");
      return res.json();
    },
    enabled: !!playerId && !!leagueId,
    staleTime: 30 * 60 * 1000,
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

  // ── Per-game scatter data: x = season + (week-1)/17, y = points ──
  // X axis will be numeric; season integers are tick marks.
  const gameScatterData = useMemo(() => {
    const games = careerGamesData?.games ?? [];
    return games.map(g => ({
      ...g,
      x: g.season + (g.week - 1) / 17,
      y: g.points,
    }));
  }, [careerGamesData]);

  // X-axis tick values: unique season integers from chart data
  const seasonTicks = useMemo(() => chartData.map(d => d.season), [chartData]);

  // Trailing three-game rolling average across the player's chronological games.
  const rollingAverageData = useMemo(() => {
    return gameScatterData.map((game, index) => {
      const window = gameScatterData.slice(Math.max(0, index - 2), index + 1);
      const average = window.reduce((sum, item) => sum + item.y, 0) / window.length;
      return { ...game, average: Math.round(average * 10) / 10 };
    });
  }, [gameScatterData]);

  // Team limits, counting extensions and tags that are applied but not yet approved.
  const allowances = contract
    ? getTeamAllowances(
        contract.rosterId,
        currentYear,
        extensions,
        parsedContracts,
        pendingTags.filter(t => t.rosterId === contract.rosterId).length,
      )
    : null;

  // ── Extension pricing from the server (same PPG rules used when the extension is saved) ──
  const isRookieExt = contract?.isRookieContract === 1;
  const pricingEligible = !!contract && contract.hasBeenExtended === 0 && contract.extensionApplied === 0;
  const { data: extPricing, isLoading: pricingLoading, error: pricingError } = useQuery<ExtensionPricing>({
    queryKey: ["/api/league", leagueId, "extension-pricing", playerId, contract?.rosterId, isRookieExt ? "rookie" : "non-rookie"],
    queryFn: async () => {
      const endpoint = isRookieExt ? "rookie-extension-salary" : "non-rookie-extension-salary";
      const res = await fetch(`/api/league/${leagueId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, rosterId: contract?.rosterId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not price extension");
      return body;
    },
    enabled: !!leagueId && !!playerId && pricingEligible,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  /** The new contract starts next season, so next season's count for that length must have room. */
  const lengthLimitReason = (type: number): string | null => {
    if (!allowances || !contract) return null;
    const limit = CONTRACT_LENGTH_LIMITS[Math.min(type, 4)];
    if (limit === undefined) return null;
    const bucket = Math.min(type, 4);
    // A non-rookie player's own contract is replaced by the extension, so it does not count against it.
    const ownYears = Object.entries(contract.parsedSalaries).filter(([y, v]) => Number(y) > currentYear && v > 0).length;
    const ownCounted = contract.isRookieContract !== 1 && ownYears > 0 && Math.min(ownYears, 4) === bucket ? 1 : 0;
    return allowances.nextYear[bucket] - ownCounted >= limit
      ? `${bucket === 4 ? "4+" : bucket}-year contracts full in ${currentYear + 1}`
      : null;
  };

  /** Why this extension length cannot be used by the team right now, if it cannot. */
  const extensionBlockReason = (type: number): string | null => {
    if (!allowances) return null;
    if (isRookieExt) {
      if (allowances.rookieLeft === 0) return "No rookie extensions left";
      if (type === 4 && allowances.rookie4YearUsed) return "4-year already used";
      return lengthLimitReason(type);
    }
    if (allowances.nonRookieLeft === 0) return "No extensions left";
    return lengthLimitReason(type);
  };

  /** Per-year salary ($M) for an extension of this length, or null when it is not available. */
  const extensionPrice = (type: number): number | null => {
    if (!extPricing) return null;
    if (extensionBlockReason(type)) return null;
    if (isRookieExt) return type === 3 || type === 4 ? extPricing.extensionSalaryMillions : null;
    const v = (extPricing as any)[`salary${type}YearMillions`];
    return typeof v === "number" ? v : null;
  };

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
      if (previewExtType !== null) {
        const projected = extensionPrice(previewExtType);
        // The new contract starts next season and runs for the extension length.
        if (year > currentYear && year <= currentYear + previewExtType) {
          extensionPreview = projected ?? undefined;
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
  }, [contract, currentYear, previewExtType, previewTag, contractTimelineYears, positionAvgData, extPricing, isRookieExt]);

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
  const pendingExt = contract
    ? extensions.find(e => e.playerId === playerId && e.rosterId === contract.rosterId && e.status === "pending")
    : undefined;
  const pendingTag = contract
    ? pendingTags.find(t => t.playerId === playerId && t.rosterId === contract.rosterId)
    : undefined;
  const tagsLeft = allowances?.tagsLeft ?? 0;
  const canExtend = contract && contract.hasBeenExtended === 0 && contract.extensionApplied === 0 && !pendingExt && !pendingTag;
  const canTag =
    contract &&
    contract.hasBeenFranchiseTagged === 0 &&
    contract.franchiseTagUsed === 0 &&
    !pendingExt &&
    !pendingTag &&
    tagsLeft > 0;

  // ── Extension mutation ──
  const extensionMutation = useMutation({
    mutationFn: async (extensionType: number) => {
      if (!contract) throw new Error("No contract");
      const baseSalary = contract.parsedSalaries[currentYear] ?? 0;
      if (!extPricing) throw new Error("Extension price is not available yet");
      // An extension always starts the season after it is made.
      const extensionYear = currentYear + 1;
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
          isPPGBased: true,
          ppgSalary: extPricing.extensionSalary,
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
      toast({ title: "Extension applied", description: "Saved as pending. Approve it in Contract Actions to make it official." });
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
                  <div className="rounded-xl border border-border/40 p-1 pb-0">
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} />

                      {/* Numeric X axis — integers = seasons, fractional = individual weeks */}
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={seasonTicks.length > 0 ? [seasonTicks[0] - 0.1, seasonTicks[seasonTicks.length - 1] + 1.05] : ["auto", "auto"]}
                        ticks={seasonTicks}
                        tickFormatter={v => String(Math.round(v))}
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        label={{ value: "Pts", angle: -90, position: "insideLeft", offset: 15, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      />
                      <Tooltip content={<CareerTooltip />} />

                      {/* Current year marker */}
                      <ReferenceLine
                        x={currentYear}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: String(currentYear), position: "top", fontSize: 9, fill: "#f59e0b" }}
                      />

                      {/* Three-game rolling average, colored by team at each game */}
                      {rollingAverageData.slice(1).map((point, index) => {
                        const previous = rollingAverageData[index];
                        const color = teamColor(point.rosterId);
                        const isLastPoint = index === rollingAverageData.length - 2;
                        return (
                          <ReferenceLine
                            key={`rolling-avg-${point.season}-${point.week}`}
                            segment={[
                              { x: previous.x, y: previous.average },
                              { x: point.x, y: point.average },
                            ]}
                            stroke={color}
                            strokeDasharray="5 3"
                            strokeWidth={1.5}
                            label={isLastPoint ? {
                              value: `3-game avg ${point.average.toFixed(1)}`,
                              position: "insideTopRight",
                              fontSize: 9,
                              fill: color,
                            } : undefined}
                          />
                        );
                      })}

                      {/* Per-game scatter dots colored by fantasy team */}
                      {!gamesLoading && (
                        <Scatter
                          data={gameScatterData}
                          shape={<GameDot />}
                          isAnimationActive={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                  </div>
                  {gamesLoading && (
                    <p className="text-[10px] text-muted-foreground text-center mt-1 flex items-center justify-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading game dots…
                    </p>
                  )}

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
                          const displaySal = extSal ?? row.salary;
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
                                    {EXTENSION_TYPES.find(t => t.value === previewExtType)?.label} ext · PPG price
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
            {(canExtend || canTag || pendingExt || pendingTag) && (
              <>
                <Separator />
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Contract Actions
                  </h3>
                  {(pendingExt || pendingTag) && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                      <span className="font-semibold text-amber-600">
                        {pendingExt ? "Extension applied" : "Franchise tag applied"}
                      </span>
                      {" "}but not saved yet. Approve or remove it in Contract Actions.
                    </div>
                  )}
                  {!pendingExt && !pendingTag && tagsLeft === 0 && (
                    <p className="text-xs text-muted-foreground">This team has no franchise tag left this season.</p>
                  )}
                  {contract && (
                    <TeamAllowancePanel
                      rosterId={contract.rosterId}
                      currentYear={currentYear}
                      extensions={extensions}
                      parsedContracts={parsedContracts}
                      pendingTagCount={pendingTags.filter(t => t.rosterId === contract.rosterId).length}
                      pendingTagPlayerIds={pendingTags.filter(t => t.rosterId === contract.rosterId).map(t => t.playerId)}
                    />
                  )}

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
                        {isRookieExt
                          ? "Rookie extensions are 3 or 4 years at one flat salary set by this player's PPG rank at his position."
                          : "Salary is set by this player's PPG rank at his position: 80% of the base for 1 year, 90% for 2, 100% for 3 and 110% for 4."}
                        {extPricing?.rank != null && (
                          <> Ranked {extPricing.rank} of {extPricing.totalPlayersAtPosition}.</>
                        )}
                      </p>
                      {pricingLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating price from PPG...
                        </div>
                      )}
                      {pricingError && (
                        <p className="text-xs text-red-500">{(pricingError as Error).message}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {EXTENSION_TYPES.map(et => {
                          const projSal = extensionPrice(et.value);
                          const unavailable = projSal === null;
                          const isSelected = previewExtType === et.value;
                          return (
                            <button
                              key={et.value}
                              disabled={unavailable}
                              onClick={() => {
                                setPreviewExtType(isSelected ? null : et.value);
                                setPreviewTag(false);
                              }}
                              className={`text-left rounded-lg border p-2.5 text-xs transition-all ${
                                isSelected
                                  ? "border-blue-500 bg-blue-500/15"
                                  : "border-border hover:border-blue-500/50 hover:bg-blue-500/5"
                              } ${unavailable ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <div className="font-semibold mb-0.5">{et.label}</div>
                              <div className="text-muted-foreground">
                                {unavailable ? (pricingLoading ? "..." : extensionBlockReason(et.value) ?? "Not available") : `${isRookieExt ? "Flat" : `${et.pct}%`} · ${fmt(projSal)}/yr`}
                              </div>
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
                          disabled={extensionMutation.isPending || applyingExt || !extPricing}
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
                            if (onQueueTag && contract) {
                              onQueueTag({
                                rosterId: contract.rosterId,
                                playerId,
                                playerName: careerData?.player.name ?? "Player",
                                position: careerData?.player.position ?? (playerMap[playerId] as any)?.position ?? "FLEX",
                              });
                              setPreviewTag(false);
                              toast({ title: "Franchise tag applied", description: "Saved as pending. Approve it in Contract Actions to make it official." });
                              onClose();
                              return;
                            }
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
