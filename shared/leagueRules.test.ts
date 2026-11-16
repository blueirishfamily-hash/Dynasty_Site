import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { atlDynastyRules, rookieSalaryFromScale } from "./leagueRules";

describe("ATL Dynasty rules", () => {
  it("match the JSON inserted by docs/multi-league/sql/002_insert_atl_dynasty.sql", () => {
    const sql = fs.readFileSync(path.resolve(__dirname, "../docs/multi-league/sql/002_insert_atl_dynasty.sql"), "utf8");
    const json = sql.match(/'(\{"version".*?\})'::jsonb/)?.[1];
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toEqual(atlDynastyRules());
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
});
