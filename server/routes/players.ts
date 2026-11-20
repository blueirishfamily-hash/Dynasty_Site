// Players: draft position, FA production, rankings, career, search and detail.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getNFLState,
  getAllPlayers,
  getPlayerStats,
  getPlayerProjections,
  getLeagueDrafts,
  getDraftPicks,
} from "../sleeper";
import { mvpCandidates, positionTopWeeks, type Candidate } from "../awardCandidates";
import {
  getEffectiveWeek,
  WeeklyStatsCache,
  fetchAllWeeklyStats,
} from "./shared";

// The league's played weeks (a week nobody has scored in has not been played), kept for 10 minutes because new
// weeks keep arriving. Rookie of the Year and MVP nominee lists are both built from it.
const playedWeeksCache = new Map<string, { at: number; weeks: Array<{ week: number; matchups: any[] }> }>();
async function playedWeeks(leagueId: string): Promise<Array<{ week: number; matchups: any[] }>> {
  const hit = playedWeeksCache.get(leagueId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.weeks;
  const numbers = Array.from({ length: 18 }, (_, i) => i + 1);
  const weeks: Array<{ week: number; matchups: any[] }> = [];
  for (let i = 0; i < numbers.length; i += 6) {
    const chunk = await Promise.all(numbers.slice(i, i + 6).map(async w => ({ week: w, matchups: (await getLeagueMatchups(leagueId, w).catch(() => [])) as any[] })));
    weeks.push(...chunk.filter(c => c.matchups.some(m => (m.points ?? 0) > 0)));
  }
  playedWeeksCache.set(leagueId, { at: Date.now(), weeks });
  return weeks;
}

// Each player's fantasy points and games while on a team's roster in this league's played weeks.
async function leaguePlayerGames(leagueId: string): Promise<Map<string, { points: number; games: number }>> {
  const stats = new Map<string, { points: number; games: number }>();
  for (const { matchups } of await playedWeeks(leagueId)) {
    for (const m of matchups) {
      const pts = m.players_points ?? {};
      for (const id of (m.players ?? []) as string[]) {
        const cur = stats.get(String(id)) ?? { points: 0, games: 0 };
        cur.points += Number(pts[id]) || 0;
        cur.games += 1;
        stats.set(String(id), cur);
      }
    }
  }
  return stats;
}

// MVP nominees: players who ranked in the top 12 at their position (QB, RB, WR, TE) in at least 3 regular-season
// weeks, among players on a roster that week. Revisit the numbers here if the commissioner wants a different bar.
export const MVP_TOP_N = 12;
export const MVP_MIN_TOP_WEEKS = 3;
async function leagueMvpPool(leagueId: string, positionOf: (id: string) => string | null | undefined): Promise<Map<string, Candidate>> {
  const league = await getLeague(leagueId).catch(() => null);
  const playoffStart = Number((league?.settings as any)?.playoff_week_start) || 15;
  const regular = (await playedWeeks(leagueId)).filter(w => w.week < playoffStart).map(w => w.matchups);
  return mvpCandidates(positionTopWeeks(regular, positionOf, ["QB", "RB", "WR", "TE"], MVP_TOP_N), MVP_MIN_TOP_WEEKS);
}

export function registerPlayersRoutes(app: Express): void {
  // Get draft position for a player from historical draft snapshots (2024/2023) or most recent completed rookie draft
  app.get("/api/league/:leagueId/player/:playerId/draft-position", async (req, res) => {
    try {
      const { leagueId, playerId } = req.params;
      const pid = String(playerId);

      // 1. Try historical draft snapshots first (2024 then 2023; current league then old league if advanced)
      const [snapshots2024Current, snapshots2023Current] = await Promise.all([
        storage.getDraftSnapshots(leagueId, "2024"),
        storage.getDraftSnapshots(leagueId, "2023"),
      ]);
      let snapshots2024Old: Awaited<ReturnType<typeof storage.getDraftSnapshots>> = [];
      let snapshots2023Old: Awaited<ReturnType<typeof storage.getDraftSnapshots>> = [];
      const migration = await storage.getMigrationByNewLeagueId(leagueId);
      if (migration && migration.oldLeagueId !== leagueId) {
        [snapshots2024Old, snapshots2023Old] = await Promise.all([
          storage.getDraftSnapshots(migration.oldLeagueId, "2024"),
          storage.getDraftSnapshots(migration.oldLeagueId, "2023"),
        ]);
      }
      const snapshotBatches: { snapshots: typeof snapshots2024Current }[] = [
        { snapshots: snapshots2024Current },
        { snapshots: snapshots2023Current },
        { snapshots: snapshots2024Old },
        { snapshots: snapshots2023Old },
      ];
      for (const { snapshots } of snapshotBatches) {
        for (const snapshot of snapshots) {
          try {
            const picks = JSON.parse(snapshot.picksData) as Array<{ player_id: string; round: number; draft_slot: number }>;
            const pick = picks.find((p: { player_id: string }) => String(p.player_id) === pid);
            if (pick) {
              return res.json({
                round: pick.round,
                draftSlot: pick.draft_slot,
                season: snapshot.season,
                draftId: snapshot.draftId,
              });
            }
          } catch {
            // Malformed picksData: skip this snapshot
          }
        }
      }

      // 2. Fallback: Sleeper API
      const drafts = await getLeagueDrafts(leagueId);
      const completedDrafts = drafts
        .filter(d => d.status === "complete" && ["rookie", "linear", "snake"].includes(d.type))
        .sort((a, b) => parseInt(b.season) - parseInt(a.season));
      for (const draft of completedDrafts) {
        const picks = await getDraftPicks(draft.draft_id);
        const playerPick = picks.find(p => String(p.player_id) === pid);
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

  // Total fantasy points per player over the current and previous season (PPR), used to rank free agents.
  app.get("/api/league/:leagueId/fa-production", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const [nflState, league] = await Promise.all([getNFLState(), getLeague(leagueId)]);
      let currentSeason = String(league?.season || nflState.season);
      let previousSeason = String(parseInt(currentSeason) - 1);
      let [currentWeekly, previousWeekly] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);
      // Right after the rollover the new season has no games yet: use the two most recent seasons that do.
      const hasPoints = (weekly: WeeklyStatsCache) =>
        weekly.some(week => Object.values(week).some((s: any) => (s?.pts_ppr || s?.pts_half_ppr || s?.pts_std || 0) > 0));
      if (!hasPoints(currentWeekly)) {
        currentSeason = previousSeason;
        previousSeason = String(parseInt(currentSeason) - 1);
        currentWeekly = previousWeekly;
        previousWeekly = await fetchAllWeeklyStats(previousSeason);
      }
      const totalsFor = (weekly: WeeklyStatsCache) => {
        const out: Record<string, { pts: number; games: number }> = {};
        for (const week of weekly) {
          for (const [playerId, stats] of Object.entries(week)) {
            const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
            if (pts <= 0) continue;
            const entry = out[playerId] || (out[playerId] = { pts: 0, games: 0 });
            entry.pts += pts;
            entry.games += 1;
          }
        }
        return out;
      };
      const cur = totalsFor(currentWeekly);
      const prev = totalsFor(previousWeekly);
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const players: Record<string, { current: number; previous: number; currentGames: number; previousGames: number }> = {};
      for (const id of new Set([...Object.keys(cur), ...Object.keys(prev)])) {
        players[id] = {
          current: round1(cur[id]?.pts ?? 0),
          previous: round1(prev[id]?.pts ?? 0),
          currentGames: cur[id]?.games ?? 0,
          previousGames: prev[id]?.games ?? 0,
        };
      }
      res.json({ season: currentSeason, previousSeason, players });
    } catch (error) {
      console.error("Error computing FA production:", error);
      res.status(500).json({ error: "Failed to compute production" });
    }
  });

  // Search players (for nomination lookup)
  // Player career history: multi-season stats + fantasy team ownership
  app.get("/api/sleeper/league/:leagueId/player/:playerId/career", async (req, res) => {
    try {
      const { leagueId, playerId } = req.params;

      const [currentLeague, allPlayers, nflState] = await Promise.all([
        getLeague(leagueId),
        getAllPlayers(),
        getNFLState(),
      ]);

      const player = allPlayers[playerId] ?? allPlayers[String(playerId)];
      if (!player) return res.status(404).json({ error: "Player not found" });

      const currentSeason = parseInt(currentLeague.season || nflState?.season || String(new Date().getFullYear()));
      const lookbackYears = 5;

      // Walk previous_league_id chain to gather per-season league IDs
      const leagueChain: { season: number; leagueId: string }[] = [];
      let walkId = leagueId;
      let walkLeague: any = currentLeague;
      for (let i = 0; i < lookbackYears; i++) {
        const season = currentSeason - i;
        leagueChain.push({ season, leagueId: walkId });
        const prevId = walkLeague?.previous_league_id;
        if (!prevId || prevId === "0") break;
        try {
          walkLeague = await getLeague(prevId);
          walkId = prevId;
        } catch {
          break;
        }
      }

      // Fetch rosters + users + stats for each season in parallel
      const seasonResults = await Promise.allSettled(
        leagueChain.map(async ({ season, leagueId: sId }) => {
          const [rosters, users, stats] = await Promise.all([
            getLeagueRosters(sId).catch(() => [] as any[]),
            getLeagueUsers(sId).catch(() => [] as any[]),
            getPlayerStats(String(season)).catch(() => ({} as Record<string, any>)),
          ]);

          const userMap = new Map(users.map((u: any) => [u.user_id, u]));

          // Find which roster the player was on (players, taxi, or reserve)
          const rosterWithPlayer = rosters.find((r: any) =>
            [...(r.players || []), ...(r.taxi || []), ...(r.reserve || [])].map(String).includes(String(playerId))
          );

          let teamName: string | null = null;
          let rosterId: number | null = null;
          let teamAvatar: string | null = null;
          if (rosterWithPlayer) {
            const user = userMap.get(rosterWithPlayer.owner_id);
            teamName = user?.metadata?.team_name || user?.display_name || `Team ${rosterWithPlayer.roster_id}`;
            rosterId = rosterWithPlayer.roster_id;
            teamAvatar = user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;
          }

          const playerStats = stats[playerId] ?? stats[String(playerId)] ?? {};
          const points = playerStats.pts_ppr ?? playerStats.pts_half_ppr ?? playerStats.pts_std ?? 0;
          const gamesPlayed = playerStats.gp ?? 0;

          return {
            season,
            points: Math.round(points * 10) / 10,
            ppg: gamesPlayed > 0 ? Math.round((points / gamesPlayed) * 10) / 10 : 0,
            gamesPlayed,
            teamName,
            rosterId,
            teamAvatar,
          };
        })
      );

      const seasons = seasonResults
        .map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { season: leagueChain[i].season, points: 0, ppg: 0, gamesPlayed: 0, teamName: null, rosterId: null, teamAvatar: null }
        )
        .filter(s => s.gamesPlayed > 0 || s.teamName !== null)
        .sort((a, b) => a.season - b.season);

      res.json({
        player: {
          id: playerId,
          name: player.full_name || `${player.first_name || ""} ${player.last_name || ""}`.trim(),
          position: player.position,
          team: player.team,
          age: player.age,
          yearsExp: player.years_exp,
          injuryStatus: player.injury_status,
          college: player.college,
        },
        seasons,
      });
    } catch (error) {
      console.error("Error fetching player career:", error);
      res.status(500).json({ error: "Failed to fetch player career data" });
    }
  });

  // Per-game career data: one entry for each completed fantasy matchup in
  // which the player appeared in a roster's starting lineup.
  app.get("/api/sleeper/league/:leagueId/player/:playerId/career-games", async (req, res) => {
    try {
      const { leagueId, playerId } = req.params;

      const [currentLeague, nflState] = await Promise.all([
        getLeague(leagueId),
        getNFLState(),
      ]);

      const currentSeason = parseInt(currentLeague.season || nflState?.season || String(new Date().getFullYear()));
      const lookbackYears = 5;

      // Walk previous_league_id chain (same as career endpoint)
      const leagueChain: { season: number; leagueId: string }[] = [];
      let walkId = leagueId;
      let walkLeague: any = currentLeague;
      for (let i = 0; i < lookbackYears; i++) {
        const season = currentSeason - i;
        leagueChain.push({ season, leagueId: walkId });
        const prevId = walkLeague?.previous_league_id;
        if (!prevId || prevId === "0") break;
        try {
          walkLeague = await getLeague(prevId);
          walkId = prevId;
        } catch {
          break;
        }
      }

      // Build each season's roster-to-team-name mapping. The weekly matchup
      // identifies the exact roster that started the player, including trades.
      const seasonTeamInfo = await Promise.allSettled(
        leagueChain.map(async ({ season, leagueId: sId }) => {
          const [rosters, users] = await Promise.all([
            getLeagueRosters(sId).catch(() => [] as any[]),
            getLeagueUsers(sId).catch(() => [] as any[]),
          ]);
          const userMap = new Map(users.map((u: any) => [u.user_id, u]));
          const teamNames = new Map<number, string>();
          rosters.forEach((roster: any) => {
            const user: any = userMap.get(roster.owner_id);
            teamNames.set(
              roster.roster_id,
              user?.metadata?.team_name || user?.display_name || `Team ${roster.roster_id}`,
            );
          });
          return { season, teamNames };
        })
      );

      const teamNamesBySeason = new Map<number, Map<number, string>>();
      seasonTeamInfo.forEach(r => {
        if (r.status === "fulfilled") teamNamesBySeason.set(r.value.season, r.value.teamNames);
      });

      // Sleeper matchup data is the source of truth for fantasy starts and
      // league-scoring points. Empty/future matchups are ignored.
      const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
      const allGames: { season: number; week: number; points: number; rosterId: number | null; teamName: string | null }[] = [];

      const nflSeasonYear = parseInt(String(nflState.season), 10);

      await Promise.allSettled(
        leagueChain.map(async ({ season, leagueId: seasonLeagueId }) => {
          const seasonLeague = await getLeague(seasonLeagueId).catch(() => currentLeague);
          const effectiveWeek =
            season < nflSeasonYear
              ? WEEKS[WEEKS.length - 1]
              : season > nflSeasonYear
                ? 0
                : getEffectiveWeek(nflState, seasonLeague);

          const weekResults = await Promise.allSettled(
            WEEKS.map(week => getLeagueMatchups(seasonLeagueId, week))
          );
          const teamNames = teamNamesBySeason.get(season);

          weekResults.forEach((r, idx) => {
            if (r.status !== "fulfilled") return;

            const week = WEEKS[idx];
            if (season === nflSeasonYear && week > effectiveWeek) return;
            if (season > nflSeasonYear) return;

            const matchup = r.value.find(entry =>
              (entry.starters || []).some(starterId => String(starterId) === String(playerId))
            );
            if (!matchup) return;

            const starters = matchup.starters || [];
            const starterIndex = starters.findIndex(starterId => String(starterId) === String(playerId));
            const hasPlayerPoints = Boolean(
              matchup.players_points &&
              Object.prototype.hasOwnProperty.call(matchup.players_points, String(playerId))
            );
            const hasStarterPoints = Boolean(
              matchup.starters_points &&
              starterIndex >= 0 &&
              starterIndex < matchup.starters_points.length
            );

            // Future weeks: excluded above. Current week: require Sleeper players_points (not lineup placeholders).
            if (season === nflSeasonYear && week === effectiveWeek) {
              if (!hasPlayerPoints) return;
            } else if (!hasPlayerPoints && !hasStarterPoints) {
              return;
            }

            const points = Number(
              matchup.players_points?.[String(playerId)] ??
              matchup.starters_points?.[starterIndex] ??
              0
            );
            const rosterId = matchup.roster_id;

            allGames.push({
              season,
              week: WEEKS[idx],
              points: Math.round(points * 100) / 100,
              rosterId,
              teamName: teamNames?.get(rosterId) ?? `Team ${rosterId}`,
            });
          });
        })
      );

      allGames.sort((a, b) => a.season - b.season || a.week - b.week);
      res.json({ games: allGames });
    } catch (error) {
      console.error("Error fetching player career games:", error);
      res.status(500).json({ error: "Failed to fetch player career games" });
    }
  });

  app.get("/api/sleeper/players/search", async (req, res) => {
    try {
      const search = (req.query.q as string || "").toLowerCase().trim();
      const rookiesOnly = req.query.rookies === "true";
      const mvpOnly = req.query.mvp === "true";

      // Rookie of the Year lists this year's rookies (first-year players) up front, with no search needed.
      // Searching only narrows that list. Other awards still need at least two characters.
      if (!rookiesOnly && !mvpOnly && (!search || search.length < 2)) {
        return res.json([]);
      }

      const players = await getAllPlayers();
      // Rookies must have spent at least one week on a roster in this league
      const leagueIdParam = typeof req.query.leagueId === "string" ? req.query.leagueId : "";
      const rostered = rookiesOnly && leagueIdParam ? await leaguePlayerGames(leagueIdParam) : null;
      const positionOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      // MVP lists the qualifying players up front (top weeks at their position); searching narrows the list
      const mvpPool = mvpOnly && leagueIdParam ? await leagueMvpPool(leagueIdParam, id => (players as any)[id]?.position) : null;
      const playerList = Object.values(players)
        .filter(p => {
          if (!p.position || !positionOrder.includes(p.position)) return false;
          const fullName = (p.full_name || `${p.first_name} ${p.last_name}`).toLowerCase();
          const matchesSearch = !search || fullName.includes(search);
          if (mvpPool) return matchesSearch && mvpPool.has(String(p.player_id));
          if (rookiesOnly) {
            // years_exp 0 is the current rookie class; with a league given, only rookies who were rostered a played week
            return matchesSearch && Number(p.years_exp) === 0 && (rostered ? rostered.has(String(p.player_id)) : !!p.team);
          }
          return matchesSearch;
        })
        .sort((a, b) => mvpPool
          ? (mvpPool.get(String(b.player_id))?.ppg ?? 0) - (mvpPool.get(String(a.player_id))?.ppg ?? 0)
          : rookiesOnly
          ? positionOrder.indexOf(a.position!) - positionOrder.indexOf(b.position!) ||
            (a.full_name || "").localeCompare(b.full_name || "")
          : 0)
        .slice(0, rookiesOnly || mvpPool ? 200 : 20)
        .map(p => ({
          id: p.player_id,
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: p.position,
          team: p.team,
          age: p.age,
          yearsExp: Number(p.years_exp) || 0,
          status: p.status,
          injuryStatus: p.injury_status,
          ...(mvpPool ? (() => {
            const c = mvpPool.get(String(p.player_id));
            return c ? { games: c.games, points: c.points, ppg: c.ppg, topWeeks: c.topWeeks } : {};
          })() : {}),
          ...(rostered ? (() => {
            const g = rostered.get(String(p.player_id));
            return g ? { games: g.games, points: Math.round(g.points * 10) / 10, ppg: Math.round((g.points / g.games) * 10) / 10 } : {};
          })() : {}),
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
      
      // Determine the correct season for stats, handling offseason correctly.
      // Sleeper may report a stale league.season (e.g. "2024" when 2025 just ended if the
      // commissioner hasn't advanced the league yet). Use the highest of league and NFL state
      // seasons and subtract 1 during the offseason to get the last completed season.
      const rawSeason = parseInt(league?.season || nflState.season || String(new Date().getFullYear()));
      const nflStateSeason = parseInt(nflState.season || String(new Date().getFullYear()));
      const seasonType = nflState.season_type;
      const currentMonth = new Date().getMonth() + 1; // 1 = Jan
      const isDetailOffseason =
        seasonType === "off" ||
        seasonType === "post" ||
        (nflState.week <= 5 && currentMonth >= 1 && currentMonth <= 8);
      // In the offseason use the last completed season; in-season use the current season.
      const season = isDetailOffseason
        ? String(Math.max(rawSeason, nflStateSeason) - 1)
        : String(Math.max(rawSeason, nflStateSeason));
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
}
