import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisTeam, StandingsAnalysis } from "@shared/standingsAnalysis";

const CHART_HEIGHT = 520;
const MARGIN = { top: 24, right: 36, bottom: 8, left: 4 };
const X_AXIS_HEIGHT = 28;
const ICON_SIZE = 28;
const PLAYBACK_WEEKS_PER_SECOND = 1.1;

const TEAM_COLORS = [
  "#4FD1C5", "#F6AD55", "#63B3ED", "#FC8181", "#B794F4", "#68D391",
  "#F6E05E", "#F687B3", "#7F9CF5", "#4FD1A1", "#ED8936", "#A0AEC0",
  "#9AE6B4", "#FBB6CE", "#90CDF4", "#D6BCFA",
];

interface PointsRaceChartProps {
  analysis: StandingsAnalysis;
}

type RaceRow = { week: number } & Record<string, number>;

function buildRows(analysis: StandingsAnalysis, progress: number): { rows: RaceRow[]; headWeek: number } {
  const { weeks, cumulative, teams } = analysis;
  const lastIndex = weeks.length - 1;
  const clamped = Math.min(Math.max(progress, 0), lastIndex);
  const base = Math.floor(clamped);
  const frac = clamped - base;

  const rows: RaceRow[] = [];
  for (let i = 0; i <= base; i++) {
    const row: RaceRow = { week: weeks[i] };
    teams.forEach((t) => {
      row[`t${t.rosterId}`] = cumulative[t.rosterId][i];
    });
    rows.push(row);
  }

  if (frac > 0 && base < lastIndex) {
    const row: RaceRow = { week: weeks[base] + frac * (weeks[base + 1] - weeks[base]) };
    teams.forEach((t) => {
      const from = cumulative[t.rosterId][base];
      const to = cumulative[t.rosterId][base + 1];
      row[`t${t.rosterId}`] = from + (to - from) * frac;
    });
    rows.push(row);
  }

  return { rows, headWeek: rows[rows.length - 1].week };
}

/**
 * Spreads head icons vertically so teams with similar totals stay readable. Overlapping icons
 * push apart symmetrically and the group is kept inside the plot area.
 */
function computeIconOffsets(
  values: Array<{ rosterId: number; value: number }>,
  pxPerPoint: number,
  plotHeight: number,
): Map<number, number> {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const original = sorted.map((v) => (plotHeight / pxPerPoint - v.value) * pxPerPoint);
  const positions = [...original];
  const minGap = ICON_SIZE - 2;
  const half = ICON_SIZE / 2;

  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 1; i < positions.length; i++) {
      const overlap = minGap - (positions[i] - positions[i - 1]);
      if (overlap > 0.1) {
        positions[i - 1] -= overlap / 2;
        positions[i] += overlap / 2;
        moved = true;
      }
    }
    positions.forEach((pos, i) => {
      positions[i] = Math.min(Math.max(pos, half), plotHeight - half);
    });
    if (!moved) break;
  }

  const offsets = new Map<number, number>();
  sorted.forEach((v, i) => offsets.set(v.rosterId, positions[i] - original[i]));
  return offsets;
}

function TeamHeadIcon({
  cx,
  cy,
  team,
  color,
  dimmed,
  offsetY,
}: {
  cx: number;
  cy: number;
  team: AnalysisTeam;
  color: string;
  dimmed: boolean;
  offsetY: number;
}) {
  const r = ICON_SIZE / 2;
  const y = cy + offsetY;
  const clipId = `race-clip-${team.rosterId}`;

  return (
    <g opacity={dimmed ? 0.25 : 1} data-testid={`race-icon-${team.rosterId}`}>
      {Math.abs(offsetY) > 1 && <line x1={cx} y1={cy} x2={cx} y2={y} stroke={color} strokeWidth={1} opacity={0.6} />}
      <circle cx={cx} cy={y} r={r} fill="hsl(var(--card))" stroke={color} strokeWidth={team.isUser ? 3 : 2} />
      <text
        x={cx}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={700}
        fill="hsl(var(--foreground))"
      >
        {team.initials}
      </text>
      {team.avatar && (
        <>
          <clipPath id={clipId}>
            <circle cx={cx} cy={y} r={r - 1} />
          </clipPath>
          <image
            href={team.avatar}
            x={cx - r}
            y={y - r}
            width={ICON_SIZE}
            height={ICON_SIZE}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      )}
    </g>
  );
}

