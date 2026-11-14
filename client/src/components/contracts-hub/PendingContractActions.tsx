import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Loader2, X } from "lucide-react";
import {
  extensionSalaries,
  pendingSalaryEffects,
  tagSalary,
  type PendingExtensionLike,
  type PendingTag,
  type SalaryContract,
} from "./pendingContracts";

interface PanelContract extends SalaryContract {
  rosterId: number;
  contractThrough: number | null;
}

interface PanelDeadCap {
  rosterId: number;
  deadCapSalaries: string;
}

type Row = {
  key: string;
  kind: "extension" | "tag";
  id?: string;
  playerId: string;
  playerName: string;
  position?: string;
  label: string;
  years: string;
  salaries: Record<number, number>;
};

const money = (v: number) => `$${v.toFixed(1)}`;

/** Expected rookie contracts for a team's picks in the upcoming rookie draft. Shown for awareness, not counted. */
export interface DraftCapitalEstimate {
  total: number;
  picks: Array<{ round: number; slot: number; salary: number }>;
  /** "sleeper" when the commissioner has set the draft order, "projected" when it comes from the draft odds. */
  source: "sleeper" | "projected";
}

function salaryText(salaries: Record<number, number>) {
  const values = Object.values(salaries);
  if (values.length === 0) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

export function PendingContractActionsPanel({
  leagueId,
  userId,
  rosterId,
  currentYear,
  cap,
  extensions,
  pendingTags,
  onRemoveTag,
  parsedContracts,
  positionOf,
  deadCapEntries,
  projectionYear,
  windowOpen,
  draftCapital = null,
  className = "",
}: {
  leagueId: string;
  userId: string;
  rosterId: number;
  currentYear: number;
  cap: number;
  extensions: PendingExtensionLike[];
  pendingTags: PendingTag[];
  onRemoveTag: (rosterId: number, playerId: string) => void;
  parsedContracts: PanelContract[];
  positionOf: (playerId: string) => string | undefined;
  deadCapEntries: PanelDeadCap[];
  /** The next season with no games played; the projection is for this season. */
  projectionYear: number;
  /** True while tags and extensions can be submitted (regular season, through Week 14). */
  windowOpen: boolean;
  /** From the rollover until the rookie draft: the team's expected rookie contracts (purple, outside the cap). */
  draftCapital?: DraftCapitalEstimate | null;
  className?: string;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const nextYear = projectionYear;

  const rows: Row[] = useMemo(() => {
    const extRows: Row[] = extensions
      .filter(e => e.rosterId === rosterId && e.status === "pending")
      .map(e => ({
        key: `ext-${e.id}`,
        kind: "extension" as const,
        id: e.id,
        playerId: e.playerId,
        playerName: e.playerName,
        label: `${e.extensionType}-year extension`,
        years: e.extensionType > 1 ? `${e.extensionYear}–${e.extensionYear + e.extensionType - 1}` : String(e.extensionYear),
        salaries: extensionSalaries(e),
      }));
    const tagRows: Row[] = pendingTags
      .filter(t => t.rosterId === rosterId)
      .map(t => {
        const contract = parsedContracts.find(c => c.rosterId === rosterId && c.playerId === t.playerId);
        const tagYear = (contract?.contractThrough ?? currentYear) + 1;
        return {
          key: `tag-${t.playerId}`,
          kind: "tag" as const,
          playerId: t.playerId,
          playerName: t.playerName,
          position: t.position,
          label: `Franchise tag (top-5 ${t.position} average)`,
          years: String(tagYear),
          salaries: { [tagYear]: tagSalary(t.position, currentYear, parsedContracts, positionOf) },
        };
      });
    return [...extRows, ...tagRows];
  }, [extensions, pendingTags, rosterId, parsedContracts, currentYear, positionOf]);

  // Next-season salary with the pending contracts added to what is already on the books.
  const projection = useMemo(() => {
    // A submitted extension replaces the rest of that player's current contract, so that salary comes off.
    const effects = pendingSalaryEffects(
      rosterId,
      extensions,
      [],
      parsedContracts,
      currentYear,
      positionOf,
    );
    const committed =
      parsedContracts
        .filter(c => c.rosterId === rosterId)
        .reduce((sum, c) => sum + (c.parsedSalaries[nextYear] || 0), 0) - (effects.replaced[nextYear] || 0);
    const dead = deadCapEntries
      .filter(d => d.rosterId === rosterId)
      .reduce((sum, d) => {
        try {
          return sum + (Number(JSON.parse(d.deadCapSalaries || "{}")[String(nextYear)]) || 0) / 10;
        } catch {
          return sum;
        }
      }, 0);
    const pendingExt = rows.filter(r => r.kind === "extension").reduce((s, r) => s + (r.salaries[nextYear] || 0), 0);
    const pendingTag = rows.filter(r => r.kind === "tag").reduce((s, r) => s + (r.salaries[nextYear] || 0), 0);
    const total = committed + dead + pendingExt + pendingTag;
    return { committed, dead, pendingExt, pendingTag, total, space: cap - total };
  }, [parsedContracts, deadCapEntries, rows, rosterId, nextYear, cap, extensions, currentYear, positionOf]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "extensions", String(currentYear)] });
  };

  const approve = useMutation({
    mutationFn: async (items: Row[]) => {
      const done: Row[] = [];
      const failed: { name: string; message: string }[] = [];
      for (const item of items) {
        try {
          const res =
            item.kind === "extension"
              ? await fetch(`/api/league/${leagueId}/extensions/${item.id}/confirm`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ rosterId }),
                })
              : await fetch(`/api/league/${leagueId}/franchise-tag`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId, rosterId, playerId: item.playerId, position: item.position }),
                });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || "Could not save");
          }
          done.push(item);
        } catch (e) {
          failed.push({ name: item.playerName, message: (e as Error).message });
        }
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      done.filter(i => i.kind === "tag").forEach(i => onRemoveTag(rosterId, i.playerId));
      setSelected(new Set());
      refresh();
      if (done.length > 0) {
        toast({ title: `${done.length} contract${done.length === 1 ? "" : "s"} saved`, description: "Submitted and saved as official." });
      }
      if (failed.length > 0) {
        toast({
          title: `${failed.length} could not be saved`,
          description: failed.map(f => `${f.name}: ${f.message}`).join(" · "),
          variant: "destructive",
        });
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      if (row.kind === "tag") {
        onRemoveTag(rosterId, row.playerId);
        return;
      }
      const res = await fetch(`/api/league/${leagueId}/extensions/pending/${row.id}?rosterId=${rosterId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove");
      }
    },
    onSuccess: () => refresh(),
    onError: (e: Error) => toast({ title: "Could not remove", description: e.message, variant: "destructive" }),
  });

  const toggle = (key: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedRows = rows.filter(r => selected.has(r.key));
  const over = projection.total > cap;
  const lines = [
    { label: "Already on the books", value: projection.committed, pending: false },
    { label: "Dead cap", value: projection.dead, pending: false },
    { label: "Pending extensions", value: projection.pendingExt, pending: true },
    { label: "Pending tag", value: projection.pendingTag, pending: true },
  ];
  const pendingTotal = projection.pendingExt + projection.pendingTag;
  const deadPct = Math.min(100, (projection.dead / cap) * 100);
  const bookedPct = Math.max(0, Math.min(100 - deadPct, ((projection.total - pendingTotal - projection.dead) / cap) * 100));
  const pendingPct = Math.max(0, Math.min(100 - bookedPct - deadPct, (pendingTotal / cap) * 100));
  const draftTotal = draftCapital?.total ?? 0;
  const draftPct = Math.max(0, Math.min(100 - bookedPct - deadPct - pendingPct, (draftTotal / cap) * 100));

  return (
    <Card className={className}>
      <CardContent className="py-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Pending contracts</span>
              {rows.length > 0 && (
                <Badge variant="outline" className="border-amber-500/50 text-amber-600">{rows.length} not saved</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Extensions and tags stay here until you submit them. Submitting makes them official. No commissioner approval is needed.
            </p>
          </div>
          {rows.length > 0 && windowOpen && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedRows.length === 0 || approve.isPending}
                onClick={() => approve.mutate(selectedRows)}
              >
                Submit selected ({selectedRows.length})
              </Button>
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(rows)}>
                {approve.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Submit all ({rows.length})
              </Button>
            </div>
          )}
        </div>

        {!windowOpen && (
          <p className="text-sm text-muted-foreground">
            Tags and extensions open during the regular season and close after Week 14.
          </p>
        )}
        {rows.length === 0 ? (
          windowOpen && (
            <p className="text-sm text-muted-foreground">
              Nothing pending. Open a player card and apply an extension or tag to add one here.
            </p>
          )
        ) : (
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.key} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <Checkbox
                  checked={selected.has(row.key)}
                  onCheckedChange={() => toggle(row.key)}
                  aria-label={`Select ${row.playerName}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{row.playerName}</div>
                  <div className="text-xs text-muted-foreground">{row.label} · {row.years}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{salaryText(row.salaries)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">per year</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Remove ${row.playerName}`}
                  disabled={remove.isPending || approve.isPending}
                  onClick={() => remove.mutate(row)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{nextYear} salary projection</span>
            <span className="text-xs text-muted-foreground">Cap {money(cap)}</span>
          </div>
          <div className={`grid grid-cols-2 gap-3 ${draftCapital ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
            {lines.map(line => (
              <div key={line.label}>
                <div className={`text-xs ${line.pending ? "text-blue-500" : "text-muted-foreground"}`}>{line.label}</div>
                <div className={`text-sm font-semibold ${line.pending && line.value > 0 ? "text-blue-500" : ""}`}>{money(line.value)}</div>
              </div>
            ))}
            {draftCapital && (
              <div>
                <div className="text-xs text-purple-500">Draft picks (est.)</div>
                <div className={`text-sm font-semibold ${draftTotal > 0 ? "text-purple-500" : ""}`}>{money(draftTotal)}</div>
              </div>
            )}
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden flex">
            <div
              className={`h-full ${over ? "bg-orange-600" : "bg-emerald-500"}`}
              style={{ width: `${bookedPct}%` }}
            />
            {projection.dead > 0 && <div className="h-full bg-red-500" style={{ width: `${deadPct}%` }} />}
            <div className="h-full bg-blue-500" style={{ width: `${pendingPct}%` }} />
            {draftCapital && <div className="h-full bg-purple-500/70" style={{ width: `${draftPct}%` }} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />Saved</span>
            {projection.dead > 0 && (
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" />Dead cap</span>
            )}
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-500" />Pending submission</span>
            {draftCapital && (
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-purple-500/70" />Rookie draft picks, not counted toward the cap</span>
            )}
          </div>
          {draftCapital && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {draftCapital.picks.length === 0
                ? `No picks in the ${nextYear} rookie draft.`
                : `${draftCapital.picks
                    .slice()
                    .sort((a, b) => a.round - b.round || a.slot - b.slot)
                    .map(p => `${p.round}.${String(p.slot).padStart(2, "0")} ${money(p.salary)}`)
                    .join(" · ")} — ${draftCapital.source === "sleeper" ? "official draft slots" : "slots projected from the draft odds"}.`}
            </p>
          )}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-heading text-xl font-semibold">{money(projection.total)}</span>
            <span className={`text-sm ${over ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
              {over ? `${money(-projection.space)} over the cap` : `${money(projection.space)} of cap space`}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
