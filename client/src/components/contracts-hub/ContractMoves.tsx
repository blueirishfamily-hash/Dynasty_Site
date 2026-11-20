import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeftRight, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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

// Automatic contract moves (server/contractMoves.ts). There is no page for them: the commissioner's switch and the list of
// earlier moves waiting for approval live in League Settings, and a team that a move pushed over the cap is flagged in the
// Contracts Hub for that team's owner and the commissioner.

export interface MoveFlag {
  type: "over_cap";
  rosterId: number;
  teamName: string;
  year: number;
  total: number;
  cap: number;
}

export interface ContractMoveRow {
  id: string;
  kind: "trade_move" | "commissioner_move" | "drop" | "pickup";
  playerId: string;
  playerName: string;
  playerPosition: string | null;
  fromRosterId: number | null;
  toRosterId: number | null;
  status: "proposed" | "applied" | "rejected" | "failed";
  summary: string;
  detail: { error?: string };
  flags: MoveFlag[];
  flagStatus: "open" | "resolved" | null;
  txAt: number;
}

interface ContractMovesResponse {
  live: boolean;
  liveAt: number | null;
  commissioner: boolean;
  moves: ContractMoveRow[];
}

const movesKey = (leagueId: string | undefined) => ["/api/league", leagueId, "contract-moves"];

