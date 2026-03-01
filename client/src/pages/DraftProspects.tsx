import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import SetupModal from "@/components/SetupModal";
import {
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Award,
  Activity,
  Star,
  FileUp,
} from "lucide-react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DraftProspect } from "@shared/schema";

const COMMISSIONER_USER_IDS = ["900186363130503168"];

const DEFAULT_SEASON = "2026";
const ADP_RANGE_TOLERANCE = 2;

type ProspectEnriched = DraftProspect & {
  photoUrl?: string | null;
  sleeperTeam?: string | null;
  sleeperCollege?: string | null;
};

const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/90 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500/90 text-white",
  TE: "bg-orange-500/90 text-white",
};

function parseCombineData(combineData: string | null): Record<string, string> {
  if (!combineData) return {};
  try {
    return JSON.parse(combineData) as Record<string, string>;
  } catch {
    return {};
  }
}

function parseCollegeAwards(collegeAwards: string | null): string[] {
  if (!collegeAwards) return [];
  try {
    const arr = JSON.parse(collegeAwards);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

type AdvancedStatsPayload = {
  speedScore: number | null;
  dominatorByYear: { year: number; dominator: number }[];
  bestDominator: number | null;
  breakoutSeason: number | null;
  yprrByYear: { year: number; yprr: number }[];
  bestYprr: number | null;
  dominatorUnavailableReason?: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRate(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null || n < 0) return null;
  // Guard against payloads that may send a percentage instead of a fraction.
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function parseAdvancedStats(advancedStats: string | null): AdvancedStatsPayload | null {
  if (!advancedStats) return null;
  try {
    const parsed = JSON.parse(advancedStats) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const raw = parsed as Record<string, unknown>;

    const dominatorByYear = Array.isArray(raw.dominatorByYear)
      ? raw.dominatorByYear
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const year = toFiniteNumber(row.year);
            const dominator = toRate(row.dominator);
            if (year == null || dominator == null) return null;
            return { year: Math.round(year), dominator };
          })
          .filter((x): x is { year: number; dominator: number } => x != null)
      : [];

    const yprrByYear = Array.isArray(raw.yprrByYear)
      ? raw.yprrByYear
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const year = toFiniteNumber(row.year);
            const yprr = toFiniteNumber(row.yprr);
            if (year == null || yprr == null) return null;
            return { year: Math.round(year), yprr };
          })
          .filter((x): x is { year: number; yprr: number } => x != null)
      : [];

    const speedScore = toFiniteNumber(raw.speedScore);
    const bestDominator = toRate(raw.bestDominator);
    const breakoutSeasonRaw = toFiniteNumber(raw.breakoutSeason);
    const breakoutSeason = breakoutSeasonRaw != null ? Math.round(breakoutSeasonRaw) : null;
    const bestYprr = toFiniteNumber(raw.bestYprr);
    const dominatorUnavailableReason =
      typeof raw.dominatorUnavailableReason === "string" && raw.dominatorUnavailableReason.trim()
        ? raw.dominatorUnavailableReason.trim()
        : null;

    return {
      speedScore,
      dominatorByYear,
      bestDominator,
      breakoutSeason,
      yprrByYear,
      bestYprr,
      dominatorUnavailableReason,
    };
  } catch {
    return null;
  }
}

type StatTier = "elite" | "mediocre" | "below";

function getSpeedScoreTier(score: number): StatTier {
  if (score >= 110) return "elite";
  if (score >= 100) return "mediocre";
  return "below";
}

function getDominatorTier(rate: number): StatTier {
  if (rate >= 0.3) return "elite";
  if (rate >= 0.2) return "mediocre";
  return "below";
}

function getYprrTier(yprr: number): StatTier {
  if (yprr >= 2) return "elite";
  if (yprr >= 1.2) return "mediocre";
  return "below";
}

const STAT_TIER_CLASS: Record<StatTier, string> = {
  elite: "font-mono font-medium text-emerald-600 dark:text-emerald-400",
  mediocre: "font-mono font-medium text-amber-600 dark:text-amber-400",
  below: "font-mono font-medium text-red-600 dark:text-red-400",
};

// Combine metrics for radar: key in combineData -> { label, lowerIsBetter }
const COMBINE_RADAR_METRICS: Record<
  string,
  { label: string; lowerIsBetter: boolean }