export default function PointsRaceChart({ analysis }: PointsRaceChartProps) {
  const { teams, weeks } = analysis;
  const lastIndex = weeks.length - 1;

  const [progress, setProgress] = useState(lastIndex);
  const [playing, setPlaying] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

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

  const { rows, headWeek } = useMemo(() => buildRows(analysis, progress), [analysis, progress]);
  const headRow = rows[rows.length - 1];

  const yMax = useMemo(() => {
    const max = Math.max(...teams.map((t) => headRow[`t${t.rosterId}`] ?? 0), 1);
    const step = max > 400 ? 100 : 50;
    return Math.ceil((max * 1.06) / step) * step;
  }, [teams, headRow]);

  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom - X_AXIS_HEIGHT;
  const offsets = useMemo(
    () =>
      computeIconOffsets(
        teams.map((t) => ({ rosterId: t.rosterId, value: headRow[`t${t.rosterId}`] ?? 0 })),
        plotHeight / yMax,
        plotHeight,
      ),
    [teams, headRow, plotHeight, yMax],
  );

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

  const currentWeekLabel = weeks[Math.min(Math.round(progress), lastIndex)];

  const leaderboard = useMemo(
    () =>
      [...teams]
        .map((t) => ({ team: t, value: headRow[`t${t.rosterId}`] ?? 0 }))
        .sort((a, b) => b.value - a.value),
    [teams, headRow],
  );

  return (
    <Card data-testid="card-points-race">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Cumulative Points Race</CardTitle>
        <CardDescription>
          Running total of points scored each week. Press play to watch the season unfold, or drag the slider to jump to a week.
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

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-4">
          <div style={{ height: CHART_HEIGHT }} data-testid="chart-points-race">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="week"
                  domain={[weeks[0], Math.max(weeks[lastIndex], weeks[0] + 1)]}
                  ticks={weeks}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  height={X_AXIS_HEIGHT}
                  allowDecimals={false}
                />
                <YAxis
                  type="number"
                  domain={[0, yMax]}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={52}
                  tickFormatter={(v) => Number(v).toLocaleString()}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "4 4" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const items = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
                    return (
                      <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
                        <div className="font-semibold mb-1">Week {Math.round(Number(label))}</div>
                        {items.map((item) => {
                          const team = teams.find((t) => `t${t.rosterId}` === item.dataKey);
                          return (
                            <div key={String(item.dataKey)} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                {team?.name}
                              </span>
                              <span className="tabular-nums font-medium">{Number(item.value).toFixed(1)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                {teams.map((team) => {
                  const color = colorByRoster.get(team.rosterId)!;
                  const dimmed = focused !== null && focused !== team.rosterId;
                  return (
                    <Line
                      key={team.rosterId}
                      type="monotone"
                      dataKey={`t${team.rosterId}`}
                      stroke={color}
                      strokeWidth={team.isUser || focused === team.rosterId ? 3.5 : 2}
                      strokeOpacity={dimmed ? 0.15 : 1}
                      isAnimationActive={false}
                      activeDot={false}
                      dot={(props: any) => {
                        const { cx, cy, index, key } = props;
                        if (index !== rows.length - 1 || cx == null || cy == null) {
                          return <g key={key ?? `${team.rosterId}-${index}`} />;
                        }
                        return (
                          <TeamHeadIcon
                            key={key ?? `${team.rosterId}-${index}`}
                            cx={cx}
                            cy={cy}
                            team={team}
                            color={color}
                            dimmed={dimmed}
                            offsetY={offsets.get(team.rosterId) ?? 0}
                          />
                        );
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1" data-testid="race-leaderboard">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Through week {Math.round(headWeek)}
            </div>
            {leaderboard.map(({ team, value }, index) => (
              <button
                key={team.rosterId}
                type="button"
                onClick={() => setFocused((prev) => (prev === team.rosterId ? null : team.rosterId))}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-muted/60 ${
                  focused === team.rosterId ? "bg-muted" : ""
                } ${focused !== null && focused !== team.rosterId ? "opacity-50" : ""}`}
                data-testid={`race-legend-${team.rosterId}`}
              >
                <span className="w-4 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorByRoster.get(team.rosterId) }} />
                <span className={`flex-1 truncate ${team.isUser ? "text-primary font-semibold" : ""}`}>{team.name}</span>
                <span className="tabular-nums text-xs font-medium">{value.toFixed(1)}</span>
              </button>
            ))}
            <p className="text-xs text-muted-foreground pt-2">Click a team to highlight its line.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
