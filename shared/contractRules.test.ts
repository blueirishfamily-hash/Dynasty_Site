import { describe, expect, it } from "vitest";
import {
  applyCapHold,
  bidTotalValue,
  canMatchRFA,
  compareBids,
  createInSeasonSigning,
  CURRENT_SEASON_CAP,
  designateRFA,
  fitsUnderCapAllSeasons,
  formatPhaseDate,
  getCurrentPhase,
  parsePhaseConfig,
  releaseCapHold,
  resolveBids,
  validateRoundResolution,
  validateTrade,
  type BidInput,
  type TeamCapInput,
} from "./contractRules";

const emptyTeam = (rosterId: number, yearSalary = 200): TeamCapInput => ({
  rosterId,
  contracts: [],
  deadCapByYear: { 2026: 0, 2027: 0 },
  capHolds: [],
});

describe("resolveBids / tie-break", () => {
  it("5yr $10 ($50) beats 2yr $24 ($48)", () => {
    const bids: BidInput[] = [
      { id: "a", rosterId: 1, playerId: "p1", bidAmount: 10, contractYears: 5, createdAt: 2 },
      { id: "b", rosterId: 2, playerId: "p1", bidAmount: 24, contractYears: 2, createdAt: 1 },
    ];
    const { winner } = resolveBids("p1", bids);
    expect(winner?.bidAmount).toBe(10);
    expect(bidTotalValue(winner!.bidAmount, winner!.contractYears)).toBe(50);
  });

  it("2yr $25 ($50) beats 5yr $10 ($50) on yearly tie-break", () => {
    const a: BidInput = { id: "a", rosterId: 1, playerId: "p1", bidAmount: 10, contractYears: 5, createdAt: 1 };
    const b: BidInput = { id: "b", rosterId: 2, playerId: "p1", bidAmount: 25, contractYears: 2, createdAt: 2 };
    expect(compareBids(b, a)).toBeLessThan(0);
    const { winner } = resolveBids("p1", [a, b]);
    expect(winner?.bidAmount).toBe(25);
  });
});

describe("validateRoundResolution", () => {
  it("cannot confirm until rejects bring every season under cap", () => {
    const team: TeamCapInput = {
      ...emptyTeam(1, 230),
      contracts: [{ playerId: "x", salaries: { 2026: 230, 2027: 200 } }],
    };
    const wins = [{ yearlySalary: 30, startYear: 2026, years: 2 }];
    const bad = validateRoundResolution(team, wins, 2026);
    expect(bad.canConfirm).toBe(false);
    const good = validateRoundResolution(team, [{ yearlySalary: 10, startYear: 2026, years: 1 }], 2026);
    expect(good.canConfirm).toBe(true);
  });
});

describe("designateRFA", () => {
  it("rejects second designation same season", () => {
    const existing = [
      { leagueId: "L", season: 2026, rosterId: 1, playerId: "a" },
    ];
    const r = designateRFA(existing, {
      leagueId: "L",
      season: 2026,
      rosterId: 1,
      playerId: "b",
      currentPhase: "tag_extension",
      isExpiringRookie: true,
    });
    expect(r.ok).toBe(false);
  });
});

describe("canMatchRFA", () => {
  it("not eligible when offer does not fit all seasons", () => {
    const team: TeamCapInput = {
      ...emptyTeam(1),
      contracts: [{ playerId: "x", salaries: { 2026: 240, 2027: 240 } }],
    };
    const offer = { yearlySalary: 20, startYear: 2026, years: 2 };
    const r = canMatchRFA(team, offer);
    expect(r.eligible).toBe(false);
    expect(r.shortSeason).toBe(2026);
  });
});

describe("cap holds", () => {
  it("hold counts then releases", () => {
    let team = emptyTeam(1);
    const hold = { playerId: "p1", yearlySalary: 15, startYear: 2026, years: 1 };
    team = applyCapHold(team, hold);
    expect(team.capHolds?.length).toBe(1);
    const fit = fitsUnderCapAllSeasons(team, [], [2026]);
    expect(fit.ok).toBe(true);
    team = releaseCapHold(team, "p1");
    expect(team.capHolds?.length).toBe(0);
  });

  it("with hold over cap when combined with base salary", () => {
    const team: TeamCapInput = {
      ...emptyTeam(1),
      contracts: [{ playerId: "x", salaries: { 2026: CURRENT_SEASON_CAP - 5 } }],
    };
    const withHold = applyCapHold(team, { playerId: "p1", yearlySalary: 10, startYear: 2026, years: 1 });
    const fit = fitsUnderCapAllSeasons(withHold, [], [2026]);
    expect(fit.ok).toBe(false);
  });
});

describe("validateTrade", () => {
  it("at cap, send 30 take 20 allowed", () => {
    const cap = CURRENT_SEASON_CAP;
    const r = validateTrade(
      { salaryBefore: cap },
      { salaryBefore: 100 },
      [{ playerId: "a", currentYearSalary: 30 }],
      [{ playerId: "b", currentYearSalary: 20 }],
    );
    expect(r.teamA.pass).toBe(true);
  });

  it("at cap, net salary add blocked", () => {
    const cap = CURRENT_SEASON_CAP;
    const r = validateTrade(
      { salaryBefore: cap },
      { salaryBefore: 100 },
      [{ playerId: "a", currentYearSalary: 10 }],
      [{ playerId: "b", currentYearSalary: 25 }],
    );
    expect(r.teamA.pass).toBe(false);
  });
});

describe("createInSeasonSigning", () => {
  it("no FAAB → $1", () => {
    const s = createInSeasonSigning(null);
    expect(s.years).toBe(1);
    expect(s.yearlySalary).toBe(1);
  });
});

describe("phase dates", () => {
  it("null dates do not crash", () => {
    const phases = parsePhaseConfig(null);
    expect(phases.length).toBe(9);
    expect(formatPhaseDate(null)).toBe("Date TBD");
    const phase = getCurrentPhase(phases, Date.now(), "fa_round_1");
    expect(phase).toBe("fa_round_1");
  });
});
