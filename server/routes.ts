import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  getSleeperUser,
  getUserLeagues,
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getAllLeagueTransactions,
  getTradedPicks,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  getLeagueDrafts,
  getDraftPicks,
  getDraft,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperPlayer,
  type SleeperTransaction,
  type SleeperTradedPick,
  type SleeperMatchup,
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
} from "@shared/schema";

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

      res.json(picks.map(pick => ({
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
      })));
    } catch (error) {
      console.error("Error fetching draft picks:", error);
      res.status(500).json({ error: "Failed to fetch draft picks" });
    }
  });

  // Get NFL state (current week, season)
  app.get("/api/sleeper/nfl-state", async (_req, res) => {
    try {
      const state = await getNFLState();
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

  // Get league standings with streak calculation
  app.get("/api/sleeper/league/:leagueId/standings", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const [rosters, users, nflState] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getNFLState(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Fetch matchup history for streak calculation
      const currentWeek = nflState.week;
      const matchupHistory: Map<number, Array<{ week: number; won: boolean | null }>> = new Map();
      
      // Initialize matchup history for all rosters
      rosters.forEach(r => matchupHistory.set(r.roster_id, []));
      
      // Fetch all weeks' matchups for streak calculation
      const weeksToFetch = Math.max(1, currentWeek - 1); // Only completed weeks
      const matchupPromises = [];
      for (let week = 1; week <= weeksToFetch; week++) {
        matchupPromises.push(getLeagueMatchups(req.params.leagueId, week).then(matchups => ({ week, matchups })));
      }
      
      const allMatchups = await Promise.all(matchupPromises);
      
      // Process matchups to determine win/loss for each team each week
      for (const { week, matchups } of allMatchups) {
        // Group matchups by matchup_id
        const matchupGroups = new Map<number, typeof matchups>();
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
      
      const [matchups, rosters, users, players, nflState, league] = await Promise.all([
        getLeagueMatchups(req.params.leagueId, week),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
        getNFLState(),
        getLeague(req.params.leagueId),
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
      const season = league.season || nflState.season;
      const currentWeek = nflState.week;
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
        const willNotPlay = isInactive || isOnBye;
        
        // Get player's historical points
        const weeklyPoints = playerWeeklyPoints.get(playerId) || [];
        const gamesPlayed = weeklyPoints.length;
        
        let boom: number;
        let bust: number;
        let projectedPoints: number;
        
        if (willNotPlay) {
          // Player is out, IR, PUP, or on bye - project 0
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

      const buildDetailedMatchupTeam = (matchup: typeof userMatchup, roster: SleeperRoster) => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        
        const starterIds = matchup.starters || [];
        const playerPoints = matchup.players_points || {};
        const allRosterIds = roster.players || [];
        const benchIds = allRosterIds.filter(pid => !starterIds.includes(pid));
        
        // Build info for all players first
        const allPlayersInfo = new Map<string, ReturnType<typeof buildPlayerInfo>>();
        allRosterIds.forEach(pid => {
          allPlayersInfo.set(pid, buildPlayerInfo(pid, playerPoints[pid] || 0));
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
        
        // Build optimized starters by replacing inactive/bye players with eligible bench players
        const usedBenchIds = new Set<string>();
        const optimizedStarters: ReturnType<typeof buildPlayerInfo>[] = [];
        
        // Define slot order with their eligible positions
        const slotPositions = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DEF"];
        
        // First pass: assign starters to slots, tracking which need replacement
        const starterInfos = starterIds.map(pid => allPlayersInfo.get(pid)!);
        
        for (let i = 0; i < slotPositions.length; i++) {
          const slotPos = slotPositions[i];
          const starter = starterInfos[i];
          
          if (starter && canPlay(starter)) {
            // Starter is active, keep them
            optimizedStarters.push(starter);
          } else {
            // Starter is out/bye - find replacement from bench
            let replacement: ReturnType<typeof buildPlayerInfo> | null = null;
            
            // Find best eligible bench player who can play
            const eligibleBench = benchIds
              .filter(pid => !usedBenchIds.has(pid))
              .map(pid => allPlayersInfo.get(pid)!)
              .filter(p => canPlay(p) && isEligibleForPosition(p, slotPos))
              .sort((a, b) => b.projectedPoints - a.projectedPoints);
            
            if (eligibleBench.length > 0) {
              replacement = eligibleBench[0];
              usedBenchIds.add(replacement.id);
            }
            
            // Use replacement or keep original starter (with 0 projection)
            optimizedStarters.push(replacement || starter);
          }
        }
        
        // Build bench from remaining players
        const bench = benchIds
          .filter(pid => !usedBenchIds.has(pid))
          .map(pid => allPlayersInfo.get(pid)!);

        // Calculate projected team total from optimized starters
        const projectedTotal = optimizedStarters.reduce((sum, p) => sum + p.projectedPoints, 0);

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
          starters: optimizedStarters,
          bench,
        };
      };

      const userTeam = buildDetailedMatchupTeam(userMatchup, userRoster);
      const opponentRoster = opponentMatchup ? rosterMap.get(opponentMatchup.roster_id) : null;
      const opponentTeam = opponentMatchup && opponentRoster 
        ? buildDetailedMatchupTeam(opponentMatchup, opponentRoster)
        : null;

      res.json({ userTeam, opponentTeam, week });
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
      const season = new Date().getFullYear().toString();
      
      const [rosters, players, seasonStats, state] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getAllPlayers(),
        getPlayerStats(season),
        getNFLState(),
      ]);

      const userRoster = rosters.find(r => r.owner_id === req.params.userId);
      if (!userRoster) {
        return res.status(404).json({ error: "Roster not found" });
      }

      const positionStats: Record<string, number[]> = {};

      // Collect all player stats by position across the league
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = players[pid];
          if (!player) return;
          const pos = player.position;
          if (!["QB", "RB", "WR", "TE"].includes(pos)) return;
          
          const stats = seasonStats[pid];
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
      Object.entries(positionStats).forEach(([pos, pointsArr]) => {
        const sortedWithIds = rosters
          .flatMap(r => (r.players || []).map(pid => {
            const player = players[pid];
            if (!player || player.position !== pos) return null;
            const stats = seasonStats[pid];
            return { pid, points: stats?.pts_ppr || stats?.pts_std || 0 };
          }))
          .filter((x): x is { pid: string; points: number } => x !== null)
          .sort((a, b) => b.points - a.points);
        
        positionRanks[pos] = new Map(sortedWithIds.map((item, idx) => [item.pid, idx + 1]));
      });

      const getStatus = (pid: string): "starter" | "bench" | "taxi" | "ir" => {
        if (userRoster.starters?.includes(pid)) return "starter";
        if (userRoster.taxi?.includes(pid)) return "taxi";
        if (userRoster.reserve?.includes(pid)) return "ir";
        return "bench";
      };

      const rosterPlayers = (userRoster.players || [])
        .map(pid => {
          const player = players[pid];
          if (!player) return null;
          
          const stats = seasonStats[pid];
          const points = stats?.pts_ppr || stats?.pts_std || 0;
          const weeksPlayed = state.week || 1;
          
          return {
            id: pid,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position as Position,
            team: player.team,
            age: player.age,
            yearsExp: player.years_exp,
            injuryStatus: player.injury_status,
            status: getStatus(pid),
            seasonPoints: points,
            weeklyAvg: points / weeksPlayed,
            positionRank: positionRanks[player.position]?.get(pid) || 999,
          };
        })
        .filter((p) => p !== null)
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
      const season = new Date().getFullYear().toString();
      
      const [rosters, players, state] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getAllPlayers(),
        getNFLState(),
      ]);

      const userRoster = rosters.find(r => r.owner_id === req.params.userId);
      if (!userRoster) {
        return res.status(404).json({ error: "Roster not found" });
      }

      // Fetch weekly stats to calculate games played and PPG
      const currentWeek = state?.week || 1;
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
      const weeksToFetch = Math.min(nflState.week, 8);
      
      const cacheKey = `${season}`;
      const cached = playerStatsCache.get(cacheKey);
      let playerWeeklyPoints: Map<string, number[]>;
      
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        playerWeeklyPoints = cached.data;
      } else {
        playerWeeklyPoints = new Map();
        const startWeek = Math.max(1, nflState.week - weeksToFetch + 1);
        
        const weeklyStatsPromises = [];
        for (let w = startWeek; w <= nflState.week; w++) {
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
      const currentWeek = nflState.week;
      const regularSeasonWeeks = playoffWeekStart - 1;
      // Include current week in remaining weeks (e.g., week 12 with 14-week season = 3 weeks left including current)
      const remainingWeeks = Math.max(0, regularSeasonWeeks - currentWeek + 1);

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

      // Convert to percentages and format response
      // Sort by same criteria as dashboard standings: record → points scored → H2H
      const predictions = teams
        .map(team => {
          const r = results.get(team.rosterId)!;
          const pointsRank = pointsRankMap.get(team.rosterId) || 1;
          const gaps = pointsGapMap.get(team.rosterId) || { behind: null, ahead: null };
          
          const projectedPointsFor = Math.round((r.avgFinalPoints / SIMULATIONS) * 10) / 10;
          
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
            oneSeedPct: Math.round((r.oneSeed / SIMULATIONS) * 1000) / 10,
            divisionWinnerPct: hasDivisions 
              ? Math.round((r.divisionWinner / SIMULATIONS) * 1000) / 10 
              : undefined,
            makePlayoffsPct: Math.round((r.makePlayoffs / SIMULATIONS) * 1000) / 10,
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
        hasDivisions,
        simulationCount: SIMULATIONS,
      });
    } catch (error) {
      console.error("Error calculating playoff predictions:", error);
      res.status(500).json({ error: "Failed to calculate playoff predictions" });
    }
  });

  // Team Luck - calculate luck based on points vs league median
  app.get("/api/sleeper/league/:leagueId/team-luck", async (req, res) => {
    try {
      const [rosters, users, nflState] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getNFLState(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      // Get current week (completed weeks only)
      const currentWeek = nflState.week;
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
          const maxWeek = season === currentSeason ? Math.max(0, nflState.week - 1) : 17;
          
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
      
      const [rosters, users, nflState] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
      ]);
      
      // Calculate completed weeks (current week - 1, since current week may not be done)
      const currentWeek = Math.max(1, nflState.week - 1);
      
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
          const [rosters, users, league] = await Promise.all([
            getLeagueRosters(lid),
            getLeagueUsers(lid),
            getLeague(lid),
          ]);
          
          // Create user lookup map
          const userMap = new Map<string, SleeperLeagueUser>();
          users.forEach(u => userMap.set(u.user_id, u));
          
          // Find champion - roster with playoff_wins indicating they won the championship
          // In Sleeper, the champion typically has the most playoff wins or is marked specially
          // We'll look for the roster that finished 1st place in the final standings
          const sortedRosters = [...rosters].sort((a, b) => {
            // Sort by playoff rank if available, otherwise by wins and points
            if (a.metadata?.record && b.metadata?.record) {
              return 0; // Can't reliably determine from record string
            }
            // Use settings.fpts for total points
            const aWins = a.settings?.wins || 0;
            const bWins = b.settings?.wins || 0;
            const aFpts = a.settings?.fpts || 0;
            const bFpts = b.settings?.fpts || 0;
            if (aWins !== bWins) return bWins - aWins;
            return bFpts - aFpts;
          });
          
          // The champion is typically determined by bracket results
          // For now, find the team with highest playoff record or most wins
          const champion = sortedRosters.find(r => {
            // Look for playoff champion indicators
            const metadata = r.metadata || {};
            return metadata.streak === 'W' || r.settings?.wins > 0;
          }) || sortedRosters[0];
          
          if (champion) {
            const owner = userMap.get(champion.owner_id);
            const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${champion.roster_id}`;
            const initials = teamName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
            
            // Check if this season is complete (playoffs finished)
            const status = (league as any).status;
            if (status === 'complete' || parseInt(season) < new Date().getFullYear()) {
              champions.push({
                season,
                rosterId: champion.roster_id,
                ownerId: champion.owner_id,
                teamName,
                initials,
                avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
              });
            }
          }
          
          // Find highest scorer
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
            
            // Only include if season is complete or has substantial points
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
        } catch (err) {
          console.error(`Error processing season ${season}:`, err);
        }
      }
      
      // Get award winners from database
      const mvpWinners: TrophyWinner[] = [];
      const royWinners: TrophyWinner[] = [];
      const gmWinners: TrophyWinner[] = [];
      
      // Fetch award data for all seasons in this league chain
      for (const { leagueId: lid, season } of leagueIds) {
        try {
          const nominations = await storage.getAwardNominations(lid, season);
          const ballots = await storage.getAwardBallots(lid, season);
          
          // Calculate winners for each award type
          for (const awardType of ['mvp', 'roy', 'gm'] as const) {
            const typeNominations = nominations.filter(n => n.awardType === awardType);
            const typeBallots = ballots.filter(b => b.awardType === awardType);
            
            if (typeNominations.length === 0 || typeBallots.length === 0) continue;
            
            // Calculate points for each nomination
            const points: Record<string, number> = {};
            typeBallots.forEach(ballot => {
              points[ballot.firstPlaceId] = (points[ballot.firstPlaceId] || 0) + 3;
              points[ballot.secondPlaceId] = (points[ballot.secondPlaceId] || 0) + 2;
              points[ballot.thirdPlaceId] = (points[ballot.thirdPlaceId] || 0) + 1;
            });
            
            // Find winner
            const sortedNominations = typeNominations.sort((a, b) => 
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
          }
        } catch (err) {
          // No award data for this season
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

  // Rule Suggestions API
  app.get("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const suggestions = await storage.getRuleSuggestions(req.params.leagueId);
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching rule suggestions:", error);
      res.status(500).json({ error: "Failed to fetch rule suggestions" });
    }
  });

  app.post("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const { authorId, authorName, title, description } = req.body;
      if (!authorId || !authorName || !title || !description) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const suggestion = await storage.createRuleSuggestion({
        leagueId: req.params.leagueId,
        authorId,
        authorName,
        title,
        description,
      });
      res.json(suggestion);
    } catch (error) {
      console.error("Error creating rule suggestion:", error);
      res.status(500).json({ error: "Failed to create rule suggestion" });
    }
  });

  // Cast vote on a rule (1 vote per team per rule)
  app.post("/api/rule-suggestions/:id/vote", async (req, res) => {
    try {
      const { rosterId, voterName, vote } = req.body;
      if (!rosterId || !voterName || !vote) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (vote !== "approve" && vote !== "reject") {
        return res.status(400).json({ error: "Invalid vote type" });
      }
      
      const ruleVote = await storage.castRuleVote({
        ruleId: req.params.id,
        rosterId,
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
      const votes = await storage.getRuleVotes(req.params.id);
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
      const vote = await storage.getRuleVoteByRoster(req.params.id, parseInt(req.params.rosterId));
      res.json(vote || null);
    } catch (error) {
      console.error("Error fetching user vote:", error);
      res.status(500).json({ error: "Failed to fetch user vote" });
    }
  });

  // Award Nominations API
  app.get("/api/league/:leagueId/awards/:season/:awardType", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      if (awardType !== "mvp" && awardType !== "roy") {
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
      
      if (awardType !== "mvp" && awardType !== "roy") {
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
      if (awardType !== "mvp" && awardType !== "roy") {
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
      
      if (awardType !== "mvp" && awardType !== "roy") {
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
      if (awardType !== "mvp" && awardType !== "roy") {
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
      if (awardType !== "mvp" && awardType !== "roy") {
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

  // Get league setting
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

  // Set league setting (commissioner only - verified on client)
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

  return httpServer;
}
