import { describe, expect, it } from "vitest";
import { parseContractsCsv, MAX_IMPORT_ROWS, type ImportContext } from "./contractImport";

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  teams: [
    { rosterId: 1, labels: ["Rough Start", "elwthree"], playerIds: ["p1", "p2", "p3"] },
    { rosterId: 2, labels: ["Second Team", "friend"], playerIds: ["p4", "p5"] },
    { rosterId: 3, labels: ["Twins", "alex"], playerIds: ["p6"] },
    { rosterId: 4, labels: ["Twins", "sam"], playerIds: ["p7"] }, // same team name as roster 3
  ],
  playerNames: { p1: "Patrick Mahomes", p2: "Josh Allen", p3: "Josh Allen", p4: "Kenneth Walker III", p5: "D.J. Moore", p6: "A", p7: "B" },
  salaryCap: 250,
  maxContractYears: 5,
  currentSeason: 2026,
  existing: new Map(),
  ...over,
});

const csv = (...lines: string[]) => lines.join("\n");
const HEADER = "team,player,salary_2026,salary_2027,salary_2028,rookie";

describe("parseContractsCsv", () => {
  it("reads contracts with one column per season, in tenths of $M", () => {
    const r = parseContractsCsv(csv(HEADER, "Rough Start,Patrick Mahomes,30,30.5,$31M,", "Second Team,Kenneth Walker,4,4,,yes"), ctx(), "skip");
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ status: "ok", rosterId: 1, playerId: "p1", salaries: { "2026": 300, "2027": 305, "2028": 310 }, rookie: false });
    // "Kenneth Walker" doesn't match "Kenneth Walker III" exactly, but suffixes are ignored on both sides
    expect(r.rows[1]).toMatchObject({ status: "ok", rosterId: 2, playerId: "p4", salaries: { "2026": 40, "2027": 40 }, rookie: true });
    expect(r.counts).toEqual({ ok: 2, skipped: 0, error: 0 });
  });

  it("matches teams by team name, owner name or roster number, in any case", () => {
    const r = parseContractsCsv(csv(HEADER, "rough start,Patrick Mahomes,1,,,", "FRIEND,D.J. Moore,1,,,", "2,Kenneth Walker,1,,,"), ctx(), "skip");
    expect(r.rows.map((x) => x.rosterId)).toEqual([1, 2, 2]);
    expect(r.rows.map((x) => x.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("refuses a team name two teams share, and an unknown team", () => {
    const r = parseContractsCsv(csv(HEADER, "Twins,A,1,,,", "Nobody,Patrick Mahomes,1,,,", "3,A,1,,,"), ctx(), "skip");
    expect(r.rows[0].message).toContain('More than one team is called "Twins"');
    expect(r.rows[1].message).toContain('No team called "Nobody"');
    expect(r.rows[2].status).toBe("ok"); // the roster number still works
  });

  it("matches players on the team's own roster only", () => {
    const r = parseContractsCsv(csv(HEADER, "Rough Start,Kenneth Walker,1,,,", "Rough Start,Nobody Real,1,,,"), ctx(), "skip");
    expect(r.rows[0].message).toContain("isn't on Rough Start's roster in Sleeper");
    expect(r.rows[1].status).toBe("error");
  });

  it("asks for a player_id when two players on a team share a name", () => {
    const text = csv("team,player,player_id,salary_2026", "Rough Start,Josh Allen,,5", "Rough Start,Josh Allen,p3,6");
    const r = parseContractsCsv(text, ctx(), "skip");
    expect(r.rows[0].message).toContain("Add a player_id column");
    expect(r.rows[1]).toMatchObject({ status: "ok", playerId: "p3" });
    const wrong = parseContractsCsv(csv("team,player_id,salary_2026", "Rough Start,p4,5"), ctx(), "skip");
    expect(wrong.rows[0].message).toContain("isn't on Rough Start's roster");
  });

  it("checks salaries", () => {
    const r = parseContractsCsv(csv(HEADER, "Rough Start,Patrick Mahomes,abc,,,", "Second Team,D.J. Moore,300,,,", "Second Team,Kenneth Walker,,,,", "3,A,5,,6,"), ctx(), "skip");
    expect(r.rows[0].message).toContain("isn't a salary");
    expect(r.rows[1].message).toContain("over the league's $250M cap");
    expect(r.rows[2].message).toBe("No salary in any season.");
    expect(r.rows[3].message).toContain("skips 2027");
  });

  it("flags a player listed twice", () => {
    const r = parseContractsCsv(csv(HEADER, "Rough Start,Patrick Mahomes,1,,,", "Rough Start,Patrick Mahomes,2,,,"), ctx(), "skip");
    expect(r.rows.map((x) => x.status)).toEqual(["ok", "error"]);
    expect(r.rows[1].message).toContain("listed more than once");
  });

  it("skips players with a contract, or replaces it", () => {
    const existing = new Map([["1:p1", { "2026": 100, "2027": 100 }]]);
    const text = csv(HEADER, "Rough Start,Patrick Mahomes,5,,,");
    const skip = parseContractsCsv(text, ctx({ existing }), "skip");
    expect(skip.rows[0]).toMatchObject({ status: "skipped" });
    expect(skip.counts).toEqual({ ok: 0, skipped: 1, error: 0 });
    const replace = parseContractsCsv(text, ctx({ existing }), "replace");
    expect(replace.rows[0]).toMatchObject({ status: "ok", replaces: true });
  });

  it("warns when a team would end up over the cap, counting existing contracts that stay", () => {
    const existing = new Map([["1:p2", { "2026": 2400 }]]); // $240M already committed to Josh Allen
    const r = parseContractsCsv(csv(HEADER, "Rough Start,Patrick Mahomes,20,,,"), ctx({ existing }), "skip");
    expect(r.capWarnings).toEqual(["Rough Start would be $10.0M over the cap in 2026."]);
    // Replacing the big contract takes it out of the total
    const replaced = parseContractsCsv(csv(HEADER, "Rough Start,Josh Allen,20,,,"), ctx({ existing }), "replace");
    expect(replaced.capWarnings).toEqual([]);
  });

  it("reports file-level problems and writes nothing", () => {
    expect(parseContractsCsv("player,salary_2026\nA,1", ctx(), "skip").problems).toEqual(['The file needs a "team" column.']);
    expect(parseContractsCsv("team,player\nA,B", ctx(), "skip").problems[0]).toContain("at least one salary column");
    expect(parseContractsCsv("team,player,salary_2040\nA,B,1", ctx(), "skip").problems[0]).toContain("outside 2026-2030");
    expect(parseContractsCsv("", ctx(), "skip").problems).toEqual(["The file has no contract rows."]);
    const big = ["team,player,salary_2026", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => "a,b,1")].join("\n");
    expect(parseContractsCsv(big, ctx(), "skip").problems[0]).toContain("the most at once");
  });

  it("accepts a plain year column, a byte-order mark, quoted names and Windows line endings", () => {
    const text = '﻿Team,Player,2026,2027\r\n"Second Team","Kenneth Walker III",7,7\r\n';
    const r = parseContractsCsv(text, ctx(), "skip");
    expect(r.problems).toEqual([]);
    expect(r.rows[0]).toMatchObject({ status: "ok", salaries: { "2026": 70, "2027": 70 } });
  });

  it("uses the league's contract length for the allowed seasons", () => {
    const r = parseContractsCsv(csv("team,player,salary_2026,salary_2029", "Rough Start,Patrick Mahomes,1,1"), ctx({ maxContractYears: 3 }), "skip");
    expect(r.problems[0]).toContain("outside 2026-2028");
  });
});
