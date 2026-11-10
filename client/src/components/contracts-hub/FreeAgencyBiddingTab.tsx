import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PHASE_LABELS, bidTotalValue, capBySeason, CURRENT_SEASON_CAP, type LeaguePhaseId } from "@shared/contractRules";
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
};

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
}) {
  const round = currentPhase === "fa_round_2" ? 2 : 1;
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [years, setYears] = useState("1");
  const [salary, setSalary] = useState("");
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState("ALL");
  const qc = useQueryClient();

  const teamByRoster = useMemo(() => Object.fromEntries(allRosters.map(r => [r.rosterId, r.teamName])), [allRosters]);

  const pool = useMemo(() => {
    const expiring = parsedContracts.filter(c => c.contractThrough === currentYear - 1 || c.contractThrough === currentYear);
    const rows: PlayerRow[] = [];
    const rfaByPlayer = new Map(rfaDesignations.map(d => [d.playerId, d]));
    for (const c of expiring) {
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
      });
    }
    return rows.filter(r => {
      if (pos !== "ALL" && r.position !== pos) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [parsedContracts, currentYear, playerMap, perfByPlayer, rfaDesignations, teamByRoster, rosterId, search, pos]);

  const rostered = pool.filter(p => p.onRosterLastSeason);
  const notRostered = pool.filter(p => !p.onRosterLastSeason);

  const { data: myBids = [] } = useQuery({
    queryKey: ["/api/league", leagueId, "bids", rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/${rosterId}`);
      return res.json();
    },
    enabled: !!leagueId,
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
      if (!res.ok) throw new Error((await res.json()).error || "Bid failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "bids", rosterId] });
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
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {renderTable("On a roster last season", rostered)}
            <PlayerTable list={rostered} selected={selected} myBids={myBids} onSelect={setSelected} />
            {renderTable("Not on a roster last season", notRostered)}
            {notRostered.length === 0 && <p className="text-xs text-muted-foreground px-4 pb-4">None in pool</p>}
            {notRostered.length > 0 && <PlayerTable list={notRostered} selected={selected} myBids={myBids} onSelect={setSelected} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Place a bid</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selected ? (
              <>
                <p className="font-medium">{selected.name} <span className="text-muted-foreground text-xs">{selected.status}</span></p>
                <Input type="number" min={1} placeholder="Years" value={years} onChange={e => setYears(e.target.value)} />
                <Input type="number" min={0} placeholder="Salary / year" value={salary} onChange={e => setSalary(e.target.value)} />
                <p className="text-2xl font-bold">${total.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">total</span></p>
                <p className="text-[10px] text-muted-foreground">Flat salary yearly; highest total wins; tie → higher yearly; no minimum.</p>
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
                <span>{b.contractYears}×${b.bidAmount} = ${bidTotalValue(b.bidAmount, b.contractYears)}</span>
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
}: {
  list: PlayerRow[];
  selected: PlayerRow | null;
  myBids: any[];
  onSelect: (p: PlayerRow) => void;
}) {
  const bidIds = new Set(myBids.map(b => b.playerId));
  return (
    <Table>
      <TableHeader>
        <TableRow className="text-xs">
          <TableHead>Player</TableHead><TableHead>Team</TableHead><TableHead>Pos</TableHead><TableHead>Status</TableHead><TableHead>PPG</TableHead><TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.map(p => (
          <TableRow key={p.playerId} className={selected?.playerId === p.playerId ? "bg-muted/60" : ""} onClick={() => onSelect(p)}>
            <TableCell className="font-medium text-sm">{p.name}</TableCell>
            <TableCell className="text-xs">{p.lastTeam}</TableCell>
            <TableCell>{p.position}</TableCell>
            <TableCell className="text-[10px]">{p.status}</TableCell>
            <TableCell>{p.ppg > 0 ? p.ppg.toFixed(1) : "—"}</TableCell>
            <TableCell><Button size="sm" variant="outline" className="h-7 text-xs">{bidIds.has(p.playerId) ? "Edit bid" : "Bid"}</Button></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
