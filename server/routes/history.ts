// League history, game details, year recap, trophies and player awards.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { assembleLeagueHistory, buildSeasonHistory } from "../leagueHistory";
import type { SeasonHistory } from "../../shared/leagueHistory";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getAllLeagueTransactions,
  getNFLState,
  getAllPlayers,
  getWinnersBracket,
  getLosersBracket,
  type SleeperRoster,
  type SleeperLeagueUser,
  type SleeperPlayer,
  type SleeperTransaction,
  type SleeperMatchup,
} from "../sleeper";
import {
  getEffectiveWeek,
} from "./shared";

export function registerHistoryRoutes(app: Express): void {
  // League history: every season of the dynasty chain, finished seasons stored after the first build
  const liveSeasonHistoryCache = new Map<string, { at: number; data: SeasonHistory }>();
  app.get("/api/sleeper/league/:leagueId/history", async (req, res) => {
    try {
      const chain: { leagueId: string; season: string; status: string }[] = [];
      let nextId: string | null = req.params.leagueId;
      let leagueName = "";
      while (nextId) {
        try {
          const info = await getLeague(nextId);
          if (!leagueName) leagueName = info.name;
          chain.push({ leagueId: nextId, season: info.season, status: info.status });
          nextId = (info as any).previous_league_id || null;
        } catch {
          break;
        }
      }

      const seasons = await Promise.all(
        chain.map(async ({ leagueId, season, status }): Promise<SeasonHistory | null> => {
          try {
            if (status === "complete") {
              const stored = await storage.getLeagueHistorySnapshot(leagueId, season).catch(() => undefined);
              if (stored) {
                try {
                  return JSON.parse(stored) as SeasonHistory;
                } catch {
                  /* rebuild below */
                }
              }
              const built = await buildSeasonHistory(leagueId);
              await storage.saveLeagueHistorySnapshot(leagueId, season, JSON.stringify(built)).catch((error) => {
                console.error("Could not store league history snapshot:", error?.message || error);
              });
              return built;
            }
            const cached = liveSeasonHistoryCache.get(leagueId);
            if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;
            const built = await buildSeasonHistory(leagueId);
            liveSeasonHistoryCache.set(leagueId, { at: Date.now(), data: built });
            return built;
          } catch (error) {
            console.error(`Error building league history for ${season}:`, error);
            return null;
          }
        }),
      );

      const built = seasons.filter((s): s is SeasonHistory => s !== null);
      if (built.length === 0) return res.status(502).json({ error: "No league history available" });
      res.json(assembleLeagueHistory(leagueName, built));
    } catch (error) {
      console.error("Error building league history:", error);
      res.status(500).json({ error: "Failed to build league history" });
    }
  });

  // Game details - starter performance for a specific week and roster pair (for Year Recap expandable cards)
  app.get("/api/league/:leagueId/game-details", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const week = parseInt(req.query.week as string, 10);
      const rosterId1 = parseInt(req.query.rosterId1 as string, 10);
      const rosterId2 = parseInt(req.query.rosterId2 as string, 10);
      if (!Number.isFinite(week) || !Number.isFinite(rosterId1) || !Number.isFinite(rosterId2)) {
        return res.status(400).json({ error: "Missing or invalid week, rosterId1, rosterId2" });
      }
      const [league, rosters, users, players, matchups] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getAllPlayers(),
        getLeagueMatchups(leagueId, week).catch(() => []),
      ]);
      let matchupLeagueId = leagueId;
      if (matchups.length === 0 || !matchups.some((m: SleeperMatchup) => m.points !== undefined && m.points > 0)) {
        if ((league as any)?.previous_league_id) {
          matchupLeagueId = (league as any).previous_league_id;
        }
      }
      const actualMatchups = matchupLeagueId !== leagueId
        ? await getLeagueMatchups(matchupLeagueId, week).catch(() => [])
        : matchups;
      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach((u: SleeperLeagueUser) => userMap.set(u.user_id, u));
      const getTeamName = (rid: number) => {
        const roster = rosters.find((r: SleeperRoster) => r.roster_id === rid);
        const user = roster ? userMap.get(roster.owner_id) : null;
        return user?.metadata?.team_name || user?.display_name || `Team ${rid}`;
      };
      const groups = new Map<number, SleeperMatchup[]>();
      actualMatchups.forEach((m: SleeperMatchup) => {
        if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
        groups.get(m.matchup_id)!.push(m);
      });
      const ids = new Set([rosterId1, rosterId2]);
      let t1: SleeperMatchup | null = null;
      let t2: SleeperMatchup | null = null;
      for (const group of groups.values()) {
        if (group.length !== 2) continue;
        const [a, b] = group;
        const aId = a.roster_id, bId = b.roster_id;
        if (ids.has(aId) && ids.has(bId)) {
          t1 = aId === rosterId1 ? a : b;
          t2 = aId === rosterId1 ? b : a;
          break;
        }
      }
      if (!t1 || !t2) {
        return res.status(404).json({ error: "Matchup not found for this week and roster pair" });
      }
      const toStarters = (m: SleeperMatchup) => {
        const starters = m.starters || [];
        const pp = m.players_points || {};
        return starters
          .map((pid: string) => {
            const p = (players as Record<string, SleeperPlayer>)[pid] ?? (players as Record<string, SleeperPlayer>)[String(pid)];
            const pts = pp[pid] ?? pp[String(pid)] ?? 0;
            return {
              playerId: pid,
              name: p?.full_name || (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : pid),
              position: p?.position || "FLEX",
              points: Math.round(pts * 100) / 100,
            };
          })
          .sort((a, b) => b.points - a.points);
      };
      res.json({
        team1: { name: getTeamName(t1.roster_id), starters: toStarters(t1) },
        team2: { name: getTeamName(t2.roster_id), starters: toStarters(t2) },
      });
    } catch (error) {
      console.error("Error fetching game details:", error);
      res.status(500).json({ error: "Failed to fetch game details" });
    }
  });

  // Year Recap - Full season stats, charts, and awards
  app.get("/api/league/:leagueId/year-recap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const [league, rosters, users, players, nflState] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getAllPlayers(),
        getNFLState().catch(() => ({ week: 18, season: league?.season || "2025", season_type: "post" })),
      ]);
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
      const lastRegularWeek = playoffWeekStart - 1;
      let matchupLeagueId = leagueId;
      const testMatchup = await getLeagueMatchups(leagueId, 1).catch(() => []);
      const hasCurrentData = testMatchup.length > 0 && testMatchup.some((m: SleeperMatchup) => m.points !== undefined && m.points > 0);
      if (!hasCurrentData && (league as any).previous_league_id) {
        matchupLeagueId = (league as any).previous_league_id;
      }
      const lastPlayoffWeek = 17;
      const matchupPromises: Promise<{ week: number; matchups: SleeperMatchup[] }>[] = [];
      for (let w = 1; w <= lastPlayoffWeek; w++) {
        matchupPromises.push(
          getLeagueMatchups(matchupLeagueId, w).then(matchups => ({ week: w, matchups })).catch(() => ({ week: w, matchups: [] }))
        );
      }
      const [winnersBracket, losersBracket, allWeeklyMatchups, allTransactions] = await Promise.all([
        getWinnersBracket(matchupLeagueId).catch(() => []),
        getLosersBracket(matchupLeagueId).catch(() => []),
        Promise.all(matchupPromises),
        getAllLeagueTransactions(matchupLeagueId, lastPlayoffWeek).catch(() => []),
      ]);
      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));
      const rosterPositions = (league?.roster_positions || []).filter((p: string) => !["BN", "IR", "TAXI"].includes(p));
      const playoffTeams = new Set<number>();
      const championRosterId = winnersBracket.find((m: any) => m.p === 1)?.w ?? null;
      if (championRosterId) playoffTeams.add(championRosterId);
      winnersBracket.forEach((m: any) => {
        if (m.t1) playoffTeams.add(m.t1);
        if (m.t2) playoffTeams.add(m.t2);
      });
      // Build pair-key sets for bracket tagging
      const makePairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
      const winnersBracketPairs = new Set<string>(
        winnersBracket.filter((m: any) => m.t1 && m.t2).map((m: any) => makePairKey(m.t1, m.t2))
      );
      const losersBracketPairs = new Set<string>(
        ((losersBracket as any[]) ?? []).filter((m: any) => m.t1 && m.t2).map((m: any) => makePairKey(m.t1, m.t2))
      );
      const championshipBracketGame = winnersBracket.find((m: any) => m.p === 1);
      const championshipPair = championshipBracketGame?.t1 && championshipBracketGame?.t2
        ? makePairKey(championshipBracketGame.t1, championshipBracketGame.t2) : null;
      // Map pair key → winner's placement for labeling (e.g. p=1 is championship, p=3 is 3rd place, p=5 is 5th)
      const pairToPlacement = new Map<string, number>();
      [...winnersBracket, ...((losersBracket as any[]) ?? [])].forEach((m: any) => {
        if (m.t1 && m.t2 && m.p != null) {
          pairToPlacement.set(makePairKey(m.t1, m.t2), m.p);
        }
      });
      const getTeamInfo = (rosterId: number) => {
        const roster = rosters.find((r: SleeperRoster) => r.roster_id === rosterId);
        const user = roster ? userMap.get(roster.owner_id) : null;
        const name = user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`;
        const avatar = user?.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null;
        return { name, avatar };
      };

      const regularMatchups = allWeeklyMatchups.filter(({ week }) => week <= lastRegularWeek);
      const playoffMatchups = allWeeklyMatchups.filter(({ week }) => week >= playoffWeekStart);

      const pointsByRosterByWeek = new Map<number, Map<number, number>>();
      const allPlayWinsByRoster = new Map<number, number>();
      const allPlayLossesByRoster = new Map<number, number>();
      const matchupHistory = new Map<number, Array<{ week: number; won: boolean | null }>>();
      const uniqueStartersByRoster = new Map<number, Set<string>>();
      const startersAgesByRoster = new Map<number, number[]>();
      const rosterWeeklyPoints = new Map<number, Map<number, Record<string, number>>>();
      const rosterWeeklyRoster = new Map<number, Map<number, string[]>>();
      const rosterWeeklyStarters = new Map<number, Map<number, string[]>>();
      rosters.forEach((r: SleeperRoster) => {
        pointsByRosterByWeek.set(r.roster_id, new Map());
        allPlayWinsByRoster.set(r.roster_id, 0);
        allPlayLossesByRoster.set(r.roster_id, 0);
        matchupHistory.set(r.roster_id, []);
        uniqueStartersByRoster.set(r.roster_id, new Set());
        startersAgesByRoster.set(r.roster_id, []);
        rosterWeeklyPoints.set(r.roster_id, new Map());
        rosterWeeklyRoster.set(r.roster_id, new Map());
        rosterWeeklyStarters.set(r.roster_id, new Map());
      });

      const numTeams = rosters.length;
      regularMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const roster = m.players || [];
          rosterWeeklyRoster.get(m.roster_id)?.set(week, roster);
          const pts = m.points ?? 0;
          pointsByRosterByWeek.get(m.roster_id)?.set(week, pts);
          const pp = m.players_points || {};
          rosterWeeklyPoints.get(m.roster_id)?.set(week, pp);
          const starters = m.starters || [];
          rosterWeeklyStarters.get(m.roster_id)?.set(week, starters);
          starters.forEach((pid: string) => uniqueStartersByRoster.get(m.roster_id)?.add(pid));
          starters.forEach((pid: string) => {
            const p = players[pid];
            if (p?.age != null) startersAgesByRoster.get(m.roster_id)?.push(p.age);
          });
        });
        const weekScores = matchups.filter((m: SleeperMatchup) => m.points != null).map((m: SleeperMatchup) => ({ rosterId: m.roster_id, points: m.points || 0 }));
        weekScores.sort((a: { points: number }, b: { points: number }) => b.points - a.points);
        weekScores.forEach((team: { rosterId: number; points: number }, idx: number) => {
          const wins = numTeams - idx - 1;
          const losses = idx;
          allPlayWinsByRoster.set(team.rosterId, (allPlayWinsByRoster.get(team.rosterId) || 0) + wins);
          allPlayLossesByRoster.set(team.rosterId, (allPlayLossesByRoster.get(team.rosterId) || 0) + losses);
        });
        const groups = new Map<number, SleeperMatchup[]>();
        matchups.forEach((m: SleeperMatchup) => {
          if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
          groups.get(m.matchup_id)!.push(m);
        });
        groups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          const s1 = t1.points || 0, s2 = t2.points || 0;
          if (s1 === 0 && s2 === 0) return;
          const h1 = matchupHistory.get(t1.roster_id), h2 = matchupHistory.get(t2.roster_id);
          if (s1 > s2) { h1?.push({ week, won: true }); h2?.push({ week, won: false }); }
          else if (s2 > s1) { h1?.push({ week, won: false }); h2?.push({ week, won: true }); }
          else { h1?.push({ week, won: null }); h2?.push({ week, won: null }); }
        });
      });

      const cumulativeAllPlayPctByWeek = new Map<number, Map<number, number>>();
      rosters.forEach((r: SleeperRoster) => cumulativeAllPlayPctByWeek.set(r.roster_id, new Map()));
      let runningWins = new Map<number, number>();
      let runningLosses = new Map<number, number>();
      rosters.forEach((r: SleeperRoster) => { runningWins.set(r.roster_id, 0); runningLosses.set(r.roster_id, 0); });
      regularMatchups.forEach(({ week, matchups }) => {
        const weekScores = matchups.filter((m: SleeperMatchup) => m.points != null).map((m: SleeperMatchup) => ({ rosterId: m.roster_id, points: m.points || 0 }));
        weekScores.sort((a: { points: number }, b: { points: number }) => b.points - a.points);
        weekScores.forEach((team: { rosterId: number; points: number }, idx: number) => {
          const w = numTeams - idx - 1, l = idx;
          runningWins.set(team.rosterId, (runningWins.get(team.rosterId) || 0) + w);
          runningLosses.set(team.rosterId, (runningLosses.get(team.rosterId) || 0) + l);
        });
        rosters.forEach((r: SleeperRoster) => {
          const tw = runningWins.get(r.roster_id) || 0, tl = runningLosses.get(r.roster_id) || 0;
          const pct = tw + tl > 0 ? (tw / (tw + tl)) * 100 : 0;
          cumulativeAllPlayPctByWeek.get(r.roster_id)?.set(week, Math.round(pct * 10) / 10);
        });
      });

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
        const fixed = slots.filter((s: string) => priority.includes(s));
        const remaining = slots.filter((s: string) => !priority.includes(s) && flexes.includes(s));
        return [...fixed, ...remaining];
      };
      const slotOrder = buildSlotOrder(rosterPositions);

      const powerWinVsAge = rosters.map((r: SleeperRoster) => {
        const ages = startersAgesByRoster.get(r.roster_id) || [];
        const avgAge = ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;
        const wins = allPlayWinsByRoster.get(r.roster_id) || 0, losses = allPlayLossesByRoster.get(r.roster_id) || 0;
        const pct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0;
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, avatar: info.avatar, allPlayWinPct: pct, avgAge: Math.round(avgAge * 10) / 10, isChampion: r.roster_id === championRosterId, isPlayoff: playoffTeams.has(r.roster_id) };
      });

      const powerWinVsUniqueStarters = rosters.map((r: SleeperRoster) => {
        const unique = uniqueStartersByRoster.get(r.roster_id)?.size || 0;
        const wins = allPlayWinsByRoster.get(r.roster_id) || 0, losses = allPlayLossesByRoster.get(r.roster_id) || 0;
        const pct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0;
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, avatar: info.avatar, allPlayWinPct: pct, uniqueStarters: unique, isChampion: r.roster_id === championRosterId, isPlayoff: playoffTeams.has(r.roster_id) };
      });

      const streaks = rosters.map((r: SleeperRoster) => {
        const hist = (matchupHistory.get(r.roster_id) || []).sort((a, b) => a.week - b.week);
        let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
        hist.forEach(({ won }) => {
          if (won === true) { curWin++; curLoss = 0; maxWin = Math.max(maxWin, curWin); }
          else if (won === false) { curLoss++; curWin = 0; maxLoss = Math.max(maxLoss, curLoss); }
          else { curWin = 0; curLoss = 0; }
        });
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, longestWinStreak: maxWin, longestLossStreak: maxLoss };
      });

      const bouncebacks = rosters.map((r: SleeperRoster) => {
        const hist = (matchupHistory.get(r.roster_id) || []).sort((a, b) => a.week - b.week);
        let bouncebacks = 0, losses = 0;
        for (let i = 0; i < hist.length - 1; i++) {
          if (hist[i].won === false) { losses++; if (hist[i + 1].won === true) bouncebacks++; }
        }
        if (hist[hist.length - 1]?.won === false) losses++;
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, bouncebacks, losses, bouncebackPct: losses > 0 ? Math.round((bouncebacks / losses) * 1000) / 10 : 0 };
      });

      const allGames: Array<{ week: number; team1: string; team2: string; score1: number; score2: number; combined: number; margin: number }> = [];
      regularMatchups.forEach(({ week, matchups }) => {
        const groups = new Map<number, SleeperMatchup[]>();
        matchups.forEach((m: SleeperMatchup) => {
          if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
          groups.get(m.matchup_id)!.push(m);
        });
        groups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          const s1 = t1.points || 0, s2 = t2.points || 0;
          if (s1 === 0 && s2 === 0) return;
          const info1 = getTeamInfo(t1.roster_id), info2 = getTeamInfo(t2.roster_id);
          allGames.push({ week, team1: info1.name, team2: info2.name, rosterId1: t1.roster_id, rosterId2: t2.roster_id, score1: s1, score2: s2, combined: s1 + s2, margin: Math.abs(s1 - s2) });
        });
      });
      const byCombined = [...allGames].sort((a, b) => b.combined - a.combined);
      const highestScoring = byCombined.slice(0, 3);
      const lowestScoring = byCombined.slice(-3).reverse();
      const byMargin = [...allGames].sort((a, b) => a.margin - b.margin);
      const closest = byMargin.filter(g => g.margin > 0).slice(0, 3);
      const blowouts = [...allGames].sort((a, b) => b.margin - a.margin).slice(0, 3);

      const upsets: Array<{ week: number; winner: string; loser: string; winnerPctAtWeek: number; loserPctAtWeek: number; upsetMargin: number; winnerScore: number; loserScore: number }> = [];
      regularMatchups.forEach(({ week, matchups }) => {
        const groups = new Map<number, SleeperMatchup[]>();
        matchups.forEach((m: SleeperMatchup) => {
          if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
          groups.get(m.matchup_id)!.push(m);
        });
        groups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          if (t1.roster_id === t2.roster_id) return;
          const s1 = t1.points || 0, s2 = t2.points || 0;
          if (s1 === 0 && s2 === 0) return;
          const pct1 = cumulativeAllPlayPctByWeek.get(t1.roster_id)?.get(week) ?? 50;
          const pct2 = cumulativeAllPlayPctByWeek.get(t2.roster_id)?.get(week) ?? 50;
          const gameWinner = s1 > s2 ? t1 : t2;
          const gameLoser = s1 < s2 ? t1 : t2;
          const winnerPct = s1 > s2 ? pct1 : pct2;
          const loserPct = s1 > s2 ? pct2 : pct1;
          // margin = loser's % - winner's %; positive only when the underdog (lower %) won
          const margin = loserPct - winnerPct;
          if (margin >= 5) {
            upsets.push({
              week,
              winner: getTeamInfo(gameWinner.roster_id).name,
              loser: getTeamInfo(gameLoser.roster_id).name,
              winnerPctAtWeek: winnerPct,
              loserPctAtWeek: loserPct,
              upsetMargin: Math.round(margin * 10) / 10,
              winnerScore: Math.max(s1, s2),
              loserScore: Math.min(s1, s2),
            });
          }
        });
      });
      upsets.sort((a, b) => b.upsetMargin - a.upsetMargin);

      const wrongDecisionsByRoster = new Map<number, Array<{ week: number; starterName: string; starterPoints: number; benchName: string; benchPoints: number }>>();
      const correctDecisionsByRoster = new Map<number, number>();
      const totalDecisionsByRoster = new Map<number, number>();
      rosters.forEach((r: SleeperRoster) => { wrongDecisionsByRoster.set(r.roster_id, []); correctDecisionsByRoster.set(r.roster_id, 0); totalDecisionsByRoster.set(r.roster_id, 0); });
      regularMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const starters = m.starters || [];
          const pp = m.players_points || {};
          const roster = rosterWeeklyRoster.get(m.roster_id)?.get(week) || [];
          const bench = roster.filter((pid: string) => !starters.includes(pid));
          const slotOrderCopy = [...slotOrder];
          let slotIdx = 0;
          starters.forEach((starterId: string) => {
            const slot = slotOrderCopy[slotIdx];
            if (!slot) return;
            const starterPos = players[starterId]?.position || "FLEX";
            if (!isEligibleForSlot(starterPos, slot)) return;
            slotIdx++;
            const starterPts = pp[starterId] ?? 0;
            const benchEligible = bench.filter((pid: string) => isEligibleForSlot(players[pid]?.position || "FLEX", slot));
            const bestBench = benchEligible.map((pid: string) => ({ pid, pts: pp[pid] ?? 0 })).sort((a, b) => b.pts - a.pts)[0];
            totalDecisionsByRoster.set(m.roster_id, (totalDecisionsByRoster.get(m.roster_id) || 0) + 1);
            if (bestBench && bestBench.pts > starterPts) {
              wrongDecisionsByRoster.get(m.roster_id)?.push({
                week,
                starterName: players[starterId]?.full_name || players[starterId]?.first_name + " " + players[starterId]?.last_name || starterId,
                starterPoints: starterPts,
                benchName: players[bestBench.pid]?.full_name || players[bestBench.pid]?.first_name + " " + players[bestBench.pid]?.last_name || bestBench.pid,
                benchPoints: bestBench.pts,
              });
            } else {
              correctDecisionsByRoster.set(m.roster_id, (correctDecisionsByRoster.get(m.roster_id) || 0) + 1);
            }
          });
        });
      });

      const managementEfficiencyVsPoints = rosters.map((r: SleeperRoster) => {
        const correct = correctDecisionsByRoster.get(r.roster_id) || 0;
        const total = totalDecisionsByRoster.get(r.roster_id) || 0;
        const eff = total > 0 ? Math.round((correct / total) * 1000) / 10 : 100;
        const pts = r.settings?.fpts || 0;
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, avatar: info.avatar, managementEfficiency: eff, totalPoints: pts, isChampion: r.roster_id === championRosterId, isPlayoff: playoffTeams.has(r.roster_id) };
      });

      const wrongDecisions = rosters.map((r: SleeperRoster) => {
        const details = wrongDecisionsByRoster.get(r.roster_id) || [];
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, wrongDecisions: details.length, details };
      });

      const peakByPosition: Record<string, Array<{ playerId: string; playerName: string; teamName: string; week: number; points: number; isHonorableMention: boolean }>> = { QB: [], RB: [], WR: [], TE: [], K: [] };
      regularMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const starters = m.starters || [];
          const pp = m.players_points || {};
          const info = getTeamInfo(m.roster_id);
          starters.forEach((pid: string) => {
            const pos = players[pid]?.position || "FLEX";
            const key = ["QB", "RB", "WR", "TE", "K"].includes(pos) ? pos : null;
            if (!key) return;
            if (!peakByPosition[key]) peakByPosition[key] = [];
            const pts = pp[pid] ?? 0;
            peakByPosition[key].push({ playerId: pid, playerName: players[pid]?.full_name || players[pid]?.first_name + " " + players[pid]?.last_name || pid, teamName: info.name, week, points: pts, isHonorableMention: false });
          });
        });
      });
      Object.keys(peakByPosition).forEach(pos => {
        peakByPosition[pos].sort((a, b) => b.points - a.points);
        const top3 = peakByPosition[pos].slice(0, 3);
        top3.forEach((e, i) => { e.isHonorableMention = i > 0; });
        peakByPosition[pos] = top3;
      });

      // Hidden Peaks: bench players whose week score would have been in the season top 3 at their position (Peak Performance)
      const hiddenPeaks: Array<{ playerName: string; teamName: string; week: number; points: number; position: string; wouldHaveBeenRank: number }> = [];
      const vaultPositions = ["QB", "RB", "WR", "TE", "K"];
      const seasonTop3ScoresByPos = new Map<string, number[]>();
      vaultPositions.forEach(pos => {
        const top3 = (peakByPosition[pos] || []).map((e: { points: number }) => e.points).sort((a: number, b: number) => b - a);
        seasonTop3ScoresByPos.set(pos, top3);
      });
      regularMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const starters = new Set(m.starters || []);
          const roster = rosterWeeklyRoster.get(m.roster_id)?.get(week) || [];
          const pp = m.players_points || {};
          const info = getTeamInfo(m.roster_id);
          roster.filter((pid: string) => !starters.has(pid)).forEach((pid: string) => {
            const pos = players[pid]?.position || "FLEX";
            if (!vaultPositions.includes(pos)) return;
            const pts = pp[pid] ?? 0;
            if (pts <= 0) return;
            const top3Scores = seasonTop3ScoresByPos.get(pos) || [];
            const betterCount = top3Scores.filter((s: number) => s > pts).length;
            const wouldHaveBeenRank = betterCount + 1;
            if (wouldHaveBeenRank <= 3) {
              hiddenPeaks.push({
                playerName: players[pid]?.full_name || players[pid]?.first_name + " " + players[pid]?.last_name || pid,
                teamName: info.name,
                week,
                points: pts,
                position: pos,
                wouldHaveBeenRank,
              });
            }
          });
        });
      });

      const playerAvgAsStarter = new Map<string, { total: number; games: number; rosterId: number; position: string }>();
      regularMatchups.forEach(({ week, matchups }) => {
        matchups.forEach((m: SleeperMatchup) => {
          const starters = m.starters || [];
          const pp = m.players_points || {};
          starters.forEach((pid: string) => {
            const pts = pp[pid] ?? 0;
            const pos = players[pid]?.position || "FLEX";
            const cur = playerAvgAsStarter.get(pid);
            if (!cur) playerAvgAsStarter.set(pid, { total: pts, games: 1, rosterId: m.roster_id, position: pos });
            else { cur.total += pts; cur.games++; }
          });
        });
      });
      const slotToPlayerPositions: Record<string, string[]> = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], WRRB: ["WR", "RB"], WRRBTE: ["WR", "RB", "TE"] };
      const allLeagueSlotOrder = slotOrder.filter((s: string) => s !== "DEF");
      const allLeagueTeams: Array<{ team: 1 | 2 | 3; slot: string; playerId: string; playerName: string; position: string; totalPoints: number; gamesStarted: number; teamName: string }> = [];
      const usedAllLeague = new Set<string>();
      const pushAllLeague = (team: 1 | 2 | 3, slot: string, pick: { pid: string; position: string; total: number; games: number; rosterId: number }) => {
        usedAllLeague.add(pick.pid);
        allLeagueTeams.push({ team, slot, playerId: pick.pid, playerName: players[pick.pid]?.full_name || players[pick.pid]?.first_name + " " + players[pick.pid]?.last_name || pick.pid, position: pick.position, totalPoints: Math.round(pick.total * 10) / 10, gamesStarted: pick.games, teamName: getTeamInfo(pick.rosterId).name });
      };
      // Assignment order: team-first — Team 1 fills all dedicated slots then all flex slots before Team 2 picks anything.
      // This lets RB3 compete for Team 1's flex spot rather than automatically going to Team 2.
      const flexSlotNames = ["FLEX", "SUPER_FLEX", "WRRB", "WRRBTE"];
      const isFlexSlot = (s: string) => flexSlotNames.includes(s);
      const slotCounts = new Map<string, number>();
      allLeagueSlotOrder.forEach((s: string) => slotCounts.set(s, (slotCounts.get(s) || 0) + 1));
      const slotOrderUnique = allLeagueSlotOrder.filter((s: string, i: number) => allLeagueSlotOrder.indexOf(s) === i);
      const dedicatedSlots = slotOrderUnique.filter((s: string) => !isFlexSlot(s));
      const flexSlots = slotOrderUnique.filter((s: string) => isFlexSlot(s));
      const slotAssignments: Array<{ slot: string; team: 1 | 2 | 3 }> = [];
      for (let t = 1; t <= 3; t++) {
        dedicatedSlots.forEach((slot: string) => {
          const n = slotCounts.get(slot) || 0;
          for (let i = 0; i < n; i++) {
            slotAssignments.push({ slot, team: t as 1 | 2 | 3 });
          }
        });
        flexSlots.forEach((slot: string) => {
          const n = slotCounts.get(slot) || 0;
          for (let i = 0; i < n; i++) {
            slotAssignments.push({ slot, team: t as 1 | 2 | 3 });
          }
        });
      }
      slotAssignments.forEach(({ slot, team }) => {
        const positions = isFlexSlot(slot)
          ? ["RB", "WR", "TE"]
          : (slotToPlayerPositions[slot] || [slot]);
        const candidates = Array.from(playerAvgAsStarter.entries())
          .filter(([pid, data]) => positions.includes(data.position) && data.games >= 1)
          .map(([pid, data]) => ({ pid, ...data }))
          .sort((a, b) => b.total - a.total);
        const pick = candidates.find((c: { pid: string }) => !usedAllLeague.has(c.pid));
        if (pick) pushAllLeague(team, slot, pick);
      });

      const allRookieTeam: Array<{ slot: string; playerId: string; playerName: string; position: string; totalPoints: number; gamesStarted: number; teamName: string }> = [];
      const usedRookies = new Set<string>();
      const isRookie = (pid: string) => {
        const p = players[pid];
        const exp = p?.years_exp;
        if (exp === undefined || exp === null) return false;
        const n = typeof exp === "string" ? parseInt(exp, 10) : exp;
        return n === 1;
      };
      allLeagueSlotOrder.forEach((slot: string) => {
        const positions = slotToPlayerPositions[slot] || [slot];
        const candidates = Array.from(playerAvgAsStarter.entries())
          .filter(([pid, data]) => positions.includes(data.position) && data.games >= 1 && isRookie(pid))
          .map(([pid, data]) => ({ pid, ...data }))
          .sort((a, b) => b.total - a.total);
        const pick = candidates.find((c: { pid: string }) => !usedRookies.has(c.pid));
        if (pick) {
          usedRookies.add(pick.pid);
          allRookieTeam.push({ slot, playerId: pick.pid, playerName: players[pick.pid]?.full_name || players[pick.pid]?.first_name + " " + players[pick.pid]?.last_name || pick.pid, position: pick.position, totalPoints: Math.round(pick.total * 10) / 10, gamesStarted: pick.games, teamName: getTeamInfo(pick.rosterId).name });
        }
      });

      const activityByRoster = new Map<number, number>();
      rosters.forEach((r: SleeperRoster) => activityByRoster.set(r.roster_id, 0));
      allTransactions.filter((t: SleeperTransaction) => ["waiver", "free_agent", "trade"].includes(t.type) && t.status === "complete").forEach((t: SleeperTransaction) => {
        (t.roster_ids || []).forEach((rid: number) => activityByRoster.set(rid, (activityByRoster.get(rid) || 0) + 1));
      });
      const activityVsPower = rosters.map((r: SleeperRoster) => {
        const wins = allPlayWinsByRoster.get(r.roster_id) || 0, losses = allPlayLossesByRoster.get(r.roster_id) || 0;
        const pct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : 0;
        const info = getTeamInfo(r.roster_id);
        return { rosterId: r.roster_id, teamName: info.name, avatar: info.avatar, activity: activityByRoster.get(r.roster_id) || 0, allPlayWinPct: pct, isChampion: r.roster_id === championRosterId, isPlayoff: playoffTeams.has(r.roster_id) };
      });

      // Roster IDs that won their quarterfinal (used to label only true semifinals, not consolation-in-same-week)
      const quarterfinalWinners = new Set<number>();
      const qfWeek = playoffMatchups.find(({ week }) => week === playoffWeekStart);
      if (qfWeek) {
        const qfGroups = new Map<number, SleeperMatchup[]>();
        qfWeek.matchups.forEach((m: SleeperMatchup) => {
          if (!qfGroups.has(m.matchup_id)) qfGroups.set(m.matchup_id, []);
          qfGroups.get(m.matchup_id)!.push(m);
        });
        qfGroups.forEach(group => {
          if (group.length !== 2) return;
          const [a, b] = group;
          const pa = a.points || 0, pb = b.points || 0;
          if (pa === 0 && pb === 0) return;
          const winnerId = pa >= pb ? a.roster_id : b.roster_id;
          if (winnersBracketPairs.has(makePairKey(a.roster_id, b.roster_id))) quarterfinalWinners.add(winnerId);
        });
      }
      // Roster IDs that had a bye in quarterfinals (appear in bracket round 2 but not in round 1)
      const round1RosterIds = new Set<number>();
      const round2RosterIds = new Set<number>();
      (winnersBracket as any[]).forEach((m: any) => {
        if (m.r === 1) { if (m.t1) round1RosterIds.add(m.t1); if (m.t2) round1RosterIds.add(m.t2); }
        if (m.r === 2) { if (m.t1) round2RosterIds.add(m.t1); if (m.t2) round2RosterIds.add(m.t2); }
      });
      const quarterfinalByeTeams = new Set<number>(Array.from(round2RosterIds).filter((id: number) => !round1RosterIds.has(id)));

      const playoffGames: Array<{ week: number; team1: string; team2: string; avatar1: string | null; avatar2: string | null; score1: number; score2: number; combined: number; margin: number; winner: string; bracket: 'winners' | 'losers' | 'championship'; isChampionship: boolean; placement: number | null; isChampionshipEligibleSemifinal?: boolean }> = [];
      playoffMatchups.forEach(({ week, matchups }) => {
        const groups = new Map<number, SleeperMatchup[]>();
        matchups.forEach((m: SleeperMatchup) => {
          if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
          groups.get(m.matchup_id)!.push(m);
        });
        groups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          const s1 = t1.points || 0, s2 = t2.points || 0;
          if (s1 === 0 && s2 === 0) return;
          const info1 = getTeamInfo(t1.roster_id), info2 = getTeamInfo(t2.roster_id);
          const pairKey = makePairKey(t1.roster_id, t2.roster_id);
          if (!winnersBracketPairs.has(pairKey) && !losersBracketPairs.has(pairKey)) return;
          const isChampionship = pairKey === championshipPair;
          const bracket: 'winners' | 'losers' | 'championship' = isChampionship
            ? 'championship'
            : losersBracketPairs.has(pairKey) ? 'losers'
            : 'winners';
          const placement = pairToPlacement.get(pairKey) ?? null;
          const isSemifinalsWeek = week === playoffWeekStart + 1;
          const bothEligible = (quarterfinalWinners.has(t1.roster_id) && quarterfinalWinners.has(t2.roster_id))
            || (quarterfinalWinners.has(t1.roster_id) && quarterfinalByeTeams.has(t2.roster_id))
            || (quarterfinalByeTeams.has(t1.roster_id) && quarterfinalWinners.has(t2.roster_id));
          const isChampionshipEligibleSemifinal = isSemifinalsWeek && (bracket === 'winners' || bracket === 'championship') && bothEligible;
          playoffGames.push({ week, team1: info1.name, team2: info2.name, rosterId1: t1.roster_id, rosterId2: t2.roster_id, avatar1: info1.avatar ?? null, avatar2: info2.avatar ?? null, score1: s1, score2: s2, combined: s1 + s2, margin: Math.abs(s1 - s2), winner: s1 >= s2 ? info1.name : info2.name, bracket, isChampionship, placement, isChampionshipEligibleSemifinal });
        });
      });

      // Championship MVP — highest-scoring starter on the winning roster in the championship game
      let championshipMvp: { playerId: string; playerName: string; points: number; position: string; teamName: string } | null = null;
      const champGame = playoffGames.find(g => g.isChampionship);
      if (champGame && championRosterId) {
        const champWeekMatchups = playoffMatchups.find(({ week }) => week === champGame.week)?.matchups ?? [];
        const champRosterMatchup = champWeekMatchups.find((m: SleeperMatchup) => m.roster_id === championRosterId);
        if (champRosterMatchup) {
          const pp = champRosterMatchup.players_points || {};
          const starters = champRosterMatchup.starters || [];
          const best = starters
            .map((pid: string) => ({ pid, pts: pp[pid] ?? 0 }))
            .sort((a: { pts: number }, b: { pts: number }) => b.pts - a.pts)[0];
          if (best) {
            const p = (players as any)[best.pid];
            championshipMvp = {
              playerId: best.pid,
              playerName: p?.full_name || (p?.first_name && p?.last_name ? `${p.first_name} ${p.last_name}` : best.pid),
              points: Math.round(best.pts * 100) / 100,
              position: p?.position || 'FLEX',
              teamName: getTeamInfo(championRosterId).name,
            };
          }
        }
      }

      const champInfo = championRosterId ? getTeamInfo(championRosterId) : null;
      res.json({
        powerWinVsAge,
        powerWinVsUniqueStarters,
        streaks,
        bouncebacks,
        superlativeGames: { highestScoring, lowestScoring, closest, blowouts },
        biggestUpsets: upsets.slice(0, 10),
        managementEfficiencyVsPoints,
        wrongDecisions,
        peakPerformance: peakByPosition,
        hiddenPeaks,
        allLeagueTeams,
        allRookieTeam,
        activityVsPower,
        playoffGames,
        playoffWeekStart,
        championRosterId,
        championName: champInfo?.name ?? null,
        championAvatar: champInfo?.avatar ?? null,
        championshipMvp,
        playoffTeams: Array.from(playoffTeams),
      });
    } catch (error) {
      console.error("Error calculating year recap:", error);
      res.status(500).json({ error: "Failed to calculate year recap", message: error instanceof Error ? error.message : String(error) });
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
          const [rosters, users, league, winnersBracket] = await Promise.all([
            getLeagueRosters(lid),
            getLeagueUsers(lid),
            getLeague(lid),
            getWinnersBracket(lid).catch(() => []),
          ]);
          
          // Create user lookup map
          const userMap = new Map<string, SleeperLeagueUser>();
          users.forEach(u => userMap.set(u.user_id, u));
          
          // Create roster lookup map
          const rosterMap = new Map<number, SleeperRoster>();
          rosters.forEach(r => rosterMap.set(r.roster_id, r));
          
          // Find champion from playoff bracket (p: 1 is the championship game, w is the winner)
          const championshipGame = winnersBracket.find(m => m.p === 1);
          const championRosterId = championshipGame?.w;
          
          let champion: SleeperRoster | undefined;
          
          if (championRosterId) {
            // Playoff bracket has a winner
            champion = rosterMap.get(championRosterId);
          } else if (winnersBracket.length === 0) {
            // No bracket data (older seasons or API failure) - fallback to standings
            // Only for completed seasons, use the team with most wins and points
            const status = (league as any).status;
            const currentSeasonYear = new Date().getFullYear();
            if (status === 'complete' || parseInt(season) < currentSeasonYear) {
              const sortedRosters = [...rosters].sort((a, b) => {
                const aWins = a.settings?.wins || 0;
                const bWins = b.settings?.wins || 0;
                const aFpts = a.settings?.fpts || 0;
                const bFpts = b.settings?.fpts || 0;
                if (aWins !== bWins) return bWins - aWins;
                return bFpts - aFpts;
              });
              champion = sortedRosters[0];
            }
          }
          // If championship game exists but w is null, playoffs are still in progress - no champion yet
          
          if (champion) {
            const owner = userMap.get(champion.owner_id);
            const teamName = owner?.metadata?.team_name || owner?.display_name || `Team ${champion.roster_id}`;
            const initials = teamName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
            
            champions.push({
              season,
              rosterId: champion.roster_id,
              ownerId: champion.owner_id,
              teamName,
              initials,
              avatar: owner?.avatar ? `https://sleepercdn.com/avatars/thumbs/${owner.avatar}` : null,
            });
          }
          
          // Find highest scorer - only award after regular season is complete
          // Get the playoff start week from league settings (default to 15 if not set)
          const playoffWeekStart = (league as any).settings?.playoff_week_start || 15;
          const leagueStatus = (league as any).status;
          const currentSeasonYear = new Date().getFullYear();
          const nflState = await getNFLState();
          
          // Regular season is complete if:
          // 1. The league status is 'complete', OR
          // 2. This is a past season (season year < current year), OR
          // 3. This is the current season AND we're at or past the playoff start week
          const isCurrentSeason = parseInt(season) === currentSeasonYear || season === nflState.season;
          const effectiveWeek = getEffectiveWeek(nflState, league);
          const regularSeasonComplete = 
            leagueStatus === 'complete' || 
            parseInt(season) < currentSeasonYear ||
            (isCurrentSeason && effectiveWeek >= playoffWeekStart);
          
          if (regularSeasonComplete) {
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
              
              // Only include if has substantial points
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
          }
        } catch (err) {
          console.error(`Error processing season ${season}:`, err);
        }
      }
      
      // Get award winners from database
      const mvpWinners: TrophyWinner[] = [];
      const royWinners: TrophyWinner[] = [];
      const gmWinners: TrophyWinner[] = [];
      
      // Voting lock date - awards only shown after this date
      // Lock date is December 9, 2025 at 12pm EST for current season (2024)
      // For past seasons, we assume voting was locked at end of that season
      const currentYear = new Date().getFullYear();
      const LOCK_DATE = new Date("2025-12-09T12:00:00-05:00");
      const now = new Date();
      const isCurrentSeasonLocked = now >= LOCK_DATE;
      
      // Fetch award data for all seasons in this league chain
      for (const { leagueId: lid, season } of leagueIds) {
        // Only show award winners for past seasons or if current season voting is locked
        const seasonYear = parseInt(season);
        const isSeasonLocked = seasonYear < currentYear || (seasonYear === currentYear && isCurrentSeasonLocked);
        
        if (!isSeasonLocked) {
          continue; // Skip this season's awards - voting not locked yet
        }
        
        // Calculate winners for each award type
        for (const awardType of ['mvp', 'roy', 'gm'] as const) {
          try {
            const nominations = await storage.getAwardNominations(lid, season, awardType);
            const ballots = await storage.getAwardBallots(lid, season, awardType);
            
            if (nominations.length === 0 || ballots.length === 0) continue;
            
            // Calculate points for each nomination
            const points: Record<string, number> = {};
            ballots.forEach(ballot => {
              points[ballot.firstPlaceId] = (points[ballot.firstPlaceId] || 0) + 3;
              points[ballot.secondPlaceId] = (points[ballot.secondPlaceId] || 0) + 2;
              points[ballot.thirdPlaceId] = (points[ballot.thirdPlaceId] || 0) + 1;
            });
            
            // Find winner
            const sortedNominations = [...nominations].sort((a, b) => 
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
          } catch (err) {
            // No award data for this season/type
          }
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

  // Player Awards History - cross-season award counts per player
  app.get("/api/league/:leagueId/player-awards", async (req, res) => {
    try {
      const { leagueId } = req.params;

      // Walk dynasty chain
      const leagueIds: { leagueId: string; season: string }[] = [];
      let checkLeagueId: string | null = leagueId;
      while (checkLeagueId) {
        try {
          const leagueInfo = await getLeague(checkLeagueId);
          leagueIds.push({ leagueId: checkLeagueId, season: leagueInfo.season });
          checkLeagueId = (leagueInfo as any).previous_league_id || null;
        } catch { break; }
      }

      const allLeagueStartYear = 2025;
      const leagueIdsFromThisYear = leagueIds.filter(({ season }) => parseInt(season, 10) >= allLeagueStartYear);

      interface PlayerAwardCounts {
        votedMvps: number;
        championshipMvps: number;
        allLeague: number;
        allLeague1st: number;
        allLeague2nd: number;
        allLeague3rd: number;
        rookieOfYear: number;
        allRookie: number;
      }
      const awardMap = new Map<string, PlayerAwardCounts>();
      const getOrCreate = (pid: string): PlayerAwardCounts => {
        if (!awardMap.has(pid)) awardMap.set(pid, { votedMvps: 0, championshipMvps: 0, allLeague: 0, allLeague1st: 0, allLeague2nd: 0, allLeague3rd: 0, rookieOfYear: 0, allRookie: 0 });
        return awardMap.get(pid)!;
      };

      // Fetch players once (shared across all seasons)
      const players = await getAllPlayers().catch(() => ({} as Record<string, any>));

      for (const { leagueId: lid, season } of leagueIdsFromThisYear) {
        try {
          const [rosters, users, league, winnersBracket, losersBracket] = await Promise.all([
            getLeagueRosters(lid),
            getLeagueUsers(lid),
            getLeague(lid),
            getWinnersBracket(lid).catch(() => []),
            getLosersBracket(lid).catch(() => []),
          ]);

          const userMap = new Map<string, SleeperLeagueUser>();
          users.forEach((u: SleeperLeagueUser) => userMap.set(u.user_id, u));

          const getTeamInfoLocal = (rosterId: number) => {
            const roster = rosters.find((r: SleeperRoster) => r.roster_id === rosterId);
            const user = roster ? userMap.get(roster.owner_id) : null;
            return user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`;
          };

          const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
          const lastRegularWeek = playoffWeekStart - 1;

          // Fetch all matchup data for this season
          const allWeeks = 17;
          const matchupPromises = [];
          for (let w = 1; w <= allWeeks; w++) {
            matchupPromises.push(
              getLeagueMatchups(lid, w).then((matchups: any) => ({ week: w, matchups })).catch(() => ({ week: w, matchups: [] }))
            );
          }
          const allWeeklyMatchups = await Promise.all(matchupPromises);
          const regularMatchups = allWeeklyMatchups.filter(({ week }) => week <= lastRegularWeek);
          const playoffMatchups = allWeeklyMatchups.filter(({ week }) => week >= playoffWeekStart);

          // ── Championship MVP ────────────────────────────────────────────────
          const champGame = winnersBracket.find((m: any) => m.p === 1);
          const championRosterId = champGame?.w ?? null;
          if (champGame && champGame.t1 && champGame.t2 && championRosterId) {
            const champMakePair = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;
            const champPair = champMakePair(champGame.t1, champGame.t2);
            // Find which playoff week had the championship matchup
            for (const { week, matchups } of playoffMatchups) {
              const groups = new Map<number, any[]>();
              matchups.forEach((m: any) => {
                if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
                groups.get(m.matchup_id)!.push(m);
              });
              let found = false;
              groups.forEach(group => {
                if (found || group.length !== 2) return;
                const [m1, m2] = group;
                if (champMakePair(m1.roster_id, m2.roster_id) === champPair) {
                  const champRosterMatchup = group.find((m: any) => m.roster_id === championRosterId);
                  if (champRosterMatchup) {
                    const pp = champRosterMatchup.players_points || {};
                    const starters = champRosterMatchup.starters || [];
                    const best = starters.map((pid: string) => ({ pid, pts: pp[pid] ?? 0 })).sort((a: any, b: any) => b.pts - a.pts)[0];
                    if (best?.pid) getOrCreate(best.pid).championshipMvps++;
                    found = true;
                  }
                }
              });
              if (found) break;
            }
          }

          // ── All-League Teams ────────────────────────────────────────────────
          const rosterPositions = (league?.roster_positions || []).filter((p: string) => !["BN", "IR", "TAXI"].includes(p));
          const slotToPlayerPositions: Record<string, string[]> = { QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"], FLEX: ["RB", "WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"], WRRB: ["WR", "RB"], WRRBTE: ["WR", "RB", "TE"] };
          const allLeagueSlotOrder = rosterPositions.filter((s: string) => s !== "DEF");
          const flexSlotNames = ["FLEX", "SUPER_FLEX", "WRRB", "WRRBTE"];
          const isFlexSlotLocal = (s: string) => flexSlotNames.includes(s);

          const playerAvgAsStarter = new Map<string, { total: number; games: number; rosterId: number; position: string }>();
          regularMatchups.forEach(({ matchups }) => {
            matchups.forEach((m: any) => {
              const starters = m.starters || [];
              const pp = m.players_points || {};
              starters.forEach((pid: string) => {
                const pts = pp[pid] ?? 0;
                const pos = (players as any)[pid]?.position || "FLEX";
                const cur = playerAvgAsStarter.get(pid);
                if (!cur) playerAvgAsStarter.set(pid, { total: pts, games: 1, rosterId: m.roster_id, position: pos });
                else { cur.total += pts; cur.games++; }
              });
            });
          });

          const slotCounts = new Map<string, number>();
          allLeagueSlotOrder.forEach((s: string) => slotCounts.set(s, (slotCounts.get(s) || 0) + 1));
          const slotOrderUnique = allLeagueSlotOrder.filter((s: string, i: number) => allLeagueSlotOrder.indexOf(s) === i);
          const dedicatedSlots = slotOrderUnique.filter((s: string) => !isFlexSlotLocal(s));
          const flexSlots = slotOrderUnique.filter((s: string) => isFlexSlotLocal(s));
          const slotAssignments: Array<{ slot: string; team: 1 | 2 | 3 }> = [];
          for (let t = 1; t <= 3; t++) {
            dedicatedSlots.forEach((slot: string) => { const n = slotCounts.get(slot) || 0; for (let i = 0; i < n; i++) slotAssignments.push({ slot, team: t as 1 | 2 | 3 }); });
            flexSlots.forEach((slot: string) => { const n = slotCounts.get(slot) || 0; for (let i = 0; i < n; i++) slotAssignments.push({ slot, team: t as 1 | 2 | 3 }); });
          }
          const usedAllLeague = new Set<string>();
          slotAssignments.forEach(({ slot, team }) => {
            const positions = isFlexSlotLocal(slot) ? ["RB", "WR", "TE"] : (slotToPlayerPositions[slot] || [slot]);
            const candidates = Array.from(playerAvgAsStarter.entries())
              .filter(([pid, data]) => positions.includes(data.position) && data.games >= 1)
              .map(([pid, data]) => ({ pid, ...data }))
              .sort((a, b) => b.total - a.total);
            const pick = candidates.find(c => !usedAllLeague.has(c.pid));
            if (pick) {
              usedAllLeague.add(pick.pid);
              const ac = getOrCreate(pick.pid);
              ac.allLeague++;
              if (team === 1) ac.allLeague1st++;
              else if (team === 2) ac.allLeague2nd++;
              else if (team === 3) ac.allLeague3rd++;
            }
          });

          // ── All-Rookie Team ──────────────────────────────────────────────────
          const isRookieLocal = (pid: string) => {
            const p = (players as any)[pid];
            const exp = p?.years_exp;
            if (exp === undefined || exp === null) return false;
            const n = typeof exp === "string" ? parseInt(exp, 10) : exp;
            return n === 1;
          };
          const usedRookies = new Set<string>();
          allLeagueSlotOrder.forEach((slot: string) => {
            const positions = slotToPlayerPositions[slot] || [slot];
            const candidates = Array.from(playerAvgAsStarter.entries())
              .filter(([pid, data]) => positions.includes(data.position) && data.games >= 1 && isRookieLocal(pid))
              .map(([pid, data]) => ({ pid, ...data }))
              .sort((a, b) => b.total - a.total);
            const pick = candidates.find(c => !usedRookies.has(c.pid));
            if (pick) {
              usedRookies.add(pick.pid);
              getOrCreate(pick.pid).allRookie++;
            }
          });

          // ── Voted MVP + ROY ─────────────────────────────────────────────────
          for (const awardType of ['mvp', 'roy'] as const) {
            try {
              const nominations = await storage.getAwardNominations(lid, season, awardType);
              const ballots = await storage.getAwardBallots(lid, season, awardType);
              if (nominations.length === 0 || ballots.length === 0) continue;
              const points: Record<string, number> = {};
              ballots.forEach((ballot: any) => {
                points[ballot.firstPlaceId] = (points[ballot.firstPlaceId] || 0) + 3;
                points[ballot.secondPlaceId] = (points[ballot.secondPlaceId] || 0) + 2;
                points[ballot.thirdPlaceId] = (points[ballot.thirdPlaceId] || 0) + 1;
              });
              const sorted = [...nominations].sort((a: any, b: any) => (points[b.id] || 0) - (points[a.id] || 0));
              const winner = sorted[0];
              if (winner?.playerId && (points[winner.id] || 0) > 0) {
                const ac = getOrCreate(winner.playerId);
                if (awardType === 'mvp') ac.votedMvps++;
                else ac.rookieOfYear++;
              }
            } catch { /* no voting data for this season */ }
          }

        } catch (err) {
          console.error(`Error processing season ${season} for player awards:`, err);
        }
      }

      res.json(Object.fromEntries(awardMap));
    } catch (error) {
      console.error("Error fetching player awards:", error);
      res.status(500).json({ error: "Failed to fetch player awards" });
    }
  });
}
