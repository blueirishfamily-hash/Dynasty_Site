import { describe, expect, it } from "vitest";
import { isSupportedBracket, normalCdf, simulateBracketPicks, winProbability, type BracketTeam } from "./draftBracketSim";

function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const team = (rosterId: number, mean: number, sd = 20): BracketTeam => ({ rosterId, mean, sd });
// Seed 1 is clearly the strongest, then declining
const seven = [1, 2, 3, 4, 5, 6, 7].map((id) => team(id, 180 - id * 6));
const six = seven.slice(0, 6);

function tally(seeded: BracketTeam[], firstPick: number, runs: number) {
  const rand = lcg(2024);
  const counts = new Map<number, number[]>();
  seeded.forEach((t) => counts.set(t.rosterId, new Array(firstPick + seeded.length).fill(0)));
  for (let i = 0; i < runs; i++) {
    const picks = simulateBracketPicks(seeded, firstPick, rand)!;
    picks.forEach((pick, id) => counts.get(id)![pick]++);
  }
  return counts;
}

describe("win probability", () => {
  it("is even for equal teams and favors the stronger one", () => {
    expect(winProbability(team(1, 150), team(2, 150))).toBeCloseTo(0.5);
    expect(winProbability(team(1, 175), team(2, 150))).toBeGreaterThan(0.7);
    expect(winProbability(team(1, 175), team(2, 150))).toBeLessThan(0.9);
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
  });
});

describe("simulateBracketPicks", () => {
  it("gives every playoff team its own pick in the playoff range", () => {
    const rand = lcg(1);
    for (let i = 0; i < 500; i++) {
      const picks = simulateBracketPicks(seven, 5, rand)!;
      expect(Array.from(picks.values()).sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10, 11]);
      const picks6 = simulateBracketPicks(six, 6, rand)!;
      expect(Array.from(picks6.values()).sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 11]);
    }
  });

  it("returns null for bracket sizes it does not model", () => {
    expect(simulateBracketPicks([1, 2, 3, 4, 5].map((i) => team(i, 150)), 7)).toBeNull();
    expect(isSupportedBracket(7)).toBe(true);
    expect(isSupportedBracket(8)).toBe(false);
  });

  it("never gives the bye team a first-round loser pick", () => {
    const counts = tally(seven, 5, 4000).get(1)!;
    expect(counts[5] + counts[6] + counts[7]).toBe(0); // picks 6, 7, 8
  });

  it("lets the top seed finish with pick 9 (loses the semifinal and the third-place game) as well as 10, 11 and 12", () => {
    const counts = tally(seven, 5, 20000).get(1)!;
    expect(counts[8]).toBeGreaterThan(0); // pick 9
    expect(counts[9]).toBeGreaterThan(0); // pick 10
    expect(counts[10]).toBeGreaterThan(0);
    expect(counts[11]).toBeGreaterThan(counts[10]); // strongest team wins the title most often
  });

  it("makes a stronger team more likely to win the title", () => {
    const c = tally(seven, 5, 20000);
    expect(c.get(1)![11]).toBeGreaterThan(c.get(4)![11]);
    expect(c.get(4)![11]).toBeGreaterThan(c.get(7)![11]);
  });

  it("with equal teams, seeds still decide the bye and the bracket path", () => {
    const equal = [1, 2, 3, 4, 5, 6, 7].map((id) => team(id, 150));
    const c = tally(equal, 5, 20000);
    // The bye team can only finish picks 9 to 12 with roughly even odds for each
    const bye = c.get(1)!;
    for (const pick of [8, 9, 10, 11]) expect(bye[pick] / 20000).toBeGreaterThan(0.15);
    // A first-round team can finish anywhere
    expect(c.get(7)![5] + c.get(7)![6] + c.get(7)![7]).toBeGreaterThan(0);
  });
});
