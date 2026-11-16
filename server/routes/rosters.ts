// Transactions, trades, rosters and position depth.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getAllLeagueTransactions,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  type SleeperRoster,
  type SleeperLeagueUser,
} from "../sleeper";
import type { Transaction, PositionDepth, TradeHistoryItem, Position } from "../../shared/schema";
import {
  getTeamInitials,
  formatTimeAgo,
  calculateGrade,
  computePlayerValue,
  getEffectiveWeek,
} from "./shared";

export function registerRostersRoutes(app: Express): void {
  // Get recent transactions
  app.get("/api/sleeper/league/:leagueId/transactions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const [state, league] = await Promise.all([
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);
      const effectiveWeek = getEffectiveWeek(state, league);
      const [allTransactions, rosters, users, players] = await Promise.all([
        getAllLeagueTransactions(req.params.leagueId, effectiveWeek),
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
      const [state, league] = await Promise.all([
        getNFLState(),
        getLeague(req.params.leagueId).catch(() => null),
      ]);
      const effectiveWeek = getEffectiveWeek(state, league);
      const [allTransactions, rosters, users, players] = await Promise.all([
        getAllLeagueTransactions(req.params.leagueId, effectiveWeek),
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
          
          const teamAName = user1?.metadata?.team_name || user1?.display_name || `Team ${rosterId1}`;
          const teamBName = user2?.metadata?.team_name || user2?.display_name || `Team ${rosterId2}`;
          const teamA = {
            rosterId: rosterId1,
            name: teamAName,
            initials: getTeamInitials(teamAName),
            avatar: user1?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user1.avatar}` : null,
            assets: [] as TradeHistoryItem["teamA"]["assets"],
          };
          const teamB = {
            rosterId: rosterId2,
            name: teamBName,
            initials: getTeamInitials(teamBName),
            avatar: user2?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user2.avatar}` : null,
            assets: [] as TradeHistoryItem["teamB"]["assets"],
          };

          // Players Team A gave away (received by Team B)
          if (t.adds) {
            Object.entries(t.adds).forEach(([pid, toRosterId]) => {
              const player = players[pid];
              const playerName = player ? `${player.first_name} ${player.last_name}` : pid;
              const asset = { type: "player" as const, name: playerName, playerId: pid };
              if (toRosterId === rosterId2) {
                teamA.assets.push(asset);
              } else if (toRosterId === rosterId1) {
                teamB.assets.push(asset);
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

  // Get all team rosters with players for Trade Center (enriched with stats, position rank, avatar)
  app.get("/api/sleeper/league/:leagueId/all-rosters", async (req, res) => {
    try {
      const [league, nflState, rosters, users, players] = await Promise.all([
        getLeague(req.params.leagueId).catch(() => null),
        getNFLState().catch(() => null),
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getAllPlayers(),
      ]);
      const season = league?.season || nflState?.season || new Date().getFullYear().toString();
      const effectiveWeek = nflState && league ? getEffectiveWeek(nflState, league) : 1;
      const weeksPlayed = Math.max(1, effectiveWeek);

      const [seasonStats, histStats2024, histStats2023, histStats2022] = await Promise.all([
        getPlayerStats(season).catch(() => ({})),
        getPlayerStats("2024").catch(() => ({})),
        getPlayerStats("2023").catch(() => ({})),
        getPlayerStats("2022").catch(() => ({})),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const playerById = (pid: string) => players[pid] ?? players[String(pid)];
      const statsById = (pid: string) => (seasonStats as Record<string, Record<string, number>>)[pid] ?? (seasonStats as Record<string, Record<string, number>>)[String(pid)] ?? {};
      const histById = (pid: string, hist: Record<string, Record<string, number>>) => hist[pid] ?? hist[String(pid)] ?? {};
      const ptsFromStats = (s: Record<string, number>) => s?.pts_ppr ?? s?.pts_std ?? 0;

      const positionStats: Record<string, { pid: string; points: number }[]> = {};
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = playerById(pid);
          if (!player || !["QB", "RB", "WR", "TE"].includes(player.position)) return;
          const stats = statsById(pid);
          const points = ptsFromStats(stats);
          const pos = player.position;
          if (!positionStats[pos]) positionStats[pos] = [];
          positionStats[pos].push({ pid: String(pid), points });
        });
      });

      const positionRanks: Record<string, Map<string, { rank: number; total: number }>> = {};
      Object.entries(positionStats).forEach(([pos, arr]) => {
        const sorted = [...arr].sort((a, b) => b.points - a.points);
        const total = sorted.length;
        const rankMap = new Map<string, { rank: number; total: number }>();
        sorted.forEach((item, idx) => rankMap.set(item.pid, { rank: idx + 1, total }));
        positionRanks[pos] = rankMap;
      });

      const POSITIONS = ["QB", "RB", "WR", "TE"];
      const means: Record<string, number> = {};
      const stdDevs: Record<string, number> = {};
      for (const pos of POSITIONS) {
        const arr = positionStats[pos]?.map(x => x.points) ?? [];
        const n = arr.length;
        const mean = n > 0 ? arr.reduce((a, b) => a + b, 0) / n : 0;
        means[pos] = mean;
        const variance = n > 0 ? arr.reduce((s, x) => s + (x - mean) ** 2, 0) / n : 0;
        stdDevs[pos] = Math.sqrt(variance);
      }
      const maxMean = Math.max(...Object.values(means), 1);
      const maxStd = Math.max(...Object.values(stdDevs), 0.01);
      const positionMultipliers: Record<string, number> = {};
      for (const pos of POSITIONS) {
        const avgFactor = means[pos] / maxMean;
        const scarcityFactor = 1 + 0.3 * (stdDevs[pos] / maxStd);
        positionMultipliers[pos] = avgFactor * scarcityFactor;
      }

      let maxPtsInLeague = 0;
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = playerById(pid);
          if (!player || !["QB", "RB", "WR", "TE"].includes(player.position)) return;
          const pts = ptsFromStats(statsById(pid));
          if (pts > maxPtsInLeague) maxPtsInLeague = pts;
        });
      });

      let maxPtsInLeagueLastSeason = 0;
      rosters.forEach(roster => {
        (roster.players || []).forEach(pid => {
          const player = playerById(pid);
          if (!player || !["QB", "RB", "WR", "TE"].includes(player.position)) return;
          const pts = ptsFromStats(histById(pid, histStats2024 as Record<string, Record<string, number>>));
          if (pts > maxPtsInLeagueLastSeason) maxPtsInLeagueLastSeason = pts;
        });
      });

      const isOffseason = nflState?.season_type === "off" || nflState?.season_type === "post";

      const playoffWeekStart = (league as any)?.settings?.playoff_week_start ?? 15;
      const lastRegularWeek = playoffWeekStart - 1;
      const weeksToFetch = Math.max(0, Math.min(effectiveWeek - 1, lastRegularWeek));
      const matchupPromises = Array.from({ length: weeksToFetch }, (_, i) =>
        getLeagueMatchups(req.params.leagueId, i + 1).then(m => ({ week: i + 1, matchups: m })).catch(() => ({ week: i + 1, matchups: [] as any[] }))
      );
      const matchupResults = await Promise.all(matchupPromises);
      const gamesStartedByRosterAndPlayer = new Map<number, Map<string, number>>();
      matchupResults.forEach(({ matchups }) => {
        (matchups as any[]).forEach((m: { roster_id: number; starters?: string[] | null }) => {
          const starters = m.starters || [];
          starters.forEach((pid: string) => {
            const rid = m.roster_id;
            if (!gamesStartedByRosterAndPlayer.has(rid)) gamesStartedByRosterAndPlayer.set(rid, new Map());
            const playerMap = gamesStartedByRosterAndPlayer.get(rid)!;
            playerMap.set(String(pid), (playerMap.get(String(pid)) ?? 0) + 1);
          });
        });
      });

      const teamRosters = rosters.map(roster => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        const teamInitials = getTeamInitials(teamName);
        const teamAvatar = user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;

        const rosterPlayers = (roster.players || [])
          .map(pid => {
            const player = playerById(pid);
            if (!player) return null;
            if (!["QB", "RB", "WR", "TE"].includes(player.position)) return null;
            const stats = statsById(pid);
            const points = ptsFromStats(stats);
            const pr = positionRanks[player.position]?.get(String(pid));
            const positionPercentile = pr && pr.total > 0 ? 1 - (pr.rank - 1) / pr.total : 0.5;
            const h2022 = histById(pid, histStats2022 as Record<string, Record<string, number>>);
            const h2023 = histById(pid, histStats2023 as Record<string, Record<string, number>>);
            const h2024 = histById(pid, histStats2024 as Record<string, Record<string, number>>);
            const historicalPts = (ptsFromStats(h2022) > 0 || ptsFromStats(h2023) > 0 || ptsFromStats(h2024) > 0)
              ? { y1: ptsFromStats(h2022), y2: ptsFromStats(h2023), y3: ptsFromStats(h2024) }
              : null;
            const performancePoints = isOffseason ? ptsFromStats(h2024) : points;
            const maxPtsForPerformance = isOffseason ? Math.max(maxPtsInLeagueLastSeason, 1) : Math.max(maxPtsInLeague, 1);
            const baseValue = computePlayerValue({
              positionPercentile,
              seasonPoints: points,
              performancePoints,
              maxPtsForPerformance,
              age: player.age ?? null,
              injuryStatus: player.injury_status ?? null,
              position: player.position,
              historicalPts,
              maxPtsInLeague: Math.max(maxPtsInLeague, 1),
            });
            const mult = positionMultipliers[player.position] ?? 1;
            const tradeValue = Math.round(baseValue * mult * 10) / 10;
            return {
              id: pid,
              name: player.full_name || `${player.first_name} ${player.last_name}`,
              position: player.position,
              team: player.team || "FA",
              seasonPoints: Math.round(points * 10) / 10,
              weeklyAvg: weeksPlayed > 0 ? Math.round((points / weeksPlayed) * 10) / 10 : 0,
              positionRank: pr?.rank ?? null,
              positionRankTotal: pr?.total ?? null,
              age: player.age ?? null,
              yearsExp: player.years_exp ?? null,
              injuryStatus: player.injury_status ?? null,
              tradeValue,
              gamesStarted: gamesStartedByRosterAndPlayer.get(roster.roster_id)?.get(String(pid)) ?? 0,
            };
          })
          .filter((p): p is NonNullable<typeof p> => p !== null);

        return {
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          teamName,
          teamInitials,
          teamAvatar,
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

      // Position strength vs league: rank each roster by total PPG per position (QB, RB, WR, TE, K, DEF)
      const totalTeams = rosters.length;
      const positionRanks: Record<string, { rank: number; totalTeams: number; totalPpg: number }> = {};
      const positionsForStrength = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
      positionsForStrength.forEach(pos => {
        const rosterTotals: { rosterId: number; ownerId: string; totalPpg: number }[] = rosters.map(r => {
          // Average PPG of this roster's scoring players at the position (talent over pure depth)
          let sumPpg = 0;
          let scorers = 0;
          (r.players || []).forEach(pid => {
            const player = players[pid];
            if (!player || player.position !== pos) return;
            const ppg = playerPPG.get(pid) || 0;
            if (ppg > 0) {
              sumPpg += ppg;
              scorers++;
            }
          });
          const totalPpg = scorers > 0 ? sumPpg / scorers : 0;
          return { rosterId: r.roster_id, ownerId: r.owner_id, totalPpg };
        });
        rosterTotals.sort((a, b) => b.totalPpg - a.totalPpg || a.rosterId - b.rosterId);
        let rank = 1;
        let prevPpg = -1;
        let userRank = 0;
        let userTotalPpg = 0;
        for (let i = 0; i < rosterTotals.length; i++) {
          if (rosterTotals[i].totalPpg !== prevPpg) {
            rank = i + 1;
            prevPpg = rosterTotals[i].totalPpg;
          }
          if (rosterTotals[i].ownerId === req.params.userId) {
            userRank = rank;
            userTotalPpg = Math.round(rosterTotals[i].totalPpg * 10) / 10;
            break;
          }
        }
        const userHasPosition = depthData[pos] || (userRoster.players || []).some(pid => players[pid]?.position === pos);
        if (userHasPosition && userRank > 0) {
          positionRanks[pos] = { rank: userRank, totalTeams, totalPpg: userTotalPpg };
        }
      });

      res.json({ ...depthData, positionRanks });
    } catch (error) {
      console.error("Error fetching depth analysis:", error);
      res.status(500).json({ error: "Failed to fetch depth analysis" });
    }
  });
}
