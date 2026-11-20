import { describe, expect, it } from "vitest";
import { mvpCandidates, positionTopWeeks, type WeekMatchup } from "./awardCandidates";

const pos: Record<string, string> = { q1: "QB", q2: "QB", r1: "RB", r2: "RB", k1: "K" };
const week = (pts: Record<string, number>): WeekMatchup[] => [{ players: Object.keys(pts), players_points: pts }];

describe("positionTopWeeks", () => {
  it("counts the weeks a player ranked in the top N at his own position", () => {
    const weeks = [week({ q1: 30, q2: 10, r1: 5 }), week({ q1: 8, q2: 20, r1: 6 }), week({ q1: 25, q2: 24, r1: 7 })];
    const stats = positionTopWeeks(weeks, (id) => pos[id], ["QB", "RB"], 1);
    expect(stats.get("q1")?.topWeeks).toBe(2);
    expect(stats.get("q2")?.topWeeks).toBe(1);
    // r1 is the only RB, so he leads every week regardless of his low score
    expect(stats.get("r1")?.topWeeks).toBe(3);
  });

  it("totals points and games and gives points per game", () => {
    const stats = positionTopWeeks([week({ q1: 20 }), week({ q1: 10 })], (id) => pos[id], ["QB"], 12);
    expect(stats.get("q1")).toEqual({ topWeeks: 2, points: 30, games: 2, ppg: 15 });
  });

  it("shares a rank on ties and skips unlisted positions", () => {
    const stats = positionTopWeeks([week({ q1: 10, q2: 10, k1: 12 })], (id) => pos[id], ["QB"], 1);
    expect(stats.get("q1")?.topWeeks).toBe(1);
    expect(stats.get("q2")?.topWeeks).toBe(1);
    expect(stats.has("k1")).toBe(false);
  });
});

describe("mvpCandidates", () => {
  it("keeps players with at least the minimum top weeks", () => {
    const stats = new Map([
      ["a", { topWeeks: 3, points: 90, games: 5, ppg: 18 }],
      ["b", { topWeeks: 2, points: 80, games: 5, ppg: 16 }],
    ]);
    expect(Array.from(mvpCandidates(stats, 3).keys())).toEqual(["a"]);
  });
});
