import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { capBySeason, CURRENT_SEASON_CAP, type LeaguePhaseId } from "@shared/contractRules";
import { useToast } from "@/hooks/use-toast";
import type { ParsedContract } from "./types";
import type { DraftCapitalEstimate } from "./PendingContractActions";

type PlayerRow = {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  lastTeam: string;
  age: number | null;
  ppg: number;
  lastSalary: number;
  lastYears: number;
  lastWasRookie: boolean;
  isRfa: boolean;
  originalRosterId: number | null;
  originalTeamName: string | null;
  /** Fantasy points over the last two played seasons combined, and each season. */
  pts: number;
  ptsCurrent: number;
  ptsPrevious: number;
  /** Position rank over the two seasons combined, and in each season (null = no points that season). */
  rank: number | null;
  rankCurrent: number | null;
  rankPrevious: number | null;
};

type Production = {
  season: string;
  previousSeason: string;
  players: Record<string, { current: number; previous: number; currentGames: number; previousGames: number }>;
};

type SortKey = "pts" | "rank" | "ppg" | "age" | "last";

const POSITION_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "FLEX", "K", "DEF"] as const;
const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);
const YEAR_OPTIONS = [1, 2, 3, 4, 5];
const QUICK_SALARIES = [5, 10, 15, 20];
const MAX_SEASONS_SHOWN = 5;
/** Bars in the cap charts run to this many $M so going over the cap still shows. */
const BAR_SCALE = 300;

const positionBadge: Record<string, string> = {
  QB: "bg-rose-500/15 text-rose-400",
  RB: "bg-emerald-500/15 text-emerald-400",
  WR: "bg-blue-500/15 text-blue-400",
  TE: "bg-orange-500/15 text-orange-400",
  K: "bg-purple-500/15 text-purple-400",
  DEF: "bg-slate-500/20 text-slate-300",
};

export const money = (v: number) => `$${v.toFixed(1)}`;
const pct = (v: number) => `${Math.max(0, Math.min(100, (v / BAR_SCALE) * 100))}%`;

function initials(name: string) {
  return name
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PlayerAvatar({ playerId, name, className = "h-9 w-9" }: { playerId: string; name: string; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`} alt="" />
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function PositionBadge({ position }: { position: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${positionBadge[position] ?? positionBadge.DEF}`}>
      {position}
    </span>
  );
}

