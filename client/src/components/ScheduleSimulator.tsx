import { useState, type ReactNode } from "react";
import { Clover, CloudRain, Feather, Mountain, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  if (isActual) return "bg-primary/20 ring-1 ring-inset ring-primary font-bold text-foreground";
  const diff = winsOf(cell) - winsOf(actual);
  if (diff >= 3) return "bg-[#0F5A3E] text-[#D1FAE5]";
  if (diff > 0) return "bg-[#0D3A2A] text-[#A7F3D0]";
  if (diff <= -3) return "bg-[#6B1F2A] text-[#FECACA]";
  if (diff < 0) return "bg-[#3F1820] text-[#FCA5A5]";
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

function TeamChip({ team, selected, onSelect }: { team: AnalysisTeam; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`sim-chip-${team.rosterId}`}
      className={`shrink-0 inline-flex items-center gap-2 min-h-[44px] rounded-full border pl-2 pr-3.5 text-sm font-medium whitespace-nowrap transition-colors ${
        selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
      }`}
    >
      <TeamAvatar team={team} className="w-6 h-6" />
      <span className={team.isUser ? "text-primary" : ""}>{team.name.length > 14 ? `${team.name.slice(0, 13)}\u2026` : team.name}</span>
    </button>
  );
}

export default function ScheduleSimulator({ analysis }: ScheduleSimulatorProps) {
  const { teams, simulation, summary } = analysis;
  const teamById = new Map(teams.map((t) => [t.rosterId, t]));
  const difficultyById = new Map(simulation.difficulty.map((d) => [d.rosterId, d]));
  const defaultId = (teams.find((t) => t.isUser) ?? teams[0])?.rosterId;
  const [selectedId, setSelectedId] = useState<number | undefined>(defaultId);

  const { toughestSchedule, easiestSchedule, biggestUpgrade, biggestDowngrade, unluckiest, luckiest } = summary;

  const selectedRow = simulation.rows.find((r) => r.rosterId === selectedId) ?? simulation.rows[0];
  const selectedTeam = selectedRow ? teamById.get(selectedRow.rosterId) : undefined;
  const maxGames = selectedRow ? Math.max(1, ...selectedRow.results.map((r) => r.wins + r.losses + r.ties)) : 1;

  // Phone list: this team's record on every schedule, best first.
  const phoneList = selectedRow
    ? selectedRow.results
        .map((cell, idx) => ({ cell, schedule: teams[idx] }))
        .sort((a, b) => winsOf(b.cell) - winsOf(a.cell))
    : [];
  const diffSorted = [...simulation.difficulty].sort((a, b) => a.avgWinsAllowed - b.avgWinsAllowed);
  const maxAllowed = Math.max(1, ...simulation.difficulty.map((d) => d.avgWinsAllowed));

  const gridCols = { gridTemplateColumns: `190px repeat(${teams.length}, minmax(0, 1fr)) 64px 64px 60px` };

  const luckClass = (luck: number) =>
    luck > 0.05 ? "text-emerald-400" : luck < -0.05 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      <Card data-testid="card-schedule-simulator">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Schedule Simulator</CardTitle>
          <CardDescription>
            What if you had played someone else's schedule? Each row replays that team's weekly scores against the opponents on the
            schedule shown in each column. The highlighted diagonal is the team's actual record. When a schedule's opponent would be the
            team itself, it plays the schedule's owner instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedRow && selectedTeam && (
            <div
              className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-primary bg-card px-[18px] py-3.5"
              data-testid="sim-selected-strip-desktop"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{selectedTeam.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="font-heading text-[26px] font-bold tabular-nums">{formatRecord(selectedRow.actual)}</span>
                <span className="text-muted-foreground">actual</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="font-heading text-[26px] font-bold tabular-nums">{selectedRow.expectedWins.toFixed(1)}</span>
                <span className="text-muted-foreground">avg wins on other schedules</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className={`font-heading text-[26px] font-bold tabular-nums ${luckClass(selectedRow.luck)}`}>{formatSigned(selectedRow.luck)}</span>
                <span className="text-muted-foreground">luck</span>
              </span>
              <span className="ml-auto text-[13px] text-muted-foreground">Select a team in the table to see its numbers here.</span>
            </div>
          )}

          {selectedRow && selectedTeam && (
            <div
              className="md:hidden rounded-lg border border-primary/60 bg-card p-3 sm:p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
              data-testid="sim-selected-strip"
            >
              <div className="flex items-center gap-2 min-w-0">
                <TeamAvatar team={selectedTeam} className="w-9 h-9" />
                <span className={`font-heading font-semibold truncate ${selectedTeam.isUser ? "text-primary" : ""}`}>{selectedTeam.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:flex sm:gap-8 sm:ml-auto">
                <div>
                  <div className="font-heading text-xl font-bold tabular-nums">{formatRecord(selectedRow.actual)}</div>
                  <div className="text-[11px] text-muted-foreground">Actual</div>
                </div>
                <div>
                  <div className="font-heading text-xl font-bold tabular-nums">{selectedRow.expectedWins.toFixed(1)}</div>
                  <div className="text-[11px] text-muted-foreground">Avg sim wins</div>
                </div>
                <div>
                  <div className={`font-heading text-xl font-bold tabular-nums ${luckClass(selectedRow.luck)}`}>{formatSigned(selectedRow.luck)}</div>
                  <div className="text-[11px] text-muted-foreground">Luck</div>
                </div>
              </div>
            </div>
          )}

          {/* Phone: team picker + this team's record on each schedule */}
          <div className="md:hidden space-y-3" data-testid="sim-mobile">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Team">
              {teams.map((t) => (
                <TeamChip key={t.rosterId} team={t} selected={t.rosterId === selectedRow?.rosterId} onSelect={() => setSelectedId(t.rosterId)} />
              ))}
            </div>
            {selectedRow && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Record on each schedule</p>
                {phoneList.map(({ cell, schedule }) => {
                  const isActual = schedule.rosterId === selectedRow.rosterId;
                  const diff = winsOf(cell) - winsOf(selectedRow.actual);
                  const bar = isActual ? "bg-primary" : diff > 0 ? "bg-emerald-500" : diff < 0 ? "bg-red-500" : "bg-slate-500";
                  return (
                    <div
                      key={schedule.rosterId}
                      className={`grid grid-cols-[28px_1fr_64px] items-center gap-2.5 min-h-[48px] rounded-lg border px-2 py-1.5 ${
                        isActual ? "border-primary/60 bg-primary/10" : "border-transparent"
                      }`}
                      data-testid={`sim-mobile-row-${schedule.rosterId}`}
                    >
                      <TeamAvatar team={schedule} />
                      <div className="min-w-0 space-y-1">
                        <div className={`text-sm font-medium truncate ${schedule.isUser ? "text-primary" : ""}`}>
                          {schedule.name}
                          {isActual && <span className="text-muted-foreground font-normal"> (actual)</span>}
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${(winsOf(cell) / maxGames) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="text-sm font-bold">{formatRecord(cell)}</div>
                        <div className={`text-[11px] font-semibold ${isActual ? "text-primary" : diff > 0 ? "text-emerald-400" : diff < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {isActual ? "actual" : diff === 0 ? "same" : formatSigned(diff)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desktop: full matrix */}
          <div className="hidden md:block overflow-x-auto" data-testid="table-schedule-simulator">
            <div className="min-w-[1020px] flex flex-col gap-[3px]">
              <div className="grid items-end gap-[3px] pb-1.5" style={gridCols}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Team scores
                  <span className="block font-medium normal-case tracking-normal">vs. schedule of &rarr;</span>
                </span>
                {teams.map((schedule) => (
                  <span key={schedule.rosterId} className="flex justify-center" data-testid={`sim-col-${schedule.rosterId}`} title={`${schedule.name}'s schedule`}>
                    <TeamAvatar team={schedule} />
                  </span>
                ))}
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual</span>
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg sim</span>
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Luck</span>
              </div>

              {simulation.rows.map((row) => {
                const team = teamById.get(row.rosterId)!;
                const isSelected = row.rosterId === selectedRow?.rosterId;
                return (
                  <div
                    key={row.rosterId}
                    className={`grid items-center gap-[3px] rounded-[10px] py-[3px] ${isSelected ? "bg-primary/10" : ""}`}
                    style={gridCols}
                    data-testid={`sim-row-${row.rosterId}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.rosterId)}
                      aria-pressed={isSelected}
                      className="flex min-h-[40px] min-w-0 items-center gap-2 px-2 text-left text-[13px] font-semibold"
                    >
                      <TeamAvatar team={team} className="w-6 h-6" />
                      <span className={`truncate ${team.isUser ? "text-primary" : ""}`}>{team.name}</span>
                    </button>
                    {row.results.map((cell, idx) => {
                      const schedule = teams[idx];
                      const isActual = schedule.rosterId === row.rosterId;
                      return (
                        <span
                          key={schedule.rosterId}
                          className={`rounded-md py-[9px] text-center text-xs tabular-nums ${cellClass(cell, row.actual, isActual)}`}
                          data-testid={`sim-cell-${row.rosterId}-${schedule.rosterId}`}
                        >
                          {formatRecord(cell)}
                        </span>
                      );
                    })}
                    <span className="border-l border-border text-center font-bold tabular-nums">{formatRecord(row.actual)}</span>
                    <span className="text-center tabular-nums">{row.expectedWins.toFixed(1)}</span>
                    <span className={`text-center font-bold tabular-nums ${luckClass(row.luck)}`}>{formatSigned(row.luck)}</span>
                  </div>
                );
              })}

              <div className="mt-1 grid items-center gap-[3px] border-t-2 border-border pt-2" style={gridCols}>
                <span className="pl-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Avg wins allowed</span>
                {teams.map((schedule) => (
                  <span key={schedule.rosterId} className="text-center text-xs tabular-nums text-muted-foreground">
                    {difficultyById.get(schedule.rosterId)?.avgWinsAllowed.toFixed(1)}
                  </span>
                ))}
                <span /><span /><span />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-primary/20 ring-1 ring-primary/60" /> Actual schedule
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#0F5A3E]" /> More wins than actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#6B1F2A]" /> Fewer wins than actual
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

      <Card className="md:hidden" data-testid="sim-mobile-difficulty">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Average wins allowed, by schedule</p>
          {diffSorted.map((d) => {
            const t = teamById.get(d.rosterId);
            if (!t) return null;
            return (
              <div key={d.rosterId} className="grid grid-cols-[28px_1fr_40px] items-center gap-2.5 min-h-[32px]">
                <TeamAvatar team={t} />
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(d.avgWinsAllowed / maxAllowed) * 100}%` }} />
                </div>
                <span className="text-right text-xs tabular-nums text-muted-foreground">{d.avgWinsAllowed.toFixed(1)}</span>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">Lower means a tougher schedule.</p>
        </CardContent>
      </Card>
    </div>
  );
}
