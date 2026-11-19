import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Star,
  FileUp,
  LayoutList,
  Table2,
} from "lucide-react";
import type { DraftProspect } from "@shared/schema";
import { ProspectCard } from "@/components/ProspectCard";
import {
  type ProspectEnriched,
  parseCombineData,
  parseAdvancedStats,
  getSpeedScoreTier,
  STAT_TIER_CLASS,
  getNflTeamLogoUrl,
  applyNflTeamLogoFallback,
} from "@/lib/draftProspectMetrics";
import { useIsCommissioner } from "@/lib/commissioner";
import {
  adpInRangeOfAnyPick,
  filterProspects,
  idealProspectForPick,
  normalizePosition,
  useMediaQuery,
} from "@/components/draft-board/prospectList";
import {
  IdealPicksCard,
  ProspectDetailPanel,
  ProspectList,
  type IdealRow,
} from "@/components/draft-board/ProspectPanels";

const DEFAULT_SEASON = "2026";
const VIEW_MODE_KEY = "draftProspectsView";

type RankedPlayer = {
  rank: number;
  playerName: string;
  position: string | null;
  school: string | null;
  sourceValue: string | null;
};

type RankingsImportResult = {
  ok: boolean;
  dryRun: boolean;
  rowCount: number;
  matched: number;
  unmatched: RankedPlayer[];
  changes: { prospectId: string; name: string; oldAdp: number | null; newAdp: number }[];
};

type RankingsInfo = {
  status: {
    source: string;
    format: string;
    lastAttemptAt: number;
    lastSuccessAt: number | null;
    lastStatus: string;
    lastError: string | null;
    rowCount: number | null;
  } | null;
  unmatched: RankedPlayer[];
};

const formatDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString() : "never");

