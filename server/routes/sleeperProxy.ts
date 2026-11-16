// Health check, Sleeper proxy (users, leagues, rosters, drafts) and NFL state.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import {
  getSleeperUser,
  getUserLeagues,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getNFLState,
  getAllPlayers,
  getLeagueDrafts,
  getDraftPicks,
  getDraft,
  type SleeperLeagueUser,
  type SleeperPlayer,
} from "../sleeper";
import {
  dbErrorMessage,
  getEffectiveWeek,
} from "./shared";

export function registerSleeperProxyRoutes(app: Express): void {
  // ── Health check endpoint ──
  app.get("/api/health/db", async (_req, res) => {
    try {
      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1 AS ok`);
      res.json({ status: "connected", timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Health] DB connectivity check failed:", error);
      res.status(503).json({
        status: "error",
        message: dbErrorMessage(error),
        code: error?.code || null,
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // Get Sleeper user by username
  app.get("/api/sleeper/user/:username", async (req, res) => {
    try {
      const user = await getSleeperUser(req.params.username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        avatar: user.avatar,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Get user's leagues
  app.get("/api/sleeper/user/:userId/leagues", async (req, res) => {
    try {
      const season = req.query.season as string || new Date().getFullYear().toString();
      const leagues = await getUserLeagues(req.params.userId, season);
      res.json(leagues.map(league => ({
        leagueId: league.league_id,
        name: league.name,
        season: league.season,
        totalRosters: league.total_rosters,
        rosterPositions: league.roster_positions,
        playoffTeams: league.settings.playoff_teams,
        waiverBudget: league.settings.waiver_budget,
      })));
    } catch (error) {
      console.error("Error fetching leagues:", error);
      res.status(500).json({ error: "Failed to fetch leagues" });
    }
  });

  // Get league details
  app.get("/api/sleeper/league/:leagueId", async (req, res) => {
    try {
      const league = await getLeague(req.params.leagueId);
      res.json({
        leagueId: league.league_id,
        name: league.name,
        season: league.season,
        totalRosters: league.total_rosters,
        rosterPositions: league.roster_positions,
        playoffTeams: league.settings.playoff_teams,
        playoffWeekStart: (league.settings as any).playoff_week_start || 15,
        waiverBudget: league.settings.waiver_budget,
        commissionerId: league.owner_id,
      });
    } catch (error) {
      console.error("Error fetching league:", error);
      res.status(500).json({ error: "Failed to fetch league" });
    }
  });

  // Get league users
  app.get("/api/sleeper/league/:leagueId/users", async (req, res) => {
    try {
      const users = await getLeagueUsers(req.params.leagueId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching league users:", error);
      res.status(500).json({ error: "Failed to fetch league users" });
    }
  });

  // Get league rosters
  app.get("/api/sleeper/league/:leagueId/rosters", async (req, res) => {
    try {
      const rosters = await getLeagueRosters(req.params.leagueId);
      res.json(rosters);
    } catch (error) {
      console.error("Error fetching league rosters:", error);
      res.status(500).json({ error: "Failed to fetch league rosters" });
    }
  });

  // Get league drafts
  app.get("/api/sleeper/league/:leagueId/drafts", async (req, res) => {
    try {
      const drafts = await getLeagueDrafts(req.params.leagueId);
      res.json(drafts.map(draft => ({
        draftId: draft.draft_id,
        leagueId: draft.league_id,
        season: draft.season,
        status: draft.status,
        type: draft.type,
        rounds: draft.settings.rounds,
        startTime: draft.start_time,
        created: draft.created,
      })));
    } catch (error) {
      console.error("Error fetching league drafts:", error);
      res.status(500).json({ error: "Failed to fetch league drafts" });
    }
  });

  // Get draft picks
  app.get("/api/sleeper/draft/:draftId/picks", async (req, res) => {
    try {
      const [draft, picks] = await Promise.all([
        getDraft(req.params.draftId),
        getDraftPicks(req.params.draftId),
      ]);

      const [users, rosters] = await Promise.all([
        getLeagueUsers(draft.league_id),
        getLeagueRosters(draft.league_id),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterTeamMap = new Map<number, string>();
      rosters.forEach(r => {
        const user = userMap.get(r.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
        rosterTeamMap.set(r.roster_id, teamName);
      });

      // For historical drafts (2023/2024), compute yearsExp at draft time from current player data
      const draftSeason = draft.season ? parseInt(String(draft.season)) : new Date().getFullYear();
      const currentYear = new Date().getFullYear();
      const yearsSinceDraft = currentYear - draftSeason;
      const isHistoricalDraft = yearsSinceDraft >= 1 && (draftSeason === 2023 || draftSeason === 2024);

      let currentPlayers: Record<string, SleeperPlayer> | null = null;
      if (isHistoricalDraft) {
        try {
          currentPlayers = await getAllPlayers();
        } catch (e) {
          console.error("getAllPlayers failed for draft picks:", e);
        }
      }

      res.json(picks.map(pick => {
        let yearsExp: number;
        if (isHistoricalDraft && currentPlayers) {
          const p = currentPlayers[pick.player_id];
          const currentExp = p?.years_exp;
          if (currentExp !== undefined && currentExp !== null) {
            const exp = typeof currentExp === "string" ? parseInt(currentExp, 10) : Number(currentExp);
            yearsExp = Math.max(0, (isNaN(exp) ? 0 : exp) - yearsSinceDraft);
          } else {
            const meta = pick.metadata.years_exp;
            const metaExp = meta ? parseInt(String(meta), 10) : 0;
            yearsExp = metaExp >= yearsSinceDraft ? Math.max(0, metaExp - yearsSinceDraft) : (isNaN(metaExp) ? 0 : metaExp);
          }
        } else {
          const meta = pick.metadata.years_exp;
          yearsExp = meta ? parseInt(String(meta), 10) : 0;
          if (isNaN(yearsExp)) yearsExp = 0;
        }
        return {
        round: pick.round,
        rosterId: pick.roster_id,
        playerId: pick.player_id,
        pickedBy: pick.picked_by,
        pickNo: pick.pick_no,
        draftSlot: pick.draft_slot,
        playerName: `${pick.metadata.first_name} ${pick.metadata.last_name}`,
        position: pick.metadata.position,
        team: pick.metadata.team,
        fantasyTeam: rosterTeamMap.get(pick.roster_id) || `Team ${pick.roster_id}`,
          yearsExp,
        };
      }));
    } catch (error) {
      console.error("Error fetching draft picks:", error);
      res.status(500).json({ error: "Failed to fetch draft picks" });
    }
  });

  // Get NFL state (current week, season)
  app.get("/api/sleeper/nfl-state", async (_req, res) => {
    try {
      const state = await getNFLState();
      // For this endpoint, we don't have league context, so return raw NFL state
      // Callers can use getEffectiveWeek if they have league context
      res.json({
        week: state.week,
        season: state.season,
        seasonType: state.season_type,
        displayWeek: state.display_week,
      });
    } catch (error) {
      console.error("Error fetching NFL state:", error);
      res.status(500).json({ error: "Failed to fetch NFL state" });
    }
  });
  
  // Get effective NFL state with league context (includes effective week)
  app.get("/api/sleeper/league/:leagueId/nfl-state", async (req, res) => {
    try {
      const [state, league] = await Promise.all([
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);
      const effectiveWeek = getEffectiveWeek(state, league);
      res.json({
        week: state.week,
        effectiveWeek,
        season: state.season,
        leagueSeason: league?.season || null,
        seasonType: state.season_type,
        displayWeek: state.display_week,
      });
    } catch (error) {
      console.error("Error fetching NFL state:", error);
      res.status(500).json({ error: "Failed to fetch NFL state" });
    }
  });
}
