/**
 * Per-league rules, stored as JSON in league_rules (one row per league per season).
 * Money is in display dollars ($M), not the tenths used by player_contracts.salaries.
 *
 * The app reads these instead of hardcoded values. A season's rules are the latest saved row at or before
 * it (rulesForSeason); fields missing from an older row come from the defaults (mergeRules).
 */
import { CONTRACT_DEADLINE_WEEK, CURRENT_SEASON_CAP, LEAGUE_PHASES, RFA_ENABLED, type LeaguePhaseId } from "./contractRules";

export const LEAGUE_RULES_VERSION = 2;

export interface RookieScale {
  /** Round 1 salary by draft slot (1-based). */
  round1BySlot: Record<string, number>;
  /** Round 1 salary for a slot missing from round1BySlot. */
  round1Default: number;
  round2: number;
  round3: number;
}

/** Extension price multiplier by extension length in years. */
export type ExtensionMultipliers = Record<"1" | "2" | "3" | "4", number>;

export interface LeagueRules {
  version: number;
  salaryCap: number;
  /** Most seasons one contract can cover, counting the current one (5 = through this season + 4). */
  maxContractYears: number;
  /** Seasons a rookie contract covers. */
  rookieContractYears: number;
  rookieScale: RookieScale;
  /** Last NFL week of the tag, extension and trade window. */
  contractDeadlineWeek: number;
  rfaEnabled: boolean;
  inSeasonPickup: { years: number; salary: number };
  /** Offseason phases in order. Derived from rfaEnabled; kept for older rows. Use activePhases(). */
  phases: LeaguePhaseId[];
  franchiseTag: {
    /** The tag price is the average of this many top non-rookie salaries at the position. */
    topSalaries: number;
    perTeamPerSeason: number;
  };
  extensions: {
    multipliers: ExtensionMultipliers;
    /** Lowest extension salary, $M. */
    minSalary: number;
    rookiePerSeason: number;
    /** How many of the rookie extensions may be 4 years. */
    rookieFourYearPerSeason: number;
    nonRookiePerSeason: number;
  };
  /** Most non-rookie contracts a team may hold by years left. */
  contractLengthLimits: { twoYear: number; threeYear: number; fourPlusYear: number };
  /**
   * Dead cap when a contract ends early: the current season is always 100%; each later season costs this
   * share of its salary, by how many contract years are left counting from that season.
   */
  deadCap: { shareByYearsLeft: { "1": number; "2": number; "3": number; "4": number; "5plus": number } };
  awards: {
    nominationLimit: number;
    resultTeamCount: number;
    allLeagueStartYear: number;
    /** Points for 1st, 2nd, 3rd... on a ballot. */
    ballotPoints: number[];
    allLeagueTeams: number;
  };
}

function activePhasesFor(rfaEnabled: boolean): LeaguePhaseId[] {
  return rfaEnabled ? [...LEAGUE_PHASES] : LEAGUE_PHASES.filter((p) => p !== "rfa_match_1" && p !== "rfa_match_2");
}

/** The rules ATL Dynasty runs on today, taken from the values that used to be hardcoded. */
export function atlDynastyRules(): LeagueRules {
  return {
    version: LEAGUE_RULES_VERSION,
    salaryCap: CURRENT_SEASON_CAP,
    maxContractYears: 5,
    rookieContractYears: 3,
    rookieScale: {
      round1BySlot: { "1": 12, "2": 11, "3": 11, "4": 9, "5": 9, "6": 9, "7": 7, "8": 7, "9": 7, "10": 6, "11": 6, "12": 6 },
      round1Default: 4,
      round2: 4,
      round3: 2,
    },
    contractDeadlineWeek: CONTRACT_DEADLINE_WEEK,
    rfaEnabled: RFA_ENABLED,
    inSeasonPickup: { years: 1, salary: 1 },
    phases: activePhasesFor(RFA_ENABLED),
    franchiseTag: { topSalaries: 5, perTeamPerSeason: 1 },
    extensions: {
      multipliers: { "1": 0.8, "2": 0.9, "3": 1.0, "4": 1.1 },
      minSalary: 5,
      rookiePerSeason: 3,
      rookieFourYearPerSeason: 1,
      nonRookiePerSeason: 2,
    },
    contractLengthLimits: { twoYear: 5, threeYear: 4, fourPlusYear: 3 },
    deadCap: { shareByYearsLeft: { "1": 0, "2": 0.25, "3": 0.5, "4": 0.75, "5plus": 1 } },
    awards: { nominationLimit: 3, resultTeamCount: 12, allLeagueStartYear: 2025, ballotPoints: [3, 2, 1], allLeagueTeams: 3 },
  };
}

