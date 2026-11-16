// Weekly report, playoff predictions, bracket and playoff game detail.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { buildWeeklyReport, BYE_WEEKS, type ReportInput, type ReportPlayer, type ReportTeam } from "../weeklyReport";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  getWinnersBracket,
  getLosersBracket,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperMatchup,
} from "../sleeper";
import type { Position } from "../../shared/schema";
import {
  getTeamInitials,
  getEffectiveWeek,
  playerStatsCache,
  STATS_CACHE_TTL,
} from "./shared";
import { isCommissioner } from "../middleware/commissioner";

export function registerPlayoffsRoutes(app: Express): void {
  // Playoff predictor - simulate remaining season
  // Commissioner-only weekly report data (results for week-1, matchups and projections for week).
  app.get("/api/sleeper/league/:leagueId/weekly-report", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.query.userId as string | undefined;
      if (!userId || !(await isCommissioner(userId, leagueId))) {
        return res.status(403).json({ error: "Only the commissioner can export the weekly report." });
      }
      const [league, rosters, users, players, nflState] = await Promise.all([
        getLeague(leagueId).catch(() => null),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getAllPlayers(),
        getNFLState(),
      ]);
      const week = parseInt(req.query.week as string, 10) || getEffectiveWeek(nflState, league);
      if (week < 2) {
        return res.status(400).json({ error: "No completed week to report on yet." });
      }

      const matchupsByWeek: Record<number, SleeperMatchup[]> = {};
      await Promise.all(
        Array.from({ length: week }, (_, i) => i + 1).map(async w => {
          matchupsByWeek[w] = await getLeagueMatchups(leagueId, w).catch(() => []);
        }),
      );

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));
      const teams: ReportTeam[] = rosters.map(r => {
        const u = userMap.get(r.owner_id);
        const name = u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`;
        return {
          rosterId: r.roster_id,
          name,
          initials: getTeamInitials(name),
          avatar: u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null,
          playerIds: r.players || [],
        };
      });

      const playerRecord: Record<string, ReportPlayer> = {};
      for (const [id, p] of Object.entries(players)) {
        playerRecord[id] = {
          id,
          name: `${p.first_name} ${p.last_name}`,
          position: p.position,
          team: p.team || "",
          injuryStatus: p.injury_status || null,
        };
      }

      const input: ReportInput = {
        week,
        season: league?.season || nflState.season,
        leagueName: league?.name || "League",
        rosterPositions: league?.roster_positions || [],
        teams,
        matchupsByWeek,
        players: playerRecord,
        byeTeams: BYE_WEEKS[week] || [],
      };
      res.json(buildWeeklyReport(input));
    } catch (error) {
      console.error("[Weekly Report] Failed to build report:", error);
      res.status(500).json({ error: "Failed to build the weekly report" });
    }
  });

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
        playoffWeekStart,
        currentWeek,
      });
    } catch (error) {
      console.error("Error fetching playoff bracket:", error);
      res.status(500).json({ error: "Failed to fetch playoff bracket" });
    }
  });

  // One playoff game in detail: both teams' starters with points, slot by slot. Read-only (Sleeper data).
  app.get("/api/sleeper/league/:leagueId/playoff-game", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const rosterA = parseInt(String(req.query.rosterA), 10);
      const rosterB = parseInt(String(req.query.rosterB), 10);
      const weekParam = parseInt(String(req.query.week), 10);
      if (!Number.isInteger(rosterA) || !Number.isInteger(rosterB)) {
        return res.status(400).json({ error: "rosterA and rosterB are required" });
      }
      const [league, users, rosters, players] = await Promise.all([
        getLeague(leagueId).catch(() => null),
        getLeagueUsers(leagueId),
        getLeagueRosters(leagueId),
        getAllPlayers(),
      ]);
      const start = (league?.settings as any)?.playoff_week_start || 15;
      const weeks = Array.from(new Set([...(Number.isInteger(weekParam) ? [weekParam] : []), start, start + 1, start + 2]));

      let found: { week: number; a: SleeperMatchup; b: SleeperMatchup } | null = null;
      for (const week of weeks) {
        const matchups = await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]);
        const a = matchups.find(m => m.roster_id === rosterA);
        const b = matchups.find(m => m.roster_id === rosterB);
        if (a && b && a.matchup_id === b.matchup_id) {
          found = { week, a, b };
          break;
        }
      }
      if (!found) return res.status(404).json({ error: "No game found for these two teams" });

      const slots = (league?.roster_positions ?? []).filter(pos => pos !== "BN" && pos !== "IR" && pos !== "TAXI");
      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));
      const side = (m: SleeperMatchup) => {
        const roster = rosters.find(r => r.roster_id === m.roster_id);
        const user = roster ? userMap.get(roster.owner_id) : undefined;
        const name = user?.metadata?.team_name || user?.display_name || `Team ${m.roster_id}`;
        const starters = (m.starters ?? []).map((id, i) => {
          const pl = players[id];
          const label = pl ? (pl.full_name || `${pl.first_name} ${pl.last_name}`.trim()) : id === "0" ? "Empty slot" : id;
          return {
            slot: slots[i] ?? "FLEX",
            playerId: id,
            name: label,
            position: pl?.position ?? null,
            team: pl?.team ?? null,
            points: m.starters_points?.[i] ?? 0,
          };
        });
        return { rosterId: m.roster_id, name, total: m.points || 0, starters };
      };
      res.json({ week: found.week, slots, teams: [side(found.a), side(found.b)] });
    } catch (error) {
      console.error("Error fetching playoff game detail:", error);
      res.status(500).json({ error: "Failed to fetch playoff game detail" });
    }
  });
}
