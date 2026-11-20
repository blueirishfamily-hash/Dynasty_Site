import { describe, expect, it } from "vitest";
import {
  moveKey,
  planContractMoves,
  type PlanContract,
  type PlanInput,
  type PlanTransaction,
} from "./contractMovePlanner";

const YEAR = 2026;
const SEASON_START = 1_000;
const T0 = 2_000; // a time after the regular season began

const contract = (rosterId: number, playerId: string, salaries: Record<string, number>, updatedAt = 100): PlanContract => ({
  rosterId,
  playerId,
  salaries: JSON.stringify(salaries),
  updatedAt,
});

const tx = (o: Partial<PlanTransaction> & Pick<PlanTransaction, "transaction_id" | "type">): PlanTransaction => ({
  status: "complete",
  status_updated: T0,
  adds: null,
  drops: null,
  settings: null,
  ...o,
});

function input(o: Partial<PlanInput> = {}): PlanInput {
  return {
    transactions: [],
    contracts: [],
    deadCapEntries: [],
    rosterPlayers: new Map([
      [1, new Set<string>()],
      [2, new Set<string>()],
    ]),
    teamNames: new Map([
      [1, "Team One"],
      [2, "Team Two"],
    ]),
    players: { "100": { position: "WR", name: "Wide Guy" }, "200": { position: "RB", name: "Back Guy" }, CIN: { position: "DEF", name: "Bengals" } },
    contractYear: YEAR,
    offseason: false,
    deadCap: { enabled: true, enabledAt: 500, shares: { "1": 0, "2": 0.25, "3": 0.5, "4": 0.75, "5plus": 1 } },
    seasonStart: SEASON_START,
    windowStart: SEASON_START,
    pickup: { years: 1, salary: 1 },
    salaryCap: 250,
    logged: new Map(),
    ...o,
  };
}

const planned = (i: PlanInput) => planContractMoves(i).filter((m) => m.status === "planned");

describe("trades and commissioner moves", () => {
  it("move the contract to the receiving team with no dead cap", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 60, "2027": 60 })],
        transactions: [tx({ transaction_id: "t1", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } })],
      })
    );
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: "trade_move", fromRosterId: 1, toRosterId: 2, effect: { type: "move", fromRosterId: 1, toRosterId: 2 } });
    expect(moves[0].summary).toContain("Team One to Team Two");
  });

  it("treats a commissioner transaction that drops and adds the same player as a move", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 20 })],
        transactions: [tx({ transaction_id: "c1", type: "commissioner", adds: { "100": 2 }, drops: { "100": 1 } })],
      })
    );
    expect(moves.map((m) => m.kind)).toEqual(["commissioner_move"]);
  });

  it("ignores a commissioner transaction that only adds a player", () => {
    const moves = planned(
      input({ contracts: [], transactions: [tx({ transaction_id: "c2", type: "commissioner", adds: { "100": 2 }, drops: null })] })
    );
    expect(moves).toEqual([]);
  });

  it("explains why nothing moves when there is no contract or it was already moved by hand", () => {
    const none = planContractMoves(input({ transactions: [tx({ transaction_id: "t2", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } })] }));
    expect(none[0]).toMatchObject({ status: "skipped" });
    const byHand = planContractMoves(
      input({
        contracts: [contract(2, "100", { "2026": 20 })],
        transactions: [tx({ transaction_id: "t3", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } })],
      })
    );
    expect(byHand[0].status).toBe("skipped");
    expect(byHand[0].summary).toContain("already with Team Two");
  });

  it("carries the contract through later moves in order (trade, then the new team drops him)", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 100 })],
        transactions: [
          tx({ transaction_id: "t1", type: "trade", status_updated: T0, adds: { "100": 2 }, drops: { "100": 1 } }),
          tx({ transaction_id: "d1", type: "free_agent", status_updated: T0 + 10, drops: { "100": 2 } }),
        ],
      })
    );
    expect(moves.map((m) => [m.kind, m.fromRosterId])).toEqual([
      ["trade_move", 1],
      ["drop", 2],
    ]);
    expect(moves[1].effect).toMatchObject({ type: "end", rosterId: 2, deadCapSalaries: { "2026": 100 } });
  });
});

