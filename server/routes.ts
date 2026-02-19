import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { createHash } from "crypto";
import os from "os";
import {
  getSleeperUser,
  getUserLeagues,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getLeagueTransactions,
  getAllLeagueTransactions,
  getTradedPicks,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  getPlayerProjections,
  getLeagueDrafts,
  getDraftPicks,
  getDraft,
  getWinnersBracket,
  getLosersBracket,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperPlayer,
  type SleeperTransaction,
  type SleeperTradedPick,
  type SleeperMatchup,
  type SleeperNFLState,
} from "./sleeper";
import type {
  TeamStanding,
  Transaction,
  MatchupTeam,
  RosterPlayer,
  PositionDepth,
  TradeHistoryItem,
  DraftPick,
  Position,
  PlayerBid,
} from "../shared/schema";

function getTeamInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function calculateGrade(percentAboveMedian: number): string {
  if (percentAboveMedian >= 50) return "A+";
  if (percentAboveMedian >= 35) return "A";
  if (percentAboveMedian >= 20) return "A-";
  if (percentAboveMedian >= 10) return "B+";
  if (percentAboveMedian >= 0) return "B";
  if (percentAboveMedian >= -10) return "B-";
  if (percentAboveMedian >= -20) return "C+";
  if (percentAboveMedian >= -35) return "C";
  if (percentAboveMedian >= -50) return "C-";
  return "D";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Helper: extract a useful error message for API responses
  function dbErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as any).code;
      if (code === "ENOTFOUND") return "Database host unreachable (DNS). Is the Supabase project active?";
      if (code === "ECONNREFUSED") return "Database connection refused. Check DATABASE_URL.";
      if (code === "3D000") return "Database does not exist. Check DATABASE_URL.";
      if (code === "42P01") return "Table does not exist. Run 'npm run db:push' to create tables.";
      if (code === "42703") return "Column does not exist. Run 'npm run db:push' to sync schema.";
      if (code === "28P01") return "Database authentication failed. Check password in DATABASE_URL.";
      return error.message;
    }
    return String(error);
  }

  // ── Health check endpoint ──
  app.get("/api/health/db", async (_req, res) => {
    try {
      const { db } = await import("./db");
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
  
  // Helper function to get effective week - handles offseason detection and capping
  const getEffectiveWeek = (nflState: SleeperNFLState, league: any): number => {
    const nflWeek = nflState.week;
    const nflSeason = nflState.season;
    const leagueSeason = league?.season;
    const seasonType = nflState.season_type;
    
    // Debug logging
    console.log(`[Effective Week] Input - nflWeek: ${nflWeek}, nflSeason: ${nflSeason}, leagueSeason: ${leagueSeason}, seasonType: ${seasonType}`);
    
    // Get playoff week start from league settings (default to 15 for standard leagues)
    const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
    const lastRegularSeasonWeek = playoffWeekStart - 1; // Typically 14
    
    // Normalize seasons to strings for comparison
    const leagueSeasonStr = leagueSeason ? leagueSeason.toString() : null;
    const nflSeasonStr = nflSeason ? nflSeason.toString() : null;
    
    // Check if we're viewing a past season (league season is before NFL season year)
    const leagueSeasonYear = leagueSeason ? parseInt(leagueSeasonStr!) : null;
    const nflSeasonYear = nflSeason ? parseInt(nflSeasonStr!) : null;
    const isPastSeason = leagueSeasonYear && nflSeasonYear && leagueSeasonYear < nflSeasonYear;
    
    // If viewing a past season, use the last regular season week (season is complete)
    if (isPastSeason) {
      console.log(`[Effective Week] Past season detected (league ${leagueSeason}, NFL ${nflSeason}). Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // If league has advanced to new season, use actual week
    if (leagueSeasonStr && nflSeasonStr && leagueSeasonStr !== nflSeasonStr) {
      console.log(`[Effective Week] League advanced (season ${leagueSeason} !== NFL ${nflSeason}). Using actual week ${nflWeek}.`);
      return nflWeek;
    }
    
    // Check if seasons match (for offseason detection)
    const seasonsMatch = leagueSeasonStr && nflSeasonStr && leagueSeasonStr === nflSeasonStr;
    
    // Get current date info
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12 (Jan = 1, Feb = 2, Mar = 3, ..., Dec = 12)
    const currentYear = currentDate.getFullYear();
    
    // SIMPLIFIED APPROACH: If week is 1-5 and it's NOT September-December (NFL regular season months), we're in offseason
    // NFL regular season runs September-December (months 9-12)
    // If we're at week 1-5 outside of those months, the season has ended and reset
    const isNFLRegularSeasonMonths = currentMonth >= 9 && currentMonth <= 12; // Sept-Dec
    const isLowWeek = nflWeek >= 1 && nflWeek <= 5;
    
    // Primary check: season_type explicitly indicates offseason
    const isOffseasonByType = seasonsMatch && (seasonType === "off" || seasonType === "post");
    
    // Secondary check: Low week (1-5) outside NFL regular season months = offseason
    // This is the most reliable indicator - if it's January-August and week is 1-5, season has ended
    // Exception: If it's September and week 1, it might be the start of a new season, so only apply if seasons don't match (indicating offseason)
    // If seasons match in September week 1, it's likely offseason reset from previous season
    if (isLowWeek && !isNFLRegularSeasonMonths && league && leagueSeasonStr) {
      console.log(`[Effective Week] Offseason detected: Week ${nflWeek} in month ${currentMonth} (outside Sept-Dec). Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // Also check: If it's September-October (months 9-10) and week is 1, but seasons match (league hasn't advanced),
    // it's likely offseason reset, not the start of a new season
    if (nflWeek === 1 && (currentMonth === 9 || currentMonth === 10) && seasonsMatch && league && leagueSeasonStr) {
      console.log(`[Effective Week] Offseason detected: Week 1 in ${currentMonth === 9 ? 'September' : 'October'} with matching seasons (likely offseason reset). Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // Tertiary check: season_type indicates offseason AND seasons match
    if (isOffseasonByType) {
      console.log(`[Effective Week] Offseason detected by season_type: ${seasonType}. Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // Quaternary check: Low week (1-3) with seasons matching (very likely offseason reset)
    // If seasons match and week is 1-3, the league hasn't advanced, so it's offseason reset
    if (seasonsMatch && nflWeek >= 1 && nflWeek <= 3) {
      console.log(`[Effective Week] Offseason detected: Week ${nflWeek} with matching seasons (league hasn't advanced). Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // Final aggressive check: If week is 1-2 and we have league data, assume offseason
    // (This catches any remaining edge cases)
    if (nflWeek >= 1 && nflWeek <= 2 && league && leagueSeasonStr) {
      console.log(`[Effective Week] Final aggressive check: Week ${nflWeek} with league data, assuming offseason. Using last regular season week ${lastRegularSeasonWeek}.`);
      return lastRegularSeasonWeek;
    }
    
    // If season is complete (week > 18) and league hasn't advanced (same season), cap at week 18
    if (nflWeek > 18 && seasonsMatch) {
      console.log(`[Effective Week] Season completed (week ${nflWeek}) but league hasn't advanced (season ${leagueSeason} === ${nflSeason}). Capping at week 18.`);
      return 18;
    }
    
    // Default: return the NFL week as-is
    console.log(`[Effective Week] Returning default NFL week: ${nflWeek} (seasonsMatch: ${seasonsMatch}, leagueSeason: ${leagueSeason}, nflSeason: ${nflSeason}, month: ${currentMonth})`);
    return nflWeek;
  };
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

  // Get draft position for a player from most recent completed rookie draft
  app.get("/api/league/:leagueId/player/:playerId/draft-position", async (req, res) => {
    try {
      const { leagueId, playerId } = req.params;
      
      // Get all completed drafts for the league, sorted by season descending.
      // Include rookie, linear, and snake types (Sleeper uses order type, not "rookie" for many leagues).
      const drafts = await getLeagueDrafts(leagueId);
      const completedDrafts = drafts
        .filter(d => d.status === "complete" && ["rookie", "linear", "snake"].includes(d.type))
        .sort((a, b) => parseInt(b.season) - parseInt(a.season));
      
      // Search through drafts from most recent to oldest
      for (const draft of completedDrafts) {
        const picks = await getDraftPicks(draft.draft_id);
        const playerPick = picks.find(p => String(p.player_id) === String(playerId));
        
        if (playerPick) {
          return res.json({
            round: playerPick.round,
            draftSlot: playerPick.draft_slot,
            season: draft.season,
            draftId: draft.draft_id
          });
        }
      }
      
      res.json({ round: null, draftSlot: null, season: null, draftId: null });
    } catch (error) {
      console.error("Error fetching draft position:", error);
      res.status(500).json({ error: "Failed to fetch draft position" });
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

  // Get league standings with streak calculation
  app.get("/api/sleeper/league/:leagueId/standings", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Fetch matchup history for streak calculation
      // Use effective week to cap at 18 if season completed but league hasn't advanced
      const currentWeek = getEffectiveWeek(nflState, league);
      const matchupHistory: Map<number, Array<{ week: number; won: boolean | null }>> = new Map();
      
      // Initialize matchup history for all rosters
      rosters.forEach(r => matchupHistory.set(r.roster_id, []));
      
      // Determine regular season weeks (PF and PA only include regular season, not playoffs)
      // Sleeper's fpts includes weeks 1 through (playoff_week_start - 1) only
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const regularSeasonWeeks = playoffWeekStart - 1; // Typically 14 weeks
      
      // Calculate completed regular season weeks matching PF/PA logic
      // PF and PA use: Math.min(currentWeek - 1, regularSeasonWeeks)
      // This ensures we only count completed weeks up to regular season end
      const completedRegularSeasonWeeks = Math.max(1, Math.min(currentWeek - 1, regularSeasonWeeks));
      
      // Fetch matchups for regular season weeks only (matching PF/PA calculation)
      const matchupPromises = [];
      for (let week = 1; week <= regularSeasonWeeks; week++) {
        matchupPromises.push(
          getLeagueMatchups(req.params.leagueId, week)
            .then(matchups => ({ week, matchups }))
            .catch(() => ({ week, matchups: [] })) // Handle weeks that don't exist yet
        );
      }
      
      const allMatchups = await Promise.all(matchupPromises);
      
      // Process matchups to determine win/loss for each team each week
      for (const { week, matchups } of allMatchups) {
        // Group matchups by matchup_id
        const matchupGroups = new Map<number, SleeperMatchup[]>();
        matchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) {
            matchupGroups.set(m.matchup_id, []);
          }
          matchupGroups.get(m.matchup_id)!.push(m);
        });
        
        // Determine winner/loser for each matchup
        matchupGroups.forEach(group => {
          if (group.length !== 2) return;
          const [team1, team2] = group;
          const score1 = team1.points || 0;
          const score2 = team2.points || 0;
          
          if (score1 === 0 && score2 === 0) return; // Unplayed game
          
          const history1 = matchupHistory.get(team1.roster_id);
          const history2 = matchupHistory.get(team2.roster_id);
          
          if (score1 > score2) {
            history1?.push({ week, won: true });
            history2?.push({ week, won: false });
          } else if (score2 > score1) {
            history1?.push({ week, won: false });
            history2?.push({ week, won: true });
          } else {
            history1?.push({ week, won: null }); // Tie
            history2?.push({ week, won: null });
          }
        });
      }
      
      // Calculate current streak for each team
      const calculateStreak = (history: Array<{ week: number; won: boolean | null }>): string => {
        if (history.length === 0) return "—";
        
        // Sort by week descending to get most recent first
        const sorted = [...history].sort((a, b) => b.week - a.week);
        
        let streak = 0;
        let streakType: boolean | null = sorted[0]?.won ?? null;
        
        for (const game of sorted) {
          if (game.won === streakType) {
            streak++;
          } else {
            break;
          }
        }
        
        if (streak === 0 || streakType === null) return "—";
        return streakType ? `W${streak}` : `L${streak}`;
      };

      // Calculate max points for each team (sum of optimal weekly lineups)
      // Wrap in try-catch to ensure standings still return even if Max PF calculation fails
      let calculatedMaxPoints = new Map<number, number>();
      
      try {
        const players = await getAllPlayers();

        // Fetch transactions for each week to build roster history
        // Use completedRegularSeasonWeeks to match PF/PA calculation
        const transactionPromises: Array<Promise<{ week: number; transactions: SleeperTransaction[] }>> = [];
        for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
          transactionPromises.push(
            getLeagueTransactions(req.params.leagueId, week)
              .then(transactions => ({ week, transactions }))
              .catch(error => {
                console.warn(`[Max PF] Error fetching transactions for week ${week}:`, error);
                return { week, transactions: [] };
              })
          );
        }
        const weeklyTransactions = await Promise.all(transactionPromises);

      // Map roster positions (exclude bench/IR/taxi since they don't affect optimal lineup)
      const rosterPositions = (league?.roster_positions || []).filter(pos => !["BN", "IR", "TAXI"].includes(pos));

      // Build roster composition per week (transactions apply forward; no changes to prior weeks)
      const buildRosterHistory = () => {
        const rosterState = new Map<number, Set<string>>();
        const rosterWeekly = new Map<number, Map<number, string[]>>();

        // Initialize with starting rosters
        rosters.forEach(r => {
          rosterState.set(r.roster_id, new Set(r.players || []));
          rosterWeekly.set(r.roster_id, new Map());
        });

        for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
          const transactionsForWeek = weeklyTransactions.find(w => w.week === week)?.transactions || [];

          // Apply transactions for this week (affects this week and future weeks)
          transactionsForWeek
            .filter(t => t.status === "complete")
            .forEach(t => {
              const adds = t.adds || {};
              const drops = t.drops || {};

              Object.entries(adds).forEach(([playerId, rosterId]) => {
                const state = rosterState.get(rosterId);
                if (state) state.add(playerId);
              });

              Object.entries(drops).forEach(([playerId, rosterId]) => {
                const state = rosterState.get(rosterId);
                if (state) state.delete(playerId);
              });
            });

          // Snapshot roster for this week after applying the week's transactions
          rosterState.forEach((state, rosterId) => {
            rosterWeekly.get(rosterId)?.set(week, Array.from(state));
          });
        }

        return rosterWeekly;
      };

      const rosterHistory = buildRosterHistory();

      // Fetch matchups for each completed week to get pre-calculated player points
      const weeklyMatchupsPromises: Array<Promise<{ week: number; matchups: SleeperMatchup[] }>> = [];
      for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
        weeklyMatchupsPromises.push(
          getLeagueMatchups(req.params.leagueId, week)
            .then(matchups => ({ week, matchups }))
            .catch(error => {
              console.warn(`[Max PF] Error fetching matchups for week ${week}:`, error);
              return { week, matchups: [] };
            })
        );
      }
      const weeklyMatchupsResults = await Promise.all(weeklyMatchupsPromises);
      const weeklyMatchupsMap = new Map<number, SleeperMatchup[]>();
      weeklyMatchupsResults.forEach(({ week, matchups }) => {
        weeklyMatchupsMap.set(week, matchups);
      });

      // Build a lookup map: week -> roster_id -> matchup
      const matchupByRosterAndWeek = new Map<number, Map<number, SleeperMatchup>>();
      weeklyMatchupsMap.forEach((matchups, week) => {
        const weekMap = new Map<number, SleeperMatchup>();
        matchups.forEach(matchup => {
          weekMap.set(matchup.roster_id, matchup);
        });
        matchupByRosterAndWeek.set(week, weekMap);
      });

      // Build weekly player points per roster from matchup data
      const rosterWeeklyPoints = new Map<number, Map<number, Record<string, number>>>();
      for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
        const weekMatchups = matchupByRosterAndWeek.get(week) || new Map();
        
        rosters.forEach(roster => {
          const weekRoster = rosterHistory.get(roster.roster_id)?.get(week) || [];
          const matchup = weekMatchups.get(roster.roster_id);
          const playersPoints = matchup?.players_points || {};
          
          if (!rosterWeeklyPoints.has(roster.roster_id)) {
            rosterWeeklyPoints.set(roster.roster_id, new Map());
          }
          
          const weekPoints: Record<string, number> = {};
          weekRoster.forEach(playerId => {
            // Use pre-calculated points from matchup, default to 0 if player didn't play
            weekPoints[playerId] = typeof playersPoints[playerId] === 'number' ? playersPoints[playerId] : 0;
          });
          
          rosterWeeklyPoints.get(roster.roster_id)!.set(week, weekPoints);
        });
      }

      const isEligibleForSlot = (position: string, slot: string) => {
        if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
        if (slot === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
        if (slot === "WRRB") return ["WR", "RB"].includes(position);
        if (slot === "WRRBTE") return ["WR", "RB", "TE"].includes(position);
        return position === slot;
      };

      const buildSlotOrder = (slots: string[]) => {
        const priority = ["QB", "RB", "WR", "TE", "K", "DEF"];
        const flexes = ["SUPER_FLEX", "WRRBTE", "WRRB", "FLEX"];
        const fixed = slots.filter(s => priority.includes(s));
        const remaining = slots.filter(s => !priority.includes(s) && flexes.includes(s));
        return [...fixed, ...remaining];
      };

      const slotOrder = buildSlotOrder(rosterPositions);

      const calculateOptimalLineup = (
        playerIds: string[],
        playerPoints: Record<string, number>,
        slots: string[]
      ): number => {
        const used = new Set<string>();
        let total = 0;

        for (const slot of slots) {
          const best = playerIds
            .filter(pid => !used.has(pid))
            .map(pid => {
              const player = players[pid];
              const position = player?.position || "FLEX";
              const points = playerPoints[pid] ?? 0;
              return { pid, position, points };
            })
            .filter(p => isEligibleForSlot(p.position, slot))
            .sort((a, b) => b.points - a.points)[0];

          if (best) {
            used.add(best.pid);
            total += best.points || 0;
          }
        }

        return total;
      };

      // Calculate max points for each roster by summing optimal weekly lineups
      // Max PF is the sum of all completed weeks max PF for weeks 1-14
      const maxPFWeeks = 14; // Always sum weeks 1-14 (or up to completed weeks if less)
      const weeksToSum = Math.min(completedRegularSeasonWeeks, maxPFWeeks);
      console.log(`[Max PF] Regular season weeks: ${regularSeasonWeeks}, Completed regular season weeks: ${completedRegularSeasonWeeks}, Weeks to sum: ${weeksToSum}, Current week: ${currentWeek}`);
      
      rosters.forEach(roster => {
        let total = 0;
        const weeklyMap = rosterHistory.get(roster.roster_id) || new Map();
        const weeklyMaxPoints: number[] = []; // Track per-week values for validation

        // Sum optimal weekly lineup points for all completed weeks up to week 14
        for (let week = 1; week <= weeksToSum; week++) {
          const weekRoster = weeklyMap.get(week) || [];
          const weekPoints = rosterWeeklyPoints.get(roster.roster_id)?.get(week) || {};
          
          // Calculate optimal lineup for this week
          const weekMax = calculateOptimalLineup(weekRoster, weekPoints, slotOrder);
          
          // Validate weekMax is a valid number
          if (typeof weekMax !== 'number' || isNaN(weekMax)) {
            console.warn(`[Max PF] Invalid weekMax for roster ${roster.roster_id}, week ${week}: ${weekMax}`);
            continue; // Skip invalid weeks
          }
          
          weeklyMaxPoints.push(weekMax);
          total += weekMax;
        }

        // Validate total is reasonable (should be positive and greater than actual PF)
        if (total < 0 || isNaN(total)) {
          console.warn(`[Max PF] Invalid total for roster ${roster.roster_id}: ${total}`);
          total = 0;
        }

        calculatedMaxPoints.set(roster.roster_id, total);
        
        // Log per-week breakdown for first roster (for debugging)
        if (roster.roster_id === rosters[0]?.roster_id && weeklyMaxPoints.length > 0) {
          const user = userMap.get(roster.owner_id);
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
          console.log(`[Max PF] ${teamName} (roster ${roster.roster_id}) weekly breakdown:`, 
            weeklyMaxPoints.map((pts, idx) => `Week ${idx + 1}: ${pts.toFixed(1)}`).join(', '),
            `Total: ${total.toFixed(1)}`
          );
        }
      });
      
      // Debug logging
      if (calculatedMaxPoints.size > 0) {
        console.log(`[Max PF] Calculated max points for ${calculatedMaxPoints.size} rosters using matchup points`);
        // Log a sample team's calculation
        const sampleRosterId = rosters[0]?.roster_id;
        if (sampleRosterId && calculatedMaxPoints.has(sampleRosterId)) {
          const sampleMax = calculatedMaxPoints.get(sampleRosterId)!;
          const sampleActual = rosters.find(r => r.roster_id === sampleRosterId);
          const sampleActualPF = sampleActual ? sampleActual.settings.fpts + (sampleActual.settings.fpts_decimal || 0) / 100 : 0;
          console.log(`[Max PF] Sample team (roster ${sampleRosterId}): Max PF = ${sampleMax.toFixed(1)}, Actual PF = ${sampleActualPF.toFixed(1)}, Ratio = ${sampleMax > 0 ? (sampleActualPF / sampleMax * 100).toFixed(1) : 0}%`);
        }
      }
      } catch (maxPfError) {
        // If Max PF calculation fails, log error but continue with standings
        // This ensures standings data still populates even if Max PF calculation has issues
        console.error(`[Max PF] Error calculating max points, continuing without Max PF:`, maxPfError);
        calculatedMaxPoints = new Map<number, number>(); // Empty map, Max PF will be undefined
      }

      const standings: TeamStanding[] = rosters
        .map((roster) => {
          const user = userMap.get(roster.owner_id);
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
          const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
          const pointsAgainst = (roster.settings.fpts_against || 0) + (roster.settings.fpts_against_decimal || 0) / 100;
          const history = matchupHistory.get(roster.roster_id) || [];
          const avatarId = user?.avatar;
          const avatar = avatarId 
            ? `https://sleepercdn.com/avatars/thumbs/${avatarId}`
            : null;
          
          // Calculated max points from optimal weekly lineups (sum of optimal lineup points for each week)
          const maxPointsFor = calculatedMaxPoints.get(roster.roster_id);
          
          // Validate maxPointsFor is a valid number before including in response
          const validMaxPointsFor = (maxPointsFor !== undefined && 
                                     typeof maxPointsFor === 'number' && 
                                     !isNaN(maxPointsFor) && 
                                     maxPointsFor >= 0) 
                                     ? maxPointsFor 
                                     : undefined;

          return {
            rosterId: roster.roster_id,
            rank: 0,
            name: teamName,
            initials: getTeamInitials(teamName),
            ownerId: roster.owner_id,
            avatar,
            wins: roster.settings.wins,
            losses: roster.settings.losses,
            ties: roster.settings.ties,
            pointsFor,
            pointsAgainst,
            maxPointsFor: validMaxPointsFor,
            isUser: roster.owner_id === userId,
            streak: calculateStreak(history),
          };
        })
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pointsFor - a.pointsFor;
        })
        .map((team, index) => ({ ...team, rank: index + 1 }));

      res.json(standings);
    } catch (error) {
      console.error("Error fetching standings:", error);
      res.status(500).json({ error: "Failed to fetch standings" });
    }
  });

  // Get current matchup for a user's team
  app.get("/api/sleeper/league/:leagueId/matchup", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const week = parseInt(req.query.week as string) || 1;
      
      const [matchups, rosters, users, players] = await Promise.all([
        getLeagueMatchups(req.params.leagueId, week),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterMap = new Map<number, SleeperRoster>();
      rosters.forEach(r => rosterMap.set(r.roster_id, r));

      const userRoster = rosters.find(r => r.owner_id === userId);
      if (!userRoster) {
        return res.status(404).json({ error: "User roster not found" });
      }

      const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id);
      if (!userMatchup) {
        return res.status(404).json({ error: "Matchup not found" });
      }

      const opponentMatchup = matchups.find(
        m => m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
      );

      const buildMatchupTeam = (matchup: typeof userMatchup, roster: SleeperRoster): MatchupTeam => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        const starterNames = (matchup.starters || []).map(pid => {
          const player = players[pid];
          return player ? `${player.first_name} ${player.last_name}` : pid;
        });

        return {
          rosterId: roster.roster_id,
          name: teamName,
          initials: getTeamInitials(teamName),
          projectedScore: matchup.points || 0,
          actualScore: matchup.points,
          record: `${roster.settings.wins}-${roster.settings.losses}`,
          starters: starterNames,
        };
      };

      const userTeam = buildMatchupTeam(userMatchup, userRoster);
      const opponentRoster = opponentMatchup ? rosterMap.get(opponentMatchup.roster_id) : null;
      const opponentTeam = opponentMatchup && opponentRoster 
        ? buildMatchupTeam(opponentMatchup, opponentRoster)
        : null;

      res.json({ userTeam, opponentTeam, week });
    } catch (error) {
      console.error("Error fetching matchup:", error);
      res.status(500).json({ error: "Failed to fetch matchup" });
    }
  });

  // Cache for player weekly stats (keyed by season)
  const playerStatsCache: Map<string, { 
    data: Map<string, number[]>; // playerId -> array of weekly points
    timestamp: number;
  }> = new Map();
  const STATS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Get detailed matchup for a user's team with full roster information
  app.get("/api/sleeper/league/:leagueId/matchup-detail", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const week = parseInt(req.query.week as string) || 1;
      
      // Fetch matchups with error handling - week might not exist yet
      let matchups: SleeperMatchup[];
      try {
        matchups = await getLeagueMatchups(req.params.leagueId, week);
      } catch (error) {
        console.warn(`[Matchup Detail] Error fetching matchups for week ${week}:`, error);
        matchups = []; // Return empty array if week doesn't exist
      }
      
      const [rosters, users, players, nflState, league] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterMap = new Map<number, SleeperRoster>();
      rosters.forEach(r => rosterMap.set(r.roster_id, r));

      const userRoster = rosters.find(r => r.owner_id === userId);
      if (!userRoster) {
        return res.status(404).json({ error: "User roster not found" });
      }

      const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id);
      if (!userMatchup || matchups.length === 0) {
        return res.status(404).json({ error: "Matchup not found for this week" });
      }

      const opponentMatchup = matchups.find(
        m => m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
      );

      // Collect all player IDs from both teams for stats lookup
      const allPlayerIds = new Set<string>();
      const addPlayers = (matchup: typeof userMatchup, roster: SleeperRoster) => {
        (matchup.starters || []).forEach(pid => allPlayerIds.add(pid));
        (roster.players || []).forEach(pid => allPlayerIds.add(pid));
      };
      addPlayers(userMatchup, userRoster);
      if (opponentMatchup && rosterMap.get(opponentMatchup.roster_id)) {
        addPlayers(opponentMatchup, rosterMap.get(opponentMatchup.roster_id)!);
      }

      // Fetch historical player stats for personalized boom-bust calculation
      const season = league?.season || nflState.season;
      const currentWeek = getEffectiveWeek(nflState, league);
      const weeksToFetch = Math.min(currentWeek, 8); // Last 8 weeks max
      
      // Check cache
      const cacheKey = `${season}`;
      const cached = playerStatsCache.get(cacheKey);
      let playerWeeklyPoints: Map<string, number[]>;
      
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        playerWeeklyPoints = cached.data;
      } else {
        // Fetch weekly stats for the season
        playerWeeklyPoints = new Map();
        const startWeek = Math.max(1, currentWeek - weeksToFetch + 1);
        
        const weeklyStatsPromises = [];
        for (let w = startWeek; w <= currentWeek; w++) {
          weeklyStatsPromises.push(
            getPlayerStats(season, w).catch(() => ({}))
          );
        }
        
        const weeklyStatsResults = await Promise.all(weeklyStatsPromises);
        
        // Aggregate points per player across weeks
        weeklyStatsResults.forEach((weekStats) => {
          Object.entries(weekStats).forEach(([playerId, stats]) => {
            // Use pts_ppr if available, otherwise calculate from common stats
            const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
            if (pts > 0) {
              if (!playerWeeklyPoints.has(playerId)) {
                playerWeeklyPoints.set(playerId, []);
              }
              playerWeeklyPoints.get(playerId)!.push(pts);
            }
          });
        });
        
        // Update cache
        playerStatsCache.set(cacheKey, {
          data: playerWeeklyPoints,
          timestamp: Date.now(),
        });
      }

      // 2025 NFL bye week schedule
      const byeWeeks: Record<number, string[]> = {
        5: ["ATL", "CHI", "GB", "PIT"],
        6: ["HOU", "MIN"],
        7: ["BAL", "BUF"],
        8: ["ARI", "DET", "JAX", "LV", "LAR", "SEA"],
        9: ["CLE", "NYJ", "PHI", "TB"],
        10: ["CIN", "DAL", "KC", "TEN"],
        11: ["IND", "NO"],
        12: ["DEN", "LAC", "MIA", "WAS"],
        14: ["CAR", "NE", "NYG", "SF"],
      };

      // Status values that mean the player won't play
      const inactiveStatuses = ["Out", "IR", "PUP", "Sus", "NFI", "COV", "Injured Reserve"];

      // Position baseline stats for fallback
      const positionBaselines: Record<string, { mean: number; stdDev: number }> = {
        QB: { mean: 18, stdDev: 6 },
        RB: { mean: 12, stdDev: 6 },
        WR: { mean: 11, stdDev: 6 },
        TE: { mean: 8, stdDev: 5 },
        K: { mean: 8, stdDev: 3 },
        DEF: { mean: 7, stdDev: 4 },
      };

      // Helper to calculate mean and standard deviation
      const calcStats = (values: number[]): { mean: number; stdDev: number } => {
        if (values.length === 0) return { mean: 0, stdDev: 0 };
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (values.length === 1) return { mean, stdDev: mean * 0.3 }; // Estimate stdDev as 30% of mean for single game
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        return { mean, stdDev: Math.sqrt(variance) };
      };

      const buildPlayerInfo = (playerId: string, points: number = 0) => {
        const player = players[playerId];
        const position = player?.position || "FLEX";
        const positionBase = positionBaselines[position] || { mean: 10, stdDev: 5 };
        const playerTeam = player?.team || "";
        const injuryStatus = player?.injury_status || null;
        
        // Check if player is inactive (Out, IR, PUP, etc.) or on bye
        const isInactive = injuryStatus && inactiveStatuses.includes(injuryStatus);
        const teamsOnBye = byeWeeks[week] || [];
        const isOnBye = playerTeam && teamsOnBye.includes(playerTeam);
        
        // Player has already started playing if they have actual points > 0
        const hasStartedPlaying = points > 0;
        
        // Only treat as "will not play" if inactive/bye AND hasn't started playing yet
        // If player started playing but status changed to Out/Questionable mid-game,
        // we still want to show their pre-game projections
        const willNotPlay = (isInactive || isOnBye) && !hasStartedPlaying;
        
        // Get player's historical points
        const weeklyPoints = playerWeeklyPoints.get(playerId) || [];
        const gamesPlayed = weeklyPoints.length;
        
        let boom: number;
        let bust: number;
        let projectedPoints: number;
        
        if (willNotPlay) {
          // Player is out, IR, PUP, or on bye and hasn't started playing - project 0
          boom = 0;
          bust = 0;
          projectedPoints = 0;
        } else if (gamesPlayed >= 3) {
          // Sufficient data - use player's actual stats
          const { mean, stdDev } = calcStats(weeklyPoints);
          boom = Math.round((mean + 1.25 * stdDev) * 10) / 10;
          bust = Math.max(0, Math.round((mean - 1.0 * stdDev) * 10) / 10);
          projectedPoints = Math.round(mean * 10) / 10;
        } else if (gamesPlayed > 0) {
          // Limited data - blend player stats with position baseline
          const { mean: playerMean, stdDev: playerStdDev } = calcStats(weeklyPoints);
          const blendWeight = gamesPlayed / 3; // 0.33 for 1 game, 0.67 for 2 games
          const blendedMean = playerMean * blendWeight + positionBase.mean * (1 - blendWeight);
          const blendedStdDev = playerStdDev * blendWeight + positionBase.stdDev * (1 - blendWeight);
          boom = Math.round((blendedMean + 1.25 * blendedStdDev) * 10) / 10;
          bust = Math.max(0, Math.round((blendedMean - 1.0 * blendedStdDev) * 10) / 10);
          projectedPoints = Math.round(blendedMean * 10) / 10;
        } else {
          // No data - use position baseline
          boom = Math.round((positionBase.mean + 1.25 * positionBase.stdDev) * 10) / 10;
          bust = Math.max(0, Math.round((positionBase.mean - 1.0 * positionBase.stdDev) * 10) / 10);
          projectedPoints = Math.round(positionBase.mean * 10) / 10;
        }

        return {
          id: playerId,
          name: player ? `${player.first_name} ${player.last_name}` : playerId,
          position,
          team: playerTeam,
          points,
          projectedPoints,
          boom,
          bust,
          gamesPlayed,
          status: injuryStatus,
          isOnBye,
        };
      };

      // Determine if we should use actual lineup or build an optimized one
      // Use actual lineup for current week and past weeks only
      // Future weeks get optimized lineups based on projections
      const shouldUseActualLineup = () => {
        return week <= currentWeek;
      };

      const buildDetailedMatchupTeam = (matchup: typeof userMatchup, roster: SleeperRoster) => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        
        const starterIds = matchup.starters || [];
        const playerPoints = matchup.players_points || {};
        const allRosterIds = roster.players || [];
        const benchIds = allRosterIds.filter(pid => !starterIds.includes(pid));
        
        // Build info for all players first
        // Include all players from current roster AND all players from matchup starters
        // (in case a player started but is no longer on the roster, or vice versa)
        const allPlayersInfo = new Map<string, ReturnType<typeof buildPlayerInfo>>();
        const allPlayerIdsToProcess = new Set([...allRosterIds, ...starterIds]);
        
        allPlayerIdsToProcess.forEach(pid => {
          // Only build player info if we haven't already added it
          if (!allPlayersInfo.has(pid)) {
            // Ensure points is always a number (default to 0)
            const points = typeof playerPoints[pid] === 'number' ? playerPoints[pid] : 0;
            allPlayersInfo.set(pid, buildPlayerInfo(pid, points));
          }
        });
        
        // Helper to check if a player can play (not inactive and not on bye)
        const canPlay = (playerInfo: ReturnType<typeof buildPlayerInfo>) => {
          return !playerInfo.status && !playerInfo.isOnBye;
        };
        
        // Helper to check if a player is eligible for a position
        const isEligibleForPosition = (playerInfo: ReturnType<typeof buildPlayerInfo>, slotPosition: string) => {
          const pos = playerInfo.position;
          if (slotPosition === "FLEX") {
            return ["RB", "WR", "TE"].includes(pos);
          }
          return pos === slotPosition;
        };
        
        // Define slot order with their eligible positions
        const slotPositions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"];
        
        let finalStarters: ReturnType<typeof buildPlayerInfo>[];
        let bench: ReturnType<typeof buildPlayerInfo>[];
        
        if (!shouldUseActualLineup()) {
          // FUTURE WEEK with no lineup set: Use best/optimized roster based on projections
          // Build optimized starters by selecting best players for each position
          const usedPlayerIds = new Set<string>();
          finalStarters = [];
          
          // For each slot, find the best available player
          for (const slotPos of slotPositions) {
            const eligiblePlayers = allRosterIds
              .filter(pid => !usedPlayerIds.has(pid))
              .map(pid => allPlayersInfo.get(pid))
              .filter((p): p is ReturnType<typeof buildPlayerInfo> => p !== undefined)
              .filter(p => canPlay(p) && isEligibleForPosition(p, slotPos))
              .sort((a, b) => b.projectedPoints - a.projectedPoints);
            
            if (eligiblePlayers.length > 0) {
              const bestPlayer = eligiblePlayers[0];
              finalStarters.push(bestPlayer);
              usedPlayerIds.add(bestPlayer.id);
            } else {
              // No eligible player found, try to find any player for this position (even if out/bye)
              const anyPlayer = allRosterIds
                .filter(pid => !usedPlayerIds.has(pid))
                .map(pid => allPlayersInfo.get(pid))
                .filter((p): p is ReturnType<typeof buildPlayerInfo> => p !== undefined)
                .filter(p => isEligibleForPosition(p, slotPos))
                .sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
              
              if (anyPlayer) {
                finalStarters.push(anyPlayer);
                usedPlayerIds.add(anyPlayer.id);
              }
            }
          }
          
          // Build bench from remaining players
          bench = allRosterIds
            .filter(pid => !usedPlayerIds.has(pid))
            .map(pid => allPlayersInfo.get(pid))
            .filter((p): p is ReturnType<typeof buildPlayerInfo> => p !== undefined);
        } else {
          // CURRENT/PAST WEEK: Use exact roster as set by the manager in Sleeper
          // Do NOT replace any players - show the actual lineup the user set
          // Filter out any undefined values in case a player ID doesn't exist in allPlayersInfo
          finalStarters = starterIds
            .map(pid => allPlayersInfo.get(pid))
            .filter((p): p is ReturnType<typeof buildPlayerInfo> => p !== undefined);
          
          // Build bench from remaining players
          bench = benchIds
            .map(pid => allPlayersInfo.get(pid))
            .filter((p): p is ReturnType<typeof buildPlayerInfo> => p !== undefined);
        }

        // Calculate projected team total from final starters
        // For current/past weeks: use actual points if player has already played, otherwise use projected
        // For future weeks: always use projected points
        const isCurrentOrPastWeek = week <= currentWeek;
        const projectedTotal = finalStarters.reduce((sum, p) => {
          if (!p) return sum;
          // If current/past week and player has scored points, use actual score
          if (isCurrentOrPastWeek && p.points > 0) {
            return sum + p.points;
          }
          // Otherwise use projected
          return sum + (p.projectedPoints || 0);
        }, 0);

        // Build avatar URL from Sleeper CDN
        const avatarId = user?.avatar;
        const avatarUrl = avatarId 
          ? `https://sleepercdn.com/avatars/thumbs/${avatarId}`
          : null;

        return {
          rosterId: roster.roster_id,
          name: teamName,
          initials: getTeamInitials(teamName),
          avatar: avatarUrl,
          score: matchup.points || 0,
          projectedTotal: Math.round(projectedTotal * 10) / 10,
          record: `${roster.settings.wins}-${roster.settings.losses}`,
          starters: finalStarters,
          bench,
        };
      };

      const userTeam = buildDetailedMatchupTeam(userMatchup, userRoster);
      const opponentRoster = opponentMatchup ? rosterMap.get(opponentMatchup.roster_id) : null;
      const opponentTeam = opponentMatchup && opponentRoster 
        ? buildDetailedMatchupTeam(opponentMatchup, opponentRoster)
        : null;

      // Calculate Max PF for the selected week (only for completed weeks)
      let userMaxPF: number | undefined = undefined;
      let opponentMaxPF: number | undefined = undefined;
      
      if (week <= currentWeek) {
        try {
          // Map roster positions (exclude bench/IR/taxi since they don't affect optimal lineup)
          const rosterPositions = (league?.roster_positions || []).filter(pos => !["BN", "IR", "TAXI"].includes(pos));
          
          // Helper functions for optimal lineup calculation
          const isEligibleForSlot = (position: string, slot: string) => {
            if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
            if (slot === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(position);
            if (slot === "WRRB") return ["WR", "RB"].includes(position);
            if (slot === "WRRBTE") return ["WR", "RB", "TE"].includes(position);
            return position === slot;
          };

          const buildSlotOrder = (slots: string[]) => {
            const priority = ["QB", "RB", "WR", "TE", "K", "DEF"];
            const flexes = ["SUPER_FLEX", "WRRBTE", "WRRB", "FLEX"];
            const fixed = slots.filter(s => priority.includes(s));
            const remaining = slots.filter(s => !priority.includes(s) && flexes.includes(s));
            return [...fixed, ...remaining];
          };

          const slotOrder = buildSlotOrder(rosterPositions);

          const calculateOptimalLineup = (
            playerIds: string[],
            playerPoints: Record<string, number>,
            slots: string[]
          ): number => {
            if (!playerIds || playerIds.length === 0) return 0;
            
            const used = new Set<string>();
            let total = 0;

            for (const slot of slots) {
              const best = playerIds
                .filter(pid => !used.has(pid))
                .map(pid => {
                  const player = players[pid];
                  const position = player?.position || "FLEX";
                  const points = playerPoints[pid] ?? 0;
                  return { pid, position, points };
                })
                .filter(p => isEligibleForSlot(p.position, slot))
                .sort((a, b) => b.points - a.points)[0];

              if (best) {
                used.add(best.pid);
                total += best.points || 0;
              }
            }

            return total;
          };

          // Build roster history for the selected week
          // Fetch transactions up to the selected week
          const transactionPromises: Array<Promise<{ week: number; transactions: SleeperTransaction[] }>> = [];
          for (let w = 1; w <= week; w++) {
            transactionPromises.push(
              getLeagueTransactions(req.params.leagueId, w)
                .then(transactions => ({ week: w, transactions }))
                .catch(error => {
                  console.warn(`[Matchup Detail Max PF] Error fetching transactions for week ${w}:`, error);
                  return { week: w, transactions: [] };
                })
            );
          }
          const weeklyTransactions = await Promise.all(transactionPromises);

          // Build roster state for the selected week
          // Use matchup.players if available (most accurate), otherwise build from transactions
          const getRosterForWeek = (roster: SleeperRoster, matchup: SleeperMatchup | null): string[] => {
            // If matchup has players field, use it directly (most accurate)
            if (matchup?.players && Array.isArray(matchup.players)) {
              return matchup.players;
            }

            // Otherwise, build roster by applying transactions chronologically
            // Initialize with current roster as baseline
            const rosterState = new Set<string>(roster.players || []);

            // Apply transactions chronologically from week 1 to the selected week
            for (let w = 1; w <= week; w++) {
              const transactionsForWeek = weeklyTransactions.find(t => t.week === w)?.transactions || [];
              transactionsForWeek
                .filter(t => t.status === "complete")
                .forEach(t => {
                  const adds = t.adds || {};
                  const drops = t.drops || {};

                  // Apply adds for this roster
                  Object.entries(adds).forEach(([playerId, rosterId]) => {
                    if (Number(rosterId) === roster.roster_id) {
                      rosterState.add(playerId);
                    }
                  });

                  // Apply drops for this roster
                  Object.entries(drops).forEach(([playerId, rosterId]) => {
                    if (Number(rosterId) === roster.roster_id) {
                      rosterState.delete(playerId);
                    }
                  });
                });
            }

            return Array.from(rosterState);
          };

          // Helper function to build player points map with fallback to player stats API
          const buildPlayerPointsMap = async (
            roster: string[],
            matchup: SleeperMatchup | null,
            week: number,
            season: string
          ): Promise<Record<string, number>> => {
            const pointsMap: Record<string, number> = {};
            
            // Check if players_points is available and has data
            const hasPlayersPoints = matchup?.players_points && 
                                   typeof matchup.players_points === 'object' && 
                                   Object.keys(matchup.players_points).length > 0;
            
            // Try to use players_points first
            if (hasPlayersPoints) {
              roster.forEach(playerId => {
                const points = matchup!.players_points![playerId];
                pointsMap[playerId] = typeof points === 'number' ? points : 0;
              });
              
              // Check if we have points for all players (or at least most of them)
              const playersWithPoints = Object.values(pointsMap).filter(p => p > 0).length;
              const hasCompleteData = playersWithPoints > 0 && (playersWithPoints / roster.length) > 0.3; // At least 30% have points
              
              if (hasCompleteData) {
                return pointsMap;
              }
            }
            
            // Fallback: fetch player stats for this week
            try {
              const weekStats = await getPlayerStats(season, week);
              
              roster.forEach(playerId => {
                // Use matchup.players_points if available, otherwise use fetched stats
                if (hasPlayersPoints && typeof matchup!.players_points![playerId] === 'number') {
                  pointsMap[playerId] = matchup!.players_points![playerId];
                } else if (weekStats[playerId]) {
                  const playerStats = weekStats[playerId] as any;
                  // Use pts_ppr if available, otherwise fallback to half_ppr or std
                  pointsMap[playerId] = playerStats.pts_ppr || playerStats.pts_half_ppr || playerStats.pts_std || 0;
                } else {
                  pointsMap[playerId] = 0;
                }
              });
            } catch (error) {
              console.warn(`[Matchup Detail Max PF] Could not fetch player stats for week ${week}, using available data:`, error);
              // Continue with whatever points we have (may be 0 for missing players)
            }
            
            return pointsMap;
          };

          // Calculate Max PF for user team
          const userWeekRoster = getRosterForWeek(userRoster, userMatchup);
          if (userWeekRoster.length > 0) {
            const userWeekPoints = await buildPlayerPointsMap(userWeekRoster, userMatchup, week, season);
            userMaxPF = calculateOptimalLineup(userWeekRoster, userWeekPoints, slotOrder);
          }

          // Calculate Max PF for opponent team (if exists)
          if (opponentMatchup && opponentRoster) {
            const opponentWeekRoster = getRosterForWeek(opponentRoster, opponentMatchup);
            if (opponentWeekRoster.length > 0) {
              const opponentWeekPoints = await buildPlayerPointsMap(opponentWeekRoster, opponentMatchup, week, season);
              opponentMaxPF = calculateOptimalLineup(opponentWeekRoster, opponentWeekPoints, slotOrder);
            }
          }
        } catch (error) {
          console.error(`[Matchup Detail Max PF] Error calculating Max PF for week ${week}:`, error);
          // Continue without Max PF rather than failing entire request
        }
      }

      // Add Max PF to team objects
      const userTeamWithMaxPF = { ...userTeam, maxPointsFor: userMaxPF };
      const opponentTeamWithMaxPF = opponentTeam ? { ...opponentTeam, maxPointsFor: opponentMaxPF } : null;

      res.json({ userTeam: userTeamWithMaxPF, opponentTeam: opponentTeamWithMaxPF, week });
    } catch (error) {
      console.error("Error fetching detailed matchup:", error);
      res.status(500).json({ error: "Failed to fetch detailed matchup" });
    }
  });

  // Get recent transactions
  app.get("/api/sleeper/league/:leagueId/transactions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const state = await getNFLState();
      
      const [allTransactions, rosters, users, players] = await Promise.all([
        getAllLeagueTransactions(req.params.leagueId, state.week),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterMap = new Map<number, SleeperRoster>();
      rosters.forEach(r => rosterMap.set(r.roster_id, r));

      const transactions: Transaction[] = allTransactions
        .filter(t => t.status === "complete")
        .slice(0, limit)
        .map((t) => {
          const rosterId = t.roster_ids[0];
          const roster = rosterMap.get(rosterId);
          const user = roster ? userMap.get(roster.owner_id) : null;
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`;

          const playerChanges: Transaction["players"] = [];
          if (t.adds) {
            Object.keys(t.adds).forEach(pid => {
              const player = players[pid];
              playerChanges.push({
                name: player ? `${player.first_name} ${player.last_name}` : pid,
                action: "added",
              });
            });
          }
          if (t.drops) {
            Object.keys(t.drops).forEach(pid => {
              const player = players[pid];
              playerChanges.push({
                name: player ? `${player.first_name} ${player.last_name}` : pid,
                action: "dropped",
              });
            });
          }

          let type: Transaction["type"] = "add";
          let description = "";
          
          if (t.type === "trade") {
            type = "trade";
            description = "Completed trade";
          } else if (t.type === "waiver") {
            type = "waiver";
            const budget = t.waiver_budget?.[0];
            description = budget ? `Won waiver claim for $${budget.amount} FAAB` : "Won waiver claim";
          } else if (t.adds && !t.drops) {
            type = "add";
            description = "Added from free agency";
          } else if (t.drops && !t.adds) {
            type = "drop";
            description = "Released to waivers";
          } else {
            description = "Roster move";
          }

          return {
            id: t.transaction_id,
            type,
            teamName,
            teamInitials: getTeamInitials(teamName),
            description,
            timestamp: formatTimeAgo(t.status_updated),
            players: playerChanges,
          };
        });

      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Get trade history
  app.get("/api/sleeper/league/:leagueId/trades", async (req, res) => {
    try {
      const state = await getNFLState();
      
      const [allTransactions, rosters, users, players] = await Promise.all([
        getAllLeagueTransactions(req.params.leagueId, state.week),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterMap = new Map<number, SleeperRoster>();
      rosters.forEach(r => rosterMap.set(r.roster_id, r));

      const trades: TradeHistoryItem[] = allTransactions
        .filter(t => t.type === "trade" && t.status === "complete")
        .map((t) => {
          const [rosterId1, rosterId2] = t.roster_ids;
          const roster1 = rosterMap.get(rosterId1);
          const roster2 = rosterMap.get(rosterId2);
          const user1 = roster1 ? userMap.get(roster1.owner_id) : null;
          const user2 = roster2 ? userMap.get(roster2.owner_id) : null;
          
          const teamA = {
            rosterId: rosterId1,
            name: user1?.metadata?.team_name || user1?.display_name || `Team ${rosterId1}`,
            initials: getTeamInitials(user1?.metadata?.team_name || user1?.display_name || `Team ${rosterId1}`),
            assets: [] as TradeHistoryItem["teamA"]["assets"],
          };
          const teamB = {
            rosterId: rosterId2,
            name: user2?.metadata?.team_name || user2?.display_name || `Team ${rosterId2}`,
            initials: getTeamInitials(user2?.metadata?.team_name || user2?.display_name || `Team ${rosterId2}`),
            assets: [] as TradeHistoryItem["teamB"]["assets"],
          };

          // Players Team A gave away (received by Team B)
          if (t.adds) {
            Object.entries(t.adds).forEach(([pid, toRosterId]) => {
              const player = players[pid];
              const playerName = player ? `${player.first_name} ${player.last_name}` : pid;
              if (toRosterId === rosterId2) {
                teamA.assets.push({ type: "player", name: playerName });
              } else if (toRosterId === rosterId1) {
                teamB.assets.push({ type: "player", name: playerName });
              }
            });
          }

          // Draft picks
          t.draft_picks?.forEach(pick => {
            const pickName = `${pick.season} Round ${pick.round}`;
            if (pick.owner_id === rosterId2 && pick.previous_owner_id === rosterId1) {
              teamA.assets.push({ type: "pick", name: pickName });
            } else if (pick.owner_id === rosterId1 && pick.previous_owner_id === rosterId2) {
              teamB.assets.push({ type: "pick", name: pickName });
            }
          });

          const date = new Date(t.status_updated);
          return {
            id: t.transaction_id,
            date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            teamA,
            teamB,
          };
        });

      res.json(trades);
    } catch (error) {
      console.error("Error fetching trades:", error);
      res.status(500).json({ error: "Failed to fetch trades" });
    }
  });

  // Get roster with player details
  app.get("/api/sleeper/league/:leagueId/roster/:userId", async (req, res) => {
    try {
      const [league, nflState, rosters, players] = await Promise.all([
        getLeague(req.params.leagueId),
        getNFLState(),
        getLeagueRosters(req.params.leagueId),
        getAllPlayers(),
      ]);
      
      const season = league.season || nflState?.season || new Date().getFullYear().toString();

      let seasonStats: Record<string, Record<string, number>> = {};
      try {
        const [stats] = await Promise.all([getPlayerStats(season)]);
        seasonStats = stats || {};
      } catch (statsErr) {
        console.warn("[Roster Endpoint] Player stats unavailable, using zeros:", (statsErr as Error)?.message);
      }

      const userRoster = rosters.find(r => r.owner_id === req.params.userId);
      if (!userRoster) {
        return res.status(404).json({ error: "Roster not found" });
      }

      // Normalize player ID for lookup (Sleeper may use string or number in different places)
      const playerById = (pid: string) => players[pid] ?? players[String(pid)];
      const statsById = (pid: string) => seasonStats[pid] ?? seasonStats[String(pid)];

      const positionStats: Record<string, number[]> = {};

      // Collect all player stats by position across the league
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = playerById(pid);
          if (!player) return;
          const pos = player.position;
          if (!["QB", "RB", "WR", "TE"].includes(pos)) return;
          const stats = statsById(pid);
          const points = stats?.pts_ppr || stats?.pts_std || 0;
          if (!positionStats[pos]) positionStats[pos] = [];
          positionStats[pos].push(points);
        });
      });

      // Calculate median for each position
      const positionMedians: Record<string, number> = {};
      Object.entries(positionStats).forEach(([pos, pointsArr]) => {
        const sorted = [...pointsArr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        positionMedians[pos] = sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      });

      // Calculate position ranks
      const positionRanks: Record<string, Map<string, number>> = {};
      Object.entries(positionStats).forEach(([pos]) => {
        const sortedWithIds = rosters
          .flatMap(r => (r.players || []).map(pid => {
            const player = playerById(pid);
            if (!player || player.position !== pos) return null;
            const stats = statsById(pid);
            return { pid: String(pid), points: stats?.pts_ppr || stats?.pts_std || 0 };
          }))
          .filter((x): x is { pid: string; points: number } => x !== null)
          .sort((a, b) => b.points - a.points);
        positionRanks[pos] = new Map(sortedWithIds.map((item, idx) => [item.pid, idx + 1]));
      });

      const getStatus = (pid: string): "starter" | "bench" | "taxi" | "ir" => {
        const p = String(pid);
        const starters = (userRoster.starters || []).map(String);
        const taxi = (userRoster.taxi || []).map(String);
        const reserve = (userRoster.reserve || []).map(String);
        if (starters.includes(p)) return "starter";
        if (taxi.includes(p)) return "taxi";
        if (reserve.includes(p)) return "ir";
        return "bench";
      };

      // Use effective week to handle offseason correctly
      const effectiveWeek = getEffectiveWeek(nflState, league);
      const weeksPlayed = Math.max(1, effectiveWeek);

      const rosterPlayerIds = (userRoster.players || []).map(String);
      const rosterPlayers = rosterPlayerIds
        .map(pid => {
          const player = playerById(pid);
          const stats = statsById(pid);
          const points = stats?.pts_ppr || stats?.pts_std || 0;

          if (!player) {
            // Still include roster slot so My Team shows something when player cache misses
            return {
              id: pid,
              name: `Player ${pid.slice(0, 8)}`,
              position: "FLEX" as Position,
              team: null,
              age: undefined,
              yearsExp: undefined,
              injuryStatus: null,
              status: getStatus(pid),
              seasonPoints: points,
              weeklyAvg: weeksPlayed > 0 ? points / weeksPlayed : 0,
              positionRank: 999,
            };
          }

          return {
            id: pid,
            name: player.full_name || `${player.first_name || ""} ${player.last_name || ""}`.trim() || "Unknown",
            position: (player.position || "FLEX") as Position,
            team: player.team,
            age: player.age,
            yearsExp: player.years_exp,
            injuryStatus: player.injury_status,
            status: getStatus(pid),
            seasonPoints: points,
            weeklyAvg: weeksPlayed > 0 ? points / weeksPlayed : 0,
            positionRank: positionRanks[player.position]?.get(pid) || 999,
          };
        })
        .sort((a, b) => b.seasonPoints - a.seasonPoints);

      res.json(rosterPlayers);
    } catch (error) {
      console.error("Error fetching roster:", error);
      res.status(500).json({ error: "Failed to fetch roster" });
    }
  });

  // Get all team rosters with players for Trade Center
  app.get("/api/sleeper/league/:leagueId/all-rosters", async (req, res) => {
    try {
      const [rosters, users, players] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const teamRosters = rosters.map(roster => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        const teamInitials = getTeamInitials(teamName);

        const rosterPlayers = (roster.players || [])
          .map(pid => {
            const player = players[pid];
            if (!player) return null;
            if (!["QB", "RB", "WR", "TE"].includes(player.position)) return null;
            return {
              id: pid,
              name: player.full_name || `${player.first_name} ${player.last_name}`,
              position: player.position,
              team: player.team || "FA",
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        return {
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          teamName,
          teamInitials,
          players: rosterPlayers,
        };
      });

      res.json(teamRosters);
    } catch (error) {
      console.error("Error fetching all rosters:", error);
      res.status(500).json({ error: "Failed to fetch all rosters" });
    }
  });

  // Get position depth analysis
  app.get("/api/sleeper/league/:leagueId/depth/:userId", async (req, res) => {
    try {
      const [league, nflState, rosters, players] = await Promise.all([
        getLeague(req.params.leagueId),
        getNFLState(),
        getLeagueRosters(req.params.leagueId),
        getAllPlayers(),
      ]);
      
      const season = league.season || nflState.season || new Date().getFullYear().toString();

      const userRoster = rosters.find(r => r.owner_id === req.params.userId);
      if (!userRoster) {
        return res.status(404).json({ error: "Roster not found" });
      }

      // Fetch weekly stats to calculate games played and PPG
      const currentWeek = getEffectiveWeek(nflState, league);
      const weeksToFetch = Math.min(currentWeek, 8); // Use up to 8 weeks of data
      
      const playerWeeklyPoints = new Map<string, number[]>();
      
      // Fetch stats for each week
      const weeklyStatsPromises: Promise<Record<string, any>>[] = [];
      for (let w = Math.max(1, currentWeek - weeksToFetch + 1); w <= currentWeek; w++) {
        weeklyStatsPromises.push(
          fetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${w}?season_type=regular`)
            .then(r => r.ok ? r.json() : {})
            .catch(() => ({}))
        );
      }
      
      const weeklyStatsResults = await Promise.all(weeklyStatsPromises);
      
      // Aggregate points per player across weeks
      weeklyStatsResults.forEach((weekStats) => {
        Object.entries(weekStats).forEach(([playerId, stats]) => {
          const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
          if (pts > 0) {
            if (!playerWeeklyPoints.has(playerId)) {
              playerWeeklyPoints.set(playerId, []);
            }
            playerWeeklyPoints.get(playerId)!.push(pts);
          }
        });
      });

      // Calculate PPG for each player
      const playerPPG = new Map<string, number>();
      playerWeeklyPoints.forEach((weeklyPts, playerId) => {
        const gamesPlayed = weeklyPts.length;
        if (gamesPlayed > 0) {
          const totalPoints = weeklyPts.reduce((sum, pts) => sum + pts, 0);
          playerPPG.set(playerId, totalPoints / gamesPlayed);
        }
      });

      const positionStats: Record<string, number[]> = {};

      // Collect all player PPG by position across the league
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = players[pid];
          if (!player) return;
          const pos = player.position;
          if (!["QB", "RB", "WR", "TE"].includes(pos)) return;
          
          const ppg = playerPPG.get(pid) || 0;
          if (ppg > 0) {
            if (!positionStats[pos]) positionStats[pos] = [];
            positionStats[pos].push(ppg);
          }
        });
      });

      // Calculate median PPG for each position
      const positionMedians: Record<string, number> = {};
      Object.entries(positionStats).forEach(([pos, ppgArr]) => {
        const sorted = [...ppgArr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        positionMedians[pos] = sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      });

      const depthData: Record<string, PositionDepth> = {};

      ["QB", "RB", "WR", "TE"].forEach(pos => {
        const posPlayers = (userRoster.players || [])
          .map(pid => {
            const player = players[pid];
            if (!player || player.position !== pos) return null;
            
            const ppg = playerPPG.get(pid) || 0;
            const median = positionMedians[pos] || 1;
            const percentAboveMedian = ((ppg - median) / median) * 100;
            
            return {
              id: pid,
              name: player.full_name || `${player.first_name} ${player.last_name}`,
              team: player.team,
              points: Math.round(ppg * 10) / 10, // PPG rounded to 1 decimal
              medianPoints: Math.round(median * 10) / 10,
              percentAboveMedian: Math.round(percentAboveMedian),
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .sort((a, b) => b.points - a.points);

        if (posPlayers.length > 0) {
          const avgPercent = posPlayers.reduce((sum, p) => sum + p.percentAboveMedian, 0) / posPlayers.length;
          depthData[pos] = {
            grade: calculateGrade(avgPercent),
            players: posPlayers,
          };
        }
      });

      res.json(depthData);
    } catch (error) {
      console.error("Error fetching depth analysis:", error);
      res.status(500).json({ error: "Failed to fetch depth analysis" });
    }
  });

  // Helper function to calculate quartiles
  function calculateQuartiles(points: number[]): {
    q1: number;
    median: number;
    q3: number;
    min: number;
    max: number;
  } {
    if (points.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    }
    
    // Filter out invalid values (NaN, undefined, null)
    const validPoints = points.filter(p => typeof p === 'number' && !isNaN(p) && isFinite(p));
    
    if (validPoints.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    }
    
    const sorted = [...validPoints].sort((a, b) => a - b);
    const n = sorted.length;
    
    // Handle edge case where all values are the same
    if (sorted[0] === sorted[n - 1]) {
      const value = sorted[0];
      return { min: value, q1: value, median: value, q3: value, max: value };
    }
    
    const q1Index = Math.max(0, Math.floor(n * 0.25));
    const medianIndex = Math.max(0, Math.floor(n * 0.5));
    const q3Index = Math.max(0, Math.floor(n * 0.75));
    
    return {
      min: sorted[0],
      q1: sorted[q1Index] || sorted[0],
      median: sorted[medianIndex] || sorted[0],
      q3: sorted[q3Index] || sorted[n - 1],
      max: sorted[n - 1]
    };
  }

  // Helper function to get quartile for a player
  function getQuartile(points: number, q1: number, median: number, q3: number): 1 | 2 | 3 | 4 {
    // Validate inputs
    if (typeof points !== 'number' || isNaN(points) || !isFinite(points)) {
      console.warn(`[Assign Contracts] Invalid points value: ${points}, defaulting to quartile 4`);
      return 4;
    }
    if (typeof q1 !== 'number' || isNaN(q1) || typeof median !== 'number' || isNaN(median) || typeof q3 !== 'number' || isNaN(q3)) {
      console.warn(`[Assign Contracts] Invalid quartile values: q1=${q1}, median=${median}, q3=${q3}, defaulting to quartile 4`);
      return 4;
    }
    
    // Handle edge case where all quartiles are the same
    if (q1 === median && median === q3) {
      // All players have same points, assign to quartile 2 (middle)
      return 2;
    }
    
    if (points >= q3) return 1; // Top quartile
    if (points >= median) return 2;
    if (points >= q1) return 3;
    return 4; // Bottom quartile
  }

  // ── Shared PPG helpers (used by player-rankings, assign-contracts, and rookie-extension) ──

  type WeeklyStatsCache = Record<string, Record<string, number>>[];

  async function fetchAllWeeklyStats(season: string): Promise<WeeklyStatsCache> {
    const promises: Promise<Record<string, Record<string, number>>>[] = [];
    for (let w = 1; w <= 18; w++) {
      promises.push(getPlayerStats(season, w).catch(() => ({})));
    }
    return Promise.all(promises);
  }

  function extractPlayerGamesFromCache(
    playerId: string,
    season: string,
    weeklyStats: WeeklyStatsCache
  ): { week: number; season: string; pts: number }[] {
    const games: { week: number; season: string; pts: number }[] = [];
    for (let w = 0; w < weeklyStats.length; w++) {
      const stats = weeklyStats[w][playerId];
      if (stats) {
        const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
        if (pts > 0) {
          games.push({ week: w + 1, season, pts });
        }
      }
    }
    return games;
  }

  function computeAdjustedPPGFromGames(
    currentSeasonGames: { week: number; season: string; pts: number }[],
    previousSeasonGames: { week: number; season: string; pts: number }[]
  ): { adjustedPPG: number; gamesUsed: number; recent15PPG: number; previous15PPG: number; formulaUsed: string } | null {
    const allGames = [
      ...currentSeasonGames.sort((a, b) => b.week - a.week),
      ...previousSeasonGames.sort((a, b) => b.week - a.week),
    ].slice(0, 30);

    if (allGames.length === 0) return null;

    const recent15 = allGames.slice(0, Math.min(15, allGames.length));
    const previous15 = allGames.slice(recent15.length);

    const avg = (arr: { pts: number }[]) =>
      arr.length > 0 ? arr.reduce((s, g) => s + g.pts, 0) / arr.length : 0;

    const recent15PPG = avg(recent15);
    const previous15PPG = avg(previous15);

    let adjustedPPG: number;
    let formulaUsed: string;
    if (previous15.length === 0 || recent15PPG >= previous15PPG) {
      adjustedPPG = recent15PPG;
      formulaUsed = "recent15";
    } else {
      adjustedPPG = avg(allGames);
      formulaUsed = "all30avg";
    }

    return { adjustedPPG, gamesUsed: allGames.length, recent15PPG, previous15PPG, formulaUsed };
  }

  function computeAdjustedPPGForPlayer(
    playerId: string,
    currentSeason: string,
    previousSeason: string,
    currentWeeklyStats: WeeklyStatsCache,
    previousWeeklyStats: WeeklyStatsCache
  ): { adjustedPPG: number; gamesUsed: number; recent15PPG: number; previous15PPG: number; formulaUsed: string } | null {
    const currentGames = extractPlayerGamesFromCache(playerId, currentSeason, currentWeeklyStats);
    const previousGames = extractPlayerGamesFromCache(playerId, previousSeason, previousWeeklyStats);
    return computeAdjustedPPGFromGames(currentGames, previousGames);
  }

  // Get player rankings with box plot data by position (uses adjusted PPG: 30 games across 2 seasons)
  app.get("/api/sleeper/league/:leagueId/player-rankings", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const [rosters, players, nflState, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getAllPlayers(),
        getNFLState(),
        getLeague(leagueId),
      ]);

      const currentSeason = league.season || nflState.season;
      const previousSeason = String(parseInt(currentSeason) - 1);
      
      console.log(`[Player Rankings] Computing adjusted PPG for seasons ${currentSeason} + ${previousSeason}`);

      // Fetch weekly stats for both seasons upfront (shared across all players)
      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);

      // Collect all rostered players by position with their adjusted PPG
      const positionPlayers: Record<string, Array<{
        playerId: string;
        name: string;
        team: string;
        adjustedPPG: number;
        gamesUsed: number;
      }>> = {};

      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = players[pid];
          if (!player) return;
          
          const pos = player.position;
          if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos)) return;
          
          const ppgResult = computeAdjustedPPGForPlayer(pid, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
          if (!ppgResult) return; // no games played

          if (!positionPlayers[pos]) {
            positionPlayers[pos] = [];
          }
          
          positionPlayers[pos].push({
            playerId: pid,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            team: player.team || "",
            adjustedPPG: Math.round(ppgResult.adjustedPPG * 10) / 10,
            gamesUsed: ppgResult.gamesUsed,
          });
        });
      });
      
      console.log(`[Player Rankings] Position breakdown:`, Object.keys(positionPlayers).map(pos => `${pos}: ${positionPlayers[pos].length}`).join(", "));

      // Calculate quartiles on adjusted PPG values for each position
      const positions: Record<string, {
        players: Array<{
          playerId: string;
          name: string;
          team: string;
          adjustedPPG: number;
          gamesUsed: number;
          quartile: 1 | 2 | 3 | 4;
          value: string;
        }>;
        boxPlot: {
          min: number;
          q1: number;
          median: number;
          q3: number;
          max: number;
          outliers: number[];
        };
      }> = {};

      Object.entries(positionPlayers).forEach(([position, playerList]) => {
        const sortedPlayers = [...playerList].sort((a, b) => b.adjustedPPG - a.adjustedPPG);
        const ppgValues = sortedPlayers.map(p => p.adjustedPPG);
        
        const quartiles = calculateQuartiles(ppgValues);
        
        const iqr = quartiles.q3 - quartiles.q1;
        const lowerBound = quartiles.q1 - 1.5 * iqr;
        const upperBound = quartiles.q3 + 1.5 * iqr;
        const outliers = ppgValues.filter(p => p < lowerBound || p > upperBound);
        
        const playersWithQuartiles = sortedPlayers.map(player => {
          const quartile = getQuartile(player.adjustedPPG, quartiles.q1, quartiles.median, quartiles.q3);
          return {
            ...player,
            quartile,
            value: `Q${quartile}`,
          };
        });
        
        positions[position] = {
          players: playersWithQuartiles,
          boxPlot: {
            min: quartiles.min,
            q1: quartiles.q1,
            median: quartiles.median,
            q3: quartiles.q3,
            max: quartiles.max,
            outliers,
          },
        };
      });

      console.log(`[Player Rankings] Returning data for ${Object.keys(positions).length} positions`);
      
      res.json({
        season: currentSeason,
        positions: positions || {},
      });
    } catch (error: any) {
      console.error("Error fetching player rankings:", error);
      res.status(500).json({ 
        error: "Failed to fetch player rankings",
        message: error?.message || "Unknown error"
      });
    }
  });

  // Assign contracts to players with 3+ years experience based on quartile rankings
  // Rookie pay scale utility function
  function getRookieSalary(round: number, draftSlot: number): number {
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

  // Helper function to check if draft is complete
  // Handles multiple status value variations from Sleeper API
  function isDraftComplete(status: string): boolean {
    if (!status) return false;
    const normalizedStatus = String(status || "").toLowerCase().trim();
    return normalizedStatus === "complete" || 
           normalizedStatus === "completed" || 
           normalizedStatus === "finished" ||
           normalizedStatus === "closed" ||
           normalizedStatus === "done" ||
           normalizedStatus === "ended";
  }

  app.post("/api/league/:leagueId/assign-contracts-by-quartile", async (req, res) => {
    const startTime = Date.now();
    const deviceId = os.hostname() || "unknown";
    const timestamp = new Date().toISOString();
    
    // Declare variables at function scope for error handler access
    let leagueId: string | undefined;
    let currentYear: number | undefined;
    let nextYear: number | undefined;
    let currentYearNum: number | undefined;
    let nextYearNum: number | undefined;
    let contractsToAssign: Array<{rosterId: number; playerId: string; salary: number; quartile: number}> = [];
    
    // Environment and Version Logging
    console.log(`[Assign Contracts] ========== DIAGNOSTIC START ==========`);
    console.log(`[Assign Contracts] Device ID: ${deviceId}`);
    console.log(`[Assign Contracts] Timestamp: ${timestamp}`);
    console.log(`[Assign Contracts] Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`[Assign Contracts] Node.js Version: ${process.version}`);
    console.log(`[Assign Contracts] Platform: ${os.platform()} ${os.arch()}`);
    console.log(`[Assign Contracts] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    
    // Hash DATABASE_URL for security (don't log full URL)
    const dbUrlHash = process.env.DATABASE_URL 
      ? createHash('md5').update(process.env.DATABASE_URL).digest('hex').substring(0, 8)
      : 'not set';
    console.log(`[Assign Contracts] DATABASE_URL hash: ${dbUrlHash}`);
    
    console.log(`[Assign Contracts] Request received for league: ${req.params.leagueId}`);
    try {
      leagueId = req.params.leagueId;
      
      if (!leagueId) {
        return res.status(400).json({
          success: false,
          error: "League ID is required",
          message: "League ID parameter is missing.",
        });
      }
      
      console.log(`[Assign Contracts] Fetching data for league ${leagueId}...`);
      const [rosters, players, nflState, league, users] = await Promise.all([
        getLeagueRosters(leagueId).catch(err => {
          console.error(`[Assign Contracts] Error fetching rosters:`, err);
          throw new Error(`Failed to fetch rosters: ${err.message}`);
        }),
        getAllPlayers().catch(err => {
          console.error(`[Assign Contracts] Error fetching players:`, err);
          throw new Error(`Failed to fetch players: ${err.message}`);
        }),
        getNFLState().catch(err => {
          console.error(`[Assign Contracts] Error fetching NFL state:`, err);
          return null; // Allow null for nflState
        }),
        getLeague(leagueId).catch(err => {
          console.error(`[Assign Contracts] Error fetching league:`, err);
          throw new Error(`Failed to fetch league: ${err.message}`);
        }),
        getLeagueUsers(leagueId).catch(err => {
          console.error(`[Assign Contracts] Error fetching users:`, err);
          return []; // Allow empty array for users
        }),
      ]);
      
      console.log(`[Assign Contracts] Data fetched - rosters: ${rosters?.length || 0}, players: ${Object.keys(players || {}).length}, league: ${league?.league_id || 'none'}, users: ${users?.length || 0}`);
      
      // Data Source Logging
      console.log(`[Assign Contracts] --- DATA SOURCE DETAILS ---`);
      console.log(`[Assign Contracts] League: id=${league?.league_id}, season=${league?.season}, name=${league?.name || 'N/A'}, total_rosters=${league?.total_rosters || 'N/A'}`);
      console.log(`[Assign Contracts] NFL State: season=${nflState?.season || 'N/A'}, week=${nflState?.week || 'N/A'}, state=${nflState?.season_type || 'N/A'}`);
      console.log(`[Assign Contracts] Rosters: count=${rosters?.length || 0}, roster_ids=[${rosters?.slice(0, 5).map((r: any) => r.roster_id).join(', ')}${rosters && rosters.length > 5 ? '...' : ''}]`);
      console.log(`[Assign Contracts] Players: total=${Object.keys(players || {}).length}, sample_ids=[${Object.keys(players || {}).slice(0, 5).join(', ')}${Object.keys(players || {}).length > 5 ? '...' : ''}]`);
      console.log(`[Assign Contracts] Users: count=${users?.length || 0}, user_ids=[${users?.slice(0, 5).map((u: any) => u.user_id).join(', ')}${users && users.length > 5 ? '...' : ''}]`);
      
      // Build rosterId to teamName mapping for logging
      const rosterToTeamMap = new Map<number, string>();
      if (users && rosters) {
        const userMap = new Map<string, any>();
        users.forEach((u: any) => userMap.set(u.user_id, u));
        rosters.forEach((roster: any) => {
          const user = userMap.get(roster.owner_id);
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
          rosterToTeamMap.set(roster.roster_id, teamName);
        });
      }

      if (!league) {
        return res.status(400).json({
          error: "League not found",
          message: "Could not retrieve league information.",
        });
      }
      
      if (!rosters || rosters.length === 0) {
        return res.status(400).json({
          error: "No rosters found",
          message: "Could not retrieve roster information for this league.",
        });
      }

      const season = league.season || nflState?.season || "2025";
      // Handle both string and number seasons, ensure valid year
      const seasonNum = typeof season === 'string' ? parseInt(season, 10) : season;
      currentYear = (!isNaN(seasonNum) && seasonNum > 2000 && seasonNum < 2100) ? seasonNum : new Date().getFullYear();
      nextYear = currentYear + 1;
      const currentWeek = nflState ? getEffectiveWeek(nflState, league) : 18;
      
      // Year Calculation Logging
      console.log(`[Assign Contracts] --- YEAR CALCULATION ---`);
      console.log(`[Assign Contracts] Raw season value: ${season} (type: ${typeof season})`);
      console.log(`[Assign Contracts] Parsed season number: ${seasonNum}`);
      console.log(`[Assign Contracts] Current year: ${currentYear}, Next year: ${nextYear}`);
      console.log(`[Assign Contracts] Current week: ${currentWeek}`);
      
      // Ensure years are valid numbers
      currentYearNum = Number(currentYear);
      nextYearNum = Number(nextYear);
      
      if (isNaN(currentYearNum) || isNaN(nextYearNum) || !isFinite(currentYearNum) || !isFinite(nextYearNum)) {
        const errorMsg = `Invalid year values: currentYear=${currentYear} (type: ${typeof currentYear}), nextYear=${nextYear} (type: ${typeof nextYear})`;
        console.error(`[Assign Contracts] ${errorMsg}`);
        return res.status(400).json({
          success: false,
          error: "Invalid year values",
          message: errorMsg,
          currentYear,
          nextYear,
        });
      }
      
      console.log(`[Assign Contracts] Processing contracts for season ${season}, current year: ${currentYearNum}, next year: ${nextYearNum}`);
      
      // Fetch weekly stats for current + previous season to compute adjusted PPG
      const previousSeason = String(currentYearNum - 1);
      console.log(`[Assign Contracts] --- STATS RETRIEVAL (Adjusted PPG) ---`);
      console.log(`[Assign Contracts] Fetching weekly stats for seasons ${season} + ${previousSeason}`);
      
      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(season),
        fetchAllWeeklyStats(previousSeason),
      ]);

      // Build adjusted PPG map for all rostered players
      const playerAdjustedPPG: Map<string, number> = new Map();
      const allRosteredPids = new Set<string>();
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => allRosteredPids.add(pid));
      });
      for (const pid of Array.from(allRosteredPids)) {
        const ppgResult = computeAdjustedPPGForPlayer(pid, season, previousSeason, currentWeeklyStats, previousWeeklyStats);
        if (ppgResult) {
          playerAdjustedPPG.set(pid, Math.round(ppgResult.adjustedPPG * 10) / 10);
        }
      }
      console.log(`[Assign Contracts] Computed adjusted PPG for ${playerAdjustedPPG.size} players`);
      
      // Stats Distribution Logging
      if (playerAdjustedPPG.size > 0) {
        const ppgArray = Array.from(playerAdjustedPPG.values());
        const minPPG = Math.min(...ppgArray);
        const maxPPG = Math.max(...ppgArray);
        const avgPPG = ppgArray.reduce((a, b) => a + b, 0) / ppgArray.length;
        const zeroCount = Array.from(allRosteredPids).filter(pid => !playerAdjustedPPG.has(pid)).length;
        
        console.log(`[Assign Contracts] PPG distribution: min=${minPPG.toFixed(1)}, max=${maxPPG.toFixed(1)}, avg=${avgPPG.toFixed(1)}, no_games=${zeroCount}`);
        
        const sampleStats = Array.from(playerAdjustedPPG.entries()).slice(0, 10);
        console.log(`[Assign Contracts] Sample player PPG: ${sampleStats.map(([pid, ppg]) => `${pid.substring(0, 8)}=${ppg.toFixed(1)}`).join(', ')}`);
      } else {
        console.warn(`[Assign Contracts] WARNING: No player stats found!`);
      }

      // Build player to rosterId mapping
      const playerToRosterMap = new Map<string, number>();
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          playerToRosterMap.set(pid, roster.roster_id);
        });
      });

      // Collect players with 3+ years experience and their adjusted PPG
      const positionPlayers: Record<string, Array<{
        playerId: string;
        name: string;
        team: string;
        adjustedPPG: number;
        rosterId: number;
      }>> = {};

      // Track filtering statistics
      const filterStats = {
        totalPlayers: 0,
        missingPlayerData: 0,
        wrongPosition: 0,
        insufficientExperience: 0,
        zeroPoints: 0,
        included: 0,
        byTeam: new Map<string, { total: number; included: number; filtered: { reason: string; count: number }[] }>(),
      };

      rosters.forEach(roster => {
        const teamName = rosterToTeamMap.get(roster.roster_id) || `Team ${roster.roster_id}`;
        if (!filterStats.byTeam.has(teamName)) {
          filterStats.byTeam.set(teamName, { total: 0, included: 0, filtered: [] });
        }
        const teamStats = filterStats.byTeam.get(teamName)!;
        
        (roster.players || []).forEach(pid => {
          filterStats.totalPlayers++;
          teamStats.total++;
          
          const player = players[pid];
          if (!player) {
            filterStats.missingPlayerData++;
            return;
          }
          
          const pos = player.position;
          if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos)) {
            filterStats.wrongPosition++;
            return;
          }
          
          // Only include players with 3+ years of NFL experience
          const yearsExp = typeof player.years_exp === 'string' ? parseInt(player.years_exp, 10) : player.years_exp;
          if (yearsExp === undefined || yearsExp === null || isNaN(yearsExp) || yearsExp < 3) {
            filterStats.insufficientExperience++;
            const reason = `Experience: ${yearsExp} (need 3+)`;
            const existingReason = teamStats.filtered.find(r => r.reason === reason);
            if (existingReason) {
              existingReason.count++;
            } else {
              teamStats.filtered.push({ reason, count: 1 });
            }
            return;
          }
          
          const ppg = playerAdjustedPPG.get(pid);
          if (!ppg || ppg === 0) {
            filterStats.zeroPoints++;
            const reason = "No games played (zero PPG)";
            const existingReason = teamStats.filtered.find(r => r.reason === reason);
            if (existingReason) {
              existingReason.count++;
            } else {
              teamStats.filtered.push({ reason, count: 1 });
            }
            const zeroPointReason = teamStats.filtered.find(r => r.reason === reason);
            if (zeroPointReason && zeroPointReason.count <= 3) {
              const playerName = player.full_name || `${player.first_name} ${player.last_name}`;
              console.log(`[Assign Contracts] ${teamName}: ${playerName} (${pos}, ${yearsExp} yrs) excluded - no games/zero PPG`);
            }
            return;
          }
          
          // Player passed all filters
          filterStats.included++;
          teamStats.included++;
          
          if (!positionPlayers[pos]) {
            positionPlayers[pos] = [];
          }
          
          positionPlayers[pos].push({
            playerId: pid,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            team: player.team || "",
            adjustedPPG: ppg,
            rosterId: roster.roster_id,
          });
        });
      });

      // Log filtering statistics
      console.log(`[Assign Contracts] Player filtering summary:`);
      console.log(`  Total players processed: ${filterStats.totalPlayers}`);
      console.log(`  Missing player data: ${filterStats.missingPlayerData}`);
      console.log(`  Wrong position: ${filterStats.wrongPosition}`);
      console.log(`  Insufficient experience (<3 yrs): ${filterStats.insufficientExperience}`);
      console.log(`  Zero fantasy points: ${filterStats.zeroPoints}`);
      console.log(`  Included for contract assignment: ${filterStats.included}`);
      
      console.log(`[Assign Contracts] Breakdown by team:`);
      filterStats.byTeam.forEach((stats, teamName) => {
        console.log(`  ${teamName}: ${stats.included} included, ${stats.total - stats.included} filtered out of ${stats.total} total`);
        if (stats.filtered.length > 0 && stats.included === 0) {
          console.log(`    Filter reasons: ${stats.filtered.map(f => `${f.reason} (${f.count})`).join(", ")}`);
        }
      });

      // Calculate quartiles for each position and assign contracts
      contractsToAssign = []; // Reset array

      Object.entries(positionPlayers).forEach(([position, playerList]) => {
        if (!playerList || playerList.length === 0) {
          console.log(`[Assign Contracts] Skipping ${position} - no players`);
          return;
        }
        
        // Validate player data
        const validPlayers = playerList.filter(p => 
          p && 
          typeof p.adjustedPPG === 'number' && 
          !isNaN(p.adjustedPPG) && 
          isFinite(p.adjustedPPG) &&
          p.playerId &&
          typeof p.rosterId === 'number'
        );
        
        if (validPlayers.length === 0) {
          console.warn(`[Assign Contracts] ${position} has no valid players after filtering`);
          return;
        }
        
        const sortedPlayers = [...validPlayers].sort((a, b) => b.adjustedPPG - a.adjustedPPG);
        const ppgValues = sortedPlayers.map(p => p.adjustedPPG).filter(p => typeof p === 'number' && !isNaN(p) && isFinite(p));
        
        if (ppgValues.length === 0) {
          console.warn(`[Assign Contracts] ${position} has no valid PPG values after filtering`);
          return;
        }
        
        try {
          const quartiles = calculateQuartiles(ppgValues);
          
          // Validate quartile values
          if (isNaN(quartiles.q1) || isNaN(quartiles.median) || isNaN(quartiles.q3)) {
            console.error(`[Assign Contracts] Invalid quartile values for ${position}:`, quartiles);
            return;
          }
          
          console.log(`[Assign Contracts] ${position} PPG quartiles:`, quartiles);
          const ppgRange = ppgValues.length > 0 
            ? `[${Math.min(...ppgValues).toFixed(1)}, ${Math.max(...ppgValues).toFixed(1)}]`
            : `[N/A - no valid PPG]`;
          console.log(`[Assign Contracts] ${position} processing: ${sortedPlayers.length} players, PPG range ${ppgRange}`);
          
          sortedPlayers.forEach(player => {
            try {
              const quartile = getQuartile(player.adjustedPPG, quartiles.q1, quartiles.median, quartiles.q3);
              
              // Validate quartile is 1-4
              if (quartile < 1 || quartile > 4 || !Number.isInteger(quartile)) {
                console.warn(`[Assign Contracts] Invalid quartile ${quartile} for player ${player.playerId} (${player.name})`);
                return;
              }
              
              // Q1 = $20, Q2 = $15, Q3 = $10, Q4 = $5 (stored as 200, 150, 100, 50)
              // Note: getQuartile returns 1 for top quartile (highest points), 4 for bottom quartile
              const salaryMap: Record<1 | 2 | 3 | 4, number> = {
                1: 200, // $20 - Top quartile
                2: 150, // $15 - Second quartile
                3: 100, // $10 - Third quartile
                4: 50,  // $5 - Bottom quartile
              };
              const salary = salaryMap[quartile];
              
              if (typeof salary !== 'number' || isNaN(salary)) {
                console.warn(`[Assign Contracts] Invalid salary for quartile ${quartile} for player ${player.playerId} (${player.name})`);
                return;
              }
              
              // Rookies are included in quartile rankings (GET player-rankings) but must not be assigned contracts by this feature
              const playerData = players[player.playerId];
              const yearsExp = typeof playerData?.years_exp === 'string' ? parseInt(playerData.years_exp, 10) : playerData?.years_exp;
              if (yearsExp == null || yearsExp < 3) return;
              
              contractsToAssign.push({
                rosterId: Number(player.rosterId),
                playerId: String(player.playerId),
                salary: Number(salary),
                quartile: Number(quartile) as 1 | 2 | 3 | 4,
              });
            } catch (playerError: any) {
              console.error(`[Assign Contracts] Error processing player ${player.playerId} (${player.name}):`, playerError);
              // Continue with other players
            }
          });
        } catch (quartileError: any) {
          console.error(`[Assign Contracts] Error calculating quartiles for ${position}:`, quartileError);
          // Continue with other positions
        }
      });

      console.log(`[Assign Contracts] Assigning ${contractsToAssign.length} contracts based on quartile rankings`);
      console.log(`[Assign Contracts] Position breakdown:`, Object.keys(positionPlayers).map(pos => `${pos}: ${positionPlayers[pos].length}`).join(", "));

      if (contractsToAssign.length === 0) {
        console.log(`[Assign Contracts] No eligible players found`);
        return res.json({
          success: true,
          assigned: 0,
          total: 0,
          currentYear: currentYearNum,
          nextYear: nextYearNum,
          contracts: [],
          message: "No eligible players found with 3+ years of experience and fantasy points. Ensure players have sufficient NFL experience and fantasy points for the current season.",
        });
      }

      // Assign contracts (2 years: current year and next year)
      // Note: Year validation has already been performed earlier in the function
      const results: Array<{playerId: string; rosterId: number; quartile: number; salary: number; years: number[]}> = [];
      
      // Database State Logging
      console.log(`[Assign Contracts] --- DATABASE STATE ---`);
      const existingContracts = await storage.getPlayerContracts(leagueId);
      console.log(`[Assign Contracts] Existing contracts: total=${existingContracts.length}`);
      
      // Count contracts by rosterId
      const contractsByRoster = new Map<number, number>();
      let rookieContractCount = 0;
      existingContracts.forEach(contract => {
        const count = contractsByRoster.get(contract.rosterId) || 0;
        contractsByRoster.set(contract.rosterId, count + 1);
        if (contract.isRookieContract === 1) {
          rookieContractCount++;
        }
      });
      
      console.log(`[Assign Contracts] Contracts by roster: ${Array.from(contractsByRoster.entries()).map(([rid, count]) => `roster_${rid}=${count}`).join(', ')}`);
      console.log(`[Assign Contracts] Rookie contracts: ${rookieContractCount}`);
      
      // Sample existing contracts
      if (existingContracts.length > 0) {
        const sample = existingContracts.slice(0, 5);
        console.log(`[Assign Contracts] Sample existing contracts: ${sample.map(c => `roster_${c.rosterId}/player_${c.playerId.substring(0, 8)}/rookie=${c.isRookieContract}`).join(', ')}`);
      }
      
      for (const contract of contractsToAssign) {
        let contractData: any = null;
        try {
          // Double-check: exclude players with rookie contract designation
          const existingContract = existingContracts.find(
            c => c.playerId === contract.playerId && c.rosterId === contract.rosterId
          );
          if (existingContract && existingContract.isRookieContract === 1) {
            console.log(`[Assign Contracts] Skipping player ${contract.playerId} - has rookie contract designation`);
            continue;
          }
          
          contractData = {
            leagueId,
            rosterId: contract.rosterId,
            playerId: contract.playerId,
            salaries: "{}",
            fifthYearOption: null,
            isOnIr: 0,
            franchiseTagUsed: 0,
            franchiseTagYear: null,
            originalContractYears: 2,
            isRookieContract: 0,
            extensionApplied: 0,
            extensionYear: null,
            extensionSalary: null,
            extensionType: null,
            hasBeenExtended: 0,
            hasBeenFranchiseTagged: 0,
          };

          // Validate salary is a valid integer
          const salaryValue = Number(contract.salary);
          if (isNaN(salaryValue) || !isFinite(salaryValue) || salaryValue < 0) {
            console.error(`[Assign Contracts] Invalid salary value: ${contract.salary} (converted to ${salaryValue}) for player ${contract.playerId}. Contract assignment skipped.`);
            continue; // Skip this contract assignment
          }
          
          // Round salary to ensure it's an integer
          const roundedSalary = Math.round(salaryValue);
          
          const salaries: Record<string, number> = {
            [String(currentYearNum)]: roundedSalary,
            [String(nextYearNum)]: roundedSalary,
          };
          contractData.salaries = JSON.stringify(salaries);

          const result = await storage.upsertPlayerContract(contractData);
          // Only include serializable data in results
          results.push({
            playerId: contract.playerId,
            rosterId: contract.rosterId,
            quartile: contract.quartile,
            salary: contract.salary,
            years: [currentYearNum!, nextYearNum!],
          });
        } catch (err: any) {
          const errorMessage = err?.message || String(err) || 'Unknown error';
          console.error(`[Assign Contracts] Error assigning contract for player ${contract.playerId} (roster ${contract.rosterId}, quartile ${contract.quartile}):`, errorMessage);
          console.error(`[Assign Contracts] Error stack:`, err?.stack);
          console.error(`[Assign Contracts] Contract data that failed:`, {
            playerId: contract.playerId,
            rosterId: contract.rosterId,
            quartile: contract.quartile,
            salary: contract.salary,
            currentYear: currentYearNum,
            nextYear: nextYearNum,
          });
          // Continue with other contracts even if one fails
        }
      }

      // Contract Assignment Results Logging
      console.log(`[Assign Contracts] --- CONTRACT ASSIGNMENT RESULTS ---`);
      console.log(`[Assign Contracts] Successfully assigned ${results.length} contracts`);
      console.log(`[Assign Contracts] Contracts to assign: ${contractsToAssign.length}, Successfully assigned: ${results.length}, Failed: ${contractsToAssign.length - results.length}`);
      
      if (results.length < contractsToAssign.length) {
        console.warn(`[Assign Contracts] Only assigned ${results.length} out of ${contractsToAssign.length} contracts. Some may have failed.`);
      }
      
      // Count by quartile
      const byQuartile = new Map<number, number>();
      results.forEach(r => {
        const count = byQuartile.get(r.quartile) || 0;
        byQuartile.set(r.quartile, count + 1);
      });
      console.log(`[Assign Contracts] Contracts by quartile: Q1=${byQuartile.get(1) || 0}, Q2=${byQuartile.get(2) || 0}, Q3=${byQuartile.get(3) || 0}, Q4=${byQuartile.get(4) || 0}`);
      
      // Count by roster
      const byRoster = new Map<number, number>();
      results.forEach(r => {
        const count = byRoster.get(r.rosterId) || 0;
        byRoster.set(r.rosterId, count + 1);
      });
      console.log(`[Assign Contracts] Contracts by roster: ${Array.from(byRoster.entries()).map(([rid, count]) => `roster_${rid}=${count}`).join(', ')}`);
      
      // Final Summary
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`[Assign Contracts] --- FINAL SUMMARY ---`);
      console.log(`[Assign Contracts] Device: ${deviceId}`);
      console.log(`[Assign Contracts] Duration: ${duration}ms`);
      console.log(`[Assign Contracts] League: ${leagueId}, Season: ${season}`);
      console.log(`[Assign Contracts] Years: ${currentYearNum}-${nextYearNum}`);
      console.log(`[Assign Contracts] Players processed: ${filterStats.totalPlayers}`);
      console.log(`[Assign Contracts] Players included: ${filterStats.included}`);
      console.log(`[Assign Contracts] Contracts assigned: ${results.length}/${contractsToAssign.length}`);
      console.log(`[Assign Contracts] PPG stats: ${playerAdjustedPPG.size > 0 ? 'available' : 'missing'}`);
      console.log(`[Assign Contracts] Existing contracts: ${existingContracts.length}`);
      if (results.length < contractsToAssign.length) {
        console.warn(`[Assign Contracts] WARNING: ${contractsToAssign.length - results.length} contract(s) failed to assign. Check error logs above for details.`);
      }
      console.log(`[Assign Contracts] ========== DIAGNOSTIC END ==========`);
      
      // Ensure all data is serializable (convert to plain objects/numbers)
      const responseData = {
        success: true,
        assigned: Number(results.length),
        total: Number(contractsToAssign.length),
        currentYear: Number(currentYearNum),
        nextYear: Number(nextYearNum),
        contracts: results.map(r => ({
          playerId: String(r.playerId),
          rosterId: Number(r.rosterId),
          quartile: Number(r.quartile),
          salary: Number(r.salary),
          years: r.years.map(y => Number(y)),
        })),
      };
      
      console.log(`[Assign Contracts] Sending success response with ${results.length} contracts`);
      res.json(responseData);
    } catch (error: any) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Enhanced Error Context Logging
      console.error(`[Assign Contracts] ========== ERROR DIAGNOSTIC ==========`);
      console.error(`[Assign Contracts] Device: ${deviceId}`);
      console.error(`[Assign Contracts] Timestamp: ${new Date().toISOString()}`);
      console.error(`[Assign Contracts] Duration before error: ${duration}ms`);
      console.error(`[Assign Contracts] Error name: ${error?.name || 'Unknown'}`);
      console.error(`[Assign Contracts] Error message: ${error?.message || String(error) || 'Unknown error'}`);
      console.error(`[Assign Contracts] Error stack:`, error?.stack);
      
      // Log error context if available
      if (error?.leagueId) console.error(`[Assign Contracts] Error context - leagueId: ${error.leagueId}`);
      
      // Log state at error time with better error messages
      try {
        const contractsCount = contractsToAssign ? contractsToAssign.length : 'not initialized';
        const yearInfo = typeof currentYear !== 'undefined' && typeof nextYear !== 'undefined' 
          ? `currentYear=${currentYear} (num=${typeof currentYearNum !== 'undefined' ? currentYearNum : 'N/A'}), nextYear=${nextYear} (num=${typeof nextYearNum !== 'undefined' ? nextYearNum : 'N/A'})`
          : 'not calculated';
        console.error(`[Assign Contracts] State at error: leagueId=${leagueId || 'not set'}, ${yearInfo}, contractsToAssign=${contractsCount}`);
        
        // Provide helpful context based on where the error might have occurred
        if (typeof currentYearNum !== 'undefined' && typeof nextYearNum !== 'undefined') {
          const supportedYears = [2025, 2026, 2027, 2028, 2029];
          if (!supportedYears.includes(currentYearNum) || !supportedYears.includes(nextYearNum)) {
            console.error(`[Assign Contracts] Year validation issue: Years ${currentYearNum}-${nextYearNum} may be outside supported range (2025-2029)`);
          }
        }
      } catch (stateError: any) {
        console.error(`[Assign Contracts] Could not log state: ${stateError?.message || String(stateError)}`);
      }
      
      console.error(`[Assign Contracts] ======================================`);
      
      // Ensure we always return valid JSON with helpful error messages
      try {
        let userFriendlyMessage = error?.message || String(error) || "Unknown error occurred while assigning contracts";
        const errMsg = userFriendlyMessage.toLowerCase();

        // PostgreSQL error code 3D000 = database does not exist
        if ((error as any)?.code === "3D000" || (errMsg.includes("database") && errMsg.includes("does not exist"))) {
          userFriendlyMessage = "Database not found. Check that DATABASE_URL uses the correct database name (e.g. postgres for Supabase) and that the database exists.";
        }
        // PostgreSQL error code 42P01 = table does not exist
        else if ((error as any)?.code === "42P01" || (errMsg.includes("relation") && errMsg.includes("does not exist"))) {
          userFriendlyMessage = "Database tables are missing. Run 'npm run db:push' from the project root to create the required tables.";
        }
        // Provide more specific error messages for other common issues
        else if (userFriendlyMessage.includes('year') || userFriendlyMessage.includes('2025') || userFriendlyMessage.includes('2029')) {
          userFriendlyMessage = `Year range error: ${userFriendlyMessage}. Contracts can only be assigned for years 2025-2029.`;
        } else if (userFriendlyMessage.includes('salary') || userFriendlyMessage.includes('contract')) {
          userFriendlyMessage = `Contract assignment error: ${userFriendlyMessage}. Please check that all contract data is valid.`;
        } else if (userFriendlyMessage.includes('database') || userFriendlyMessage.includes('db')) {
          userFriendlyMessage = `Database error: ${userFriendlyMessage}. Please try again or contact support if the issue persists.`;
        }

        const errorResponse = {
          success: false,
          error: "Failed to assign contracts by quartile",
          message: userFriendlyMessage,
          details: process.env.NODE_ENV === "development"
            ? (error?.stack || ((error as any)?.code ? `PostgreSQL code: ${(error as any).code}` : undefined))
            : undefined,
          deviceId,
          timestamp: new Date().toISOString(),
        };
        console.log("[Assign Contracts] Sending error response:", errorResponse);
        res.status(500).json(errorResponse);
      } catch (jsonError: any) {
        // If JSON response fails, send plain text as fallback
        console.error("[Assign Contracts] Failed to send JSON error response:", jsonError?.message || String(jsonError));
        try {
          const fallbackMessage = error?.message || String(error) || "Unknown error occurred while assigning contracts by quartile";
          res.status(500).send(`Error: ${fallbackMessage}`);
        } catch (sendError: any) {
          console.error("[Assign Contracts] Failed to send error response at all:", sendError?.message || String(sendError));
        }
      }
    }
  });

  // Get traded picks / draft capital
  app.get("/api/sleeper/league/:leagueId/draft-picks", async (req, res) => {
    try {
      const [tradedPicks, rosters, users] = await Promise.all([
        getTradedPicks(req.params.leagueId),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterOwnerMap = new Map<number, string>();
      rosters.forEach(r => {
        const user = userMap.get(r.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
        rosterOwnerMap.set(r.roster_id, teamName);
      });

      // Build complete draft pick ownership for next few years
      const currentYear = new Date().getFullYear();
      const years = [currentYear, currentYear + 1, currentYear + 2];
      const rounds = [1, 2, 3, 4];
      
      const allPicks: DraftPick[] = [];
      
      years.forEach(year => {
        rounds.forEach(round => {
          rosters.forEach(roster => {
            // Check if this pick was traded
            const traded = tradedPicks.find(
              tp => tp.season === year.toString() && 
                    tp.round === round && 
                    tp.roster_id === roster.roster_id
            );
            
            const originalOwnerId = roster.roster_id;
            const currentOwnerId = traded ? traded.owner_id : roster.roster_id;
            
            allPicks.push({
              id: `${year}-${round}-${roster.roster_id}`,
              season: year.toString(),
              round,
              rosterId: roster.roster_id,
              originalOwnerId,
              currentOwnerId,
              originalOwnerName: rosterOwnerMap.get(originalOwnerId),
              currentOwnerName: rosterOwnerMap.get(currentOwnerId),
            });
          });
        });
      });

      res.json(allPicks);
    } catch (error) {
      console.error("Error fetching draft picks:", error);
      res.status(500).json({ error: "Failed to fetch draft picks" });
    }
  });

  // Playoff predictor - simulate remaining season
  app.get("/api/sleeper/league/:leagueId/playoff-predictions", async (req, res) => {
    try {
      const [rosters, users, league, nflState, players] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getLeague(req.params.leagueId),
        getNFLState(),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));
      
      // Fetch player stats for projections
      const season = league.season || nflState.season;
      const effectiveWeek = getEffectiveWeek(nflState, league);
      const weeksToFetch = Math.min(effectiveWeek, 8);
      
      const cacheKey = `${season}`;
      const cached = playerStatsCache.get(cacheKey);
      let playerWeeklyPoints: Map<string, number[]>;
      
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        playerWeeklyPoints = cached.data;
      } else {
        playerWeeklyPoints = new Map();
        const startWeek = Math.max(1, effectiveWeek - weeksToFetch + 1);
        
        const weeklyStatsPromises = [];
        for (let w = startWeek; w <= effectiveWeek; w++) {
          weeklyStatsPromises.push(getPlayerStats(season, w).catch(() => ({})));
        }
        
        const weeklyStatsResults = await Promise.all(weeklyStatsPromises);
        
        weeklyStatsResults.forEach((weekStats) => {
          Object.entries(weekStats).forEach(([playerId, stats]) => {
            const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
            if (pts > 0) {
              if (!playerWeeklyPoints.has(playerId)) {
                playerWeeklyPoints.set(playerId, []);
              }
              playerWeeklyPoints.get(playerId)!.push(pts);
            }
          });
        });
        
        playerStatsCache.set(cacheKey, {
          data: playerWeeklyPoints,
          timestamp: Date.now(),
        });
      }
      
      // Position baseline stats for projections
      const positionBaselines: Record<string, { mean: number; stdDev: number }> = {
        QB: { mean: 18, stdDev: 6 },
        RB: { mean: 12, stdDev: 6 },
        WR: { mean: 11, stdDev: 6 },
        TE: { mean: 8, stdDev: 5 },
        K: { mean: 8, stdDev: 3 },
        DEF: { mean: 7, stdDev: 4 },
      };
      
      // Helper to get player projection
      const getPlayerProjection = (playerId: string): { mean: number; stdDev: number } => {
        const player = players[playerId];
        const position = player?.position || "FLEX";
        const positionBase = positionBaselines[position] || { mean: 10, stdDev: 5 };
        
        const weeklyPoints = playerWeeklyPoints.get(playerId) || [];
        const gamesPlayed = weeklyPoints.length;
        
        if (gamesPlayed >= 3) {
          const mean = weeklyPoints.reduce((a, b) => a + b, 0) / gamesPlayed;
          const variance = weeklyPoints.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / gamesPlayed;
          return { mean, stdDev: Math.sqrt(variance) || mean * 0.3 };
        } else if (gamesPlayed > 0) {
          const playerMean = weeklyPoints.reduce((a, b) => a + b, 0) / gamesPlayed;
          const blendWeight = gamesPlayed / 3;
          const blendedMean = playerMean * blendWeight + positionBase.mean * (1 - blendWeight);
          return { mean: blendedMean, stdDev: positionBase.stdDev };
        }
        return positionBase;
      };
      
      // Expected starter positions for projection calculation
      const starterSlots = [
        { pos: "QB", count: 1, eligible: ["QB"] },
        { pos: "RB", count: 2, eligible: ["RB"] },
        { pos: "WR", count: 2, eligible: ["WR"] },
        { pos: "TE", count: 1, eligible: ["TE"] },
        { pos: "FLEX", count: 2, eligible: ["RB", "WR", "TE"] },
        { pos: "K", count: 1, eligible: ["K"] },
        { pos: "DEF", count: 1, eligible: ["DEF"] },
      ];
      
      // Calculate expected team baseline (sum of position baselines for all starter slots)
      const teamBaseline = starterSlots.reduce((sum, slot) => {
        const avgPosition = slot.eligible[0]; // Use first eligible position's baseline
        return sum + (positionBaselines[avgPosition]?.mean || 10) * slot.count;
      }, 0);
      const teamBaselineStdDev = Math.sqrt(starterSlots.reduce((sum, slot) => {
        const avgPosition = slot.eligible[0];
        const stdDev = positionBaselines[avgPosition]?.stdDev || 5;
        return sum + (stdDev * stdDev) * slot.count;
      }, 0));
      
      // Helper to determine optimal starters for a roster with fallback projections
      const getOptimalStarters = (roster: SleeperRoster): { playerId: string; projection: { mean: number; stdDev: number } }[] => {
        const playerList = roster.players || [];
        const starters: { playerId: string; projection: { mean: number; stdDev: number } }[] = [];
        const used = new Set<string>();
        
        // Fill required positions
        starterSlots.forEach(slot => {
          const eligible = playerList
            .filter(pid => {
              const player = players[pid];
              return player && slot.eligible.includes(player.position) && !used.has(pid);
            })
            .map(pid => ({ pid, proj: getPlayerProjection(pid) }))
            .sort((a, b) => b.proj.mean - a.proj.mean);
          
          for (let i = 0; i < slot.count; i++) {
            if (i < eligible.length) {
              starters.push({ playerId: eligible[i].pid, projection: eligible[i].proj });
              used.add(eligible[i].pid);
            } else {
              // No eligible player - use position baseline as fallback
              const fallbackPos = slot.eligible[0];
              const baseline = positionBaselines[fallbackPos] || { mean: 10, stdDev: 5 };
              starters.push({ playerId: `fallback-${slot.pos}-${i}`, projection: baseline });
            }
          }
        });
        
        return starters;
      };

      const playoffTeams = league.settings.playoff_teams || 6;
      const playoffWeekStart = (league.settings as any).playoff_week_start || 15;
      const currentWeek = getEffectiveWeek(nflState, league);
      const regularSeasonWeeks = playoffWeekStart - 1;
      // Include current week in remaining weeks (e.g., week 12 with 14-week season = 3 weeks left including current)
      let remainingWeeks = Math.max(0, regularSeasonWeeks - currentWeek + 1);
      // When Sleeper API says postseason or offseason, set remaining regular season weeks to 0
      if (nflState.season_type === "post" || nflState.season_type === "off") {
        remainingWeeks = 0;
      }

      // Check if we're in the postseason
      const isPostseason = currentWeek >= playoffWeekStart;

      // If in postseason, fetch bracket data to determine actual status
      let bracket: Awaited<ReturnType<typeof getWinnersBracket>> | null = null;
      let losersBracket: Awaited<ReturnType<typeof getLosersBracket>> | null = null;
      let actualStandings: Array<{ rosterId: number; rank: number }> | null = null;

      if (isPostseason) {
        try {
          [bracket, losersBracket] = await Promise.all([
            getWinnersBracket(req.params.leagueId).catch(() => null),
            getLosersBracket(req.params.leagueId).catch(() => null),
          ]);
          
          // Calculate actual final standings from regular season
          const finalStandings = rosters
            .map((roster) => {
              const wins = roster.settings.wins;
              const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
              return {
                rosterId: roster.roster_id,
                wins,
                pointsFor,
              };
            })
            .sort((a, b) => {
              if (b.wins !== a.wins) return b.wins - a.wins;
              return b.pointsFor - a.pointsFor;
            })
            .map((team, index) => ({
              rosterId: team.rosterId,
              rank: index + 1,
            }));
          
          actualStandings = finalStandings;
        } catch (error) {
          console.error("Error fetching bracket data for postseason:", error);
        }
      }

      // Fetch all matchups to build head-to-head records
      const matchupPromises = [];
      for (let week = 1; week <= Math.min(currentWeek, regularSeasonWeeks); week++) {
        matchupPromises.push(getLeagueMatchups(req.params.leagueId, week));
      }
      const allMatchups = await Promise.all(matchupPromises);

      // Build head-to-head record: h2hRecord[rosterId1][rosterId2] = wins
      const h2hRecord: Map<number, Map<number, number>> = new Map();
      
      allMatchups.forEach(weekMatchups => {
        // Group matchups by matchup_id
        const matchupGroups = new Map<number, any[]>();
        weekMatchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) {
            matchupGroups.set(m.matchup_id, []);
          }
          matchupGroups.get(m.matchup_id)!.push(m);
        });

        // Determine winner for each matchup
        matchupGroups.forEach(pair => {
          if (pair.length === 2) {
            const [team1, team2] = pair;
            const points1 = team1.points || 0;
            const points2 = team2.points || 0;
            
            // Initialize h2h maps if needed
            if (!h2hRecord.has(team1.roster_id)) h2hRecord.set(team1.roster_id, new Map());
            if (!h2hRecord.has(team2.roster_id)) h2hRecord.set(team2.roster_id, new Map());
            
            if (points1 > points2) {
              const current = h2hRecord.get(team1.roster_id)!.get(team2.roster_id) || 0;
              h2hRecord.get(team1.roster_id)!.set(team2.roster_id, current + 1);
            } else if (points2 > points1) {
              const current = h2hRecord.get(team2.roster_id)!.get(team1.roster_id) || 0;
              h2hRecord.get(team2.roster_id)!.set(team1.roster_id, current + 1);
            }
          }
        });
      });

      // Helper to get h2h wins between two teams
      const getH2HWins = (rosterId1: number, rosterId2: number): number => {
        return h2hRecord.get(rosterId1)?.get(rosterId2) || 0;
      };

      // Check if league has divisions configured
      const numDivisions = (league.settings as any).divisions || 0;

      // Build team data with roster-based projections
      const teams = rosters.map(roster => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
        const gamesPlayed = roster.settings.wins + roster.settings.losses + roster.settings.ties;
        const avgPoints = gamesPlayed > 0 ? pointsFor / gamesPlayed : 100;
        
        // Calculate roster-based projected points from optimal starters
        const optimalStarters = getOptimalStarters(roster);
        let projectedPointsPerWeek = 0;
        let totalVariance = 0;
        
        optimalStarters.forEach(starter => {
          projectedPointsPerWeek += starter.projection.mean;
          totalVariance += starter.projection.stdDev * starter.projection.stdDev;
        });
        
        // Team standard deviation (combined from individual players)
        const projectedStdDev = Math.sqrt(totalVariance);
        
        // Validate projections - use team baseline as floor
        const effectiveProjection = !isNaN(projectedPointsPerWeek) && projectedPointsPerWeek > 50 
          ? projectedPointsPerWeek 
          : Math.max(teamBaseline, avgPoints);
        const effectiveStdDev = !isNaN(projectedStdDev) && projectedStdDev > 5
          ? projectedStdDev 
          : teamBaselineStdDev;
        
        // Get division from roster settings
        const rosterDivision = (roster.settings as any).division;
        
        return {
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          name: teamName,
          initials: getTeamInitials(teamName),
          wins: roster.settings.wins,
          losses: roster.settings.losses,
          ties: roster.settings.ties,
          pointsFor,
          avgPoints,
          projectedPointsPerWeek: effectiveProjection,
          stdDev: effectiveStdDev,
          division: rosterDivision as number | undefined,
        };
      });

      // Determine if divisions are actually configured and all teams have assignments
      const teamsWithDivisions = teams.filter(t => t.division !== undefined && t.division > 0);
      const hasDivisions = numDivisions > 1 && teamsWithDivisions.length === teams.length;
      
      // Create divisions Set from league config (1-indexed: 1, 2, etc.)
      const divisions: Set<number> = hasDivisions 
        ? new Set(Array.from({ length: numDivisions }, (_, i) => i + 1))
        : new Set();

      // Calculate current points standings
      const pointsSortedTeams = [...teams].sort((a, b) => b.pointsFor - a.pointsFor);
      const pointsRankMap = new Map<number, number>();
      pointsSortedTeams.forEach((team, idx) => {
        pointsRankMap.set(team.rosterId, idx + 1);
      });

      // Calculate points gaps to adjacent teams
      const pointsGapMap = new Map<number, { behind: number | null; ahead: number | null }>();
      pointsSortedTeams.forEach((team, idx) => {
        const behind = idx > 0 ? pointsSortedTeams[idx - 1].pointsFor - team.pointsFor : null;
        const ahead = idx < pointsSortedTeams.length - 1 ? team.pointsFor - pointsSortedTeams[idx + 1].pointsFor : null;
        pointsGapMap.set(team.rosterId, { behind, ahead });
      });

      // Monte Carlo simulation using projected points
      const SIMULATIONS = 10000;
      const results = new Map<number, { 
        oneSeed: number; 
        divisionWinner: number; 
        makePlayoffs: number;
        avgFinalWins: number;
        avgFinalPoints: number;
      }>();

      teams.forEach(t => results.set(t.rosterId, { 
        oneSeed: 0, 
        divisionWinner: 0, 
        makePlayoffs: 0,
        avgFinalWins: 0,
        avgFinalPoints: 0,
      }));

      // Pre-calculate league averages for opponent simulation (outside loop for efficiency)
      const leagueAvg = teams.reduce((sum, t) => sum + t.projectedPointsPerWeek, 0) / teams.length;
      const leagueStdDev = Math.sqrt(teams.reduce((sum, t) => sum + t.stdDev * t.stdDev, 0) / teams.length);
      // Fallback to baseline if league calculations fail
      const effectiveLeagueAvg = isNaN(leagueAvg) ? teamBaseline : leagueAvg;
      const effectiveLeagueStdDev = isNaN(leagueStdDev) || leagueStdDev < 5 ? teamBaselineStdDev : leagueStdDev;

      for (let sim = 0; sim < SIMULATIONS; sim++) {
        // Simulate remaining games for each team using projected points
        const simResults = teams.map(team => {
          let simWins = team.wins;
          let simPointsFor = team.pointsFor;
          
          // Simulate each remaining week using roster-based projected points
          for (let week = 0; week < remainingWeeks; week++) {
            // Generate a weekly score based on roster projection with normal distribution
            // Using Box-Muller transform for normal distribution
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            const weeklyScore = team.projectedPointsPerWeek + z * team.stdDev;
            simPointsFor += Math.max(50, weeklyScore); // Minimum 50 points floor
            
            // Simulate opponent score using league average of projected points
            const u3 = Math.random();
            const u4 = Math.random();
            const z2 = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
            const opponentScore = effectiveLeagueAvg + z2 * effectiveLeagueStdDev;
            
            // Determine win/loss based on projected scores
            if (weeklyScore > opponentScore) {
              simWins++;
            }
          }

          return {
            ...team,
            simWins,
            simPointsFor,
          };
        });

        // Sort by: 1) Record (wins), 2) Points scored, 3) Head-to-head wins
        simResults.sort((a, b) => {
          // First tiebreaker: Record (wins)
          if (b.simWins !== a.simWins) return b.simWins - a.simWins;
          // Second tiebreaker: Points scored
          if (Math.abs(b.simPointsFor - a.simPointsFor) > 0.01) return b.simPointsFor - a.simPointsFor;
          // Third tiebreaker: Head-to-head wins
          const aH2H = getH2HWins(a.rosterId, b.rosterId);
          const bH2H = getH2HWins(b.rosterId, a.rosterId);
          return bH2H - aH2H;
        });

        // Track 1-seed
        const current1 = results.get(simResults[0].rosterId)!;
        current1.oneSeed++;

        // Track division winners if applicable
        if (hasDivisions && divisions.size > 0) {
          divisions.forEach(div => {
            // Find teams in this division, sorted by simulated standings
            const divTeams = simResults.filter(t => t.division === div);
            if (divTeams.length > 0) {
              // First team in sorted results is the division winner
              const winnerId = divTeams[0].rosterId;
              const r = results.get(winnerId);
              if (r) {
                r.divisionWinner++;
              }
            }
          });
        }

        // Track playoff makers
        for (let i = 0; i < Math.min(playoffTeams, simResults.length); i++) {
          const r = results.get(simResults[i].rosterId)!;
          r.makePlayoffs++;
        }

        // Track average wins and points
        simResults.forEach(sr => {
          const r = results.get(sr.rosterId)!;
          r.avgFinalWins += sr.simWins;
          r.avgFinalPoints += sr.simPointsFor;
        });
      }

      // If in postseason, override simulation results with actual results
      if (isPostseason && actualStandings) {
        // Determine actual playoff teams from standings
        const playoffTeamIds = new Set(
          actualStandings.slice(0, playoffTeams).map(s => s.rosterId)
        );
        
        // Determine 1-seed (first place in standings)
        const oneSeedId = actualStandings[0]?.rosterId;
        
        // Determine division winners if applicable
        const divisionWinners = new Map<number, number>(); // division -> rosterId
        if (hasDivisions) {
          divisions.forEach(div => {
            const divTeams = actualStandings.filter(s => {
              const team = teams.find(t => t.rosterId === s.rosterId);
              return team?.division === div;
            });
            if (divTeams.length > 0) {
              divisionWinners.set(div, divTeams[0].rosterId);
            }
          });
        }
        
        // Override results for each team
        teams.forEach(team => {
          const r = results.get(team.rosterId)!;
          
          // Set playoff status (0 or 100)
          if (playoffTeamIds.has(team.rosterId)) {
            r.makePlayoffs = SIMULATIONS; // 100%
          } else {
            r.makePlayoffs = 0; // 0%
          }
          
          // Set 1-seed status
          if (team.rosterId === oneSeedId) {
            r.oneSeed = SIMULATIONS; // 100%
          } else {
            r.oneSeed = 0; // 0%
          }
          
          // Set division winner status
          if (hasDivisions && team.division) {
            const winnerId = divisionWinners.get(team.division);
            if (team.rosterId === winnerId) {
              r.divisionWinner = SIMULATIONS; // 100%
            } else {
              r.divisionWinner = 0; // 0%
            }
          }
        });
      }

      // Convert to percentages and format response
      // Apply Bayesian smoothing to prevent 0%/100% unless mathematically certain
      // This accounts for upset potential and uncertainty in remaining games
      const smoothProbability = (successes: number, trials: number): number => {
        // Bayesian smoothing with prior: (successes + 1) / (trials + 2)
        // This ensures even 0/10000 becomes 0.01% and 10000/10000 becomes 99.99%
        const smoothed = (successes + 1) / (trials + 2);
        const pct = smoothed * 100;
        // Round to 1 decimal place
        return Math.round(pct * 10) / 10;
      };

      // Only apply smoothing if regular season hasn't ended AND we're not in postseason
      // If remainingWeeks === 0 or we're in postseason, use raw percentages (teams are clinched/eliminated)
      const applySmoothing = remainingWeeks > 0 && !isPostseason;

      // Sort by same criteria as dashboard standings: record → points scored → H2H
      const predictions = teams
        .map(team => {
          const r = results.get(team.rosterId)!;
          const pointsRank = pointsRankMap.get(team.rosterId) || 1;
          const gaps = pointsGapMap.get(team.rosterId) || { behind: null, ahead: null };
          
          const projectedPointsFor = Math.round((r.avgFinalPoints / SIMULATIONS) * 10) / 10;
          
          // Calculate raw percentages
          const rawMakePlayoffsPct = Math.round((r.makePlayoffs / SIMULATIONS) * 1000) / 10;
          const rawOneSeedPct = Math.round((r.oneSeed / SIMULATIONS) * 1000) / 10;
          const rawDivisionWinnerPct = hasDivisions 
            ? Math.round((r.divisionWinner / SIMULATIONS) * 1000) / 10 
            : undefined;
          
          // Apply smoothing for probabilities when season is ongoing
          let makePlayoffsPct = rawMakePlayoffsPct;
          let oneSeedPct = rawOneSeedPct;
          let divisionWinnerPct = rawDivisionWinnerPct;
          
          if (applySmoothing) {
            makePlayoffsPct = smoothProbability(r.makePlayoffs, SIMULATIONS);
            oneSeedPct = smoothProbability(r.oneSeed, SIMULATIONS);
            if (hasDivisions) {
              divisionWinnerPct = smoothProbability(r.divisionWinner, SIMULATIONS);
            }
          }
          
          return {
            rosterId: team.rosterId,
            ownerId: team.ownerId,
            name: team.name,
            initials: team.initials,
            currentWins: team.wins,
            currentLosses: team.losses,
            pointsFor: team.pointsFor,
            pointsRank,
            pointsBehind: gaps.behind !== null ? Math.round(gaps.behind * 10) / 10 : null,
            pointsAhead: gaps.ahead !== null ? Math.round(gaps.ahead * 10) / 10 : null,
            projectedPointsPerWeek: Math.round(team.projectedPointsPerWeek * 10) / 10,
            projectedPointsFor,
            division: hasDivisions ? team.division : undefined,
            oneSeedPct,
            divisionWinnerPct,
            makePlayoffsPct,
            projectedWins: Math.round((r.avgFinalWins / SIMULATIONS) * 10) / 10,
          };
        })
        .sort((a, b) => {
          // 1) Record (wins)
          if (b.currentWins !== a.currentWins) return b.currentWins - a.currentWins;
          // 2) Points scored
          if (Math.abs(b.pointsFor - a.pointsFor) > 0.01) return b.pointsFor - a.pointsFor;
          // 3) Head-to-head wins
          const aH2H = getH2HWins(a.rosterId, b.rosterId);
          const bH2H = getH2HWins(b.rosterId, a.rosterId);
          return bH2H - aH2H;
        });

      res.json({
        predictions,
        playoffTeams,
        remainingWeeks,
        currentWeek,
        seasonType: nflState.season_type,
        hasDivisions,
        simulationCount: SIMULATIONS,
      });
    } catch (error) {
      console.error("Error calculating playoff predictions:", error);
      res.status(500).json({ error: "Failed to calculate playoff predictions" });
    }
  });

  // Get playoff bracket
  app.get("/api/sleeper/league/:leagueId/bracket", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const [bracket, losersBracket, rosters, users, league, nflState] = await Promise.all([
        getWinnersBracket(leagueId),
        getLosersBracket(leagueId).catch(() => null),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getLeague(leagueId).catch(() => null),
        getNFLState(),
      ]);

      // Build team info map
      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const teamMap = new Map<number, { name: string; initials: string; avatar: string | null }>();
      rosters.forEach(roster => {
        const user = userMap.get(roster.owner_id);
        const name = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        teamMap.set(roster.roster_id, {
          name,
          initials: getTeamInitials(name),
          avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
        });
      });

      // Calculate standings to determine playoff seeds
      const currentWeek = league ? getEffectiveWeek(nflState, league) : nflState.week;
      const matchupHistory: Map<number, Array<{ week: number; won: boolean | null }>> = new Map();
      rosters.forEach(r => matchupHistory.set(r.roster_id, []));
      
      const weeksToFetch = Math.max(1, currentWeek - 1);
      const matchupPromises = [];
      for (let week = 1; week <= weeksToFetch; week++) {
        matchupPromises.push(getLeagueMatchups(leagueId, week).then(matchups => ({ week, matchups })));
      }
      
      const allMatchups = await Promise.all(matchupPromises);
      
      for (const { week, matchups } of allMatchups) {
        const matchupGroups = new Map<number, typeof matchups>();
        matchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) {
            matchupGroups.set(m.matchup_id, []);
          }
          matchupGroups.get(m.matchup_id)!.push(m);
        });
        
        matchupGroups.forEach(group => {
          if (group.length !== 2) return;
          const [team1, team2] = group;
          const score1 = team1.points || 0;
          const score2 = team2.points || 0;
          
          if (score1 === 0 && score2 === 0) return;
          
          const history1 = matchupHistory.get(team1.roster_id);
          const history2 = matchupHistory.get(team2.roster_id);
          
          if (score1 > score2) {
            history1?.push({ week, won: true });
            history2?.push({ week, won: false });
          } else if (score2 > score1) {
            history1?.push({ week, won: false });
            history2?.push({ week, won: true });
          }
        });
      }

      // Calculate standings
      const standings = rosters
        .map((roster) => {
          const wins = roster.settings.wins;
          const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
          return {
            rosterId: roster.roster_id,
            wins,
            pointsFor,
          };
        })
        .sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pointsFor - a.pointsFor;
        });

      // Create seed map (1-indexed)
      const seedMap = new Map<number, number>();
      standings.forEach((team, index) => {
        seedMap.set(team.rosterId, index + 1);
      });

      // Determine number of rounds
      const maxRound = Math.max(...bracket.map(m => m.r), 0);
      const playoffTeams = league?.settings?.playoff_teams || 6;
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;

      // Fetch playoff matchup data for scoring
      const playoffMatchupData = new Map<number, Map<number, { team1Score: number; team2Score: number }>>();
      // Map: week -> matchupId -> scores
      
      // Fetch matchup data for playoff weeks (up to 3 weeks of playoffs)
      const playoffWeeks: number[] = [];
      for (let i = 0; i < 3; i++) {
        const week = playoffWeekStart + i;
        if (week <= currentWeek) {
          playoffWeeks.push(week);
        }
      }
      
      const playoffMatchupPromises = playoffWeeks.map(week => 
        getLeagueMatchups(leagueId, week)
          .then(matchups => ({ week, matchups }))
          .catch(() => ({ week, matchups: [] }))
      );
      
      const allPlayoffMatchups = await Promise.all(playoffMatchupPromises);
      
      // Build a map of week -> matchupId -> scores
      for (const { week, matchups } of allPlayoffMatchups) {
        const weekMap = new Map<number, { team1Score: number; team2Score: number }>();
        const matchupGroups = new Map<number, SleeperMatchup[]>();
        
        matchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) {
            matchupGroups.set(m.matchup_id, []);
          }
          matchupGroups.get(m.matchup_id)!.push(m);
        });
        
        matchupGroups.forEach(group => {
          if (group.length === 2) {
            const [team1, team2] = group;
            const score1 = team1.points || 0;
            const score2 = team2.points || 0;
            // Store scores keyed by roster IDs for easier lookup
            weekMap.set(team1.roster_id, { team1Score: score1, team2Score: score2 });
            weekMap.set(team2.roster_id, { team1Score: score2, team2Score: score1 });
          }
        });
        
        playoffMatchupData.set(week, weekMap);
      }
      
      // Helper function to get scores for a matchup
      const getMatchupScores = (team1Id: number | null, team2Id: number | null, round: number): { team1Score?: number; team2Score?: number } => {
        if (!team1Id || !team2Id) return {};
        
        // For placement games (round > maxRound), search all playoff weeks
        // For regular bracket games, use round-to-week mapping
        const weeksToSearch = round > maxRound 
          ? playoffWeeks  // Search all playoff weeks for placement games
          : [playoffWeekStart + (round - 1)]; // Use specific week for bracket games
        
        // Search through all relevant weeks
        for (const week of weeksToSearch) {
          const weekMatchups = allPlayoffMatchups.find(m => m.week === week)?.matchups || [];
          const matchupGroups = new Map<number, SleeperMatchup[]>();
          
          weekMatchups.forEach(m => {
            if (!matchupGroups.has(m.matchup_id)) {
              matchupGroups.set(m.matchup_id, []);
            }
            matchupGroups.get(m.matchup_id)!.push(m);
          });
          
          // Find the matchup group that contains both teams
          for (const group of Array.from(matchupGroups.values())) {
            if (group.length === 2) {
              const [t1, t2] = group;
              if ((t1.roster_id === team1Id && t2.roster_id === team2Id) ||
                  (t1.roster_id === team2Id && t2.roster_id === team1Id)) {
                const score1 = t1.points || 0;
                const score2 = t2.points || 0;
                // Return scores in the order of team1 and team2
                if (t1.roster_id === team1Id) {
                  return { team1Score: score1, team2Score: score2 };
                } else {
                  return { team1Score: score2, team2Score: score1 };
                }
              }
            }
          }
        }
        
        return {};
      };

      // Round 1 losers (by seed) so we can exclude 7th place game from main bracket when it has no p set.
      const round1Matchups = bracket.filter(m => m.r === 1);
      const round1Losers: Array<{ rosterId: number; seed: number }> = [];
      round1Matchups.forEach(matchup => {
        if (matchup.l != null) {
          const seed = seedMap.get(matchup.l);
          if (seed !== undefined) round1Losers.push({ rosterId: matchup.l, seed });
        }
      });
      round1Losers.sort((a, b) => a.seed - b.seed);
      const twoWorstRound1Losers = round1Losers.length >= 2 ? new Set(round1Losers.slice(-2).map(l => l.rosterId)) : new Set<number>();
      const isSeventhPlaceGame = (m: typeof bracket[0]) =>
        twoWorstRound1Losers.size === 2 &&
        m.t1 != null &&
        m.t2 != null &&
        twoWorstRound1Losers.has(m.t1) &&
        twoWorstRound1Losers.has(m.t2);

      // Main bracket: include only non-placement games or championship (p:1). Exclude p:3, p:5, p:7 and 7th place by structure.
      const bracketWithNames = bracket
        .filter(matchup => {
          if (matchup.p != null && matchup.p !== 1) return false; // exclude placement 3, 5, 7
          if (isSeventhPlaceGame(matchup)) return false; // 7th place game even when p not set
          return true;
        })
        .map(matchup => {
          const team1Data = matchup.t1 ? teamMap.get(matchup.t1) : null;
          const team2Data = matchup.t2 ? teamMap.get(matchup.t2) : null;
          const team1Seed = matchup.t1 ? seedMap.get(matchup.t1) : undefined;
          const team2Seed = matchup.t2 ? seedMap.get(matchup.t2) : undefined;
          
          // Get scores for this matchup
          const scores = getMatchupScores(matchup.t1, matchup.t2, matchup.r);
          
          return {
            round: matchup.r,
            matchupId: matchup.m,
            team1: matchup.t1 && team1Data ? {
              rosterId: matchup.t1,
              name: team1Data.name,
              initials: team1Data.initials,
              avatar: team1Data.avatar,
              seed: team1Seed,
            } : null,
            team2: matchup.t2 && team2Data ? {
              rosterId: matchup.t2,
              name: team2Data.name,
              initials: team2Data.initials,
              avatar: team2Data.avatar,
              seed: team2Seed,
            } : null,
            winner: matchup.w,
            loser: matchup.l,
            team1From: matchup.t1_from,
            team2From: matchup.t2_from,
            placement: matchup.p,
            team1Score: scores.team1Score,
            team2Score: scores.team2Score,
          };
        });

      // Placement section: Sleeper named games p:3, p:5, p:7 only (championship p:1 stays in main bracket).
      const placementFromBracket = (m: typeof bracket[0]) => {
        const team1Data = m.t1 ? teamMap.get(m.t1) : null;
        const team2Data = m.t2 ? teamMap.get(m.t2) : null;
        const team1Seed = m.t1 ? seedMap.get(m.t1) : undefined;
        const team2Seed = m.t2 ? seedMap.get(m.t2) : undefined;
        const scores = getMatchupScores(m.t1, m.t2, m.r);
        return {
          gameType: String(m.p),
          round: m.r,
          matchupId: m.m,
          team1: m.t1 && team1Data ? { rosterId: m.t1, name: team1Data.name, initials: team1Data.initials, avatar: team1Data.avatar, seed: team1Seed } : null,
          team2: m.t2 && team2Data ? { rosterId: m.t2, name: team2Data.name, initials: team2Data.initials, avatar: team2Data.avatar, seed: team2Seed } : null,
          winner: m.w ?? null,
          loser: m.l ?? null,
          placement: m.p,
          team1Score: scores.team1Score,
          team2Score: scores.team2Score,
        };
      };
      const fromWinners = bracket.filter(m => m.p === 3 || m.p === 5 || m.p === 7).map(placementFromBracket);
      const fromLosers = (losersBracket ?? []).filter(m => m.p === 7).map(placementFromBracket);
      // One per placement (7, 5, 3); prefer winners bracket when both have same placement
      const byPlacement = new Map<number, (typeof fromWinners)[0]>();
      [...fromWinners, ...fromLosers].forEach(m => {
        const p = m.placement ?? 99;
        if (!byPlacement.has(p)) byPlacement.set(p, m);
      });
      // If p:7 not from API, add 7th place game by structure (two worst round 1 losers) so it appears in placement section
      if (!byPlacement.has(7) && twoWorstRound1Losers.size === 2) {
        const seventhPlaceGame =
          bracket.find(isSeventhPlaceGame) ?? (losersBracket ?? []).find(isSeventhPlaceGame);
        if (seventhPlaceGame) {
          const entry = placementFromBracket(seventhPlaceGame);
          byPlacement.set(7, { ...entry, placement: 7, gameType: "7" });
        }
      }
      const consolationMatchups = [7, 5, 3].filter(p => byPlacement.has(p)).map(p => byPlacement.get(p)!);

      res.json({
        matchups: bracketWithNames,
        rounds: maxRound,
        teams: Object.fromEntries(teamMap),
        consolationMatchups: consolationMatchups.length > 0 ? consolationMatchups : undefined,
      });
    } catch (error) {
      console.error("Error fetching playoff bracket:", error);
      res.status(500).json({ error: "Failed to fetch playoff bracket" });
    }
  });

  // Team Luck - calculate luck based on points vs league median
  app.get("/api/sleeper/league/:leagueId/team-luck", async (req, res) => {
    try {
      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Get current week (completed weeks only)
      const currentWeek = getEffectiveWeek(nflState, league);
      const completedWeeks = Math.max(0, currentWeek - 1);
      
      if (completedWeeks === 0) {
        return res.json({ teams: [], currentWeek, message: "No completed weeks yet" });
      }

      // Fetch all matchups for completed weeks
      const matchupPromises = [];
      for (let week = 1; week <= completedWeeks; week++) {
        matchupPromises.push(
          getLeagueMatchups(req.params.leagueId, week)
            .then(matchups => ({ week, matchups }))
            .catch(() => ({ week, matchups: [] }))
        );
      }
      const weeklyMatchups = await Promise.all(matchupPromises);

      // Build team info map
      const teamInfoMap = new Map<number, { name: string; ownerId: string; initials: string; avatar: string | null }>();
      rosters.forEach(roster => {
        const user = userMap.get(roster.owner_id);
        const name = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        teamInfoMap.set(roster.roster_id, {
          name,
          ownerId: roster.owner_id,
          initials: getTeamInitials(name),
          avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
        });
      });

      // Calculate luck for each team
      interface TeamLuckData {
        rosterId: number;
        name: string;
        ownerId: string;
        initials: string;
        avatar: string | null;
        totalLuck: number;
        weeklyLuck: { week: number; luck: number; points: number; median: number; won: boolean }[];
        luckyWins: number;
        unluckyLosses: number;
        wins: number;
        losses: number;
      }

      const teamLuckMap = new Map<number, TeamLuckData>();
      rosters.forEach(roster => {
        const info = teamInfoMap.get(roster.roster_id)!;
        teamLuckMap.set(roster.roster_id, {
          rosterId: roster.roster_id,
          name: info.name,
          ownerId: info.ownerId,
          initials: info.initials,
          avatar: info.avatar,
          totalLuck: 0,
          weeklyLuck: [],
          luckyWins: 0,
          unluckyLosses: 0,
          wins: roster.settings?.wins || 0,
          losses: roster.settings?.losses || 0,
        });
      });

      // Process each week
      weeklyMatchups.forEach(({ week, matchups }) => {
        if (matchups.length === 0) return;

        // Get all points for this week
        const weekPoints = matchups.map(m => m.points || 0).filter(p => p > 0);
        if (weekPoints.length < 2) return;

        // Calculate median
        const sorted = [...weekPoints].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 === 0 
          ? (sorted[mid - 1] + sorted[mid]) / 2 
          : sorted[mid];

        // Group matchups by matchup_id to determine winners
        const matchupGroups = new Map<number, SleeperMatchup[]>();
        matchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) {
            matchupGroups.set(m.matchup_id, []);
          }
          matchupGroups.get(m.matchup_id)!.push(m);
        });

        // Determine winners and calculate luck
        matchupGroups.forEach(group => {
          if (group.length !== 2) return;
          
          const [team1, team2] = group;
          const team1Won = (team1.points || 0) > (team2.points || 0);
          const team2Won = (team2.points || 0) > (team1.points || 0);

          // Process team1
          const team1Data = teamLuckMap.get(team1.roster_id);
          if (team1Data) {
            const points = team1.points || 0;
            const aboveMedian = points >= median;
            let luck = 0;

            if (team1Won && !aboveMedian) {
              luck = 1; // Lucky win: won while below median
              team1Data.luckyWins++;
            } else if (!team1Won && !team2Won) {
              luck = 0; // Tie
            } else if (!team1Won && aboveMedian) {
              luck = -1; // Unlucky loss: lost while above median
              team1Data.unluckyLosses++;
            }

            team1Data.totalLuck += luck;
            team1Data.weeklyLuck.push({ week, luck, points, median, won: team1Won });
          }

          // Process team2
          const team2Data = teamLuckMap.get(team2.roster_id);
          if (team2Data) {
            const points = team2.points || 0;
            const aboveMedian = points >= median;
            let luck = 0;

            if (team2Won && !aboveMedian) {
              luck = 1; // Lucky win: won while below median
              team2Data.luckyWins++;
            } else if (!team2Won && !team1Won) {
              luck = 0; // Tie
            } else if (!team2Won && aboveMedian) {
              luck = -1; // Unlucky loss: lost while above median
              team2Data.unluckyLosses++;
            }

            team2Data.totalLuck += luck;
            team2Data.weeklyLuck.push({ week, luck, points, median, won: team2Won });
          }
        });
      });

      // Convert to array and sort by luck (luckiest first)
      const teams = Array.from(teamLuckMap.values())
        .sort((a, b) => b.totalLuck - a.totalLuck);

      res.json({
        teams,
        currentWeek,
        completedWeeks,
      });
    } catch (error) {
      console.error("Error calculating team luck:", error);
      res.status(500).json({ error: "Failed to calculate team luck" });
    }
  });

  // Rivalry - Historical head-to-head records
  app.get("/api/sleeper/league/:leagueId/rivalry/:userId", async (req, res) => {
    try {
      const { leagueId, userId } = req.params;
      
      // Get current league info first
      const [currentLeague, nflState] = await Promise.all([
        getLeague(leagueId),
        getNFLState(),
      ]);
      
      // Build a list of league IDs to check (current + previous seasons if dynasty)
      const leagueIds: { leagueId: string; season: string }[] = [];
      let checkLeagueId: string | null = leagueId;
      
      // Traverse previous league IDs (dynasty leagues link to prior seasons)
      while (checkLeagueId) {
        try {
          const leagueInfo = await getLeague(checkLeagueId);
          leagueIds.push({ leagueId: checkLeagueId, season: leagueInfo.season });
          checkLeagueId = (leagueInfo as any).previous_league_id || null;
        } catch {
          break;
        }
      }
      
      // Reverse to get chronological order (oldest first)
      leagueIds.reverse();
      
      // Track head-to-head records keyed by owner_id
      interface RivalryRecord {
        ownerId: string;
        name: string;
        initials: string;
        avatar: string | null;
        wins: number;
        losses: number;
        ties: number;
        pointsFor: number;
        pointsAgainst: number;
        matchups: {
          season: string;
          week: number;
          userPoints: number;
          oppPoints: number;
          won: boolean;
        }[];
      }
      
      const rivalryMap = new Map<string, RivalryRecord>();
      
      // Process each season
      for (const { leagueId: lid, season } of leagueIds) {
        try {
          const [rosters, users] = await Promise.all([
            getLeagueRosters(lid),
            getLeagueUsers(lid),
          ]);
          
          // Build user map for this season
          const userMap = new Map<string, SleeperLeagueUser>();
          users.forEach(u => userMap.set(u.user_id, u));
          
          // Find user's roster_id for this season
          const userRoster = rosters.find(r => r.owner_id === userId);
          if (!userRoster) continue;
          
          // Build roster_id to owner_id mapping
          const rosterToOwner = new Map<number, string>();
          rosters.forEach(r => rosterToOwner.set(r.roster_id, r.owner_id));
          
          // Determine how many weeks to check
          const currentSeason = nflState.season;
          // Use effective week for current season calculations
          const effectiveWeekForSeason = season === currentSeason ? getEffectiveWeek(nflState, currentLeague) : nflState.week;
          const maxWeek = season === currentSeason ? Math.max(0, effectiveWeekForSeason - 1) : 17;
          
          // Fetch all matchups for this season
          const matchupPromises = [];
          for (let week = 1; week <= maxWeek; week++) {
            matchupPromises.push(
              getLeagueMatchups(lid, week)
                .then(matchups => ({ week, matchups }))
                .catch(() => ({ week, matchups: [] as SleeperMatchup[] }))
            );
          }
          const weeklyMatchups = await Promise.all(matchupPromises);
          
          // Process each week's matchups
          weeklyMatchups.forEach(({ week, matchups }) => {
            if (matchups.length === 0) return;
            
            // Find user's matchup
            const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id);
            if (!userMatchup || userMatchup.matchup_id === null) return;
            
            // Find opponent
            const oppMatchup = matchups.find(
              m => m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
            );
            if (!oppMatchup) return;
            
            const oppOwnerId = rosterToOwner.get(oppMatchup.roster_id);
            if (!oppOwnerId) return;
            
            const userPoints = userMatchup.points || 0;
            const oppPoints = oppMatchup.points || 0;
            
            // Skip unplayed matchups
            if (userPoints === 0 && oppPoints === 0) return;
            
            // Get or create rivalry record
            if (!rivalryMap.has(oppOwnerId)) {
              const oppUser = userMap.get(oppOwnerId);
              const name = oppUser?.metadata?.team_name || oppUser?.display_name || `Team`;
              rivalryMap.set(oppOwnerId, {
                ownerId: oppOwnerId,
                name,
                initials: getTeamInitials(name),
                avatar: oppUser?.avatar ? `https://sleepercdn.com/avatars/thumbs/${oppUser.avatar}` : null,
                wins: 0,
                losses: 0,
                ties: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                matchups: [],
              });
            }
            
            const record = rivalryMap.get(oppOwnerId)!;
            
            // Update record
            record.pointsFor += userPoints;
            record.pointsAgainst += oppPoints;
            
            const won = userPoints > oppPoints;
            const lost = oppPoints > userPoints;
            
            if (won) record.wins++;
            else if (lost) record.losses++;
            else record.ties++;
            
            record.matchups.push({
              season,
              week,
              userPoints,
              oppPoints,
              won,
            });
          });
        } catch (error) {
          console.error(`Error processing season ${season}:`, error);
        }
      }
      
      // Convert to array and sort by most matchups (most history first)
      const rivalries = Array.from(rivalryMap.values())
        .filter(r => r.matchups.length > 0)
        .sort((a, b) => {
          // Sort by total games played, then by win rate
          const aTotal = a.wins + a.losses + a.ties;
          const bTotal = b.wins + b.losses + b.ties;
          if (bTotal !== aTotal) return bTotal - aTotal;
          const aWinRate = aTotal > 0 ? a.wins / aTotal : 0;
          const bWinRate = bTotal > 0 ? b.wins / bTotal : 0;
          return bWinRate - aWinRate;
        });
      
      res.json({
        rivalries,
        seasons: leagueIds.map(l => l.season),
        totalSeasons: leagueIds.length,
      });
    } catch (error) {
      console.error("Error calculating rivalry data:", error);
      res.status(500).json({ error: "Failed to calculate rivalry data" });
    }
  });

  // Heat Check - Compare team's last 4 weeks avg to season avg (excluding last 4)
  app.get("/api/sleeper/league/:leagueId/heat-check", async (req, res) => {
    try {
      const { leagueId } = req.params;
      
      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
        getLeague(leagueId).catch(() => null),
      ]);
      
      // Calculate completed weeks (current week - 1, since current week may not be done)
      const effectiveWeek = getEffectiveWeek(nflState, league);
      const currentWeek = Math.max(1, effectiveWeek - 1);
      
      // Need at least 5 weeks of data (4 recent + 1 baseline)
      if (currentWeek < 5) {
        return res.json({ 
          teams: [], 
          currentWeek,
          message: "Need at least 5 weeks of data for Heat Check analysis"
        });
      }
      
      // Fetch all weekly matchups to get team points
      const matchupPromises = [];
      for (let week = 1; week <= currentWeek; week++) {
        matchupPromises.push(
          getLeagueMatchups(leagueId, week)
            .then(matchups => ({ week, matchups }))
            .catch(() => ({ week, matchups: [] as SleeperMatchup[] }))
        );
      }
      const weeklyMatchups = await Promise.all(matchupPromises);
      
      // Build team weekly points map
      const teamWeeklyPoints: Record<number, number[]> = {};
      
      weeklyMatchups.forEach(({ week, matchups }) => {
        matchups.forEach(matchup => {
          if (!teamWeeklyPoints[matchup.roster_id]) {
            teamWeeklyPoints[matchup.roster_id] = Array(currentWeek).fill(null);
          }
          teamWeeklyPoints[matchup.roster_id][week - 1] = matchup.points || 0;
        });
      });
      
      // Create user lookup map
      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));
      
      // Calculate heat check for each team
      const heatCheckTeams = rosters
        .map(roster => {
          const weeklyPoints = teamWeeklyPoints[roster.roster_id];
          if (!weeklyPoints) return null;
          
          const owner = userMap.get(roster.owner_id);
          const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`;
          const initials = teamName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
          
          // Get last 4 weeks and earlier weeks
          const recentWeeks = weeklyPoints.slice(-4).filter(p => p !== null && p !== undefined);
          const earlierWeeks = weeklyPoints.slice(0, -4).filter(p => p !== null && p !== undefined);
          
          // Need data in both periods
          if (recentWeeks.length < 2 || earlierWeeks.length < 1) return null;
          
          const recentAvg = recentWeeks.reduce((a, b) => a + b, 0) / recentWeeks.length;
          const seasonAvg = earlierWeeks.reduce((a, b) => a + b, 0) / earlierWeeks.length;
          const difference = recentAvg - seasonAvg;
          const percentChange = seasonAvg > 0 ? ((recentAvg - seasonAvg) / seasonAvg) * 100 : 0;
          
          return {
            rosterId: roster.roster_id,
            ownerId: roster.owner_id,
            name: teamName,
            initials,
            avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
            recentAvg,
            seasonAvg,
            difference,
            percentChange,
            recentWeeks: recentWeeks.length,
            earlierWeeks: earlierWeeks.length,
            weeklyPoints: weeklyPoints.map((pts, idx) => ({
              week: idx + 1,
              points: pts
            })).filter(w => w.points !== null),
            isHot: difference > 0,
          };
        })
        .filter(Boolean)
        .sort((a, b) => b!.difference - a!.difference);
      
      res.json({
        teams: heatCheckTeams,
        currentWeek,
        recentWeeksCount: 4,
      });
    } catch (error) {
      console.error("Error calculating heat check:", error);
      res.status(500).json({ error: "Failed to calculate heat check" });
    }
  });

  // Power Rankings - All-Play record and weekly scoring rankings
  app.get("/api/sleeper/league/:leagueId/power-rankings", async (req, res) => {
    try {
      const { leagueId } = req.params;
      
      console.log(`[Power Rankings] Starting for league: ${leagueId}`);
      
      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
        getLeague(leagueId),
      ]);

      console.log(`[Power Rankings] League ID: ${leagueId}`);
      console.log(`[Power Rankings] League season: ${league.season}`);
      console.log(`[Power Rankings] NFL State: week ${nflState.week}, season ${nflState.season}`);
      console.log(`[Power Rankings] Previous league ID: ${(league as any).previous_league_id || 'none'}`);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Get league season
      let leagueSeason = league.season;
      const currentWeek = getEffectiveWeek(nflState, league);
      
      // Determine which league ID to use for matchups
      // If current league has no matchup data, use previous league (for dynasty leagues that rolled over)
      let matchupLeagueId = leagueId;
      
      // Test if current league has matchup data
      const testMatchup = await getLeagueMatchups(leagueId, 1).catch((err) => {
        console.error(`[Power Rankings] Error fetching week 1 matchups:`, err.message);
        return [];
      });
      console.log(`[Power Rankings] Week 1 test matchup count: ${testMatchup.length}`);
      if (testMatchup.length > 0) {
        console.log(`[Power Rankings] Week 1 first matchup points:`, testMatchup[0].points);
        console.log(`[Power Rankings] Week 1 sample matchup:`, JSON.stringify(testMatchup[0]));
      }
      
      const hasCurrentSeasonData = testMatchup.length > 0 && testMatchup.some(m => m.points !== undefined && m.points > 0);
      console.log(`[Power Rankings] Has current season data: ${hasCurrentSeasonData}`);
      
      if (!hasCurrentSeasonData && (league as any).previous_league_id) {
        // Use previous league for matchup data
        matchupLeagueId = (league as any).previous_league_id;
        console.log(`[Power Rankings] Switching to previous league: ${matchupLeagueId}`);
        // Update season to reflect previous season
        try {
          const prevLeague = await getLeague(matchupLeagueId);
          leagueSeason = prevLeague.season;
          console.log(`[Power Rankings] Previous league season: ${leagueSeason}`);
        } catch (err: any) {
          console.error(`[Power Rankings] Error fetching previous league:`, err.message);
          // Keep current season if we can't fetch previous
        }
      }
      
      console.log(`[Power Rankings] Using matchupLeagueId: ${matchupLeagueId}`);
      
      // Fetch all 18 weeks of the season to find which have data
      const matchupPromises = [];
      for (let week = 1; week <= 18; week++) {
        matchupPromises.push(
          getLeagueMatchups(matchupLeagueId, week)
            .then(matchups => ({ week, matchups }))
            .catch((err) => {
              console.error(`[Power Rankings] Error fetching week ${week} matchups:`, err.message);
              return { week, matchups: [] };
            })
        );
      }
      const allMatchups = await Promise.all(matchupPromises);
      
      console.log(`[Power Rankings] Fetched ${allMatchups.length} weeks of matchups`);
      
      // Log each week's matchup data
      allMatchups.forEach(({ week, matchups }) => {
        const hasScores = matchups.some(m => m.points !== undefined && m.points > 0);
        console.log(`[Power Rankings] Week ${week}: ${matchups.length} entries, hasScores: ${hasScores}`);
      });
      
      // Filter to only weeks that have actual scored matchups (points > 0)
      const weeklyMatchups = allMatchups.filter(({ matchups }) => 
        matchups.length > 0 && matchups.some(m => m.points !== undefined && m.points > 0)
      );
      
      const completedWeeks = weeklyMatchups.length;
      console.log(`[Power Rankings] Weeks with scores: ${completedWeeks}`);

      if (completedWeeks === 0) {
        console.log(`[Power Rankings] No completed weeks, returning empty response`);
        return res.json({ 
          teams: [], 
          currentWeek, 
          completedWeeks: 0,
          season: leagueSeason,
          message: "No completed weeks yet" 
        });
      }

      // Build team info map
      const teamInfoMap = new Map<number, { 
        name: string; 
        ownerId: string; 
        initials: string; 
        avatar: string | null;
        wins: number;
        losses: number;
      }>();
      rosters.forEach(roster => {
        const user = userMap.get(roster.owner_id);
        const name = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        teamInfoMap.set(roster.roster_id, {
          name,
          ownerId: roster.owner_id,
          initials: getTeamInitials(name),
          avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
          wins: roster.settings?.wins || 0,
          losses: roster.settings?.losses || 0,
        });
      });

      // Initialize power ranking data for each team
      interface PowerRankingData {
        rosterId: number;
        name: string;
        ownerId: string;
        initials: string;
        avatar: string | null;
        allPlayWins: number;
        allPlayLosses: number;
        allPlayWinPct: number;
        actualWins: number;
        actualLosses: number;
        weeklyRankings: { week: number; rank: number; points: number }[];
      }

      const powerRankingMap = new Map<number, PowerRankingData>();
      rosters.forEach(roster => {
        const info = teamInfoMap.get(roster.roster_id)!;
        powerRankingMap.set(roster.roster_id, {
          rosterId: roster.roster_id,
          name: info.name,
          ownerId: info.ownerId,
          initials: info.initials,
          avatar: info.avatar,
          allPlayWins: 0,
          allPlayLosses: 0,
          allPlayWinPct: 0,
          actualWins: info.wins,
          actualLosses: info.losses,
          weeklyRankings: [],
        });
      });

      const numTeams = rosters.length;

      // Process each week
      weeklyMatchups.forEach(({ week, matchups }) => {
        if (matchups.length === 0) return;

        // Get all teams' points for this week
        const weekScores: { rosterId: number; points: number }[] = matchups
          .filter(m => m.points !== undefined && m.points !== null)
          .map(m => ({
            rosterId: m.roster_id,
            points: m.points || 0,
          }));

        if (weekScores.length === 0) return;

        // Sort by points descending to determine rankings
        weekScores.sort((a, b) => b.points - a.points);

        // Assign ranks and calculate all-play record
        weekScores.forEach((team, index) => {
          const rank = index + 1;
          const allPlayWins = numTeams - rank; // Teams you beat
          const allPlayLosses = rank - 1; // Teams that beat you

          const teamData = powerRankingMap.get(team.rosterId);
          if (teamData) {
            teamData.allPlayWins += allPlayWins;
            teamData.allPlayLosses += allPlayLosses;
            teamData.weeklyRankings.push({
              week,
              rank,
              points: team.points,
            });
          }
        });
      });

      // Calculate win percentages and convert to array
      const teams = Array.from(powerRankingMap.values())
        .map(team => {
          const totalGames = team.allPlayWins + team.allPlayLosses;
          team.allPlayWinPct = totalGames > 0 
            ? Math.round((team.allPlayWins / totalGames) * 1000) / 10 
            : 0;
          return team;
        })
        .sort((a, b) => b.allPlayWinPct - a.allPlayWinPct);

      res.json({
        teams,
        currentWeek,
        completedWeeks,
        season: leagueSeason,
      });
    } catch (error) {
      console.error("Error calculating power rankings:", error);
      res.status(500).json({ error: "Failed to calculate power rankings" });
    }
  });

  // Trophy Room - Get historical champions, highest scorers, and award winners
  app.get("/api/sleeper/league/:leagueId/trophies", async (req, res) => {
    try {
      const { leagueId } = req.params;
      
      // Collect all league IDs in the dynasty chain
      const leagueIds: { leagueId: string; season: string }[] = [];
      let checkLeagueId: string | null = leagueId;
      
      while (checkLeagueId) {
        try {
          const leagueInfo = await getLeague(checkLeagueId);
          leagueIds.push({ leagueId: checkLeagueId, season: leagueInfo.season });
          checkLeagueId = (leagueInfo as any).previous_league_id || null;
        } catch {
          break;
        }
      }
      
      interface TrophyWinner {
        season: string;
        rosterId: number;
        ownerId: string;
        teamName: string;
        initials: string;
        avatar: string | null;
        value?: number; // points for highest scorer
        managerName?: string; // for best GM
        playerId?: string;
        playerName?: string;
        playerPosition?: string;
        playerTeam?: string | null;
      }
      
      const champions: TrophyWinner[] = [];
      const highestScorers: TrophyWinner[] = [];
      
      // Process each season
      for (const { leagueId: lid, season } of leagueIds) {
        try {
          const [rosters, users, league, winnersBracket] = await Promise.all([
            getLeagueRosters(lid),
            getLeagueUsers(lid),
            getLeague(lid),
            getWinnersBracket(lid).catch(() => []),
          ]);
          
          // Create user lookup map
          const userMap = new Map<string, SleeperLeagueUser>();
          users.forEach(u => userMap.set(u.user_id, u));
          
          // Create roster lookup map
          const rosterMap = new Map<number, SleeperRoster>();
          rosters.forEach(r => rosterMap.set(r.roster_id, r));
          
          // Find champion from playoff bracket (p: 1 is the championship game, w is the winner)
          const championshipGame = winnersBracket.find(m => m.p === 1);
          const championRosterId = championshipGame?.w;
          
          let champion: SleeperRoster | undefined;
          
          if (championRosterId) {
            // Playoff bracket has a winner
            champion = rosterMap.get(championRosterId);
          } else if (winnersBracket.length === 0) {
            // No bracket data (older seasons or API failure) - fallback to standings
            // Only for completed seasons, use the team with most wins and points
            const status = (league as any).status;
            const currentSeasonYear = new Date().getFullYear();
            if (status === 'complete' || parseInt(season) < currentSeasonYear) {
              const sortedRosters = [...rosters].sort((a, b) => {
                const aWins = a.settings?.wins || 0;
                const bWins = b.settings?.wins || 0;
                const aFpts = a.settings?.fpts || 0;
                const bFpts = b.settings?.fpts || 0;
                if (aWins !== bWins) return bWins - aWins;
                return bFpts - aFpts;
              });
              champion = sortedRosters[0];
            }
          }
          // If championship game exists but w is null, playoffs are still in progress - no champion yet
          
          if (champion) {
            const owner = userMap.get(champion.owner_id);
            const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${champion.roster_id}`;
            const initials = teamName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
            
            champions.push({
              season,
              rosterId: champion.roster_id,
              ownerId: champion.owner_id,
              teamName,
              initials,
              avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
            });
          }
          
          // Find highest scorer - only award after regular season is complete
          // Get the playoff start week from league settings (default to 15 if not set)
          const playoffWeekStart = (league as any).settings?.playoff_week_start || 15;
          const leagueStatus = (league as any).status;
          const currentSeasonYear = new Date().getFullYear();
          const nflState = await getNFLState();
          
          // Regular season is complete if:
          // 1. The league status is 'complete', OR
          // 2. This is a past season (season year < current year), OR
          // 3. This is the current season AND we're at or past the playoff start week
          const isCurrentSeason = parseInt(season) === currentSeasonYear || season === nflState.season;
          const effectiveWeek = getEffectiveWeek(nflState, league);
          const regularSeasonComplete = 
            leagueStatus === 'complete' || 
            parseInt(season) < currentSeasonYear ||
            (isCurrentSeason && effectiveWeek >= playoffWeekStart);
          
          if (regularSeasonComplete) {
            const highestScorer = rosters.reduce((best, current) => {
              const currentPts = (current.settings?.fpts || 0) + (current.settings?.fpts_decimal || 0) / 100;
              const bestPts = (best.settings?.fpts || 0) + (best.settings?.fpts_decimal || 0) / 100;
              return currentPts > bestPts ? current : best;
            }, rosters[0]);
            
            if (highestScorer) {
              const owner = userMap.get(highestScorer.owner_id);
              const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${highestScorer.roster_id}`;
              const initials = teamName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
              const totalPts = (highestScorer.settings?.fpts || 0) + (highestScorer.settings?.fpts_decimal || 0) / 100;
              
              // Only include if has substantial points
              if (totalPts > 100) {
                highestScorers.push({
                  season,
                  rosterId: highestScorer.roster_id,
                  ownerId: highestScorer.owner_id,
                  teamName,
                  initials,
                  avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
                  value: totalPts,
                });
              }
            }
          }
        } catch (err) {
          console.error(`Error processing season ${season}:`, err);
        }
      }
      
      // Get award winners from database
      const mvpWinners: TrophyWinner[] = [];
      const royWinners: TrophyWinner[] = [];
      const gmWinners: TrophyWinner[] = [];
      
      // Voting lock date - awards only shown after this date
      // Lock date is December 9, 2025 at 12pm EST for current season (2024)
      // For past seasons, we assume voting was locked at end of that season
      const currentYear = new Date().getFullYear();
      const LOCK_DATE = new Date("2025-12-09T12:00:00-05:00");
      const now = new Date();
      const isCurrentSeasonLocked = now >= LOCK_DATE;
      
      // Fetch award data for all seasons in this league chain
      for (const { leagueId: lid, season } of leagueIds) {
        // Only show award winners for past seasons or if current season voting is locked
        const seasonYear = parseInt(season);
        const isSeasonLocked = seasonYear < currentYear || (seasonYear === currentYear && isCurrentSeasonLocked);
        
        if (!isSeasonLocked) {
          continue; // Skip this season's awards - voting not locked yet
        }
        
        // Calculate winners for each award type
        for (const awardType of ['mvp', 'roy', 'gm'] as const) {
          try {
            const nominations = await storage.getAwardNominations(lid, season, awardType);
            const ballots = await storage.getAwardBallots(lid, season, awardType);
            
            if (nominations.length === 0 || ballots.length === 0) continue;
            
            // Calculate points for each nomination
            const points: Record<string, number> = {};
            ballots.forEach(ballot => {
              points[ballot.firstPlaceId] = (points[ballot.firstPlaceId] || 0) + 3;
              points[ballot.secondPlaceId] = (points[ballot.secondPlaceId] || 0) + 2;
              points[ballot.thirdPlaceId] = (points[ballot.thirdPlaceId] || 0) + 1;
            });
            
            // Find winner
            const sortedNominations = [...nominations].sort((a, b) => 
              (points[b.id] || 0) - (points[a.id] || 0)
            );
            
            const winner = sortedNominations[0];
            if (winner && (points[winner.id] || 0) > 0) {
              const trophy: TrophyWinner = {
                season,
                rosterId: winner.nominatedByRosterId,
                ownerId: winner.nominatedBy,
                teamName: winner.playerName,
                initials: winner.playerName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase(),
                avatar: null,
                playerId: winner.playerId,
                playerName: winner.playerName,
                playerPosition: winner.playerPosition,
                playerTeam: winner.playerTeam,
                value: points[winner.id],
              };
              
              if (awardType === 'mvp') mvpWinners.push(trophy);
              else if (awardType === 'roy') royWinners.push(trophy);
              else gmWinners.push(trophy);
            }
          } catch (err) {
            // No award data for this season/type
          }
        }
      }
      
      res.json({
        champions: champions.sort((a, b) => parseInt(b.season) - parseInt(a.season)),
        highestScorers: highestScorers.sort((a, b) => parseInt(b.season) - parseInt(a.season)),
        mvpWinners: mvpWinners.sort((a, b) => parseInt(b.season) - parseInt(a.season)),
        royWinners: royWinners.sort((a, b) => parseInt(b.season) - parseInt(a.season)),
        gmWinners: gmWinners.sort((a, b) => parseInt(b.season) - parseInt(a.season)),
        seasonsTracked: leagueIds.length,
      });
    } catch (error) {
      console.error("Error fetching trophies:", error);
      res.status(500).json({ error: "Failed to fetch trophy data" });
    }
  });

  // Search players (for nomination lookup)
  app.get("/api/sleeper/players/search", async (req, res) => {
    try {
      const search = (req.query.q as string || "").toLowerCase().trim();
      const rookiesOnly = req.query.rookies === "true";
      
      if (!search || search.length < 2) {
        return res.json([]);
      }

      const players = await getAllPlayers();
      const playerList = Object.values(players)
        .filter(p => {
          if (!p.position || !["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position)) return false;
          const fullName = (p.full_name || `${p.first_name} ${p.last_name}`).toLowerCase();
          const matchesSearch = fullName.includes(search);
          if (rookiesOnly) {
            const yearsExp = Number(p.years_exp) || 0;
            return matchesSearch && (yearsExp === 0 || yearsExp === 1);
          }
          return matchesSearch;
        })
        .slice(0, 20)
        .map(p => ({
          id: p.player_id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: p.position,
          team: p.team,
          age: p.age,
          yearsExp: Number(p.years_exp) || 0,
          status: p.status,
          injuryStatus: p.injury_status,
        }));
      res.json(playerList);
    } catch (error) {
      console.error("Error searching players:", error);
      res.status(500).json({ error: "Failed to search players" });
    }
  });

  // Get all players (for search/lookup)
  app.get("/api/sleeper/players", async (_req, res) => {
    try {
      const players = await getAllPlayers();
      const playerList = Object.values(players)
        .filter(p => p.position && ["QB", "RB", "WR", "TE", "K", "DEF"].includes(p.position))
        .map(p => ({
          id: p.player_id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: p.position,
          team: p.team,
          age: p.age,
          yearsExp: p.years_exp,
          status: p.status,
          injuryStatus: p.injury_status,
        }));
      res.json(playerList);
    } catch (error) {
      console.error("Error fetching players:", error);
      res.status(500).json({ error: "Failed to fetch players" });
    }
  });

  // Player detail with season stats, projections, and news
  app.get("/api/sleeper/player/:playerId/detail", async (req, res) => {
    try {
      const { playerId } = req.params;
      const week = parseInt(req.query.week as string) || 1;
      const leagueId = req.query.leagueId as string;
      
      const [players, nflState, league] = await Promise.all([
        getAllPlayers(),
        getNFLState(),
        leagueId ? getLeague(leagueId).catch(() => null) : Promise.resolve(null),
      ]);
      
      const player = players[playerId];
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      
      const season = league?.season || nflState.season || new Date().getFullYear().toString();
      const currentWeek = getEffectiveWeek(nflState, league);
      
      // Fetch weekly stats and projections for all weeks played so far
      const weeklyData: { week: number; actual: number | null; projected: number }[] = [];
      
      type StatsRecord = Record<string, Record<string, number>>;
      const statsPromises: Promise<StatsRecord>[] = [];
      const projPromises: Promise<StatsRecord>[] = [];
      
      for (let w = 1; w <= Math.max(currentWeek, week); w++) {
        statsPromises.push(
          getPlayerStats(season, w).catch(() => ({} as StatsRecord))
        );
        projPromises.push(
          getPlayerProjections(season, w).catch(() => ({} as StatsRecord))
        );
      }
      
      const [allStats, allProjs] = await Promise.all([
        Promise.all(statsPromises),
        Promise.all(projPromises),
      ]);
      
      for (let w = 1; w <= Math.max(currentWeek, week); w++) {
        const weekStats = allStats[w - 1] || {};
        const weekProj = allProjs[w - 1] || {};
        
        const playerStats = weekStats[playerId];
        const playerProj = weekProj[playerId];
        
        const actualPoints = playerStats 
          ? (playerStats.pts_ppr || playerStats.pts_half_ppr || playerStats.pts_std || 0)
          : null;
        const projectedPoints = playerProj
          ? (playerProj.pts_ppr || playerProj.pts_half_ppr || playerProj.pts_std || 0)
          : 0;
        
        weeklyData.push({
          week: w,
          actual: w <= currentWeek ? actualPoints : null,
          projected: projectedPoints,
        });
      }
      
      // Calculate boom/bust based on recent 8-week rolling window
      const recentGames = weeklyData
        .filter(d => d.actual !== null && d.actual > 0)
        .slice(-8);
      
      let boom = 0;
      let bust = 0;
      let avgPoints = 0;
      let stdDev = 0;
      
      if (recentGames.length >= 3) {
        const points = recentGames.map(g => g.actual as number);
        avgPoints = points.reduce((a, b) => a + b, 0) / points.length;
        const variance = points.reduce((sum, v) => sum + Math.pow(v - avgPoints, 2), 0) / points.length;
        stdDev = Math.sqrt(variance) || avgPoints * 0.3;
        boom = Math.round(avgPoints + stdDev);
        bust = Math.round(Math.max(0, avgPoints - stdDev));
      } else {
        // Use position baseline for players with limited data
        const positionBaselines: Record<string, { mean: number; stdDev: number }> = {
          QB: { mean: 18, stdDev: 6 },
          RB: { mean: 12, stdDev: 6 },
          WR: { mean: 11, stdDev: 6 },
          TE: { mean: 8, stdDev: 5 },
          K: { mean: 8, stdDev: 3 },
          DEF: { mean: 7, stdDev: 4 },
        };
        const baseline = positionBaselines[player.position] || { mean: 10, stdDev: 5 };
        avgPoints = baseline.mean;
        stdDev = baseline.stdDev;
        boom = Math.round(avgPoints + stdDev);
        bust = Math.round(Math.max(0, avgPoints - stdDev));
      }
      
      // Calculate boom/bust percentages based on volatility
      const boomPct = Math.min(50, Math.round((stdDev / avgPoints) * 100)) || 25;
      const bustPct = Math.min(50, Math.round((stdDev / avgPoints) * 80)) || 20;
      
      // Build news items from player metadata
      const newsItems: { type: string; text: string; date?: string }[] = [];
      
      if (player.injury_status) {
        newsItems.push({
          type: "injury",
          text: `${player.injury_status}${player.injury_body_part ? ` (${player.injury_body_part})` : ""}${player.injury_notes ? `: ${player.injury_notes}` : ""}`,
          date: player.injury_start_date || undefined,
        });
      }
      
      if (player.practice_participation || player.practice_description) {
        newsItems.push({
          type: "practice",
          text: `Practice: ${player.practice_participation || "Unknown"}${player.practice_description ? ` - ${player.practice_description}` : ""}`,
        });
      }
      
      if (player.depth_chart_order && player.depth_chart_position) {
        const ordinal = ["", "1st", "2nd", "3rd", "4th"][player.depth_chart_order] || `${player.depth_chart_order}th`;
        newsItems.push({
          type: "depth",
          text: `Depth Chart: ${ordinal} string ${player.depth_chart_position}`,
        });
      }
      
      // Get current week projection for display
      const currentWeekProj = weeklyData.find(d => d.week === week);
      const projectedTotal = currentWeekProj?.projected || 0;
      
      res.json({
        player: {
          id: player.player_id,
          name: player.full_name || `${player.first_name} ${player.last_name}`,
          position: player.position,
          team: player.team,
          number: player.number,
          age: player.age,
          height: player.height,
          weight: player.weight,
          college: player.college,
          yearsExp: player.years_exp,
          status: player.status,
          injuryStatus: player.injury_status,
        },
        weeklyData,
        boomBust: {
          boom,
          bust,
          boomPct,
          bustPct,
          avgPoints: Math.round(avgPoints * 10) / 10,
          gamesPlayed: recentGames.length,
        },
        projectedTotal,
        news: newsItems,
        selectedWeek: week,
      });
    } catch (error) {
      console.error("Error fetching player detail:", error);
      res.status(500).json({ error: "Failed to fetch player detail" });
    }
  });

  // Rule Suggestions API - Health Check
  app.get("/api/league/:leagueId/rule-suggestions/health", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      console.log("[API] GET /api/league/:leagueId/rule-suggestions/health - Checking database health for league:", leagueId);
      
      if (!leagueId) {
        return res.status(400).json({ 
          healthy: false,
          error: "League ID is required" 
        });
      }

      // Test database connection and table existence
      try {
        // Try a simple query to check if table exists
        const testQuery = await storage.getRuleSuggestions(leagueId);
        return res.json({
          healthy: true,
          tableExists: true,
          connectionStatus: "connected",
          message: "Database connection and table are healthy"
        });
      } catch (dbError: any) {
        const errorMessage = dbError.message || "Unknown database error";
        const tableMissing = errorMessage.includes("does not exist") || 
                            errorMessage.includes("relation") ||
                            errorMessage.includes("migrations");
        const connectionError = errorMessage.includes("connection") || 
                              errorMessage.includes("timeout");
        
        return res.status(500).json({
          healthy: false,
          tableExists: !tableMissing,
          connectionStatus: connectionError ? "disconnected" : "connected",
          error: errorMessage,
          suggestion: tableMissing 
            ? "Run 'npm run db:push' to create the required tables."
            : connectionError
            ? "Check DATABASE_URL environment variable."
            : "Check database configuration."
        });
      }
    } catch (error: any) {
      console.error("[API] Error in health check:", error);
      return res.status(500).json({
        healthy: false,
        error: error.message || "Health check failed"
      });
    }
  });

  // Rule Suggestions API
  app.get("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      if (!leagueId) {
        return res.status(400).json({ error: "League ID is required" });
      }

      let currentSeason: string | null = null;
      try {
        const league = await getLeague(leagueId);
        currentSeason = league?.season ?? null;
      } catch {
        // league may not exist; still return suggestions
      }
      const suggestions = await storage.getRuleSuggestions(leagueId, currentSeason);

      // Get voting status for each rule (only if there are suggestions)
      const suggestionsWithVoting = suggestions.length > 0
        ? await Promise.all(
            suggestions.map(async (suggestion) => {
              const votingEnabled = await storage.getLeagueSetting(
                leagueId,
                `rule_voting_enabled_${suggestion.id}`
              );
              return {
                ...suggestion,
                votingEnabled: votingEnabled === "true",
              };
            })
          )
        : [];

      const votingMasterEnabled = (await storage.getLeagueSetting(leagueId, "rule_voting_master")) === "true";
      res.json({ suggestions: suggestionsWithVoting, votingMasterEnabled });
    } catch (error: any) {
      console.error("Error fetching rule suggestions:", error);
      const errorMessage = error?.message || "Unknown error";
      const errorCode = error?.code;
      
      // Check if table doesn't exist (PostgreSQL error code 42P01)
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("rule_suggestions")) {
        return res.status(500).json({ 
          error: "Database table does not exist. Please run 'npm run db:push' to create the required tables.",
          details: errorMessage,
          code: errorCode
        });
      }
      
      res.status(500).json({ 
        error: "Failed to fetch rule suggestions",
        details: errorMessage,
        code: errorCode
      });
    }
  });

  app.get("/api/league/:leagueId/rule-voting-master", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      if (!leagueId) return res.status(400).json({ error: "League ID is required" });
      const votingMasterEnabled = (await storage.getLeagueSetting(leagueId, "rule_voting_master")) === "true";
      res.json({ votingMasterEnabled });
    } catch (error) {
      console.error("Error fetching rule voting master:", error);
      res.status(500).json({ error: "Failed to fetch voting state" });
    }
  });

  app.post("/api/league/:leagueId/rule-voting-master", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { userId, enabled } = req.body;
      if (!leagueId || userId == null) return res.status(400).json({ error: "League ID and userId are required" });
      const isUserCommissioner = await isCommissioner(userId, leagueId);
      if (!isUserCommissioner) {
        return res.status(403).json({ error: "Only the commissioner can change the voting state." });
      }
      await storage.setLeagueSetting(leagueId, "rule_voting_master", enabled ? "true" : "false");
      res.json({ votingMasterEnabled: !!enabled });
    } catch (error) {
      console.error("Error setting rule voting master:", error);
      res.status(500).json({ error: "Failed to set voting state" });
    }
  });

  app.post("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { authorId, authorName, rosterId, title, description, voteType, options } = req.body;
      
      if (!leagueId) {
        return res.status(400).json({ error: "League ID is required" });
      }
      if (!authorId) {
        return res.status(400).json({ error: "Author ID is required" });
      }
      if (!authorName || authorName.trim() === "") {
        return res.status(400).json({ error: "Author name is required" });
      }
      if (rosterId === undefined || rosterId === null) {
        return res.status(400).json({ error: "Roster ID is required. Please select your team first." });
      }
      if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!description || description.trim() === "") {
        return res.status(400).json({ error: "Description is required" });
      }
      const resolvedVoteType = voteType === "multi_choice" ? "multi_choice" : "binary";
      if (resolvedVoteType === "multi_choice") {
        if (!Array.isArray(options) || options.length < 3) {
          return res.status(400).json({ error: "Multi-choice rules require at least 3 options." });
        }
        const validOptions = options.filter((o: unknown) => typeof o === "string" && o.trim() !== "");
        if (validOptions.length < 3) {
          return res.status(400).json({ error: "Multi-choice rules require at least 3 non-empty options." });
        }
      }

      const parsedRosterId = parseInt(String(rosterId), 10);
      if (isNaN(parsedRosterId) || parsedRosterId <= 0) {
        return res.status(400).json({ error: "Invalid roster ID. Please select your team again." });
      }

      const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
      const authorIsCommissioner = await isCommissioner(authorId, leagueId);
      if (votingMaster === "true" && !authorIsCommissioner) {
        return res.status(403).json({
          error: "Suggestions are closed while voting is open. Only the commissioner can suggest during this time.",
        });
      }

      let season: string | undefined;
      try {
        const league = await getLeague(leagueId);
        season = league?.season;
      } catch {
        // leave season undefined for legacy behavior
      }

      const suggestion = await storage.createRuleSuggestion({
        leagueId,
        authorId,
        authorName: authorName.trim(),
        rosterId: parsedRosterId,
        title: title.trim(),
        description: description.trim(),
        ...(season != null && { season }),
        ...(resolvedVoteType === "multi_choice" && { voteType: "multi_choice", options: options.map((o: string) => String(o).trim()) }),
      });
      
      // Default voting to enabled for new rules
      await storage.setLeagueSetting(
        leagueId,
        `rule_voting_enabled_${suggestion.id}`,
        "true"
      );
      
      res.json({ ...suggestion, votingEnabled: true });
    } catch (error) {
      console.error("Error creating rule suggestion:", error);
      res.status(500).json({ error: "Failed to create rule suggestion" });
    }
  });

  // Update a rule suggestion (author or commissioner only)
  app.put("/api/league/:leagueId/rule-suggestions/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const { userId, title, description, voteType, options } = req.body;
      
      console.log("[API] PUT /api/league/:leagueId/rule-suggestions/:id - Updating rule in rule_suggestions table. ID:", id);
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      if (title === undefined && description === undefined && voteType === undefined && options === undefined) {
        return res.status(400).json({ error: "Must provide title, description, voteType, or options to update" });
      }
      if (voteType === "multi_choice" && (!Array.isArray(options) || options.length < 3)) {
        return res.status(400).json({ error: "Multi-choice rules require at least 3 options." });
      }

      // Get the rule suggestion to check authorization
      const rule = await storage.getRuleSuggestionById(id);
      if (!rule) {
        console.log("[API] Rule suggestion not found in rule_suggestions table. ID:", id);
        return res.status(404).json({ error: "Rule suggestion not found" });
      }

      if (rule.leagueId !== leagueId) {
        return res.status(400).json({ error: "Rule suggestion does not belong to this league" });
      }

      // Check authorization: user must be the author or a commissioner
      const league = await getLeague(leagueId);
      const isAuthor = rule.authorId === userId;
      const isCommissioner = league && (league.owner_id === userId || 
        ["900186363130503168"].includes(userId));
      
      if (!isAuthor && !isCommissioner) {
        return res.status(403).json({ error: "Unauthorized: You can only edit your own rule suggestions" });
      }

      // Update the rule suggestion
      const updateData: { title?: string; description?: string; voteType?: "binary" | "multi_choice"; options?: string[] | null } = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (voteType !== undefined) updateData.voteType = voteType;
      if (options !== undefined) updateData.options = Array.isArray(options) ? options.map((o: string) => String(o).trim()) : null;

      const updated = await storage.updateRuleSuggestion(id, updateData);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update rule suggestion" });
      }

      console.log("[API] Successfully updated rule in rule_suggestions table. ID:", id);

      // Get voting status
      const votingEnabled = await storage.getLeagueSetting(
        leagueId,
        `rule_voting_enabled_${id}`
      );

      res.json({ ...updated, votingEnabled: votingEnabled === "true" });
    } catch (error: any) {
      console.error("[API] Error updating rule in rule_suggestions table:", error);
      const errorMessage = error.message || "Failed to update rule suggestion";
      if (errorMessage.includes("does not exist") || errorMessage.includes("migrations")) {
        return res.status(500).json({ 
          error: "Database table error. Please ensure rule_suggestions table exists.",
          details: errorMessage 
        });
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Delete a rule suggestion (author or commissioner only)
  app.delete("/api/league/:leagueId/rule-suggestions/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const { userId } = req.body;
      
      console.log("[API] DELETE /api/league/:leagueId/rule-suggestions/:id - Deleting rule from rule_suggestions table. ID:", id);
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Get the rule suggestion to check authorization
      const rule = await storage.getRuleSuggestionById(id);
      if (!rule) {
        console.log("[API] Rule suggestion not found in rule_suggestions table. ID:", id);
        return res.status(404).json({ error: "Rule suggestion not found" });
      }

      if (rule.leagueId !== leagueId) {
        return res.status(400).json({ error: "Rule suggestion does not belong to this league" });
      }

      // Check authorization: user must be the author or a commissioner
      const league = await getLeague(leagueId);
      const isAuthor = rule.authorId === userId;
      const isCommissioner = league && (league.owner_id === userId || 
        ["900186363130503168"].includes(userId));
      
      if (!isAuthor && !isCommissioner) {
        return res.status(403).json({ error: "Unauthorized: You can only delete your own rule suggestions" });
      }

      // Delete the rule suggestion (this will also delete associated votes)
      await storage.deleteRuleSuggestion(id);
      console.log("[API] Successfully deleted rule from rule_suggestions table. ID:", id);

      // Also delete the voting setting if it exists
      try {
        await storage.setLeagueSetting(
          leagueId,
          `rule_voting_enabled_${id}`,
          ""
        );
      } catch (e) {
        // Ignore errors deleting the setting
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[API] Error deleting rule from rule_suggestions table:", error);
      const errorMessage = error.message || "Failed to delete rule suggestion";
      if (errorMessage.includes("does not exist") || errorMessage.includes("migrations")) {
        return res.status(500).json({ 
          error: "Database table error. Please ensure rule_suggestions table exists.",
          details: errorMessage 
        });
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Cast vote on a rule (1 vote per team per rule; binary or ranked for multi-choice)
  app.post("/api/rule-suggestions/:id/vote", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rule = await storage.getRuleSuggestionById(ruleId);
      if (!rule) {
        return res.status(404).json({ error: "Rule suggestion not found" });
      }
      const voteType = (rule as any).voteType ?? "binary";
      const options = (rule as any).options as string[] | null | undefined;
      const N = Array.isArray(options) ? options.length : 0;

      if (voteType === "multi_choice") {
        const { rosterId, voterName, leagueId, points } = req.body;
        if (!rosterId || !voterName || !leagueId || !Array.isArray(points)) {
          return res.status(400).json({ error: "Missing required fields: rosterId, voterName, leagueId, points" });
        }
        if (points.length !== N) {
          return res.status(400).json({ error: "Points array length must match number of options." });
        }
        const expected = new Set(Array.from({ length: N }, (_, i) => i + 1));
        const given = new Set(points.map((p: number) => Number(p)));
        const valid = expected.size === given.size && [...expected].every((v) => given.has(v));
        if (!valid) {
          return res.status(400).json({ error: "Points must be a permutation of 1 to N (one rank per option)." });
        }
        const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
        if (votingMaster !== "true") {
          return res.status(403).json({ error: "Voting is currently closed." });
        }
        await storage.castRuleRankedVote(ruleId, parseInt(rosterId), voterName, points.map((p: number) => Number(p)));
        return res.json({ success: true });
      }

      const { rosterId, voterName, vote, leagueId } = req.body;
      if (!rosterId || !voterName || !vote || !leagueId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (vote !== "approve" && vote !== "reject") {
        return res.status(400).json({ error: "Invalid vote type" });
      }
      const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
      if (votingMaster !== "true") {
        return res.status(403).json({ error: "Voting is currently closed." });
      }
      const ruleVote = await storage.castRuleVote({
        ruleId,
        rosterId: parseInt(rosterId),
        voterName,
        vote,
      });
      res.json(ruleVote);
    } catch (error) {
      console.error("Error voting on rule suggestion:", error);
      res.status(500).json({ error: "Failed to vote on rule suggestion" });
    }
  });

  // Get votes for a specific rule
  app.get("/api/rule-suggestions/:id/votes", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rule = await storage.getRuleSuggestionById(ruleId);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      const voteType = (rule as any).voteType ?? "binary";
      const votingMasterEnabled = (await storage.getLeagueSetting(rule.leagueId, "rule_voting_master")) === "true";
      if (votingMasterEnabled) {
        if (voteType === "multi_choice") {
          return res.json({ ranked: true, pointsByOption: [], voterCount: 0 });
        }
        return res.json({ approveCount: 0, rejectCount: 0 });
      }
      if (voteType === "multi_choice") {
        const { pointsByOption, voterCount } = await storage.getRuleRankedVotes(ruleId);
        return res.json({ ranked: true, pointsByOption, voterCount });
      }
      const votes = await storage.getRuleVotes(ruleId);
      const approveCount = votes.filter(v => v.vote === "approve").length;
      const rejectCount = votes.filter(v => v.vote === "reject").length;
      res.json({ votes, approveCount, rejectCount });
    } catch (error) {
      console.error("Error fetching rule votes:", error);
      res.status(500).json({ error: "Failed to fetch rule votes" });
    }
  });

  // Get user's vote on a rule
  app.get("/api/rule-suggestions/:id/votes/:rosterId", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rosterId = parseInt(req.params.rosterId);
      const rule = await storage.getRuleSuggestionById(ruleId);
      const voteType = rule ? (rule as any).voteType ?? "binary" : "binary";
      if (voteType === "multi_choice") {
        const pointsByOption = await storage.getRuleRankedVoteByRoster(ruleId, rosterId);
        return res.json(pointsByOption != null ? { pointsByOption } : null);
      }
      const vote = await storage.getRuleVoteByRoster(ruleId, rosterId);
      res.json(vote || null);
    } catch (error) {
      console.error("Error fetching user vote:", error);
      res.status(500).json({ error: "Failed to fetch user vote" });
    }
  });

  // Toggle voting on/off for a rule (commissioner only)
  app.post("/api/rule-suggestions/:id/toggle-voting", async (req, res) => {
    try {
      const { leagueId, enabled } = req.body;
      if (!leagueId || typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      await storage.setLeagueSetting(
        leagueId,
        `rule_voting_enabled_${req.params.id}`,
        enabled ? "true" : "false"
      );
      res.json({ success: true, votingEnabled: enabled });
    } catch (error) {
      console.error("Error toggling voting:", error);
      res.status(500).json({ error: "Failed to toggle voting" });
    }
  });

  // Award Nominations API
  app.get("/api/league/:leagueId/awards/:season/:awardType", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      res.json(nominations);
    } catch (error) {
      console.error("Error fetching award nominations:", error);
      res.status(500).json({ error: "Failed to fetch award nominations" });
    }
  });

  // Create nomination (max 3 per team per award type)
  app.post("/api/league/:leagueId/awards/:season/:awardType/nominate", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { playerId, playerName, playerPosition, playerTeam, nominatedBy, nominatedByName, nominatedByRosterId } = req.body;
      
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      if (!playerId || !playerName || !nominatedBy || !nominatedByName || !nominatedByRosterId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check nomination limit (3 per team per award type)
      const currentCount = await storage.getNominationCountByRoster(leagueId, season, awardType, nominatedByRosterId);
      if (currentCount >= 3) {
        return res.status(400).json({ error: "Maximum 3 nominations per team per award" });
      }

      const nomination = await storage.createAwardNomination({
        leagueId,
        season,
        awardType,
        playerId,
        playerName,
        playerPosition: playerPosition || "",
        playerTeam: playerTeam || null,
        nominatedBy,
        nominatedByName,
        nominatedByRosterId,
      });
      res.json(nomination);
    } catch (error) {
      console.error("Error creating award nomination:", error);
      res.status(500).json({ error: "Failed to create award nomination" });
    }
  });

  // Get nomination count for a roster
  app.get("/api/league/:leagueId/awards/:season/:awardType/nominations/count/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, awardType, rosterId } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const count = await storage.getNominationCountByRoster(leagueId, season, awardType, parseInt(rosterId));
      res.json({ count, remaining: 3 - count });
    } catch (error) {
      console.error("Error fetching nomination count:", error);
      res.status(500).json({ error: "Failed to fetch nomination count" });
    }
  });

  // Submit ranked ballot (1st=3pts, 2nd=2pts, 3rd=1pt)
  app.post("/api/league/:leagueId/awards/:season/:awardType/ballot", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { rosterId, voterName, firstPlaceId, secondPlaceId, thirdPlaceId } = req.body;
      
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      if (!rosterId || !voterName || !firstPlaceId || !secondPlaceId || !thirdPlaceId) {
        return res.status(400).json({ error: "Missing required fields - must vote for 1st, 2nd, and 3rd place" });
      }

      // Validate all three picks are different
      if (firstPlaceId === secondPlaceId || firstPlaceId === thirdPlaceId || secondPlaceId === thirdPlaceId) {
        return res.status(400).json({ error: "Cannot vote for the same player multiple times" });
      }

      // Validate all picks are valid nominations
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      const nominationIds = new Set(nominations.map(n => n.id));
      if (!nominationIds.has(firstPlaceId) || !nominationIds.has(secondPlaceId) || !nominationIds.has(thirdPlaceId)) {
        return res.status(400).json({ error: "Invalid nomination ID" });
      }

      const ballot = await storage.upsertAwardBallot({
        leagueId,
        season,
        awardType,
        rosterId,
        voterName,
        firstPlaceId,
        secondPlaceId,
        thirdPlaceId,
      });
      res.json(ballot);
    } catch (error) {
      console.error("Error submitting ballot:", error);
      res.status(500).json({ error: "Failed to submit ballot" });
    }
  });

  // Get user's current ballot
  app.get("/api/league/:leagueId/awards/:season/:awardType/ballot/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, awardType, rosterId } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const ballot = await storage.getAwardBallotByRoster(leagueId, season, awardType, parseInt(rosterId));
      res.json(ballot || null);
    } catch (error) {
      console.error("Error fetching ballot:", error);
      res.status(500).json({ error: "Failed to fetch ballot" });
    }
  });

  // Get award results with scores
  app.get("/api/league/:leagueId/awards/:season/:awardType/results", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }

      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      const ballots = await storage.getAwardBallots(leagueId, season, awardType);

      // Calculate scores for each nomination
      const scores = new Map<string, number>();
      nominations.forEach(n => scores.set(n.id, 0));

      ballots.forEach(ballot => {
        const current1 = scores.get(ballot.firstPlaceId) || 0;
        const current2 = scores.get(ballot.secondPlaceId) || 0;
        const current3 = scores.get(ballot.thirdPlaceId) || 0;
        scores.set(ballot.firstPlaceId, current1 + 3);
        scores.set(ballot.secondPlaceId, current2 + 2);
        scores.set(ballot.thirdPlaceId, current3 + 1);
      });

      const results = nominations.map(n => ({
        ...n,
        score: scores.get(n.id) || 0,
        firstPlaceVotes: ballots.filter(b => b.firstPlaceId === n.id).length,
        secondPlaceVotes: ballots.filter(b => b.secondPlaceId === n.id).length,
        thirdPlaceVotes: ballots.filter(b => b.thirdPlaceId === n.id).length,
      })).sort((a, b) => b.score - a.score);

      res.json({ 
        results, 
        totalBallots: ballots.length,
        totalTeams: nominations.length > 0 ? 12 : 0 // Adjust based on league size
      });
    } catch (error) {
      console.error("Error fetching award results:", error);
      res.status(500).json({ error: "Failed to fetch award results" });
    }
  });

  // IMPORTANT: Specific routes like /settings/dead-cap-enabled MUST be defined BEFORE
  // generic wildcard routes like /settings/:settingKey. Express matches routes in order,
  // so wildcards will catch specific paths if they come first. Do not reorganize these
  // routes without understanding this constraint.
  
  // Get dead cap enabled setting (MUST be before generic /settings/:settingKey route)
  app.get("/api/league/:leagueId/settings/dead-cap-enabled", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const value = await storage.getLeagueSetting(leagueId, "dead_cap_enabled");
      // Default to "true" if setting doesn't exist (backward compatibility)
      res.json({ enabled: value === "true" || value === undefined || value === null });
    } catch (error) {
      console.error("Error fetching dead cap enabled setting:", error);
      res.status(500).json({ error: "Failed to fetch dead cap enabled setting", message: dbErrorMessage(error) });
    }
  });

  // Set dead cap enabled setting (commissioner only) (MUST be before generic /settings/:settingKey route)
  app.put("/api/league/:leagueId/settings/dead-cap-enabled", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.query.userId as string;
      const { enabled } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Enabled must be a boolean" });
      }

      // Check if user is commissioner
      const isComm = await isCommissioner(userId, leagueId);
      
      if (!isComm) {
        return res.status(403).json({ error: "Unauthorized: Only commissioners can change this setting" });
      }
      
      const setting = await storage.setLeagueSetting(leagueId, "dead_cap_enabled", enabled ? "true" : "false");
      res.json({ enabled: setting.settingValue === "true" });
    } catch (error) {
      console.error("Error setting dead cap enabled setting:", error);
      res.status(500).json({ error: "Failed to set dead cap enabled setting" });
    }
  });

  // Get league setting (generic - must come AFTER specific routes like dead-cap-enabled)
  app.get("/api/league/:leagueId/settings/:settingKey", async (req, res) => {
    try {
      const { leagueId, settingKey } = req.params;
      const value = await storage.getLeagueSetting(leagueId, settingKey);
      res.json({ value: value || null });
    } catch (error) {
      console.error("Error fetching league setting:", error);
      res.status(500).json({ error: "Failed to fetch league setting" });
    }
  });

  // Set league setting (commissioner only - verified on client) (generic - must come AFTER specific routes)
  app.post("/api/league/:leagueId/settings/:settingKey", async (req, res) => {
    try {
      const { leagueId, settingKey } = req.params;
      const { value } = req.body;
      
      if (typeof value !== "string") {
        return res.status(400).json({ error: "Value must be a string" });
      }
      
      const setting = await storage.setLeagueSetting(leagueId, settingKey, value);
      res.json(setting);
    } catch (error) {
      console.error("Error setting league setting:", error);
      res.status(500).json({ error: "Failed to set league setting" });
    }
  });

  // Get all player contracts for a league
  app.get("/api/league/:leagueId/contracts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const contracts = await storage.getPlayerContracts(leagueId);
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ error: "Failed to fetch contracts", message: dbErrorMessage(error) });
    }
  });

  // Save player contracts (bulk upsert)
  app.post("/api/league/:leagueId/contracts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { contracts } = req.body;
      
      if (!Array.isArray(contracts)) {
        return res.status(400).json({ error: "Contracts must be an array" });
      }

      // Get all existing contracts once to avoid repeated queries
      const existingContracts = await storage.getPlayerContracts(leagueId);
      
      const results = [];
      for (const contract of contracts) {
        // Check if this is a new roster (player moved teams) - if so, reset tracking flags
        const existingContractForPlayer = existingContracts.find(
          c => c.playerId === contract.playerId && c.leagueId === leagueId
        );
        
        // If player is moving to a new roster, reset both tracking flags
        const isNewRoster = existingContractForPlayer && existingContractForPlayer.rosterId !== contract.rosterId;
        
        // Check if franchise tag is being applied
        const isApplyingFranchiseTag = contract.franchiseTagUsed === 1;
        
        // If applying franchise tag, check if player has been franchise tagged before on this roster
        if (isApplyingFranchiseTag && !isNewRoster) {
          const currentContract = existingContracts.find(
            c => c.playerId === contract.playerId && c.rosterId === contract.rosterId
          );
          if (currentContract && (currentContract as any).hasBeenFranchiseTagged === 1) {
            return res.status(400).json({ 
              error: `Player has already been franchise tagged on this team. Must be extended or go to free agency first.`,
              playerId: contract.playerId
            });
          }
        }
        
        // Determine tracking flag values
        let hasBeenExtended: number | undefined;
        let hasBeenFranchiseTagged: number | undefined;
        
        if (isNewRoster) {
          // Player moved teams - reset both flags
          hasBeenExtended = 0;
          hasBeenFranchiseTagged = 0;
        } else {
          // Same roster - preserve existing values unless explicitly setting
          const currentContract = existingContracts.find(
            c => c.playerId === contract.playerId && c.rosterId === contract.rosterId
          );
          if (isApplyingFranchiseTag) {
            // Setting franchise tag - mark as tagged
            hasBeenFranchiseTagged = 1;
            hasBeenExtended = (currentContract as any)?.hasBeenExtended ?? 0;
          } else {
            // Not setting franchise tag - preserve existing values
            hasBeenExtended = (currentContract as any)?.hasBeenExtended ?? 0;
            hasBeenFranchiseTagged = (currentContract as any)?.hasBeenFranchiseTagged ?? 0;
          }
        }
        
        const salariesPayload = typeof contract.salaries === "string"
          ? contract.salaries
          : JSON.stringify(contract.salaries || {});

        const result = await storage.upsertPlayerContract({
          leagueId,
          rosterId: contract.rosterId,
          playerId: contract.playerId,
          salaries: salariesPayload,
          fifthYearOption: contract.fifthYearOption || null,
          isOnIr: contract.isOnIr || 0,
          franchiseTagUsed: contract.franchiseTagUsed,
          franchiseTagYear: contract.franchiseTagYear,
          originalContractYears: contract.originalContractYears,
          isRookieContract: contract.isRookieContract || 0,
          extensionApplied: contract.extensionApplied,
          extensionYear: contract.extensionYear,
          extensionSalary: contract.extensionSalary,
          hasBeenExtended,
          hasBeenFranchiseTagged,
        } as any);
        results.push(result);
      }
      
      res.json({ saved: results.length, contracts: results });
    } catch (error) {
      console.error("Error saving contracts:", error);
      res.status(500).json({ error: "Failed to save contracts", message: dbErrorMessage(error) });
    }
  });

  // Delete a player contract
  app.delete("/api/league/:leagueId/contracts/:rosterId/:playerId", async (req, res) => {
    try {
      const { leagueId, rosterId, playerId } = req.params;
      await storage.deletePlayerContract(leagueId, parseInt(rosterId), playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contract:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  });

  // ==================== TEAM EXTENSIONS ====================
  // Get all team extensions for a season
  app.get("/api/league/:leagueId/extensions/:season", async (req, res) => {
    try {
      const { leagueId, season } = req.params;
      const extensions = await storage.getTeamExtensions(leagueId, parseInt(season));
      res.json(extensions);
    } catch (error) {
      console.error("Error fetching extensions:", error);
      res.status(500).json({ error: "Failed to fetch extensions" });
    }
  });

  // Check if team has used their extensions for a season (returns usage by type)
  app.get("/api/league/:leagueId/extensions/:season/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, rosterId } = req.params;
      const allExtensions = await storage.getTeamExtensions(leagueId, parseInt(season));
      const teamExtensions = allExtensions.filter(e => e.rosterId === parseInt(rosterId));
      
      // Separate rookie and non-rookie extensions
      const rookieExtensions = teamExtensions.filter(e => e.isRookieExtension === 1);
      const nonRookieExtensions = teamExtensions.filter(e => e.isRookieExtension !== 1);
      
      // Non-rookie: check which extension types have been used (legacy per-type flags)
      const hasUsed1Year = nonRookieExtensions.some(e => e.extensionType === 1);
      const hasUsed2Year = nonRookieExtensions.some(e => e.extensionType === 2);
      const hasUsed3Year = nonRookieExtensions.some(e => e.extensionType === 3);
      const hasUsed4Year = nonRookieExtensions.some(e => e.extensionType === 4);
      const hasUsedNonRookieExtension = nonRookieExtensions.length > 0;
      const nonRookieExtensionCount = nonRookieExtensions.length;
      
      // Rookie: count total and check for 4-year usage
      const rookieExtensionCount = rookieExtensions.length;
      const rookieHas4Year = rookieExtensions.some(e => e.extensionType === 4);
      
      res.json({ 
        hasUsedExtension: teamExtensions.length > 0,
        hasUsed1Year,
        hasUsed2Year,
        hasUsed3Year,
        hasUsed4Year,
        hasUsedNonRookieExtension,
        nonRookieExtensionCount,
        rookieExtensionCount,
        rookieHas4Year,
        extensions: teamExtensions
      });
    } catch (error) {
      console.error("Error checking extension status:", error);
      res.status(500).json({ error: "Failed to check extension status" });
    }
  });

  // ==================== ROOKIE EXTENSION SALARY CALCULATION ====================
  // Calculate the PPG-based extension salary for a rookie contract player
  app.post("/api/league/:leagueId/rookie-extension-salary", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { playerId, rosterId } = req.body;

      if (!playerId || !rosterId) {
        return res.status(400).json({ error: "playerId and rosterId are required" });
      }

      // Validate player contract is a rookie contract in its final year
      const allContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = allContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      if (!playerContract) {
        return res.status(404).json({ error: "Player contract not found" });
      }
      if (playerContract.isRookieContract !== 1) {
        return res.status(400).json({ error: "Player does not have a rookie contract" });
      }

      const [players, nflState, league] = await Promise.all([
        getAllPlayers(),
        getNFLState(),
        getLeague(leagueId),
      ]);

      const player = players[playerId];
      if (!player) {
        return res.status(404).json({ error: "Player not found in Sleeper data" });
      }
      const position = player.position;
      if (!position) {
        return res.status(400).json({ error: "Player has no position data" });
      }

      const currentSeason = league?.season || nflState.season || new Date().getFullYear().toString();
      const currentSeasonNum = parseInt(currentSeason);
      const previousSeason = String(currentSeasonNum - 1);

      // Check the player is in the final year of their contract
      const contractSalaries: Record<string, number> = (() => {
        try {
          return typeof (playerContract as any).salaries === "string"
            ? JSON.parse((playerContract as any).salaries || "{}")
            : (playerContract as any).salaries || {};
        } catch { return {}; }
      })();
      const salaryEntries = Object.entries(contractSalaries)
        .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
        .filter(e => !isNaN(e.year) && e.value > 0)
        .sort((a, b) => a.year - b.year);
      const lastPaidYear = salaryEntries.length > 0 ? salaryEntries[salaryEntries.length - 1].year : 0;
      if (lastPaidYear !== currentSeasonNum) {
        return res.status(400).json({ error: "Player is not in the final year of their contract" });
      }

      // ── Compute adjusted PPG for the rookie using shared helpers ──
      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);

      const rookiePPGResult = computeAdjustedPPGForPlayer(playerId, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
      if (!rookiePPGResult) {
        return res.status(400).json({ error: "Player has no games played — cannot calculate PPG" });
      }

      const { adjustedPPG, gamesUsed: rookieGamesUsed, recent15PPG, previous15PPG, formulaUsed } = rookiePPGResult;

      // ── Gather all same-position active players across league rosters ──
      const rosters = await getLeagueRosters(leagueId);
      const positionPlayerIds = new Set<string>();
      for (const roster of rosters) {
        for (const pid of roster.players || []) {
          const p = players[pid];
          if (p && p.position === position) {
            positionPlayerIds.add(pid);
          }
        }
      }

      // Build adjusted PPG for each position player using shared helpers
      const playerPPGMap = new Map<string, { ppg: number; gamesPlayed: number }>();
      for (const pid of Array.from(positionPlayerIds)) {
        const ppgResult = computeAdjustedPPGForPlayer(pid, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
        if (ppgResult) {
          playerPPGMap.set(pid, { ppg: ppgResult.adjustedPPG, gamesPlayed: ppgResult.gamesUsed });
        }
      }

      // Sort all players by PPG descending
      const rankedPlayers = Array.from(playerPPGMap.entries())
        .map(([pid, data]) => {
          const p = players[pid];
          const contract = allContracts.find(c => c.playerId === pid);
          const salaries: Record<string, number> = (() => {
            try {
              return typeof (contract as any)?.salaries === "string"
                ? JSON.parse((contract as any).salaries || "{}")
                : (contract as any)?.salaries || {};
            } catch { return {}; }
          })();
          const currentYearSalary = Number(salaries[currentSeason]) || 0;
          return {
            playerId: pid,
            name: p?.full_name || p?.first_name + " " + p?.last_name || pid,
            ppg: data.ppg,
            gamesPlayed: data.gamesPlayed,
            currentYearSalary,
          };
        })
        .sort((a, b) => b.ppg - a.ppg);

      // Find the rookie's rank
      const rookieIndex = rankedPlayers.findIndex(p => p.playerId === playerId);
      if (rookieIndex === -1) {
        return res.status(400).json({ error: "Could not rank player among position peers" });
      }

      const rank = rookieIndex + 1;
      const totalPlayers = rankedPlayers.length;

      // Find neighbors with a valid salary (skip those with 0 salary)
      let neighborAbove: { name: string; salary: number; ppg: number } | null = null;
      let neighborBelow: { name: string; salary: number; ppg: number } | null = null;

      // Look above (lower index = higher rank)
      for (let i = rookieIndex - 1; i >= 0; i--) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborAbove = {
            name: rankedPlayers[i].name,
            salary: rankedPlayers[i].currentYearSalary,
            ppg: rankedPlayers[i].ppg,
          };
          break;
        }
      }

      // Look below (higher index = lower rank)
      for (let i = rookieIndex + 1; i < rankedPlayers.length; i++) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborBelow = {
            name: rankedPlayers[i].name,
            salary: rankedPlayers[i].currentYearSalary,
            ppg: rankedPlayers[i].ppg,
          };
          break;
        }
      }

      // Determine extension salary
      let extensionSalary: number;
      if (neighborAbove && neighborBelow) {
        extensionSalary = Math.round((neighborAbove.salary + neighborBelow.salary) / 2);
      } else if (neighborAbove) {
        // Rookie is ranked last among salaried players — use highest salary at position
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        extensionSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : 50; // fallback $5M
      } else if (neighborBelow) {
        // Rookie is ranked first — use highest salary at position
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        extensionSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : 50;
      } else {
        // No salaried neighbors at all — minimum
        extensionSalary = 50; // $5M fallback
      }

      // Ensure minimum salary of $5M (50 tenths)
      extensionSalary = Math.max(extensionSalary, 50);

      console.log(`[Rookie Extension] ${player.full_name || playerId} (${position}): adjustedPPG=${adjustedPPG.toFixed(1)}, rank=${rank}/${totalPlayers}, salary=${extensionSalary/10}M`);

      res.json({
        adjustedPPG: Math.round(adjustedPPG * 10) / 10,
        gamesUsed: rookieGamesUsed,
        recent15PPG: Math.round(recent15PPG * 10) / 10,
        previous15PPG: Math.round(previous15PPG * 10) / 10,
        formulaUsed,
        rank,
        totalPlayersAtPosition: totalPlayers,
        position,
        neighborAbove,
        neighborBelow,
        extensionSalary,
        extensionSalaryMillions: extensionSalary / 10,
      });
    } catch (error: any) {
      console.error("Error calculating rookie extension salary:", error);
      res.status(500).json({ error: "Failed to calculate rookie extension salary", message: error?.message || String(error) });
    }
  });

  // Calculate the PPG-based extension salary for a non-rookie contract player
  app.post("/api/league/:leagueId/non-rookie-extension-salary", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { playerId, rosterId } = req.body;

      if (!playerId || !rosterId) {
        return res.status(400).json({ error: "playerId and rosterId are required" });
      }

      const allContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = allContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      if (!playerContract) {
        return res.status(404).json({ error: "Player contract not found" });
      }

      const [players, nflState, league] = await Promise.all([
        getAllPlayers(),
        getNFLState(),
        getLeague(leagueId),
      ]);

      const player = players[playerId];
      if (!player) {
        return res.status(404).json({ error: "Player not found in Sleeper data" });
      }
      const position = player.position;
      if (!position) {
        return res.status(400).json({ error: "Player has no position data" });
      }

      const currentSeason = league?.season || nflState.season || new Date().getFullYear().toString();
      const currentSeasonNum = parseInt(currentSeason);
      const previousSeason = String(currentSeasonNum - 1);

      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);

      const ppgResult = computeAdjustedPPGForPlayer(playerId, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
      if (!ppgResult) {
        return res.status(400).json({ error: "Player has no games played — cannot calculate PPG" });
      }

      const { adjustedPPG, gamesUsed, recent15PPG, previous15PPG, formulaUsed } = ppgResult;

      const rosters = await getLeagueRosters(leagueId);
      const positionPlayerIds = new Set<string>();
      for (const roster of rosters) {
        for (const pid of roster.players || []) {
          const p = players[pid];
          if (p && p.position === position) {
            positionPlayerIds.add(pid);
          }
        }
      }

      const playerPPGMap = new Map<string, { ppg: number; gamesPlayed: number }>();
      for (const pid of Array.from(positionPlayerIds)) {
        const pidResult = computeAdjustedPPGForPlayer(pid, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
        if (pidResult) {
          playerPPGMap.set(pid, { ppg: pidResult.adjustedPPG, gamesPlayed: pidResult.gamesUsed });
        }
      }

      const rankedPlayers = Array.from(playerPPGMap.entries())
        .map(([pid, data]) => {
          const p = players[pid];
          const contract = allContracts.find(c => c.playerId === pid);
          const salaries: Record<string, number> = (() => {
            try {
              return typeof (contract as any)?.salaries === "string"
                ? JSON.parse((contract as any).salaries || "{}")
                : (contract as any)?.salaries || {};
            } catch { return {}; }
          })();
          const currentYearSalary = Number(salaries[currentSeason]) || 0;
          return {
            playerId: pid,
            name: p?.full_name || p?.first_name + " " + p?.last_name || pid,
            ppg: data.ppg,
            gamesPlayed: data.gamesPlayed,
            currentYearSalary,
          };
        })
        .sort((a, b) => b.ppg - a.ppg);

      const playerIndex = rankedPlayers.findIndex(p => p.playerId === playerId);
      if (playerIndex === -1) {
        return res.status(400).json({ error: "Could not rank player among position peers" });
      }

      const rank = playerIndex + 1;
      const totalPlayers = rankedPlayers.length;

      let neighborAbove: { name: string; salary: number; ppg: number } | null = null;
      let neighborBelow: { name: string; salary: number; ppg: number } | null = null;

      for (let i = playerIndex - 1; i >= 0; i--) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborAbove = { name: rankedPlayers[i].name, salary: rankedPlayers[i].currentYearSalary, ppg: rankedPlayers[i].ppg };
          break;
        }
      }

      for (let i = playerIndex + 1; i < rankedPlayers.length; i++) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborBelow = { name: rankedPlayers[i].name, salary: rankedPlayers[i].currentYearSalary, ppg: rankedPlayers[i].ppg };
          break;
        }
      }

      let baseSalary: number;
      if (neighborAbove && neighborBelow) {
        baseSalary = Math.round((neighborAbove.salary + neighborBelow.salary) / 2);
      } else if (neighborAbove) {
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        baseSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : 50;
      } else if (neighborBelow) {
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        baseSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : 50;
      } else {
        baseSalary = 50;
      }

      baseSalary = Math.max(baseSalary, 50);

      const baseSalaryMillions = baseSalary / 10;
      const salary1Year = Math.ceil(baseSalaryMillions * 0.8) * 10;
      const salary2Year = Math.ceil(baseSalaryMillions * 0.9) * 10;
      const salary3Year = Math.ceil(baseSalaryMillions * 1.0) * 10;
      const salary4Year = Math.ceil(baseSalaryMillions * 1.1) * 10;

      console.log(`[Non-Rookie Extension] ${player.full_name || playerId} (${position}): adjustedPPG=${adjustedPPG.toFixed(1)}, rank=${rank}/${totalPlayers}, baseSalary=${baseSalary/10}M`);

      res.json({
        adjustedPPG: Math.round(adjustedPPG * 10) / 10,
        gamesUsed,
        recent15PPG: Math.round(recent15PPG * 10) / 10,
        previous15PPG: Math.round(previous15PPG * 10) / 10,
        formulaUsed,
        rank,
        totalPlayersAtPosition: totalPlayers,
        position,
        neighborAbove,
        neighborBelow,
        extensionSalary: baseSalary,
        extensionSalaryMillions: baseSalary / 10,
        salary1Year,
        salary1YearMillions: salary1Year / 10,
        salary2Year,
        salary2YearMillions: salary2Year / 10,
        salary3Year,
        salary3YearMillions: salary3Year / 10,
        salary4Year,
        salary4YearMillions: salary4Year / 10,
      });
    } catch (error: any) {
      console.error("Error calculating non-rookie extension salary:", error);
      res.status(500).json({ error: "Failed to calculate extension salary", message: error?.message || String(error) });
    }
  });

  // Apply an extension to a player
  // For non-rookie contracts, extensions use PPG-based pricing with 80/90/100/110% multipliers
  // For rookie contracts (isRookieContract = 1), extensions use PPG-based pricing calculated server-side
  app.post("/api/league/:leagueId/extensions", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, currentSalary, extensionType, extensionYear, isPPGBased, ppgSalary } = req.body;
      let { season } = req.body;
      
      if (!rosterId || !season || !playerId || !playerName || !extensionType || !extensionYear) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate and normalize season to a number
      season = parseInt(season);
      if (isNaN(season) || season < 2020 || season > 2100) {
        return res.status(400).json({ error: "Invalid season year" });
      }

      // Validate extension type (1 = 1-year, 2 = 2-year, 3 = 3-year, 4 = 4-year)
      if (![1, 2, 3, 4].includes(extensionType)) {
        return res.status(400).json({ error: "Extension type must be 1 (1-year), 2 (2-year), 3 (3-year), or 4 (4-year)" });
      }

      // Validate player contract exists and check if it's a rookie contract
      const playerContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = playerContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      
      if (!playerContract) {
        return res.status(400).json({ error: "Player contract not found" });
      }

      // Check if extension already applied (confirmed)
      if (playerContract.extensionApplied === 1) {
        return res.status(400).json({ error: "Extension already applied to this player" });
      }

      // Check if there's already a pending extension for this player
      const allExtensionsForSeason = await storage.getTeamExtensions(leagueId, season);
      const existingPendingForPlayer = allExtensionsForSeason.find(
        e => e.playerId === playerId && e.rosterId === rosterId && e.status === "pending"
      );
      if (existingPendingForPlayer) {
        return res.status(400).json({ error: "This player already has a pending extension. Confirm or cancel it first." });
      }

      // Check if player has been extended before on this roster
      if ((playerContract as any).hasBeenExtended === 1) {
        return res.status(400).json({ 
          error: "Player has already been extended on this team. Must go to free agency or be franchise tagged first." 
        });
      }

      const isRookieContract = playerContract.isRookieContract === 1;

      // Check extension limits (rookie and non-rookie have independent limits)
      // Reuse allExtensionsForSeason fetched earlier for the duplicate-pending check
      const teamExtensionsForRoster = allExtensionsForSeason.filter(e => e.rosterId === rosterId);

      if (isRookieContract) {
        // Rookie extensions: max 3 per season, max 1 can be 4-year
        const rookieExts = teamExtensionsForRoster.filter(e => e.isRookieExtension === 1);
        if (rookieExts.length >= 3) {
          return res.status(400).json({ 
            error: "Team has already used all 3 rookie extensions for this season" 
          });
        }
        if (extensionType === 4 && rookieExts.some(e => e.extensionType === 4)) {
          return res.status(400).json({ 
            error: "Team has already used their one 4-year rookie extension for this season" 
          });
        }
      } else {
        // Non-rookie extensions: max 2 per season
        const nonRookieExts = teamExtensionsForRoster.filter(e => e.isRookieExtension !== 1);
        if (nonRookieExts.length >= 2) {
          return res.status(400).json({ 
            error: "Team has already used both non-rookie extensions for this season",
            existingExtension: nonRookieExts[0]
          });
        }
      }

      // Rookie contracts: must be offseason and use PPG-based pricing
      if (isRookieContract) {
        // Validate offseason: rookie extensions only allowed after season ends
        const nflState = await getNFLState();
        const seasonType = nflState.season_type || (nflState as any).seasonType;
        if (seasonType !== "off" && seasonType !== "post") {
          return res.status(400).json({ error: "Rookie extensions are only available after the season has ended (offseason)" });
        }
        // Validate extension type: rookies can only do 3-year or 4-year
        if (extensionType !== 3 && extensionType !== 4) {
          return res.status(400).json({ error: "Rookie contracts can only be extended for 3 or 4 years" });
        }
      }

      // Calculate extension salaries based on type
      let extensionSalary1 = 0;
      let extensionSalary2: number | null = null;
      let extensionSalary3: number | null = null;
      let extensionSalary4: number | null = null;

      // Both rookie and non-rookie extensions use PPG-based pricing
      const salary = ppgSalary;
      if (!salary || salary <= 0) {
        return res.status(400).json({ error: "PPG-based salary is required for extensions. Calculate it first." });
      }

      if (isRookieContract) {
        // Rookie extensions: flat PPG salary for all years
        extensionSalary1 = salary;
        if (extensionType >= 2) extensionSalary2 = salary;
        if (extensionType >= 3) extensionSalary3 = salary;
        if (extensionType >= 4) extensionSalary4 = salary;
      } else {
        // Non-rookie extensions: PPG-based with percentage multipliers
        // 1-yr = 80%, 2-yr = 90%, 3-yr = 100%, 4-yr = 110%
        const baseSalaryMillions = salary / 10;
        const percentages: Record<number, number> = { 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.1 };
        const salaryPerYear = Math.ceil(baseSalaryMillions * percentages[extensionType]) * 10;
        extensionSalary1 = salaryPerYear;
        if (extensionType >= 2) extensionSalary2 = salaryPerYear;
        if (extensionType >= 3) extensionSalary3 = salaryPerYear;
        if (extensionType >= 4) extensionSalary4 = salaryPerYear;
      }

      // Validate extension year(s) are within supported range (current season to season+4)
      // Contract years are: season, season+1, season+2, season+3, with year 5 (season+4) for extensions
      const maxContractYear = season + 4; // Option year / max extension year
      const maxExtensionYear = extensionType === 1 ? extensionYear : (extensionType === 2 ? extensionYear + 1 : (extensionType === 3 ? extensionYear + 2 : extensionYear + 3));
      if (extensionYear < season || maxExtensionYear > maxContractYear) {
        return res.status(400).json({ 
          error: `Extension would exceed maximum contract year (${maxContractYear})` 
        });
      }

      // Validate extension target years are currently empty (no salary)
      const existingSalaries = (() => {
        try {
          if (typeof (playerContract as any).salaries === "string") {
            return JSON.parse((playerContract as any).salaries || "{}");
          }
          return (playerContract as any).salaries || {};
        } catch {
          return {};
        }
      })();

      const getSalaryForYear = (year: number): number => {
        const val = (existingSalaries as Record<string, number>)[String(year)];
        return typeof val === "number" ? val : 0;
      };

      // Check that all extension year(s) don't have existing salary
      const extensionYears = [extensionYear];
      if (extensionType >= 2) extensionYears.push(extensionYear + 1);
      if (extensionType >= 3) extensionYears.push(extensionYear + 2);
      if (extensionType >= 4) extensionYears.push(extensionYear + 3);

      for (const year of extensionYears) {
        if (getSalaryForYear(year) > 0) {
          console.error(`Extension blocked: Player ${playerId} already has salary in ${year}`);
          return res.status(400).json({ 
            error: `Cannot extend - player already has salary for ${year}` 
          });
        }
      }

      // Create the extension record as pending (contract is NOT modified yet)
      const extension = await storage.createTeamExtension({
        leagueId,
        rosterId,
        season,
        playerId,
        playerName,
        extensionSalary: extensionSalary1,
        extensionYear,
        extensionType,
        extensionSalary2: extensionType >= 2 ? extensionSalary2 : null,
        isRookieExtension: isRookieContract ? 1 : 0,
      });

      // Store computed salaries in the response so the client can preview them
      res.json({ 
        success: true, 
        extension,
        previewSalaries: {
          salary1: extensionSalary1,
          salary2: extensionSalary2,
          salary3: extensionSalary3,
          salary4: extensionSalary4,
        }
      });
    } catch (error) {
      console.error("Error creating pending extension:", error);
      res.status(500).json({ error: "Failed to create pending extension" });
    }
  });

  // Confirm a pending extension (applies salary changes to the contract)
  app.put("/api/league/:leagueId/extensions/:extensionId/confirm", async (req, res) => {
    try {
      const { leagueId, extensionId } = req.params;
      const { rosterId } = req.body;

      if (!rosterId) {
        return res.status(400).json({ error: "Missing rosterId" });
      }

      // Look up the extension
      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      // Verify it belongs to this league and roster
      if (extension.leagueId !== leagueId || extension.rosterId !== rosterId) {
        return res.status(403).json({ error: "Extension does not belong to this team" });
      }

      // Verify it's pending
      if (extension.status !== "pending") {
        return res.status(400).json({ error: "Extension is already confirmed" });
      }

      // Re-fetch the player contract to apply salary changes
      const playerContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = playerContracts.find(c => c.playerId === extension.playerId && c.rosterId === rosterId);

      if (!playerContract) {
        return res.status(400).json({ error: "Player contract not found" });
      }

      // Parse existing salaries
      const existingSalaries = (() => {
        try {
          if (typeof (playerContract as any).salaries === "string") {
            return JSON.parse((playerContract as any).salaries || "{}");
          }
          return (playerContract as any).salaries || {};
        } catch {
          return {};
        }
      })();

      // Recalculate extension salaries from the stored extension record
      const extensionSalary1 = extension.extensionSalary;
      const extensionSalary2 = extension.extensionSalary2;
      // For 3-year and 4-year, salary per year equals extensionSalary (same rate each year)
      const extensionSalary3 = extension.extensionType >= 3 ? extensionSalary1 : null;
      const extensionSalary4 = extension.extensionType >= 4 ? extensionSalary1 : null;

      // Update the player's contract with extension info
      const updatedSalaries: Record<string, number> = { ...existingSalaries };
      const salaryUpdates: any = {
        leagueId,
        rosterId,
        playerId: extension.playerId,
        salaries: JSON.stringify(updatedSalaries),
        fifthYearOption: playerContract.fifthYearOption,
        franchiseTagUsed: playerContract.franchiseTagUsed,
        franchiseTagYear: playerContract.franchiseTagYear,
        originalContractYears: playerContract.originalContractYears,
        extensionApplied: 1,
        extensionYear: extension.extensionYear,
        extensionSalary: extensionSalary1,
        extensionType: extension.extensionType,
        hasBeenExtended: 1,
        hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0,
      };

      // Set the extension year salary(s) for all extension years
      const setYearSalary = (year: number, salary: number) => {
        updatedSalaries[String(year)] = salary;
        salaryUpdates.salaries = JSON.stringify(updatedSalaries);
      };

      setYearSalary(extension.extensionYear, extensionSalary1);
      if (extension.extensionType >= 2 && extensionSalary2 !== null) {
        setYearSalary(extension.extensionYear + 1, extensionSalary2);
      }
      if (extension.extensionType >= 3 && extensionSalary3 !== null) {
        setYearSalary(extension.extensionYear + 2, extensionSalary3);
      }
      if (extension.extensionType >= 4 && extensionSalary4 !== null) {
        setYearSalary(extension.extensionYear + 3, extensionSalary4);
      }

      await storage.upsertPlayerContract(salaryUpdates);

      // Update extension status to confirmed
      const updatedExtension = await storage.updateTeamExtensionStatus(extensionId, "confirmed");

      res.json({ success: true, extension: updatedExtension });
    } catch (error) {
      console.error("Error confirming extension:", error);
      res.status(500).json({ error: "Failed to confirm extension" });
    }
  });

  // Cancel a pending extension (user can cancel their own; no contract revert needed)
  app.delete("/api/league/:leagueId/extensions/pending/:extensionId", async (req, res) => {
    try {
      const { leagueId, extensionId } = req.params;
      const rosterId = parseInt(req.query.rosterId as string);

      if (isNaN(rosterId)) {
        return res.status(400).json({ error: "Missing or invalid rosterId" });
      }

      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      if (extension.leagueId !== leagueId || extension.rosterId !== rosterId) {
        return res.status(403).json({ error: "Extension does not belong to this team" });
      }

      if (extension.status !== "pending") {
        return res.status(400).json({ error: "Only pending extensions can be cancelled by the user. Contact a commissioner to remove confirmed extensions." });
      }

      // Delete the pending extension (no contract revert needed since contract was never modified)
      await storage.deleteTeamExtensionById(extensionId);

      res.json({ success: true, message: "Pending extension cancelled" });
    } catch (error) {
      console.error("Error cancelling pending extension:", error);
      res.status(500).json({ error: "Failed to cancel pending extension" });
    }
  });

  // Undo a specific confirmed extension by ID (commissioner only)
  app.delete("/api/league/:leagueId/extensions/:extensionId/undo", async (req, res) => {
    try {
      const { leagueId, extensionId } = req.params;

      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }
      if (extension.leagueId !== leagueId) {
        return res.status(403).json({ error: "Extension does not belong to this league" });
      }
      if (extension.status !== "confirmed") {
        return res.status(400).json({ error: "Only confirmed extensions can be undone. Use the cancel route for pending extensions." });
      }

      const contracts = await storage.getPlayerContracts(leagueId);
      const playerContract = contracts.find(c => c.playerId === extension.playerId && c.rosterId === extension.rosterId);

      if (playerContract) {
        const existingSalaries = (() => {
          try {
            if (typeof (playerContract as any).salaries === "string") {
              return JSON.parse((playerContract as any).salaries || "{}");
            }
            return (playerContract as any).salaries || {};
          } catch {
            return {};
          }
        })();

        const updatedSalaries: Record<string, number> = { ...existingSalaries };
        const clearYearSalary = (year: number) => {
          updatedSalaries[String(year)] = 0;
        };

        for (let i = 0; i < extension.extensionType; i++) {
          clearYearSalary(extension.extensionYear + i);
        }

        await storage.upsertPlayerContract({
          leagueId,
          rosterId: extension.rosterId,
          playerId: extension.playerId,
          salaries: JSON.stringify(updatedSalaries),
          fifthYearOption: playerContract.fifthYearOption,
          franchiseTagUsed: playerContract.franchiseTagUsed,
          franchiseTagYear: playerContract.franchiseTagYear,
          originalContractYears: playerContract.originalContractYears,
          extensionApplied: 0,
          extensionYear: null,
          extensionSalary: null,
          extensionType: null,
          hasBeenExtended: (playerContract as any).hasBeenExtended ?? 0,
          hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0,
        });
      }

      await storage.deleteTeamExtensionById(extensionId);

      res.json({ success: true, message: "Extension undone successfully" });
    } catch (error) {
      console.error("Error undoing extension:", error);
      res.status(500).json({ error: "Failed to undo extension" });
    }
  });

  // Delete a team extension (commissioner only - allows team to use extension again)
  app.delete("/api/league/:leagueId/extensions/:season/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, rosterId } = req.params;
      const seasonNum = parseInt(season);
      const rosterIdNum = parseInt(rosterId);

      if (isNaN(seasonNum) || isNaN(rosterIdNum)) {
        return res.status(400).json({ error: "Invalid season or roster ID" });
      }

      // Get the extension record to find which player it was applied to
      const extension = await storage.getTeamExtensionByRoster(leagueId, rosterIdNum, seasonNum);
      
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      // Get the player contract to revert it
      const contracts = await storage.getPlayerContracts(leagueId);
      const playerContract = contracts.find(c => c.playerId === extension.playerId && c.rosterId === rosterIdNum);
      
      if (playerContract) {
        // Revert the contract: clear extension year salary(s) and reset flags
        const existingSalaries = (() => {
          try {
            if (typeof (playerContract as any).salaries === "string") {
              return JSON.parse((playerContract as any).salaries || "{}");
            }
            return (playerContract as any).salaries || {};
          } catch {
            return {};
          }
        })();

        const updatedSalaries: Record<string, number> = { ...existingSalaries };
        const salaryUpdates: any = {
          leagueId,
          rosterId: rosterIdNum,
          playerId: extension.playerId,
          salaries: JSON.stringify(updatedSalaries),
          fifthYearOption: playerContract.fifthYearOption,
          franchiseTagUsed: playerContract.franchiseTagUsed,
          franchiseTagYear: playerContract.franchiseTagYear,
          originalContractYears: playerContract.originalContractYears,
          extensionApplied: 0,
          extensionYear: null,
          extensionSalary: null,
          extensionType: null,
          hasBeenExtended: (playerContract as any).hasBeenExtended ?? 0, // Preserve - player has still been extended before
          hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0, // Preserve existing value
        };

        // Clear the extension year salary(s)
        const clearYearSalary = (year: number) => {
          updatedSalaries[String(year)] = 0;
          salaryUpdates.salaries = JSON.stringify(updatedSalaries);
        };

        for (let i = 0; i < extension.extensionType; i++) {
          clearYearSalary(extension.extensionYear + i);
        }

        await storage.upsertPlayerContract(salaryUpdates);
      }

      // Delete the extension record
      await storage.deleteTeamExtension(leagueId, rosterIdNum, seasonNum);

      res.json({ success: true, message: "Extension removed - team can use extension again" });
    } catch (error) {
      console.error("Error deleting extension:", error);
      res.status(500).json({ error: "Failed to delete extension" });
    }
  });

  // ==================== PLAYER BIDS ====================
  
  // Get all bids (for showing results when bidding is closed)
  // NOTE: This route MUST be defined before /bids/:rosterId to prevent "all" being matched as a rosterId
  // This endpoint accesses the same playerBidsTable where bids are stored when created
  app.get("/api/league/:leagueId/bids/all", async (req, res) => {
    try {
      const { leagueId } = req.params;
      console.log(`[Get All Bids] Request received for league ${leagueId}`);
      console.log(`[Get All Bids] Accessing playerBidsTable (same table used by createPlayerBid)`);
      
      const league = await getLeague(leagueId);
      if (!league) {
        console.log(`[Get All Bids] League ${leagueId} not found`);
        return res.status(404).json({ error: "League not found" });
      }
      
      // Use getAllPlayerBids which queries from the same playerBidsTable as createPlayerBid
      const bids = await storage.getAllPlayerBids(leagueId);
      
      console.log(`[Get All Bids] Found ${bids.length} total bids from playerBidsTable for league ${leagueId}`);
      
      // Log sample bid structure for debugging
      if (bids.length > 0) {
        console.log(`[Get All Bids] Sample bid structure:`, {
          id: bids[0].id,
          playerId: bids[0].playerId,
          playerName: bids[0].playerName,
          status: bids[0].status,
          bidAmount: bids[0].bidAmount,
          contractYears: bids[0].contractYears,
          rosterId: bids[0].rosterId,
        });
      }
      
      // Filter to only active bids (in case there are cancelled/inactive bids)
      const activeBids = bids.filter(bid => bid.status === "active" || !bid.status);
      
      console.log(`[Get All Bids] Found ${activeBids.length} active bids (filtered from ${bids.length} total)`);
      
      // Log status breakdown for debugging
      const statusCounts: Record<string, number> = {};
      bids.forEach(bid => {
        const status = bid.status || "null";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      console.log(`[Get All Bids] Status breakdown:`, statusCounts);
      
      // Group by player and sort by total value
      const bidsByPlayer: Record<string, PlayerBid[]> = {};
      activeBids.forEach(bid => {
        if (!bidsByPlayer[bid.playerId]) {
          bidsByPlayer[bid.playerId] = [];
        }
        bidsByPlayer[bid.playerId].push(bid);
      });
      
      console.log(`[Get All Bids] Grouped into ${Object.keys(bidsByPlayer).length} players`);

      // Sort each player's bids by total value, with tiebreaker by per-year value
      Object.keys(bidsByPlayer).forEach(playerId => {
        bidsByPlayer[playerId].sort((a, b) => {
          const totalA = a.bidAmount * a.contractYears;
          const totalB = b.bidAmount * b.contractYears;
          // Primary sort: total value (descending)
          if (totalA !== totalB) {
            return totalB - totalA;
          }
          // Tiebreaker: per-year value (descending) - higher per-year wins
          return b.bidAmount - a.bidAmount;
        });
      });

      console.log(`[Get All Bids] Returning ${Object.keys(bidsByPlayer).length} players with bids from playerBidsTable`);
      res.json(bidsByPlayer);
    } catch (error) {
      console.error("[Get All Bids] Error fetching all bids:", error);
      res.status(500).json({ error: "Failed to fetch all bids" });
    }
  });

  // Get player bids for a specific team (privacy: only returns bids for the requesting team)
  app.get("/api/league/:leagueId/bids/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const bids = await storage.getPlayerBidsByRoster(leagueId, parseInt(rosterId));
      res.json(bids);
    } catch (error) {
      console.error("Error fetching bids:", error);
      res.status(500).json({ error: "Failed to fetch bids" });
    }
  });

  // Create a new player bid
  app.post("/api/league/:leagueId/bids", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, playerPosition, playerTeam, bidAmount, maxBid, contractYears, isRookieContract, notes } = req.body;
      
      if (!rosterId || !playerId || !playerName || !bidAmount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const bid = await storage.createPlayerBid({
        leagueId,
        rosterId,
        playerId,
        playerName,
        playerPosition: playerPosition || "N/A",
        playerTeam: playerTeam || null,
        bidAmount,
        maxBid: maxBid || null,
        contractYears: contractYears || 1,
        isRookieContract: isRookieContract || 0,
        notes: notes || null,
      } as any);

      res.json(bid);
    } catch (error) {
      console.error("Error creating bid:", error);
      res.status(500).json({ error: "Failed to create bid" });
    }
  });

  // Update a player bid (privacy: only allows updating if rosterId matches)
  app.patch("/api/league/:leagueId/bids/:bidId", async (req, res) => {
    try {
      const { bidId } = req.params;
      const { rosterId, ...updates } = req.body;
      
      if (!rosterId) {
        return res.status(400).json({ error: "Roster ID required" });
      }

      const bid = await storage.updatePlayerBid(bidId, rosterId, updates);
      
      if (!bid) {
        return res.status(404).json({ error: "Bid not found or unauthorized" });
      }

      res.json(bid);
    } catch (error) {
      console.error("Error updating bid:", error);
      res.status(500).json({ error: "Failed to update bid" });
    }
  });

  // Delete a player bid (privacy: only allows deleting if rosterId matches)
  app.delete("/api/league/:leagueId/bids/:bidId/:rosterId", async (req, res) => {
    try {
      const { bidId, rosterId } = req.params;
      await storage.deletePlayerBid(bidId, parseInt(rosterId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bid:", error);
      res.status(500).json({ error: "Failed to delete bid" });
    }
  });

  // Get bidding status
  app.get("/api/league/:leagueId/bidding-status", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const status = await storage.getLeagueSetting(leagueId, "player_bidding_open");
      // Default to "true" (open) if not set
      const isOpen = status !== "false";
      res.json({ isOpen });
    } catch (error) {
      console.error("Error fetching bidding status:", error);
      res.status(500).json({ error: "Failed to fetch bidding status" });
    }
  });

  // Update bidding status (commissioner only)
  app.post("/api/league/:leagueId/bidding-status", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { isOpen } = req.body;
      const league = await getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      // TODO: Add commissioner check here
      // For now, allow access - can add auth check later if needed

      await storage.setLeagueSetting(leagueId, "player_bidding_open", isOpen ? "true" : "false");
      res.json({ isOpen });
    } catch (error) {
      console.error("Error updating bidding status:", error);
      res.status(500).json({ error: "Failed to update bidding status" });
    }
  });

  // Get favorite expiring players for a team
  app.get("/api/league/:leagueId/favorites/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const favorites = await storage.getFavoriteExpiringPlayers(leagueId, parseInt(rosterId));
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorite expiring players:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  // Add a favorite expiring player
  app.post("/api/league/:leagueId/favorites", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId } = req.body;

      if (!rosterId || !playerId) {
        return res.status(400).json({ error: "Missing required fields: rosterId, playerId" });
      }

      const favorite = await storage.addFavoriteExpiringPlayer({
        leagueId,
        rosterId,
        playerId,
      });
      res.json(favorite);
    } catch (error) {
      console.error("Error adding favorite expiring player:", error);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  // Remove a favorite expiring player
  app.delete("/api/league/:leagueId/favorites/:playerId/:rosterId", async (req, res) => {
    try {
      const { leagueId, playerId, rosterId } = req.params;
      await storage.removeFavoriteExpiringPlayer(leagueId, parseInt(rosterId), playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing favorite expiring player:", error);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  });

  app.get("/api/leagues/:leagueId/dead-cap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const entries = await storage.getDeadCapEntriesByLeague(leagueId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching dead cap entries:", error);
      res.status(500).json({ error: "Failed to fetch dead cap entries", message: dbErrorMessage(error) });
    }
  });

  app.post("/api/leagues/:leagueId/dead-cap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const data = req.body;
      
      const entry = await storage.createDeadCapEntry({
        leagueId,
        rosterId: data.rosterId,
        playerId: data.playerId,
        playerName: data.playerName,
        playerPosition: data.playerPosition,
        reason: data.reason,
        deadCapSalaries: data.deadCapSalaries || "{}",
      });
      
      res.json(entry);
    } catch (error) {
      console.error("Error creating dead cap entry:", error);
      res.status(500).json({ error: "Failed to create dead cap entry" });
    }
  });

  app.delete("/api/leagues/:leagueId/dead-cap/:entryId", async (req, res) => {
    try {
      const { entryId } = req.params;
      await storage.deleteDeadCapEntry(entryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting dead cap entry:", error);
      res.status(500).json({ error: "Failed to delete dead cap entry" });
    }
  });

  app.post("/api/leagues/:leagueId/process-cut-trade", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, playerPosition, reason, contract } = req.body;
      
      const deadCapPercentages = [0.5, 0.25, 0.1, 0];
      const contractSalaries: Record<string, number> = contract?.salaries || {};
      const years = Object.keys(contractSalaries)
        .map(Number)
        .filter(year => !isNaN(year))
        .sort((a, b) => a - b);

      const deadCapAmounts: Record<string, number> = {};

      years.forEach((year, index) => {
        const salary = Number(contractSalaries[String(year)] || 0);
        for (let i = index; i < Math.min(index + deadCapPercentages.length, years.length); i++) {
          const dcPercent = deadCapPercentages[i - index] || 0;
          const dcYear = years[i];
          deadCapAmounts[String(dcYear)] = (deadCapAmounts[String(dcYear)] || 0) + Math.ceil(salary * dcPercent);
        }
      });
      
      const entry = await storage.createDeadCapEntry({
        leagueId,
        rosterId,
        playerId,
        playerName,
        playerPosition,
        reason,
        deadCapSalaries: JSON.stringify(deadCapAmounts),
      });
      
      await storage.deletePlayerContract(leagueId, rosterId, playerId);
      
      res.json({ deadCapEntry: entry });
    } catch (error) {
      console.error("Error processing cut/trade:", error);
      res.status(500).json({ error: "Failed to process cut/trade" });
    }
  });

  // ==================== SAVED CONTRACT DRAFTS ====================
  // Get saved contract drafts for a team
  app.get("/api/league/:leagueId/contract-drafts/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const drafts = await storage.getSavedContractDrafts(leagueId, parseInt(rosterId));
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching contract drafts:", error);
      res.status(500).json({ error: "Failed to fetch contract drafts", message: dbErrorMessage(error) });
    }
  });

  // Save contract drafts (bulk upsert)
  app.post("/api/league/:leagueId/contract-drafts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, drafts } = req.body;
      
      if (!Array.isArray(drafts)) {
        return res.status(400).json({ error: "Drafts must be an array" });
      }

      // Clear existing drafts first
      await storage.deleteAllSavedContractDrafts(leagueId, rosterId);

      const results = [];
      for (const draft of drafts) {
        const salariesPayload = (() => {
          if (draft.salaries) {
            return typeof draft.salaries === "string" ? draft.salaries : JSON.stringify(draft.salaries);
          }
          const legacy: Record<string, number> = {};
          if (draft.salary2025) legacy["2025"] = draft.salary2025;
          if (draft.salary2026) legacy["2026"] = draft.salary2026;
          if (draft.salary2027) legacy["2027"] = draft.salary2027;
          if (draft.salary2028) legacy["2028"] = draft.salary2028;
          if (draft.salary2029) legacy["2029"] = draft.salary2029;
          return JSON.stringify(legacy);
        })();

        const result = await storage.upsertSavedContractDraft({
          leagueId,
          rosterId,
          playerId: draft.playerId,
          playerName: draft.playerName,
          playerPosition: draft.playerPosition,
          salaries: salariesPayload,
          franchiseTagApplied: draft.franchiseTagApplied || 0,
        });
        results.push(result);
      }
      
      res.json({ saved: results.length, drafts: results });
    } catch (error) {
      console.error("Error saving contract drafts:", error);
      res.status(500).json({ error: "Failed to save contract drafts", message: dbErrorMessage(error) });
    }
  });

  // Delete all saved contract drafts for a team
  app.delete("/api/league/:leagueId/contract-drafts/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      await storage.deleteAllSavedContractDrafts(leagueId, parseInt(rosterId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contract drafts:", error);
      res.status(500).json({ error: "Failed to delete contract drafts" });
    }
  });

  // ==================== CONTRACT APPROVAL REQUESTS ====================
  // Get all contract approval requests for a league (commissioner only)
  app.get("/api/league/:leagueId/contract-approvals", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const requests = await storage.getContractApprovalRequests(leagueId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching contract approval requests:", error);
      res.status(500).json({ error: "Failed to fetch contract approval requests" });
    }
  });

  // Check if team has pending approval request
  app.get("/api/league/:leagueId/contract-approvals/pending/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const request = await storage.getContractApprovalRequestByRoster(leagueId, parseInt(rosterId));
      res.json({ hasPending: !!request, request });
    } catch (error) {
      console.error("Error checking pending approval:", error);
      res.status(500).json({ error: "Failed to check pending approval" });
    }
  });

  // Submit contracts for approval
  app.post("/api/league/:leagueId/contract-approvals", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, teamName, ownerName, contracts } = req.body;
      
      if (!rosterId || !teamName || !contracts) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check for existing pending request
      const existing = await storage.getContractApprovalRequestByRoster(leagueId, rosterId);
      if (existing) {
        return res.status(400).json({ error: "You already have a pending approval request" });
      }

      const request = await storage.createContractApprovalRequest({
        leagueId,
        rosterId,
        teamName,
        ownerName,
        contractsJson: JSON.stringify(contracts),
      });

      res.json(request);
    } catch (error) {
      console.error("Error submitting for approval:", error);
      res.status(500).json({ error: "Failed to submit for approval", message: dbErrorMessage(error) });
    }
  });

  // Approve or reject a contract approval request (commissioner only)
  app.patch("/api/league/:leagueId/contract-approvals/:requestId", async (req, res) => {
    try {
      const { requestId } = req.params;
      const { status, reviewerNotes } = req.body;
      
      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      }

      const request = await storage.updateContractApprovalRequest(requestId, status, reviewerNotes);
      
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }

      // If approved, update the official contracts in the permanent database
      if (status === "approved") {
        const league = await getLeague(request.leagueId).catch(() => null);
        const leagueSeason = league?.season ? parseInt(league.season) : null;
        const contracts = JSON.parse(request.contractsJson);
        for (const contract of contracts) {
          const salariesPayload = (() => {
            if (contract.salaries) {
              return typeof contract.salaries === "string" ? contract.salaries : JSON.stringify(contract.salaries);
            }
            const legacy: Record<string, number> = {};
            if (contract.salary2025) legacy["2025"] = contract.salary2025;
            if (contract.salary2026) legacy["2026"] = contract.salary2026;
            if (contract.salary2027) legacy["2027"] = contract.salary2027;
            if (contract.salary2028) legacy["2028"] = contract.salary2028;
            if (contract.salary2029) legacy["2029"] = contract.salary2029;
            return JSON.stringify(legacy);
          })();

          let originalContractYears = 0;
          try {
            const salariesObj = JSON.parse(salariesPayload || "{}");
            originalContractYears = Object.values(salariesObj).filter((v: any) => Number(v) > 0).length;
          } catch {
            originalContractYears = 0;
          }
          
          await storage.upsertPlayerContract({
            leagueId: request.leagueId,
            rosterId: request.rosterId,
            playerId: contract.playerId,
            salaries: salariesPayload,
            fifthYearOption: contract.fifthYearOption || null,
            franchiseTagUsed: contract.franchiseTagApplied ? 1 : 0,
            franchiseTagYear: contract.franchiseTagApplied ? (leagueSeason || new Date().getFullYear()) : null,
            originalContractYears: originalContractYears || 1,
          });
        }
      }

      res.json(request);
    } catch (error) {
      console.error("Error updating approval request:", error);
      res.status(500).json({ error: "Failed to update approval request", message: dbErrorMessage(error) });
    }
  });

  // Delete a contract approval request
  app.delete("/api/league/:leagueId/contract-approvals/:requestId", async (req, res) => {
    try {
      const { requestId } = req.params;
      await storage.deleteContractApprovalRequest(requestId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting approval request:", error);
      res.status(500).json({ error: "Failed to delete approval request" });
    }
  });

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

        const weekStats = await getPlayerStats(oldLeague.season, week).catch(() => ({}));
        for (const [playerId, stats] of Object.entries(weekStats)) {
          await storage.createPlayerStatsSnapshot({
            leagueId: oldLeagueId,
            season: oldLeague.season,
            week,
            playerId,
            statsData: JSON.stringify(stats),
          });
        }
      }

      // End-of-season snapshots
      const seasonStats = await getPlayerStats(oldLeague.season).catch(() => ({}));
      for (const [playerId, stats] of Object.entries(seasonStats)) {
        await storage.createPlayerStatsSnapshot({
          leagueId: oldLeagueId,
          season: oldLeague.season,
          week: null,
          playerId,
          statsData: JSON.stringify(stats),
        });
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

      // Migrate contracts
      const contracts = await storage.getPlayerContracts(oldLeagueId);
      for (const contract of contracts) {
        const mapping = mappingByOldRoster.get(contract.rosterId);
        if (!mapping) continue;
        await storage.upsertPlayerContract({
          leagueId: newLeagueId,
          rosterId: mapping.newRosterId,
          playerId: contract.playerId,
          salaries: (contract as any).salaries ?? "{}",
          fifthYearOption: contract.fifthYearOption ?? null,
          isOnIr: contract.isOnIr ?? 0,
          franchiseTagUsed: contract.franchiseTagUsed ?? 0,
          franchiseTagYear: contract.franchiseTagYear ?? null,
          originalContractYears: contract.originalContractYears ?? 1,
          isRookieContract: contract.isRookieContract ?? 0,
          extensionApplied: contract.extensionApplied ?? 0,
          extensionYear: contract.extensionYear ?? null,
          extensionSalary: contract.extensionSalary ?? null,
          extensionType: contract.extensionType ?? null,
          hasBeenExtended: 0,
          hasBeenFranchiseTagged: 0,
        });
      }

      // Reset bidding
      await storage.deleteAllPlayerBids(oldLeagueId);

      // Archive rule suggestions for the old league (they stay in DB but no longer show on Rule Changes tab)
      await storage.archiveRuleSuggestions(oldLeagueId);

      await storage.deactivateLeague(oldLeagueId);
      await storage.upsertActiveLeague({
        leagueId: newLeagueId,
        season: newLeague.season,
        isActive: 1,
      });

      await storage.updateLeagueMigration(migration.id, { status: "completed", errorMessage: null });
      res.json({ success: true, migrationId: migration.id });
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

  // Historical snapshot endpoints
  app.get("/api/league/:leagueId/historical/standings", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });
      const parsedWeek = week === undefined ? undefined : (week === "null" ? null : parseInt(week));
      const snapshots = await storage.getStandingsSnapshots(leagueId, season, parsedWeek);
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching standings snapshots:", error);
      res.status(500).json({ error: "Failed to fetch standings snapshots" });
    }
  });

  app.get("/api/league/:leagueId/historical/player-stats", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });
      const parsedWeek = week === undefined ? undefined : (week === "null" ? null : parseInt(week));
      const snapshots = await storage.getPlayerStatsSnapshots(leagueId, season, parsedWeek);
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching player stats snapshots:", error);
      res.status(500).json({ error: "Failed to fetch player stats snapshots" });
    }
  });

  app.get("/api/league/:leagueId/historical/team-stats", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });
      const parsedWeek = week === undefined ? undefined : (week === "null" ? null : parseInt(week));
      const snapshots = await storage.getTeamStatsSnapshots(leagueId, season, parsedWeek);
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching team stats snapshots:", error);
      res.status(500).json({ error: "Failed to fetch team stats snapshots" });
    }
  });

  app.get("/api/league/:leagueId/historical/drafts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      // For 2023/2024, fetch directly from Sleeper API
      if (season === "2023" || season === "2024") {
        const drafts = await getLeagueDrafts(leagueId);
        const filteredDrafts = drafts.filter(d => d.season === season);
        
        // Format to match snapshot structure
        const formattedDrafts = filteredDrafts.map(draft => ({
          id: draft.draft_id,
          leagueId: draft.league_id,
          season: draft.season,
          draftId: draft.draft_id,
          draftData: JSON.stringify(draft),
          picksData: JSON.stringify([]), // Will be fetched separately when needed
          createdAt: Date.now(),
        }));
        
        return res.json(formattedDrafts);
      }

      // For other seasons, use snapshots
      const snapshots = await storage.getDraftSnapshots(leagueId, season);
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching draft snapshots:", error);
      res.status(500).json({ error: "Failed to fetch draft snapshots" });
    }
  });

  // Get historical draft snapshots formatted like Sleeper API drafts
  app.get("/api/league/:leagueId/historical/drafts-formatted", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      // For 2023/2024, fetch directly from Sleeper API
      if (season === "2023" || season === "2024") {
        const drafts = await getLeagueDrafts(leagueId);
        const filteredDrafts = drafts.filter(d => d.season === season);
        
        // Format to match Sleeper API draft format
        const formattedDrafts = filteredDrafts.map(draft => ({
          draftId: draft.draft_id,
          leagueId: draft.league_id,
          season: draft.season,
          status: draft.status,
          type: draft.type,
          rounds: draft.settings.rounds,
          startTime: draft.start_time,
          created: draft.created,
          isSnapshot: false, // Not from snapshot - direct from Sleeper
        }));
        
        return res.json(formattedDrafts);
      }

      // For other seasons, use snapshots
      const snapshots = await storage.getDraftSnapshots(leagueId, season);
      
      // Format snapshots to match Sleeper API draft format
      const formattedDrafts = snapshots.map(snapshot => {
        const draftData = JSON.parse(snapshot.draftData);
        return {
          draftId: snapshot.draftId,
          leagueId: snapshot.leagueId,
          season: draftData.season || snapshot.season,
          status: draftData.status || "complete",
          type: draftData.type || "rookie",
          rounds: draftData.settings?.rounds || 0,
          startTime: draftData.start_time || null,
          created: draftData.created || null,
          isSnapshot: true, // Flag to indicate this is from snapshot
        };
      });
      
      res.json(formattedDrafts);
    } catch (error) {
      console.error("Error fetching formatted draft snapshots:", error);
      res.status(500).json({ error: "Failed to fetch formatted draft snapshots" });
    }
  });

  // Get historical draft picks from snapshot or Sleeper
  app.get("/api/league/:leagueId/historical/draft/:draftId/picks", async (req, res) => {
    try {
      const { leagueId, draftId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      // For 2023/2024, fetch directly from Sleeper API
      if (season === "2023" || season === "2024") {
        const [draft, picks] = await Promise.all([
          getDraft(draftId),
          getDraftPicks(draftId),
        ]);

        const [users, rosters] = await Promise.all([
          getLeagueUsers(leagueId).catch(() => []),
          getLeagueRosters(leagueId).catch(() => []),
        ]);

        const userMap = new Map<string, SleeperLeagueUser>();
        users.forEach(u => userMap.set(u.user_id, u));

        const rosterTeamMap = new Map<number, string>();
        rosters.forEach(r => {
          const user = userMap.get(r.owner_id);
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
          rosterTeamMap.set(r.roster_id, teamName);
        });

        // Format picks to match Sleeper API format
        // For historical drafts, always fetch current player data and calculate backwards
        // This is more reliable than relying on metadata which may be missing or incorrect
        const currentYear = new Date().getFullYear();
        const draftYear = parseInt(season);
        const yearsSinceDraft = currentYear - draftYear;
        
        // Always fetch current player data for accurate years_exp calculation
        let currentPlayers: Record<string, SleeperPlayer> | null = null;
        try {
          currentPlayers = await getAllPlayers();
          console.log(`[${season} Draft] Fetched current player data for ${Object.keys(currentPlayers).length} players`);
        } catch (error) {
          console.error(`[${season} Draft] Failed to fetch current players, will use metadata fallback:`, error);
        }
        
        // Debug logging for 2023 draft
        if (season === "2023" && picks.length > 0) {
          console.log(`[2023 Draft Debug] Years since draft: ${yearsSinceDraft}`);
          const samplePicks = picks.slice(0, Math.min(5, picks.length));
          samplePicks.forEach((pick, idx) => {
            const currentPlayer = currentPlayers?.[pick.player_id];
            const currentYearsExp = currentPlayer?.years_exp ?? (pick.metadata.years_exp ? parseInt(pick.metadata.years_exp) : undefined);
            const yearsExpAtDraft = currentYearsExp !== undefined ? Math.max(0, currentYearsExp - yearsSinceDraft) : 0;
            console.log(`[2023 Draft Debug] Pick ${idx + 1}: ${pick.metadata.first_name} ${pick.metadata.last_name} - Current: ${currentYearsExp}, At Draft: ${yearsExpAtDraft}`);
          });
        }
        
        const formattedPicks = picks.map(pick => {
          let yearsExp: number;
          
          if (currentPlayers) {
            // Use current player data and calculate backwards
            const currentPlayer = currentPlayers[pick.player_id];
            if (currentPlayer?.years_exp !== undefined) {
              yearsExp = Math.max(0, currentPlayer.years_exp - yearsSinceDraft);
            } else {
              // Fallback: try metadata, but assume it might be current if present
              const metadataExp = pick.metadata.years_exp ? parseInt(pick.metadata.years_exp) : 0;
              // If metadata value is high, it's likely current; if low/missing, default to 0 (rookie)
              if (metadataExp >= yearsSinceDraft) {
                yearsExp = Math.max(0, metadataExp - yearsSinceDraft);
              } else {
                // Metadata is missing or appears historical, default to 0 (rookie) as fallback
                yearsExp = 0;
              }
            }
          } else {
            // No current player data available, try to use metadata intelligently
            const metadataExp = pick.metadata.years_exp ? parseInt(pick.metadata.years_exp) : 0;
            // If metadata value is high (>= yearsSinceDraft), treat as current and calculate backwards
            if (metadataExp >= yearsSinceDraft) {
              yearsExp = Math.max(0, metadataExp - yearsSinceDraft);
            } else {
              // Metadata is missing or appears historical, use directly
              yearsExp = metadataExp;
            }
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
            yearsExp: yearsExp,
          };
        });

        return res.json(formattedPicks);
      }
      
      // For other seasons, use snapshots
      const snapshots = await storage.getDraftSnapshots(leagueId, season);
      const snapshot = snapshots.find(s => s.draftId === draftId);
      
      if (!snapshot) {
        return res.status(404).json({ error: "Draft snapshot not found" });
      }

      const picksData = JSON.parse(snapshot.picksData);
      
      // Get league users and rosters for the historical league
      const [users, rosters] = await Promise.all([
        getLeagueUsers(leagueId).catch(() => []),
        getLeagueRosters(leagueId).catch(() => []),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterTeamMap = new Map<number, string>();
      rosters.forEach(r => {
        const user = userMap.get(r.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
        rosterTeamMap.set(r.roster_id, teamName);
      });

      // Format picks to match Sleeper API format
      const formattedPicks = picksData.map((pick: any) => ({
        round: pick.round,
        rosterId: pick.roster_id,
        playerId: pick.player_id,
        pickedBy: pick.picked_by,
        pickNo: pick.pick_no,
        draftSlot: pick.draft_slot,
        playerName: pick.metadata?.first_name && pick.metadata?.last_name
          ? `${pick.metadata.first_name} ${pick.metadata.last_name}`
          : pick.playerName || "Unknown",
        position: pick.metadata?.position || pick.position || "",
        team: pick.metadata?.team || pick.team || "",
        fantasyTeam: rosterTeamMap.get(pick.roster_id) || `Team ${pick.roster_id}`,
      }));

      res.json(formattedPicks);
    } catch (error) {
      console.error("Error fetching draft picks:", error);
      res.status(500).json({ error: "Failed to fetch draft picks" });
    }
  });

  app.get("/api/league/:leagueId/historical/matchups", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season || !week) return res.status(400).json({ error: "season and week are required" });
      const snapshots = await storage.getMatchupSnapshots(leagueId, season, parseInt(week));
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching matchup snapshots:", error);
      res.status(500).json({ error: "Failed to fetch matchup snapshots" });
    }
  });

  app.get("/api/league/:leagueId/historical/transactions", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season || !week) return res.status(400).json({ error: "season and week are required" });
      const snapshots = await storage.getTransactionSnapshots(leagueId, season, parseInt(week));
      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching transaction snapshots:", error);
      res.status(500).json({ error: "Failed to fetch transaction snapshots" });
    }
  });

  // ==================== HISTORICAL SLEEPER ENDPOINTS (2023/2024) ====================
  // These endpoints fetch directly from Sleeper API for historical seasons

  app.get("/api/league/:leagueId/historical-sleeper/standings", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      const [rosters, users, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getLeague(leagueId).catch(() => null),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Calculate standings from matchups
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const regularSeasonWeeks = playoffWeekStart - 1;
      const targetWeek = week ? parseInt(week) : regularSeasonWeeks;

      const rosterTotals = new Map<number, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }>();
      rosters.forEach(r => {
        rosterTotals.set(r.roster_id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
      });

      // Fetch matchups up to target week
      for (let w = 1; w <= targetWeek; w++) {
        const matchups = await getLeagueMatchups(leagueId, w).catch(() => []);
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
      }

      const standingsData = rosters.map(r => {
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
          week: targetWeek,
        };
      }).sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));

      // Format to match snapshot structure
      res.json([{
        leagueId,
        season,
        week: targetWeek,
        snapshotType: week ? "weekly" : "end_of_season",
        standingsData: JSON.stringify(standingsData),
      }]);
    } catch (error) {
      console.error("Error fetching historical standings from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical standings" });
    }
  });

  app.get("/api/league/:leagueId/historical-sleeper/matchups", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season || !week) return res.status(400).json({ error: "season and week are required" });

      const matchups = await getLeagueMatchups(leagueId, parseInt(week));
      
      // Format to match snapshot structure
      res.json([{
        leagueId,
        season,
        week: parseInt(week),
        matchupData: JSON.stringify(matchups),
      }]);
    } catch (error) {
      console.error("Error fetching historical matchups from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical matchups" });
    }
  });

  app.get("/api/league/:leagueId/historical-sleeper/transactions", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season || !week) return res.status(400).json({ error: "season and week are required" });

      const transactions = await getLeagueTransactions(leagueId, parseInt(week));
      
      // Format to match snapshot structure
      res.json([{
        leagueId,
        season,
        week: parseInt(week),
        transactionData: JSON.stringify(transactions),
      }]);
    } catch (error) {
      console.error("Error fetching historical transactions from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical transactions" });
    }
  });

  app.get("/api/league/:leagueId/historical-sleeper/player-stats", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      const weekNum = week ? parseInt(week) : undefined;
      const stats = await getPlayerStats(season, weekNum);
      
      // Format to match snapshot structure
      const snapshots = Object.entries(stats).map(([playerId, statsData]) => ({
        leagueId,
        season,
        week: weekNum || null,
        playerId,
        statsData: JSON.stringify(statsData),
      }));

      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching historical player stats from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical player stats" });
    }
  });

  app.get("/api/league/:leagueId/historical-sleeper/team-stats", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season, week } = req.query as { season?: string; week?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      const [rosters, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeague(leagueId).catch(() => null),
      ]);

      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const regularSeasonWeeks = playoffWeekStart - 1;
      const targetWeek = week ? parseInt(week) : regularSeasonWeeks;

      const rosterTotals = new Map<number, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }>();
      rosters.forEach(r => {
        rosterTotals.set(r.roster_id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 });
      });

      // Fetch matchups up to target week
      for (let w = 1; w <= targetWeek; w++) {
        const matchups = await getLeagueMatchups(leagueId, w).catch(() => []);
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
      }

      // Format to match snapshot structure
      const snapshots = Array.from(rosterTotals.entries()).map(([rosterId, totals]) => ({
        leagueId,
        season,
        week: targetWeek,
        rosterId,
        statsData: JSON.stringify(totals),
      }));

      res.json(snapshots);
    } catch (error) {
      console.error("Error fetching historical team stats from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical team stats" });
    }
  });

  app.get("/api/league/:leagueId/historical-sleeper/drafts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });

      const drafts = await getLeagueDrafts(leagueId);
      const filteredDrafts = drafts.filter(d => d.season === season);
      
      // Format to match DraftInfo structure
      const formattedDrafts = filteredDrafts.map(draft => ({
        draftId: draft.draft_id,
        leagueId: draft.league_id,
        season: draft.season,
        status: draft.status,
        type: draft.type,
        rounds: draft.settings.rounds,
        startTime: draft.start_time,
        created: draft.created,
      }));

      res.json(formattedDrafts);
    } catch (error) {
      console.error("Error fetching historical drafts from Sleeper:", error);
      res.status(500).json({ error: "Failed to fetch historical drafts" });
    }
  });

  // Admin Database Inspection API (Commissioner Only)
  const COMMISSIONER_USER_IDS = ["900186363130503168"]; // Add commissioner user IDs here

  // Helper function to check if user is commissioner
  async function isCommissioner(userId: string, leagueId?: string): Promise<boolean> {
    if (COMMISSIONER_USER_IDS.includes(userId)) {
      return true;
    }
    if (leagueId) {
      try {
        const league = await getLeague(leagueId);
        return league && league.owner_id === userId;
      } catch {
        return false;
      }
    }
    return false;
  }

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

  return httpServer;
}
