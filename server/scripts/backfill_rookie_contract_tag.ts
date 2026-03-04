/**
 * One-time backfill: set is_rookie_contract = 0 for any contract that has
 * been extended (extension_applied = 1 or has_been_extended = 1).
 * Run with: npx tsx server/scripts/backfill_rookie_contract_tag.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

async function run() {
  // Select rows we're about to update (for logging)
  const selectResult = await db.execute(sql`
    SELECT league_id, roster_id, player_id, is_rookie_contract, extension_applied, has_been_extended
    FROM player_contracts
    WHERE is_rookie_contract = 1
      AND (extension_applied = 1 OR COALESCE(has_been_extended, 0) = 1)
  `);

  const rows = selectResult.rows as { league_id: string; roster_id: number; player_id: string }[];
  if (rows.length === 0) {
    console.log("No contracts to backfill (no rookie contracts that have been extended).");
    return;
  }

  console.log(`Found ${rows.length} contract(s) to update (extended but still marked rookie):`);
  rows.forEach((r) => console.log(`  - league=${r.league_id} roster=${r.roster_id} player=${r.player_id}`));

  const updatedAt = Date.now();
  await db.execute(sql`
    UPDATE player_contracts
    SET is_rookie_contract = 0, updated_at = ${updatedAt}
    WHERE is_rookie_contract = 1
      AND (extension_applied = 1 OR COALESCE(has_been_extended, 0) = 1)
  `);

  console.log(`Backfill complete: ${rows.length} contract(s) updated (is_rookie_contract set to 0).`);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