const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/90 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500/90 text-white",
  TE: "bg-orange-500/90 text-white",
};

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
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importSource, setImportSource] = useState("Manual import");
  const [importFormat, setImportFormat] = useState("1qb_ppr");
  const [importPreview, setImportPreview] = useState<{ text: string; result: RankingsImportResult } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const isCommissioner = useIsCommissioner();

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

  const rankingsKey = ["/api/league", league?.leagueId, "prospect-rankings", season];
  const { data: rankingsInfo } = useQuery<RankingsInfo>({
    queryKey: rankingsKey,
    queryFn: async () => {
      const res = await fetch(`/api/league/${league!.leagueId}/prospect-rankings?season=${encodeURIComponent(season)}`);
      if (!res.ok) throw new Error("Failed to fetch rankings status");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });
  const rankingStatus = rankingsInfo?.status ?? null;
  const unmatchedRanked = rankingsInfo?.unmatched ?? [];

  const userTeam = standings?.find((s: { isUser?: boolean; rosterId?: number }) => s.isUser);
  const userRosterId = userTeam?.rosterId;
  const totalTeams = standings?.length ?? 0;

  const { userPickNumbers, needPositions, userPicks } = useMemo(() => {
    const picks: number[] = [];
    const need = new Set<string>();
    const emptyUserPicks: { round: number; draftSlot: number; pickNum: number; grade?: string; via?: string }[] = [];
    if (!userRosterId || totalTeams < 1)
      return { userPickNumbers: picks, needPositions: need, userPicks: emptyUserPicks };

    const myPicks = (draftPicks || []).filter(
      (p: { currentOwnerId?: number; season?: string; round?: number }) =>
        p.currentOwnerId === userRosterId &&
        p.season === season &&
        (p.round ?? 1) <= 3
    );
    const userPicksList: { round: number; draftSlot: number; pickNum: number; grade?: string; via?: string }[] = myPicks.map(
      (p: {
        round?: number;
        draftSlot?: number;
        grade?: string;
        originalOwnerId?: number;
        originalOwnerName?: string;
      }) => {
        const round = p.round ?? 1;
        const draftSlot = p.draftSlot ?? 1;
        return {
          round,
          draftSlot,
          pickNum: (round - 1) * totalTeams + draftSlot,
          grade: p.grade,
          via: p.originalOwnerId !== userRosterId ? p.originalOwnerName : undefined,
        };
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
    const result: IdealRow[] = [];
    for (const { round, draftSlot, pickNum, grade, via } of userPicks) {
      result.push({
        pickLabel: `${round}.${String(draftSlot).padStart(2, "0")}`,
        pickNum,
        grade,
        via,
        prospect: idealProspectForPick(prospects, pickNum, needPositions),
      });
    }
    return result;
  }, [userPicks, prospects, needPositions]);

  // List / detail view state. The detail panel sits beside the list on wide screens; on narrower
  // screens tapping a row opens the existing dialog instead.
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [viewMode, setViewMode] = useState<"list" | "table">(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === "table" ? "table" : "list";
    } catch {
      return "list";
    }
  });
  const changeViewMode = (mode: "list" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* storage unavailable; the choice just will not be remembered */
    }
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("all");
  const visibleProspects = useMemo(
    () => filterProspects(prospects, { search, position: posFilter }),
    [prospects, search, posFilter]
  );
  const selectedProspect =
    prospects.find((p) => p.id === selectedId) ?? visibleProspects[0] ?? prospects[0] ?? null;
  // Same highlight rule the table has always used: in your pick range and a position of need.
  const isIdealProspect = (p: ProspectEnriched) =>
    adpInRangeOfAnyPick(p.adp, userPickNumbers) && needPositions.has(normalizePosition(p.position));
  const inRangeOfPick = (p: ProspectEnriched) => adpInRangeOfAnyPick(p.adp, userPickNumbers);
  const openProspect = (p: ProspectEnriched) => {
    if (isDesktop && viewMode === "list") setSelectedId(p.id);
    else setDetailProspect(p);
  };

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

  const matchSleeperMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/league/${league!.leagueId}/draft-prospects/match-sleeper`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user?.userId, season }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sleeper match failed");
      }
      return res.json() as Promise<{ matched: number; skipped: number; total: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: "Sleeper IDs matched",
        description: `${data.matched ?? 0} linked, ${data.skipped ?? 0} skipped (${data.total ?? 0} total).`,
      });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Sleeper match failed", description: e.message });
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

  const rankingsImportMutation = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch(`/api/league/${league!.leagueId}/prospect-rankings/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.userId,
          season,
          source: importSource,
          format: importFormat,
          text: importText,
          dryRun,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error((data.errors && data.errors[0]) || data.error || "Import failed") as Error & {
          problems?: string[];
        };
        err.problems = data.errors ?? (data.error ? [data.error] : []);
        throw err;
      }
      return data as RankingsImportResult;
    },
    onSuccess: (result, dryRun) => {
      setImportErrors([]);
      if (dryRun) {
        setImportPreview({ text: importText, result });
        return;
      }
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: rankingsKey });
      setImportOpen(false);
      setImportText("");
      setImportPreview(null);
      toast({
        title: "Rankings imported",
        description: `${result.matched} prospects updated, ${result.unmatched.length} not in your list.`,
      });
    },
    onError: (e: Error & { problems?: string[] }, dryRun) => {
      setImportPreview(null);
      setImportErrors(e.problems && e.problems.length > 0 ? e.problems : [e.message]);
      if (!dryRun) queryClient.invalidateQueries({ queryKey: rankingsKey });
    },
  });

  const addRankedMutation = useMutation({
    mutationFn: async (rank: number) => {
      const res = await fetch(`/api/league/${league!.leagueId}/prospect-rankings/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.userId, season, rank }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not add prospect");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: rankingsKey });
      toast({ title: "Prospect added", description: "Added to the end of your list." });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Could not add prospect", description: e.message });
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

  function startEdit(p: ProspectEnriched) {
    setEditProspect(p);
    setEditForm({
      displayName: p.displayName,
      school: p.school ?? undefined,
      position: p.position ?? undefined,
      age: p.age ?? undefined,
      adp: p.adp ?? undefined,
      overview: p.overview ?? undefined,
      sleeperPlayerId: p.sleeperPlayerId ?? undefined,
    });
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

  const viewToggle = (
    <div className="flex gap-1" role="group" aria-label="Prospect view">
      <Button
        variant={viewMode === "list" ? "default" : "outline"}
        size="sm"
        aria-pressed={viewMode === "list"}
        onClick={() => changeViewMode("list")}
      >
        <LayoutList className="w-4 h-4 mr-1" />
        List
      </Button>
      <Button
        variant={viewMode === "table" ? "default" : "outline"}
        size="sm"
        aria-pressed={viewMode === "table"}
        onClick={() => changeViewMode("table")}
      >
        <Table2 className="w-4 h-4 mr-1" />
        Table view
      </Button>
    </div>
  );

  return (
    <>
      <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold">Draft prospects</h2>
            <p className="text-muted-foreground">
              Top 40 incoming {season} rookies (QB, RB, WR, TE) with combine and awards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => matchSleeperMutation.mutate()}
                  disabled={matchSleeperMutation.isPending || prospects.length === 0}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-1 ${matchSleeperMutation.isPending ? "animate-spin" : ""}`}
                  />
                  Match Sleeper IDs
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
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <FileUp className="w-4 h-4 mr-1" />
                  Import rankings
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

        {rankingStatus && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground" data-testid="rankings-status">
              Rankings: {rankingStatus.source}, {rankingStatus.format}
              {rankingStatus.lastSuccessAt ? `, last synced ${formatDate(rankingStatus.lastSuccessAt)}` : ""}
              {rankingStatus.rowCount ? ` (${rankingStatus.rowCount} players)` : ""}
            </p>
            {rankingStatus.lastStatus === "failed" && (
              <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
                The last rankings import failed: {(rankingStatus.lastError ?? "unknown error").replace(/\.+$/, "")}.{" "}
                {rankingStatus.lastSuccessAt
                  ? `Your list still has the rankings from ${formatDate(rankingStatus.lastSuccessAt)}.`
                  : "Nothing has been imported yet."}
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-lg" />
        ) : (
          <div
            className={`grid gap-4 items-start ${
              userRosterId && userPicks.length > 0 && prospects.length > 0
                ? "xl:grid-cols-[270px_minmax(0,1fr)]"
                : ""
            }`}
          >
            {userRosterId && userPicks.length > 0 && prospects.length > 0 && (
              <div className="min-w-0 xl:sticky xl:top-4">
                <IdealPicksCard rows={idealPerPick} onSelect={openProspect} />
              </div>
            )}

            <div className="min-w-0">
              {prospects.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground py-8 text-center">
                      No prospects yet.
                      {isCommissioner && " Use Bulk add to add up to 40 prospects."}
                    </p>
                  </CardContent>
                </Card>
              ) : viewMode === "table" ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>Prospects</CardTitle>
                      {viewToggle}
                    </div>
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
                        const nflTeam = p.sleeperTeam ?? "";
                        const adv = parseAdvancedStats(p.advancedStats ?? null);
                        const prospectPos = (p.position ?? "")
                          .trim()
                          .toUpperCase()
                          .replace(/[0-9]/g, "")
                          || null;
                        const inRange = adpInRangeOfAnyPick(p.adp, userPickNumbers);
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
                            <TableCell>
                              {nflTeam ? (
                                <span className="flex items-center gap-1.5">
                                  <img
                                    src={getNflTeamLogoUrl(nflTeam)}
                                    alt=""
                                    className="h-5 w-5 shrink-0 object-contain"
                                    onError={(ev) => applyNflTeamLogoFallback(ev.currentTarget, nflTeam)}
                                  />
                                  <span className="text-sm tabular-nums">{nflTeam}</span>
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
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
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                  <ProspectList
                    prospects={visibleProspects}
                    selectedId={selectedProspect?.id ?? null}
                    inlineDetail={isDesktop}
                    search={search}
                    onSearchChange={setSearch}
                    position={posFilter}
                    onPositionChange={setPosFilter}
                    isIdeal={isIdealProspect}
                    onSelect={openProspect}
                    headerAction={viewToggle}
                    description={
                      userRosterId
                        ? "Highlighted = in your pick range, a position of need, and where the pick is not a reach."
                        : "Top incoming rookies by board rank."
                    }
                  />
                  {isDesktop && (
                    <ProspectDetailPanel
                      prospect={selectedProspect}
                      allProspects={prospects}
                      inRange={selectedProspect ? inRangeOfPick(selectedProspect) : false}
                      isCommissioner={isCommissioner}
                      canMoveUp={
                        !!selectedProspect && prospects.indexOf(selectedProspect) > 0 && !reorderMutation.isPending
                      }
                      canMoveDown={
                        !!selectedProspect &&
                        prospects.indexOf(selectedProspect) < prospects.length - 1 &&
                        !reorderMutation.isPending
                      }
                      onMoveUp={() => selectedProspect && handleMoveUp(prospects.indexOf(selectedProspect))}
                      onMoveDown={() => selectedProspect && handleMoveDown(prospects.indexOf(selectedProspect))}
                      onEdit={() => selectedProspect && startEdit(selectedProspect)}
                      onDelete={() => selectedProspect && setDeleteProspectId(selectedProspect.id)}
                    />
                  )}
                </div>
              )}
              {isCommissioner && unmatchedRanked.length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="pb-3">
                    <CardTitle>Not in your list</CardTitle>
                    <CardDescription>
                      Ranked in the last import but missing from your prospects. Adding one puts it at the end of your
                      list (max 40).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                      {unmatchedRanked.map((r) => (
                        <li key={r.rank} className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5">
                          <span className="w-8 shrink-0 font-mono text-sm text-muted-foreground">{r.rank}</span>
                          {r.position && (
                            <Badge className={`shrink-0 text-[10px] px-1.5 ${POSITION_COLORS[r.position] || "bg-muted text-muted-foreground"}`}>
                              {r.position}
                            </Badge>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {r.playerName}
                            {r.school && <span className="ml-1.5 font-normal text-muted-foreground">{r.school}</span>}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addRankedMutation.mutate(r.rank)}
                            disabled={addRankedMutation.isPending}
                            aria-label={`Add ${r.playerName} to your prospects`}
                          >
                            <Plus className="w-4 h-4 mr-1" />
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailProspect} onOpenChange={(open) => !open && setDetailProspect(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          {detailProspect ? (
            <>
              <DialogTitle className="sr-only">
                {detailProspect.displayName} — draft prospect
              </DialogTitle>
              <DialogDescription className="sr-only">
                Combine, RAS, advanced stats, and scouting notes for {detailProspect.displayName}.
              </DialogDescription>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <ProspectCard prospect={detailProspect} allProspects={prospects} />
              </div>
              {isCommissioner ? (
                <DialogFooter className="border-t border-border/60 bg-muted/25 px-6 py-4 sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const d = detailProspect;
                      setDetailProspect(null);
                      setEditProspect(d);
                      setEditForm({
                        displayName: d.displayName,
                        school: d.school ?? undefined,
                        position: d.position ?? undefined,
                        age: d.age ?? undefined,
                        adp: d.adp ?? undefined,
                        overview: d.overview ?? undefined,
                        sleeperPlayerId: d.sleeperPlayerId ?? undefined,
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteProspectId(detailProspect.id)}>
                    Delete
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
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

      {/* Import rankings dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) {
            setImportPreview(null);
            setImportErrors([]);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import rankings</DialogTitle>
            <DialogDescription>
              Paste a board or CSV, one prospect per line: rank, name, position, school, value. A header row is optional,
              and an ADP column is used if you include one. Otherwise each matched prospect&apos;s ADP is set to its rank.
              Ranks must run 1 to N with no gaps.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="rk-source">Source</Label>
              <Input id="rk-source" value={importSource} onChange={(e) => setImportSource(e.target.value)} maxLength={64} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rk-format">Format</Label>
              <Input id="rk-format" value={importFormat} onChange={(e) => setImportFormat(e.target.value)} maxLength={32} />
              <p className="text-xs text-muted-foreground">Describe the list as it is, for example 1qb_ppr or sf_ppr.</p>
            </div>
          </div>
          <Textarea
            className="min-h-[200px] font-mono text-sm"
            aria-label="Rankings to import"
            placeholder={"rank,name,pos,school,value\n1,Ashton Jeanty,RB,Boise State,1.01\n2,Tetairoa McMillan,WR,Arizona,1.02"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          {importErrors.length > 0 && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium">Nothing was imported.</p>
              <ul className="mt-1 list-disc pl-5">
                {importErrors.slice(0, 8).map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          {importPreview && importPreview.text === importText && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="font-medium">{importPreview.result.rowCount}</span> players read.{" "}
                <span className="font-medium">{importPreview.result.matched}</span> match your list and will get a new ADP.{" "}
                <span className="font-medium">{importPreview.result.unmatched.length}</span> are not in your list.
              </p>
              {importPreview.result.changes.slice(0, 5).map((c) => (
                <p key={c.prospectId} className="text-xs text-muted-foreground">
                  {c.name}: ADP {c.oldAdp != null ? Number(c.oldAdp).toFixed(1) : "none"} to {Number(c.newAdp).toFixed(1)}
                </p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => rankingsImportMutation.mutate(true)}
              disabled={rankingsImportMutation.isPending || !importText.trim()}
            >
              Preview
            </Button>
            <Button
              onClick={() => rankingsImportMutation.mutate(false)}
              disabled={
                rankingsImportMutation.isPending || !importPreview || importPreview.text !== importText
              }
            >
              Import
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
