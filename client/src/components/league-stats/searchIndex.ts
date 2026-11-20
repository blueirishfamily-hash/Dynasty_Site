import type { LeagueHistory } from "@shared/leagueHistory";
import { computeRecordsBook } from "@shared/leagueHistory";
import { statsHref } from "./statsRoute";

// The League Stats search: teams and owners, seasons, record categories and (once loaded) players.

export type SearchGroup = "Teams" | "Seasons" | "Records" | "Players";

export interface SearchEntry {
  group: SearchGroup;
  label: string;
  detail?: string;
  href: string;
  /** Lower-case text the query is matched against */
  haystack: string;
}

export const SEARCH_GROUPS: SearchGroup[] = ["Teams", "Seasons", "Records", "Players"];

export function buildSearchIndex(history: LeagueHistory, players: Array<{ playerId: string; name: string; position: string | null; team: string | null }> = []): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const f of history.franchises) {
    entries.push({
      group: "Teams",
      label: f.name,
      detail: f.ownerName ?? undefined,
      href: statsHref("teams", { teamId: f.id }),
      haystack: `${f.name} ${f.ownerName ?? ""}`.toLowerCase(),
    });
  }
  for (const s of [...history.seasons].sort((a, b) => b.season.localeCompare(a.season))) {
    entries.push({
      group: "Seasons",
      label: `${s.season} season`,
      detail: s.complete ? undefined : "In progress",
      href: statsHref("standings", { season: s.season }),
      haystack: s.season,
    });
  }
  for (const c of computeRecordsBook(history)) {
    entries.push({ group: "Records", label: c.title, href: statsHref("records"), haystack: c.title.toLowerCase() });
  }
  for (const p of players) {
    entries.push({
      group: "Players",
      label: p.name,
      detail: [p.position, p.team].filter(Boolean).join(" · ") || undefined,
      href: statsHref("players"),
      haystack: p.name.toLowerCase(),
    });
  }
  return entries;
}

/** Entries whose text contains every word of the query, grouped in display order, at most `perGroup` each. */
export function searchEntries(entries: SearchEntry[], query: string, perGroup = 5): Array<{ group: SearchGroup; items: SearchEntry[] }> {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits = entries.filter((e) => words.every((w) => e.haystack.includes(w)));
  return SEARCH_GROUPS.map((group) => ({ group, items: hits.filter((e) => e.group === group).slice(0, perGroup) })).filter((g) => g.items.length > 0);
}
