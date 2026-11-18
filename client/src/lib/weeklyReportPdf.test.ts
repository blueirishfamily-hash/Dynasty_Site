import { describe, expect, it } from "vitest";
import type { PreviewMatchup, TeamRef } from "@shared/weeklyReport";
import { favorite, h2hSeries, pctText } from "./weeklyReportPdf";

const team = (rosterId: number, name: string) => ({ rosterId, name }) as unknown as TeamRef;
const game = (probA: number) => ({ a: team(1, "Alpha"), b: team(2, "Bravo"), probA }) as unknown as PreviewMatchup;

describe("favorite", () => {
  it("names team A when A is more likely to win", () => {
    const f = favorite(game(0.62));
    expect(f.isA).toBe(true);
    expect(f.team.name).toBe("Alpha");
    expect(f.pct).toBeCloseTo(62);
    expect(f.even).toBe(false);
  });

  it("names team B when B is more likely to win, with B's chance", () => {
    const f = favorite(game(0.3));
    expect(f.isA).toBe(false);
    expect(f.team.name).toBe("Bravo");
    expect(f.pct).toBeCloseTo(70);
  });

  it("calls an exact 50/50 even", () => {
    const f = favorite(game(0.5));
    expect(f.even).toBe(true);
    expect(f.pct).toBe(50);
  });

  it("handles certain outcomes", () => {
    expect(favorite(game(1)).pct).toBe(100);
    const f = favorite(game(0));
    expect(f.team.name).toBe("Bravo");
    expect(f.pct).toBe(100);
  });
});

describe("h2hSeries", () => {
  const withHistory = (aWins: number, bWins: number, ties: number) =>
    ({ a: team(1, "Alpha"), b: team(2, "Bravo"), probA: 0.5, history: { aWins, bWins, ties, aPoints: 0, bPoints: 0, streak: 0, meetings: aWins + bWins + ties, seasonsCovered: 1, last: null } }) as unknown as PreviewMatchup;
  it("names the leader", () => expect(h2hSeries(withHistory(4, 7, 0))).toBe("Bravo lead 7-4"));
  it("adds ties", () => expect(h2hSeries(withHistory(7, 4, 1))).toBe("Alpha lead 7-4-1"));
  it("reports tied series", () => expect(h2hSeries(withHistory(5, 5, 0))).toBe("Tied 5-5"));
  it("reports a first meeting", () => expect(h2hSeries(withHistory(0, 0, 0))).toBe("First meeting"));
});

describe("pctText", () => {
  it("caps near-certain and near-zero values", () => {
    expect(pctText(99.98)).toBe(">99.9%");
    expect(pctText(0.01)).toBe("<0.1%");
  });
  it("uses 2 decimals otherwise, with exact 100 and 0 kept", () => {
    expect(pctText(91.6)).toBe("91.60%");
    expect(pctText(99.9)).toBe("99.90%");
    expect(pctText(100)).toBe("100.00%");
    expect(pctText(0)).toBe("0.00%");
  });
});
