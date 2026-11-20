import { describe, expect, it } from "vitest";
import {
  calculateSalaryCapImpactWithOpponent,
  compareTradeValue,
  type ContractDataStore,
  type Player,
} from "./tradeMath";

const player = (id: string, tradeValue: number): Player => ({
  id,
  name: id,
  position: "WR",
  team: "XXX",
  tradeValue,
});

describe("compareTradeValue", () => {
  it("calls near-equal sides even", () => {
    const r = compareTradeValue(
      { players: [player("a", 80)], picks: [] },
      { players: [player("b", 82)], picks: [] }
    );
    expect(r.label).toBe("Even trade");
    expect(r.bias).toBe(0.5);
  });

  it("flags overpaying and caps the bar", () => {
    const r = compareTradeValue(
      { players: [player("a", 90), player("c", 90)], picks: [] },
      { players: [player("b", 20)], picks: [] }
    );
    expect(r.label).toBe("You are overpaying");
    expect(r.bias).toBeCloseTo(0.1);
    expect(r.giveTotal).toBe(180);
    expect(r.getTotal).toBe(20);
  });

  it("flags a better deal and values picks by grade", () => {
    const r = compareTradeValue(
      { players: [], picks: [{ id: "k", year: 2027, round: 2, grade: "C" }] },
      { players: [], picks: [{ id: "j", year: 2027, round: 1, grade: "A+" }] }
    );
    expect(r.label).toBe("You are getting the better deal");
    expect(r.giveTotal).toBe(20);
    expect(r.getTotal).toBe(120);
  });
});

describe("calculateSalaryCapImpactWithOpponent", () => {
  const contract = (salaries: Record<number, number>) => ({
    salaries,
    fifthYearOption: null,
    isOnIr: false,
    originalContractYears: 2,
  });
  const store: ContractDataStore = {
    "1": { mine: contract({ 2026: 10, 2027: 10 }) },
    "2": { theirs: contract({ 2026: 30, 2027: 30 }) },
  };

  it("moves salary between teams and keeps dead cap on the sender", () => {
    const r = calculateSalaryCapImpactWithOpponent(
      ["mine"], ["theirs"], ["theirs"], ["mine"],
      1, 2, store, 2026, [2026, 2027], true
    );
    // User: -10 + 100% dead cap (current year) + 30 incoming = +30 in 2026
    expect(r.userImpact[0].netChange).toBe(30);
    // Opponent: -30 + 100% dead cap (30) + 10 incoming = +10 in 2026
    expect(r.opponentImpact[0].netChange).toBe(10);
  });

  it("pushes a season over the cap when incoming salary is large", () => {
    const r = calculateSalaryCapImpactWithOpponent(
      [], ["theirs"], [], [], 1, 2, store, 2026, [2026], false
    );
    const current = 240;
    expect(current + r.userImpact[0].netChange).toBeGreaterThan(250);
  });
});
