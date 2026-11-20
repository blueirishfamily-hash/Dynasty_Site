import type { LeagueHistory } from "@shared/leagueHistory";
import type { HistoryHrefs } from "@/components/history/common";

// URL state for the League Stats page. The tab is in the path and the season filter is in the query string
// (?season=2025, or no season for all time), so links can be shared and the back button works.
//
//   /stats                      overview             /stats/players        (+ /:player)
//   /stats/standings            standings            /stats/drafts
//   /stats/teams  (+ /:team)    teams                /stats/transactions
//   /stats/matchups (+ /:a/:b)  matchups             /stats/records

export type StatsTab = "overview" | "standings" | "teams" | "matchups" | "players" | "drafts" | "transactions" | "records";

export const ALL_TIME = "all";

export const STATS_TABS: { id: StatsTab; label: string; segment: string }[] = [
  { id: "overview", label: "Overview", segment: "" },
  { id: "standings", label: "Standings", segment: "standings" },
  { id: "teams", label: "Teams", segment: "teams" },
  { id: "matchups", label: "Matchups", segment: "matchups" },
  { id: "players", label: "Players", segment: "players" },
  { id: "drafts", label: "Drafts", segment: "drafts" },
  { id: "transactions", label: "Transactions", segment: "transactions" },
  { id: "records", label: "Records", segment: "records" },
];

export interface StatsLocation {
  tab: StatsTab;
  /** "all" or a season such as "2025". Not checked against the available seasons here; see resolveSeason. */
  season: string;
  teamId?: string;
  /** Matchups: the two teams */
  a?: string;
  b?: string;
  playerId?: string;
}

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Reads the tab, the optional team, pair or player, and the season out of a path and query string. */
export function parseStatsLocation(pathname: string, search = ""): StatsLocation {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("stats");
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const season = params.get("season")?.trim() || ALL_TIME;

  const tab = STATS_TABS.find((t) => t.segment === (rest[0] ?? "") && t.segment !== "")?.id ?? "overview";
  const location: StatsLocation = { tab, season };
  if (tab === "teams" && rest[1]) location.teamId = safeDecode(rest[1]);
  if (tab === "matchups" && rest[1] && rest[2]) {
    location.a = safeDecode(rest[1]);
    location.b = safeDecode(rest[2]);
  }
  if (tab === "players" && rest[1]) location.playerId = safeDecode(rest[1]);
  return location;
}

export interface StatsHrefOptions {
  season?: string;
  teamId?: string;
  a?: string;
  b?: string;
  playerId?: string;
}

/** The address of a tab (and optional team, pair or player), carrying the season filter. */
export function statsHref(tab: StatsTab, opts: StatsHrefOptions = {}): string {
  const segment = STATS_TABS.find((t) => t.id === tab)?.segment ?? "";
  let path = segment ? `/stats/${segment}` : "/stats";
  if (tab === "teams" && opts.teamId) path += `/${encodeURIComponent(opts.teamId)}`;
  if (tab === "matchups" && opts.a && opts.b) path += `/${encodeURIComponent(opts.a)}/${encodeURIComponent(opts.b)}`;
  if (tab === "players" && opts.playerId) path += `/${encodeURIComponent(opts.playerId)}`;
  const season = opts.season && opts.season !== ALL_TIME ? opts.season : null;
  return season ? `${path}?season=${encodeURIComponent(season)}` : path;
}

/** The season to use: the asked-for one if the league has it, otherwise all time. */
export function resolveSeason(raw: string | null | undefined, available: string[]): string {
  if (!raw || raw === ALL_TIME) return ALL_TIME;
  return available.includes(raw) ? raw : ALL_TIME;
}

/** "2023 to 2026 · 4 seasons" for the header badge. */
export function seasonsBadge(seasons: string[]): string {
  if (seasons.length === 0) return "No seasons yet";
  const sorted = [...seasons].sort();
  const count = `${sorted.length} ${sorted.length === 1 ? "season" : "seasons"}`;
  return sorted.length === 1 ? `${sorted[0]} · ${count}` : `${sorted[0]} to ${sorted[sorted.length - 1]} · ${count}`;
}

/**
 * The history limited to one season (or the whole history for "all"). Every History calculation (franchise totals,
 * records book, head to head) then answers for that season alone.
 */
export function scopeHistory(history: LeagueHistory, season: string): LeagueHistory {
  if (season === ALL_TIME) return history;
  return {
    ...history,
    seasons: history.seasons.filter((s) => s.season === season),
    games: history.games.filter((g) => g.season === season),
  };
}

/** Where the shared history views link to inside League Stats, carrying the season filter. */
export function statsHrefs(season: string): HistoryHrefs {
  return {
    overview: () => statsHref("overview", { season }),
    // A season card or link opens that season's standings.
    season: (s) => statsHref("standings", { season: s }),
    teams: () => statsHref("teams", { season }),
    team: (id) => statsHref("teams", { teamId: id, season }),
    matchups: () => statsHref("matchups", { season }),
    matchup: (a, b) => statsHref("matchups", { a, b, season }),
  };
}

/**
 * Where an old League History address (/history, /history/seasons/2025, /history/teams/<id>,
 * /history/matchups/<a>/<b>) now lives. The old Historical page (/historical) goes to the overview.
 */
export function legacyStatsTarget(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "history") return "/stats";
  if (parts[1] === "seasons" && parts[2]) return `/stats/standings?season=${encodeURIComponent(safeDecode(parts[2]))}`;
  if (parts[1] === "teams") return parts[2] ? `/stats/teams/${parts[2]}` : "/stats/teams";
  if (parts[1] === "matchups") return parts[2] && parts[3] ? `/stats/matchups/${parts[2]}/${parts[3]}` : "/stats/matchups";
  return "/stats";
}