> = {
  "40Yd": { label: "40 yd", lowerIsBetter: true },
  "10YdSplit": { label: "10 yd", lowerIsBetter: true },
  vertical: { label: "Vertical", lowerIsBetter: false },
  broad: { label: "Broad", lowerIsBetter: false },
  bench: { label: "Bench", lowerIsBetter: false },
  "3cone": { label: "3-cone", lowerIsBetter: true },
  shuttle: { label: "Shuttle", lowerIsBetter: true },
};

function parseCombineNumber(v: string): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Build radar data: rank vs other prospects in same position (100 = best, further out = better). */
function buildCombineRadarData(
  prospect: ProspectEnriched,
  allProspects: ProspectEnriched[]
): { subject: string; value: number; fullMark: 100 }[] {
  const rows: { subject: string; value: number; fullMark: 100 }[] = [];
  const myCombine = parseCombineData(prospect.combineData);
  const position = (prospect.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
  const samePositionProspects =
    position != null
      ? allProspects.filter((p) => {
          const pPos = (p.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
          return pPos === position;
        })
      : [];

  for (const [key, { label, lowerIsBetter }] of Object.entries(COMBINE_RADAR_METRICS)) {
    const myVal = parseCombineNumber(myCombine[key] ?? "");
    if (myVal === null) continue;

    const valuesWithId = samePositionProspects
      .map((p) => {
        const val = parseCombineNumber(
          (parseCombineData(p.combineData)[key] ?? "") as string
        );
        return val !== null ? { id: p.id, val } : null;
      })
      .filter((x): x is { id: string; val: number } => x != null);

    if (valuesWithId.length < 2) continue;

    if (lowerIsBetter) valuesWithId.sort((a, b) => a.val - b.val);
    else valuesWithId.sort((a, b) => b.val - a.val);

    const rank = valuesWithId.findIndex((x) => x.id === prospect.id) + 1;
    if (rank < 1) continue;
    const n = valuesWithId.length;
    const score = n <= 1 ? 100 : ((n - rank + 1) / n) * 100;
    rows.push({ subject: label, value: Math.round(score), fullMark: 100 });
  }

  return rows;
}

export default function DraftProspects() {
  const { user, league } = useSleeper();
  const { toast } = useToast();
  const [showSetup, setShowSetup] = useState(false);
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [detailProspect, setDetailProspect] = useState<ProspectEnriched | null>(null);
  const [editProspect, setEditProspect] = useState<ProspectEnriched | null>(null);
  const [deleteProspectId, setDeleteProspectId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [rasImportOpen, setRasImportOpen] = useState(false);
  const [rasImportCsv, setRasImportCsv] = useState("");
  const [combineImportOpen, setCombineImportOpen] = useState(false);
  const [combineImportCsv, setCombineImportCsv] = useState("");
  const [editForm, setEditForm] = useState<Partial<DraftProspect>>({});

  const isCommissioner = !!(
    user?.userId &&
    league &&
    ((league.commissionerId && user.userId === league.commissionerId) ||
      COMMISSIONER_USER_IDS.includes(user.userId))
  );

  const queryKey = ["/api/league", league?.leagueId, "draft-prospects", season];
  const {
    data: prospects = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProspectEnriched[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects?season=${encodeURIComponent(season)}`
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error || res.statusText || "Failed to fetch draft prospects";
        throw new Error(msg);
      }
      return body;
    },
    enabled: !!league?.leagueId,
  });

  const { data: standings } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const { data: draftPicks } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: allRosters } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "all-rosters"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/all-rosters`);
      if (!res.ok) throw new Error("Failed to fetch rosters");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const userTeam = standings?.find((s: { isUser?: boolean; rosterId?: number }) => s.isUser);
  const userRosterId = userTeam?.rosterId;
  const totalTeams = standings?.length ?? 0;

  const { userPickNumbers, needPositions, userPicks } = useMemo(() => {
    const picks: number[] = [];
    const need = new Set<string>();
    const emptyUserPicks: { round: number; draftSlot: number; pickNum: number }[] = [];
    if (!userRosterId || totalTeams < 1)
      return { userPickNumbers: picks, needPositions: need, userPicks: emptyUserPicks };

    const myPicks = (draftPicks || []).filter(
      (p: { currentOwnerId?: number; season?: string; round?: number }) =>
        p.currentOwnerId === userRosterId &&
        p.season === season &&
        (p.round ?? 1) <= 3
    );
    const userPicksList: { round: number; draftSlot: number; pickNum: number }[] = myPicks.map(
      (p: { round?: number; draftSlot?: number }) => {
        const round = p.round ?? 1;
        const draftSlot = p.draftSlot ?? 1;
        return { round, draftSlot, pickNum: (round - 1) * totalTeams + draftSlot };
      }
    );
    userPicksList.sort((a, b) => a.pickNum - b.pickNum);
    userPicksList.forEach((u) => picks.push(u.pickNum));

    const userRoster = (allRosters || []).find(
      (r: { rosterId?: number }) => r.rosterId === userRosterId
    );
    const players = (userRoster?.players || []) as { position?: string }[];
    const countByPos: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    players.forEach((pl) => {
      const pos = (pl.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || "";
      if (pos && countByPos[pos] !== undefined) countByPos[pos]++;
    });
    const entries = Object.entries(countByPos).sort((a, b) => a[1] - b[1]);
    entries.slice(0, 2).forEach(([pos]) => need.add(pos));
    if (need.size === 0) need.add("QB").add("RB").add("WR").add("TE");

    return { userPickNumbers: picks, needPositions: need, userPicks: userPicksList };
  }, [userRosterId, totalTeams, draftPicks, season, allRosters]);

  const idealPerPick = useMemo(() => {
    type Row = { pickLabel: string; pickNum: number; prospect: ProspectEnriched | null };
    const result: Row[] = [];
    for (const { round, draftSlot, pickNum } of userPicks) {
      const pickLabel = `${round}.${String(draftSlot).padStart(2, "0")}`;
      const inRange = (p: ProspectEnriched) => {
        if (p.adp == null) return false;
        const adp = Number(p.adp);
        return (
          Math.abs(adp - pickNum) <= ADP_RANGE_TOLERANCE &&
          pickNum >= adp - ADP_RANGE_TOLERANCE
        );
      };
      const pos = (p: ProspectEnriched) =>
        (p.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || "";
      const need = (p: ProspectEnriched) => needPositions.has(pos(p));
      const candidates = prospects.filter(inRange);
      const sorted = [...candidates].sort((a, b) => {
        const needA = need(a);
        const needB = need(b);
        if (needA !== needB) return needB ? 1 : -1;
        const adpA = Number(a.adp);
        const adpB = Number(b.adp);
        const diffA = Math.abs(adpA - pickNum);
        const diffB = Math.abs(adpB - pickNum);
        if (diffA !== diffB) return diffA - diffB;
        return (a.rank ?? 99) - (b.rank ?? 99);
      });
      result.push({ pickLabel, pickNum, prospect: sorted[0] ?? null });
    }
    return result;
  }, [userPicks, prospects, needPositions]);

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/refresh`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Refresh failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Refreshed", description: "Combine & awards data updated." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Refresh failed", description: e.message });
    },
  });

  const rasImportMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/ras`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season, csv }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "RAS import failed");
      }
      return res.json();
    },
    onSuccess: (data: { updated: number }) => {
      queryClient.invalidateQueries({ queryKey });
      setRasImportOpen(false);
      setRasImportCsv("");
      toast({ title: "RAS data imported", description: `${data.updated ?? 0} prospects updated.` });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "RAS import failed", description: e.message });
    },
  });

  const combineImportMutation = useMutation({
    mutationFn: async (csv: string) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/combine-csv`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season, csv }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Combine CSV import failed");
      }
      return res.json();
    },
    onSuccess: (data: { success: boolean; updatedCount: number }) => {
      queryClient.invalidateQueries({ queryKey });
      setCombineImportOpen(false);
      setCombineImportCsv("");
      toast({ title: "Combine CSV imported", description: `${data.updatedCount ?? 0} prospects updated.` });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Combine CSV import failed", description: e.message });
    },
  });

  const advancedStatsRefreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/advanced-stats`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Advanced stats refresh failed");
      }
      return res.json();
    },
    onSuccess: (data: { updated: number }) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Advanced stats updated", description: `${data.updated ?? 0} prospects updated.` });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Advanced stats refresh failed", description: e.message });
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (items: Array<{ displayName: string; position?: string; school?: string; age?: number; adp?: number }>) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user?.userId,
            season,
            prospects: items,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Bulk add failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setBulkOpen(false);
      setBulkText("");
      toast({ title: "Prospects added", description: "List updated." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Bulk add failed", description: e.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, ...data }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditProspect(null);
      setEditForm({});
      toast({ title: "Updated", description: "Prospect updated." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: e.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/${id}?userId=${encodeURIComponent(user!.userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDeleteProspectId(null);
      setDetailProspect(null);
      toast({ title: "Deleted", description: "Prospect removed." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season, orderedIds }),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Reorder failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Reordered", description: "Order updated." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Reorder failed", description: e.message });
    },
  });

  function handleBulkSubmit() {
    const lines = bulkText
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const items = lines.map((line) => {
      const parts = line.split(/[\t|]+/).map((s) => s.trim());
      const displayName = parts[0] || "";
      const position = parts[1] || undefined;
      const age = parts[2] ? parseInt(parts[2], 10) : undefined;
      const adp = parts[3] ? parseFloat(parts[3]) : undefined;
      return { displayName, position, age, adp };
    });
    if (items.some((i) => !i.displayName)) {
      toast({ variant: "destructive", title: "Invalid input", description: "Each line must have at least a name." });
      return;
    }
    if (items.length > 40) {
      toast({ variant: "destructive", title: "Too many", description: "Maximum 40 prospects." });
      return;
    }
    bulkAddMutation.mutate(items);
  }

  function handleMoveUp(idx: number) {
    if (idx <= 0) return;
    const next = [...prospects];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    reorderMutation.mutate(next.map((p) => p.id));
  }

  function handleMoveDown(idx: number) {
    if (idx >= prospects.length - 1) return;
    const next = [...prospects];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    reorderMutation.mutate(next.map((p) => p.id));
  }

  function handleSaveEdit() {
    if (!editProspect) return;
    const data: Record<string, unknown> = {};
    if (editForm.displayName !== undefined) data.displayName = editForm.displayName;
    if (editForm.school !== undefined) data.school = editForm.school;
    if (editForm.position !== undefined) data.position = editForm.position;
    if (editForm.age !== undefined) data.age = editForm.age;
    if (editForm.adp !== undefined) data.adp = editForm.adp;
    if (editForm.overview !== undefined) data.overview = editForm.overview;
    if (editForm.sleeperPlayerId !== undefined) data.sleeperPlayerId = editForm.sleeperPlayerId;
    if (editForm.nflTeam !== undefined) data.nflTeam = editForm.nflTeam;
    if (Object.keys(data).length === 0) {
      setEditProspect(null);
      return;
    }
    updateMutation.mutate({ id: editProspect.id, data });
  }

  if (!league?.leagueId) {
    return (
      <>
        <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">Select a league to view draft prospects.</p>
              <Button className="mt-4" onClick={() => setShowSetup(true)}>
                Set up league
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Draft Prospects</h1>
            <p className="text-muted-foreground">
              Top 40 incoming {season} rookies (QB, RB, WR, TE) with combine and awards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="season-dp" className="text-sm text-muted-foreground">
              Season
            </Label>
            <Input
              id="season-dp"
              className="w-20"
              value={season}
              onChange={(e) => setSeason(e.target.value.trim() || DEFAULT_SEASON)}
            />
            {isCommissioner && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkOpen(true)}
                  disabled={bulkAddMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Bulk add
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refreshMutation.mutate()}
                  disabled={refreshMutation.isPending || prospects.length === 0}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Refresh combine & awards
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCombineImportOpen(true)}
                  disabled={combineImportMutation.isPending || prospects.length === 0}
                >
                  <FileUp className="w-4 h-4 mr-1" />
                  Import combine CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRasImportOpen(true)}
                  disabled={rasImportMutation.isPending || prospects.length === 0}
                >
                  <FileUp className="w-4 h-4 mr-1" />
                  Import RAS
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => advancedStatsRefreshMutation.mutate()}
                  disabled={advancedStatsRefreshMutation.isPending || prospects.length === 0}
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${advancedStatsRefreshMutation.isPending ? "animate-spin" : ""}`} />
                  Refresh advanced stats
                </Button>
              </>
            )}
          </div>
        </div>

        {isError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive mb-3">
                {(error as Error)?.message || "Failed to load draft prospects."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <>
            {userRosterId && userPicks.length > 0 && prospects.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your picks & ideal prospects</CardTitle>
                  <CardDescription>
                    One recommended prospect per draft pick (in range, position of need when
                    possible).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {idealPerPick.map(({ pickLabel, pickNum, prospect }) => (
                      <div
                        key={pickNum}
                        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-card-foreground"
                      >
                        <span className="font-mono font-medium">{pickLabel}</span>
                        <span className="text-muted-foreground">→</span>
                        {prospect ? (
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-left hover:underline"
                            onClick={() => setDetailProspect(prospect)}
                          >
                            {prospect.position && (
                              <Badge
                                className={
                                  POSITION_COLORS[prospect.position] ||
                                  "bg-muted text-muted-foreground"
                                }
                              >
                                {prospect.position}
                              </Badge>
                            )}
                            <span className="font-medium">{prospect.displayName}</span>
                            <span className="text-muted-foreground">
                              ADP {prospect.adp != null ? Number(prospect.adp).toFixed(1) : "—"}
                            </span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No prospect in range
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
            <CardHeader>
              <CardTitle>Prospects</CardTitle>
              <CardDescription>
                RK, name, POS, ADP, age, school, NFL team, and combine highlight.
                {userRosterId && (
                  <span className="block mt-1 text-muted-foreground">
                    Highlighted = in your pick range, a position of need, and where the pick is not a reach.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {prospects.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No prospects yet.
                  {isCommissioner && " Use Bulk add to add up to 40 prospects."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">RK</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>POS</TableHead>
                        <TableHead>ADP</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>School</TableHead>
                        <TableHead>NFL Team</TableHead>
                        <TableHead>40</TableHead>
                        <TableHead>RAS</TableHead>
                        <TableHead>Speed</TableHead>
                        {isCommissioner && <TableHead className="w-32">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prospects.map((p, idx) => {
                        const combine = parseCombineData(p.combineData);
                        const forty = combine["40Yd"] ?? "";
                        const nflTeam = p.sleeperTeam ?? p.nflTeam ?? "";
                        const adv = parseAdvancedStats(p.advancedStats ?? null);
                        const prospectPos = (p.position ?? "")
                          .trim()
                          .toUpperCase()
                          .replace(/[0-9]/g, "")
                          || null;
                        const inRange =
                          p.adp != null &&
                          userPickNumbers.some((pickNum) => {
                            const adp = Number(p.adp);
                            return (
                              Math.abs(adp - pickNum) <= ADP_RANGE_TOLERANCE &&
                              pickNum >= adp - ADP_RANGE_TOLERANCE
                            );
                          });
                        const positionNeed =
                          prospectPos != null && needPositions.has(prospectPos);
                        const isIdeal = inRange && positionNeed;
                        return (
                          <TableRow
                            key={p.id}
                            className={`cursor-pointer ${isIdeal ? "bg-primary/5" : ""}`}
                            onClick={() => setDetailProspect(p)}
                          >
                            <TableCell className="font-mono">{p.rank}</TableCell>
                            <TableCell className="font-medium">
                              <span className="flex items-center gap-1.5">
                                {p.displayName}
                                {isIdeal && (
                                  <Badge variant="secondary" className="text-xs gap-0.5">
                                    <Star className="w-3 h-3 fill-current" />
                                    Ideal pick
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>
                              {p.position && (
                                <Badge
                                  className={
                                    POSITION_COLORS[p.position] ||
                                    "bg-muted text-muted-foreground"
                                  }
                                >
                                  {p.position}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{p.adp != null ? Number(p.adp).toFixed(1) : "—"}</TableCell>
                            <TableCell>{p.age ?? "—"}</TableCell>
                            <TableCell>{p.school ?? p.sleeperCollege ?? "—"}</TableCell>
                            <TableCell>{nflTeam || "—"}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {forty || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {p.ras != null ? Number(p.ras).toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="font-mono">
                              {adv?.speedScore != null ? (
                                <span className={STAT_TIER_CLASS[getSpeedScoreTier(adv.speedScore)]}>{adv.speedScore}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            {isCommissioner && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      setEditProspect(p);
                                      setEditForm({
                                        displayName: p.displayName,
                                        school: p.school ?? undefined,
                                        position: p.position ?? undefined,
                                        age: p.age ?? undefined,
                                        adp: p.adp ?? undefined,
                                        overview: p.overview ?? undefined,
                                        sleeperPlayerId: p.sleeperPlayerId ?? undefined,
                                        nflTeam: p.nflTeam ?? undefined,
                                      });
                                    }}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleMoveUp(idx)}
                                    disabled={idx === 0 || reorderMutation.isPending}
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleMoveDown(idx)}
                                    disabled={idx === prospects.length - 1 || reorderMutation.isPending}
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive"
                                    onClick={() => setDeleteProspectId(p.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          </>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailProspect} onOpenChange={(open) => !open && setDetailProspect(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {detailProspect && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    {detailProspect.photoUrl ? (
                      <AvatarImage src={detailProspect.photoUrl} alt={detailProspect.displayName} />
                    ) : null}
                    <AvatarFallback className="text-lg">
                      {detailProspect.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle>{detailProspect.displayName}</DialogTitle>
                    <DialogDescription>
                      {detailProspect.position && (
                        <Badge
                          className={
                            POSITION_COLORS[detailProspect.position] ||
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {detailProspect.position}
                        </Badge>
                      )}{" "}
                      ADP {detailProspect.adp != null ? Number(detailProspect.adp).toFixed(1) : "—"}
                      {" · "}
                      Age {detailProspect.age ?? "—"}
                      {" · "}
                      {detailProspect.school ?? detailProspect.sleeperCollege ?? "—"}
                      {" · "}
                      {detailProspect.sleeperTeam ?? detailProspect.nflTeam ?? "—"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4">
                {detailProspect.overview && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">Overview</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {detailProspect.overview}
                    </p>
                  </div>
                )}
                {parseCollegeAwards(detailProspect.collegeAwards).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                      <Award className="w-4 h-4" />
                      College awards
                    </h4>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                      {parseCollegeAwards(detailProspect.collegeAwards).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Combine results
                    </CardTitle>
                    <CardDescription>
                      Rank vs same position — further out is better.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.keys(parseCombineData(detailProspect.combineData)).length > 0 ? (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {Object.entries(parseCombineData(detailProspect.combineData)).map(
                          ([k, v]) =>
                            v && (
                              <div key={k} className="flex justify-between gap-4 border-b border-border/50 pb-1 last:border-0">
                                <span className="text-muted-foreground capitalize">
                                  {k.replace(/([A-Z0-9]+)/g, " $1").trim()}
                                </span>
                                <span className="font-medium tabular-nums">{v}</span>
                              </div>
                            )
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No combine data available.</p>
                    )}
                    {(() => {
                      const radarData = buildCombineRadarData(detailProspect, prospects);
                      if (radarData.length < 2) return null;
                      return (
                        <div className="mt-4 h-[240px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                              <PolarGrid stroke="hsl(var(--border))" />
                              <PolarAngleAxis
                                dataKey="subject"
                                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                              />
                              <PolarRadiusAxis
                                angle={90}
                                domain={[0, 100]}
                                tick={false}
                              />
                              <Radar
                                name="Rank"
                                dataKey="value"
                                stroke="hsl(var(--primary))"
                                fill="hsl(var(--primary))"
                                fillOpacity={0.4}
                                strokeWidth={1.5}
                              />
                              <Tooltip
                                content={({ active, payload }) =>
                                  active && payload?.[0] ? (
                                    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow">
                                      {payload[0].payload.subject}: {payload[0].value}% (vs same position)
                                    </div>
                                  ) : null
                                }
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">RAS (Raw Athletic Score)</CardTitle>
                    <CardDescription>
                      Score and link from ras.football when available.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {detailProspect.ras != null ? (
                      <div className="space-y-2 text-sm">
                        <p className="font-medium tabular-nums">
                          {Number(detailProspect.ras).toFixed(2)}
                        </p>
                        {detailProspect.rasLink ? (
                          <a
                            href={detailProspect.rasLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View on ras.football
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No RAS data available.</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Advanced stats</CardTitle>
                    <CardDescription>
                      <div className="space-y-1.5 text-xs mt-1">
                        <p className="font-medium text-foreground/90">Definitions:</p>
                        <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                          <li><strong className="text-foreground/80">Speed score</strong> — Combines 40-yard dash and weight; 100 = NFL average, 110+ = elite. From combine data.</li>
                          <li><strong className="text-foreground/80">College dominator</strong> — Share of team&#39;s yards and TDs (receiving for WR/TE; rushing + receiving for RB). Higher = more market share in college.</li>
                          <li><strong className="text-foreground/80">Breakout season</strong> — First college season in which the player&#39;s dominator rating met the breakout threshold (indicator of early production).</li>
                          <li><strong className="text-foreground/80">YPRR</strong> — Yards per team pass attempt (receiving yards ÷ team pass attempts). Proxy for efficiency in the passing game; WR/TE only.</li>
                        </ul>
                      </div>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const adv = parseAdvancedStats(detailProspect.advancedStats ?? null);
                      if (!adv) {
                        return <p className="text-sm text-muted-foreground">No advanced stats. Commissioner can run &quot;Refresh advanced stats&quot; (requires COLLEGE_FOOTBALL_DATA_API_KEY).</p>;
                      }
                      const hasAny =
                        adv.speedScore != null ||
                        adv.bestDominator != null ||
                        adv.dominatorByYear.length > 0 ||
                        adv.breakoutSeason != null ||
                        adv.bestYprr != null ||
                        adv.yprrByYear.length > 0;
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          {adv.speedScore != null && (
                            <div className="rounded-md bg-muted/30 px-3 py-2">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">Speed score</p>
                              <p className="mt-0.5">
                                <span className={STAT_TIER_CLASS[getSpeedScoreTier(adv.speedScore)]}>{adv.speedScore}</span>
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">100 = NFL avg, 110+ = elite</p>
                            </div>
                          )}
                          {(adv.bestDominator != null || adv.dominatorByYear.length > 0) && (
                            <div className="rounded-md bg-muted/30 px-3 py-2">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">College dominator</p>
                              {adv.bestDominator != null && (
                                <p className="mt-0.5">
                                  <span className={STAT_TIER_CLASS[getDominatorTier(adv.bestDominator)]}>
                                    {(adv.bestDominator * 100).toFixed(1)}%
                                  </span>
                                  {adv.dominatorByYear.length > 0 && " (best)"}
                                </p>
                              )}
                              {adv.dominatorByYear.length > 0 && (
                                <ul className="mt-1 list-inside list-disc text-muted-foreground text-xs">
                                  {adv.dominatorByYear.map(({ year, dominator }) => (
                                    <li key={year}>
                                      {year}: <span className={STAT_TIER_CLASS[getDominatorTier(dominator)]}>{(dominator * 100).toFixed(1)}%</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">Share of team yards + TDs</p>
                            </div>
                          )}
                          {adv.bestDominator == null && adv.dominatorByYear.length === 0 && adv.dominatorUnavailableReason && (
                            <div className="sm:col-span-2 rounded-md bg-muted/30 px-3 py-2">
                              <p className="text-muted-foreground text-xs">{adv.dominatorUnavailableReason}</p>
                            </div>
                          )}
                          {adv.breakoutSeason != null && (
                            <div className="rounded-md bg-muted/30 px-3 py-2">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">Breakout season</p>
                              <p className="mt-0.5 font-mono font-medium text-emerald-600 dark:text-emerald-400">{adv.breakoutSeason}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">First season above dominator threshold. Breakout age: N/A (DOB not in API)</p>
                            </div>
                          )}
                          {(adv.bestYprr != null || adv.yprrByYear.length > 0) && (
                            <div className="rounded-md bg-muted/30 px-3 py-2">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">YPRR (team pass att proxy)</p>
                              {adv.bestYprr != null && (
                                <p className="mt-0.5">
                                  <span className={STAT_TIER_CLASS[getYprrTier(adv.bestYprr)]}>{adv.bestYprr}</span>
                                  {adv.yprrByYear.length > 0 && " (best)"}
                                </p>
                              )}
                              {adv.yprrByYear.length > 0 && (
                                <ul className="mt-1 list-inside list-disc text-muted-foreground text-xs">
                                  {adv.yprrByYear.map(({ year, yprr }) => (
                                    <li key={year}>
                                      {year}: <span className={STAT_TIER_CLASS[getYprrTier(yprr)]}>{yprr}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">Receiving yards ÷ team pass attempts (WR/TE)</p>
                            </div>
                          )}
                          {!hasAny && (
                            <div className="sm:col-span-2">
                              <p className="text-muted-foreground">No data for this prospect.</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
              {isCommissioner && (
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetailProspect(null);
                      const d = detailProspect;
                      setEditProspect(d);
                      setEditForm({
                        displayName: d.displayName,
                        school: d.school ?? undefined,
                        position: d.position ?? undefined,
                        age: d.age ?? undefined,
                        adp: d.adp ?? undefined,
                        overview: d.overview ?? undefined,
                        sleeperPlayerId: d.sleeperPlayerId ?? undefined,
                        nflTeam: d.nflTeam ?? undefined,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteProspectId(detailProspect.id)}>
                    Delete
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editProspect} onOpenChange={(open) => !open && (setEditProspect(null), setEditForm({}))}>
        <DialogContent>
          {editProspect && (
            <>
              <DialogHeader>
                <DialogTitle>Edit prospect</DialogTitle>
                <DialogDescription>Update display name, school, position, age, ADP, overview, Sleeper ID, NFL team.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    className="col-span-3"
                    value={editForm.displayName ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-school">School</Label>
                  <Input
                    id="edit-school"
                    className="col-span-3"
                    value={editForm.school ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, school: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-pos">Position</Label>
                  <Input
                    id="edit-pos"
                    className="col-span-3"
                    value={editForm.position ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, position: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-age">Age</Label>
                  <Input
                    id="edit-age"
                    type="number"
                    className="col-span-3"
                    value={editForm.age ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, age: e.target.value ? parseInt(e.target.value, 10) : undefined }))
                    }
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-adp">ADP</Label>
                  <Input
                    id="edit-adp"
                    type="number"
                    step="0.1"
                    className="col-span-3"
                    value={editForm.adp ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, adp: e.target.value ? parseFloat(e.target.value) : undefined }))
                    }
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-nfl">NFL Team</Label>
                  <Input
                    id="edit-nfl"
                    className="col-span-3"
                    value={editForm.nflTeam ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, nflTeam: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-sleeper">Sleeper Player ID</Label>
                  <Input
                    id="edit-sleeper"
                    className="col-span-3"
                    value={editForm.sleeperPlayerId ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, sleeperPlayerId: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-overview">Overview</Label>
                  <Textarea
                    id="edit-overview"
                    className="col-span-3"
                    rows={3}
                    value={editForm.overview ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, overview: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => (setEditProspect(null), setEditForm({}))}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk add dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk add prospects</DialogTitle>
            <DialogDescription>
              One per line. Optional columns separated by tab or |: Name, Position, Age, ADP. Max 40.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="min-h-[200px] font-mono text-sm"
            placeholder="Travis Hunter&#10;Quinn Ewers | QB | 22 | 1.5&#10;..."
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setBulkOpen(false), setBulkText(""))}>
              Cancel
            </Button>
            <Button onClick={handleBulkSubmit} disabled={bulkAddMutation.isPending}>
              Add prospects
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import combine CSV dialog */}
      <Dialog open={combineImportOpen} onOpenChange={(open) => (!open && (setCombineImportOpen(false), setCombineImportCsv("")))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import combine CSV</DialogTitle>
            <DialogDescription>
              Upload or paste a CSV with combine results. Columns: Name, Pos, School, Height, Weight, Hands, Arms, Wingspan, 40 Yd, 10 Split, Vertical, Broad, Bench, 3-Cone, Shuttle. Matched prospects will have their combine data replaced with the CSV row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="file"
              accept=".csv,text/csv"
              className="cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => setCombineImportCsv(String(reader.result ?? ""));
                  reader.readAsText(file);
                }
                e.target.value = "";
              }}
            />
            <Textarea
              className="min-h-[200px] font-mono text-sm"
              placeholder="Paste CSV with header: Name,Pos,School,Height,Weight,Hands,Arms,Wingspan,40 Yd,10 Split,Vertical,Broad,Bench,3-Cone,Shuttle"
              value={combineImportCsv}
              onChange={(e) => setCombineImportCsv(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setCombineImportOpen(false), setCombineImportCsv(""))}>
              Cancel
            </Button>
            <Button
              onClick={() => combineImportMutation.mutate(combineImportCsv)}
              disabled={combineImportMutation.isPending || !combineImportCsv.trim()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import RAS dialog */}
      <Dialog open={rasImportOpen} onOpenChange={(open) => (!open && (setRasImportOpen(false), setRasImportCsv("")))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import RAS from CSV</DialogTitle>
            <DialogDescription>
              Paste CSV with columns: Link, Name, Pos, Year, College, RAS. Or choose a file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="file"
              accept=".csv,text/csv"
              className="cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => setRasImportCsv(String(reader.result ?? ""));
                  reader.readAsText(file);
                }
                e.target.value = "";
              }}
            />
            <Textarea
              className="min-h-[200px] font-mono text-sm"
              placeholder='Paste CSV rows, e.g. href="https://ras.football/...","Name","POS","Year","College","9.58"'
              value={rasImportCsv}
              onChange={(e) => setRasImportCsv(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setRasImportOpen(false), setRasImportCsv(""))}>
              Cancel
            </Button>
            <Button
              onClick={() => rasImportMutation.mutate(rasImportCsv)}
              disabled={rasImportMutation.isPending || !rasImportCsv.trim()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteProspectId} onOpenChange={(open) => !open && setDeleteProspectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prospect?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the prospect from the list and re-rank the rest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProspectId && deleteMutation.mutate(deleteProspectId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
