import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSleeper } from "@/lib/sleeper-context";
import { isLeagueCommissioner } from "@/lib/commissioner";
import type { WeeklyReportData } from "@shared/weeklyReport";
import type { ReportPrediction, ReportTheme } from "@/components/WeeklyReportPdf";

interface WeeklyReportExportProps {
  leagueId: string;
  userId: string;
  /** Current effective week from the server; used as the default and the upper bound. */
  currentWeek?: number;
}

async function fetchJson<T>(url: string, required: boolean): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    if (required) throw error;
    return null;
  }
}

export default function WeeklyReportExport({ leagueId, userId, currentWeek }: WeeklyReportExportProps) {
  const { toast } = useToast();
  const { user, league } = useSleeper();
  const isCommissioner = isLeagueCommissioner(user, league);
  const [theme, setTheme] = useState<ReportTheme>("dark");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState<string>("current");

  const maxWeek = Math.max(1, Math.min(currentWeek ?? 1, 18));
  const weeks = Array.from({ length: maxWeek }, (_, i) => maxWeek - i);

  const handleExport = async () => {
    setBusy(true);
    try {
      const weekParam = week === "current" ? "" : `&week=${week}`;
      // The commissioner's report is shared with the league, so it carries no "you" markers.
      const viewerParam = isCommissioner ? "" : `userId=${encodeURIComponent(userId)}`;
      const base = `/api/sleeper/league/${leagueId}`;
      const [report, predictions, power] = await Promise.all([
        fetchJson<WeeklyReportData>(`${base}/weekly-report?${viewerParam}${weekParam}`, true),
        fetchJson<{ predictions: ReportPrediction[]; simulationCount?: number }>(`${base}/playoff-predictions`, false),
        fetchJson<{ teams: Array<{ rosterId: number; currentRank: number }> }>(`${base}/power-rankings`, false),
      ]);
      if (!report) throw new Error("Report unavailable");

      const [{ pdf }, { default: WeeklyReportPdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/WeeklyReportPdf"),
      ]);

      const input = {
        report,
        predictions: predictions?.predictions ?? [],
        simulationCount: predictions?.simulationCount,
        powerRank: Object.fromEntries((power?.teams ?? []).map((t) => [t.rosterId, t.currentRank])),
        theme,
      };
      const blob = await pdf(<WeeklyReportPdf input={input} />).toBlob();

      const safeName = report.league.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName}-Week-${report.week}-Report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      setOpen(false);
      toast({ title: "Weekly report downloaded", description: `Week ${report.week} report saved as a PDF.` });
    } catch (error) {
      console.error("Weekly report export failed:", error);
      toast({
        title: "Couldn't create the report",
        description: "Something went wrong building the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-export-report">
          <FileDown className="w-4 h-4" />
          Export Weekly Report
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <h4 className="font-heading text-sm font-semibold">Weekly Report (PDF)</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Recaps the previous week, highlights top performers, previews the selected week, and shows how the
            playoff race is shaping up.
          </p>
        </div>
        <Select value={week} onValueChange={setWeek}>
          <SelectTrigger data-testid="select-report-week">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current week{currentWeek ? ` (Week ${currentWeek})` : ""}</SelectItem>
            {weeks.map((w) => (
              <SelectItem key={w} value={String(w)}>
                Week {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted" role="radiogroup" aria-label="Report theme">
          {(["dark", "light"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              onClick={() => setTheme(option)}
              className={`rounded px-2 py-1 text-xs font-medium capitalize transition-colors ${
                theme === option ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
              data-testid={`button-report-theme-${option}`}
            >
              {option}
            </button>
          ))}
        </div>
        {isCommissioner && (
          <p className="text-[11px] text-muted-foreground">
            Commissioner export: team highlights are left off so the report is ready to share.
          </p>
        )}
        <Button className="w-full gap-2" onClick={handleExport} disabled={busy} data-testid="button-download-report">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {busy ? "Building report..." : "Download PDF"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
