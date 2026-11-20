import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSleeper } from "@/lib/sleeper-context";
import type { LeagueHistory } from "@shared/leagueHistory";
import { buildSearchIndex, searchEntries } from "./searchIndex";

/**
 * Search across teams, owners, seasons, record categories and players. The player names come from the all-time
 * player leaders, so they are only requested once the person has typed enough to want them.
 */
export default function StatsSearch({ history }: { history: LeagueHistory }) {
  const { league } = useSleeper();
  const [query, setQuery] = useState("");
  const wantsPlayers = query.trim().length >= 3;

  const { data: players } = useQuery<{ leaders: Array<{ playerId: string; name: string; position: string | null; team: string | null }> }>({
    queryKey: ["/api/league", league?.leagueId, "stats", "players", "all"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/stats/players?season=all`);
      if (!res.ok) throw new Error("Failed to load players");
      return res.json();
    },
    enabled: !!league?.leagueId && wantsPlayers,
    staleTime: 5 * 60 * 1000,
  });

  const index = useMemo(() => buildSearchIndex(history, players?.leaders ?? []), [history, players]);
  const groups = useMemo(() => searchEntries(index, query), [index, query]);

  return (
    <div className="relative w-full sm:w-72" data-testid="stats-search">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search teams, seasons, players"
        aria-label="Search League Stats"
        className="pl-8"
      />
      {query.trim() && (
        <div className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-popover p-2 shadow-md" data-testid="stats-search-results">
          {groups.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {wantsPlayers && !players ? "Searching players..." : "No matches."}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.group} className="mb-1">
              <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{g.group}</div>
              {g.items.map((item) => (
                <Link
                  key={`${item.group}-${item.href}-${item.label}`}
                  href={item.href}
                  onClick={() => setQuery("")}
                  className="flex items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{item.label}</span>
                  {item.detail && <span className="shrink-0 text-xs text-muted-foreground">{item.detail}</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
