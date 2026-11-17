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
import { auditActor, requireAdmin, requireCommissioner, requireCommissionerFor } from "../security/guards";
import { leagueResolver, dbLeagueRegistry } from "../leagueRegistry";
import { normalizeSlug } from "../middleware/league";
import { runRollover } from "../rollover";
import { createDbRolloverDeps } from "../rolloverStore";

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
      // Switching the site's active season is a commissioner action for the league that season belongs to.
      if (!(await requireCommissionerFor(req, res, leagueId))) return;

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

  // ── Season rollover ──────────────────────────────────────────────────────────
  // See server/rollover.ts. The league being rolled over comes from its address (X-League), the new Sleeper
  // league must link back to the current season, and the switch to the new season is one transaction.
  // POST /api/league/advance-year/preview checks everything and reports what would move, writing nothing.
  const PROBLEM_STATUS: Record<string, number> = { step_failed: 500, belongs_to_other_league: 409, already_attached: 409, already_current: 409 };

  async function leagueToRoll(req: any, res: any) {
    const rawSlug = req.get("x-league");
    if (rawSlug) {
      const slug = normalizeSlug(rawSlug);
      const found = slug ? await dbLeagueRegistry.findBySlug(slug) : null;
      if (!found) { res.status(404).json({ error: "League not found" }); return null; }
      return found;
    }
    // No address: the site's active league, if it is registered.
    const active = await storage.getActiveLeague();
    const resolved = active ? await leagueResolver.resolve(active.leagueId) : null;
    if (resolved?.status === "ok") return resolved.context;
    res.status(400).json({ error: "This league isn't registered on the site, so its season can't be rolled over from here." });
    return null;
  }

  const rolloverHandler = (dryRun: boolean) => async (req: any, res: any) => {
    try {
      const ctx = await leagueToRoll(req, res);
      if (!ctx) return;
      const actor = await requireCommissioner(req, res, ctx);
      if (!actor) return;
      const { newLeagueId, manualMappings } = req.body ?? {};
      const active = await storage.getActiveLeague();
      const deps = createDbRolloverDeps({
        baseUrl: process.env.ORIGIN || `${req.protocol}://${req.get("host") || "localhost:5000"}`,
        actor: auditActor(actor),
      });
      const result = await runRollover(
        deps,
        {
          league: { id: ctx.league.id, currentSleeperLeagueId: ctx.season.sleeperLeagueId, currentSeason: ctx.season.season },
          newSleeperLeagueId: String(newLeagueId ?? ""),
          manualMappings: Array.isArray(manualMappings) ? manualMappings : [],
          by: actor.role === "commissioner" ? actor.sleeperUserId : "admin",
          // Only the league the site-wide active-league setting points at moves that setting.
          switchSiteActive: active?.leagueId === ctx.season.sleeperLeagueId,
        },
        { dryRun },
      );
      if (!result.ok) {
        const p = result.problem;
        return res.status(PROBLEM_STATUS[p.code] ?? 400).json({ error: p.message, code: p.code, unmatched: p.unmatched, step: p.step });
      }
      if (result.dryRun) return res.json({ dryRun: true, plan: result.plan });
      res.json({ success: true, migrationId: result.migrationId, resumed: result.resumed, moved: result.moved, rules: result.rules, warnings: result.warnings, plan: result.plan });
    } catch (error: any) {
      console.error("Error rolling the league over:", error);
      res.status(500).json({ error: "Failed to advance league year", details: error?.message || String(error) });
    }
  };
  app.post("/api/league/advance-year/preview", rolloverHandler(true));
  app.post("/api/league/advance-year", rolloverHandler(false));

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
      if (!(await requireCommissionerFor(req, res, oldLeagueId))) return;
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
      // The database viewer is a site admin tool: it needs the admin passcode.
      if (!(await requireAdmin(req, res))) return;

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
      // The database viewer is a site admin tool: it needs the admin passcode.
      if (!(await requireAdmin(req, res))) return;

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
      const leagueId = req.query.leagueId as string | undefined;
      const page = parseInt(req.query.page as string || "1", 10);
      const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 1000); // Max 1000 rows
      const offset = (page - 1) * limit;
      // The database viewer is a site admin tool: it needs the admin passcode.
      if (!(await requireAdmin(req, res))) return;

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
      const leagueId = req.query.leagueId as string | undefined;
      // The database viewer is a site admin tool: it needs the admin passcode.
      if (!(await requireAdmin(req, res))) return;

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
