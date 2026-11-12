import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PHASE_LABELS, RFA_ENABLED, formatPhaseDate, type LeaguePhaseId, type PhaseConfigEntry } from "@shared/contractRules";

const PHASE_BULLETS: Record<LeaguePhaseId, string[]> = {
  league_year_rollover: RFA_ENABLED
    ? ["One year off every contract", "Expired deals → free agents", "Rookie deals ending → RFA eligible"]
    : ["One year off every contract", "Expired deals → free agents"],
  tag_extension: RFA_ENABLED
    ? ["Tag or extend (existing logic)", "Designate up to 1 RFA", "No bidding yet"]
    : ["Tag or extend (existing logic)", "No bidding yet"],
  fa_round_1: RFA_ENABLED
    ? ["Blind bids on FAs and RFAs", "No minimum bid", "Bids may exceed cap until results"]
    : ["Blind bids on free agents", "No minimum bid", "Bids may exceed cap until results"],
  round_1_results: RFA_ENABLED
    ? ["Reject wins until every season fits", "Rejected players → Round 2", "Resolve before RFA window 1"]
    : ["Reject wins until every season fits", "Rejected players → Round 2"],
  rfa_match_1: ["Match exact years & salary or walk", "Cap hold on bidding team", "Window closes → walk if undecided"],
  fa_round_2: ["Second blind bid round", "Unsigned after Round 2 → in-season FA"],
  round_2_results: RFA_ENABLED ? ["Same cap rejection flow as Round 1", "Before RFA window 2"] : ["Same cap rejection flow as Round 1"],
  rfa_match_2: ["Final RFA match window", "Same match / walk rules"],
  fa_recap: ["Every player each team signed", "Nothing to decide, review only"],
  regular_season: ["1-year STANDARD in-season signings", "Trades until Week 14 deadline"],
};

export function SeasonCalendarTab({
  currentYear,
  currentPhase,
  phases,
}: {
  currentYear: number;
  currentPhase: LeaguePhaseId;
  phases: PhaseConfigEntry[];
}) {
  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <p className="text-sm">
            <span className="font-semibold">{currentYear} league year</span>
            {" · "}
            Current phase: <Badge>{PHASE_LABELS[currentPhase]}</Badge>
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Trade window</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Open from rollover through Week 14. Cap check: current season only — at or under cap, or net salary decrease.
        </CardContent>
      </Card>
      <div className="space-y-2">
        {phases.map((p, i) => {
          const status =
            p.id === currentPhase ? "Open now" : phases.findIndex(x => x.id === currentPhase) > i ? "Complete" : "Upcoming";
          const highlight = p.id === currentPhase;
          return (
            <Card key={p.id} className={highlight ? "border-amber-500/50 bg-amber-500/5" : ""}>
              <CardContent className="py-3 flex flex-wrap gap-3 items-start">
                <div className="font-mono text-xs text-muted-foreground w-6">{i + 1}</div>
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-sm">{PHASE_LABELS[p.id]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatPhaseDate(p.startAt)}
                    {p.endAt != null ? ` – ${formatPhaseDate(p.endAt)}` : ""}
                  </p>
                  <ul className="text-[11px] text-muted-foreground mt-2 list-disc pl-4 space-y-0.5">
                    {PHASE_BULLETS[p.id].map(b => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
                <Badge variant={status === "Open now" ? "default" : "outline"}>{status}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
