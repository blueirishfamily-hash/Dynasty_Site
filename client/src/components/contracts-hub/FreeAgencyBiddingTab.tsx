import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PHASE_LABELS, bidTotalValue, capBySeason, CURRENT_SEASON_CAP, type LeaguePhaseId } from "@shared/contractRules";
import { useToast } from "@/hooks/use-toast";
import type { ParsedContract } from "./types";

type PlayerRow = {
  playerId: string;
  name: string;
  position: string;
  lastTeam: string;
  onRosterLastSeason: boolean;
  status: string;
  age: number | null;
  ppg: number;
  lastSalary: number;
  isRfa: boolean;
  originalRosterId: number | null;
  originalTeamName: string | null;
  /** Fantasy points over the current and previous season combined. */
  pts: number;
  ptsCurrent: number;
  ptsPrevious: number;
};

type Production = {
  season: string;
  previousSeason: string;
  players: Record<string, { current: number; previous: number; currentGames: number; previousGames: number }>;
};

const POSITION_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "FLEX", "K", "DEF"] as const;
const FLEX_POSITIONS = new Set(["RB", "WR", "TE"]);

function initials(name: string) {
  return name
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PlayerAvatar({ playerId, name, className = "h-8 w-8" }: { playerId: string; name: string; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${playerId}.jpg`} alt={name} />
      <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

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
  onOpenPlayer,
}: {
  leagueId: string;
  rosterId: number;
  currentYear: number;
  currentPhase: LeaguePhaseId;
  parsedContracts: ParsedContract[];
  allRosters: Array<{ rosterId: number; teamName: string; players: Array<{ id: string; weeklyAvg: number; age: number | null }> }>;
  playerMap: Record<string, { name?: string; position?: string; age?: number }>;
  perfByPlayer: Record<string, { weeklyAvg: number; age: number | null }>;
  rfaDesignations: Array<{ playerId: string; rosterId: number }>;
  /** Opens the player card. Free agents have no contract on a team, so none is passed. */
  onOpenPlayer?: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const round = currentPhase === "fa_round_2" ? 2 : 1;
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [years, setYears] = useState("1");
  const [salary, setSalary] = useState("");
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState("ALL");
  const qc = useQueryClient();
  const { toast } = useToast();

  const teamByRoster = useMemo(() => Object.fromEntries(allRosters.map(r => [r.rosterId, r.teamName])), [allRosters]);

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

  const pool = useMemo(() => {
    const expiring = parsedContracts.filter(c => c.contractThrough === currentYear - 1 || c.contractThrough === currentYear);
    const rows: PlayerRow[] = [];
    const rfaByPlayer = new Map(rfaDesignations.map(d => [d.playerId, d]));
    for (const c of expiring) {
      if (signedIds.has(c.playerId)) continue;
      const p = playerMap[c.playerId];
      const perf = perfByPlayer[c.playerId];
      const des = rfaByPlayer.get(c.playerId);
      const isRfa = !!des;
      const orig = des?.rosterId ?? null;
      if (isRfa && orig === rosterId) continue;
      rows.push({
        playerId: c.playerId,
        name: p?.name || c.playerId.slice(0, 8),
        position: p?.position || "?",
        lastTeam: teamByRoster[c.rosterId] || "Unknown",
        onRosterLastSeason: true,
        status: isRfa ? `RFA · ${teamByRoster[orig!] || "Original"} can match` : "Free agent",
        age: perf?.age ?? p?.age ?? null,
        ppg: perf?.weeklyAvg ?? 0,
        lastSalary: c.parsedSalaries[currentYear - 1] || c.parsedSalaries[currentYear] || 0,
        isRfa,
        originalRosterId: orig,
        originalTeamName: orig ? teamByRoster[orig] : null,
        ptsCurrent: production?.players[c.playerId]?.current ?? 0,
        ptsPrevious: production?.players[c.playerId]?.previous ?? 0,
        pts: (production?.players[c.playerId]?.current ?? 0) + (production?.players[c.playerId]?.previous ?? 0),
      });
    }
    return rows
      .filter(r => {
        if (pos === "FLEX" ? !FLEX_POSITIONS.has(r.position) : pos !== "ALL" && r.position !== pos) return false;
        if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      // Most productive first: total points over the last two seasons.
      .sort((a, b) => b.pts - a.pts || b.ppg - a.ppg || a.name.localeCompare(b.name));
  }, [parsedContracts, currentYear, playerMap, perfByPlayer, rfaDesignations, teamByRoster, rosterId, search, pos, production, signedIds]);

  const rostered = pool.filter(p => p.onRosterLastSeason);
  const notRostered = pool.filter(p => !p.onRosterLastSeason);

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
  // Never let a bad response crash the page.
  // Only this round's open bids count here. Bids from other rounds or seasons, and ones already decided, do not.
  const myBids: any[] = (Array.isArray(myBidsData) ? myBidsData : []).filter(
    b => (b.status ?? "active") === "active" && b.round === round && b.season === currentYear,
  );

  const selectPlayer = (p: PlayerRow) => {
    setSelected(p);
    // Bidding on a player again changes the open bid, so start from what is already there.
    const existing = myBids.find(b => b.playerId === p.playerId);
    if (existing) {
      setYears(String(existing.contractYears));
      setSalary(String(existing.bidAmount));
    } else {
      setYears("1");
      setSalary("");
    }
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
          bidAmount: Number(salary),
          contractYears: Number(years),
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
        title: myBids.some(b => b.playerId === selected?.playerId) ? "Bid updated" : "Bid submitted",
        description: selected
          ? `${selected.name}: ${years} year${Number(years) === 1 ? "" : "s"} at $${Number(salary).toFixed(1)} per year`
          : undefined,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Bid not submitted", description: e.message, variant: "destructive" });
    },
  });

  const total = Number(salary) * Number(years) || 0;
  const teamContracts = parsedContracts.filter(c => c.rosterId === rosterId);
  const capInput = {
    rosterId,
    contracts: teamContracts.map(c => ({ playerId: c.playerId, salaries: c.parsedSalaries })),
    deadCapByYear: {} as Record<number, number>,
  };
  const bidYears: number[] = [];
  for (let i = 0; i < Number(years || 0); i++) bidYears.push(currentYear + i);
  const ifAllWinSeasons = [...new Set([...bidYears, ...myBids.flatMap((b: any) => {
    const ys: number[] = [];
    for (let i = 0; i < b.contractYears; i++) ys.push(currentYear + i);
    return ys;
  })])];
  const extra = myBids.map((b: any) => ({
    yearlySalary: b.bidAmount,
    startYear: currentYear,
    years: b.contractYears,
  }));
  const capTable = capBySeason(capInput, ifAllWinSeasons, extra);

  const openCard = (p: PlayerRow) => {
    // The player's last team is the closest thing to a roster for the card header.
    const lastRoster = parsedContracts.find(c => c.playerId === p.playerId)?.rosterId ?? rosterId;
    onOpenPlayer?.(p.playerId, lastRoster, null);
  };

  // Cap picture for the bid being built: what is already on the books, other open bids, and this bid.
  const proposalYears: number[] = [];
  for (let i = 0; i < Math.min(Math.max(Number(years) || 0, 0), 5); i++) proposalYears.push(currentYear + i);
  const otherBids = myBids.filter((b: any) => !selected || b.playerId !== selected.playerId);
  const otherExtra = otherBids.map((b: any) => ({ yearlySalary: b.bidAmount, startYear: currentYear, years: b.contractYears }));
  const booksOnly = capBySeason(capInput, proposalYears);
  const withOthers = capBySeason(capInput, proposalYears, otherExtra);
  const proposedSalary = Number(salary) || 0;

  const renderTable = (title: string, list: PlayerRow[]) => (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title} ({list.length})</p>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <h2 className="text-lg font-bold">Free Agency — Round {round}</h2>
        <span className="text-xs text-muted-foreground">{PHASE_LABELS[currentPhase]}</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row flex-wrap gap-2">
            <Input placeholder="Search" className="max-w-xs h-8" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              {POSITION_FILTERS.map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={pos === p ? "default" : "outline"}
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setPos(p)}
                >
                  {p === "ALL" ? "All" : p}
                </Button>
              ))}
            </div>
            <p className="w-full text-[10px] text-muted-foreground">
              Sorted by total fantasy points over {production ? `${production.previousSeason}–${production.season}` : "the last two seasons"}. FLEX is RB, WR and TE. Click a player for the player card.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {renderTable("On a roster last season", rostered)}
            <PlayerTable list={rostered} selected={selected} myBids={myBids} onSelect={selectPlayer} onOpen={openCard} />
            {renderTable("Not on a roster last season", notRostered)}
            {notRostered.length === 0 && <p className="text-xs text-muted-foreground px-4 pb-4">None in pool</p>}
            {notRostered.length > 0 && <PlayerTable list={notRostered} selected={selected} myBids={myBids} onSelect={selectPlayer} onOpen={openCard} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Place a bid</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selected ? (
              <>
                <div className="flex items-center gap-2">
                  <PlayerAvatar playerId={selected.playerId} name={selected.name} className="h-10 w-10" />
                  <p className="font-medium">{selected.name} <span className="block text-muted-foreground text-xs font-normal">{selected.position} · {selected.status}</span></p>
                </div>
                <Input type="number" min={1} placeholder="Years" value={years} onChange={e => setYears(e.target.value)} />
                <Input type="number" min={0} placeholder="Salary / year" value={salary} onChange={e => setSalary(e.target.value)} />
                <p className="text-2xl font-bold">${total.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">total</span></p>
                <p className="text-[10px] text-muted-foreground">Flat salary yearly; highest total wins; tie → higher yearly; no minimum.</p>
                {proposalYears.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Your cap if this bid wins</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="h-7 px-2">Year</TableHead>
                          <TableHead className="h-7 px-2 text-right">On books</TableHead>
                          <TableHead className="h-7 px-2 text-right">Other bids</TableHead>
                          <TableHead className="h-7 px-2 text-right text-blue-500">This bid</TableHead>
                          <TableHead className="h-7 px-2 text-right">Total</TableHead>
                          <TableHead className="h-7 px-2 text-right">Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {proposalYears.map(y => {
                          const books = booksOnly[y]?.committed ?? 0;
                          const others = Math.max(0, (withOthers[y]?.committed ?? 0) - books);
                          const projected = books + others + proposedSalary;
                          const room = CURRENT_SEASON_CAP - projected;
                          const over = room < 0;
                          return (
                            <TableRow key={y} className={`text-xs ${over ? "text-red-500" : ""}`}>
                              <TableCell className="px-2 py-1.5 font-medium">{y}</TableCell>
                              <TableCell className="px-2 py-1.5 text-right">${books.toFixed(1)}</TableCell>
                              <TableCell className="px-2 py-1.5 text-right">{others > 0 ? `$${others.toFixed(1)}` : "—"}</TableCell>
                              <TableCell className="px-2 py-1.5 text-right text-blue-500">${proposedSalary.toFixed(1)}</TableCell>
                              <TableCell className="px-2 py-1.5 text-right font-semibold">${projected.toFixed(1)}</TableCell>
                              <TableCell className="px-2 py-1.5 text-right">{over ? `$${(-room).toFixed(1)} over` : `$${room.toFixed(1)}`}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <p className="text-[10px] text-muted-foreground mt-1">Cap ${CURRENT_SEASON_CAP}. Going over is allowed now; wins are checked when the round closes.</p>
                  </div>
                )}
                <Button className="w-full" disabled={!salary || placeBid.isPending} onClick={() => placeBid.mutate()}>Submit bid</Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a player</p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">My open bids</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {myBids.length === 0 && <p className="text-sm text-muted-foreground">No open bids</p>}
            {myBids.map((b: any) => (
              <div key={b.id} className="text-xs flex justify-between border-b border-border pb-1">
                <span>{b.playerName}</span>
                <span className="flex items-center gap-2">
                  {b.contractYears} yr × ${b.bidAmount} per year = ${bidTotalValue(b.bidAmount, b.contractYears)} total
                  <button
                    className="text-red-500 hover:underline"
                    disabled={withdrawBid.isPending}
                    onClick={() => withdrawBid.mutate(b.id)}
                  >
                    Withdraw
                  </button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">If every bid wins</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs"><TableHead>Season</TableHead><TableHead>Total</TableHead><TableHead>Room</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {ifAllWinSeasons.map(y => {
                  const row = capTable[y];
                  const over = row && row.room < 0;
                  return (
                    <TableRow key={y} className={over ? "text-red-500" : ""}>
                      <TableCell>{y}</TableCell>
                      <TableCell>${row?.committed.toFixed(1)}</TableCell>
                      <TableCell>{over ? `$${(-row.room).toFixed(1)} over` : `$${row?.room.toFixed(1)}`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-[10px] text-muted-foreground mt-2">Going over is allowed; reject wins after the round closes. Cap ${CURRENT_SEASON_CAP}.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlayerTable({
  list,
  selected,
  myBids,
  onSelect,
  onOpen,
}: {
  list: PlayerRow[];
  selected: PlayerRow | null;
  myBids: any[];
  onSelect: (p: PlayerRow) => void;
  onOpen: (p: PlayerRow) => void;
}) {
  const bidIds = new Set(myBids.map(b => b.playerId));
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead>Pos</TableHead><TableHead>Status</TableHead>
          <TableHead className="text-right">Pts (2 yrs)</TableHead><TableHead className="text-right">PPG</TableHead><TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map(p => (
          <TableRow
            key={p.playerId}
            className={`cursor-pointer ${selected?.playerId === p.playerId ? "bg-muted/60" : ""}`}
            onClick={() => onOpen(p)}
          >
            <TableCell className="font-medium text-sm">
              <div className="flex items-center gap-2">
                <PlayerAvatar playerId={p.playerId} name={p.name} />
                <span>{p.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-xs">{p.lastTeam}</TableCell>
            <TableCell>{p.position}</TableCell>
            <TableCell className="text-[10px]">{p.status}</TableCell>
            <TableCell className="text-right">
              {p.pts > 0 ? (
                <>
                  <div className="font-semibold">{p.pts.toFixed(1)}</div>
                  <div className="text-[10px] text-muted-foreground">{p.ptsCurrent.toFixed(0)} + {p.ptsPrevious.toFixed(0)}</div>
                </>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-right">{p.ppg > 0 ? p.ppg.toFixed(1) : "—"}</TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  onSelect(p);
                }}
              >
                {bidIds.has(p.playerId) ? "Edit bid" : "Bid"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
