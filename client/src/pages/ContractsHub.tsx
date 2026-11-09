import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useSleeper } from "@/lib/sleeper-context";
import { PlayerDetailSheet, type PlayerCardTarget } from "@/components/contracts/PlayerDetailSheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  FileText,
  Shield,
  Users,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Star,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
  ArrowUpDown,
  Tag,
  Zap,
  Clock,
  Filter,
  RefreshCw,
  BarChart2,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_CAP = 250;
const COMMISSIONER_USER_IDS = ["900186363130503168"];

const positionColors: Record<string, string> = {
  QB: "bg-rose-500 text-white",
  RB: "bg-emerald-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

const positionBadgeVariant: Record<string, string> = {
  QB: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  WR: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  TE: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  K: "bg-purple-500/15 text-purple-600 border-purple-500/30",
  DEF: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

const EXTENSION_TYPES = [
  { value: 1, label: "1-Year (1.2× salary)" },
  { value: 2, label: "2-Year (1.5× salary)" },
  { value: 3, label: "3-Year (1.8× salary)" },
  { value: 4, label: "4-Year (2.0× salary)" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface SleeperPlayer {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age?: number;
  yearsExp?: number;
  status?: string;
  injuryStatus?: string | null;
}

interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  seasonPoints: number;
  weeklyAvg: number;
  gamesStarted: number;
  age: number | null;
  yearsExp: number | null;
}

interface AllRosterEntry {
  rosterId: number;
  ownerId: string;
  teamName: string;
  teamInitials: string;
  teamAvatar: string | null;
  players: RosterPlayer[];
}

interface DbPlayerContract {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  salaries: string;
  franchiseTagUsed: number;
  franchiseTagYear: number | null;
  originalContractYears: number;
  isRookieContract: number;
  extensionApplied: number;
  extensionYear: number | null;
  extensionSalary: number | null;
  hasBeenExtended: number;
  hasBeenFranchiseTagged: number;
  fifthYearOption: string | null;
  isOnIr: number;
}

interface ParsedContract extends DbPlayerContract {
  parsedSalaries: Record<number, number>;
  contractThrough: number | null;
}

interface DbDeadCapEntry {
  id: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  deadCapSalaries: string;
}

interface TeamExtension {
  id: string;
  rosterId: number;
  season: number;
  playerId: string;
  playerName: string;
  extensionSalary: number;
  extensionYear: number;
  extensionType: number;
  status: string;
}

interface ApprovalRequest {
  id: string;
  rosterId: number;
  teamName: string;
  ownerName: string;
  contractsJson: string;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewerNotes: string | null;
}

interface TeamCapSummary {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  capUsed: number;
  deadCapTotal: number;
  available: number;
  expiringValue: number;
  expiringCount: number;
  committedFuture: number;
  contractCount: number;
  franchiseTagsUsed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSalaries(raw: string | Record<string, number>): Record<number, number> {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    const result: Record<number, number> = {};
    for (const [year, val] of Object.entries(obj)) {
      const y = Number(year);
      if (!isNaN(y)) result[y] = (Number(val) || 0) / 10;
    }
    return result;
  } catch {
    return {};
  }
}

function getContractThrough(salaries: Record<number, number>): number | null {
  const years = Object.entries(salaries)
    .filter(([, v]) => v > 0)
    .map(([y]) => Number(y));
  return years.length > 0 ? Math.max(...years) : null;
}

function formatMoney(val: number): string {
  return `$${val.toFixed(1)}`;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function PosBadge({ pos }: { pos: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${positionBadgeVariant[pos] || "bg-muted text-muted-foreground border-border"}`}
    >
      {pos}
    </span>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  highlight,
  progress,
  progressMax,
  progressColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  highlight?: boolean;
  progress?: number;
  progressMax?: number;
  progressColor?: string;
}) {
  return (
    <Card className={`${highlight ? "border-amber-500/50 bg-amber-500/5" : ""}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between mb-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</span>
          {Icon && <Icon className="w-4 h-4 text-muted-foreground/60" />}
        </div>
        <div className={`text-2xl font-bold font-heading ${highlight ? "text-amber-500" : ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        {progress !== undefined && progressMax !== undefined && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (progress / progressMax) * 100)}%`,
                backgroundColor: progressColor || "hsl(var(--primary))",
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  selectedRosterId,
  setSelectedRosterId,
  allRosters,
  parsedContracts,
  deadCapEntries,
  currentYear,
  onOpenPlayer,
}: {
  selectedRosterId: number | null;
  setSelectedRosterId: (id: number) => void;
  allRosters: AllRosterEntry[];
  parsedContracts: ParsedContract[];
  deadCapEntries: DbDeadCapEntry[];
  currentYear: number;
  onOpenPlayer: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const [productiveMode, setProductiveMode] = useState<"total" | "ppg">("total");

  const teamEntry = allRosters.find(r => r.rosterId === selectedRosterId);
  const teamContracts = parsedContracts.filter(c => c.rosterId === selectedRosterId);
  const teamDeadCap = deadCapEntries.filter(dc => dc.rosterId === selectedRosterId);

  const deadCapCurrentYear = useMemo(() => {
    return teamDeadCap.reduce((sum, dc) => {
      try {
        const sal = JSON.parse(dc.deadCapSalaries || "{}");
        return sum + (Number(sal[String(currentYear)]) || 0) / 10;
      } catch {
        return sum;
      }
    }, 0);
  }, [teamDeadCap, currentYear]);

  const capUsedFromContracts = useMemo(
    () => teamContracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0),
    [teamContracts, currentYear]
  );
  const capUsed = capUsedFromContracts + deadCapCurrentYear;
  const capSpace = Math.max(0, TOTAL_CAP - capUsed);

  const expiringContracts = teamContracts.filter(c => c.contractThrough === currentYear);
  const expiringValue = expiringContracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0);

  const futureYears = [currentYear + 1, currentYear + 2, currentYear + 3];
  const committedFuture = teamContracts.reduce((sum, c) => {
    return sum + futureYears.reduce((s, y) => s + (c.parsedSalaries[y] || 0), 0);
  }, 0);
  const committedFutureSeasons = futureYears.filter(y =>
    teamContracts.some(c => (c.parsedSalaries[y] || 0) > 0)
  ).length;

  // Performance data lookup
  const perfMap = useMemo(() => {
    const map: Record<string, RosterPlayer> = {};
    if (teamEntry) {
      for (const p of teamEntry.players) {
        map[p.id] = p;
      }
    }
    return map;
  }, [teamEntry]);

  // Most expensive: by current year salary
  const mostExpensive = useMemo(() => {
    return [...teamContracts]
      .filter(c => (c.parsedSalaries[currentYear] || 0) > 0)
      .sort((a, b) => (b.parsedSalaries[currentYear] || 0) - (a.parsedSalaries[currentYear] || 0))
      .slice(0, 5)
      .map(c => ({
        playerId: c.playerId,
        salary: c.parsedSalaries[currentYear] || 0,
        contractThrough: c.contractThrough,
        player: perfMap[c.playerId],
      }));
  }, [teamContracts, currentYear, perfMap]);

  // Most productive: by season points (or ppg)
  const mostProductive = useMemo(() => {
    const players = teamEntry?.players || [];
    const withSalary = players
      .map(p => {
        const contract = teamContracts.find(c => c.playerId === p.id);
        const salary = contract?.parsedSalaries[currentYear] || 0;
        const pts = productiveMode === "ppg" ? p.weeklyAvg : p.seasonPoints;
        return { ...p, salary, pts, dollarPerPt: salary > 0 && p.seasonPoints > 0 ? salary / p.seasonPoints : 0 };
      })
      .filter(p => p.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 5);
    return withSalary;
  }, [teamEntry, teamContracts, currentYear, productiveMode]);

  // Upcoming free agents
  const upcomingFAs = useMemo(() => {
    return expiringContracts.map(c => {
      const player = perfMap[c.playerId];
      return {
        ...c,
        player,
        isFranchiseTagEligible: c.hasBeenFranchiseTagged === 0,
        isExtensionEligible: c.hasBeenExtended === 0,
      };
    });
  }, [expiringContracts, perfMap]);

  // Salary commitments chart
  const commitmentYears = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];
  const salaryCommitmentsData = commitmentYears.map(year => {
    const committed = teamContracts.reduce((sum, c) => sum + (c.parsedSalaries[year] || 0), 0);
    const dead = year === currentYear ? deadCapCurrentYear : 0;
    return {
      year: String(year),
      committed: Math.round(committed * 10) / 10,
      deadCap: Math.round(dead * 10) / 10,
      space: Math.round(Math.max(0, TOTAL_CAP - committed - dead) * 10) / 10,
    };
  });

  // Spend by position
  const positions = ["QB", "RB", "WR", "TE", "K"];
  const teamSpendByPos = useMemo(() => {
    const spend: Record<string, number> = {};
    for (const c of teamContracts) {
      const player = perfMap[c.playerId];
      if (!player) continue;
      const pos = player.position;
      if (!positions.includes(pos)) continue;
      spend[pos] = (spend[pos] || 0) + (c.parsedSalaries[currentYear] || 0);
    }
    return spend;
  }, [teamContracts, perfMap, currentYear]);

  // League avg by position
  const leagueAvgByPos = useMemo(() => {
    const totals: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const roster of allRosters) {
      const rContracts = parsedContracts.filter(c => c.rosterId === roster.rosterId);
      const perfByPlayer: Record<string, string> = {};
      for (const p of roster.players) {
        perfByPlayer[p.id] = p.position;
      }
      for (const c of rContracts) {
        const pos = perfByPlayer[c.playerId];
        if (!pos || !positions.includes(pos)) continue;
        totals[pos] = (totals[pos] || 0) + (c.parsedSalaries[currentYear] || 0);
        counts[pos] = (counts[pos] || 0) + 1;
      }
    }
    const avgs: Record<string, number> = {};
    for (const pos of positions) {
      const rosterCount = allRosters.length || 1;
      avgs[pos] = Math.round(((totals[pos] || 0) / rosterCount) * 10) / 10;
    }
    return avgs;
  }, [allRosters, parsedContracts, currentYear]);

  const positionChartData = positions.map(pos => ({
    pos,
    team: Math.round((teamSpendByPos[pos] || 0) * 10) / 10,
    leagueAvg: leagueAvgByPos[pos] || 0,
  }));

  if (!teamEntry) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <div className="text-center">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Select a team to view their contract dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={`${currentYear} Cap Used`}
          value={`${formatMoney(capUsed)} / $${TOTAL_CAP}`}
          sub={`$${capSpace.toFixed(1)} remaining`}
          icon={DollarSign}
          progress={capUsed}
          progressMax={TOTAL_CAP}
          progressColor={capUsed / TOTAL_CAP > 0.9 ? "#ef4444" : capUsed / TOTAL_CAP > 0.75 ? "#f59e0b" : "#22c55e"}
        />
        <StatCard
          label="Cap Space"
          value={formatMoney(capSpace)}
          sub={`League avg $${Math.round((allRosters.reduce((s, r) => {
            const used = parsedContracts.filter(c => c.rosterId === r.rosterId).reduce((ss, c) => ss + (c.parsedSalaries[currentYear] || 0), 0);
            return s + (TOTAL_CAP - used);
          }, 0) / (allRosters.length || 1)) * 10) / 10}`}
          icon={TrendingUp}
          highlight={capSpace > 50}
        />
        <StatCard
          label={`Expiring After ${currentYear}`}
          value={formatMoney(expiringValue)}
          sub={`${expiringContracts.length} player${expiringContracts.length !== 1 ? "s" : ""}`}
          icon={Clock}
        />
        <StatCard
          label={`Committed ${currentYear + 1}–${currentYear + 3}`}
          value={formatMoney(committedFuture)}
          sub={`across ${committedFutureSeasons} future season${committedFutureSeasons !== 1 ? "s" : ""}`}
          icon={Calendar}
        />
      </div>

      {/* Most Expensive + Most Productive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most Expensive */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-wide">Most Expensive</CardTitle>
              <span className="text-xs text-muted-foreground">{currentYear} Salary</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-10">Pos</TableHead>
                  <TableHead className="w-16">Thru</TableHead>
                  <TableHead className="text-right w-20">Salary</TableHead>
                  <TableHead className="text-right w-16">% Cap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostExpensive.map((row, i) => {
                  const contract = parsedContracts.find(c => c.playerId === row.playerId && c.rosterId === selectedRosterId) ?? null;
                  return (
                  <TableRow
                    key={row.playerId}
                    className="text-sm cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => onOpenPlayer(row.playerId, selectedRosterId ?? 0, contract)}
                  >
                    <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarImage
                            src={`https://sleepercdn.com/content/nfl/players/${row.playerId}.jpg`}
                            className="object-cover"
                          />
                          <AvatarFallback className="text-[9px]">
                            {row.player?.name ? getInitials(row.player.name) : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate max-w-[120px]">
                          {row.player?.name || `Player ${row.playerId.slice(0, 6)}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><PosBadge pos={row.player?.position || "?"} /></TableCell>
                    <TableCell className="text-muted-foreground text-xs">{row.contractThrough || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(row.salary)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {((row.salary / TOTAL_CAP) * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                  );
                })}
                {mostExpensive.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                      No contracts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Most Productive */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-wide">Most Productive</CardTitle>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={productiveMode === "total" ? "default" : "ghost"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setProductiveMode("total")}
                >
                  Total pts
                </Button>
                <Button
                  size="sm"
                  variant={productiveMode === "ppg" ? "default" : "ghost"}
                  className="h-6 px-2 text-xs"
                  onClick={() => setProductiveMode("ppg")}
                >
                  Pts/game
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-10">Pos</TableHead>
                  <TableHead className="text-right w-14">GP</TableHead>
                  <TableHead className="text-right w-20">Pts</TableHead>
                  <TableHead className="text-right w-16">$/pt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mostProductive.map((row, i) => {
                  const contract = parsedContracts.find(c => c.playerId === row.id && c.rosterId === selectedRosterId) ?? null;
                  return (
                  <TableRow
                    key={row.id}
                    className="text-sm cursor-pointer hover:bg-muted/60 transition-colors"
                    onClick={() => onOpenPlayer(row.id, selectedRosterId ?? 0, contract)}
                  >
                    <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6">
                          <AvatarImage
                            src={`https://sleepercdn.com/content/nfl/players/${row.id}.jpg`}
                            className="object-cover"
                          />
                          <AvatarFallback className="text-[9px]">{getInitials(row.name)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate max-w-[120px]">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell><PosBadge pos={row.position} /></TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">{row.gamesStarted}</TableCell>
                    <TableCell className="text-right font-semibold">{row.pts.toFixed(1)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {row.dollarPerPt > 0 ? `$${row.dollarPerPt.toFixed(2)}` : "—"}
                    </TableCell>
                  </TableRow>
                  );
                })}
                {mostProductive.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">
                      No performance data found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground px-4 py-2 border-t">
              Season-to-date fantasy points (PPR). $/pt = {currentYear} salary ÷ total points.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Free Agents */}
      {upcomingFAs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-wide">Upcoming Free Agents</CardTitle>
              <span className="text-xs text-muted-foreground">
                Contracts ending after {currentYear} · {formatMoney(expiringValue)} coming off the books
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {upcomingFAs.map(fa => (
                <div
                  key={fa.playerId}
                  className="rounded-lg border border-border bg-card/50 p-3 cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-colors"
                  onClick={() => onOpenPlayer(fa.playerId, selectedRosterId ?? 0, fa)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage
                        src={`https://sleepercdn.com/content/nfl/players/${fa.playerId}.jpg`}
                        className="object-cover"
                      />
                      <AvatarFallback className="text-xs">
                        {fa.player?.name ? getInitials(fa.player.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-xs truncate">
                        {fa.player?.name || `Player ${fa.playerId.slice(0, 6)}`}
                      </p>
                      <PosBadge pos={fa.player?.position || "?"} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground mb-2">
                    <div>
                      <div className="font-semibold text-foreground">{formatMoney(fa.parsedSalaries[currentYear] || 0)}</div>
                      <div>Salary</div>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{fa.player?.age ?? "—"}</div>
                      <div>Age</div>
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{fa.player?.weeklyAvg?.toFixed(1) ?? "—"}</div>
                      <div>PPG</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {fa.isFranchiseTagEligible && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-600">
                        Tag Eligible
                      </Badge>
                    )}
                    {fa.isExtensionEligible && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/50 text-blue-600">
                        Ext. Window
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Salary Commitments */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-wide">Salary Commitments</CardTitle>
              <span className="text-xs text-muted-foreground">Next 4 seasons · cap ${TOTAL_CAP}</span>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salaryCommitmentsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, TOTAL_CAP]} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `$${value.toFixed(1)}`,
                    name === "committed" ? "Committed" : name === "deadCap" ? "Dead Cap" : "Cap Space",
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                />
                <ReferenceLine y={TOTAL_CAP} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: `Cap $${TOTAL_CAP}`, position: "right", fontSize: 10, fill: "#f59e0b" }} />
                <Bar dataKey="committed" fill="#f59e0b" radius={[3, 3, 0, 0]} name="committed">
                  {salaryCommitmentsData.map((entry, i) => (
                    <Cell key={i} fill={entry.committed / TOTAL_CAP > 0.9 ? "#ef4444" : entry.committed / TOTAL_CAP > 0.75 ? "#f59e0b" : "#f59e0b"} />
                  ))}
                </Bar>
                <Bar dataKey="deadCap" fill="#ef4444" radius={[3, 3, 0, 0]} name="deadCap" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-4 gap-1 text-center text-[10px] text-muted-foreground mt-1">
              {salaryCommitmentsData.map(d => (
                <div key={d.year}>
                  <span className="text-foreground font-medium">${d.space.toFixed(0)}</span> space
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Spend by Position */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-heading uppercase tracking-wide">Spend by Position</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-amber-500" /> Team</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-blue-400/60" /> League avg</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                layout="vertical"
                data={positionChartData}
                margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis type="category" dataKey="pos" tick={{ fontSize: 11 }} width={30} />
                <Tooltip
                  formatter={(v: number, name: string) => [`$${v.toFixed(1)}`, name === "team" ? "This Team" : "League Avg"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                />
                <Bar dataKey="team" fill="#f59e0b" radius={[0, 3, 3, 0]} name="team" />
                <Bar dataKey="leagueAvg" fill="rgba(96,165,250,0.5)" radius={[0, 3, 3, 0]} name="leagueAvg" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {currentYear} salary by position. Bars scaled to $100.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── League Cap Tab ───────────────────────────────────────────────────────────

function LeagueCapTab({
  allRosters,
  parsedContracts,
  deadCapEntries,
  currentYear,
  onSelectTeam,
}: {
  allRosters: AllRosterEntry[];
  parsedContracts: ParsedContract[];
  deadCapEntries: DbDeadCapEntry[];
  currentYear: number;
  onSelectTeam: (rosterId: number) => void;
}) {
  const [sortKey, setSortKey] = useState<"capUsed" | "available" | "expiring" | "future">("capUsed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const teamSummaries: TeamCapSummary[] = useMemo(() => {
    return allRosters.map(roster => {
      const contracts = parsedContracts.filter(c => c.rosterId === roster.rosterId);
      const deadCap = deadCapEntries.filter(dc => dc.rosterId === roster.rosterId);
      const deadCapTotal = deadCap.reduce((sum, dc) => {
        try {
          const sal = JSON.parse(dc.deadCapSalaries || "{}");
          return sum + (Number(sal[String(currentYear)]) || 0) / 10;
        } catch {
          return sum;
        }
      }, 0);
      const capFromContracts = contracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0);
      const capUsed = capFromContracts + deadCapTotal;
      const available = TOTAL_CAP - capUsed;
      const expiringContracts = contracts.filter(c => c.contractThrough === currentYear);
      const expiringValue = expiringContracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0);
      const futureYears = [currentYear + 1, currentYear + 2, currentYear + 3];
      const committedFuture = contracts.reduce((sum, c) => {
        return sum + futureYears.reduce((s, y) => s + (c.parsedSalaries[y] || 0), 0);
      }, 0);

      return {
        rosterId: roster.rosterId,
        teamName: roster.teamName,
        ownerName: roster.teamName,
        avatar: roster.teamAvatar,
        capUsed,
        deadCapTotal,
        available,
        expiringValue,
        expiringCount: expiringContracts.length,
        committedFuture,
        contractCount: contracts.filter(c => (c.parsedSalaries[currentYear] || 0) > 0).length,
        franchiseTagsUsed: contracts.filter(c => c.franchiseTagUsed === 1).length,
      };
    });
  }, [allRosters, parsedContracts, deadCapEntries, currentYear]);

  const sorted = useMemo(() => {
    return [...teamSummaries].sort((a, b) => {
      let aVal = a[sortKey === "expiring" ? "expiringValue" : sortKey === "future" ? "committedFuture" : sortKey];
      let bVal = b[sortKey === "expiring" ? "expiringValue" : sortKey === "future" ? "committedFuture" : sortKey];
      return sortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
  }, [teamSummaries, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const leagueCapUsed = teamSummaries.reduce((s, t) => s + t.capUsed, 0);
  const avgCapUsed = teamSummaries.length > 0 ? leagueCapUsed / teamSummaries.length : 0;
  const avgAvailable = TOTAL_CAP - avgCapUsed;
  const totalExpiring = teamSummaries.reduce((s, t) => s + t.expiringValue, 0);

  return (
    <div className="space-y-5">
      {/* League-wide summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Avg Cap Used" value={formatMoney(avgCapUsed)} sub={`Avg space: ${formatMoney(avgAvailable)}`} icon={BarChart2} />
        <StatCard label="Total Expiring" value={formatMoney(totalExpiring)} sub={`Coming off books after ${currentYear}`} icon={Clock} />
        <StatCard label="Teams Over 80% Cap" value={String(teamSummaries.filter(t => t.capUsed / TOTAL_CAP > 0.8).length)} sub="at risk of cap issues" icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading uppercase tracking-wide">All-Team Cap Overview</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Team</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleSort("capUsed")}>
                    Cap Used <ArrowUpDown className="w-3 h-3 ml-1 inline" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Dead Cap</TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleSort("available")}>
                    Available <ArrowUpDown className="w-3 h-3 ml-1 inline" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleSort("expiring")}>
                    Expiring <ArrowUpDown className="w-3 h-3 ml-1 inline" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-semibold" onClick={() => toggleSort("future")}>
                    Committed Future <ArrowUpDown className="w-3 h-3 ml-1 inline" />
                  </Button>
                </TableHead>
                <TableHead className="text-center">Players</TableHead>
                <TableHead className="text-center">Tags</TableHead>
                <TableHead className="text-center w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(team => (
                <TableRow
                  key={team.rosterId}
                  className="cursor-pointer hover:bg-muted/50 text-sm"
                  onClick={() => onSelectTeam(team.rosterId)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        {team.avatar && <AvatarImage src={team.avatar} />}
                        <AvatarFallback className="text-[9px]">{getInitials(team.teamName)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium truncate max-w-[140px]">{team.teamName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatMoney(team.capUsed)}</span>
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (team.capUsed / TOTAL_CAP) * 100)}%`,
                            backgroundColor: team.capUsed / TOTAL_CAP > 0.9 ? "#ef4444" : team.capUsed / TOTAL_CAP > 0.75 ? "#f59e0b" : "#22c55e",
                          }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {team.deadCapTotal > 0 ? formatMoney(team.deadCapTotal) : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={team.available < 0 ? "text-red-500 font-semibold" : "text-emerald-600 font-semibold"}>
                      {formatMoney(team.available)}
                    </span>
                  </TableCell>
                  <TableCell>{formatMoney(team.expiringValue)} <span className="text-muted-foreground text-xs">({team.expiringCount})</span></TableCell>
                  <TableCell>{formatMoney(team.committedFuture)}</TableCell>
                  <TableCell className="text-center">{team.contractCount}</TableCell>
                  <TableCell className="text-center">{team.franchiseTagsUsed > 0 ? <Badge variant="outline" className="text-xs">{team.franchiseTagsUsed}</Badge> : "—"}</TableCell>
                  <TableCell className="text-center">
                    {team.capUsed / TOTAL_CAP > 0.9 ? (
                      <Badge variant="destructive" className="text-xs">Cap Risk</Badge>
                    ) : team.available < 0 ? (
                      <Badge variant="destructive" className="text-xs">Over Cap</Badge>
                    ) : team.capUsed / TOTAL_CAP < 0.5 ? (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/50">Flexible</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Normal</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Free Agency Tab ──────────────────────────────────────────────────────────

function FreeAgencyTab({
  allRosters,
  parsedContracts,
  playerMap,
  currentYear,
  onOpenPlayer,
}: {
  allRosters: AllRosterEntry[];
  parsedContracts: ParsedContract[];
  playerMap: Record<string, SleeperPlayer>;
  currentYear: number;
  onOpenPlayer: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const [filterPos, setFilterPos] = useState("ALL");
  const [filterSeason, setFilterSeason] = useState(String(currentYear));
  const [searchTerm, setSearchTerm] = useState("");

  const seasons = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  // Build team lookup
  const teamByRosterId: Record<number, string> = {};
  for (const r of allRosters) {
    teamByRosterId[r.rosterId] = r.teamName;
  }

  // Build performance lookup
  const perfByPlayerId: Record<string, RosterPlayer> = {};
  for (const r of allRosters) {
    for (const p of r.players) {
      perfByPlayerId[p.id] = p;
    }
  }

  const filterYear = Number(filterSeason);

  const expiringPlayers = useMemo(() => {
    return parsedContracts
      .filter(c => c.contractThrough === filterYear && (c.parsedSalaries[filterYear] || 0) > 0)
      .map(c => {
        const player = playerMap[c.playerId] || perfByPlayerId[c.playerId];
        const perf = perfByPlayerId[c.playerId];
        const teamName = teamByRosterId[c.rosterId] || `Team ${c.rosterId}`;
        return {
          ...c,
          playerName: player?.name || `Player ${c.playerId.slice(0, 6)}`,
          position: (player as any)?.position || "?",
          age: (player as any)?.age || null,
          teamName,
          currentSalary: c.parsedSalaries[filterYear] || 0,
          seasonPoints: perf?.seasonPoints || 0,
          weeklyAvg: perf?.weeklyAvg || 0,
          isFranchiseTagEligible: c.hasBeenFranchiseTagged === 0,
          isExtensionEligible: c.hasBeenExtended === 0,
        };
      })
      .filter(p => {
        if (filterPos !== "ALL" && p.position !== filterPos) return false;
        if (searchTerm && !p.playerName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.currentSalary - a.currentSalary);
  }, [parsedContracts, filterYear, filterPos, searchTerm, playerMap, perfByPlayerId, teamByRosterId]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            className="pl-9 h-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterSeason} onValueChange={setFilterSeason}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasons.map(y => (
              <SelectItem key={y} value={String(y)}>After {y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPos} onValueChange={setFilterPos}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Pos</SelectItem>
            {["QB", "RB", "WR", "TE", "K", "DEF"].map(pos => (
              <SelectItem key={pos} value={pos}>{pos}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {expiringPlayers.length} player{expiringPlayers.length !== 1 ? "s" : ""} ·{" "}
          {formatMoney(expiringPlayers.reduce((s, p) => s + p.currentSalary, 0))} off the books
        </div>
      </div>

      {/* Player table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">Player</TableHead>
                <TableHead className="w-10">Pos</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Age</TableHead>
                <TableHead className="text-right">Pts</TableHead>
                <TableHead className="text-right">PPG</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expiringPlayers.map(p => (
                <TableRow
                  key={`${p.rosterId}-${p.playerId}`}
                  className="text-sm cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => onOpenPlayer(p.playerId, p.rosterId, p as unknown as ParsedContract)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${p.playerId}.jpg`} className="object-cover" />
                        <AvatarFallback className="text-[9px]">{getInitials(p.playerName)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{p.playerName}</span>
                    </div>
                  </TableCell>
                  <TableCell><PosBadge pos={p.position} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.teamName}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(p.currentSalary)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{p.age ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.seasonPoints > 0 ? p.seasonPoints.toFixed(1) : "—"}</TableCell>
                  <TableCell className="text-right">{p.weeklyAvg > 0 ? p.weeklyAvg.toFixed(1) : "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.isFranchiseTagEligible && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/50 text-amber-600">Tag Eligible</Badge>
                      )}
                      {p.isExtensionEligible && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-500/50 text-blue-600">Ext. Window</Badge>
                      )}
                      {p.franchiseTagUsed === 1 && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-rose-500/50 text-rose-600">Tagged</Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {expiringPlayers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10 text-sm">
                    No expiring contracts found for the selected filters
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Roster Management Tab ────────────────────────────────────────────────────

function ExtensionModal({
  open,
  onClose,
  onConfirm,
  contract,
  playerName,
  position,
  currentSalary,
  currentYear,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (params: { extensionType: number; extensionYear: number }) => void;
  contract: ParsedContract | null;
  playerName: string;
  position: string;
  currentSalary: number;
  currentYear: number;
  isLoading: boolean;
}) {
  const [extensionType, setExtensionType] = useState<string>("1");
  if (!contract) return null;

  const contractThrough = contract.contractThrough || currentYear;
  const extensionYear = contractThrough + 1;
  const multipliers = [0, 1.2, 1.5, 1.8, 2.0];
  const extType = Number(extensionType);
  const projectedSalary = currentSalary * (multipliers[extType] || 1.2);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Apply Extension</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${contract.playerId}.jpg`} />
              <AvatarFallback>{getInitials(playerName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{playerName}</p>
              <div className="flex items-center gap-2">
                <PosBadge pos={position} />
                <span className="text-xs text-muted-foreground">Contract through {contractThrough}</span>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label className="text-sm">Extension Type</Label>
            <Select value={extensionType} onValueChange={setExtensionType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTENSION_TYPES.map(t => (
                  <SelectItem key={t.value} value={String(t.value)}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current salary</span>
              <span className="font-medium">{formatMoney(currentSalary)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extension year</span>
              <span className="font-medium">{extensionYear}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Multiplier</span>
              <span className="font-medium">{multipliers[extType]}×</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Projected extension salary</span>
              <span className="text-amber-500">{formatMoney(projectedSalary)}</span>
            </div>
          </div>
          {contract.isRookieContract === 1 && (
            <p className="text-xs text-blue-500">This is a rookie contract — counts toward the rookie extension limit (max 3/season).</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={() => onConfirm({ extensionType: extType, extensionYear })} disabled={isLoading} className="bg-amber-500 hover:bg-amber-600 text-black">
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Apply Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FranchiseTagModal({
  open,
  onClose,
  onConfirm,
  contract,
  playerName,
  position,
  currentSalary,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  contract: ParsedContract | null;
  playerName: string;
  position: string;
  currentSalary: number;
  isLoading: boolean;
}) {
  if (!contract) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Apply Franchise Tag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${contract.playerId}.jpg`} />
              <AvatarFallback>{getInitials(playerName)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{playerName}</p>
              <PosBadge pos={position} />
            </div>
          </div>
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm space-y-1">
            <p className="font-semibold text-amber-600">Franchise Tag Details</p>
            <p className="text-muted-foreground text-xs">
              Salary will be set to the top-5 average at this position ({position}).
              The player can only be tagged once per stint on this roster.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            Current salary: <span className="font-medium text-foreground">{formatMoney(currentSalary)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isLoading} variant="default">
            {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
            Apply Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RosterManagementTab({
  selectedRosterId,
  setSelectedRosterId,
  allRosters,
  parsedContracts,
  rawRosters,
  playerMap,
  extensions,
  currentYear,
  leagueId,
  userId,
  onOpenPlayer,
}: {
  selectedRosterId: number | null;
  setSelectedRosterId: (id: number) => void;
  allRosters: AllRosterEntry[];
  parsedContracts: ParsedContract[];
  rawRosters: any[];
  playerMap: Record<string, SleeperPlayer>;
  extensions: TeamExtension[];
  currentYear: number;
  leagueId: string;
  userId: string;
  onOpenPlayer: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterPos, setFilterPos] = useState("ALL");
  const [extensionTarget, setExtensionTarget] = useState<ParsedContract | null>(null);
  const [tagTarget, setTagTarget] = useState<ParsedContract | null>(null);

  const teamRaw = rawRosters.find(r => r.roster_id === selectedRosterId);
  const teamEntry = allRosters.find(r => r.rosterId === selectedRosterId);
  const teamContracts = parsedContracts.filter(c => c.rosterId === selectedRosterId);
  const teamExtensions = extensions.filter(e => e.rosterId === selectedRosterId);

  // All player IDs on this roster (including K/DEF)
  const allPlayerIds: string[] = teamRaw?.players || [];

  // Build performance map from all-rosters
  const perfMap: Record<string, RosterPlayer> = {};
  if (teamEntry) {
    for (const p of teamEntry.players) {
      perfMap[p.id] = p;
    }
  }

  // Enrich contract data with player metadata
  const enrichedContracts = useMemo(() => {
    // Contracts with metadata
    const contractedMap: Record<string, ParsedContract> = {};
    for (const c of teamContracts) contractedMap[c.playerId] = c;

    return allPlayerIds
      .map(pid => {
        const contract = contractedMap[pid];
        const player = playerMap[pid] || perfMap[pid];
        const perf = perfMap[pid];
        const name = perf?.name || player?.name || `Player ${pid.slice(0, 6)}`;
        const position = perf?.position || (player as any)?.position || "?";
        return {
          playerId: pid,
          name,
          position,
          age: perf?.age ?? (player as any)?.age ?? null,
          seasonPoints: perf?.seasonPoints ?? 0,
          weeklyAvg: perf?.weeklyAvg ?? 0,
          contract,
          hasSalary: contract && Object.values(contract.parsedSalaries).some(v => v > 0),
        };
      })
      .filter(p => {
        if (filterPos !== "ALL" && p.position !== filterPos) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
        const posA = posOrder.indexOf(a.position);
        const posB = posOrder.indexOf(b.position);
        if (posA !== posB) return posA - posB;
        const salA = a.contract?.parsedSalaries[currentYear] || 0;
        const salB = b.contract?.parsedSalaries[currentYear] || 0;
        return salB - salA;
      });
  }, [allPlayerIds, teamContracts, playerMap, perfMap, filterPos, search, currentYear]);

  // Extension mutation
  const extensionMutation = useMutation({
    mutationFn: async ({ extensionType, extensionYear }: { extensionType: number; extensionYear: number }) => {
      if (!extensionTarget) throw new Error("No target");
      const contract = extensionTarget;
      const currentSalary = contract.parsedSalaries[currentYear] || 0;
      const playerInfo = playerMap[contract.playerId] || perfMap[contract.playerId];
      const playerName = perfMap[contract.playerId]?.name || playerInfo?.name || "Player";

      const res = await fetch(`/api/league/${leagueId}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId: contract.rosterId,
          playerId: contract.playerId,
          playerName,
          currentSalary: Math.round(currentSalary * 10),
          extensionType,
          extensionYear,
          season: currentYear,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to apply extension");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "extensions", String(currentYear)] });
      setExtensionTarget(null);
      toast({ title: "Extension Applied", description: "Extension has been applied successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Extension Failed", description: err.message, variant: "destructive" });
    },
  });

  // Franchise tag mutation (commissioner bypass)
  const tagMutation = useMutation({
    mutationFn: async () => {
      if (!tagTarget) throw new Error("No target");
      const playerInfo = playerMap[tagTarget.playerId] || perfMap[tagTarget.playerId];
      const position = perfMap[tagTarget.playerId]?.position || (playerInfo as any)?.position || "FLEX";
      // POST with commissioner userId (server will accept commissioner bypass)
      const res = await fetch(`/api/league/${leagueId}/franchise-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          rosterId: tagTarget.rosterId,
          playerId: tagTarget.playerId,
          position,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to apply franchise tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      setTagTarget(null);
      toast({ title: "Franchise Tag Applied", description: "Franchise tag has been applied." });
    },
    onError: (err: Error) => {
      toast({ title: "Tag Failed", description: err.message, variant: "destructive" });
    },
  });

  // Undo franchise tag mutation
  const undoTagMutation = useMutation({
    mutationFn: async (contract: ParsedContract) => {
      const res = await fetch(`/api/league/${leagueId}/franchise-tag/undo`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, rosterId: contract.rosterId, playerId: contract.playerId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to undo franchise tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      toast({ title: "Franchise Tag Removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Undo Failed", description: err.message, variant: "destructive" });
    },
  });

  const extensionPlayerName = extensionTarget
    ? (perfMap[extensionTarget.playerId]?.name || playerMap[extensionTarget.playerId]?.name || "Player")
    : "";
  const extensionPosition = extensionTarget
    ? (perfMap[extensionTarget.playerId]?.position || (playerMap[extensionTarget.playerId] as any)?.position || "?")
    : "";
  const tagPlayerName = tagTarget
    ? (perfMap[tagTarget.playerId]?.name || playerMap[tagTarget.playerId]?.name || "Player")
    : "";
  const tagPosition = tagTarget
    ? (perfMap[tagTarget.playerId]?.position || (playerMap[tagTarget.playerId] as any)?.position || "?")
    : "";

  const capUsed = teamContracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0);
  const capSpace = TOTAL_CAP - capUsed;

  return (
    <div className="space-y-5">
      {/* Team selector & cap bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {teamEntry?.teamAvatar && (
            <Avatar className="w-9 h-9">
              <AvatarImage src={teamEntry.teamAvatar} />
              <AvatarFallback>{getInitials(teamEntry.teamName)}</AvatarFallback>
            </Avatar>
          )}
          <div>
            <p className="font-semibold font-heading text-sm">{teamEntry?.teamName || "No team selected"}</p>
            {selectedRosterId && (
              <p className="text-xs text-muted-foreground">
                Cap used: <span className="font-semibold text-foreground">{formatMoney(capUsed)}</span>
                {" / "}${TOTAL_CAP} ·{" "}
                <span className={capSpace < 0 ? "text-red-500" : "text-emerald-600"}>{formatMoney(capSpace)} available</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-8 h-8 w-40 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterPos} onValueChange={setFilterPos}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Pos</SelectItem>
              {["QB", "RB", "WR", "TE", "K", "DEF"].map(pos => (
                <SelectItem key={pos} value={pos}>{pos}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pending extensions for this team */}
      {teamExtensions.filter(e => e.status === "pending").length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold text-amber-600 mb-2 uppercase tracking-wide">Pending Extensions</p>
          <div className="flex flex-wrap gap-2">
            {teamExtensions
              .filter(e => e.status === "pending")
              .map(ext => (
                <div key={ext.id} className="flex items-center gap-2 rounded border border-amber-500/20 bg-background px-2 py-1 text-xs">
                  <span className="font-medium">{ext.playerName}</span>
                  <span className="text-muted-foreground">{EXTENSION_TYPES.find(t => t.value === ext.extensionType)?.label?.split(" ")[0] || `${ext.extensionType}-yr`} ext</span>
                  <span className="text-amber-500">{formatMoney(ext.extensionSalary / 10)}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/50">Pending</Badge>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Contract table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">Player</TableHead>
                  <TableHead>Pos</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  {[currentYear, currentYear + 1, currentYear + 2, currentYear + 3].map(y => (
                    <TableHead key={y} className="text-right w-16">{y}</TableHead>
                  ))}
                  <TableHead className="text-right w-16">Thru</TableHead>
                  <TableHead className="text-center w-24">Type</TableHead>
                  <TableHead className="text-center w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedContracts.map(row => {
                  const c = row.contract;
                  const hasTag = c?.franchiseTagUsed === 1;
                  const hasExt = c?.extensionApplied === 1;
                  const canTag = c && c.hasBeenFranchiseTagged === 0 && !hasTag;
                  const canExtend = c && c.hasBeenExtended === 0 && !hasExt;
                  return (
                    <TableRow
                      key={row.playerId}
                      className={`text-sm cursor-pointer hover:bg-muted/60 transition-colors ${!row.hasSalary ? "opacity-60" : ""}`}
                      onClick={() => onOpenPlayer(row.playerId, selectedRosterId ?? 0, c ?? null)}
                    >
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-7 h-7">
                            <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${row.playerId}.jpg`} className="object-cover" />
                            <AvatarFallback className="text-[9px]">{getInitials(row.name)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium truncate max-w-[130px]">{row.name}</span>
                        </div>
                      </TableCell>
                      <TableCell><PosBadge pos={row.position} /></TableCell>
                      <TableCell className="text-right text-muted-foreground">{row.age ?? "—"}</TableCell>
                      <TableCell className="text-right">{row.seasonPoints > 0 ? row.seasonPoints.toFixed(1) : "—"}</TableCell>
                      {[currentYear, currentYear + 1, currentYear + 2, currentYear + 3].map(y => (
                        <TableCell key={y} className="text-right">
                          {c && (c.parsedSalaries[y] || 0) > 0
                            ? <span className={y === currentYear ? "font-semibold text-amber-500" : ""}>{formatMoney(c.parsedSalaries[y] || 0)}</span>
                            : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right text-muted-foreground text-xs">{c?.contractThrough ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {hasTag && <Badge className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-600 border-amber-500/30 border">Tagged</Badge>}
                          {hasExt && <Badge className="text-[9px] px-1 py-0 bg-blue-500/20 text-blue-600 border-blue-500/30 border">Extended</Badge>}
                          {c?.isRookieContract === 1 && <Badge className="text-[9px] px-1 py-0 bg-emerald-500/20 text-emerald-600 border-emerald-500/30 border">Rookie</Badge>}
                          {!c && <span className="text-[9px] text-muted-foreground">No contract</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {c && (
                          <div className="flex justify-center gap-1">
                            {canExtend && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                                onClick={e => { e.stopPropagation(); setExtensionTarget(c); }}
                              >
                                Extend
                              </Button>
                            )}
                            {canTag && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px] border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                                onClick={e => { e.stopPropagation(); setTagTarget(c); }}
                              >
                                Tag
                              </Button>
                            )}
                            {hasTag && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                                onClick={e => { e.stopPropagation(); undoTagMutation.mutate(c); }}
                                disabled={undoTagMutation.isPending}
                              >
                                Undo Tag
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {enrichedContracts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8 text-sm">
                      No players found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Modals */}
      <ExtensionModal
        open={!!extensionTarget}
        onClose={() => setExtensionTarget(null)}
        onConfirm={params => extensionMutation.mutate(params)}
        contract={extensionTarget}
        playerName={extensionPlayerName}
        position={extensionPosition}
        currentSalary={extensionTarget?.parsedSalaries[currentYear] || 0}
        currentYear={currentYear}
        isLoading={extensionMutation.isPending}
      />
      <FranchiseTagModal
        open={!!tagTarget}
        onClose={() => setTagTarget(null)}
        onConfirm={() => tagMutation.mutate()}
        contract={tagTarget}
        playerName={tagPlayerName}
        position={tagPosition}
        currentSalary={tagTarget?.parsedSalaries[currentYear] || 0}
        isLoading={tagMutation.isPending}
      />
    </div>
  );
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────

function ApprovalsTab({
  approvals,
  leagueId,
  userId,
}: {
  approvals: ApprovalRequest[];
  leagueId: string;
  userId: string;
}) {
  const { toast } = useToast();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const approveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const res = await fetch(`/api/league/${leagueId}/contract-approvals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewerNotes: notes || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update approval");
      }
      return res.json();
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contract-approvals"] });
      setReviewingId(null);
      setNotes("");
      toast({ title: `Request ${status === "approved" ? "Approved" : "Rejected"}` });
    },
    onError: (err: Error) => {
      toast({ title: "Action Failed", description: err.message, variant: "destructive" });
    },
  });

  const pending = approvals.filter(a => a.status === "pending");
  const resolved = approvals.filter(a => a.status !== "pending");

  return (
    <div className="space-y-5">
      {pending.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CheckCircle className="w-10 h-10 mb-3 text-emerald-500" />
          <p className="font-medium">No pending approvals</p>
          <p className="text-sm">All contract approval requests have been reviewed.</p>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Pending ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map(req => {
              let contractCount = 0;
              try {
                const parsed = JSON.parse(req.contractsJson || "[]");
                contractCount = Array.isArray(parsed) ? parsed.length : 0;
              } catch { /* noop */ }
              return (
                <Card key={req.id} className="border-amber-500/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{req.teamName}</p>
                        <p className="text-xs text-muted-foreground">{req.ownerName}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {contractCount} contract{contractCount !== 1 ? "s" : ""} ·{" "}
                          Submitted {new Date(req.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {reviewingId === req.id ? (
                        <div className="flex flex-col gap-2 items-end min-w-[200px]">
                          <Input
                            placeholder="Notes (optional)"
                            className="h-8 text-xs"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => { setReviewingId(null); setNotes(""); }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-500/50 text-red-500 hover:bg-red-500/10"
                              onClick={() => approveMutation.mutate({ id: req.id, status: "rejected" })}
                              disabled={approveMutation.isPending}
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => approveMutation.mutate({ id: req.id, status: "approved" })}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReviewingId(req.id); setNotes(""); }}>
                          Review
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Recently Reviewed ({resolved.length})
          </h3>
          <div className="space-y-2">
            {resolved.slice(0, 10).map(req => (
              <div key={req.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{req.teamName}</span>
                  <span className="text-muted-foreground text-xs ml-2">
                    {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : ""}
                  </span>
                </div>
                {req.status === "approved" ? (
                  <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 border text-xs">Approved</Badge>
                ) : (
                  <Badge variant="outline" className="border-red-500/50 text-red-500 text-xs">Rejected</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ContractsHub() {
  const { user, league, season } = useSleeper();
  const [, setLocation] = useLocation();
  const currentYear = parseInt(season) || new Date().getFullYear();

  const isCommissioner = !!(
    user?.userId &&
    league &&
    ((league.commissionerId && user.userId === league.commissionerId) ||
      COMMISSIONER_USER_IDS.includes(user.userId))
  );

  useEffect(() => {
    if (user && league && !isCommissioner) setLocation("/");
  }, [user, league, isCommissioner, setLocation]);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);
  const [playerTarget, setPlayerTarget] = useState<PlayerCardTarget | null>(null);

  // Data fetching
  const { data: allRosters = [], isLoading: rostersLoading } = useQuery<AllRosterEntry[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "all-rosters"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: rawRosters = [] } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "rosters"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: dbContracts = [] } = useQuery<DbPlayerContract[]>({
    queryKey: ["/api/league", league?.leagueId, "contracts"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: deadCapEntries = [] } = useQuery<DbDeadCapEntry[]>({
    queryKey: ["/api/leagues", league?.leagueId, "dead-cap"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: extensions = [] } = useQuery<TeamExtension[]>({
    queryKey: ["/api/league", league?.leagueId, "extensions", String(currentYear)],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/extensions/${currentYear}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: approvals = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/league", league?.leagueId, "contract-approvals"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const { data: playersArray = [] } = useQuery<SleeperPlayer[]>({
    queryKey: ["/api/sleeper/players"],
    enabled: !!league?.leagueId && isCommissioner,
  });

  const playerMap = useMemo(() => {
    const map: Record<string, SleeperPlayer> = {};
    for (const p of playersArray) {
      map[p.id] = p;
    }
    return map;
  }, [playersArray]);

  const parsedContracts: ParsedContract[] = useMemo(() => {
    return dbContracts.map(c => {
      const parsedSalaries = parseSalaries(c.salaries);
      const contractThrough = getContractThrough(parsedSalaries);
      return { ...c, parsedSalaries, contractThrough };
    });
  }, [dbContracts]);

  // Auto-select first team
  useEffect(() => {
    if (allRosters.length > 0 && selectedRosterId === null) {
      setSelectedRosterId(allRosters[0].rosterId);
    }
  }, [allRosters, selectedRosterId]);

  const openPlayer = useCallback((playerId: string, rosterId: number, contract: ParsedContract | null) => {
    const teamEntry = allRosters.find(r => r.rosterId === rosterId);
    setPlayerTarget({
      playerId,
      rosterId,
      contract,
      teamName: teamEntry?.teamName ?? `Team ${rosterId}`,
    });
  }, [allRosters]);

  if (user && league && !isCommissioner) return null;

  const selectedTeamEntry = allRosters.find(r => r.rosterId === selectedRosterId);
  const pendingApprovalsCount = approvals.filter(a => a.status === "pending").length;

  const isLoading = rostersLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-widest">{league?.name}</span>
                <span>·</span>
                <span>CONTRACTS HUB</span>
                <span>·</span>
                <span>{currentYear} Season</span>
              </div>
              <h1 className="text-2xl font-bold font-heading tracking-tight">
                {selectedTeamEntry?.teamName || "Team Contracts Hub"}
              </h1>
              {selectedTeamEntry && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  Viewing team finances and roster contracts
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground">View team</div>
              <Select
                value={selectedRosterId ? String(selectedRosterId) : ""}
                onValueChange={v => setSelectedRosterId(Number(v))}
              >
                <SelectTrigger className="w-48 h-9">
                  <SelectValue placeholder="Select team..." />
                </SelectTrigger>
                <SelectContent>
                  {allRosters.map(r => (
                    <SelectItem key={r.rosterId} value={String(r.rosterId)}>
                      {r.teamName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 h-auto flex-wrap gap-1 bg-muted/50 p-1">
              <TabsTrigger value="overview" className="text-xs sm:text-sm">
                <Building2 className="w-3.5 h-3.5 mr-1.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="league-cap" className="text-xs sm:text-sm">
                <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
                League Cap
              </TabsTrigger>
              <TabsTrigger value="free-agency" className="text-xs sm:text-sm">
                <Users className="w-3.5 h-3.5 mr-1.5" />
                Free Agency
              </TabsTrigger>
              <TabsTrigger value="roster-management" className="text-xs sm:text-sm">
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Roster Management
              </TabsTrigger>
              <TabsTrigger value="approvals" className="relative text-xs sm:text-sm">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Approvals
                {pendingApprovalsCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-bold">
                    {pendingApprovalsCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab
                selectedRosterId={selectedRosterId}
                setSelectedRosterId={setSelectedRosterId}
                allRosters={allRosters}
                parsedContracts={parsedContracts}
                deadCapEntries={deadCapEntries}
                currentYear={currentYear}
                onOpenPlayer={openPlayer}
              />
            </TabsContent>

            <TabsContent value="league-cap">
              <LeagueCapTab
                allRosters={allRosters}
                parsedContracts={parsedContracts}
                deadCapEntries={deadCapEntries}
                currentYear={currentYear}
                onSelectTeam={id => {
                  setSelectedRosterId(id);
                  setActiveTab("overview");
                }}
              />
            </TabsContent>

            <TabsContent value="free-agency">
              <FreeAgencyTab
                allRosters={allRosters}
                parsedContracts={parsedContracts}
                playerMap={playerMap}
                currentYear={currentYear}
                onOpenPlayer={openPlayer}
              />
            </TabsContent>

            <TabsContent value="roster-management">
              <RosterManagementTab
                selectedRosterId={selectedRosterId}
                setSelectedRosterId={setSelectedRosterId}
                allRosters={allRosters}
                parsedContracts={parsedContracts}
                rawRosters={rawRosters}
                playerMap={playerMap}
                extensions={extensions}
                currentYear={currentYear}
                leagueId={league?.leagueId || ""}
                userId={user?.userId || ""}
                onOpenPlayer={openPlayer}
              />
            </TabsContent>

            <TabsContent value="approvals">
              <ApprovalsTab
                approvals={approvals}
                leagueId={league?.leagueId || ""}
                userId={user?.userId || ""}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Player Detail Sheet */}
      <PlayerDetailSheet
        target={playerTarget}
        onClose={() => setPlayerTarget(null)}
        allRosters={allRosters.map(r => ({ rosterId: r.rosterId, teamName: r.teamName }))}
        parsedContracts={parsedContracts}
        currentYear={currentYear}
      />
    </div>
  );
}
