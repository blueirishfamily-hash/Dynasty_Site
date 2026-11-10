import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validateTrade } from "@shared/contractRules";
import { CURRENT_SEASON_CAP } from "@shared/contractRules";
import type { ParsedContract } from "./types";

export function TradesHubTab({
  leagueId,
  currentYear,
  allRosters,
  parsedContracts,
  deadCapByRoster,
}: {
  leagueId: string;
  currentYear: number;
  allRosters: Array<{ rosterId: number; teamName: string; players: Array<{ id: string; name: string; position: string }> }>;
  parsedContracts: ParsedContract[];
  deadCapByRoster: Record<number, number>;
}) {
  const [teamA, setTeamA] = useState<number | null>(null);
  const [teamB, setTeamB] = useState<number | null>(null);
  const [sendA, setSendA] = useState<string[]>([]);
  const [sendB, setSendB] = useState<string[]>([]);

  const salaryBefore = (rid: number) => {
    const contracts = parsedContracts.filter(c => c.rosterId === rid);
    const sal = contracts.reduce((s, c) => s + (c.parsedSalaries[currentYear] || 0), 0);
    return sal + (deadCapByRoster[rid] || 0);
  };

  const playerSalary = (rid: number, pid: string) => {
    const c = parsedContracts.find(x => x.rosterId === rid && x.playerId === pid);
    return c?.parsedSalaries[currentYear] || 0;
  };

  const buildSides = (rid: number, ids: string[]) =>
    ids.map(pid => ({
      playerId: pid,
      currentYearSalary: playerSalary(rid, pid),
    }));

  const validation =
    teamA != null && teamB != null
      ? validateTrade(
          { salaryBefore: salaryBefore(teamA) },
          { salaryBefore: salaryBefore(teamB) },
          buildSides(teamA, sendA),
          buildSides(teamB, sendB),
        )
      : null;

  const submit = useMutation({
    mutationFn: async () => {
      if (teamA == null || teamB == null) return;
      const res = await fetch(`/api/league/${leagueId}/trade-offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: currentYear,
          teamARosterId: teamA,
          teamBRosterId: teamB,
          teamASends: buildSides(teamA, sendA),
          teamBSends: buildSides(teamB, sendB),
        }),
      });
      if (!res.ok) throw new Error("Trade offer failed");
      return res.json();
    },
  });

  const renderCol = (rid: number | null, sends: string[], setSends: (v: string[]) => void) => {
    const roster = allRosters.find(r => r.rosterId === rid);
    if (!rid || !roster) return <p className="text-sm text-muted-foreground">Select team</p>;
    const side = rid === teamA ? validation?.teamA : validation?.teamB;
    return (
      <div className="space-y-2">
        <p className="font-semibold">{roster.teamName}</p>
        <p className="text-xs text-muted-foreground">Sends:</p>
        {sends.map(pid => {
          const p = roster.players.find(x => x.id === pid);
          return <p key={pid} className="text-xs">{p?.name} · ${playerSalary(rid, pid).toFixed(1)}</p>;
        })}
        <Select onValueChange={pid => setSends([...sends, pid])}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Add player" /></SelectTrigger>
          <SelectContent>
            {roster.players.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {side && (
          <p className={`text-xs font-medium ${side.pass ? "text-emerald-600" : "text-red-500"}`}>{side.reason}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Trades</h2>
        <p className="text-sm text-muted-foreground">Deadline Week 14 · Cap ${CURRENT_SEASON_CAP} this season only</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Team A</CardTitle></CardHeader>
          <CardContent>
            <Select value={teamA ? String(teamA) : ""} onValueChange={v => { setTeamA(Number(v)); setSendA([]); }}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{allRosters.map(r => <SelectItem key={r.rosterId} value={String(r.rosterId)}>{r.teamName}</SelectItem>)}</SelectContent>
            </Select>
            <div className="mt-3">{renderCol(teamA, sendA, setSendA)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Team B</CardTitle></CardHeader>
          <CardContent>
            <Select value={teamB ? String(teamB) : ""} onValueChange={v => { setTeamB(Number(v)); setSendB([]); }}>
              <SelectTrigger><SelectValue placeholder="Team" /></SelectTrigger>
              <SelectContent>{allRosters.map(r => <SelectItem key={r.rosterId} value={String(r.rosterId)}>{r.teamName}</SelectItem>)}</SelectContent>
            </Select>
            <div className="mt-3">{renderCol(teamB, sendB, setSendB)}</div>
          </CardContent>
        </Card>
      </div>
      <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
        <li>Allowed if after trade salary ≤ cap, or net salary decrease</li>
        <li>Both teams must pass; full salary stays with roster holder</li>
      </ul>
      <Button disabled={!validation?.bothPass || submit.isPending} onClick={() => submit.mutate()}>
        Send trade offer
      </Button>
    </div>
  );
}
