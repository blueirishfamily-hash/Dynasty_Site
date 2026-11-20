import { describe, expect, it } from "vitest";
import { SHRINK_WEEKS, drawFinalMaxPf, projectFinalMaxPf, randomNormal } from "./maxPfProjection";

const team = (rosterId: number, weekly: number[]) => ({ rosterId, weekly });

describe("projectFinalMaxPf", () => {
  it("is exactly the current Max PF when no weeks are left", () => {
    const m = projectFinalMaxPf([team(1, [100, 110, 120]), team(2, [90, 95, 100])], 3);
    expect(m.get(1)).toEqual({ rosterId: 1, current: 330, mean: 330, sd: 0 });
    expect(m.get(2)).toMatchObject({ current: 285, mean: 285, sd: 0 });
  });

  it("adds the remaining weeks at a blended weekly average", () => {
    const teams = [team(1, [100, 100, 100, 100]), team(2, [200, 200, 200, 200])];
    const m = projectFinalMaxPf(teams, 6); // 2 weeks left
    const leagueMean = 150;
    const blended1 = (4 * 100 + SHRINK_WEEKS * leagueMean) / (4 + SHRINK_WEEKS);
    expect(m.get(1)!.current).toBe(400);
    expect(m.get(1)!.mean).toBeCloseTo(400 + 2 * blended1);
    // pulled toward the league average, but the stronger team still projects higher
    expect(blended1).toBeGreaterThan(100);
    expect(m.get(2)!.mean).toBeGreaterThan(m.get(1)!.mean);
  });

  it("uses a shared weekly spread that grows with the weeks left", () => {
    const teams = [team(1, [90, 110, 100, 120]), team(2, [150, 130, 140, 160])];
    const a = projectFinalMaxPf(teams, 6).get(1)!.sd;
    const b = projectFinalMaxPf(teams, 8).get(1)!.sd;
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeCloseTo(Math.sqrt(4 / 2));
    expect(projectFinalMaxPf(teams, 8).get(2)!.sd).toBeCloseTo(b);
  });

  it("handles a team with no games yet and an empty league", () => {
    const m = projectFinalMaxPf([team(1, [100, 100]), team(2, [])], 4);
    expect(m.get(2)!.current).toBe(0);
    expect(m.get(2)!.mean).toBeCloseTo(4 * 100);
    expect(projectFinalMaxPf([], 4).size).toBe(0);
    expect(projectFinalMaxPf([team(1, [])], 4).get(1)).toEqual({ rosterId: 1, current: 0, mean: 0, sd: 0 });
  });

  it("makes a 50 point gap with four weeks left a real but unlikely flip", () => {
    // Two teams at a similar level; weekly spread about 14
    const lo = [85, 120, 80, 115, 100, 125, 90, 110, 95, 105];
    const hi = lo.map((x) => x + 5); // 50 points higher over 10 weeks
    const m = projectFinalMaxPf([team(1, lo), team(2, hi)], 14);
    const a = m.get(1)!;
    const b = m.get(2)!;
    let flips = 0;
    let seed = 12345;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const n = 20000;
    for (let i = 0; i < n; i++) {
      if (drawFinalMaxPf(a, randomNormal(rand)) > drawFinalMaxPf(b, randomNormal(rand))) flips++;
    }
    const pct = (flips / n) * 100;
    expect(pct).toBeGreaterThan(1);
    expect(pct).toBeLessThan(20);
  });
});

describe("randomNormal", () => {
  it("has roughly zero mean and unit spread", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const xs = Array.from({ length: 20000 }, () => randomNormal(rand));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(sd).toBeGreaterThan(0.95);
    expect(sd).toBeLessThan(1.05);
  });
});
