import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ordinal, type DraftCapital } from "./draftBoardData";

interface DraftCapitalCardProps {
  capital: DraftCapital | null;
  year: number;
  loading?: boolean;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">{children}</h3>
  );
}

export function DraftCapitalCard({ capital, year, loading }: DraftCapitalCardProps) {
  return (
    <aside aria-label="Your draft capital" className="rounded-lg border border-border bg-card p-4 min-w-0">
      <h2 className="font-heading text-base font-semibold mb-3">Your draft capital</h2>

      {loading || !capital ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
          <div>
            <SectionTitle>{year} picks</SectionTitle>
            {capital.thisYear.length > 0 ? (
              <ul className="space-y-1">
                {capital.thisYear.map((p) => (
                  <li
                    key={p.key}
                    className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5"
                  >
                    <span className="font-mono text-sm font-medium w-10 shrink-0">{p.label}</span>
                    <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                      {p.via ? `via ${p.via}` : "Own pick"}
                    </span>
                    {p.grade && (
                      <Badge variant="outline" className="text-[10px] px-1.5 border-primary/50 text-primary">
                        {p.grade}
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground shrink-0">~{p.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No picks in {year}</p>
            )}
          </div>

          <div className="space-y-4">
            {capital.tradedAway.length > 0 && (
              <div>
                <SectionTitle>Traded away</SectionTitle>
                <ul className="space-y-1 text-sm">
                  {capital.tradedAway.map((p) => (
                    <li key={p.key} className="flex items-center gap-2 min-w-0">
                      <span className="font-mono w-10 shrink-0">{p.label}</span>
                      <span className="text-xs text-muted-foreground truncate">to {p.to}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {capital.later.length > 0 && (
              <div>
                <SectionTitle>Later years</SectionTitle>
                <ul className="space-y-1 text-sm">
                  {capital.later.map((p) => (
                    <li key={p.key} className="flex items-center gap-2 min-w-0">
                      <span className="font-mono shrink-0">{p.label}</span>
                      {p.via && <span className="text-xs text-muted-foreground truncate">via {p.via}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {capital.rank != null && (
            <div className="rounded-md bg-muted/40 p-3 self-start">
              <SectionTitle>Total pick value</SectionTitle>
              <p className="text-xl font-semibold font-mono">{Math.round(capital.totalValue)}</p>
              <p className="text-xs text-muted-foreground">
                {ordinal(capital.rank)} of {capital.teams} teams
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
