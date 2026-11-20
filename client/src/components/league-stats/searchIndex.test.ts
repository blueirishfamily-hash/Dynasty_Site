import { describe, expect, it } from "vitest";
import type { LeagueHistory } from "@shared/leagueHistory";
import { buildSearchIndex, searchEntries } from "./searchIndex";

const history = {
  leagueName: "L",
  generatedAt: "",
  franchises: [
    { id: "u1", name: "PRISON BALL", initials: "PB", avatar: null, ownerName: "Sam Jones" },
    { id: "u2", name: "All Ws", initials: "AW", avatar: null, ownerName: "Pat Lee" },
  ],
  seasons: [
    { season: "2024", leagueId: "a", complete: true, playoffWeekStart: 15, playoffTeams: 6, teams: [], championId: null },
    { season: "2025", leagueId: "b", complete: false, playoffWeekStart: 15, playoffTeams: 6, teams: [], championId: null },
  ],
  games: [],
} as unknown as LeagueHistory;

describe("league stats search", () => {
  const index = buildSearchIndex(history, [{ playerId: "1", name: "Josh Allen", position: "QB", team: "BUF" }]);

  it("finds a team by team name or owner name", () => {
    expect(searchEntries(index, "prison")[0].items[0].href).toBe("/stats/teams/u1");
    expect(searchEntries(index, "pat lee")[0].items[0].label).toBe("All Ws");
  });

  it("finds a season and sends it to that season's standings", () => {
    const groups = searchEntries(index, "2025");
    expect(groups[0].group).toBe("Seasons");
    expect(groups[0].items[0].href).toBe("/stats/standings?season=2025");
    expect(groups[0].items[0].detail).toBe("In progress");
  });

  it("finds players and groups results in order", () => {
    const groups = searchEntries(index, "allen");
    expect(groups.map((g) => g.group)).toEqual(["Players"]);
    expect(groups[0].items[0].detail).toBe("QB · BUF");
  });

  it("returns nothing for an empty or unmatched query", () => {
    expect(searchEntries(index, "  ")).toEqual([]);
    expect(searchEntries(index, "zzzz")).toEqual([]);
  });
});
