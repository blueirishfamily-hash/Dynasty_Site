import { useState } from "react";
import { FlaskConical, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { resetTestMode, setTestMode, useContractsTestMode } from "@/lib/contractsTestMode";
import { ACTIVE_PHASES, PHASE_LABELS, type LeaguePhaseId } from "@shared/contractRules";

interface Props {
  leagueId: string | undefined;
  currentYear: number;
  currentPhase: LeaguePhaseId;
}

/** Switch for test mode plus, while it is on, the banner with the phase walker. */
export function TestModeBar({ leagueId, currentYear, currentPhase }: Props) {
  const on = useContractsTestMode();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const idx = ACTIVE_PHASES.indexOf(currentPhase);

  const goToPhase = async (phase: LeaguePhaseId) => {
    if (!leagueId) return;
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/league/${leagueId}/contract-phase`, { currentPhase: phase });
      await queryClient.invalidateQueries();
    } catch (e) {
      toast({ title: "Could not change phase", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!on) {
    return (
      <div className="max-w-7xl mx-auto px-4 pt-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setTestMode(true)}
          data-testid="button-test-mode-on"
        >
          <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
          Test mode
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border-y border-amber-500/40 bg-amber-500/10"
      data-testid="banner-test-mode"
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
          <FlaskConical className="w-4 h-4" />
          Test mode
          <span className="font-normal text-xs text-muted-foreground">
            Nothing here is saved to the real database
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={busy || idx <= 0}
            onClick={() => goToPhase(ACTIVE_PHASES[idx - 1])}
            aria-label="Previous phase"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={currentPhase}
            disabled={busy}
            onChange={e => goToPhase(e.target.value as LeaguePhaseId)}
            aria-label="Test phase"
          >
            {ACTIVE_PHASES.map(p => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={busy || idx < 0 || idx >= ACTIVE_PHASES.length - 1}
            onClick={() => goToPhase(ACTIVE_PHASES[idx + 1])}
            aria-label="Next phase"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={busy}
            onClick={async () => {
              await resetTestMode();
              toast({ title: "Test data reset", description: "Back to the real data. Phase is back to the real phase." });
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset
          </Button>
          <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => setTestMode(false)}>
            Exit test mode
          </Button>
        </div>
      </div>
    </div>
  );
}
