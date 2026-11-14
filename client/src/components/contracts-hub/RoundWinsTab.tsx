import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { capBySeason, CURRENT_SEASON_CAP, validateRoundResolution } from "@shared/contractRules";
import { useToast } from "@/hooks/use-toast";
import { CapBar, Legend, PlayerAvatar, PositionBadge, money, usePositionRanks } from "./FreeAgencyBiddingTab";
import type { ParsedContract } from "./types";

type RoundSummary = {
  results: Array<{
    playerId: string;
    playerName: string;
    playerPosition: string;
    rosterId: number;
    bidAmount: number;
    contractYears: number;
    result: "won" | "kept" | "rejected";
    otherBids: number;
  }>;
  lost: Array<{
    playerId: string;
    playerName: string;
    playerPosition: string;
    bidAmount: number;
    contractYears: number;
    winner: { rosterId: number; bidAmount: number; contractYears: number } | null;
  }>;
  confirmations: { confirmed: number; total: number; waitingRosterIds: number[] };
};

const yearsText = (start: number, n: number) => (n <= 1 ? String(start) : `${start}–${start + n - 1}`);

/** AAV first, total value second: AAV is what counts against the cap each season. */
function Aav({ amount, years, size = "md" }: { amount: number; years: number; size?: "md" | "lg" }) {
  return (
    <div className="flex flex-col items-end">
      <span className={`font-bold leading-none tabular-nums text-emerald-400 ${size === "lg" ? "text-2xl" : "text-base"}`}>
        {money(amount)}
        <span className={`font-semibold text-emerald-300 ${size === "lg" ? "text-sm" : "text-xs"}`}> /yr{size === "lg" ? " AAV" : ""}</span>
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {money(amount * years)} total over {years} yr
      </span>
    </div>
  );
}

