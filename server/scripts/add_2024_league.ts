import { DatabaseStorage } from "../storage";

const LEAGUE_ID = "1048746932522405888";
const SEASON = "2024";

async function add2024League() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  const storage = new DatabaseStorage();

  console.log(`[Add 2024 League] Adding league ${LEAGUE_ID} to active_leagues table`);

  try {
    // Check if league already exists
    const existingLeagues = await storage.listLeagues();
    const existing = existingLeagues.find(l => l.leagueId === LEAGUE_ID);

    if (existing) {
      console.log(`[Add 2024 League] League ${LEAGUE_ID} already exists in active_leagues`);
      console.log(`[Add 2024 League] Existing entry:`, {
        id: existing.id,
        leagueId: existing.leagueId,
        season: existing.season,
        isActive: existing.isActive,
      });
      return;
    }

    // Calculate timestamps
    // Activated: January 1, 2024 (approximate start of 2024 season)
    const activatedAt = new Date("2024-01-01").getTime();
    // Deactivated: January 1, 2025 (when 2025 league would have been activated)
    const deactivatedAt = new Date("2025-01-01").getTime();

    // Add league as inactive (for historical viewing)
    const activeLeague = await storage.upsertActiveLeague({
      leagueId: LEAGUE_ID,
      season: SEASON,
      isActive: 0, // Inactive - for historical viewing only
    });

    console.log(`[Add 2024 League] Successfully added league ${LEAGUE_ID}`);
    console.log(`[Add 2024 League] Entry:`, {
      id: activeLeague.id,
      leagueId: activeLeague.leagueId,
      season: activeLeague.season,
      isActive: activeLeague.isActive,
    });
  } catch (error: any) {
    console.error(`[Add 2024 League] Failed:`, error?.message || String(error));
    throw error;
  }
}

add2024League()
  .then(() => {
    console.log("[Add 2024 League] Script completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Add 2024 League] Script failed:", err);
    process.exit(1);
  });
