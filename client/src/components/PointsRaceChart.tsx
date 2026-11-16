import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisTeam, StandingsAnalysis } from "@shared/standingsAnalysis";

const PLAYBACK_WEEKS_PER_SECOND = 1.1;
const ICON_R = 12;

const TEAM_COLORS = [
  "#4FD1C5", "#F6AD55", "#63B3ED", "#FC8181", "#B794F4", "#68D391",
  "#F6E05E", "#F687B3", "#7F9CF5", "#4FD1A1", "#ED8936", "#A0AEC0",
  "#9AE6B4", "#FBB6CE", "#90CDF4", "#D6BCFA",
];

interface PointsRaceChartProps {
  analysis: StandingsAnalysis;
  /** How many teams make the playoffs. Draws the cutoff line. */
  playoffTeams?: number;
}

/** Rank (1 = most points) of every roster after each week. */
function buildRanks(analysis: StandingsAnalysis): Record<number, number[]> {
  const { weeks, cumulative, teams } = analysis;
  const ranks: Record<number, number[]> = {};
  teams.forEach((t) => (ranks[t.rosterId] = new Array(weeks.length).fill(0)));
  weeks.forEach((_, i) => {
    const order = [...teams].sort(
      (a, b) => (cumulative[b.rosterId]?.[i] ?? 0) - (cumulative[a.rosterId]?.[i] ?? 0) || a.rosterId - b.rosterId,
    );
    order.forEach((t, r) => (ranks[t.rosterId][i] = r + 1));
  });
  return ranks;
}

