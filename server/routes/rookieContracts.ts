// Rookie pay scale and assigning contracts by quartile.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { createHash } from "crypto";
import os from "os";
import { requireCommissioner } from "../security/guards";
import { getLeague, getLeagueRosters, getLeagueUsers, getNFLState, getAllPlayers } from "../sleeper";
import type { Position } from "../../shared/schema";
import {
  getEffectiveWeek,
  calculateQuartiles,
  getQuartile,
  fetchAllWeeklyStats,
  computeAdjustedPPGForPlayer,
} from "./shared";

export function registerRookieContractsRoutes(app: Express): void {
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

  app.post("/api/league/:leagueId/assign-contracts-by-quartile", async (req, res) => {
    if (!(await requireCommissioner(req, res))) return;
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
          // Allow assignment for all eligible players; re-signing from FA drops rookie contract tag (contractData below has isRookieContract: 0)
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
}
