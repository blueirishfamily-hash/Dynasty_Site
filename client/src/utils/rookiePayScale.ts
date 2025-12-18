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

export function getRookieSalary(round: number, draftSlot: number): number {
  if (round === 1) {
    // First round pay scale
    const firstRoundSalaries: Record<number, number> = {
      1: 12, 2: 11, 3: 11, 4: 9, 5: 9, 6: 9,
      7: 7, 8: 7, 9: 7, 10: 6, 11: 6, 12: 6
    };
    return firstRoundSalaries[draftSlot] || 4; // Default to $4 if outside 1-12
  } else if (round === 2) {
    return 4; // All second round picks
  } else if (round === 3) {
    return 2; // All third round picks
  }
  return 0; // No pay scale for rounds 4+
}

/**
 * Formats draft position as a string (e.g., "1.01", "2.05", "3.12")
 */
export function formatDraftPosition(round: number, draftSlot: number): string {
  return `${round}.${String(draftSlot).padStart(2, '0')}`;
}

