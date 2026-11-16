// Active league, season advance, migrations and the admin database viewer.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getLeagueTransactions,
  getNFLState,
  getLeagueDrafts,
  getDraftPicks,
  type SleeperMatchup,
} from "../sleeper";
import {
  dbErrorMessage,
  getEffectiveWeek,
} from "./shared";
import { COMMISSIONER_USER_IDS, isCommissioner } from "../middleware/commissioner";

export function registerLeagueAdminRoutes(app: Express): void {
  // ==================== LEAGUE YEAR ADVANCEMENT ====================
  app.get("/api/league/active", async (_req, res) => {
    try {
      // First, try to get the league where isActive = 1
      const activeLeague = await storage.getActiveLeague();
      if (activeLeague) {
        console.log(`[Active League] Using league with isActive=1: ${activeLeague.leagueId} (season ${activeLeague.season})`);
        return res.json(activeLeague);
      }
      
      // Fallback: if no league is marked as active, use the most recent league by season
      const allLeagues = await storage.listLeagues();
      if (allLeagues.length > 0) {
        // Sort by season descending (most recent year first), then by activatedAt descending
        const sortedLeagues = allLeagues.sort((a, b) => {
          const seasonA = parseInt(a.season) || 0;
          const seasonB = parseInt(b.season) || 0;
          if (seasonA !== seasonB) {
            return seasonB - seasonA; // Most recent season first
          }
          return (b.activatedAt || 0) - (a.activatedAt || 0); // Most recent activation first
        });
        
        const mostRecentLeague = sortedLeagues[0];
        console.log(`[Active League] No league with isActive=1 found, using most recent: ${mostRecentLeague.leagueId} (season ${mostRecentLeague.season})`);
        return res.json(mostRecentLeague);
      }
      
      // No leagues at all
      return res.status(404).json({ error: "No active league configured" });
    } catch (error) {
      console.error("Error fetching active league:", error);
      res.status(500).json({ error: "Failed to fetch active league", message: dbErrorMessage(error) });
    }
  });

  app.get("/api/league/list", async (_req, res) => {
    try {
      const leagues = await storage.listLeagues();
      res.json(leagues);
    } catch (error) {
      console.error("Error listing leagues:", error);
      res.status(500).json({ error: "Failed to list leagues" });
    }
  });

  app.post("/api/league/set-active", async (req, res) => {
    try {
      const { leagueId } = req.body;
      if (!leagueId) {
        return res.status(400).json({ error: "leagueId is required" });
      }

      const league = await getLeague(leagueId);
      const existingLeagues = await storage.listLeagues();
      const activeLeagues = existingLeagues.filter(l => l.isActive === 1);
      for (const active of activeLeagues) {
        await storage.deactivateLeague(active.leagueId);
      }

      const active = await storage.upsertActiveLeague({
        leagueId: league.league_id,
        season: league.season,
        isActive: 1,
      });

      res.json(active);
    } catch (error) {
      console.error("Error setting active league:", error);
      res.status(500).json({ error: "Failed to set active league" });
    }
  });

  app.post("/api/league/advance-year", async (req, res) => {
    try {
      const { newLeagueId, userId, manualMappings } = req.body as {
        newLeagueId: string;
        userId: string;
        manualMappings?: Array<{ oldRosterId: number; newRosterId: number }>;
      };

      if (!newLeagueId || !userId) {
        return res.status(400).json({ error: "newLeagueId and userId are required" });
      }

      const currentActive = await storage.getActiveLeague();
      if (!currentActive) {
        return res.status(400).json({ error: "No active league configured" });
      }

      const oldLeagueId = currentActive.leagueId;
      if (oldLeagueId === newLeagueId) {
        return res.status(400).json({ error: "New league ID must be different from current league ID" });
      }

      const isUserCommissioner = await isCommissioner(userId, oldLeagueId);
      if (!isUserCommissioner) {
        return res.status(403).json({ error: "Unauthorized: Commissioner access required" });
      }

      const [oldLeague, newLeague] = await Promise.all([
        getLeague(oldLeagueId),
        getLeague(newLeagueId),
      ]);

      const oldSeason = parseInt(oldLeague.season);
      const newSeason = parseInt(newLeague.season);
      if (Number.isNaN(oldSeason) || Number.isNaN(newSeason) || newSeason !== oldSeason + 1) {
        return res.status(400).json({
          error: "League season mismatch",
          details: `Expected new season ${oldSeason + 1}, got ${newLeague.season}`,
        });
      }

      const [oldRosters, newRosters] = await Promise.all([
        getLeagueRosters(oldLeagueId),
        getLeagueRosters(newLeagueId),
      ]);

      const ownerToNewRoster = new Map<string, number>();
      newRosters.forEach(r => {
        if (r.owner_id) ownerToNewRoster.set(r.owner_id, r.roster_id);
      });

      const mappingByOldRoster = new Map<number, { newRosterId: number; mappingType: "auto" | "manual" }>();
      oldRosters.forEach(r => {
        const mapped = r.owner_id ? ownerToNewRoster.get(r.owner_id) : undefined;
        if (mapped) {
          mappingByOldRoster.set(r.roster_id, { newRosterId: mapped, mappingType: "auto" });
        }
      });

      (manualMappings || []).forEach(m => {
        if (m && typeof m.oldRosterId === "number" && typeof m.newRosterId === "number") {
          mappingByOldRoster.set(m.oldRosterId, { newRosterId: m.newRosterId, mappingType: "manual" });
        }
      });

      const unmatched = oldRosters
        .filter(r => !mappingByOldRoster.has(r.roster_id))
        .map(r => ({ oldRosterId: r.roster_id, ownerId: r.owner_id || null }));

      if (unmatched.length > 0) {
        return res.status(400).json({ error: "Unmatched rosters", unmatched });
      }

      const migration = await storage.createLeagueMigration({
        oldLeagueId,
        newLeagueId,
        oldSeason: oldLeague.season,
        newSeason: newLeague.season,
        migratedBy: userId,
        status: "in_progress",
      });

      for (const [oldRosterId, mapping] of Array.from(mappingByOldRoster.entries())) {
        await storage.createRosterMapping({
          migrationId: migration.id,
          oldLeagueId,
          oldRosterId,
          newLeagueId,
          newRosterId: mapping.newRosterId,
          mappingType: mapping.mappingType,
          mappedBy: mapping.mappingType === "manual" ? userId : null,
        });
      }

      // Snapshot creation (weekly + end-of-season)
      const [nflState, leagueContext] = await Promise.all([
        getNFLState(),
        getLeague(oldLeagueId).catch(() => null),
      ]);
      const effectiveWeek = getEffectiveWeek(nflState, leagueContext);

      const users = await getLeagueUsers(oldLeagueId);
      const userMap = new Map(users.map(u => [u.user_id, u]));
      const rosterTotals = new Map<number, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }>();
      oldRosters.forEach(r => {
        rosterTotals.set(r.roster_id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
      });

      for (let week = 1; week <= effectiveWeek; week++) {
        const matchups = await getLeagueMatchups(oldLeagueId, week).catch(() => []);
        const matchupGroups = new Map<number, SleeperMatchup[]>();
        matchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) matchupGroups.set(m.matchup_id, []);
          matchupGroups.get(m.matchup_id)!.push(m);
        });

        matchupGroups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          const score1 = t1.points || 0;
          const score2 = t2.points || 0;
          const r1 = rosterTotals.get(t1.roster_id);
          const r2 = rosterTotals.get(t2.roster_id);
          if (!r1 || !r2) return;
          r1.pointsFor += score1;
          r1.pointsAgainst += score2;
          r2.pointsFor += score2;
          r2.pointsAgainst += score1;

          if (score1 > score2) {
            r1.wins += 1;
            r2.losses += 1;
          } else if (score2 > score1) {
            r2.wins += 1;
            r1.losses += 1;
          } else if (score1 !== 0 || score2 !== 0) {
            r1.ties += 1;
            r2.ties += 1;
          }
        });

        const standingsData = oldRosters.map(r => {
          const totals = rosterTotals.get(r.roster_id);
          const owner = userMap.get(r.owner_id);
          return {
            rosterId: r.roster_id,
            ownerId: r.owner_id,
            name: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
            wins: totals?.wins || 0,
            losses: totals?.losses || 0,
            ties: totals?.ties || 0,
            pointsFor: totals?.pointsFor || 0,
            pointsAgainst: totals?.pointsAgainst || 0,
            week,
          };
        }).sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));

        await storage.createStandingsSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          week,
          snapshotType: "weekly",
          standingsData: JSON.stringify(standingsData),
        });

        for (const [rosterId, totals] of Array.from(rosterTotals.entries())) {
          await storage.createTeamStatsSnapshot({
            leagueId: oldLeagueId,
            season: oldLeague.season,
            week,
            rosterId,
            statsData: JSON.stringify(totals),
          });
        }

        await storage.createMatchupSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          week,
          matchupData: JSON.stringify(matchups),
        });

        const weekTransactions = await getLeagueTransactions(oldLeagueId, week).catch(() => []);
        await storage.createTransactionSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          week,
          transactionData: JSON.stringify(weekTransactions),
        });
        // Per-week player stats snapshots skipped (too slow; use end-of-season aggregate instead)
      }

      await storage.createStandingsSnapshot({
        leagueId: oldLeagueId,
        season: oldLeague.season,
        week: null,
        snapshotType: "end_of_season",
        standingsData: JSON.stringify(Array.from(rosterTotals.entries()).map(([rosterId, totals]) => ({
          rosterId,
          ...totals,
        }))),
      });

      for (const [rosterId, totals] of Array.from(rosterTotals.entries())) {
        await storage.createTeamStatsSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          week: null,
          rosterId,
          statsData: JSON.stringify(totals),
        });
      }

      const drafts = await getLeagueDrafts(oldLeagueId).catch(() => []);
      for (const draft of drafts.filter(d => d.status === "complete")) {
        const picks = await getDraftPicks(draft.draft_id).catch(() => []);
        await storage.createDraftSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          draftId: draft.draft_id,
          draftData: JSON.stringify(draft),
          picksData: JSON.stringify(picks),
        });
      }

      // Snapshot year recap and metrics for historical viewing (fetch from internal endpoints)
      try {
        const baseUrl = process.env.ORIGIN || `${req.protocol}://${req.get("host") || "localhost:5000"}`;
        const [yearRecapRes, teamLuckRes, heatCheckRes, powerRankingsRes] = await Promise.all([
          fetch(`${baseUrl}/api/league/${oldLeagueId}/year-recap`),
          fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/team-luck`),
          fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/heat-check`),
          fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/power-rankings`),
        ]);
        if (yearRecapRes.ok) {
          const yearRecapData = await yearRecapRes.json();
          await storage.upsertYearRecapSnapshot(oldLeagueId, oldLeague.season, JSON.stringify(yearRecapData));
        }
        if (teamLuckRes.ok && heatCheckRes.ok && powerRankingsRes.ok) {
          const [teamLuckData, heatCheckData, powerRankingsData] = await Promise.all([
            teamLuckRes.json(),
            heatCheckRes.json(),
            powerRankingsRes.json(),
          ]);
          await storage.upsertMetricsSnapshot(
            oldLeagueId,
            oldLeague.season,
            JSON.stringify(teamLuckData),
            JSON.stringify(heatCheckData),
            JSON.stringify(powerRankingsData)
          );
        }
      } catch (snapshotErr) {
        console.error("Error snapshotting year recap/metrics during advance-year (non-fatal):", snapshotErr);
      }

      // Migrate dead cap, team extensions, and contracts (clean-slate: each clears the new
      // league's existing rows before copying from the old league, so advance-year is the
      // single authoritative handoff point).
      const deadCapResult = await storage.migrateDeadCapEntries(oldLeagueId, newLeagueId, mappingByOldRoster);
      const extensionsResult = await storage.migrateTeamExtensions(oldLeagueId, newLeagueId, mappingByOldRoster);
      const contractsResult = await storage.migratePlayerContracts(oldLeagueId, newLeagueId, mappingByOldRoster);
      console.log(`[Advance Year] Contracts: cleared ${contractsResult.cleared}, copied ${contractsResult.copied}`);
      console.log(`[Advance Year] Dead cap: cleared ${deadCapResult.cleared}, copied ${deadCapResult.copied}`);
      console.log(`[Advance Year] Extensions: cleared ${extensionsResult.cleared}, copied ${extensionsResult.copied}`);

      // Reset bidding
      await storage.deleteAllPlayerBids(oldLeagueId);

      // Contracts Hub: the new league year starts in the rollover phase, ready for free agency.
      try {
        const { startNewLeagueYear } = await import("../contractHubRoutes");
        await startNewLeagueYear(oldLeagueId, newLeagueId);
      } catch (hubErr) {
        console.error("[Advance Year] Contracts Hub settings not carried over (non-fatal):", hubErr);
      }

      // Archive rule suggestions for the old league (they stay in DB but no longer show on Rule Changes tab)
      await storage.archiveRuleSuggestions(oldLeagueId);

      await storage.deactivateLeague(oldLeagueId);
      await storage.upsertActiveLeague({
        leagueId: newLeagueId,
        season: newLeague.season,
        isActive: 1,
      });

      await storage.updateLeagueMigration(migration.id, { status: "completed", errorMessage: null });
      res.json({
        success: true,
        migrationId: migration.id,
        contracts: contractsResult,
        deadCap: deadCapResult,
        extensions: extensionsResult,
      });
    } catch (error: any) {
      console.error("Error advancing league year:", error);
      res.status(500).json({ error: "Failed to advance league year", details: error?.message || String(error) });
    }
  });

  app.get("/api/league/migration/:migrationId/roster-mapping", async (req, res) => {
    try {
      const { migrationId } = req.params;
      const mappings = await storage.getRosterMappings(migrationId);
      res.json(mappings);
    } catch (error) {
      console.error("Error fetching roster mappings:", error);
      res.status(500).json({ error: "Failed to fetch roster mappings" });
    }
  });

  app.post("/api/league/migration/:migrationId/roster-mapping", async (req, res) => {
    try {
      const { migrationId } = req.params;
      const { oldLeagueId, newLeagueId, oldRosterId, newRosterId, mappingType, userId } = req.body;
      if (!oldLeagueId || !newLeagueId || !oldRosterId || !newRosterId || !mappingType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const mapping = await storage.createRosterMapping({
        migrationId,
        oldLeagueId,
        newLeagueId,
        oldRosterId,
        newRosterId,
        mappingType,
        mappedBy: mappingType === "manual" ? userId : null,
      });
      res.json(mapping);
    } catch (error) {
      console.error("Error creating roster mapping:", error);
      res.status(500).json({ error: "Failed to create roster mapping" });
    }
  });

  // Get list of all database tables with row counts
  app.get("/api/admin/database/tables", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      // Check if user is commissioner (no league required for table list)
      if (!COMMISSIONER_USER_IDS.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized: Commissioner access required" });
      }

      // Verify DATABASE_URL is set
      if (!process.env.DATABASE_URL) {
        console.error("[API] DATABASE_URL environment variable is not set");
        return res.status(500).json({ 
          error: "Database connection not configured",
          details: "DATABASE_URL environment variable is not set. Please configure the database connection."
        });
      }

      const tables = await storage.getTableList();
      console.log(`[API] Successfully retrieved ${tables.length} tables`);
      res.json(tables);
    } catch (error: any) {
      console.error("[API] Error getting table list:", error);
      const errorMessage = error?.message || "Failed to get table list";
      const errorCode = error?.code;
      
      res.status(500).json({ 
        error: errorMessage,
        details: error?.details || errorMessage,
        code: errorCode
      });
    }
  });

  // Get table schema
  app.get("/api/admin/database/tables/:tableName/schema", async (req, res) => {
    try {
      const { tableName } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      if (!COMMISSIONER_USER_IDS.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized: Commissioner access required" });
      }

      const schema = await storage.getTableSchema(tableName);
      res.json(schema);
    } catch (error: any) {
      console.error(`[API] Error getting schema for table ${req.params.tableName}:`, error);
      res.status(500).json({ error: error.message || "Failed to get table schema" });
    }
  });

  // Get table data with pagination and filters
  app.get("/api/admin/database/tables/:tableName", async (req, res) => {
    try {
      const { tableName } = req.params;
      const userId = req.query.userId as string;
      const leagueId = req.query.leagueId as string | undefined;
      const page = parseInt(req.query.page as string || "1", 10);
      const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 1000); // Max 1000 rows
      const offset = (page - 1) * limit;

      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      if (!COMMISSIONER_USER_IDS.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized: Commissioner access required" });
      }

      // Build filters from query params
      const filters: Record<string, any> = {};
      if (leagueId) {
        filters.leagueId = leagueId;
      }
      // Add other filter params if provided
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== "userId" && key !== "leagueId" && key !== "page" && key !== "limit" && value) {
          filters[key] = value;
        }
      }

      const [data, totalCount] = await Promise.all([
        storage.getTableData(tableName, limit, offset, Object.keys(filters).length > 0 ? filters : undefined),
        storage.getTableRowCount(tableName, Object.keys(filters).length > 0 ? filters : undefined),
      ]);

      res.json({
        data,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (error: any) {
      console.error(`[API] Error getting data from table ${req.params.tableName}:`, error);
      res.status(500).json({ error: error.message || "Failed to get table data" });
    }
  });

  // Get table row count
  app.get("/api/admin/database/tables/:tableName/count", async (req, res) => {
    try {
      const { tableName } = req.params;
      const userId = req.query.userId as string;
      const leagueId = req.query.leagueId as string | undefined;

      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }

      if (!COMMISSIONER_USER_IDS.includes(userId)) {
        return res.status(403).json({ error: "Unauthorized: Commissioner access required" });
      }

      const filters: Record<string, any> = {};
      if (leagueId) {
        filters.leagueId = leagueId;
      }

      const count = await storage.getTableRowCount(tableName, Object.keys(filters).length > 0 ? filters : undefined);
      res.json({ count });
    } catch (error: any) {
      console.error(`[API] Error getting row count for table ${req.params.tableName}:`, error);
      res.status(500).json({ error: error.message || "Failed to get row count" });
    }
  });
}
