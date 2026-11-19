import { describe, expect, it } from "vitest";
import {
  matchRankingsToProspects,
  normalizeName,
  normalizeSchool,
  parseRankingsText,
  splitLine,
  validateRankings,
  type RankingRow,
} from "./prospectRankings";

const row = (rank: number, name: string, extra: Partial<RankingRow> = {}): RankingRow => ({
  rank,
  playerName: name,
  nameKey: normalizeName(name),
  position: null,
  school: null,
  sourceValue: null,
  adp: null,
  ...extra,
});

const board = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1, `Player ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}`));

describe("normalizeName", () => {
  it("drops suffixes, punctuation and accents", () => {
    expect(normalizeName("Marvin Harrison Jr.")).toBe("marvin harrison");
    expect(normalizeName("Kenneth Walker III")).toBe("kenneth walker");
    expect(normalizeName("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amon ra st brown");
    expect(normalizeName("José Ramírez")).toBe("jose ramirez");
  });
  it("keeps a name that is only a suffix-like word", () => {
    expect(normalizeName("V")).toBe("v");
  });
});

describe("normalizeSchool", () => {
  it("treats common spellings as equal", () => {
    expect(normalizeSchool("Ohio State")).toBe(normalizeSchool("Ohio St."));
    expect(normalizeSchool("University of Texas")).toBe(normalizeSchool("Texas"));
  });
});

describe("splitLine", () => {
  it("handles commas, tabs, pipes and quotes", () => {
    expect(splitLine('1,"Smith, John",RB')).toEqual(["1", "Smith, John", "RB"]);
    expect(splitLine("1\tJohn Smith\tRB")).toEqual(["1", "John Smith", "RB"]);
    expect(splitLine("1 | John Smith | RB")).toEqual(["1", "John Smith", "RB"]);
  });
});

describe("parseRankingsText", () => {
  it("parses a header row in any column order", () => {
    const r = parseRankingsText("Player,Rank,Pos,School,Pick Value\nAshton Jeanty,1,RB,Boise State,1.01 - 4193");
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ rank: 1, playerName: "Ashton Jeanty", position: "RB", school: "Boise State", sourceValue: "1.01 - 4193" });
  });
  it("parses positional columns without a header", () => {
    const r = parseRankingsText("1\tAshton Jeanty\tRB\tBoise State\t4,193");
    expect(r.rows[0].playerName).toBe("Ashton Jeanty");
  });
  it("reads an ADP column when there is one", () => {
    const r = parseRankingsText("rank,name,adp\n1,Ashton Jeanty,1.8");
    expect(r.rows[0].adp).toBe(1.8);
  });
  it("reports lines that miss a rank or name", () => {
    const r = parseRankingsText("1,Ashton Jeanty\nTetairoa McMillan");
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Line 2/);
  });
  it("rejects empty input and headers without rank or name", () => {
    expect(parseRankingsText("   ").errors).toHaveLength(1);
    expect(parseRankingsText("player,school\nA,B").errors[0]).toMatch(/rank and name/);
  });
});

describe("validateRankings", () => {
  it("accepts a clean board", () => {
    expect(validateRankings(board(40))).toEqual([]);
  });
  it("rejects too few or too many rows", () => {
    expect(validateRankings(board(5))[0]).toMatch(/at least 20/);
    expect(validateRankings(board(301)).join(" ")).toMatch(/at most 300/);
  });
  it("rejects duplicate ranks", () => {
    const rows = board(30);
    rows[5] = row(3, "Someone Else");
    expect(validateRankings(rows).join(" ")).toMatch(/Duplicate ranks: 3/);
  });
  it("rejects gaps and boards that do not start at 1", () => {
    const gap = board(30).filter((r) => r.rank !== 10);
    expect(validateRankings(gap).join(" ")).toMatch(/missing 10/);
    const shifted = board(25).map((r) => ({ ...r, rank: r.rank + 1 }));
    expect(validateRankings(shifted).join(" ")).toMatch(/1 to 25/);
  });
  it("rejects a missing name and a repeated player", () => {
    const rows = board(30);
    rows[0] = { ...rows[0], playerName: " ", nameKey: "" };
    expect(validateRankings(rows).join(" ")).toMatch(/no name/);
    const twice = board(30);
    twice[1] = row(2, "player a0");
    expect(validateRankings(twice).join(" ")).toMatch(/appears twice/);
  });
});

describe("matchRankingsToProspects", () => {
  const prospects = [
    { id: "p1", displayName: "Marvin Harrison Jr.", school: "Ohio State" },
    { id: "p2", displayName: "Kenneth Walker", school: "Michigan State" },
    { id: "p3", displayName: "Chris Johnson", school: "Texas" },
    { id: "p4", displayName: "Chris Johnson", school: "Oregon" },
  ];
  it("matches across suffixes and apostrophes", () => {
    const r = matchRankingsToProspects([row(1, "Marvin Harrison"), row(2, "Kenneth Walker III")], prospects);
    expect(r.matches.map((m) => m.prospectId)).toEqual(["p1", "p2"]);
    expect(r.unmatched).toEqual([]);
  });
  it("uses the school to choose between same-name prospects", () => {
    const r = matchRankingsToProspects([row(1, "Chris Johnson", { school: "Oregon" })], prospects);
    expect(r.matches[0].prospectId).toBe("p4");
  });
  it("still matches a single candidate when the school disagrees", () => {
    const r = matchRankingsToProspects([row(1, "Kenneth Walker", { school: "Wake Forest" })], prospects);
    expect(r.matches[0].prospectId).toBe("p2");
  });
  it("lists players that are not in the league list", () => {
    const r = matchRankingsToProspects([row(1, "Nobody Known")], prospects);
    expect(r.unmatched).toHaveLength(1);
    expect(r.matches).toHaveLength(0);
  });
  it("does not match one prospect twice", () => {
    const r = matchRankingsToProspects([row(1, "Kenneth Walker"), row(2, "Kenneth Walker")], prospects);
    expect(r.matches).toHaveLength(1);
    expect(r.unmatched).toHaveLength(1);
  });
});
