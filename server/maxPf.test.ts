import { describe, expect, it } from "vitest";
import { completedRegularSeasonWeeksFor } from "./maxPf";

describe("completedRegularSeasonWeeksFor", () => {
  const playoffWeekStart = 15;
  it("counts the weeks before the current one during the season", () => {
    expect(completedRegularSeasonWeeksFor({ seasonType: "regular", currentWeek: 11, playoffWeekStart })).toBe(10);
    expect(completedRegularSeasonWeeksFor({ seasonType: "regular", currentWeek: 14, playoffWeekStart })).toBe(13);
  });
  it("is at least one week, even in week 1", () => {
    expect(completedRegularSeasonWeeksFor({ seasonType: "regular", currentWeek: 1, playoffWeekStart })).toBe(1);
  });
  it("counts all 14 regular season weeks once the playoffs start or the season is over", () => {
    expect(completedRegularSeasonWeeksFor({ seasonType: "regular", currentWeek: 15, playoffWeekStart })).toBe(14);
    expect(completedRegularSeasonWeeksFor({ seasonType: "post", currentWeek: 3, playoffWeekStart })).toBe(14);
    expect(completedRegularSeasonWeeksFor({ seasonType: "off", currentWeek: 1, playoffWeekStart })).toBe(14);
  });
  it("never goes past the regular season", () => {
    expect(completedRegularSeasonWeeksFor({ seasonType: "regular", currentWeek: 20, playoffWeekStart })).toBe(14);
  });
});