describe("drops", () => {
  const drop = (extra: Partial<PlanInput> = {}) =>
    planned(
      input({
        contracts: [contract(1, "100", { "2026": 80, "2027": 80, "2028": 80 })],
        transactions: [tx({ transaction_id: "d1", type: "free_agent", drops: { "100": 1 } })],
        ...extra,
      })
    );

  it("ends the contract with dead cap by the league's rule when the setting is on", () => {
    const [m] = drop();
    // this season 100%; 2027 has two years left (25%), 2028 has one left (0%)
    expect(m.effect).toEqual({ type: "end", rosterId: 1, deadCapSalaries: { "2026": 80, "2027": 20 } });
  });

  it("still removes the contract when dead cap is off, with no dead cap", () => {
    const [m] = drop({ deadCap: { enabled: false, enabledAt: null, shares: { "1": 0, "2": 0.25, "3": 0.5, "4": 0.75, "5plus": 1 } } });
    expect(m.effect).toEqual({ type: "end", rosterId: 1, deadCapSalaries: null });
    expect(m.summary).toContain("setting was off");
  });

  it("counts offseason drops toward dead cap when the setting is on", () => {
    const [m] = drop({ offseason: true, seasonStart: 0, windowStart: 0 });
    expect(m.effect).toMatchObject({ type: "end", deadCapSalaries: { "2026": 80, "2027": 20 } });
  });

  it("does not charge dead cap for a drop made before the setting was turned on", () => {
    const [m] = drop({ deadCap: { enabled: true, enabledAt: T0 + 1, shares: { "1": 0, "2": 0.25, "3": 0.5, "4": 0.75, "5plus": 1 } } });
    expect(m.effect).toMatchObject({ type: "end", deadCapSalaries: null });
  });

  it("leaves an expired contract and a newer contract alone", () => {
    expect(drop({ contracts: [contract(1, "100", { "2025": 50 })] })).toEqual([]);
    expect(drop({ contracts: [contract(1, "100", { "2026": 50 }, T0 + 5)] })).toEqual([]);
  });

  it("does not repeat dead cap that was already created for the drop", () => {
    expect(drop({ deadCapEntries: [{ rosterId: 1, playerId: "100", createdAt: T0 + 1, deadCapSalaries: "{}" }] })).toEqual([]);
  });

  it("treats a commissioner drop of a player (no add) as a drop", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 30 })],
        transactions: [tx({ transaction_id: "c3", type: "commissioner", drops: { "100": 1 } })],
      })
    );
    expect(moves.map((m) => m.kind)).toEqual(["drop"]);
  });
});

describe("pickups", () => {
  const pickup = (t: Partial<PlanTransaction>, extra: Partial<PlanInput> = {}) =>
    planned(input({ transactions: [tx({ transaction_id: "p1", type: "free_agent", adds: { "100": 1 }, ...t })], ...extra }));

  it("signs a free agent pickup for $1 for one year", () => {
    const [m] = pickup({});
    expect(m.effect).toEqual({ type: "sign", rosterId: 1, salaries: { "2026": 10 }, years: 1, amount: 1, fromYear: 2026 });
  });

  it("pays the winning bid on a waiver claim", () => {
    const [m] = pickup({ type: "waiver", settings: { waiver_bid: 12 } });
    expect(m.effect).toMatchObject({ type: "sign", salaries: { "2026": 120 }, amount: 12 });
    expect(m.summary).toContain("waiver claim for $12");
  });

  it("counts a waiver bid of 0 as the $1 minimum", () => {
    const [m] = pickup({ type: "waiver", settings: { waiver_bid: 0 } });
    expect(m.effect).toMatchObject({ salaries: { "2026": 10 }, amount: 1 });
  });

  it("falls back to $1 when a waiver claim has no bid recorded", () => {
    const [m] = pickup({ type: "waiver", settings: null });
    expect(m.effect).toMatchObject({ salaries: { "2026": 10 } });
  });

  it("does nothing in the offseason or before the regular season began", () => {
    expect(pickup({}, { offseason: true })).toEqual([]);
    expect(pickup({ status_updated: SEASON_START - 1 }, { windowStart: 0 })).toEqual([]);
  });

  it("gives team defenses no pickup contract", () => {
    expect(pickup({ adds: { CIN: 1 } })).toEqual([]);
  });

  it("leaves a contract that already covers him, and keeps the past seasons of an expired one", () => {
    expect(pickup({}, { contracts: [contract(1, "100", { "2026": 30 })] })).toEqual([]);
    const [m] = pickup({}, { contracts: [contract(1, "100", { "2024": 50 })] });
    expect(m.effect).toMatchObject({ salaries: { "2024": 50, "2026": 10 } });
  });

  it("charges dead cap when a pickup is dropped later (the contract he got is a real contract)", () => {
    const moves = planned(
      input({
        transactions: [
          tx({ transaction_id: "p1", type: "free_agent", status_updated: T0, adds: { "100": 1 } }),
          tx({ transaction_id: "d1", type: "free_agent", status_updated: T0 + 5, drops: { "100": 1 } }),
        ],
      })
    );
    expect(moves.map((m) => m.kind)).toEqual(["pickup", "drop"]);
    expect(moves[1].effect).toMatchObject({ type: "end", deadCapSalaries: { "2026": 10 } });
  });

  it("uses the league's pickup contract length", () => {
    const [m] = pickup({}, { pickup: { years: 2, salary: 1 } });
    expect(m.effect).toMatchObject({ salaries: { "2026": 10, "2027": 10 }, years: 2 });
  });
});

