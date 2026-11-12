import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Signing {
  id: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  playerTeam: string | null;
  bidAmount: number;
  contractYears: number;
  round: number;
}

function PlayerCell({ s }: { s: Signing }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={`https://sleepercdn.com/content/nfl/players/${s.playerId}.jpg`} alt={s.playerName} />
        <AvatarFallback className="text-[10px]">{s.playerName.split(" ").map(n => n[0]).join("").slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-medium truncate">{s.playerName}</div>
        <div className="text-xs text-muted-foreground">{s.playerPosition}{s.playerTeam ? ` · ${s.playerTeam}` : ""}</div>
      </div>
    </div>
  );
}

/** Shown between Round 2 results and the regular season: every player each team signed in free agency. */
export function FreeAgencyRecapTab({
  leagueId,
  rosterId,
  teamName,
  currentYear,
  allRosters,
}: {
  leagueId: string;
  rosterId: number;
  teamName: string;
  currentYear: number;
  allRosters: Array<{ rosterId: number; teamName: string }>;
}) {
  const { data, isLoading, error } = useQuery<{ signings: Signing[] }>({
    queryKey: ["/api/league", leagueId, "fa-recap", currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/fa-recap?season=${currentYear}`);
      if (!res.ok) throw new Error("Could not load the free agency recap");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const signings = Array.isArray(data?.signings) ? data!.signings : [];
  const mine = signings.filter(s => s.rosterId === rosterId).sort((a, b) => a.round - b.round || b.bidAmount * b.contractYears - a.bidAmount * a.contractYears);
  const totalPerYear = mine.reduce((sum, s) => sum + s.bidAmount, 0);
  const totalValue = mine.reduce((sum, s) => sum + s.bidAmount * s.contractYears, 0);

  const byTeam = useMemo(() => {
    const m = new Map<number, Signing[]>();
    for (const s of signings) {
      if (s.rosterId === rosterId) continue;
      m.set(s.rosterId, [...(m.get(s.rosterId) || []), s]);
    }
    return [...m.entries()]
      .map(([rid, list]) => ({
        rosterId: rid,
        teamName: allRosters.find(r => r.rosterId === rid)?.teamName || `Team ${rid}`,
        list: list.sort((a, b) => a.round - b.round),
      }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [signings, rosterId, allRosters]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-red-500">{(error as Error).message}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Free agency recap — {teamName}</h2>
        <p className="text-sm text-muted-foreground">
          {mine.length === 0
            ? `${teamName} did not sign any free agents.`
            : `${teamName} signed ${mine.length} player${mine.length !== 1 ? "s" : ""}: $${totalPerYear}/yr committed, $${totalValue} total value.`}
        </p>
      </div>

      {mine.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Players signed</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Player</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead>Years</TableHead>
                  <TableHead>Per year</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.map(s => (
                  <TableRow key={s.id}>
                    <TableCell><PlayerCell s={s} /></TableCell>
                    <TableCell><Badge variant="outline">R{s.round}</Badge></TableCell>
                    <TableCell>{s.contractYears}</TableCell>
                    <TableCell>${s.bidAmount}</TableCell>
                    <TableCell>${s.bidAmount * s.contractYears}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {byTeam.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Around the league</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {byTeam.map(t => (
              <div key={t.rosterId}>
                <div className="text-sm font-semibold mb-1">{t.teamName}</div>
                <div className="space-y-1">
                  {t.list.map(s => (
                    <div key={s.id} className="flex items-center gap-3 text-sm">
                      <div className="flex-1"><PlayerCell s={s} /></div>
                      <span className="text-xs text-muted-foreground">R{s.round}</span>
                      <span>{s.contractYears}×${s.bidAmount}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
