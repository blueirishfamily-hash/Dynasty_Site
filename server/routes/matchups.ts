// Matchup preview, current matchup and matchup detail.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import type { MatchupPreviewData } from "../../shared/matchupPreview";
import {
  buildRadarStats,
  computeForm,
  computeHeadToHead,
  computeRadarTotals,
  lastCompletedRegularSeasonWeek,
  summarizeHeadToHead,
  type PreviewWeek,
  type SeasonMatchups,
  type WeeklyPlayerStats,
} from "../matchupPreview";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getLeagueTransactions,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperTransaction,
  type SleeperMatchup,
} from "../sleeper";
import type { MatchupTeam, Position } from "../../shared/schema";
import {
  getTeamInitials,
  getEffectiveWeek,
  playerStatsCache,
  STATS_CACHE_TTL,
} from "./shared";

export function registerMatchupsRoutes(app: Express): void {
  // Matchup preview: radar strengths, season form, and head-to-head history for two rosters
  const completedWeekStatsCache = new Map<string, WeeklyPlayerStats>();
  const completedLeagueWeekCache = new Map<string, SleeperMatchup[]>();

  const getCachedWeekStats = async (season: string, week: number): Promise<WeeklyPlayerStats> => {
    const key = `${season}-${week}`;
    const cached = completedWeekStatsCache.get(key);
    if (cached) return cached;
    const stats = await getPlayerStats(season, week);
    completedWeekStatsCache.set(key, stats);
    return stats;
  };

  const getLeagueWeekMatchups = async (leagueId: string, week: number, cacheable: boolean): Promise<SleeperMatchup[]> => {
    const key = `${leagueId}-${week}`;
    if (cacheable) {
      const cached = completedLeagueWeekCache.get(key);
      if (cached) return cached;
    }
    const matchups = await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]);
    if (cacheable) completedLeagueWeekCache.set(key, matchups);
    return matchups;
  };

  app.get("/api/sleeper/league/:leagueId/matchup-preview", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const rosterIdA = parseInt(req.query.rosterIdA as string, 10);
      const rosterIdB = parseInt(req.query.rosterIdB as string, 10);
      if (!Number.isFinite(rosterIdA) || !Number.isFinite(rosterIdB) || rosterIdA === rosterIdB) {
        return res.status(400).json({ error: "rosterIdA and rosterIdB must be two different roster ids" });
      }

      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
        getLeague(leagueId).catch(() => null),
      ]);

      const rosterA = rosters.find((r) => r.roster_id === rosterIdA);
      const rosterB = rosters.find((r) => r.roster_id === rosterIdB);
      if (!rosterA || !rosterB) {
        return res.status(404).json({ error: "Roster not found in this league" });
      }

      const season = String(league?.season ?? nflState.season);
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const isPastSeason = !!league?.season && parseInt(league.season, 10) < parseInt(String(nflState.season), 10);
      const seasonComplete =
        isPastSeason ||
        league?.status === "complete" ||
        nflState.season_type === "post" ||
        nflState.season_type === "off";
      const lastWeek = lastCompletedRegularSeasonWeek({
        playoffWeekStart,
        currentWeek: getEffectiveWeek(nflState, league),
        seasonComplete,
      });
      const weekNumbers = Array.from({ length: lastWeek }, (_, i) => i + 1);

      const toPreviewWeeks = (weeks: Array<{ week: number; matchups: SleeperMatchup[] }>): PreviewWeek[] =>
        weeks.map(({ week, matchups }) => ({
          week,
          matchups: matchups.map((m) => ({
            roster_id: m.roster_id,
            matchup_id: m.matchup_id,
            points: m.points,
            starters: m.starters,
          })),
        }));

      const [currentWeeks, statsEntries] = await Promise.all([
        Promise.all(
          weekNumbers.map(async (week) => ({
            week,
            matchups: await getLeagueWeekMatchups(leagueId, week, seasonComplete),
          })),
        ),
        Promise.all(
          weekNumbers.map(async (week) => [week, await getCachedWeekStats(season, week).catch(() => ({} as WeeklyPlayerStats))] as const),
        ),
      ]);
      const weekly = toPreviewWeeks(currentWeeks);
      const statsByWeek = new Map<number, WeeklyPlayerStats>(statsEntries);

      const totalsByRoster = computeRadarTotals(
        weekly,
        statsByWeek,
        rosters.map((r) => r.roster_id),
      );

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach((u) => userMap.set(u.user_id, u));
      const toTeam = (roster: (typeof rosters)[number]) => {
        const owner = userMap.get(roster.owner_id);
        const name = owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`;
        return {
          rosterId: roster.roster_id,
          name,
          initials: getTeamInitials(name),
          avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
        };
      };

      const seasonsToSearch: SeasonMatchups[] = [{ season, rosterIdA, rosterIdB, weekly }];
      const seasonsSearched = [season];

      // Walk previous seasons, matching each owner to their roster in that season
      let previousId: string | null | undefined = (league as any)?.previous_league_id;
      let guard = 0;
      while (previousId && previousId !== "0" && guard++ < 10) {
        const [prevLeague, prevRosters] = await Promise.all([
          getLeague(previousId).catch(() => null),
          getLeagueRosters(previousId).catch(() => null),
        ]);
        if (!prevLeague || !prevRosters) break;

        const prevA = rosterA.owner_id ? prevRosters.find((r) => r.owner_id === rosterA.owner_id) : undefined;
        const prevB = rosterB.owner_id ? prevRosters.find((r) => r.owner_id === rosterB.owner_id) : undefined;
        seasonsSearched.push(prevLeague.season);

        if (prevA && prevB) {
          const prevLeagueId: string = previousId;
          const prevPlayoffStart = (prevLeague.settings as any)?.playoff_week_start || 15;
          const prevWeeks = await Promise.all(
            Array.from({ length: prevPlayoffStart - 1 }, (_, i) => i + 1).map(async (week) => ({
              week,
              matchups: await getLeagueWeekMatchups(prevLeagueId, week, true),
            })),
          );
          seasonsToSearch.push({
            season: prevLeague.season,
            rosterIdA: prevA.roster_id,
            rosterIdB: prevB.roster_id,
            weekly: toPreviewWeeks(prevWeeks),
          });
        }
        previousId = (prevLeague as any).previous_league_id;
      }

      const meetings = computeHeadToHead(seasonsToSearch);
      const formA = computeForm(weekly, rosterIdA);
      const response: MatchupPreviewData = {
        teamA: toTeam(rosterA),
        teamB: toTeam(rosterB),
        weeks: weekly.filter((w) => w.matchups.length > 0).map((w) => w.week),
        leagueSize: rosters.length,
        radar: {
          teamA: buildRadarStats(totalsByRoster, rosterIdA),
          teamB: buildRadarStats(totalsByRoster, rosterIdB),
          gamesPlayed: formA.length,
        },
        form: {
          teamA: formA,
          teamB: computeForm(weekly, rosterIdB),
        },
        headToHead: {
          meetings,
          summary: summarizeHeadToHead(meetings),
          seasonsSearched,
        },
      };

      res.json(response);
    } catch (error) {
      console.error("Error computing matchup preview:", error);
      res.status(500).json({ error: "Failed to compute matchup preview" });
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
}
