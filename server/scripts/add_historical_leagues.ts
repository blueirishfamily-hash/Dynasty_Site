import { DatabaseStorage } from "../storage";

const LEAGUES = [
  { leagueId: "918240874625257472", season: "2023", isActive: 0 },
  { leagueId: "1048746932522405888", season: "2024", isActive: 0 },
  { leagueId: "1194798912048705536", season: "2025", isActive: 1 },
];

async function addHistoricalLeagues() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }

  const storage = new DatabaseStorage();

  console.log(`[Add Historical Leagues] Adding leagues to active_leagues table`);

  try {
    // Check existing leagues
    const existingLeagues = await storage.listLeagues();
    const existingMap = new Map(existingLeagues.map(l => [l.leagueId, l]));

    for (const league of LEAGUES) {
      const existing = existingMap.get(league.leagueId);

      if (existing) {
        console.log(`[Add Historical Leagues] League ${league.leagueId} (${league.season}) already exists`);
        console.log(`[Add Historical Leagues] Existing entry:`, {
          id: existing.id,
          leagueId: existing.leagueId,
          season: existing.season,
          isActive: existing.isActive,
        });
        continue;
      }

      // Add league
      const activeLeague = await storage.upsertActiveLeague({
        leagueId: league.leagueId,
        season: league.season,
        isActive: league.isActive,
      });

      console.log(`[Add Historical Leagues] Successfully added league ${league.leagueId} (${league.season})`);
      console.log(`[Add Historical Leagues] Entry:`, {
        id: activeLeague.id,
        leagueId: activeLeague.leagueId,
        season: activeLeague.season,
        isActive: activeLeague.isActive,
      });
    }

    console.log(`[Add Historical Leagues] Completed processing ${LEAGUES.length} leagues`);
  } catch (error: any) {
    console.error(`[Add Historical Leagues] Failed:`, error?.message || String(error));
    throw error;
  }
}

addHistoricalLeagues()
  .then(() => {
    console.log("[Add Historical Leagues] Script completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Add Historical Leagues] Script failed:", err);
    process.exit(1);
  });
