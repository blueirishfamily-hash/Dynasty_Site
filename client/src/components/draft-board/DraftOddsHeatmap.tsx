import { Lock, Trophy, TrendingDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { slotLabel } from "./draftBoardData";

/** The subset of the Draft page's odds row this view reads. */
export interface OddsRow {
  rosterId: number;
  name: string;
  initials: string;
  record: string;
  maxPoints: number;
  projectedMaxPoints?: number;
  pickOdds: number[];
  isUser?: boolean;
  makePlayoffsPct?: number;
  status: "eliminated" | "clinched" | "bubble";
  isLocked?: boolean;
}

interface DraftOddsHeatmapProps {
  teams: OddsRow[];
  /** Number of pick columns to show (capped at 12 like the original table) */
  pickCount: number;
}

/** Odds below this round to 0.0 and are shown as a dash. */
const ZERO_BELOW = 0.05;

/** Green background: about 8% opacity at the lowest shown odds, up to about 55% at 60% and above. */
function cellStyle(odds: number): React.CSSProperties | undefined {
  if (odds < ZERO_BELOW) return undefined;
  const alpha = 0.08 + (Math.min(odds, 60) / 60) * 0.47;
  return { backgroundColor: `hsl(var(--primary) / ${alpha.toFixed(3)})` };
}

function StatusChip({ team }: { team: OddsRow }) {
  if (team.status === "clinched") {
    return (
      <Badge className="bg-primary text-primary-foreground whitespace-nowrap">
        <Trophy className="w-3 h-3 mr-1" aria-hidden="true" />
        Clinched
      </Badge>
    );
  }
  if (team.status === "eliminated") {
    return (
      <Badge variant="destructive" className="whitespace-nowrap">
        <TrendingDown className="w-3 h-3 mr-1" aria-hidden="true" />
        Eliminated
      </Badge>
    );
  }
  // Only a mathematically settled team is exactly 0% or 100%. Anything else is still alive, so a rounded
  // "0%" or "100%" would be misleading: show "<1%" and ">99%" and colour the ends like the settled states.
  const pct = team.makePlayoffsPct ?? 0;
  const title = `Still alive: ${pct.toFixed(1)}% to make the playoffs`;
  if (pct < 0.5) {
    return (
      <Badge title={title} className="bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/20 whitespace-nowrap">
        &lt;1% bubble
      </Badge>
    );
  }
  if (pct >= 99.5) {
    return (
      <Badge title={title} className="bg-primary/20 text-primary border border-primary/40 hover:bg-primary/20 whitespace-nowrap">
        &gt;99% bubble
      </Badge>
    );
  }
  return (
    <Badge title={title} className="bg-chart-3 text-white whitespace-nowrap">
      {Math.round(pct)}% bubble
    </Badge>
  );
}

function TeamName({ team }: { team: OddsRow }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarFallback
          className={`text-xs ${team.isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          {team.initials}
        </AvatarFallback>
      </Avatar>
      <span className={`font-medium truncate ${team.isUser ? "text-primary" : ""}`}>{team.name}</span>
      {team.isUser && (
        <Badge variant="outline" className="text-xs shrink-0">
          You
        </Badge>
      )}
      {team.isLocked && (
        <Badge variant="outline" className="text-xs shrink-0">
          <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
          Locked
        </Badge>
      )}
    </div>
  );
}

/** Show the projection only when it differs from the current Max PF (there are weeks left). */
const showProjection = (team: OddsRow) =>
  team.projectedMaxPoints != null && Math.abs(team.projectedMaxPoints - (team.maxPoints ?? 0)) >= 0.5;

export function DraftOddsHeatmap({ teams, pickCount }: DraftOddsHeatmapProps) {
  const picks = Math.min(pickCount, 12);
  const cols = `168px 56px 132px 80px repeat(${picks}, 56px)`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Probabilities based on 10,000 Monte Carlo simulations. Non-playoff teams compete for picks 1-5 (lowest max
        points = Pick 1). Playoff teams get picks 6-12 based on postseason finish (worst = Pick 6, champion = Pick 12).
        Bubble teams have odds spread across all picks based on their playoff probability.
      </p>

      <ul className="flex flex-wrap items-center gap-2 text-xs" aria-label="Status legend">
        <li className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
          <TrendingDown className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
          Eliminated (picks 1-5)
        </li>
        <li className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
          <span className="w-3 h-3 rounded-full bg-chart-3" aria-hidden="true" />
          Bubble (any pick)
        </li>
        <li className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
          <Trophy className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
          Clinched (picks 6-12)
        </li>
      </ul>
      <p className="text-xs text-muted-foreground">
        Bubble teams show their playoff chance. &lt;1% and &gt;99% are still alive or not yet clinched; only a
        mathematically settled team is marked Eliminated or Clinched.
      </p>

      {/* Tablet and desktop: heat-map table */}
      <div className="hidden md:block">
        <ScrollArea className="w-full">
          <div className="min-w-max" role="table" aria-label="Draft pick odds by team">
            <div
              role="row"
              className="grid gap-px items-center px-2 py-2 text-xs font-medium text-muted-foreground border-b border-border"
              style={{ gridTemplateColumns: cols }}
            >
              <div role="columnheader">Team</div>
              <div role="columnheader" className="text-center">
                Rec
              </div>
              <div role="columnheader" className="text-center">
                Status
              </div>
              <div role="columnheader" className="text-center" title="Max PF so far (best possible lineup every week). Non-playoff teams pick lowest projected final Max PF first.">
                Max PF
              </div>
              {Array.from({ length: picks }, (_, i) => (
                <div key={i} role="columnheader" className="text-center">
                  {i + 1}
                </div>
              ))}
            </div>

            {teams.map((team) => {
              const maxOdds = Math.max(...team.pickOdds);
              return (
                <div
                  key={team.rosterId}
                  role="row"
                  data-testid={`draft-odds-row-${team.rosterId}`}
                  className={`grid gap-px items-center px-2 py-1.5 border-b border-border/50 ${
                    team.isUser ? "bg-primary/5" : ""
                  }`}
                  style={{ gridTemplateColumns: cols }}
                >
                  <div role="cell" className="min-w-0 pr-2">
                    <TeamName team={team} />
                  </div>
                  <div role="cell" className="text-center tabular-nums font-medium text-sm">
                    {team.record}
                  </div>
                  <div role="cell" className="flex justify-center">
                    <StatusChip team={team} />
                  </div>
                  <div role="cell" className="text-center leading-tight">
                    <div className="tabular-nums text-sm">{Number(team.maxPoints ?? 0).toFixed(1)}</div>
                    {showProjection(team) && (
                      <div
                        className="text-[10px] text-muted-foreground tabular-nums"
                        title="Projected final Max PF after the weeks still to play"
                      >
                        proj {Math.round(team.projectedMaxPoints!)}
                      </div>
                    )}
                  </div>
                  {Array.from({ length: picks }, (_, i) => {
                    const odds = team.pickOdds[i] || 0;
                    const shown = odds >= ZERO_BELOW;
                    const isHighest = shown && odds === maxOdds;
                    return (
                      <div
                        key={i}
                        role="cell"
                        style={cellStyle(odds)}
                        title={shown ? `Pick ${i + 1}: ${odds.toFixed(1)}%` : undefined}
                        className={`text-center tabular-nums text-xs py-2 rounded-sm ${
                          isHighest ? "ring-2 ring-primary ring-inset font-semibold" : ""
                        } ${shown ? "" : "text-muted-foreground"}`}
                      >
                        {shown ? `${odds.toFixed(1)}%` : "–"}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Phone: one card per team with its three most likely picks */}
      <ul className="md:hidden space-y-2">
        {teams.map((team) => {
          const top = team.pickOdds
            .slice(0, picks)
            .map((odds, i) => ({ odds, i }))
            .filter((x) => x.odds >= ZERO_BELOW)
            .sort((a, b) => b.odds - a.odds)
            .slice(0, 3);
          return (
            <li
              key={team.rosterId}
              data-testid={`draft-odds-card-${team.rosterId}`}
              className={`rounded-lg border p-3 space-y-2 ${
                team.isUser ? "border-primary/40 bg-primary/5" : "border-border bg-card"
              }`}
            >
              <TeamName team={team} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {team.record} · Max PF {Number(team.maxPoints ?? 0).toFixed(1)}
                  {showProjection(team) ? ` (proj ${Math.round(team.projectedMaxPoints!)})` : ""}
                </span>
                <StatusChip team={team} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {top.map(({ odds, i }, rank) => (
                  <span
                    key={i}
                    style={cellStyle(odds)}
                    className={`rounded-full border border-border px-2 py-0.5 text-xs tabular-nums ${
                      rank === 0 ? "ring-1 ring-primary font-medium" : ""
                    }`}
                  >
                    {slotLabel(1, i + 1)} {odds.toFixed(0)}%
                  </span>
                ))}
                {top.length === 0 && <span className="text-xs text-muted-foreground">No pick odds yet</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