export function RoundWinsTab({
  leagueId,
  rosterId,
  teamName,
  currentYear,
  round,
  parsedContracts,
  deadCapByYear,
  allRosters,
  playerMap,
}: {
  leagueId: string;
  rosterId: number;
  teamName: string;
  currentYear: number;
  round: number;
  parsedContracts: ParsedContract[];
  /** This team's dead cap by season ($M). */
  deadCapByYear: Record<number, number>;
  allRosters: Array<{ rosterId: number; teamName: string }>;
  playerMap: Record<string, { position?: string }>;
}) {
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const { toast } = useToast();
  const teamNameOf = (rid: number) => allRosters.find(r => r.rosterId === rid)?.teamName ?? `Team ${rid}`;
  const { ranks } = usePositionRanks(leagueId, playerMap);

  const { data, isLoading, error: winsError } = useQuery({
    queryKey: ["/api/league", leagueId, "round-wins", rosterId, round, currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/roster/${rosterId}/round-wins?round=${round}&season=${currentYear}`);
      if (!res.ok) throw new Error("Could not load winning bids");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: summary } = useQuery<RoundSummary>({
    queryKey: ["/api/league", leagueId, "fa-round-summary", round, currentYear, rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/fa-round-summary?round=${round}&season=${currentYear}&rosterId=${rosterId}`);
      if (!res.ok) throw new Error("Could not load the round summary");
      return res.json();
    },
    enabled: !!leagueId,
    refetchInterval: 60_000,
  });

  const wins: any[] = Array.isArray(data?.wins) ? data.wins : [];
  const confirmed = !!data?.confirmed;
  const winPlayerIds = useMemo(() => new Set(wins.map(w => w.playerId)), [wins]);

  // Contracts already on the books, without this round's wins (once confirmed, kept wins are contracts too).
  const team = useMemo(
    () => ({
      rosterId,
      contracts: parsedContracts
        .filter(c => c.rosterId === rosterId && !winPlayerIds.has(c.playerId))
        .map(c => ({ playerId: c.playerId, salaries: c.parsedSalaries })),
      deadCapByYear,
    }),
    [parsedContracts, rosterId, deadCapByYear, winPlayerIds],
  );

  // Once decisions are confirmed, show what was actually decided; before that, what the team has picked.
  const isRejected = (w: any) => (confirmed ? w.result === "rejected" : rejected.has(w.id));
  const kept = wins.filter(w => !isRejected(w));
  const keptContracts = kept.map(w => ({ yearlySalary: w.bidAmount, startYear: currentYear, years: w.contractYears, playerId: w.playerId }));
  const validation = useMemo(() => validateRoundResolution(team, keptContracts, currentYear), [team, keptContracts, currentYear]);

  const maxYears = Math.max(1, ...wins.map(w => Number(w.contractYears) || 1));
  const seasons: number[] = [];
  for (let i = 0; i < maxYears; i++) seasons.push(currentYear + i);
  const books = capBySeason(team, seasons);
  const keptIn = (y: number) => kept.reduce((sum, w) => (y - currentYear < w.contractYears ? sum + w.bidAmount : sum), 0);
  const seasonRows = seasons.map(y => {
    const committed = books[y]?.committed ?? 0;
    const add = keptIn(y);
    return { y, committed, dead: deadCapByYear[y] || 0, add, room: CURRENT_SEASON_CAP - committed - add };
  });
  const overRows = seasonRows.filter(r => r.room < 0);
  const keptAav = kept.reduce((sum, w) => sum + Number(w.bidAmount), 0);
  const keptTotal = kept.reduce((sum, w) => sum + Number(w.bidAmount) * Number(w.contractYears), 0);

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/roster/${rosterId}/round-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round, season: currentYear, rejectedBidIds: [...rejected] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not confirm");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "round-wins", rosterId] });
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "fa-round-summary"] });
      // Confirming signs the kept players, so their contracts now exist.
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      qc.invalidateQueries({ queryKey: ["/api/league", leagueId, "fa-recap"] });
      toast({ title: "Confirmed", description: `${kept.length} player${kept.length === 1 ? "" : "s"} signed.` });
    },
    onError: (e: Error) => toast({ title: "Not confirmed", description: e.message, variant: "destructive" }),
  });

  const toggle = (id: string, reject: boolean) => {
    if (confirmed) return;
    const next = new Set(rejected);
    if (reject) next.add(id);
    else next.delete(id);
    setRejected(next);
  };

  const conf = summary?.confirmations;
  const confPct = conf && conf.total > 0 ? Math.round((conf.confirmed / conf.total) * 100) : 0;
  const nextStep = round === 1 ? "Round 2 opens once every team confirms" : "Free agency wraps up once every team confirms";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const state = confirmed ? "confirmed" : wins.length === 0 ? "none" : validation.canConfirm ? "fits" : "over";
  const banner = {
    confirmed: {
      tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-100",
      dot: "bg-emerald-500",
      title: "Confirmed — your players are signed",
      text: "They count against your cap now. The commissioner moves them onto your Sleeper roster.",
    },
    fits: {
      tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-100",
      dot: "bg-emerald-500",
      title: "Every season fits under the cap",
      text: `Confirm to sign the ${kept.length} player${kept.length === 1 ? "" : "s"} you are keeping.`,
    },
    over: {
      tone: "border-amber-500/60 bg-amber-500/10 text-amber-100",
      dot: "bg-amber-500",
      title: `Over the cap in ${overRows.map(r => `${r.y} by ${money(-r.room)}`).join(" and ")}`,
      text: "Reject wins until every season fits. The cap check updates as you go.",
    },
    none: {
      tone: "border-border bg-muted/30 text-foreground",
      dot: "bg-muted-foreground",
      title: `${teamName} did not win any bids in Round ${round}`,
      text: "Nothing to confirm. Your lost bids and the league's results are below.",
    },
  }[state];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{currentYear} league year</p>
          <h2 className="text-2xl font-bold leading-tight">Round {round} Results</h2>
          <p className="text-xs text-muted-foreground">Keep or reject each win, then confirm. Kept players are signed the moment you confirm.</p>
        </div>
        {conf && conf.total > 0 && (
          <div className="min-w-[240px] space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">League confirmations</span>
              <span className="font-semibold">
                {conf.confirmed} of {conf.total} teams
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-emerald-500" style={{ width: `${confPct}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">{nextStep}</p>
          </div>
        )}
      </div>

      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${banner.tone}`} role="status">
        <span className={`h-2.5 w-2.5 flex-none rounded-full ${banner.dot}`} aria-hidden="true" />
        <div>
          <p className="font-semibold">{banner.title}</p>
          <p className="text-sm opacity-85">{banner.text}</p>
        </div>
      </div>
      {winsError && <p className="text-sm text-red-500">{(winsError as Error).message}</p>}

      {wins.length > 0 && (
        <div className="flex flex-wrap items-start gap-5">
          <section aria-label="Your wins" className="min-w-0 flex-[999_1_620px] space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                Your wins <span className="text-sm font-normal text-muted-foreground">· {wins.length} won</span>
              </h3>
              <span className="text-xs text-muted-foreground">
                {round === 1 ? "Rejected players go back into the Round 2 pool" : "Rejected players stay unsigned"}
              </span>
            </div>
            {wins.map(w => {
              const rej = isRejected(w);
              const pos = w.playerPosition || "?";
              const rank = ranks.combined.get(w.playerId);
              const others = summary?.results.find(r => r.playerId === w.playerId)?.otherBids;
              return (
                <Card key={w.id} className={`transition-opacity ${rej ? "opacity-55" : "border-emerald-500/40"}`}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 flex-[1_1_280px] items-center gap-3">
                      <PlayerAvatar playerId={w.playerId} name={w.playerName} className="h-11 w-11" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{w.playerName}</span>
                          <PositionBadge position={pos} />
                          {rank != null && <span className="text-xs text-muted-foreground">{pos}{rank} over 2 yrs</span>}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {w.contractYears}-year deal · {yearsText(currentYear, w.contractYears)}
                        </p>
                        {others != null && (
                          <p className="text-xs text-muted-foreground">
                            {others === 0 ? "Only bid" : `Beat ${others} other bid${others === 1 ? "" : "s"}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Aav amount={Number(w.bidAmount)} years={Number(w.contractYears)} size="lg" />
                      <div
                        role="group"
                        aria-label={`Keep or reject ${w.playerName}`}
                        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-background p-1"
                      >
                        <button
                          type="button"
                          aria-pressed={!rej}
                          disabled={confirmed}
                          onClick={() => toggle(w.id, false)}
                          className={`h-9 min-w-[76px] rounded-md text-sm font-semibold ${!rej ? "bg-emerald-500 text-emerald-950" : "text-muted-foreground"} ${confirmed ? "cursor-default" : ""}`}
                        >
                          {confirmed && !rej ? "Kept" : "Keep"}
                        </button>
                        <button
                          type="button"
                          aria-pressed={rej}
                          disabled={confirmed}
                          onClick={() => toggle(w.id, true)}
                          className={`h-9 min-w-[76px] rounded-md text-sm font-semibold ${rej ? "bg-amber-500 text-amber-950" : "text-muted-foreground"} ${confirmed ? "cursor-default" : ""}`}
                        >
                          {confirmed && rej ? "Rejected" : "Reject"}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <Card className={`flex-[1_1_360px] ${state === "over" ? "border-amber-500/60" : "border-emerald-500/50"}`}>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">Cap check</h3>
                <span className="text-xs text-muted-foreground">Line = {money(CURRENT_SEASON_CAP)} cap</span>
              </div>
              {seasonRows.map(r => (
                <div key={r.y} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold tabular-nums">{r.y}</span>
                    <span className={`font-semibold tabular-nums ${r.room < 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {r.room < 0 ? `${money(-r.room)} over` : `${money(r.room)} left`}
                    </span>
                  </div>
                  <CapBar
                    height="h-3.5"
                    segments={[
                      { value: r.committed - r.dead, className: "bg-emerald-500" },
                      { value: r.dead, className: "bg-red-500" },
                      { value: r.add, className: "bg-amber-400" },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {money(r.committed)} committed{r.dead > 0 ? ` (incl. ${money(r.dead)} dead cap)` : ""} + {money(r.add)} kept = {money(r.committed + r.add)}
                  </p>
                </div>
              ))}
              <Legend
                items={[
                  { label: "Already committed", className: "bg-emerald-500" },
                  ...(seasonRows.some(r => r.dead > 0) ? [{ label: "Dead cap", className: "bg-red-500" }] : []),
                  { label: "Wins you keep", className: "bg-amber-400" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">Signing</p>
                  <p className="text-lg font-bold">
                    {kept.length} of {wins.length} players
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Added AAV, {currentYear}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-400">
                    {money(keptAav)}
                    <span className="text-xs text-emerald-300"> /yr</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">{money(keptTotal)} total value</p>
                </div>
              </div>
              <Button
                className="h-11 w-full text-base font-semibold"
                disabled={confirmed || !validation.canConfirm || confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {confirmed ? "Confirmed" : !validation.canConfirm ? "Reject until it fits" : `Confirm and sign ${kept.length} player${kept.length === 1 ? "" : "s"}`}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {confirmed
                  ? conf && conf.total > conf.confirmed
                    ? `Waiting on ${conf.total - conf.confirmed} more team${conf.total - conf.confirmed === 1 ? "" : "s"}.`
                    : "Every team has confirmed."
                  : "Confirming is final."}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="font-semibold">
              Bids you lost <span className="text-sm font-normal text-muted-foreground">· {summary?.lost.length ?? 0}</span>
            </h3>
            {(summary?.lost.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">None this round.</p>}
            {summary?.lost.map(l => (
              <div key={l.playerId} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar playerId={l.playerId} name={l.playerName} className="h-8 w-8" />
                  <div>
                    <p className="font-semibold leading-tight">{l.playerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.playerPosition} · your bid <span className="font-semibold text-foreground">{money(l.bidAmount)}/yr</span> · {l.contractYears} yr ·{" "}
                      {money(l.bidAmount * l.contractYears)} total
                    </p>
                  </div>
                </div>
                {l.winner && (
                  <p className="text-sm text-muted-foreground">
                    Went to <span className="font-semibold text-foreground">{teamNameOf(l.winner.rosterId)}</span> at{" "}
                    <span className="font-semibold text-emerald-400">{money(l.winner.bidAmount)}/yr</span> · {l.winner.contractYears} yr ·{" "}
                    {money(l.winner.bidAmount * l.winner.contractYears)} total
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Around the league</h3>
              <span className="text-xs text-muted-foreground">Round {round} winning bids</span>
            </div>
            {(summary?.results.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No winning bids this round.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-1.5 py-1.5 font-medium">Player</th>
                      <th className="px-1.5 py-1.5 font-medium">Team</th>
                      <th className="px-1.5 py-1.5 text-right font-medium">AAV</th>
                      <th className="px-1.5 py-1.5 text-right font-medium">Years</th>
                      <th className="px-1.5 py-1.5 text-right font-medium">Total</th>
                      <th className="px-1.5 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary!.results.map(r => (
                      <tr key={`${r.playerId}-${r.rosterId}`} className="border-t border-border">
                        <td className="px-1.5 py-2 font-semibold">
                          {r.playerName} <PositionBadge position={r.playerPosition || "?"} />
                        </td>
                        <td className="px-1.5 py-2">{teamNameOf(r.rosterId)}</td>
                        <td className="px-1.5 py-2 text-right font-bold tabular-nums text-emerald-400">{money(r.bidAmount)}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums text-muted-foreground">{r.contractYears}</td>
                        <td className="px-1.5 py-2 text-right tabular-nums text-muted-foreground">{money(r.bidAmount * r.contractYears)}</td>
                        <td className="px-1.5 py-2">
                          {r.result === "kept" ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">Signed</span>
                          ) : r.result === "rejected" ? (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                              {round === 1 ? "Rejected · back in pool" : "Rejected"}
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Awaiting confirm</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
