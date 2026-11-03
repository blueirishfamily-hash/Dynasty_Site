import type { ReactNode } from "react";
import { Clover, CloudRain, Feather, Mountain, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AnalysisTeam, SimRecord, StandingsAnalysis } from "@shared/standingsAnalysis";

interface ScheduleSimulatorProps {
  analysis: StandingsAnalysis;
}

const winsOf = (r: SimRecord) => r.wins + r.ties * 0.5;

function formatRecord(r: SimRecord): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

function formatWins(wins: number): string {
  return `${wins} ${wins === 1 ? "win" : "wins"}`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`;
}

function TeamAvatar({ team, className = "w-7 h-7" }: { team: AnalysisTeam; className?: string }) {
  return (
    <Avatar className={`${className} shrink-0`}>
      {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
      <AvatarFallback className={`text-[10px] ${team.isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {team.initials}
      </AvatarFallback>
    </Avatar>
  );
}

function cellClass(cell: SimRecord, actual: SimRecord, isActual: boolean): string {
  if (isActual) return "bg-primary/20 font-bold ring-1 ring-inset ring-primary/60";
  const diff = winsOf(cell) - winsOf(actual);
  if (diff >= 3) return "bg-emerald-500/30 text-emerald-300";
  if (diff > 0) return "bg-emerald-500/15 text-emerald-300";
  if (diff <= -3) return "bg-red-500/30 text-red-300";
  if (diff < 0) return "bg-red-500/15 text-red-300";
  return "text-muted-foreground";
}

