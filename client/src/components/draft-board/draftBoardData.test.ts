import { describe, expect, it } from "vitest";
import {
  buildDraftCapital,
  buildFutureBoard,
  buildHistoricalBoard,
  lastName,
  ordinal,
  type BoardPick,
  type RawPick,
} from "./draftBoardData";

const owner = (initials: string) => ({ name: initials + " Team", initials });
const pick = (
  round: number,
  rosterId: number,
  cur: string,
  orig: string,
  extra: Partial<BoardPick> = {}
): BoardPick => ({
  round,
  pick: rosterId,
  rosterId,
  originalOwner: owner(orig),
  currentOwner: owner(cur),
  ...extra,
});

describe("lastName", () => {
  it("handles suffixes and single names", () => {
    expect(lastName("Marvin Harrison Jr.")).toBe("Harrison");
    expect(lastName("Kenneth Walker III")).toBe("Walker");
    expect(lastName("Brian Thomas")).toBe("Thomas");
    expect(lastName("Cher")).toBe("Cher");
    expect(lastName("")).toBe("Unknown");
  });
});

describe("buildFutureBoard", () => {
  const picks = [pick(1, 5, "AA", "BB"), pick(1, 3, "CC", "CC"), pick(2, 3, "CC", "CC")];
  it("follows draft order and marks traded picks", () => {
    const board = buildFutureBoard(picks, [3, 5, 1], 2, 3);
    expect(board).toHaveLength(2);
    expect(board[0].map((t) => t.label)).toEqual(["1.01", "1.02", "1.03"]);
    expect(board[0][0].pick?.rosterId).toBe(3);
    expect(board[0][1].viaInitials).toBe("BB");
    expect(board[0][2].pick).toBeUndefined();
    expect(board[1][0].pick?.round).toBe(2);
  });
  it("falls back to pick number when there is no order", () => {
    const board = buildFutureBoard(picks, [], 1, 6);
    expect(board[0][2].pick?.rosterId).toBe(3);
    expect(board[0][4].pick?.rosterId).toBe(5);
  });
});

describe("buildHistoricalBoard", () => {
  it("returns rounds with slot tiles", () => {
    const board = buildHistoricalBoard([pick(1, 2, "AA", "AA"), pick(2, 1, "BB", "BB")], 4);
    expect(board).toHaveLength(2);
    expect(board[0]).toHaveLength(4);
    expect(board[0][1].pick).toBeDefined();
    expect(board[1][0].pick).toBeDefined();
  });
  it("is empty with no picks", () => {
    expect(buildHistoricalBoard([], 12)).toEqual([]);
  });
});

describe("buildDraftCapital", () => {
  const names = new Map([
    [1, "Me"],
    [2, "Them"],
    [3, "Other"],
  ]);
  const raw: RawPick[] = [
    { season: "2027", round: 1, currentOwnerId: 1, originalOwnerId: 2, grade: "A" },
    { season: "2027", round: 2, currentOwnerId: 1, originalOwnerId: 1, grade: "C" },
    { season: "2027", round: 1, currentOwnerId: 3, originalOwnerId: 1, grade: "B" },
    { season: "2028", round: 1, currentOwnerId: 1, originalOwnerId: 1, grade: "B" },
  ];
  const cap = buildDraftCapital(raw, { userRosterId: 1, season: "2027", order: [2, 1, 3], names });
  it("splits this year, traded away and later years", () => {
    expect(cap.thisYear.map((p) => p.label)).toEqual(["1.01", "2.02"]);
    expect(cap.thisYear[0].via).toBe("Them");
    expect(cap.thisYear[1].via).toBeUndefined();
    expect(cap.tradedAway.map((p) => [p.label, p.to])).toEqual([["1.02", "Other"]]);
    expect(cap.later.map((p) => p.label)).toEqual(["2028 R1"]);
  });
  it("totals pick value and ranks it", () => {
    // A = 100, C = 20, B (2028) = 60 -> 180; Other holds one B = 60; Them holds none
    expect(cap.totalValue).toBe(180);
    expect(cap.rank).toBe(1);
    expect(cap.teams).toBe(3);
  });
});

describe("ordinal", () => {
  it("formats", () => {
    expect([1, 2, 3, 4, 11, 12, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "22nd",
    ]);
  });
});
