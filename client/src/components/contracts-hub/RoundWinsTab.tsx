import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validateRoundResolution } from "@shared/contractRules";
import type { ParsedContract } from "./types";

export function RoundWinsTab({
  leagueId,
  rosterId,
  teamName,
  currentYear,
  round,
  parsedContracts,
  deadCapCurrentYear,
}: {
  leagueId: string;
  rosterId: number;
  teamName: string;
  currentYear: number;
  round: number;
  parsedContracts: ParsedContract[];
  deadCapCurrentYear: number;
}) {
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/league", leagueId, "round-wins", rosterId, round, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/roster/${rosterId}/round-wins?round=${round}&season=${currentYear}`);
      return res.json();
    },
    enabled: !!leagueId,
  });

  const wins: any[] = data?.wins || [];
  const confirmed = data?.confirmed;

  const team = useMemo(() => ({
    rosterId,
    contracts: parsedContracts.filter(c => c.rosterId === rosterId).map(c => ({
      playerId: c.playerId,
      salaries: c.parsedSalaries,
    })),
    deadCapByYear: { [currentYear]: deadCapCurrentYear } as Record<number, number>,
  }), [parsedContracts, rosterId, currentYear, deadCapCurrentYear]);

  const kept = wins.filter(w => !rejected.has(w.id));
  const validation = useMemo(
    () => validateRoundResolution(team, kept.map(w => ({
      yearlySalary: w.bidAmount,
      startYear: currentYear,
      years: w.contractYears,
      playerId: w.playerId,
    })), currentYear),
    [team, kept, currentYear],
  );

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/roster/${rosterId}/round-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, season: currentYear, rejectedBidIds: [...rejected] }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "round-wins", rosterId] }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const banner = confirmed
    ? "confirmed"
    : validation.canConfirm
      ? "fits"
      : "over";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Round {round} results — {teamName}</h2>
        <p className="text-sm text-muted-foreground">You won {wins.length} bid{wins.length !== 1 ? "s" : ""}. Reject until every season fits under cap.</p>
      </div>
      <Card className={banner === "over" ? "border-red-500/40" : banner === "fits" ? "border-emerald-500/40" : ""}>
        <CardContent className="pt-4 text-sm">
          {banner === "over" && <>You are over the cap in at least one season. Reject wins to confirm.</>}
          {banner === "fits" && !confirmed && <>Every season fits. Confirm to lock in.</>}
          {banner === "confirmed" && <>Decisions confirmed.</>}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Winning bids</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {wins.map(w => (
              <div key={w.id} className={`flex items-center gap-2 text-sm ${rejected.has(w.id) ? "opacity-50" : ""}`}>
                <Checkbox checked={rejected.has(w.id)} onCheckedChange={() => {
                  const next = new Set(rejected);
                  if (next.has(w.id)) next.delete(w.id); else next.add(w.id);
                  setRejected(next);
                }} />
                <span className="flex-1">{w.playerName} ({w.playerPosition})</span>
                <span>{w.contractYears}×${w.bidAmount} = ${w.bidAmount * w.contractYears}</span>
                <span className="text-xs">{rejected.has(w.id) ? "Rejected" : "Keep"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Cap check</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs"><TableHead>Season</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(validation.bySeason).map(([y, row]) => (
                  <TableRow key={y}>
                    <TableCell>{y}</TableCell>
                    <TableCell>${row.committed.toFixed(1)}</TableCell>
                    <TableCell className={row.room < 0 ? "text-red-500" : ""}>
                      {row.room < 0 ? `$${(-row.room).toFixed(1)} over` : `$${row.room.toFixed(1)} room`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Button disabled={!validation.canConfirm || confirmed || confirm.isPending} onClick={() => confirm.mutate()}>
        Confirm decisions
      </Button>
      <p className="text-[10px] text-muted-foreground">Kept RFA wins enter the original team&apos;s match window and count against your cap until it closes.</p>
    </div>
  );
}
