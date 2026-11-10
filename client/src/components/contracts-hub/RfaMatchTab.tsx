import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canMatchRFA } from "@shared/contractRules";
import type { ParsedContract } from "./types";

export function RfaMatchTab({
  leagueId,
  rosterId,
  currentYear,
  window,
  parsedContracts,
  deadCapCurrentYear,
  playerMap,
}: {
  leagueId: string;
  rosterId: number;
  currentYear: number;
  window: number;
  parsedContracts: ParsedContract[];
  deadCapCurrentYear: number;
  playerMap: Record<string, { name?: string; position?: string }>;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["/api/league", leagueId, "rfa", currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/rfa?season=${currentYear}`);
      return res.json();
    },
    enabled: !!leagueId,
  });

  const designation = (data?.designations || []).find((d: any) => d.rosterId === rosterId);
  const offer = (data?.offers || []).find(
    (o: any) => o.originalRosterId === rosterId && o.window === window && o.status === "pending",
  );
  const myPendingOffers = (data?.offers || []).filter(
    (o: any) => o.biddingRosterId === rosterId && o.status === "pending",
  );

  const team = {
    rosterId,
    contracts: parsedContracts.filter(c => c.rosterId === rosterId).map(c => ({
      playerId: c.playerId,
      salaries: c.parsedSalaries,
    })),
    deadCapByYear: { [currentYear]: deadCapCurrentYear, [currentYear + 1]: 0 },
  };

  const matchCheck = offer
    ? canMatchRFA(team, {
        yearlySalary: offer.yearlySalary,
        startYear: currentYear,
        years: offer.contractYears,
      })
    : null;

  const matchMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/rfa/${offer.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season: currentYear }),
      });
      if (!res.ok) throw new Error("Match failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "rfa"] }),
  });

  const walkMut = useMutation({
    mutationFn: async () => {
      await fetch(`/api/league/${leagueId}/rfa/${offer.id}/walk`, { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "rfa"] }),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">RFA Match Window {window}</h2>
      <p className="text-sm text-muted-foreground">Match exact years and salary or let him walk. Nothing comes back if he leaves.</p>
      {!designation && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No designated RFA this season (1 per season).</CardContent></Card>
      )}
      {designation && !offer && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No offers on your RFA yet.</CardContent></Card>
      )}
      {offer && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Offer on your RFA</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="font-medium">{playerMap[offer.playerId]?.name || offer.playerId}</p>
            <p className="text-xs text-muted-foreground">{offer.contractYears} years · ${offer.yearlySalary}/yr · ${offer.yearlySalary * offer.contractYears} total</p>
            <p className="text-xs">{matchCheck?.eligible ? "Can match" : matchCheck?.reason}</p>
            <div className="flex gap-2 flex-wrap">
              <Button disabled={!matchCheck?.eligible || matchMut.isPending} onClick={() => matchMut.mutate()}>Match offer</Button>
              <Button variant="outline" onClick={() => walkMut.mutate()}>Let him walk</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {myPendingOffers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Your offers awaiting decision</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {myPendingOffers.map((o: any) => (
              <div key={o.id} className="flex justify-between border-b pb-1">
                <span>{playerMap[o.playerId]?.name || o.playerId}</span>
                <span className="text-xs text-amber-600">Pending match · counted on your cap</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
