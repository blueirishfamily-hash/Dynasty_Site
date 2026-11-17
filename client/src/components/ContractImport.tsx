// Starting contracts from a CSV (League Settings → Import contracts). Pick a file, see exactly what would be
// imported and what's wrong with it, then import. Nothing is written until the file has no problems.
import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSleeper } from "@/lib/sleeper-context";
import { useLeagueRules } from "@/lib/leagueRules";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface PreviewRow {
  line: number;
  team: string;
  player: string;
  salaries?: Record<string, number>;
  rookie: boolean;
  status: "ok" | "skipped" | "error";
  message?: string;
  replaces?: boolean;
}
interface Preview {
  problems: string[];
  rows: PreviewRow[];
  counts: { ok: number; skipped: number; error: number };
  capWarnings: string[];
  seasons: number[];
}

const STATUS_STYLE: Record<PreviewRow["status"], string> = {
  ok: "text-primary",
  skipped: "text-muted-foreground",
  error: "text-destructive",
};

export default function ContractImport() {
  const { league, season } = useSleeper();
  const rules = useLeagueRules();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"skip" | "replace">("skip");
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const currentSeason = parseInt(season, 10) || new Date().getFullYear();
  const seasons = Array.from({ length: rules.maxContractYears }, (_, i) => currentSeason + i);

  const call = async (text: string, theMode: "skip" | "replace", dryRun: boolean) => {
    const res = await fetch(`/api/league/${league?.leagueId}/contracts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text, mode: theMode, dryRun }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const check = async (text: string, theMode: "skip" | "replace") => {
    setBusy(true);
    try {
      const { res, data } = await call(text, theMode, true);
      if (!res.ok) {
        setPreview(null);
        toast({ title: "Couldn't check the file", description: data.error || "Try again.", variant: "destructive" });
        return;
      }
      setPreview(data);
    } catch {
      toast({ title: "Couldn't check the file", description: "A network error occurred.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await check(text, mode);
  };

  const doImport = async () => {
    if (!csv) return;
    setBusy(true);
    try {
      const { res, data } = await call(csv, mode, false);
      if (!res.ok) {
        if (data.rows) setPreview(data);
        toast({ title: "Nothing was imported", description: data.error || "Try again.", variant: "destructive" });
        return;
      }
      toast({
        title: `Imported ${data.imported} ${data.imported === 1 ? "contract" : "contracts"}`,
        description: [data.replaced ? `${data.replaced} replaced` : "", data.skipped ? `${data.skipped} skipped` : ""].filter(Boolean).join(" · ") || undefined,
      });
      setCsv(null);
      setFileName("");
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries();
    } catch {
      toast({ title: "Nothing was imported", description: "A network error occurred. Running it again is safe.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const header = ["team", "player", ...seasons.map((y) => `salary_${y}`), "rookie"].join(",");
    const example = ["Team name,Player name", ...seasons.map((_, i) => (i < 3 ? "10" : "")), ""].join(",");
    const blob = new Blob([`${header}\n${example}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "starting-contracts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const canImport = !!preview && preview.problems.length === 0 && preview.counts.error === 0 && preview.counts.ok > 0 && !busy;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Import starting contracts</CardTitle>
        <CardDescription>
          One row per contract, one column per season ({seasons[0]} to {seasons[seasons.length - 1]}), salaries in $M. Teams are matched by team name,
          owner name or roster number; players by name on that team's Sleeper roster. Add a <code>rookie</code> column with yes for rookie contracts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="button-download-template"><Download className="mr-1 h-4 w-4" />Download template</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
            data-testid="input-contracts-csv"
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}><FileUp className="mr-1 h-4 w-4" />{fileName ? "Choose another file" : "Choose CSV file"}</Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Players who already have a contract:</span>
          <Select
            value={mode}
            onValueChange={(v) => { const m = v as "skip" | "replace"; setMode(m); if (csv) check(csv, m); }}
          >
            <SelectTrigger className="w-56" aria-label="When a player already has a contract"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">Skip them</SelectItem>
              <SelectItem value="replace">Replace their contract</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {preview && (
          <div className="flex flex-col gap-3" data-testid="import-preview">
            {preview.problems.map((p) => (
              <p key={p} role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{p}</p>
            ))}
            {preview.rows.length > 0 && (
              <>
                <p className="text-sm">
                  <span className="font-medium text-primary">{preview.counts.ok} ready</span>
                  {preview.counts.skipped > 0 && <span className="text-muted-foreground"> · {preview.counts.skipped} skipped</span>}
                  {preview.counts.error > 0 && <span className="font-medium text-destructive"> · {preview.counts.error} with problems</span>}
                </p>
                {preview.capWarnings.length > 0 && (
                  <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                    {preview.capWarnings.map((w) => <p key={w}>{w}</p>)}
                    <p className="mt-1 text-xs">You can still import. Commissioners can go over the cap; teams can't.</p>
                  </div>
                )}
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
                      <tr><th className="px-3 py-2 font-normal">Line</th><th className="px-3 py-2 font-normal">Team</th><th className="px-3 py-2 font-normal">Player</th><th className="px-3 py-2 font-normal">Salaries ($M)</th><th className="px-3 py-2 font-normal">Result</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 300).map((r) => (
                        <tr key={r.line} className="border-t align-top">
                          <td className="px-3 py-1.5 text-muted-foreground">{r.line}</td>
                          <td className="px-3 py-1.5">{r.team}</td>
                          <td className="px-3 py-1.5">{r.player}{r.rookie ? " (rookie)" : ""}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.salaries ? Object.entries(r.salaries).map(([y, t]) => `${y}: ${t / 10}`).join(" · ") : ""}</td>
                          <td className={cn("px-3 py-1.5", STATUS_STYLE[r.status])}>
                            {r.status === "ok" ? (r.replaces ? "Replaces existing" : "Ready") : r.status === "skipped" ? "Skipped" : "Problem"}
                            {r.message && <div className="text-xs">{r.message}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 300 && <p className="text-xs text-muted-foreground">Showing the first 300 of {preview.rows.length} rows.</p>}
              </>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={doImport} disabled={!canImport} data-testid="button-import-contracts">
                Import {preview.counts.ok} {preview.counts.ok === 1 ? "contract" : "contracts"}
              </Button>
              {!canImport && preview.counts.error + preview.problems.length > 0 && (
                <span className="text-xs text-muted-foreground">Fix the file and choose it again. Nothing is imported until every row is fine.</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
