import { Badge } from "@/components/ui/badge";
import type { CapitalPick } from "./draftBoardData";

interface DraftHeroProps {
  year: number;
  rounds: number;
  teams: number;
  picks: CapitalPick[];
}

export function DraftHero({ year, rounds, teams, picks }: DraftHeroProps) {
  return (
    <section
      aria-label={`${year} rookie draft`}
      className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
    >
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold">{year} rookie draft</h2>
        <p className="text-sm text-muted-foreground">
          Order projected from playoff odds. {rounds} rounds, {teams} teams.
        </p>
      </div>
      {picks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Your picks">
          <span className="text-xs text-muted-foreground mr-1">Your picks</span>
          {picks.map((p) => (
            <Badge
              key={p.key}
              className="bg-primary/20 text-primary border border-primary/40 hover:bg-primary/20"
              title={p.via ? `${p.label} via ${p.via}` : `${p.label} (own pick)`}
            >
              {p.label}
              {p.via && <span className="ml-1 text-[10px] opacity-80">via {p.via}</span>}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}
