import { describe, expect, it } from "vitest";
import {
  adpInRangeOfAnyPick,
  adpInRangeOfPick,
  filterProspects,
  idealProspectForPick,
  normalizePosition,
} from "./prospectList";

const p = (displayName: string, position: string, adp: number | null, rank: number) => ({
  displayName,
  position,
  adp,
  rank,
});

describe("normalizePosition", () => {
  it("strips digits and case", () => {
    expect(normalizePosition(" wr12 ")).toBe("WR");
    expect(normalizePosition(null)).toBe("");
  });
});

describe("adp range", () => {
  it("is within two picks either way", () => {
    expect(adpInRangeOfPick(8, 10)).toBe(true);
    expect(adpInRangeOfPick(12, 10)).toBe(true);
    expect(adpInRangeOfPick(12.5, 10)).toBe(false);
    expect(adpInRangeOfPick(null, 10)).toBe(false);
  });
  it("checks any of several picks", () => {
    expect(adpInRangeOfAnyPick(25, [8, 20, 32])).toBe(false);
    expect(adpInRangeOfAnyPick(21, [8, 20, 32])).toBe(true);
  });
});

describe("idealProspectForPick", () => {
  const board = [
    p("Close WR", "WR", 8, 8),
    p("Need RB", "RB", 10, 10),
    p("Need RB closer", "RB", 9, 9),
    p("Far QB", "QB", 30, 30),
  ];
  it("prefers positions of need, then the closest ADP", () => {
    expect(idealProspectForPick(board, 9, new Set(["RB"]))?.displayName).toBe("Need RB closer");
  });
  it("falls back to the closest ADP when nothing fits a need", () => {
    expect(idealProspectForPick(board, 8, new Set(["TE"]))?.displayName).toBe("Close WR");
  });
  it("returns null when nothing is in range", () => {
    expect(idealProspectForPick(board, 20, new Set(["RB"]))).toBeNull();
  });
});

describe("filterProspects", () => {
  const board = [p("Ashton Jeanty", "RB", 1, 1), p("Tetairoa McMillan", "WR", 2, 2)];
  it("filters by position and name", () => {
    expect(filterProspects(board, { search: "", position: "WR" })).toHaveLength(1);
    expect(filterProspects(board, { search: "jean", position: "all" })[0].displayName).toBe("Ashton Jeanty");
    expect(filterProspects(board, { search: "zzz", position: "all" })).toHaveLength(0);
  });
});