/** The offseason phases this league runs: the RFA match windows only when RFA is on. */
export function activePhases(rules: Pick<LeagueRules, "rfaEnabled">): LeaguePhaseId[] {
  return activePhasesFor(rules.rfaEnabled);
}

/** Rookie salary for a pick under the given scale. Rounds after 3 have no scale. */
export function rookieSalaryFromScale(scale: RookieScale, round: number, draftSlot: number): number {
  if (round === 1) return scale.round1BySlot[String(draftSlot)] ?? scale.round1Default;
  if (round === 2) return scale.round2;
  if (round === 3) return scale.round3;
  return 0;
}

/** Extension price multiplier for a length, using the 4-year one for anything longer. */
export function extensionMultiplier(rules: Pick<LeagueRules, "extensions">, years: number): number {
  const key = String(Math.min(Math.max(Math.round(years), 1), 4)) as keyof ExtensionMultipliers;
  return rules.extensions.multipliers[key];
}

/** Dead cap share for a later season with this many contract years left (counting that season). */
export function deadCapShare(rules: Pick<LeagueRules, "deadCap">, yearsLeft: number): number {
  const s = rules.deadCap.shareByYearsLeft;
  if (yearsLeft >= 5) return s["5plus"];
  return s[String(Math.max(yearsLeft, 1)) as "1" | "2" | "3" | "4"];
}

/** Contract-length limit for a contract with this many years left; null for one year (no limit). */
export function lengthLimit(rules: Pick<LeagueRules, "contractLengthLimits">, yearsLeft: number): number | null {
  if (yearsLeft >= 4) return rules.contractLengthLimits.fourPlusYear;
  if (yearsLeft === 3) return rules.contractLengthLimits.threeYear;
  if (yearsLeft === 2) return rules.contractLengthLimits.twoYear;
  return null;
}

// ─── Validation ────────────────────────────────────────────────────────────────

