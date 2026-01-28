import { getLeagueDrafts, getDraftPicks } from "../sleeper";
import { DatabaseStorage } from "../storage";

const LEAGUE_ID = "1048746932522405888";
const SEASON = "2024";

async function snapshot2024Drafts() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  const storage = new DatabaseStorage();

  console.log(`[Snapshot 2024 Drafts] Starting snapshot for league ${LEAGUE_ID}, season ${SEASON}`);

  try {
    // Fetch all drafts from the 2024 league
    const drafts = await getLeagueDrafts(LEAGUE_ID);
    console.log(`[Snapshot 2024 Drafts] Found ${drafts.length} total drafts`);

    // Filter for completed drafts
    const completedDrafts = drafts.filter(d => {
      const status = d.status?.toLowerCase().trim();
      return status === "complete" || 
             status === "completed" || 
             status === "finished" ||
             status === "closed" ||
             status === "done" ||
             status === "ended";
    });

    console.log(`[Snapshot 2024 Drafts] Found ${completedDrafts.length} completed drafts`);

    if (completedDrafts.length === 0) {
      console.log(`[Snapshot 2024 Drafts] No completed drafts found. Exiting.`);
      return;
    }

    // Check existing snapshots to avoid duplicates
    const existingSnapshots = await storage.getDraftSnapshots(LEAGUE_ID, SEASON);
    const existingDraftIds = new Set(existingSnapshots.map(s => s.draftId));
    console.log(`[Snapshot 2024 Drafts] Found ${existingSnapshots.length} existing snapshots`);

    let created = 0;
    let skipped = 0;

    // Create snapshots for each completed draft
    for (const draft of completedDrafts) {
      // Skip if snapshot already exists
      if (existingDraftIds.has(draft.draft_id)) {
        console.log(`[Snapshot 2024 Drafts] Skipping draft ${draft.draft_id} - snapshot already exists`);
        skipped++;
        continue;
      }

      try {
        console.log(`[Snapshot 2024 Drafts] Processing draft ${draft.draft_id} (${draft.type}, season ${draft.season})`);
        
        // Fetch picks for this draft
        const picks = await getDraftPicks(draft.draft_id);
        console.log(`[Snapshot 2024 Drafts] Fetched ${picks.length} picks for draft ${draft.draft_id}`);

        // Create snapshot
        await storage.createDraftSnapshot({
          leagueId: LEAGUE_ID,
          season: SEASON,
          draftId: draft.draft_id,
          draftData: JSON.stringify(draft),
          picksData: JSON.stringify(picks),
        });

        console.log(`[Snapshot 2024 Drafts] Created snapshot for draft ${draft.draft_id}`);
        created++;
      } catch (error: any) {
        console.error(`[Snapshot 2024 Drafts] Error processing draft ${draft.draft_id}:`, error?.message || String(error));
        // Continue with other drafts
      }
    }

    console.log(`[Snapshot 2024 Drafts] Completed: ${created} created, ${skipped} skipped`);
  } catch (error: any) {
    console.error(`[Snapshot 2024 Drafts] Failed:`, error?.message || String(error));
    throw error;
  }
}

snapshot2024Drafts()
  .then(() => {
    console.log("[Snapshot 2024 Drafts] Script completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Snapshot 2024 Drafts] Script failed:", err);
    process.exit(1);
  });
