import { describe, expect, it } from "vitest";
import type { HistoryGame, LeagueHistory } from "../shared/leagueHistory";
import { headToHeadForMatchups } from "../shared/weeklyReportHistory";

const g = (season: string, week: number, a: string, b: string, scoreA: number, scoreB: number, kind: HistoryGame["kind"] = "regular"): HistoryGame => ({
  season, week, kind, a, b, scoreA, scoreB,
});

const history = (games: HistoryGame[]): LeagueHistory => ({ leagueName: "L", generatedAt: "", franchises: [], seasons: [], games });
const m = (a: number, b: number) => ({ a: { rosterId: a }, b: { rosterId: b } }) as any;
const map = new Map<number, string>([[1, "u1"], [2, "u2"], [3, "u3"], [4, "roster-4"]]);

describe("headToHeadForMatchups", () => {
  it("builds the series across seasons, whichever side each team was on", () => {
    const h = history([
      g("2023", 3, "u1", "u2", 100, 90),
      g("2024", 5, "u2", "u1", 120, 110),
      g("2025", 9, "u1", "u2", 130, 105, "playoff"),
    ]);
    const [r] = headToHeadForMatchups(h, [m(1, 2)], map);
    expect(r).toMatchObject({ aWins: 2, bWins: 1, ties: 0, meetings: 3, seasonsCovered: 3, streak: 1 });
    expect(r!.aPoints).toBe(340);
    expect(r!.bPoints).toBe(315);
    expect(r!.last).toMatchObject({ season: "2025", week: 9, aScore: 130, bScore: 105 });
  });

  it("orients the last meeting to team A when A was listed second", () => {
    const h = history([g("2024", 5, "u2", "u1", 120, 110)]);
    const [r] = headToHeadForMatchups(h, [m(1, 2)], map);
    expect(r!.last).toMatchObject({ aScore: 110, bScore: 120 });
    expect(r!.bWins).toBe(1);
    expect(r!.streak).toBe(-1);
  });

  it("counts ties and resets the streak", () => {
    const h = history([g("2023", 1, "u1", "u2", 100, 90), g("2023", 8, "u1", "u2", 100, 100)]);
    const [r] = headToHeadForMatchups(h, [m(1, 2)], map);
    expect(r).toMatchObject({ aWins: 1, ties: 1, streak: 0 });
  });

  it("excludes consolation games", () => {
    const h = history([g("2024", 15, "u1", "u2", 100, 90, "consolation"), g("2024", 4, "u1", "u2", 90, 100)]);
    const [r] = headToHeadForMatchups(h, [m(1, 2)], map);
    expect(r).toMatchObject({ meetings: 1, aWins: 0, bWins: 1 });
  });

  it("reports no meetings for teams that never met", () => {
    const h = history([g("2024", 4, "u1", "u3", 90, 100)]);
    const [r] = headToHeadForMatchups(h, [m(1, 2)], map);
    expect(r).toMatchObject({ meetings: 0, aWins: 0, bWins: 0 });
    expect(r!.last).toBeNull();
  });

  it("works for an unowned roster", () => {
    const h = history([g("2024", 4, "roster-4", "u1", 90, 100)]);
    const [r] = headToHeadForMatchups(h, [m(4, 1)], map);
    expect(r).toMatchObject({ meetings: 1, aWins: 0, bWins: 1 });
  });

  it("returns null when a roster has no franchise", () => {
    const [r] = headToHeadForMatchups(history([]), [m(1, 99)], map);
    expect(r).toBeNull();
  });
});
