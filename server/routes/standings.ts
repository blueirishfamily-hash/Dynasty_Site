// Standings and standings analysis.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { computeStandingsAnalysis } from "../standingsAnalysis";
import type { AnalysisTeam } from "../../shared/standingsAnalysis";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getLeagueTransactions,
  getNFLState,
  getAllPlayers,
  type SleeperLeagueUser,
  type SleeperTransaction,
  type SleeperMatchup,
} from "../sleeper";
import type { TeamStanding } from "../../shared/schema";
import {
  getTeamInitials,
  getEffectiveWeek,
} from "./shared";

export function registerStandingsRoutes(app: Express): void {
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
      
      // Once regular season is complete (playoffs started or post/off), include all 14 weeks in Max PF
      const regularSeasonComplete =
        nflState.season_type === "post" ||
        nflState.season_type === "off" ||
        currentWeek >= playoffWeekStart;
      const completedRegularSeasonWeeks = regularSeasonComplete
        ? regularSeasonWeeks
        : Math.max(1, Math.min(currentWeek - 1, regularSeasonWeeks));
      if (regularSeasonComplete) {
        console.log("[Max PF] Regular season complete, including week 14");
      }
      
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

      // Build points per roster per week from matchups (for previous-week rank)
      const pointsByRosterByWeek = new Map<number, Map<number, number>>();
      rosters.forEach(r => pointsByRosterByWeek.set(r.roster_id, new Map()));
      for (const { week, matchups } of allMatchups) {
        for (const m of matchups) {
          const rid = m.roster_id;
          const pts = typeof m.points === "number" ? m.points : 0;
          pointsByRosterByWeek.get(rid)?.set(week, pts);
        }
      }
      const cumulativePointsThroughWeek = (rosterId: number, throughWeek: number): number => {
        let sum = 0;
        const byWeek = pointsByRosterByWeek.get(rosterId);
        if (!byWeek) return 0;
        for (let w = 1; w <= throughWeek; w++) {
          sum += byWeek.get(w) ?? 0;
        }
        return sum;
      };

      const previousWeek = currentWeek - 1;
      let previousRankByRoster: Map<number, number> | null = null;
      if (previousWeek >= 1) {
        const prevStandings = rosters.map(r => {
          const history = matchupHistory.get(r.roster_id) || [];
          const winsThroughPrev = history.filter(h => h.week <= previousWeek && h.won === true).length;
          const pointsThroughPrev = cumulativePointsThroughWeek(r.roster_id, previousWeek);
          return { rosterId: r.roster_id, wins: winsThroughPrev, pointsFor: pointsThroughPrev };
        });
        prevStandings.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          return b.pointsFor - a.pointsFor;
        });
        previousRankByRoster = new Map();
        prevStandings.forEach((t, idx) => previousRankByRoster!.set(t.rosterId, idx + 1));
      }

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

      // Build roster composition per week (transactions apply forward from opening day)
      const buildRosterHistory = () => {
        const rosterState = new Map<number, Set<string>>();
        const rosterWeekly = new Map<number, Map<number, string[]>>();

        // Initialize with current rosters (players + taxi + reserve) for Max PF pool
        rosters.forEach(r => {
          const allPlayers = [
            ...(r.players || []),
            ...(r.taxi || []),
            ...(r.reserve || []),
          ];
          rosterState.set(r.roster_id, new Set(allPlayers));
          rosterWeekly.set(r.roster_id, new Map());
        });

        // Reverse-apply all in-season transactions to get opening day roster
        const allTx = weeklyTransactions
          .flatMap(({ week, transactions }) => transactions.map(t => ({ week, t })))
          .filter(({ t }) => t.status === "complete")
          .sort((a, b) =>
            b.week !== a.week
              ? b.week - a.week
              : (b.t.status_updated || 0) - (a.t.status_updated || 0)
          );
        for (const { t } of allTx) {
          Object.entries(t.adds || {}).forEach(([playerId, rosterId]) => {
            rosterState.get(Number(rosterId))?.delete(playerId);
          });
          Object.entries(t.drops || {}).forEach(([playerId, rosterId]) => {
            rosterState.get(Number(rosterId))?.add(playerId);
          });
        }

        // Forward pass: apply week 1..N transactions and snapshot per week (now from opening day)
        for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
          const transactionsForWeek = weeklyTransactions.find(w => w.week === week)?.transactions || [];

          transactionsForWeek
            .filter(t => t.status === "complete")
            .forEach(t => {
              const adds = t.adds || {};
              const drops = t.drops || {};

              Object.entries(adds).forEach(([playerId, rosterId]) => {
                const state = rosterState.get(Number(rosterId));
                if (state) state.add(playerId);
              });

              Object.entries(drops).forEach(([playerId, rosterId]) => {
                const state = rosterState.get(Number(rosterId));
                if (state) state.delete(playerId);
              });
            });

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

      // Build per-week roster using matchup.players (source of truth) with rosterHistory as fallback
      const rosterWeeklyRoster = new Map<number, Map<number, string[]>>();
      rosters.forEach(roster => {
        rosterWeeklyRoster.set(roster.roster_id, new Map());
      });
      for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
        const weekMatchups = matchupByRosterAndWeek.get(week) || new Map();
        rosters.forEach(roster => {
          const matchup = weekMatchups.get(roster.roster_id);
          const weekRoster =
            (matchup?.players && matchup.players.length > 0)
              ? matchup.players
              : (rosterHistory.get(roster.roster_id)?.get(week) || []);
          rosterWeeklyRoster.get(roster.roster_id)!.set(week, weekRoster);
        });
      }

      // Build weekly player points per roster from matchup data
      const rosterWeeklyPoints = new Map<number, Map<number, Record<string, number>>>();
      for (let week = 1; week <= completedRegularSeasonWeeks; week++) {
        const weekMatchups = matchupByRosterAndWeek.get(week) || new Map();
        rosters.forEach(roster => {
          const weekRoster = rosterWeeklyRoster.get(roster.roster_id)?.get(week) || [];
          const matchup = weekMatchups.get(roster.roster_id);
          const playersPoints = matchup?.players_points || {};
          if (!rosterWeeklyPoints.has(roster.roster_id)) {
            rosterWeeklyPoints.set(roster.roster_id, new Map());
          }
          const weekPoints: Record<string, number> = {};
          weekRoster.forEach(playerId => {
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
        const weeklyMaxPoints: number[] = []; // Track per-week values for validation

        // Sum optimal weekly lineup points for all completed weeks up to week 14
        for (let week = 1; week <= weeksToSum; week++) {
          const weekRoster = rosterWeeklyRoster.get(roster.roster_id)?.get(week) || [];
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
        .map((team, index) => ({
          ...team,
          rank: index + 1,
          previousRank: previousWeek >= 1 && previousRankByRoster
            ? (previousRankByRoster.get(team.rosterId) ?? index + 1)
            : null,
        }));

      res.json(standings);
    } catch (error) {
      console.error("Error fetching standings:", error);
      res.status(500).json({ error: "Failed to fetch standings" });
    }
  });

  // Cumulative points race + schedule simulator data for the standings page
  app.get("/api/sleeper/league/:leagueId/standings-analysis", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const userId = req.query.userId as string | undefined;
      const [rosters, users, nflState, league] = await Promise.all([
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getNFLState(),
        getLeague(leagueId).catch(() => null),
      ]);

      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const regularSeasonWeeks = playoffWeekStart - 1;
      const currentWeek = getEffectiveWeek(nflState, league);
      const isPastSeason =
        !!league?.season && parseInt(league.season, 10) < parseInt(String(nflState.season), 10);
      const regularSeasonComplete =
        isPastSeason ||
        league?.status === "complete" ||
        nflState.season_type === "post" ||
        nflState.season_type === "off" ||
        currentWeek >= playoffWeekStart;
      // Skip the in-progress week so partial scores don't distort results
      const lastWeek = regularSeasonComplete
        ? regularSeasonWeeks
        : Math.max(0, Math.min(currentWeek - 1, regularSeasonWeeks));

      const weekly = await Promise.all(
        Array.from({ length: lastWeek }, (_, i) => i + 1).map((week) =>
          getLeagueMatchups(leagueId, week)
            .then((matchups) => ({ week, matchups }))
            .catch(() => ({ week, matchups: [] as SleeperMatchup[] })),
        ),
      );

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach((u) => userMap.set(u.user_id, u));

      const teams: AnalysisTeam[] = rosters.map((roster) => {
        const owner = userMap.get(roster.owner_id);
        const name = owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`;
        return {
          rosterId: roster.roster_id,
          name,
          initials: getTeamInitials(name),
          avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
          isUser: !!userId && roster.owner_id === userId,
        };
      });

      res.json(computeStandingsAnalysis(teams, weekly));
    } catch (error) {
      console.error("Error computing standings analysis:", error);
      res.status(500).json({ error: "Failed to compute standings analysis" });
    }
  });
}