describe("the move log", () => {
  const trade = tx({ transaction_id: "t1", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } });
  const base = { contracts: [contract(1, "100", { "2026": 60 })], transactions: [trade] };

  it("does not replan applied, rejected or other settled transactions", () => {
    for (const state of ["applied", "rejected", "skipped", "failed"]) {
      expect(planned(input({ ...base, logged: new Map([[moveKey("t1", "100", "trade_move"), state]]) }))).toEqual([]);
    }
  });

  it("does not emit a proposed move again, but plans what follows as if it had happened", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 60 })],
        transactions: [trade, tx({ transaction_id: "d1", type: "free_agent", status_updated: T0 + 5, drops: { "100": 2 } })],
        logged: new Map([[moveKey("t1", "100", "trade_move"), "proposed"]]),
      })
    );
    expect(moves.map((m) => m.kind)).toEqual(["drop"]);
    expect(moves[0].fromRosterId).toBe(2);
  });

  it("only looks at transactions inside the window", () => {
    expect(planned(input({ ...base, windowStart: T0 + 1 }))).toEqual([]);
  });

  it("ignores transactions that did not complete", () => {
    expect(planned(input({ contracts: base.contracts, transactions: [{ ...trade, status: "failed" }] }))).toEqual([]);
  });
});

describe("over the cap", () => {
  it("flags the team that received a contract and went over", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 400 }), contract(2, "200", { "2026": 2200 })],
        rosterPlayers: new Map([
          [1, new Set<string>()],
          [2, new Set(["100", "200"])],
        ]),
        transactions: [tx({ transaction_id: "t1", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } })],
      })
    );
    expect(moves[0].flags).toHaveLength(1);
    expect(moves[0].flags[0]).toMatchObject({ type: "over_cap", rosterId: 2, teamName: "Team Two", year: 2026, total: 260, cap: 250 });
  });

  it("flags a team that goes over because of dead cap from its own drop", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 100 }), contract(1, "200", { "2026": 2450 })],
        rosterPlayers: new Map([[1, new Set(["200"])]]),
        transactions: [tx({ transaction_id: "d1", type: "free_agent", drops: { "100": 1 } })],
      })
    );
    // $245M of salary on the roster plus $10M of new dead cap
    expect(moves[0].flags.map((f) => [f.rosterId, f.year, f.total])).toEqual([[1, 2026, 255]]);
  });

  it("does not flag a team that stays under the cap", () => {
    const moves = planned(
      input({
        contracts: [contract(1, "100", { "2026": 100 })],
        rosterPlayers: new Map([[2, new Set(["100"])]]),
        transactions: [tx({ transaction_id: "t1", type: "trade", adds: { "100": 2 }, drops: { "100": 1 } })],
      })
    );
    expect(moves[0].flags).toEqual([]);
  });
});
