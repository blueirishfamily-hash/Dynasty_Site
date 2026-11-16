/**
 * Per-league rules, stored as JSON in league_rules (one row per league per season).
 * Money is in display dollars ($M), not the tenths used by player_contracts.salaries.
 *
 * Phase 1 only stores these. Phase 3 makes the app read them instead of the constants below.
 */
import {
  ACTIVE_PHASES,
  CONTRACT_DEADLINE_WEEK,
  CURRENT_SEASON_CAP,
  RFA_ENABLED,
  createInSeasonSigning,
  type LeaguePhaseId,
} from "./contractRules";

export const LEAGUE_RULES_VERSION = 1;

export interface RookieScale {
  /** Round 1 salary by draft slot (1-based). */
  round1BySlot: Record<string, number>;
  /** Round 1 salary for a slot missing from round1BySlot. */
  round1Default: number;
  round2: number;
  round3: number;
}

export interface LeagueRules {
  version: number;
  salaryCap: number;
  rookieScale: RookieScale;
  /** Last NFL week of the tag, extension and trade window. */
  contractDeadlineWeek: number;
  rfaEnabled: boolean;
  inSeasonPickup: { years: number; salary: number };
  phases: LeaguePhaseId[];
  awards: { nominationLimit: number; resultTeamCount: number; allLeagueStartYear: number };
}

/** The rules ATL Dynasty runs on today, taken from the hardcoded values. Its 2026 league_rules row holds exactly this. */
export function atlDynastyRules(): LeagueRules {
  const pickup = createInSeasonSigning();
  return {
    version: LEAGUE_RULES_VERSION,
    salaryCap: CURRENT_SEASON_CAP,
    rookieScale: {
      // Same as rookiePayScale in server/rookieContracts.ts
      round1BySlot: { "1": 12, "2": 11, "3": 11, "4": 9, "5": 9, "6": 9, "7": 7, "8": 7, "9": 7, "10": 6, "11": 6, "12": 6 },
      round1Default: 4,
      round2: 4,
      round3: 2,
    },
    contractDeadlineWeek: CONTRACT_DEADLINE_WEEK,
    rfaEnabled: RFA_ENABLED,
    inSeasonPickup: { years: pickup.years, salary: pickup.yearlySalary },
    phases: [...ACTIVE_PHASES],
    // Award values hardcoded in server/routes/governance.ts and history.ts today
    awards: { nominationLimit: 3, resultTeamCount: 12, allLeagueStartYear: 2025 },
  };
}

/** Rookie salary for a pick under the given scale. Matches rookiePayScale for ATL's scale. */
export function rookieSalaryFromScale(scale: RookieScale, round: number, draftSlot: number): number {
  if (round === 1) return scale.round1BySlot[String(draftSlot)] ?? scale.round1Default;
  if (round === 2) return scale.round2;
  if (round === 3) return scale.round3;
  return 0;
}