function SummaryCard({
  title,
  icon,
  accent,
  team,
  headline,
  detail,
  testId,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  team: AnalysisTeam | undefined;
  headline: string;
  detail: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 space-y-3">
        <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${accent}`}>
          {icon}
          {title}
        </div>
        {team ? (
          <>
            <div className="flex items-center gap-3">
              <TeamAvatar team={team} className="w-10 h-10" />
              <div className="min-w-0">
                <div className={`font-heading font-semibold truncate ${team.isUser ? "text-primary" : ""}`}>{team.name}</div>
                <div className="text-sm font-medium tabular-nums">{headline}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{detail}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough games yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScheduleSimulator({ analysis }: ScheduleSimulatorProps) {
  const { teams, simulation, summary } = analysis;
  const teamById = new Map(teams.map((t) => [t.rosterId, t]));
  const difficultyById = new Map(simulation.difficulty.map((d) => [d.rosterId, d]));

  const { toughestSchedule, easiestSchedule, biggestUpgrade, biggestDowngrade, unluckiest, luckiest } = summary;

  return (
    <div className="space-y-6">
      <Card data-testid="card-schedule-simulator">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Schedule Simulator</CardTitle>
          <CardDescription>
            Each row replays that team's weekly scores against the opponents on the schedule shown in each column. The highlighted
            diagonal is the team's actual record. When a schedule's opponent would be the team itself, it plays the schedule's owner instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="table-schedule-simulator">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-card min-w-[170px]">
                  <span className="text-xs uppercase tracking-wider">Team scores</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">vs. schedule of &rarr;</span>
                </TableHead>
                {teams.map((schedule) => (
                  <TableHead key={schedule.rosterId} className="text-center px-1" data-testid={`sim-col-${schedule.rosterId}`}>
                    <div className="flex flex-col items-center gap-1" title={`${schedule.name}'s schedule`}>
                      <TeamAvatar team={schedule} />
                      <span className={`text-[10px] ${schedule.isUser ? "text-primary" : ""}`}>{schedule.initials}</span>
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-center border-l border-border">Actual</TableHead>
                <TableHead className="text-center">Avg sim</TableHead>
                <TableHead className="text-center">Luck</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {simulation.rows.map((row) => {
                const team = teamById.get(row.rosterId)!;
                return (
                  <TableRow key={row.rosterId} data-testid={`sim-row-${row.rosterId}`}>
                    <TableCell className="sticky left-0 z-10 bg-card">
                      <div className="flex items-center gap-2">
                        <TeamAvatar team={team} />
                        <span className={`text-sm font-medium truncate max-w-[120px] ${team.isUser ? "text-primary" : ""}`}>
                          {team.name}
                        </span>
                      </div>
                    </TableCell>
                    {row.results.map((cell, idx) => {
                      const schedule = teams[idx];
                      const isActual = schedule.rosterId === row.rosterId;
                      return (
                        <TableCell
                          key={schedule.rosterId}
                          className={`text-center px-1 py-2 text-xs tabular-nums ${cellClass(cell, row.actual, isActual)}`}
                          data-testid={`sim-cell-${row.rosterId}-${schedule.rosterId}`}
                        >
                          {formatRecord(cell)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center tabular-nums font-semibold border-l border-border">
                      {formatRecord(row.actual)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{row.expectedWins.toFixed(1)}</TableCell>
                    <TableCell
                      className={`text-center tabular-nums font-semibold ${
                        row.luck > 0.05 ? "text-emerald-400" : row.luck < -0.05 ? "text-red-400" : "text-muted-foreground"
                      }`}
                    >
                      {formatSigned(row.luck)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 border-border hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 bg-card text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg wins allowed
                </TableCell>
                {teams.map((schedule) => (
                  <TableCell key={schedule.rosterId} className="text-center px-1 text-xs tabular-nums text-muted-foreground">
                    {difficultyById.get(schedule.rosterId)?.avgWinsAllowed.toFixed(1)}
                  </TableCell>
                ))}
                <TableCell colSpan={3} />
              </TableRow>
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary/20 ring-1 ring-primary/60" /> Actual schedule
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500/30" /> More wins than actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-red-500/30" /> Fewer wins than actual
            </span>
            <span>Luck = actual wins minus average simulated wins on the other schedules.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="schedule-sim-summary">
        <SummaryCard
          testId="summary-toughest-schedule"
          title="Toughest schedule"
          icon={<Mountain className="w-4 h-4" />}
          accent="text-red-400"
          team={toughestSchedule ? teamById.get(toughestSchedule.rosterId) : undefined}
          headline={toughestSchedule ? `${toughestSchedule.avgWinsAllowed.toFixed(1)} avg wins allowed` : ""}
          detail={
            toughestSchedule
              ? `Other teams averaged the fewest wins on this schedule. Actual opponents averaged ${toughestSchedule.avgOpponentPoints.toFixed(1)} points per game.`
              : ""
          }
        />
        <SummaryCard
          testId="summary-easiest-schedule"
          title="Easiest schedule"
          icon={<Feather className="w-4 h-4" />}
          accent="text-emerald-400"
          team={easiestSchedule ? teamById.get(easiestSchedule.rosterId) : undefined}
          headline={easiestSchedule ? `${easiestSchedule.avgWinsAllowed.toFixed(1)} avg wins allowed` : ""}
          detail={
            easiestSchedule
              ? `Other teams averaged the most wins on this schedule. Actual opponents averaged ${easiestSchedule.avgOpponentPoints.toFixed(1)} points per game.`
              : ""
          }
        />
        <SummaryCard
          testId="summary-biggest-upgrade"
          title="Biggest upgrade"
          icon={<TrendingUp className="w-4 h-4" />}
          accent="text-emerald-400"
          team={biggestUpgrade ? teamById.get(biggestUpgrade.rosterId) : undefined}
          headline={biggestUpgrade ? `${formatRecord(biggestUpgrade.actual)} \u2192 ${formatRecord(biggestUpgrade.simulated)}` : ""}
          detail={
            biggestUpgrade
              ? `Would gain ${biggestUpgrade.delta.toFixed(1)} wins on ${teamById.get(biggestUpgrade.scheduleRosterId)?.name ?? "another team"}'s schedule.`
              : ""
          }
        />
        <SummaryCard
          testId="summary-biggest-downgrade"
          title="Biggest downgrade"
          icon={<TrendingDown className="w-4 h-4" />}
          accent="text-red-400"
          team={biggestDowngrade ? teamById.get(biggestDowngrade.rosterId) : undefined}
          headline={biggestDowngrade ? `${formatRecord(biggestDowngrade.actual)} \u2192 ${formatRecord(biggestDowngrade.simulated)}` : ""}
          detail={
            biggestDowngrade
              ? `Would lose ${Math.abs(biggestDowngrade.delta).toFixed(1)} wins on ${teamById.get(biggestDowngrade.scheduleRosterId)?.name ?? "another team"}'s schedule.`
              : ""
          }
        />
        <SummaryCard
          testId="summary-unluckiest"
          title="Unluckiest schedule"
          icon={<CloudRain className="w-4 h-4" />}
          accent="text-red-400"
          team={unluckiest ? teamById.get(unluckiest.rosterId) : undefined}
          headline={unluckiest ? `${formatSigned(unluckiest.luck)} wins vs. expected` : ""}
          detail={
            unluckiest
              ? `${formatWins(unluckiest.actualWins)} actual compared with ${unluckiest.expectedWins.toFixed(1)} on an average schedule.`
              : ""
          }
        />
        <SummaryCard
          testId="summary-luckiest"
          title="Luckiest schedule"
          icon={<Clover className="w-4 h-4" />}
          accent="text-emerald-400"
          team={luckiest ? teamById.get(luckiest.rosterId) : undefined}
          headline={luckiest ? `${formatSigned(luckiest.luck)} wins vs. expected` : ""}
          detail={
            luckiest
              ? `${formatWins(luckiest.actualWins)} actual compared with ${luckiest.expectedWins.toFixed(1)} on an average schedule.`
              : ""
          }
        />
      </div>
    </div>
  );
}
