// Per-league parameters in the shared contract rules (phase 3).
import { describe, expect, it } from "vitest";
import {
  checkContractLengthLimits,
  createInSeasonSigning,
  deadCapForEndedContract,
  validateRoundResolution,
  validateTradeSide,
  type TeamCapInput,
} from "./contractRules";
import { atlDynastyRules } from "./leagueRules";

const limits = atlDynastyRules().contractLengthLimits; // 2yr 5, 3yr 4, 4+yr 3

/** A team with `n` non-rookie contracts of `years` seasons from 2026, $10M a year. */
function team(groups: Array<{ n: number; years: number; rookie?: boolean }>): TeamCapInput {
  const contracts: TeamCapInput["contracts"] = [];
  let id = 0;
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      const salaries: Record<number, number> = {};
      for (let y = 0; y < g.years; y++) salaries[2026 + y] = 10;
      contracts.push({ playerId: `p${id++}`, salaries, isRookieContract: g.rookie ? 1 : 0 });
    }
  }
  return { rosterId: 1, contracts, deadCapByYear: {} };
}

describe("checkContractLengthLimits", () => {
  it("counts non-rookie contracts by years left and flags buckets over the limit", () => {
    const t = team([{ n: 3, years: 4 }, { n: 2, years: 4, rookie: true }]);
    expect(checkContractLengthLimits(t, [], 2026, limits).ok).toBe(true);
    const over = checkContractLengthLimits(t, [{ playerId: "new", yearlySalary: 5, startYear: 2026, years: 5 }], 2026, limits);
    expect(over.ok).toBe(false);
    expect(over.counts.fourPlusYear).toBe(4);
    expect(over.reason).toBe("Over the contract-length limit: 4 4+ year contracts (limit 3)");
  });

  it("doesn't count a player twice when the new contract replaces his old one", () => {
    const t = team([{ n: 3, years: 4 }]);
    const re = checkContractLengthLimits(t, [{ playerId: "p0", yearlySalary: 5, startYear: 2026, years: 4 }], 2026, limits);
    expect(re.ok).toBe(true);
  });

  it("uses the league's limits", () => {
    const t = team([{ n: 2, years: 2 }]);
    expect(checkContractLengthLimits(t, [], 2026, { ...limits, twoYear: 1 }).ok).toBe(false);
  });
});

describe("validateRoundResolution with league rules", () => {
  it("can't confirm wins over a length limit even when they fit under the cap", () => {
    const t = team([{ n: 3, years: 3 }]);
    const wins = [{ playerId: "a", yearlySalary: 1, startYear: 2026, years: 3 }, { playerId: "b", yearlySalary: 1, startYear: 2026, years: 3 }];
    const r = validateRoundResolution(t, wins, 2026, 250, limits);
    expect(r.canConfirm).toBe(false);
    expect(r.lengthCheck?.over).toEqual([{ label: "3-year", count: 5, limit: 4 }]);
    // Declining one win brings the team back within the limit.
    expect(validateRoundResolution(t, wins.slice(0, 1), 2026, 250, limits).canConfirm).toBe(true);
  });

  it("uses the league's cap", () => {
    const t = team([{ n: 2, years: 1 }]); // $20M committed
    const win = [{ playerId: "a", yearlySalary: 15, startYear: 2026, years: 1 }];
    expect(validateRoundResolution(t, win, 2026, 40).canConfirm).toBe(true);
    expect(validateRoundResolution(t, win, 2026, 30).canConfirm).toBe(false);
  });
});

describe("other per-league parameters", () => {
  it("dead cap uses the league's shares by years left", () => {
    const salaries = { "2026": 100, "2027": 100, "2028": 100 };
    expect(deadCapForEndedContract(salaries, 2026)).toEqual({ "2026": 100, "2027": 25 });
    const shares = { "1": 0.1, "2": 0.5, "3": 1, "4": 1, "5plus": 1 };
    expect(deadCapForEndedContract(salaries, 2026, shares)).toEqual({ "2026": 100, "2027": 50, "2028": 10 });
  });

  it("the pickup contract follows the league's terms", () => {
    expect(createInSeasonSigning(30)).toMatchObject({ years: 1, yearlySalary: 1 });
    expect(createInSeasonSigning(30, { years: 2, salary: 1.5 })).toMatchObject({ years: 2, yearlySalary: 1.5 });
  });

  it("trades check the league's cap", () => {
    const sends = [{ playerId: "a", currentYearSalary: 5 }];
    const receives = [{ playerId: "b", currentYearSalary: 10 }];
    expect(validateTradeSide(246, sends, receives).pass).toBe(false); // 251 > 250 cap
    expect(validateTradeSide(246, sends, receives, 260).pass).toBe(true);
  });
});