/** A horizontal bar of stacked segments against the cap line. */
export function CapBar({ segments, height = "h-3" }: { segments: Array<{ value: number; className: string }>; height?: string }) {
  return (
    <div className={`relative flex ${height} w-full overflow-hidden rounded-full bg-muted`}>
      {segments.map((s, i) => (
        <div key={i} className={`h-full ${s.className}`} style={{ width: pct(s.value) }} />
      ))}
      <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(CURRENT_SEASON_CAP) }} aria-hidden="true" />
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; className: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map(i => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-sm ${i.className}`} aria-hidden="true" />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function StatTile({ label, value, sub, tone = "default" }: { label: string; value: string; sub: string; tone?: "default" | "warn" | "draft" }) {
  return (
    <Card className={tone === "draft" ? "border-purple-500/40" : undefined}>
      <CardContent className="p-4 space-y-1">
        <p className={`text-[11px] uppercase tracking-wide ${tone === "draft" ? "text-purple-300" : "text-muted-foreground"}`}>{label}</p>
        <p className={`text-2xl font-bold ${tone === "warn" ? "text-amber-400" : tone === "draft" ? "text-purple-300" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Fantasy points for the last two played seasons and every player's position rank (among all NFL players at the
 * position) over both seasons combined and in each one.
 */
export function usePositionRanks(leagueId: string, playerMap: Record<string, { position?: string }>) {
  const { data: production } = useQuery<Production>({
    queryKey: ["/api/league", leagueId, "fa-production"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/fa-production`);
      if (!res.ok) throw new Error("Could not load production");
      return res.json();
    },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
  });

  // Position ranks across every NFL player with points, not just the free agents.
  const ranks = useMemo(() => {
    const out = { combined: new Map<string, number>(), current: new Map<string, number>(), previous: new Map<string, number>() };
    if (!production) return out;
    const byPos = new Map<string, Array<{ id: string; total: number; cur: number; prev: number }>>();
    for (const [id, p] of Object.entries(production.players)) {
      const position = playerMap[id]?.position;
      if (!position) continue;
      const list = byPos.get(position) ?? [];
      list.push({ id, total: p.current + p.previous, cur: p.current, prev: p.previous });
      byPos.set(position, list);
    }
    const rankInto = (list: Array<{ id: string; v: number }>, into: Map<string, number>) => {
      list
        .filter(x => x.v > 0)
        .sort((a, b) => b.v - a.v)
        .forEach((x, i) => into.set(x.id, i + 1));
    };
    for (const list of byPos.values()) {
      rankInto(list.map(x => ({ id: x.id, v: x.total })), out.combined);
      rankInto(list.map(x => ({ id: x.id, v: x.cur })), out.current);
      rankInto(list.map(x => ({ id: x.id, v: x.prev })), out.previous);
    }
    return out;
  }, [production, playerMap]);

  return { production, ranks };
}

const NO_DEAD_CAP: Record<number, number> = {};

export function FreeAgencyBiddingTab({
  leagueId,
  rosterId,
  currentYear,
  currentPhase,
  parsedContracts,
  allRosters,
  playerMap,
  perfByPlayer,
  rfaDesignations,
  draftCapital = null,
  deadCapByYear = NO_DEAD_CAP,
  onOpenPlayer,
}: {
  leagueId: string;
  rosterId: number;
  currentYear: number;
  currentPhase: LeaguePhaseId;
  parsedContracts: ParsedContract[];
  allRosters: Array<{ rosterId: number; teamName: string; players: Array<{ id: string; weeklyAvg: number; age: number | null }> }>;
  playerMap: Record<string, { name?: string; position?: string; age?: number; team?: string | null }>;
  perfByPlayer: Record<string, { weeklyAvg: number; age: number | null }>;
  rfaDesignations: Array<{ playerId: string; rosterId: number }>;
  /** Expected rookie contracts for this team's picks (shown in purple, not counted toward the cap). */
  draftCapital?: DraftCapitalEstimate | null;
  /** This team's dead cap by season ($M). */
  deadCapByYear?: Record<number, number>;
  /** Opens the player card. Free agents have no contract on a team, so none is passed. */
  onOpenPlayer?: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const round = currentPhase === "fa_round_2" ? 2 : 1;
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [years, setYears] = useState(1);
  const [salary, setSalary] = useState("");
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<(typeof POSITION_FILTERS)[number]>("ALL");
  const [sort, setSort] = useState<SortKey>("pts");
  const qc = useQueryClient();
  const { toast } = useToast();

  const teamByRoster = useMemo(() => Object.fromEntries(allRosters.map(r => [r.rosterId, r.teamName])), [allRosters]);

  const { production, ranks } = usePositionRanks(leagueId, playerMap);

  // Players already signed in an earlier round are no longer free agents.
  const { data: signedData } = useQuery<{ playerIds: string[] }>({
    queryKey: ["/api/league", leagueId, "fa-signed", round, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/fa-signed?round=${round}&season=${currentYear}`);
      if (!res.ok) throw new Error("Could not load signed players");
      return res.json();
    },
    enabled: !!leagueId && round > 1,
  });
  const signedIds = useMemo(() => new Set(signedData?.playerIds ?? []), [signedData]);

  const fullPool = useMemo(() => {
    // Free agency runs after the rollover: the pool is everyone whose contract ended last season.
    const expired = parsedContracts.filter(c => c.contractThrough === currentYear - 1);
    const rows: PlayerRow[] = [];
    const rfaByPlayer = new Map(rfaDesignations.map(d => [d.playerId, d]));
    for (const c of expired) {
      if (signedIds.has(c.playerId)) continue;
      const p = playerMap[c.playerId];
      const perf = perfByPlayer[c.playerId];
      const des = rfaByPlayer.get(c.playerId);
      const isRfa = !!des;
      const orig = des?.rosterId ?? null;
      if (isRfa && orig === rosterId) continue;
      const prod = production?.players[c.playerId];
      const paidYears = Object.entries(c.parsedSalaries).filter(([, v]) => v > 0).length;
      rows.push({
        playerId: c.playerId,
        name: p?.name || c.playerId.slice(0, 8),
        position: p?.position || "?",
        nflTeam: p?.team ?? null,
        lastTeam: teamByRoster[c.rosterId] || "Unknown",
        age: perf?.age ?? p?.age ?? null,
        ppg: perf?.weeklyAvg ?? 0,
        lastSalary: c.parsedSalaries[currentYear - 1] || 0,
        lastYears: c.originalContractYears || paidYears || 1,
        lastWasRookie: c.isRookieContract === 1,
        isRfa,
        originalRosterId: orig,
        originalTeamName: orig ? teamByRoster[orig] : null,
        ptsCurrent: prod?.current ?? 0,
        ptsPrevious: prod?.previous ?? 0,
        pts: (prod?.current ?? 0) + (prod?.previous ?? 0),
        rank: ranks.combined.get(c.playerId) ?? null,
        rankCurrent: ranks.current.get(c.playerId) ?? null,
        rankPrevious: ranks.previous.get(c.playerId) ?? null,
      });
    }
    return rows;
  }, [parsedContracts, currentYear, playerMap, perfByPlayer, rfaDesignations, teamByRoster, rosterId, production, signedIds, ranks]);

  const pool = useMemo(() => {
    const filtered = fullPool.filter(r => {
      if (pos === "FLEX" ? !FLEX_POSITIONS.has(r.position) : pos !== "ALL" && r.position !== pos) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    const by: Record<SortKey, (a: PlayerRow, b: PlayerRow) => number> = {
      pts: (a, b) => b.pts - a.pts,
      rank: (a, b) => (a.rank ?? 9999) - (b.rank ?? 9999),
      ppg: (a, b) => b.ppg - a.ppg,
      age: (a, b) => (a.age ?? 99) - (b.age ?? 99),
      last: (a, b) => b.lastSalary - a.lastSalary,
    };
    return filtered.sort((a, b) => by[sort](a, b) || b.pts - a.pts || a.name.localeCompare(b.name));
  }, [fullPool, pos, search, sort]);

  const maxPts = useMemo(() => Math.max(1, ...fullPool.map(p => p.pts)), [fullPool]);

  const { data: myBidsData } = useQuery<any[]>({
    queryKey: ["/api/league", leagueId, "bids", rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/${rosterId}`);
      if (!res.ok) throw new Error("Could not load bids");
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    },
    enabled: !!leagueId && rosterId != null,
  });
  // Only this round's open bids count here. Bids from other rounds or seasons, and ones already decided, do not.
  const myBids: any[] = (Array.isArray(myBidsData) ? myBidsData : []).filter(
    b => (b.status ?? "active") === "active" && b.round === round && b.season === currentYear,
  );
  const bidByPlayer = new Map<string, any>(myBids.map(b => [b.playerId, b]));

  const selectPlayer = (p: PlayerRow) => {
    setSelected(p);
    // Bidding on a player again changes the open bid, so start from what is already there.
    const existing = bidByPlayer.get(p.playerId);
    if (existing) {
      setYears(Math.min(5, Math.max(1, Number(existing.contractYears) || 1)));
      setSalary(String(existing.bidAmount));
    } else {
      setYears(1);
      setSalary("");
    }
  };

  const selectByBid = (b: any) => {
    const row = fullPool.find(p => p.playerId === b.playerId);
    if (row) selectPlayer(row);
  };

  const withdrawBid = useMutation({
    mutationFn: async (bidId: string) => {
      const res = await fetch(`/api/league/${leagueId}/bids/${bidId}/${rosterId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not withdraw the bid");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "bids", rosterId] });
      toast({ title: "Bid withdrawn" });
    },
    onError: (e: Error) => toast({ title: "Not withdrawn", description: e.message, variant: "destructive" }),
  });

  const salaryNum = Math.max(0, Number(salary) || 0);
  const isUpdate = !!selected && bidByPlayer.has(selected.playerId);

  const placeBid = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const res = await fetch(`/api/league/${leagueId}/fa-bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rosterId,
          playerId: selected.playerId,
          playerName: selected.name,
          playerPosition: selected.position,
          bidAmount: salaryNum,
          contractYears: years,
          round,
          season: currentYear,
          isRfa: selected.isRfa,
          originalRosterId: selected.originalRosterId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.reason ? `${body.error}: ${body.reason}` : body.error || "Bid failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "bids", rosterId] });
      toast({
        title: isUpdate ? "Bid updated" : "Bid submitted",
        description: selected ? `${selected.name}: ${years} year${years === 1 ? "" : "s"} at ${money(salaryNum)} per year` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Bid not submitted", description: e.message, variant: "destructive" }),
  });

  // ── Cap picture ──────────────────────────────────────────────────────────────
  const capInput = {
    rosterId,
    contracts: parsedContracts.filter(c => c.rosterId === rosterId).map(c => ({ playerId: c.playerId, salaries: c.parsedSalaries })),
    deadCapByYear,
  };
  const seasons: number[] = [];
  for (let i = 0; i < MAX_SEASONS_SHOWN; i++) seasons.push(currentYear + i);
  const books = capBySeason(capInput, seasons);
  const committedIn = (y: number) => books[y]?.committed ?? 0;
  // `committed` includes dead cap; the bars draw the dead cap part in red.
  const deadIn = (y: number) => deadCapByYear[y] || 0;
  const hasDead = seasons.some(y => deadIn(y) > 0);
  const bidsIn = (list: any[], y: number) =>
    list.reduce((sum, b) => (y - currentYear < (Number(b.contractYears) || 0) ? sum + (Number(b.bidAmount) || 0) : sum), 0);

  const firstYearBids = bidsIn(myBids, currentYear);
  const ifAllWin = CURRENT_SEASON_CAP - committedIn(currentYear) - firstYearBids;
  const draftTotal = draftCapital?.total ?? 0;

  const otherBids = myBids.filter(b => !selected || b.playerId !== selected.playerId);
  const impact = selected
    ? YEAR_OPTIONS.slice(0, years).map(i => {
        const y = currentYear + i - 1;
        const committed = committedIn(y);
        const others = bidsIn(otherBids, y);
        return { y, committed, others, room: CURRENT_SEASON_CAP - committed - others - salaryNum };
      })
    : [];
  const outlook = seasons.map((y, i) => {
    const committed = committedIn(y);
    const bids = bidsIn(myBids, y);
    return { y, committed, bids, draft: i === 0 ? draftTotal : 0, room: CURRENT_SEASON_CAP - committed - bids };
  });
  const overSeasons = outlook.filter(o => o.room < 0).map(o => o.y);

  const openCard = (p: PlayerRow) => {
    // The player's last team is the closest thing to a roster for the card header.
    const lastRoster = parsedContracts.find(c => c.playerId === p.playerId)?.rosterId ?? rosterId;
    onOpenPlayer?.(p.playerId, lastRoster, null);
  };

  const seasonA = production?.previousSeason ?? String(currentYear - 2);
  const seasonB = production?.season ?? String(currentYear - 1);
  const lastDeal = (p: PlayerRow) =>
    p.lastSalary > 0 ? `${money(p.lastSalary)} · ${p.lastWasRookie ? "rookie" : `${p.lastYears} yr`}` : "—";
  const rankTone = (r: number | null) => (r == null ? "text-muted-foreground" : r <= 12 ? "text-emerald-400" : r <= 24 ? "" : "text-muted-foreground");
  const runs = years === 1 ? String(currentYear) : `${currentYear}–${currentYear + years - 1}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{currentYear} league year</p>
          <h2 className="text-2xl font-bold leading-tight">Free Agency · Round {round}</h2>
          <p className="text-xs text-muted-foreground">
            Blind bids · highest total value wins · a tie goes to the higher yearly salary · no minimum
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-amber-950">Bidding open</span>
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {round === 1 ? "Round 2 next" : "Final round"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={`${currentYear} cap space`}
          value={money(CURRENT_SEASON_CAP - committedIn(currentYear))}
          sub={`${money(committedIn(currentYear))} committed of ${money(CURRENT_SEASON_CAP)}`}
        />
        <StatTile
          label="If every bid wins"
          value={ifAllWin < 0 ? `${money(-ifAllWin)} over` : `${money(ifAllWin)} left`}
          sub={`${myBids.length} open bid${myBids.length === 1 ? "" : "s"} · ${money(firstYearBids)}/yr of AAV in ${currentYear}`}
          tone={ifAllWin < 0 ? "warn" : "default"}
        />
        {draftCapital && (
          <StatTile
            label="Rookie draft picks (est.)"
            value={money(draftTotal)}
            sub={
              draftCapital.picks.length === 0
                ? "No picks in this year's rookie draft"
                : `${draftCapital.picks
                    .slice()
                    .sort((a, b) => a.round - b.round || a.slot - b.slot)
                    .map(p => `${p.round}.${String(p.slot).padStart(2, "0")}`)
                    .join(" · ")} — not counted toward the cap`
            }
            tone="draft"
          />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Player board */}
        <Card className="min-w-0 flex-[999_1_620px]">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                Available players <span className="text-sm font-normal text-muted-foreground">· {pool.length}</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="fa-search" className="sr-only">Search players</label>
                <Input
                  id="fa-search"
                  type="search"
                  placeholder="Search players"
                  className="h-9 w-48"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <label htmlFor="fa-sort" className="sr-only">Sort by</label>
                <select
                  id="fa-sort"
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="pts">Sort: 2-yr points</option>
                  <option value="rank">Sort: position rank</option>
                  <option value="ppg">Sort: PPG</option>
                  <option value="age">Sort: age</option>
                  <option value="last">Sort: last salary</option>
                </select>
              </div>
            </div>
            <div role="group" aria-label="Position filter" className="flex flex-wrap gap-1.5">
              {POSITION_FILTERS.map(p => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={pos === p}
                  onClick={() => setPos(p)}
                  className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${
                    pos === p ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "ALL" ? "All" : p}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 font-medium">Pos</th>
                    <th className="min-w-[150px] px-2 py-2 font-medium">2-yr points</th>
                    <th className="px-2 py-2 text-right font-medium">PPG</th>
                    <th className="px-2 py-2 font-medium">Pos rank (2 yr)</th>
                    <th className="px-2 py-2 font-medium">Last deal</th>
                    <th className="px-2 py-2 font-medium">Your bid</th>
                    <th className="px-2 py-2"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pool.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-2 py-6 text-center text-sm text-muted-foreground">
                        No free agents match. Players whose contracts ended last season show here.
                      </td>
                    </tr>
                  )}
                  {pool.map(p => {
                    const bid = bidByPlayer.get(p.playerId);
                    const isSel = selected?.playerId === p.playerId;
                    const trend =
                      p.rankCurrent != null && p.rankPrevious != null
                        ? p.rankCurrent < p.rankPrevious
                          ? " ↑"
                          : p.rankCurrent > p.rankPrevious
                            ? " ↓"
                            : ""
                        : "";
                    return (
                      <tr key={p.playerId} className={`border-t border-border ${isSel ? "bg-primary/10" : ""}`}>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => openCard(p)}
                            className="flex items-center gap-2.5 text-left hover:underline"
                            aria-label={`Open ${p.name}'s player card`}
                          >
                            <PlayerAvatar playerId={p.playerId} name={p.name} />
                            <span className="flex flex-col">
                              <span className="font-semibold">{p.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {p.age != null ? `Age ${p.age}` : "Age —"} · {p.nflTeam || "FA"}
                                {p.isRfa ? ` · RFA, ${p.originalTeamName ?? "original team"} can match` : ""}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="px-2 py-2"><PositionBadge position={p.position} /></td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(p.pts / maxPts) * 100}%` }} />
                            </div>
                            <span className="w-12 text-right tabular-nums">{p.pts > 0 ? p.pts.toFixed(1) : "—"}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{p.ppg > 0 ? p.ppg.toFixed(1) : "—"}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col">
                            <span className={`font-bold tabular-nums ${rankTone(p.rank)}`}>{p.rank != null ? `${p.position}${p.rank}` : "—"}</span>
                            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                              {seasonA} {p.rankPrevious != null ? `${p.position}${p.rankPrevious}` : "—"} · {seasonB}{" "}
                              {p.rankCurrent != null ? `${p.position}${p.rankCurrent}` : "—"}
                              {trend}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{lastDeal(p)}</td>
                        <td className="px-2 py-2">
                          {bid ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                              {money(Number(bid.bidAmount))}/yr · {bid.contractYears} yr
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button size="sm" variant={isSel ? "default" : "outline"} className="h-9" onClick={() => selectPlayer(p)}>
                            {bid ? "Edit" : "Bid"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Points are PPR totals for {seasonA} and {seasonB}. Position rank is among every NFL player at the position. FLEX is RB, WR and TE.
            </p>
          </CardContent>
        </Card>

        {/* Bid builder */}
        <Card className="flex-[1_1_360px] border-primary/60">
          <CardContent className="space-y-4 p-4">
            {!selected ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Pick a player and press <span className="font-semibold text-foreground">Bid</span> to build an offer.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <PlayerAvatar playerId={selected.playerId} name={selected.name} className="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.position} · {selected.age != null ? `Age ${selected.age}` : "Age —"} · Last deal {lastDeal(selected)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p id="fa-len" className="text-[11px] uppercase tracking-wide text-muted-foreground">Contract length</p>
                  <div role="group" aria-labelledby="fa-len" className="grid grid-cols-5 gap-1.5">
                    {YEAR_OPTIONS.map(n => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={years === n}
                        onClick={() => setYears(n)}
                        className={`h-10 rounded-md border text-sm font-semibold transition-colors ${
                          years === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {n} yr
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Runs {runs}</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="fa-salary" className="text-[11px] uppercase tracking-wide text-muted-foreground">Annual average value (AAV)</label>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-11 text-lg"
                      aria-label="Lower salary by 0.5"
                      onClick={() => setSalary(String(Math.max(0, salaryNum - 0.5)))}
                    >
                      −
                    </Button>
                    <Input
                      id="fa-salary"
                      type="number"
                      min={0}
                      step={0.5}
                      placeholder="0.0"
                      value={salary}
                      onChange={e => setSalary(e.target.value)}
                      className="h-11 text-center text-lg font-semibold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-11 text-lg"
                      aria-label="Raise salary by 0.5"
                      onClick={() => setSalary(String(salaryNum + 0.5))}
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SALARIES.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setSalary(String(v))}
                        className="h-8 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {money(v)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-emerald-500/30 bg-muted/40 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Annual average value</p>
                    <p className="text-4xl font-bold leading-none tabular-nums text-emerald-400">
                      {money(salaryNum)}
                      <span className="text-base font-semibold text-emerald-300"> /yr</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">Counts against your cap every season</p>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total value</p>
                    <p className="text-xl font-semibold tabular-nums">{money(years * salaryNum)}</p>
                    <p className="text-[11px] text-muted-foreground">{years} yr × {money(salaryNum)}/yr</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your cap if this bid wins</p>
                  {impact.map(r => (
                    <div key={r.y} className="grid grid-cols-[44px_minmax(0,1fr)_96px] items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{r.y}</span>
                      <CapBar
                        segments={[
                          { value: r.committed - deadIn(r.y), className: "bg-emerald-500" },
                          { value: deadIn(r.y), className: "bg-red-500" },
                          { value: r.others, className: "bg-amber-700" },
                          { value: salaryNum, className: "bg-amber-400" },
                        ]}
                      />
                      <span className={`text-right text-xs font-semibold tabular-nums ${r.room < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {r.room < 0 ? `${money(-r.room)} over` : `${money(r.room)} left`}
                      </span>
                    </div>
                  ))}
                  <Legend
                    items={[
                      { label: "Committed", className: "bg-emerald-500" },
                      ...(hasDead ? [{ label: "Dead cap", className: "bg-red-500" }] : []),
                      { label: "Your other bids", className: "bg-amber-700" },
                      { label: "This bid", className: "bg-amber-400" },
                    ]}
                  />
                </div>

                <Button className="h-11 w-full text-base font-semibold" disabled={salaryNum <= 0 || placeBid.isPending} onClick={() => placeBid.mutate()}>
                  {isUpdate ? "Update bid" : "Submit bid"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Bids stay hidden from other teams. You can bid past your cap; if wins put you over, you choose which to reject when results open.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="font-semibold">
              My bids <span className="text-sm font-normal text-muted-foreground">· {myBids.length} open</span>
            </h3>
            {myBids.length === 0 && <p className="text-sm text-muted-foreground">No bids yet. Pick a player to start.</p>}
            {myBids.map((b: any) => {
              const n = Number(b.contractYears) || 1;
              const amt = Number(b.bidAmount) || 0;
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar playerId={b.playerId} name={b.playerName} className="h-8 w-8" />
                    <div>
                      <p className="font-semibold leading-tight">{b.playerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.playerPosition} · {n} yr · {n === 1 ? currentYear : `${currentYear}–${currentYear + n - 1}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="mr-1 flex flex-col items-end">
                      <span className="text-lg font-bold leading-tight tabular-nums text-emerald-400">
                        {money(amt)}
                        <span className="text-xs font-semibold text-emerald-300"> /yr</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{money(n * amt)} total</span>
                    </div>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => selectByBid(b)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 text-muted-foreground"
                      disabled={withdrawBid.isPending}
                      onClick={() => withdrawBid.mutate(b.id)}
                    >
                      Withdraw
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Season outlook if every bid wins</h3>
              <span className="text-xs text-muted-foreground">Line = {money(CURRENT_SEASON_CAP)} cap</span>
            </div>
            {outlook.map(o => (
              <div key={o.y} className="grid grid-cols-[44px_minmax(0,1fr)_110px] items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{o.y}</span>
                <CapBar
                  height="h-4"
                  segments={[
                    { value: o.committed - deadIn(o.y), className: "bg-emerald-500" },
                    { value: deadIn(o.y), className: "bg-red-500" },
                    { value: o.bids, className: "bg-amber-400" },
                    { value: o.draft, className: "bg-purple-400/70" },
                  ]}
                />
                <span className={`text-right text-xs font-semibold tabular-nums ${o.room < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {o.room < 0 ? `${money(-o.room)} over` : `${money(o.room)} space`}
                </span>
              </div>
            ))}
            <Legend
              items={[
                { label: "Committed", className: "bg-emerald-500" },
                ...(hasDead ? [{ label: "Dead cap", className: "bg-red-500" }] : []),
                { label: "Open bids", className: "bg-amber-400" },
                ...(draftCapital ? [{ label: "Rookie draft picks, not counted", className: "bg-purple-400/70" }] : []),
              ]}
            />
            {overSeasons.length > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                If every bid wins you are over the cap in {overSeasons.join(", ")}. That is allowed while bidding; when results open you reject wins until every season fits.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