export function useContractMoves(leagueId: string | undefined) {
  return useQuery<ContractMovesResponse>({
    queryKey: movesKey(leagueId),
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/contract-moves`);
      if (!res.ok) throw new Error("Failed to load contract moves");
      return res.json();
    },
    enabled: !!leagueId,
    refetchInterval: 5 * 60 * 1000,
  });
}

/** Open over-the-cap flags this viewer should see: the commissioner sees every team's, an owner only their own. */
export function openFlagsFor(moves: ContractMoveRow[], isCommissioner: boolean, myRosterId: number | null) {
  return moves
    .filter((m) => m.flagStatus === "open" && m.status !== "rejected")
    .flatMap((m) => m.flags.filter((f) => isCommissioner || f.rosterId === myRosterId).map((flag) => ({ move: m, flag })));
}

async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong");
  return json;
}

/** Reload what a move can change: the move list, contracts, dead cap and extensions. */
function refreshAfterMove(leagueId: string) {
  queryClient.invalidateQueries({ queryKey: movesKey(leagueId) });
  queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leagues", leagueId, "dead-cap"] });
  queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "extensions"] });
}

const KIND_LABEL: Record<ContractMoveRow["kind"], string> = {
  trade_move: "Trade",
  commissioner_move: "Commissioner move",
  drop: "Drop",
  pickup: "Pickup",
};
const KIND_STYLE: Record<ContractMoveRow["kind"], string> = {
  trade_move: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  commissioner_move: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  drop: "bg-red-500/15 text-red-500 border-red-500/30",
  pickup: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function MoveLine({ move, actions }: { move: ContractMoveRow; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2">
      <Badge variant="outline" className={`shrink-0 text-[10px] ${KIND_STYLE[move.kind]}`}>
        {KIND_LABEL[move.kind]}
      </Badge>
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{when(move.txAt)}</span>
      <span className="min-w-0 flex-1 text-sm">{move.summary}</span>
      {move.status === "failed" && (
        <Badge variant="destructive" className="text-[10px]" title={move.detail.error}>
          Could not apply
        </Badge>
      )}
      {actions}
    </li>
  );
}

/**
 * Contracts Hub banner: a move put a team over the salary cap. Shown to that team's owner and to the commissioner
 * (who can mark it handled). Renders nothing when there is nothing to flag.
 */
export function ContractMoveAlerts({
  leagueId,
  isCommissioner,
  myRosterId,
}: {
  leagueId: string;
  isCommissioner: boolean;
  myRosterId: number | null;
}) {
  const { toast } = useToast();
  const { data } = useContractMoves(leagueId);
  const resolveFlag = useMutation({
    mutationFn: (id: string) => send("POST", `/api/league/${leagueId}/contract-moves/${id}/resolve-flag`),
    onSuccess: () => refreshAfterMove(leagueId),
    onError: (e: Error) => toast({ title: "Could not do that", description: e.message, variant: "destructive" }),
  });
  const flags = data ? openFlagsFor(data.moves, isCommissioner, myRosterId) : [];
  if (flags.length === 0) return null;
  return (
    <Card className="mb-4 border-amber-500/50 bg-amber-500/5" data-testid="contract-move-alerts">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Over the salary cap after a contract move
        </CardTitle>
        <CardDescription>
          A trade, drop or pickup in Sleeper changed a contract and put a team over the cap. The move was recorded because
          Sleeper already made it. The team and the commissioner need to get under the cap.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {flags.map(({ move, flag }) => (
            <li key={`${move.id}-${flag.year}-${flag.rosterId}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{flag.teamName}</span> is over the ${flag.cap}M cap in {flag.year}: ${flag.total}M
                <span className="text-muted-foreground"> ({move.summary})</span>
              </span>
              {isCommissioner && (
                <Button size="sm" variant="outline" disabled={resolveFlag.isPending} onClick={() => resolveFlag.mutate(move.id)}>
                  Mark handled
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** League Settings section: the switch, the earlier moves waiting for approval, and the recent moves. */
export function AutomaticContractMovesSection({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const { toast } = useToast();
  const { data, isLoading, isError } = useContractMoves(leagueId);
  const [confirmAll, setConfirmAll] = useState(false);
  const base = `/api/league/${leagueId}/contract-moves`;
  const onError = (e: Error) => toast({ title: "Could not do that", description: e.message, variant: "destructive" });

  const live = useMutation({
    mutationFn: (enabled: boolean) => send("PUT", `${base}/live`, { enabled }),
    onSuccess: (_r, enabled) => {
      refreshAfterMove(leagueId);
      toast({ title: enabled ? "Automatic contract moves are on" : "Automatic contract moves are off" });
    },
    onError,
  });
  const approve = useMutation({
    mutationFn: (id: string) => send("POST", `${base}/${id}/approve`),
    onSuccess: () => {
      refreshAfterMove(leagueId);
      toast({ title: "Move applied" });
    },
    onError,
  });
  const reject = useMutation({
    mutationFn: (id: string) => send("POST", `${base}/${id}/reject`),
    onSuccess: () => refreshAfterMove(leagueId),
    onError,
  });
  const approveAll = useMutation({
    mutationFn: () => send("POST", `${base}/approve-all`),
    onSuccess: (r: { applied: number; failed: string[] }) => {
      refreshAfterMove(leagueId);
      toast({
        title: `${r.applied} move${r.applied === 1 ? "" : "s"} applied`,
        description: r.failed.length > 0 ? `${r.failed.length} could not be applied: ${r.failed.slice(0, 2).join("; ")}` : undefined,
        variant: r.failed.length > 0 ? "destructive" : "default",
      });
    },
    onError,
  });

  const proposed = data?.moves.filter((m) => m.status === "proposed") ?? [];
  const recent = data?.moves.filter((m) => m.status === "applied" || m.status === "failed") ?? [];

  return (
    <Card data-testid="automatic-contract-moves">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="h-4 w-4" />
              Automatic contract moves
            </CardTitle>
            <CardDescription className="mt-1">
              Contracts follow what happens in Sleeper this season. A trade moves a contract to the new team. A dropped
              player's contract ends, with dead cap when dead cap is on. A pickup gets a 1-year contract: the winning bid on a
              waiver claim (at least $1), or $1 for a free agent. A team that ends up over the salary cap is flagged for its
              owner and the commissioner.
            </CardDescription>
          </div>
          {data && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-medium">{data.live ? "On" : "Off"}</span>
              <Switch
                checked={data.live}
                disabled={!isCommissioner || live.isPending}
                aria-label="Automatic contract moves"
                onCheckedChange={(on) => live.mutate(on)}
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {isError && <p className="text-sm text-destructive">Could not load contract moves.</p>}
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.live
              ? `On since ${data.liveAt ? new Date(data.liveAt).toLocaleString() : "now"}. Sleeper activity from then on updates contracts by itself.`
              : "Off. Sleeper trades, drops and pickups do not change contracts until it is turned on."}
            {!isCommissioner && " Only the commissioner can change this."}
          </p>
        )}

        {isCommissioner && proposed.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Earlier moves waiting for approval ({proposed.length})</p>
                <p className="text-xs text-muted-foreground">
                  These happened this season before automatic moves started. Nothing here has changed a contract yet.
                </p>
              </div>
              {proposed.length > 1 && (
                <Button size="sm" disabled={approveAll.isPending} onClick={() => setConfirmAll(true)}>
                  Approve all
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {proposed.map((m) => (
                <MoveLine
                  key={m.id}
                  move={m}
                  actions={
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate(m.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" disabled={reject.isPending} onClick={() => reject.mutate(m.id)} aria-label={`Reject: ${m.summary}`}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  }
                />
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Recent automatic moves</p>
            <ul className="space-y-2">
              {recent.slice(0, 15).map((m) => (
                <MoveLine key={m.id} move={m} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve all {proposed.length} moves?</AlertDialogTitle>
            <AlertDialogDescription>
              They are applied oldest first. Contracts are changed and dead cap is created as listed. Check the list first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => approveAll.mutate()}>Approve all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
