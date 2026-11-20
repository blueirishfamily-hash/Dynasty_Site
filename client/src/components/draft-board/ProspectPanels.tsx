import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, Pencil, Search, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProspectCard } from "@/components/ProspectCard";
import type { ProspectEnriched } from "@/lib/draftProspectMetrics";

export const PROSPECT_POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/90 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500/90 text-white",
  TE: "bg-orange-500/90 text-white",
};

const posClass = (pos?: string | null) => (pos && PROSPECT_POSITION_COLORS[pos]) || "bg-muted text-muted-foreground";

export interface IdealRow {
  pickLabel: string;
  pickNum: number;
  grade?: string;
  via?: string;
  prospect: ProspectEnriched | null;
}

/** "Ideal prospect per pick": one best-fit prospect for each of the user's picks. */
export function IdealPicksCard({
  rows,
  onSelect,
}: {
  rows: IdealRow[];
  onSelect: (p: ProspectEnriched) => void;
}) {
  return (
    <aside aria-label="Ideal prospect per pick" className="rounded-lg border border-border bg-card p-4 min-w-0">
      <h2 className="font-heading text-base font-semibold">Ideal prospect per pick</h2>
      <p className="text-xs text-muted-foreground mb-3">
        In range of the pick, and a position of need when possible.
      </p>
      <ul className="space-y-2">
        {rows.map(({ pickLabel, pickNum, grade, via, prospect }) => (
          <li key={pickNum} className="rounded-md border border-primary/30 bg-primary/10 p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{pickLabel}</span>
              {grade && (
                <Badge variant="outline" className="text-[10px] px-1.5 border-primary/50 text-primary">
                  {grade}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground truncate">{via ? `via ${via}` : "Own pick"}</span>
            </div>
            {prospect ? (
              <button
                type="button"
                onClick={() => onSelect(prospect)}
                className="flex w-full items-center gap-2 text-left rounded-sm hover:bg-primary/10 min-h-[32px]"
              >
                {prospect.position && <Badge className={`text-[10px] px-1.5 ${posClass(prospect.position)}`}>{prospect.position}</Badge>}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{prospect.displayName}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    ADP {prospect.adp != null ? Number(prospect.adp).toFixed(1) : "—"}
                    {prospect.school ? ` · ${prospect.school}` : ""}
                  </span>
                </span>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">No prospect in range</p>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

const FILTERS = ["all", "QB", "RB", "WR", "TE"] as const;

interface ProspectListProps {
  prospects: ProspectEnriched[];
  selectedId: string | null;
  /** Whether the detail panel is shown beside the list (otherwise tapping opens a dialog) */
  inlineDetail: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  position: string;
  onPositionChange: (v: string) => void;
  isIdeal: (p: ProspectEnriched) => boolean;
  onSelect: (p: ProspectEnriched) => void;
  headerAction: ReactNode;
  description: ReactNode;
}

export function ProspectList({
  prospects,
  selectedId,
  inlineDetail,
  search,
  onSearchChange,
  position,
  onPositionChange,
  isIdeal,
  onSelect,
  headerAction,
  description,
}: ProspectListProps) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Prospects</CardTitle>
          {headerAction}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search prospects..."
            aria-label="Search prospects"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Position filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={position === f}
              onClick={() => onPositionChange(f)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                position === f ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <ul className="max-h-[560px] overflow-y-auto space-y-1 pr-1">
          {prospects.map((p) => {
            const selected = inlineDetail && p.id === selectedId;
            const ideal = isIdeal(p);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  aria-pressed={inlineDetail ? selected : undefined}
                  data-testid={`prospect-row-${p.id}`}
                  className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 min-h-[44px] py-1.5 text-left transition-colors ${
                    selected
                      ? "bg-primary/25 border-primary ring-1 ring-primary/60"
                      : ideal
                        ? "bg-primary/5 border-transparent hover:bg-primary/10"
                        : "bg-muted/30 border-transparent hover:bg-muted/50"
                  }`}
                >
                  <span className="font-mono text-sm text-muted-foreground w-6 shrink-0">{p.rank}</span>
                  {p.position && (
                    <Badge className={`text-[10px] px-1.5 shrink-0 ${posClass(p.position)}`}>{p.position}</Badge>
                  )}
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{p.displayName}</span>
                  {ideal && (
                    <Star className="w-3.5 h-3.5 shrink-0 fill-current text-primary" aria-label="Ideal pick" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    {p.adp != null ? Number(p.adp).toFixed(1) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
          {prospects.length === 0 && (
            <li className="text-sm text-muted-foreground text-center py-8">No prospects match</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

interface ProspectDetailPanelProps {
  prospect: ProspectEnriched | null;
  allProspects: ProspectEnriched[];
  inRange: boolean;
  isCommissioner: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProspectDetailPanel({
  prospect,
  allProspects,
  inRange,
  isCommissioner,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: ProspectDetailPanelProps) {
  if (!prospect) {
    return (
      <Card className="min-w-0">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Select a prospect to see combine, RAS, advanced stats and notes.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="min-w-0 overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      {(inRange || isCommissioner) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-4 py-2">
          <div>
            {inRange && (
              <Badge className="bg-primary/20 text-primary border border-primary/40 hover:bg-primary/20">
                In your range
              </Badge>
            )}
          </div>
          {isCommissioner && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Move ${prospect.displayName} up`}
                onClick={onMoveUp}
                disabled={!canMoveUp}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Move ${prospect.displayName} down`}
                onClick={onMoveDown}
                disabled={!canMoveDown}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
      <ProspectCard prospect={prospect} allProspects={allProspects} compact />
    </Card>
  );
}