function lerp(arr: number[], progress: number): number {
  const last = arr.length - 1;
  const p = Math.min(Math.max(progress, 0), last);
  const base = Math.floor(p);
  const frac = p - base;
  return base >= last ? arr[last] : arr[base] + (arr[base + 1] - arr[base]) * frac;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function TeamBadge({
  team,
  color,
  x,
  y,
  clipId,
}: {
  team: AnalysisTeam;
  color: string;
  x: number;
  y: number;
  clipId: string;
}) {
  return (
    <>
      <circle cx={x} cy={y} r={ICON_R} fill="hsl(var(--card))" stroke={color} strokeWidth={team.isUser ? 3 : 2} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill="hsl(var(--foreground))">
        {team.initials}
      </text>
      {team.avatar && (
        <>
          <clipPath id={clipId}>
            <circle cx={x} cy={y} r={ICON_R - 1} />
          </clipPath>
          <image
            href={team.avatar}
            x={x - ICON_R}
            y={y - ICON_R}
            width={ICON_R * 2}
            height={ICON_R * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
    </>
  );
}

export default function PointsRaceChart({ analysis, playoffTeams = 6 }: PointsRaceChartProps) {
  const { teams, weeks, cumulative } = analysis;
  const lastIndex = weeks.length - 1;
  const n = teams.length;

  const [progress, setProgress] = useState(lastIndex);
  const [playing, setPlaying] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  useEffect(() => {
    setProgress(lastIndex);
    setPlaying(false);
  }, [lastIndex]);

  useEffect(() => {
    if (!playing) return;

    const tick = (now: number) => {
      const elapsed = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      let finished = false;
      setProgress((prev) => {
        const next = prev + elapsed * PLAYBACK_WEEKS_PER_SECOND;
        if (next >= lastIndex) {
          finished = true;
          return lastIndex;
        }
        return next;
      });
      if (finished) {
        setPlaying(false);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing, lastIndex]);

  const colorByRoster = useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach((t, i) => map.set(t.rosterId, TEAM_COLORS[i % TEAM_COLORS.length]));
    return map;
  }, [teams]);

  const ranks = useMemo(() => buildRanks(analysis), [analysis]);

  const handlePlayToggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progress >= lastIndex) setProgress(0);
    setPlaying(true);
  }, [playing, progress, lastIndex]);

  const handleRestart = useCallback(() => {
    setProgress(0);
    setPlaying(true);
  }, []);

  const headIdx = Math.min(Math.round(progress), lastIndex);
  const currentWeekLabel = weeks[headIdx];

  // Chart geometry
  const wide = width >= 640;
  const rowGap = wide ? 30 : 26;
  const L = 34;
  const R = wide ? 170 : 30;
  const T = 24;
  const B = 28;
  const plotH = Math.max(n - 1, 1) * rowGap;
  const height = T + plotH + B;
  const plotW = Math.max(width - L - R, 50);
  const xOf = (i: number) => L + (lastIndex > 0 ? (plotW * i) / lastIndex : plotW / 2);
  const yOf = (rank: number) => T + (n > 1 ? ((rank - 1) / (n - 1)) * plotH : plotH / 2);
  const showCutoff = n > playoffTeams && playoffTeams > 0;
  const cutoffY = showCutoff ? (yOf(playoffTeams) + yOf(playoffTeams + 1)) / 2 : 0;

  // Standings at the current week
  const atHead = useMemo(
    () =>
      [...teams]
        .map((t) => ({ team: t, rank: ranks[t.rosterId][headIdx], points: cumulative[t.rosterId]?.[headIdx] ?? 0 }))
        .sort((a, b) => a.rank - b.rank),
    [teams, ranks, cumulative, headIdx],
  );

  const bubble = useMemo(() => {
    const user = atHead.find((r) => r.team.isUser);
    const lastIn = atHead[playoffTeams - 1];
    const firstOut = atHead[playoffTeams];
    if (!user || !lastIn || !firstOut) return null;
    const line = (lastIn.points + firstOut.points) / 2;
    return {
      userGap: user.points - line,
      userIn: user.rank <= playoffTeams,
      firstOut,
      outGap: firstOut.points - line,
      behindLastIn: lastIn.points - firstOut.points,
    };
  }, [atHead, playoffTeams]);

  const movers = useMemo(() => {
    const cmp = Math.max(0, headIdx - 4);
    const span = headIdx - cmp;
    const changes = teams.map((t) => ({ team: t, change: ranks[t.rosterId][cmp] - ranks[t.rosterId][headIdx] }));
    return {
      span,
      up: changes.filter((c) => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 3),
      down: changes.filter((c) => c.change < 0).sort((a, b) => a.change - b.change).slice(0, 3),
    };
  }, [teams, ranks, headIdx]);

  const fmt = (v: number) => v.toFixed(1);
  const base = Math.floor(Math.min(progress, lastIndex));
  const frac = progress - base;

  return (
    <Card data-testid="card-points-race">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Rank Race</CardTitle>
        <CardDescription>
          Each line is a team's rank by total points scored at the end of that week. Press play to watch the season unfold,
          or drag the slider to jump to a week. Click a team to highlight it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={handlePlayToggle} data-testid="button-race-play">
            {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {playing ? "Pause" : progress >= lastIndex ? "Replay" : "Play"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleRestart} data-testid="button-race-restart">
            <RotateCcw className="w-4 h-4 mr-2" />
            Restart
          </Button>
          <div className="flex-1 min-w-[180px] flex items-center gap-3">
            <Slider
              value={[progress]}
              min={0}
              max={Math.max(lastIndex, 1)}
              step={0.01}
              onValueChange={([value]) => {
                setPlaying(false);
                setProgress(value);
              }}
              data-testid="slider-race-week"
            />
            <span className="text-sm font-semibold tabular-nums w-16 text-right" data-testid="text-race-week">
              Week {currentWeekLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          <div ref={wrapRef} className="min-w-0" data-testid="chart-points-race">
            {width > 0 && n > 0 && (
              <svg width={width} height={height} role="img" aria-label="Team rank by week">
                {/* rank labels */}
                {Array.from({ length: n }, (_, i) => (
                  <text key={i} x={L - 12} y={yOf(i + 1)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="hsl(var(--muted-foreground))">
                    {i + 1}
                  </text>
                ))}
                {weeks.map((w, i) => (
                  <text key={w} x={xOf(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
                    {w}
                  </text>
                ))}
                {/* playoff region */}
                {showCutoff && (
                  <>
                    <rect x={L} y={T - 12} width={plotW} height={cutoffY - T + 12} fill="hsl(var(--primary))" opacity={0.05} />
                    <line x1={L} y1={cutoffY} x2={L + plotW} y2={cutoffY} stroke="#D97706" strokeWidth={2} strokeDasharray="7 5" />
                    <text x={L + 6} y={cutoffY - 6} fontSize={10} fontWeight={700} letterSpacing={0.8} fill="#F59E0B">
                      PLAYOFF LINE
                    </text>
                  </>
                )}
                {/* lines */}
                {[...teams]
                  .sort((a, b) => Number(a.isUser) - Number(b.isUser))
                  .map((team) => {
                    const color = colorByRoster.get(team.rosterId)!;
                    const dimmed = focused !== null && focused !== team.rosterId;
                    const r = ranks[team.rosterId];
                    const pts: Array<[number, number]> = [];
                    for (let i = 0; i <= base; i++) pts.push([xOf(i), yOf(r[i])]);
                    if (frac > 0 && base < lastIndex) pts.push([xOf(progress), yOf(lerp(r, progress))]);
                    const head = pts[pts.length - 1];
                    const thick = team.isUser || focused === team.rosterId;
                    const labelX = head[0] + ICON_R + 8;
                    return (
                      <g
                        key={team.rosterId}
                        opacity={dimmed ? 0.2 : 1}
                        className="cursor-pointer"
                        onClick={() => setFocused((prev) => (prev === team.rosterId ? null : team.rosterId))}
                        data-testid={`race-icon-${team.rosterId}`}
                      >
                        <polyline
                          fill="none"
                          stroke={color}
                          strokeWidth={thick ? 4.5 : 2.5}
                          strokeOpacity={thick ? 1 : 0.7}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          points={pts.map((p) => p.join(",")).join(" ")}
                        />
                        {pts.slice(0, base + 1).map((p, i) => (
                          <circle key={i} cx={p[0]} cy={p[1]} r={thick ? 4.5 : 3} fill={color} />
                        ))}
                        <TeamBadge team={team} color={color} x={head[0]} y={head[1]} clipId={`race-clip-${team.rosterId}`} />
                        {wide && (
                          <text
                            x={labelX}
                            y={head[1]}
                            dominantBaseline="central"
                            fontSize={11}
                            fontWeight={team.isUser ? 700 : 500}
                            fill={team.isUser ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                            data-testid={`race-legend-${team.rosterId}`}
                          >
                            {team.name.length > 16 ? `${team.name.slice(0, 15)}…` : team.name}
                          </text>
                        )}
                      </g>
                    );
                  })}
              </svg>
            )}
          </div>

          <div className="space-y-4" data-testid="race-leaderboard">
            {bubble && (
              <div className="rounded-lg border border-border p-4 space-y-1.5" data-testid="race-bubble">
                <p className="text-sm font-semibold">Playoff bubble</p>
                <p className="text-sm">
                  You are{" "}
                  <b className={bubble.userGap >= 0 ? "text-emerald-500" : "text-red-500"}>{fmt(Math.abs(bubble.userGap))} points</b>{" "}
                  {bubble.userGap >= 0 ? "over" : "behind"} the line.
                </p>
                <p className="text-xs text-muted-foreground">
                  The first team out ({bubble.firstOut.team.name}) is {fmt(bubble.outGap)} from the line, {fmt(bubble.behindLastIn)} behind the last playoff spot.
                </p>
              </div>
            )}
            <div className="rounded-lg border border-border p-4 space-y-2" data-testid="race-movers">
              <p className="text-sm font-semibold">
                {movers.span > 0 ? `Biggest risers over the last ${movers.span} week${movers.span === 1 ? "" : "s"}` : "Biggest risers"}
              </p>
              {movers.up.length === 0 ? (
                <p className="text-xs text-muted-foreground">No movement yet.</p>
              ) : (
                movers.up.map(({ team, change }) => (
                  <div key={team.rosterId} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorByRoster.get(team.rosterId) }} />
                    <span className={`flex-1 truncate ${team.isUser ? "text-primary font-semibold" : ""}`}>{team.name}</span>
                    <b className="text-emerald-500 tabular-nums">▲{change}</b>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-semibold">Biggest fallers</p>
              {movers.down.length === 0 ? (
                <p className="text-xs text-muted-foreground">No movement yet.</p>
              ) : (
                movers.down.map(({ team, change }) => (
                  <div key={team.rosterId} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorByRoster.get(team.rosterId) }} />
                    <span className={`flex-1 truncate ${team.isUser ? "text-primary font-semibold" : ""}`}>{team.name}</span>
                    <b className="text-red-500 tabular-nums">▼{Math.abs(change)}</b>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
