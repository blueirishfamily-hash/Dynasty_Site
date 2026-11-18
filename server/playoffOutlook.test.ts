import { describe, it, expect } from "vitest";
import { byesFor, simulateOutlook, type OutlookInput, type OutlookSchedule } from "./playoffOutlook";

// 12 teams, 9 weeks played, 5 left. Team 1 is far ahead, team 12 far behind.
function makeInput(overrides: Partial<OutlookInput> = {}): OutlookInput {
  const wins = [9, 7, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2];
  const teams = wins.map((w, i) => ({
    rosterId: i + 1,
    wins: w,
    losses: 9 - w,
    pointsFor: 1500 - i * 35,
    mean: 120 - i * 2,
    std: 20,
  }));
  const schedule: OutlookSchedule = {};
  for (let wk = 10; wk <= 14; wk++) {
    const ids = teams.map((t) => t.rosterId);
    const rest = ids.slice(1);
    for (let r = 0; r < (wk * 3) % 11; r++) rest.push(rest.shift()!);
    const line = [1, ...rest];
    schedule[wk] = [];
    for (let k = 0; k < 6; k++) schedule[wk].push([line[k], line[11 - k]]);
  }
  return {
    teams,
    playoffTeams: 7,
    regularSeasonWeeks: 14,
    firstRemainingWeek: 10,
    schedule,
    h2h: () => 0,
    sims: 2000,
    ...overrides,
  };
}

describe("byesFor", () => {
  it("gives byes to fill a power-of-two bracket", () => {
    expect(byesFor(6)).toBe(2);
    expect(byesFor(7)).toBe(1);
    expect(byesFor(8)).toBe(0);
    expect(byesFor(4)).toBe(0);
  });
});

describe("simulateOutlook", () => {
  it("fills exactly the playoff spots and the byes in every simulation", () => {
    const r = simulateOutlook(makeInput());
    const made = r.teams.reduce((s, t) => s + t.makePlayoffsPct, 0);
    const bye = r.teams.reduce((s, t) => s + t.byePct, 0);
    expect(made).toBeGreaterThan(699);
    expect(made).toBeLessThan(701);
    expect(bye).toBeGreaterThan(99);
    expect(bye).toBeLessThan(101);
  });

  it("gives every team seed odds that add up to 100", () => {
    const r = simulateOutlook(makeInput());
    for (const t of r.teams) {
      const total = t.seedPct.reduce((s, v) => s + v, 0);
      expect(total).toBeGreaterThan(99);
      expect(total).toBeLessThan(101);
    }
  });

  it("gives the same numbers every time for the same input", () => {
    const a = simulateOutlook(makeInput());
    const b = simulateOutlook(makeInput());
    expect(a.teams.map((t) => t.makePlayoffsPct)).toEqual(b.teams.map((t) => t.makePlayoffsPct));
  });

  it("rates the best team above the worst", () => {
    const r = simulateOutlook(makeInput());
    expect(r.teams[0].makePlayoffsPct).toBeGreaterThan(r.teams[11].makePlayoffsPct);
  });

  it("reports clinched and eliminated teams from wins alone", () => {
    // Team 1 has 20 wins with 1 game left, everyone else has at most 3 wins: clinched with the bye.
    const input = makeInput();
    input.teams.forEach((t, i) => {
      t.wins = i === 0 ? 13 : 2;
      t.losses = 0;
    });
    input.firstRemainingWeek = 14;
    const r = simulateOutlook({ ...input, sims: 500 });
    expect(r.teams[0].clinchedPlayoffs).toBe(true);
    expect(r.teams[0].clinchedBye).toBe(true);
    expect(r.teams[0].magic).toBe(0);
  });

  it("builds leverage for the user from the real schedule", () => {
    const r = simulateOutlook(makeInput({ userRosterId: 5 }));
    expect(r.user).not.toBeNull();
    expect(r.user!.ownGame).not.toBeNull();
    expect(r.user!.ownGame!.oddsIfWin).toBeGreaterThanOrEqual(r.user!.ownGame!.oddsIfLose);
    expect(r.user!.bestCasePct).toBeGreaterThanOrEqual(r.user!.worstCasePct);
    // The user's own game is not repeated in the "root for" list, and the other five games are.
    expect(r.user!.leverage.length).toBeLessThanOrEqual(5);
    for (const g of r.user!.leverage) {
      expect(g.teamA === 5 || g.teamB === 5).toBe(false);
      expect(g.oddsIfRootWins).toBeGreaterThanOrEqual(g.oddsIfRootLoses - 0.001);
    }
  });
});
