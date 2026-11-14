/**
 * Position profile for the player card: a radar chart of the stats that matter for the player's position, each as a
 * percentile among the league's players at that position. The manager chooses per game or season totals.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

type Mode = "perGame" | "total";

interface RadarCell {
  value: number | null;
  pct: number | null;
  prior: number | null;
}

interface RadarAxis {
  key: string;
  label: string;
  totalLabel: string;
  kind: "count" | "rate" | "inverse";
  unit: "num" | "pct" | "pts" | "int";
  perGame: RadarCell;
  total: RadarCell;
}

interface RadarData {
  position: string;
  season?: number;
  previousSeason?: number | null;
  games?: number;
  peers?: number;
  lowSample?: boolean;
  axes: RadarAxis[];
}

const MODE_KEY = "player-radar-mode";
const POSITION_NAMES: Record<string, string> = { QB: "quarterbacks", RB: "running backs", WR: "wide receivers", TE: "tight ends", K: "kickers" };

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "total" ? "total" : "perGame";
  } catch {
    return "perGame";
  }
}

function formatValue(axis: RadarAxis, mode: Mode): string {
  const cell = mode === "total" ? axis.total : axis.perGame;
  if (cell.value == null) return "—";
  const v = cell.value;
  if (axis.unit === "pct") return `${v.toFixed(1)}%`;
  const text =
    axis.kind === "rate" || axis.unit === "pts" || mode === "perGame"
      ? v.toFixed(1)
      : Math.round(v).toLocaleString();
  return axis.kind === "inverse" ? `${text} INT` : text;
}

function pctTone(pct: number | null): { text: string; bar: string } {
  if (pct == null) return { text: "text-muted-foreground", bar: "bg-muted-foreground/40" };
  if (pct >= 75) return { text: "text-emerald-500", bar: "bg-emerald-500" };
  if (pct < 50) return { text: "text-amber-500", bar: "bg-amber-500" };
  return { text: "text-foreground", bar: "bg-teal-400" };
}

export function PositionRadar({ leagueId, playerId }: { leagueId: string; playerId: string }) {
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  };

  const { data, isLoading, isError } = useQuery<RadarData>({
    queryKey: ["/api/sleeper/league", leagueId, "player", playerId, "radar"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/player/${playerId}/radar`);
      if (!res.ok) throw new Error("Failed to load position profile");
      return res.json();
    },
    enabled: !!playerId && !!leagueId,
    staleTime: 15 * 60 * 1000,
  });

  // Team defenses and other positions have no profile.
  if (data && !POSITION_NAMES[data.position]) return null;

  const total = mode === "total";
  const axes = data?.axes ?? [];
  const showPrior = !!data?.previousSeason && axes.some(a => (total ? a.total.prior : a.perGame.prior) != null);
  const chartData = axes.map(a => {
    const cell = total ? a.total : a.perGame;
    return {
      label: total ? a.totalLabel : a.label,
      player: cell.pct ?? 0,
      prior: cell.prior ?? 0,
      median: 50,
    };
  });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Position profile</h3>
          {data && axes.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Percentile among {data.peers} {POSITION_NAMES[data.position]} · {data.season} season,{" "}
              {total ? `season totals (${data.games} ${data.games === 1 ? "game" : "games"})` : "per game"}
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Show per game or season totals">
          {(["perGame", "total"] as const).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "perGame" ? "Per game" : "Season total"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          Could not load the position profile
        </div>
      ) : axes.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
          No stats yet for this player
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <div role="img" aria-label={`Radar chart of ${data?.position} stats as percentiles`}>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={chartData} outerRadius="68%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="median" stroke="#64748b" strokeWidth={1.5} fill="none" isAnimationActive={false} />
                  {showPrior && (
                    <Radar
                      dataKey="prior"
                      stroke="#a78bfa"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      fill="none"
                      isAnimationActive={false}
                    />
                  )}
                  <Radar
                    dataKey="player"
                    stroke="#2dd4bf"
                    strokeWidth={2.5}
                    fill="#2dd4bf"
                    fillOpacity={0.22}
                    dot={{ r: 3.5, fill: "hsl(var(--background))", stroke: "#2dd4bf", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-[3px] rounded bg-teal-400" />
                {data?.season}
              </span>
              {showPrior && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 border-t-2 border-dashed border-violet-400" />
                  {data?.previousSeason}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 border-t border-slate-500" />
                Position median
              </span>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_64px_92px] gap-2 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Stat</span>
              <span className="text-right">{total ? "Season total" : "Per game"}</span>
              <span className="text-right">Percentile</span>
            </div>
            {axes.map(a => {
              const cell = total ? a.total : a.perGame;
              const tone = pctTone(cell.pct);
              return (
                <div key={a.key} className="grid grid-cols-[minmax(0,1fr)_64px_92px] gap-2 items-center py-1.5 border-t border-border/60">
                  <span className="text-[13px]">{total ? a.totalLabel : a.label}</span>
                  <span className="text-right text-[13px] font-semibold tabular-nums">{formatValue(a, mode)}</span>
                  <span className="flex items-center justify-end gap-2">
                    <span className="w-11 h-1.5 rounded-full bg-muted overflow-hidden">
                      <span className={`block h-full ${tone.bar}`} style={{ width: `${cell.pct ?? 0}%` }} />
                    </span>
                    <span className={`w-6 text-right text-[13px] font-bold tabular-nums ${tone.text}`}>{cell.pct ?? "—"}</span>
                  </span>
                </div>
              );
            })}
            <p className="mt-2 text-[10px] text-muted-foreground">
              The outer edge is the best in the league at the position.{" "}
              {total ? "Totals reward games played, so a missed game lowers them." : "Per-game numbers ignore missed games."}{" "}
              Rate stats (yards per target, completion %, FG %) read the same either way.
              {data?.lowSample ? ` Only ${data.games} ${data.games === 1 ? "game" : "games"} played, so treat this as a small sample.` : ""}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