/** Problems with a rules object a commissioner wants to save, as readable messages. Empty when valid. */
export function validateRules(r: LeagueRules): string[] {
  const errors: string[] = [];
  const num = (v: unknown, label: string, min: number, max: number, integer = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
      errors.push(`${label} must be ${integer ? "a whole number " : ""}between ${min} and ${max}.`);
    }
  };
  num(r.salaryCap, "Salary cap", 10, 1000);
  num(r.maxContractYears, "Max contract length", 1, 10, true);
  num(r.rookieContractYears, "Rookie contract length", 1, 10, true);
  if (r.rookieContractYears > r.maxContractYears) errors.push("Rookie contracts can't be longer than the max contract length.");
  for (const [slot, v] of Object.entries(r.rookieScale?.round1BySlot ?? {})) num(v, `Round 1 pick ${slot} salary`, 0, r.salaryCap);
  num(r.rookieScale?.round1Default, "Round 1 later picks salary", 0, r.salaryCap);
  num(r.rookieScale?.round2, "Round 2 salary", 0, r.salaryCap);
  num(r.rookieScale?.round3, "Round 3 salary", 0, r.salaryCap);
  num(r.contractDeadlineWeek, "Deadline week", 1, 18, true);
  if (typeof r.rfaEnabled !== "boolean") errors.push("RFA must be on or off.");
  num(r.inSeasonPickup?.years, "Pickup contract years", 1, r.maxContractYears, true);
  num(r.inSeasonPickup?.salary, "Pickup contract salary", 0, r.salaryCap);
  num(r.franchiseTag?.topSalaries, "Tag price salaries", 1, 32, true);
  num(r.franchiseTag?.perTeamPerSeason, "Tags per team", 0, 10, true);
  for (const k of ["1", "2", "3", "4"] as const) num(r.extensions?.multipliers?.[k], `${k}-year extension multiplier`, 0.1, 3);
  num(r.extensions?.minSalary, "Minimum extension salary", 0, r.salaryCap);
  num(r.extensions?.rookiePerSeason, "Rookie extensions per team", 0, 20, true);
  num(r.extensions?.rookieFourYearPerSeason, "4-year rookie extensions per team", 0, 20, true);
  num(r.extensions?.nonRookiePerSeason, "Non-rookie extensions per team", 0, 20, true);
  num(r.contractLengthLimits?.twoYear, "2-year contract limit", 0, 60, true);
  num(r.contractLengthLimits?.threeYear, "3-year contract limit", 0, 60, true);
  num(r.contractLengthLimits?.fourPlusYear, "4+ year contract limit", 0, 60, true);
  for (const k of ["1", "2", "3", "4", "5plus"] as const) {
    num(r.deadCap?.shareByYearsLeft?.[k], `Dead cap share (${k === "5plus" ? "5+" : k} years left)`, 0, 1);
  }
  num(r.awards?.nominationLimit, "Nominations per team", 1, 20, true);
  num(r.awards?.resultTeamCount, "Award result team count", 1, 40, true);
  num(r.awards?.allLeagueStartYear, "All-League start year", 2000, 2100, true);
  num(r.awards?.allLeagueTeams, "All-League teams", 1, 3, true);
  const pts = r.awards?.ballotPoints;
  if (!Array.isArray(pts) || pts.length < 1 || pts.length > 10 || pts.some((p) => typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > 100)) {
    errors.push("Ballot points must be 1 to 10 whole numbers between 0 and 100.");
  }
  return errors;
}

// ─── Reading rules by season ───────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Fills anything missing from a stored rules object with the defaults, so a row saved before a rule existed
 * still reads as a complete LeagueRules. Stored values win; arrays are taken as stored. The phase list is
 * always derived from rfaEnabled.
 */
export function mergeRules(stored: unknown, defaults: LeagueRules = atlDynastyRules()): LeagueRules {
  const merge = (base: any, over: any): any => {
    if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge((base as any)[k], v) : v;
    return out;
  };
  const merged = merge(defaults, isPlainObject(stored) ? stored : {}) as LeagueRules;
  return { ...merged, version: LEAGUE_RULES_VERSION, phases: activePhasesFor(merged.rfaEnabled) };
}

export interface StoredRules {
  season: string;
  rules: unknown;
}

/**
 * The rules in effect for a season: the latest saved row at or before that season. A row saved for next
 * season therefore takes effect at rollover with no extra step. With no row, the defaults apply.
 */
export function rulesForSeason(rows: StoredRules[], season: string | number, defaults: LeagueRules = atlDynastyRules()) {
  const target = Number(season);
  const applicable = rows
    .filter((r) => Number(r.season) <= target)
    .sort((a, b) => Number(b.season) - Number(a.season))[0];
  return { rules: mergeRules(applicable?.rules, defaults), fromSeason: applicable?.season ?? null };
}

/** The top-level and nested keys whose values differ, e.g. ["salaryCap", "rookieScale.round2"]. */
export function changedRuleKeys(before: unknown, after: unknown, prefix = ""): string[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return Array.from(keys).flatMap((k) => changedRuleKeys(before[k], after[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(before) === JSON.stringify(after) ? [] : [prefix || "(all)"];
}
