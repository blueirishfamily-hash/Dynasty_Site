// Historical snapshot and historical Sleeper endpoints.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getLeagueTransactions,
  getAllPlayers,
  getPlayerStats,
  getLeagueDrafts,
  getDraftPicks,
  getDraft,
  type SleeperLeagueUser,
  type SleeperPlayer,
  type SleeperMatchup,
} from "../sleeper";

export function registerHistoricalRoutes(app: Express): void {
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

  app.get("/api/league/:leagueId/historical/year-recap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });
      const snapshot = await storage.getYearRecapSnapshot(leagueId, season);
      if (!snapshot) return res.status(404).json({ error: "No year recap snapshot found for this season" });
      const data = JSON.parse(snapshot.data);
      res.json(data);
    } catch (error) {
      console.error("Error fetching year recap snapshot:", error);
      res.status(500).json({ error: "Failed to fetch year recap snapshot" });
    }
  });

  app.get("/api/league/:leagueId/historical/metrics", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { season } = req.query as { season?: string };
      if (!season) return res.status(400).json({ error: "season is required" });
      const snapshot = await storage.getMetricsSnapshot(leagueId, season);
      if (!snapshot) return res.status(404).json({ error: "No metrics snapshot found for this season" });
      res.json({
        teamLuck: JSON.parse(snapshot.teamLuckData),
        heatCheck: JSON.parse(snapshot.heatCheckData),
        powerRankings: JSON.parse(snapshot.powerRankingsData),
      });
    } catch (error) {
      console.error("Error fetching metrics snapshot:", error);
      res.status(500).json({ error: "Failed to fetch metrics snapshot" });
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
}
