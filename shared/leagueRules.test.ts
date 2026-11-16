import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  activePhases,
  atlDynastyRules,
  changedRuleKeys,
  deadCapShare,
  extensionMultiplier,
  lengthLimit,
  mergeRules,
  rookieSalaryFromScale,
  rulesForSeason,
  validateRules,
} from "./leagueRules";

describe("ATL Dynasty rules", () => {
  it("the JSON inserted by docs/multi-league/sql/002_insert_atl_dynasty.sql reads as ATL's rules", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../docs/multi-league/sql/002_insert_atl_dynasty.sql"), "utf8");
    const json = sql.match(/'(\{"version".*?\})'::jsonb/)?.[1];
    expect(json).toBeDefined();
    // The row predates later rule fields; reading it fills them with ATL's values.
    expect(mergeRules(JSON.parse(json!))).toEqual(atlDynastyRules());
  });

  it("rookie scale matches the hardcoded pay scale", () => {
    const { rookieScale } = atlDynastyRules();
    const round1 = [12, 11, 11, 9, 9, 9, 7, 7, 7, 6, 6, 6];
    round1.forEach((salary, i) => expect(rookieSalaryFromScale(rookieScale, 1, i + 1)).toBe(salary));
    expect(rookieSalaryFromScale(rookieScale, 1, 13)).toBe(4);
    expect(rookieSalaryFromScale(rookieScale, 2, 5)).toBe(4);
    expect(rookieSalaryFromScale(rookieScale, 3, 5)).toBe(2);
    expect(rookieSalaryFromScale(rookieScale, 4, 1)).toBe(0);
  });

  it("are valid", () => expect(validateRules(atlDynastyRules())).toEqual([]));
});

describe("rules by season", () => {
  it("uses the latest row at or before the season, else the defaults", () => {
    const rows = [{ season: "2026", rules: { salaryCap: 250 } }, { season: "2027", rules: { salaryCap: 260 } }];
    expect(rulesForSeason(rows, "2025")).toMatchObject({ fromSeason: null, rules: { salaryCap: 250 } });
    expect(rulesForSeason(rows, "2026").rules.salaryCap).toBe(250);
    expect(rulesForSeason(rows, "2027").rules.salaryCap).toBe(260);
    expect(rulesForSeason(rows, "2030")).toMatchObject({ fromSeason: "2027", rules: { salaryCap: 260 } });
  });

  it("fills missing nested fields from the defaults", () => {
    const merged = mergeRules({ extensions: { minSalary: 7 } });
    expect(merged.extensions.minSalary).toBe(7);
    expect(merged.extensions.multipliers).toEqual(atlDynastyRules().extensions.multipliers);
  });

  it("derives the phase list from the RFA switch", () => {
    expect(mergeRules({ rfaEnabled: true }).phases).toContain("rfa_match_1");
    expect(mergeRules({ rfaEnabled: false, phases: ["rfa_match_1"] }).phases).not.toContain("rfa_match_1");
    expect(activePhases({ rfaEnabled: false })).toEqual(atlDynastyRules().phases);
  });

  it("lists changed keys", () => {
    const base = atlDynastyRules();
    const after = { ...base, salaryCap: 260, deadCap: { shareByYearsLeft: { ...base.deadCap.shareByYearsLeft, "2": 0.3 } } };
    expect(changedRuleKeys(base, after)).toEqual(["salaryCap", "deadCap.shareByYearsLeft.2"]);
  });
});

describe("rule helpers and validation", () => {
  const r = atlDynastyRules();
  it("refuses out-of-range values with readable messages", () => {
    const errors = validateRules({ ...r, salaryCap: -1, rookieContractYears: 9, awards: { ...r.awards, ballotPoints: [] } });
    expect(errors).toContain("Salary cap must be between 10 and 1000.");
    expect(errors).toContain("Rookie contracts can't be longer than the max contract length.");
    expect(errors.some((e) => e.startsWith("Ballot points"))).toBe(true);
  });

  it("dead cap shares, length limits and extension multipliers by years", () => {
    expect([1, 2, 3, 4, 5, 7].map((y) => deadCapShare(r, y))).toEqual([0, 0.25, 0.5, 0.75, 1, 1]);
    expect([1, 2, 3, 4, 6].map((y) => lengthLimit(r, y))).toEqual([null, 5, 4, 3, 3]);
    expect([1, 2, 3, 4, 5].map((y) => extensionMultiplier(r, y))).toEqual([0.8, 0.9, 1.0, 1.1, 1.1]);
  });
});
