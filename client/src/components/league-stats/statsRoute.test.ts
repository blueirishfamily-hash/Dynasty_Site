import { describe, expect, it } from "vitest";
import type { HistoryGame, HistorySeason, LeagueHistory } from "@shared/leagueHistory";
import { ALL_TIME, legacyStatsTarget, parseStatsLocation, resolveSeason, scopeHistory, seasonsBadge, statsHref, statsHrefs } from "./statsRoute";

describe("parseStatsLocation", () => {
  it("defaults to the overview and all time", () => {
    expect(parseStatsLocation("/stats")).toEqual({ tab: "overview", season: ALL_TIME });
    expect(parseStatsLocation("/stats/", "")).toEqual({ tab: "overview", season: ALL_TIME });
  });

  it("reads the tab and the season filter", () => {
    expect(parseStatsLocation("/stats/standings", "?season=2025")).toEqual({ tab: "standings", season: "2025" });
    expect(parseStatsLocation("/stats/records", "season=all")).toEqual({ tab: "records", season: "all" });
  });

  it("reads a team, a matchup pair and a player", () => {
    expect(parseStatsLocation("/stats/teams/123").teamId).toBe("123");
    expect(parseStatsLocation("/stats/teams/roster-5").teamId).toBe("roster-5");
    expect(parseStatsLocation("/stats/matchups/12/34")).toMatchObject({ tab: "matchups", a: "12", b: "34" });
    expect(parseStatsLocation("/stats/matchups/12").a).toBeUndefined(); // a pair needs both teams
    expect(parseStatsLocation("/stats/players/4046")).toMatchObject({ tab: "players", playerId: "4046" });
  });

  it("works with a league address in front and with encoded ids", () => {
    expect(parseStatsLocation("/l/atl-dynasty/stats/teams/a%2Fb").teamId).toBe("a/b");
    expect(parseStatsLocation("/stats/teams/%E0%A4%A").teamId).toBe("%E0%A4%A"); // bad encoding is kept as typed
  });

  it("falls back to the overview for an unknown tab", () => {
    expect(parseStatsLocation("/stats/nonsense").tab).toBe("overview");
  });
});

describe("statsHref", () => {
  it("builds the address of each tab", () => {
    expect(statsHref("overview")).toBe("/stats");
    expect(statsHref("standings")).toBe("/stats/standings");
    expect(statsHref("teams", { teamId: "roster-5" })).toBe("/stats/teams/roster-5");
    expect(statsHref("matchups", { a: "1", b: "2" })).toBe("/stats/matchups/1/2");
    expect(statsHref("players", { playerId: "4046" })).toBe("/stats/players/4046");
  });

  it("keeps the season filter, and leaves it out for all time", () => {
    expect(statsHref("drafts", { season: "2024" })).toBe("/stats/drafts?season=2024");
    expect(statsHref("drafts", { season: "all" })).toBe("/stats/drafts");
    expect(statsHref("teams", { teamId: "9", season: "2025" })).toBe("/stats/teams/9?season=2025");
  });

  it("round-trips through the parser", () => {
    const href = statsHref("matchups", { a: "x y", b: "z/1", season: "2023" });
    const [path, query] = href.split("?");
    expect(parseStatsLocation(path, query)).toEqual({ tab: "matchups", season: "2023", a: "x y", b: "z/1" });
  });
});

describe("resolveSeason", () => {
  it("accepts a season the league has and falls back to all time otherwise", () => {
    expect(resolveSeason("2025", ["2023", "2024", "2025"])).toBe("2025");
    expect(resolveSeason("1999", ["2023"])).toBe(ALL_TIME);
    expect(resolveSeason("", ["2023"])).toBe(ALL_TIME);
    expect(resolveSeason(null, ["2023"])).toBe(ALL_TIME);
    expect(resolveSeason("all", ["2023"])).toBe(ALL_TIME);
  });
});

describe("seasonsBadge", () => {
  it("summarizes the seasons covered", () => {
    expect(seasonsBadge(["2025", "2023", "2024", "2026"])).toBe("2023 to 2026 · 4 seasons");
    expect(seasonsBadge(["2024"])).toBe("2024 · 1 season");
    expect(seasonsBadge([])).toBe("No seasons yet");
  });
});

describe("scopeHistory", () => {
  const season = (s: string): HistorySeason => ({
    season: s, leagueId: `L${s}`, complete: s !== "2026", playoffWeekStart: 15, playoffTeams: 6, teams: [], championId: null, runnerUpId: null, thirdId: null,
  });
  const game = (s: string, week: number): HistoryGame => ({ season: s, week, kind: "regular", a: "1", b: "2", scoreA: 100, scoreB: 90 });
  const history: LeagueHistory = {
    leagueName: "L",
    generatedAt: "now",
    franchises: [],
    seasons: [season("2024"), season("2025"), season("2026")],
    games: [game("2024", 1), game("2025", 1), game("2025", 2), game("2026", 1)],
  };

  it("returns the whole history for all time", () => {
    expect(scopeHistory(history, ALL_TIME)).toBe(history);
  });

  it("limits seasons and games to the chosen season and keeps the franchises", () => {
    const scoped = scopeHistory(history, "2025");
    expect(scoped.seasons.map((s) => s.season)).toEqual(["2025"]);
    expect(scoped.games).toHaveLength(2);
    expect(scoped.franchises).toBe(history.franchises);
  });

  it("gives an empty scope for a season that is not there", () => {
    const scoped = scopeHistory(history, "1999");
    expect(scoped.seasons).toEqual([]);
    expect(scoped.games).toEqual([]);
  });
});

describe("statsHrefs", () => {
  it("points the history views at League Stats and keeps the season", () => {
    const h = statsHrefs("2025");
    expect(h.overview()).toBe("/stats?season=2025");
    expect(h.team("9")).toBe("/stats/teams/9?season=2025");
    expect(h.matchup("1", "2")).toBe("/stats/matchups/1/2?season=2025");
    expect(h.season("2024")).toBe("/stats/standings?season=2024"); // a season link switches the season
    expect(statsHrefs("all").teams()).toBe("/stats/teams");
  });
});

describe("legacyStatsTarget", () => {
  it("maps old League History addresses to League Stats", () => {
    expect(legacyStatsTarget("/history")).toBe("/stats");
    expect(legacyStatsTarget("/history/seasons/2025")).toBe("/stats/standings?season=2025");
    expect(legacyStatsTarget("/history/teams")).toBe("/stats/teams");
    expect(legacyStatsTarget("/history/teams/u1")).toBe("/stats/teams/u1");
    expect(legacyStatsTarget("/history/matchups")).toBe("/stats/matchups");
    expect(legacyStatsTarget("/history/matchups/a/b")).toBe("/stats/matchups/a/b");
  });
  it("sends the old Historical page to the overview", () => {
    expect(legacyStatsTarget("/historical")).toBe("/stats");
  });
});
