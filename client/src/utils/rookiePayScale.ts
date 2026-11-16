import { atlDynastyRules, rookieSalaryFromScale, type RookieScale } from "@shared/leagueRules";
/**
 * Rookie Pay Scale Utility
 * 
 * Calculates rookie salary based on draft round and draft slot position.
 * 
 * First Round (Round 1):
 * - 1.01 — $12
 * - 1.02 — $11
 * - 1.03 — $11
 * - 1.04 — $9
 * - 1.05 — $9
 * - 1.06 — $9
 * - 1.07 — $7
 * - 1.08 — $7
 * - 1.09 — $7
 * - 1.10 — $6
 * - 1.11 — $6
 * - 1.12 — $6
 * 
 * Second Round (Round 2): All picks — $4
 * Third Round (Round 3): All picks — $2
 * Rounds 4+: No pay scale (returns 0)
 */

/** Rookie salary for a pick under the league's scale (ATL's by default). */
export function getRookieSalary(round: number, draftSlot: number, scale: RookieScale = atlDynastyRules().rookieScale): number {
  return rookieSalaryFromScale(scale, round, draftSlot);
}

/**
 * Formats draft position as a string (e.g., "1.01", "2.05", "3.12")
 */
export function formatDraftPosition(round: number, draftSlot: number): string {
  return `${round}.${String(draftSlot).padStart(2, '0')}`;
}

