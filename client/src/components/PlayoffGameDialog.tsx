import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Starter {
  slot: string;
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  points: number;
}

interface GameSide {
  rosterId: number;
  name: string;
  total: number;
  starters: Starter[];
}

interface GameDetail {
  week: number;
  slots: string[];
  teams: [GameSide, GameSide];
}

export interface PlayoffGameRef {
  rosterA: number;
  rosterB: number;
  seedA?: number;
  seedB?: number;
  /** e.g. "Semifinals" or "3rd Place Game" */
  label: string;
  week?: number;
}

/** FLEX-type slots are shown as their own group; everything else groups by its position. */
function groupOf(slot: string): string {
  if (slot === "DEF" || slot === "DST") return "DEF";
  if (slot.includes("FLEX")) return "FLEX";
  return slot;
}

const GROUP_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "DEF"];

const fmt = (n: number) => n.toFixed(2);

export default function PlayoffGameDialog({
  leagueId,
  game,
  onClose,
}: {
  leagueId: string;
  game: PlayoffGameRef | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useQuery<GameDetail>({
    queryKey: ["/api/sleeper/league", leagueId, "playoff-game", game?.rosterA, game?.rosterB, game?.week],
    queryFn: async () => {
      const qs = new URLSearchParams({ rosterA: String(game!.rosterA), rosterB: String(game!.rosterB) });
      if (game!.week != null) qs.set("week", String(game!.week));
      const res = await fetch(`/api/sleeper/league/${leagueId}/playoff-game?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to load game detail");
      return res.json();
    },
    enabled: !!game && !!leagueId,
  });

  const [a, b] = data?.teams ?? [];
  const aWins = a && b ? a.total > b.total : false;
  const tied = a && b ? a.total === b.total : false;
  const margin = a && b ? Math.abs(a.total - b.total) : 0;

  // Position-group totals for the "where the game was won" bars.
  const groups = (() => {
    if (!a || !b) return [];
    const sums = new Map<string, { a: number; b: number }>();
    const add = (side: "a" | "b", st: Starter) => {
      const g = groupOf(st.slot);
      const cur = sums.get(g) ?? { a: 0, b: 0 };
      cur[side] += st.points;
      sums.set(g, cur);
    };
    a.starters.forEach(s => add("a", s));
    b.starters.forEach(s => add("b", s));
    return Array.from(sums.entries())
      .sort((x, y) => {
        const rx = GROUP_ORDER.indexOf(x[0]);
        const ry = GROUP_ORDER.indexOf(y[0]);
        return (rx < 0 ? 99 : rx) - (ry < 0 ? 99 : ry);
      })
      .map(([name, v]) => ({ name, ...v }));
  })();
  const maxGroup = Math.max(1, ...groups.flatMap(g => [g.a, g.b]));

  return (
    <Dialog open={!!game} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="playoff-game-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="font-heading text-sm uppercase tracking-wider text-muted-foreground">
              {game?.label ?? "Playoff game"}
            </DialogTitle>
            <Badge className="bg-green-600 text-white">Final</Badge>
            {data && <span className="text-xs text-muted-foreground">Week {data.week}</span>}
          </div>
          <DialogDescription className="sr-only">Starting lineups and points for this playoff game</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {isError && <p className="text-sm text-destructive">Couldn't load this game. Try again in a moment.</p>}

        {a && b && (
          <div className="space-y-5">
            {/* Score hero */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border bg-muted/30 p-4">
              <div>
                {game?.seedA != null && <div className="text-[11px] font-semibold text-muted-foreground">#{game.seedA} SEED</div>}
                <div className="font-semibold">{a.name}</div>
              </div>
              <div className="flex items-baseline gap-3 font-heading tabular-nums">
                <span className={`text-3xl font-bold ${aWins ? "text-primary" : "text-muted-foreground"}`}>{fmt(a.total)}</span>
                <span className="text-muted-foreground">–</span>
                <span className={`text-3xl font-bold ${!aWins && !tied ? "text-primary" : "text-muted-foreground"}`}>{fmt(b.total)}</span>
              </div>
              <div className="text-right">
                {game?.seedB != null && <div className="text-[11px] font-semibold text-muted-foreground">#{game.seedB} SEED</div>}
                <div className="font-semibold">{b.name}</div>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground" data-testid="game-result-line">
              {tied ? "Tied game" : <><b className="text-foreground">{aWins ? a.name : b.name}</b> won by {fmt(margin)}</>}
            </p>

            {/* Position groups */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where the game was won</p>
              {groups.map(g => (
                <div key={g.name} className="grid grid-cols-[44px_1fr_52px_52px] items-center gap-2 text-sm" data-testid={`group-${g.name}`}>
                  <span className="font-medium text-muted-foreground">{g.name}</span>
                  <div className="flex gap-0.5 h-2.5">
                    <div className="flex-1 flex justify-end">
                      <div className={`${g.a > g.b ? "bg-emerald-500" : "bg-slate-500"} rounded-l`} style={{ width: `${(g.a / maxGroup) * 100}%` }} />
                    </div>
                    <div className="flex-1">
                      <div className={`${g.b > g.a ? "bg-amber-500" : "bg-slate-500"} rounded-r`} style={{ width: `${(g.b / maxGroup) * 100}%` }} />
                    </div>
                  </div>
                  <span className={`text-right tabular-nums ${g.a > g.b ? "font-semibold" : "text-muted-foreground"}`}>{fmt(g.a)}</span>
                  <span className={`text-right tabular-nums ${g.b > g.a ? "font-semibold" : "text-muted-foreground"}`}>{fmt(g.b)}</span>
                </div>
              ))}
            </div>

            {/* Lineups */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Starting lineups</p>
              <div className="grid grid-cols-[44px_1fr_52px_1fr_52px] gap-2 border-b py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Slot</span>
                <span className="truncate">{a.name}</span>
                <span className="text-right">Pts</span>
                <span className="truncate">{b.name}</span>
                <span className="text-right">Pts</span>
              </div>
              {a.starters.map((sa, i) => {
                const sb = b.starters[i];
                return (
                  <div key={i} className="grid grid-cols-[44px_1fr_52px_1fr_52px] items-center gap-2 border-b py-2 text-sm" data-testid={`lineup-row-${i}`}>
                    <span className="font-medium text-muted-foreground">{sa.slot.replace("SUPER_FLEX", "SF").replace("REC_FLEX", "FLEX").replace("WRRB_FLEX", "FLEX")}</span>
                    <span className="truncate">{sa.name}{sa.team ? <span className="text-muted-foreground text-xs"> · {sa.team}</span> : null}</span>
                    <span className={`text-right tabular-nums ${sb && sa.points > sb.points ? "font-semibold text-emerald-500" : "text-muted-foreground"}`}>{fmt(sa.points)}</span>
                    <span className="truncate">{sb?.name ?? ""}{sb?.team ? <span className="text-muted-foreground text-xs"> · {sb.team}</span> : null}</span>
                    <span className={`text-right tabular-nums ${sb && sb.points > sa.points ? "font-semibold text-amber-500" : "text-muted-foreground"}`}>{sb ? fmt(sb.points) : ""}</span>
                  </div>
                );
              })}
              <div className="grid grid-cols-[44px_1fr_52px_1fr_52px] gap-2 pt-2 text-sm font-semibold">
                <span className="text-muted-foreground">Total</span>
                <span />
                <span className="text-right tabular-nums">{fmt(a.total)}</span>
                <span />
                <span className="text-right tabular-nums">{fmt(b.total)}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
