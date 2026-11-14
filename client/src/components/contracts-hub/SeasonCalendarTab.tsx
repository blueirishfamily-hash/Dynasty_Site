import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { PHASE_LABELS, RFA_ENABLED, formatPhaseDate, type LeaguePhaseId, type PhaseConfigEntry } from "@shared/contractRules";

const PHASE_BULLETS: Record<LeaguePhaseId, string[]> = {
  league_year_rollover: [
    "Commissioner attaches the renewed Sleeper league",
    "Next season becomes the contract year",
    "Expired contracts come off; those players are free agents",
  ],
  fa_round_1: RFA_ENABLED
    ? ["Blind bids on FAs and RFAs", "No minimum bid", "Bids may exceed cap until results"]
    : ["Blind bids on free agents", "No minimum bid", "Bids may exceed cap until results"],
  round_1_results: [
    "Reject wins until every season fits",
    "Confirming signs the players you keep",
    "Every team must confirm before Round 2",
  ],
  rfa_match_1: ["Match exact years & salary or walk", "Cap hold on bidding team", "Window closes → walk if undecided"],
  fa_round_2: ["Second blind bid round", "Round 1 signings count against your cap"],
  round_2_results: ["Same confirm flow as Round 1", "Unsigned after Round 2 → in-season FA"],
  rfa_match_2: ["Final RFA match window", "Same match / walk rules"],
  fa_recap: ["Every player each team signed", "Rookie draft, then rookie contracts"],
  regular_season: ["Tag or extend expiring contracts", "Trades open", "Closes automatically after Week 14"],
  deadline_passed: ["Tags, extensions and trades closed", "League rolls over after the championship"],
};

/**
 * The league year as a bar of dot nodes. Finished phases are filled, the open phase is highlighted,
 * and upcoming phases are hollow. Hover or focus a dot for its dates and what happens in it.
 */
export function SeasonCalendarBar({
  currentYear,
  currentPhase,
  phases,
  canAdvance = false,
  advancing = false,
  onAdvance,
}: {
  currentYear: number;
  currentPhase: LeaguePhaseId;
  phases: PhaseConfigEntry[];
  /** Commissioner only: shows the button that moves the league to the next phase. */
  canAdvance?: boolean;
  advancing?: boolean;
  onAdvance?: (next: LeaguePhaseId) => void;
}) {
  if (phases.length === 0) return null;
  const currentIndex = phases.findIndex(p => p.id === currentPhase);
  const next = currentIndex >= 0 && currentIndex < phases.length - 1 ? phases[currentIndex + 1].id : null;
  // The regular-season window closes on its own after Week 14; the rollover happens from Settings.
  const advanceNote =
    currentPhase === "regular_season"
      ? "Closes automatically after Week 14"
      : currentPhase === "deadline_passed"
        ? "After the championship, roll over from Settings → Advance league year"
        : null;

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <p className="text-sm">
          <span className="font-semibold">{currentYear} league year</span>
          <span className="text-muted-foreground"> · Now: </span>
          <span className="font-medium text-amber-500">{PHASE_LABELS[currentPhase]}</span>
        </p>
        {canAdvance && (
          advanceNote ? (
            <p className="text-[11px] text-muted-foreground">{advanceNote}</p>
          ) : next && onAdvance ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={advancing} onClick={() => onAdvance(next)}>
              {advancing ? "Advancing…" : `Advance to ${PHASE_LABELS[next]}`}
            </Button>
          ) : null
        )}
        {!canAdvance && <p className="text-[11px] text-muted-foreground">Tags, extensions and trades: regular season through Week 14</p>}
      </div>

      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-[640px]">
          {phases.map((p, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
            const dates = p.startAt != null
              ? `${formatPhaseDate(p.startAt)}${p.endAt != null ? ` – ${formatPhaseDate(p.endAt)}` : ""}`
              : null;
            return (
              <li key={p.id} className="relative flex-1 min-w-0">
                {/* connector to the previous dot */}
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`absolute top-[7px] right-1/2 w-full h-0.5 ${i <= currentIndex ? "bg-primary" : "bg-border"}`}
                  />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${PHASE_LABELS[p.id]}: ${state === "current" ? "open now" : state === "done" ? "complete" : "upcoming"}`}
                      className="relative z-10 flex w-full flex-col items-center gap-1.5 focus:outline-none group"
                    >
                      <span
                        className={
                          state === "current"
                            ? "h-4 w-4 rounded-full bg-amber-500 ring-4 ring-amber-500/25"
                            : state === "done"
                              ? "h-4 w-4 rounded-full bg-primary"
                              : "h-4 w-4 rounded-full border-2 border-border bg-background group-hover:border-muted-foreground"
                        }
                      />
                      <span
                        className={`px-1 text-center text-[10px] leading-tight ${
                          state === "current" ? "font-semibold text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {PHASE_LABELS[p.id]}
                      </span>
                      {dates && <span className="px-1 text-center text-[9px] text-muted-foreground/70">{dates}</span>}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="font-semibold text-xs">{PHASE_LABELS[p.id]}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {state === "current" ? "Open now" : state === "done" ? "Complete" : "Upcoming"}
                      {dates ? ` · ${dates}` : ""}
                    </p>
                    <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-[11px]">
                      {PHASE_BULLETS[p.id].map(b => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
