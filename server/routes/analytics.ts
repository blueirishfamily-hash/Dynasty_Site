// Team luck, rivalry, heat check, power rankings and fluke tracker.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getNFLState,
  getAllPlayers,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperPlayer,
  type SleeperMatchup,
  type SleeperNFLState,
} from "../sleeper";
import {
  getTeamInitials,
  getEffectiveWeek,
} from "./shared";

export function registerAnalyticsRoutes(app: Express): void {
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
  // Uses same offseason logic as power rankings: fallback to previous_league_id when current league has no matchup data
  app.get("/api/sleeper/league/:leagueId/heat-check", async (req, res) => {
    try {
      const { leagueId } = req.params;

      const currentYear = new Date().getFullYear();
      const fallbackNflState = { week: 18, season: String(currentYear - 1), season_type: "off", display_week: 18 } as SleeperNFLState;
      const fallbackLeague = { season: String(currentYear - 1), previous_league_id: null, settings: {} } as any;

      const [rostersResult, usersResult, nflStateResult, leagueResult] = await Promise.all([
        getLeagueRosters(leagueId).catch((err) => {
          console.error(`[Heat Check] getLeagueRosters failed:`, err?.message || err);
          return null;
        }),
        getLeagueUsers(leagueId).catch((err) => {
          console.error(`[Heat Check] getLeagueUsers failed:`, err?.message || err);
          return null;
        }),
        getNFLState().catch((err) => {
          console.error(`[Heat Check] getNFLState failed, using fallback:`, err?.message || err);
          return fallbackNflState;
        }),
        getLeague(leagueId).catch((err) => {
          console.error(`[Heat Check] getLeague failed, using fallback:`, err?.message || err);
          return fallbackLeague;
        }),
      ]);

      const rosters = rostersResult;
      const users = usersResult;
      const nflState = nflStateResult ?? fallbackNflState;
      const league = leagueResult ?? fallbackLeague;

      if (!rosters || !users) {
        return res.status(503).json({
          teams: [],
          currentWeek: 0,
          message: "Failed to fetch league data. Sleeper API may be temporarily unavailable.",
        });
      }

      const effectiveWeek = getEffectiveWeek(nflState, league);
      const currentWeek = Math.max(1, effectiveWeek - 1);

      let matchupLeagueId = leagueId;
      const testMatchup = await getLeagueMatchups(leagueId, 1).catch(() => []);
      const hasCurrentSeasonData = testMatchup.length > 0 && testMatchup.some((m: SleeperMatchup) => m.points !== undefined && m.points > 0);
      if (!hasCurrentSeasonData && (league as any).previous_league_id) {
        matchupLeagueId = (league as any).previous_league_id;
      }

      if (currentWeek < 5) {
        return res.json({
          teams: [],
          currentWeek,
          message: "Need at least 5 weeks of data for Heat Check analysis",
        });
      }

      const matchupPromises = [];
      for (let week = 1; week <= currentWeek; week++) {
        matchupPromises.push(
          getLeagueMatchups(matchupLeagueId, week)
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
      
      // Fetch in parallel with per-call error handling so a single timeout doesn't kill the entire request
      const currentYear = new Date().getFullYear();
      const fallbackNflState = { week: 18, season: String(currentYear - 1), season_type: "off", display_week: 18 } as SleeperNFLState;
      const fallbackLeague = { season: String(currentYear - 1), previous_league_id: null, settings: {} } as any;

      const [rostersResult, usersResult, nflStateResult, leagueResult] = await Promise.all([
        getLeagueRosters(leagueId).catch((err) => {
          console.error(`[Power Rankings] getLeagueRosters failed:`, err?.message || err);
          return null;
        }),
        getLeagueUsers(leagueId).catch((err) => {
          console.error(`[Power Rankings] getLeagueUsers failed:`, err?.message || err);
          return null;
        }),
        getNFLState().catch((err) => {
          console.error(`[Power Rankings] getNFLState failed, using fallback:`, err?.message || err);
          return fallbackNflState;
        }),
        getLeague(leagueId).catch((err) => {
          console.error(`[Power Rankings] getLeague failed, using fallback:`, err?.message || err);
          return fallbackLeague;
        }),
      ]);

      const rosters = rostersResult;
      const users = usersResult;
      const nflState = nflStateResult ?? fallbackNflState;
      const league = leagueResult ?? fallbackLeague;

      if (!rosters || !users) {
        return res.status(503).json({
          error: "Failed to fetch league data. Sleeper API may be temporarily unavailable.",
          teams: [],
          message: "Please try again in a few moments.",
        });
      }

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

      // Calculate win percentages, week 1 rank, and current rank (for dumbbell chart)
      const teamsSorted = Array.from(powerRankingMap.values())
        .map(team => {
          const totalGames = team.allPlayWins + team.allPlayLosses;
          team.allPlayWinPct = totalGames > 0 
            ? Math.round((team.allPlayWins / totalGames) * 1000) / 10 
            : 0;
          const week1Rank = team.weeklyRankings.find(r => r.week === 1)?.rank;
          const week1AllPlayWinPct = (week1Rank != null && numTeams > 1)
            ? Math.round(((numTeams - week1Rank) / (numTeams - 1)) * 1000) / 10
            : team.allPlayWinPct;
          return { ...team, week1AllPlayWinPct, week1Rank: week1Rank ?? undefined };
        })
        .sort((a, b) => b.allPlayWinPct - a.allPlayWinPct);

      const teams = teamsSorted.map((team, index) => ({
        ...team,
        currentRank: index + 1,
      }));

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

  // Fluke Tracker - rolling 4-week avg, flag starters 2+ std devs above (good) or below (bad) their average
  app.get("/api/sleeper/league/:leagueId/fluke-tracker", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const [rosters, users, nflState, league, players] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
        getLeague(leagueId).catch(() => null),
        getAllPlayers(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach((u: SleeperLeagueUser) => userMap.set(u.user_id, u));

      const currentWeek = getEffectiveWeek(nflState, league);
      const completedWeeks = Math.max(0, currentWeek - 1);

      if (completedWeeks < 5) {
        return res.json({
          teams: [],
          currentWeek,
          completedWeeks,
          message: "Need at least 5 completed weeks for Fluke Tracker analysis",
        });
      }

      const playoffWeekStart = (league as any)?.settings?.playoff_week_start ?? 15;
      const lastRegularSeasonWeek = playoffWeekStart - 1;
      const analysisEndWeek = Math.min(lastRegularSeasonWeek, completedWeeks);

      let matchupLeagueId = leagueId;
      const testMatchup = await getLeagueMatchups(leagueId, 1).catch(() => []);
      const hasData = testMatchup.length > 0 && testMatchup.some((m: SleeperMatchup) => m.points !== undefined && m.points > 0);
      if (!hasData && (league as any)?.previous_league_id) {
        matchupLeagueId = (league as any).previous_league_id;
      }

      const matchupPromises: Promise<{ week: number; matchups: SleeperMatchup[] }>[] = [];
      const weeksToFetch = Math.min(lastRegularSeasonWeek, completedWeeks);
      for (let w = 1; w <= weeksToFetch; w++) {
        matchupPromises.push(
          getLeagueMatchups(matchupLeagueId, w)
            .then(matchups => ({ week: w, matchups }))
            .catch(() => ({ week: w, matchups: [] as SleeperMatchup[] }))
        );
      }
      const weeklyMatchups = await Promise.all(matchupPromises);

      // playerWeeklyData[playerId][week] = { points, rosterId }
      const playerWeeklyData = new Map<string, Map<number, { points: number; rosterId: number }>>();

      weeklyMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const starters = m.starters || [];
          const pp = m.players_points || {};
          starters.forEach((pid: string) => {
            const pts = pp[pid] ?? pp[String(pid)] ?? 0;
            if (!playerWeeklyData.has(pid)) {
              playerWeeklyData.set(pid, new Map());
            }
            playerWeeklyData.get(pid)!.set(week, { points: pts, rosterId: m.roster_id });
          });
        });
      });

      function stdDev(arr: number[]): number {
        if (arr.length < 2) return 0;
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((sum, x) => sum + (x - avg) ** 2, 0) / arr.length;
        return Math.sqrt(variance);
      }

      // Build team info
      const teamInfoMap = new Map<number, { name: string; ownerId: string; initials: string; avatar: string | null }>();
      rosters.forEach((r: SleeperRoster) => {
        const user = userMap.get(r.owner_id);
        const name = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
        teamInfoMap.set(r.roster_id, {
          name,
          ownerId: r.owner_id,
          initials: getTeamInitials(name),
          avatar: user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
        });
      });

      const playersRecord = players as Record<string, SleeperPlayer>;
      const getPlayerName = (pid: string) => {
        const p = playersRecord[pid] ?? playersRecord[String(pid)];
        return p?.full_name || (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : pid);
      };
      const getPlayerPosition = (pid: string) => {
        const p = playersRecord[pid] ?? playersRecord[String(pid)];
        return p?.position || "FLEX";
      };

      // rosterId -> { goodFlukeCount, badFlukeCount, weeklyFlukes }
      const teamFlukes = new Map<number, {
        goodFlukeCount: number;
        badFlukeCount: number;
        weeklyFlukes: Array<{
          week: number;
          goodFlukes: Array<{ playerId: string; playerName: string; position: string; points: number; rollingAvg: number; stdDev: number; deviations: number }>;
          badFlukes: Array<{ playerId: string; playerName: string; position: string; points: number; rollingAvg: number; stdDev: number; deviations: number }>;
        }>;
      }>();

      rosters.forEach((r: SleeperRoster) => {
        teamFlukes.set(r.roster_id, { goodFlukeCount: 0, badFlukeCount: 0, weeklyFlukes: [] });
      });

      for (let w = 5; w <= analysisEndWeek; w++) {
        const priorWeeks = [w - 4, w - 3, w - 2, w - 1];
        const goodByRoster = new Map<number, Array<{ playerId: string; playerName: string; position: string; points: number; rollingAvg: number; stdDev: number; deviations: number }>>();
        const badByRoster = new Map<number, Array<{ playerId: string; playerName: string; position: string; points: number; rollingAvg: number; stdDev: number; deviations: number }>>();

        playerWeeklyData.forEach((weekMap, playerId) => {
          const currentEntry = weekMap.get(w);
          if (!currentEntry) return;
          const { points: currentPts, rosterId } = currentEntry;

          const priorPts: number[] = [];
          priorWeeks.forEach(pw => {
            const e = weekMap.get(pw);
            if (e && e.rosterId === rosterId) priorPts.push(e.points);
          });

          if (priorPts.length < 3) return;
          const avg = priorPts.reduce((a, b) => a + b, 0) / priorPts.length;
          const sd = stdDev(priorPts);
          if (sd < 1) return;

          const deviations = (currentPts - avg) / sd;
          if (deviations >= 2) {
            const arr = goodByRoster.get(rosterId) || [];
            arr.push({
              playerId,
              playerName: getPlayerName(playerId),
              position: getPlayerPosition(playerId),
              points: Math.round(currentPts * 100) / 100,
              rollingAvg: Math.round(avg * 100) / 100,
              stdDev: Math.round(sd * 100) / 100,
              deviations: Math.round(deviations * 100) / 100,
            });
            goodByRoster.set(rosterId, arr);
          } else if (deviations <= -2) {
            const arr = badByRoster.get(rosterId) || [];
            arr.push({
              playerId,
              playerName: getPlayerName(playerId),
              position: getPlayerPosition(playerId),
              points: Math.round(currentPts * 100) / 100,
              rollingAvg: Math.round(avg * 100) / 100,
              stdDev: Math.round(sd * 100) / 100,
              deviations: Math.round(Math.abs(deviations) * 100) / 100,
            });
            badByRoster.set(rosterId, arr);
          }
        });

        rosters.forEach((r: SleeperRoster) => {
          const teamData = teamFlukes.get(r.roster_id)!;
          const good = goodByRoster.get(r.roster_id) || [];
          const bad = badByRoster.get(r.roster_id) || [];
          teamData.goodFlukeCount += good.length;
          teamData.badFlukeCount += bad.length;
          teamData.weeklyFlukes.push({ week: w, goodFlukes: good, badFlukes: bad });
        });
      }

      const teams = Array.from(teamFlukes.entries())
        .map(([rosterId, data]) => {
          const info = teamInfoMap.get(rosterId)!;
          return {
            rosterId,
            name: info.name,
            ownerId: info.ownerId,
            initials: info.initials,
            avatar: info.avatar,
            goodFlukeCount: data.goodFlukeCount,
            badFlukeCount: data.badFlukeCount,
            flukeScore: data.goodFlukeCount - data.badFlukeCount,
            weeklyFlukes: data.weeklyFlukes,
          };
        })
        .sort((a, b) => b.flukeScore - a.flukeScore);

      res.json({ teams, currentWeek, completedWeeks });
    } catch (error) {
      console.error("Error calculating fluke tracker:", error);
      res.status(500).json({ error: "Failed to calculate fluke tracker" });
    }
  });
}
