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

  // Get league standings
  app.get("/api/sleeper/league/:leagueId/standings", async (req, res) => {
    try {
      const userId = req.query.userId as string;
      const [rosters, users] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const standings: TeamStanding[] = rosters
        .map((roster) => {
          const user = userMap.get(roster.owner_id);
          const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
          const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
          const pointsAgainst = (roster.settings.fpts_against || 0) + (roster.settings.fpts_against_decimal || 0) / 100;
          
          return {
            rosterId: roster.roster_id,
            rank: 0,
            name: teamName,
            initials: getTeamInitials(teamName),
            ownerId: roster.owner_id,
            wins: roster.settings.wins,
            losses: roster.settings.losses,
            ties: roster.settings.ties,
            pointsFor,
            pointsAgainst,
            isUser: roster.owner_id === userId,
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

  // Get detailed matchup for a user's team with full roster information
  app.get("/api/sleeper/league/:leagueId/matchup-detail", async (req, res) => {
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

      // Boom-bust variance factors by position (based on typical fantasy football volatility)
      // Higher values = more volatile/boom-bust potential
      const positionVariance: Record<string, { boomMultiplier: number; bustMultiplier: number }> = {
        QB: { boomMultiplier: 1.35, bustMultiplier: 0.65 },
        RB: { boomMultiplier: 1.50, bustMultiplier: 0.50 },
        WR: { boomMultiplier: 1.55, bustMultiplier: 0.45 },
        TE: { boomMultiplier: 1.60, bustMultiplier: 0.40 },
        K: { boomMultiplier: 1.30, bustMultiplier: 0.70 },
        DEF: { boomMultiplier: 1.45, bustMultiplier: 0.55 },
      };

      // Position baseline averages for boom/bust calculations when no points yet
      const positionBaselines: Record<string, number> = {
        QB: 18,
        RB: 12,
        WR: 11,
        TE: 8,
        K: 8,
        DEF: 7,
      };

      const buildPlayerInfo = (playerId: string, points: number = 0) => {
        const player = players[playerId];
        const position = player?.position || "FLEX";
        const variance = positionVariance[position] || { boomMultiplier: 1.45, bustMultiplier: 0.55 };
        
        // Use actual points if available, otherwise use position baseline
        const basePoints = points > 0 ? points : (positionBaselines[position] || 10);
        
        // Calculate boom (ceiling) and bust (floor) based on position variance
        const boom = Math.round(basePoints * variance.boomMultiplier * 10) / 10;
        const bust = Math.round(basePoints * variance.bustMultiplier * 10) / 10;

        return {
          id: playerId,
          name: player ? `${player.first_name} ${player.last_name}` : playerId,
          position,
          team: player?.team || "",
          points,
          boom,
          bust,
        };
      };

      const buildDetailedMatchupTeam = (matchup: typeof userMatchup, roster: SleeperRoster) => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        
        const starterIds = matchup.starters || [];
        const playerPoints = matchup.players_points || {};
        
        const starters = starterIds.map(pid => buildPlayerInfo(pid, playerPoints[pid] || 0));
        
        const benchIds = (roster.players || []).filter(pid => !starterIds.includes(pid));
        const bench = benchIds.map(pid => buildPlayerInfo(pid, playerPoints[pid] || 0));

        return {
          rosterId: roster.roster_id,
          name: teamName,
          initials: getTeamInitials(teamName),
          score: matchup.points || 0,
          record: `${roster.settings.wins}-${roster.settings.losses}`,
          starters,
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

      const depthData: Record<string, PositionDepth> = {};

      ["QB", "RB", "WR", "TE"].forEach(pos => {
        const posPlayers = (userRoster.players || [])
          .map(pid => {
            const player = players[pid];
            if (!player || player.position !== pos) return null;
            
            const stats = seasonStats[pid];
            const points = stats?.pts_ppr || stats?.pts_std || 0;
            const median = positionMedians[pos] || 1;
            const percentAboveMedian = ((points - median) / median) * 100;
            
            return {
              id: pid,
              name: player.full_name || `${player.first_name} ${player.last_name}`,
              team: player.team,
              points,
              medianPoints: median,
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
      const [rosters, users, league, nflState] = await Promise.all([
        getLeagueRosters(req.params.leagueId),
        getLeagueUsers(req.params.leagueId),
        getLeague(req.params.leagueId),
        getNFLState(),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const playoffTeams = league.settings.playoff_teams || 6;
      const playoffWeekStart = (league.settings as any).playoff_week_start || 15;
      const currentWeek = nflState.week;
      const regularSeasonWeeks = playoffWeekStart - 1;
      const remainingWeeks = Math.max(0, regularSeasonWeeks - currentWeek);

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

      // Build team data with current standings
      const teams = rosters.map(roster => {
        const user = userMap.get(roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`;
        const pointsFor = roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100;
        const gamesPlayed = roster.settings.wins + roster.settings.losses + roster.settings.ties;
        const avgPoints = gamesPlayed > 0 ? pointsFor / gamesPlayed : 100;
        
        // Get division from roster settings (Sleeper API stores it at roster.settings.division)
        // Note: Division is 1-indexed in Sleeper (1, 2, etc.) or undefined if not set
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
          stdDev: avgPoints * 0.2, // Estimate standard deviation as 20% of average
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

      // Monte Carlo simulation
      const SIMULATIONS = 10000;
      const results = new Map<number, { 
        oneSeed: number; 
        divisionWinner: number; 
        makePlayoffs: number;
        avgFinalWins: number;
      }>();

      teams.forEach(t => results.set(t.rosterId, { 
        oneSeed: 0, 
        divisionWinner: 0, 
        makePlayoffs: 0,
        avgFinalWins: 0,
      }));

      for (let sim = 0; sim < SIMULATIONS; sim++) {
        // Simulate remaining games for each team
        const simResults = teams.map(team => {
          let simWins = team.wins;
          
          // Simulate remaining games
          for (let week = 0; week < remainingWeeks; week++) {
            // Random opponent strength factor
            const opponentStrength = 0.4 + Math.random() * 0.4; // 0.4 to 0.8
            const winProb = team.avgPoints / (team.avgPoints + opponentStrength * 100);
            
            if (Math.random() < winProb) {
              simWins++;
            }
          }

          // Add some randomness to points for (for tiebreaker)
          const simPointsFor = team.pointsFor + (Math.random() - 0.5) * team.avgPoints * remainingWeeks;

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

        // Track average wins
        simResults.forEach(sr => {
          const r = results.get(sr.rosterId)!;
          r.avgFinalWins += sr.simWins;
        });
      }

      // Convert to percentages and format response
      // Sort by same criteria as dashboard standings: record → points scored → H2H
      const predictions = teams
        .map(team => {
          const r = results.get(team.rosterId)!;
          return {
            rosterId: team.rosterId,
            ownerId: team.ownerId,
            name: team.name,
            initials: team.initials,
            currentWins: team.wins,
            currentLosses: team.losses,
            pointsFor: team.pointsFor,
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

  app.post("/api/rule-suggestions/:id/vote", async (req, res) => {
    try {
      const { voterId, voteType } = req.body;
      if (!voterId || !voteType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const suggestion = await storage.voteRuleSuggestion(req.params.id, voterId, voteType);
      if (!suggestion) {
        return res.status(404).json({ error: "Suggestion not found" });
      }
      res.json(suggestion);
    } catch (error) {
      console.error("Error voting on rule suggestion:", error);
      res.status(500).json({ error: "Failed to vote on rule suggestion" });
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

  app.post("/api/league/:leagueId/awards/:season/:awardType/nominate", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { playerId, playerName, playerPosition, playerTeam, nominatedBy, nominatedByName } = req.body;
      
      if (awardType !== "mvp" && awardType !== "roy") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      if (!playerId || !playerName || !nominatedBy || !nominatedByName) {
        return res.status(400).json({ error: "Missing required fields" });
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
      });
      res.json(nomination);
    } catch (error) {
      console.error("Error creating award nomination:", error);
      res.status(500).json({ error: "Failed to create award nomination" });
    }
  });

  app.post("/api/awards/:id/vote", async (req, res) => {
    try {
      const { voterId } = req.body;
      if (!voterId) {
        return res.status(400).json({ error: "Missing voter ID" });
      }
      const nomination = await storage.voteAwardNomination(req.params.id, voterId);
      if (!nomination) {
        return res.status(404).json({ error: "Nomination not found" });
      }
      res.json(nomination);
    } catch (error) {
      console.error("Error voting on award nomination:", error);
      res.status(500).json({ error: "Failed to vote on award nomination" });
    }
  });

  return httpServer;
}
