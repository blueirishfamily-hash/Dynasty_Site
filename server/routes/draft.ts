// Draft odds order, draft picks and draft capital.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import {
  getLeague,
  getLeagueRosters,
  getLeagueUsers,
  getLeagueMatchups,
  getTradedPicks,
  getNFLState,
  getLeagueDrafts,
  getDraftPicks,
  getWinnersBracket,
  getLosersBracket,
  type SleeperLeagueUser,
  type SleeperMatchup,
} from "../sleeper";
import type { DraftPick } from "../../shared/schema";
import {
  getEffectiveWeek,
  isDraftComplete,
} from "./shared";

export function registerDraftRoutes(app: Express): void {
  // Get traded picks / draft capital (draft order from draft-odds logic: standings + max PF, bracket when postseason)
  /**
   * Rookie draft order from the Draft Odds rules (standings and max PF, then the playoff bracket once the postseason
   * starts). Slot 1 first. Used by the Draft Board and by the Contracts Hub until Sleeper assigns official slots.
   */
  async function computeDraftOddsOrder(leagueId: string) {
      const [tradedPicks, rosters, users, league, nflState, drafts] = await Promise.all([
        getTradedPicks(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getLeague(leagueId).catch(() => null),
        getNFLState(),
        getLeagueDrafts(leagueId).catch(() => []),
      ]);

      const userMap = new Map<string, SleeperLeagueUser>();
      users.forEach(u => userMap.set(u.user_id, u));

      const rosterOwnerMap = new Map<number, string>();
      rosters.forEach(r => {
        const user = userMap.get(r.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
        rosterOwnerMap.set(r.roster_id, teamName);
      });

      const playoffTeams = league?.settings?.playoff_teams ?? 6;
      const playoffWeekStart = (league?.settings as any)?.playoff_week_start ?? 15;
      const currentWeek = getEffectiveWeek(nflState, league);
      const regularSeasonWeeks = Math.max(1, playoffWeekStart - 1);

      // Max PF: regular season weeks only
      const matchupPromises: Promise<SleeperMatchup[]>[] = [];
      for (let week = 1; week <= regularSeasonWeeks; week++) {
        matchupPromises.push(getLeagueMatchups(leagueId, week).catch(() => []));
      }
      const allMatchups = await Promise.all(matchupPromises);
      const maxPfByRoster = new Map<number, number>();
      rosters.forEach(r => maxPfByRoster.set(r.roster_id, 0));
      allMatchups.forEach((weekMatchups, weekIndex) => {
        const matchupGroups = new Map<number, SleeperMatchup[]>();
        weekMatchups.forEach(m => {
          if (!matchupGroups.has(m.matchup_id)) matchupGroups.set(m.matchup_id, []);
          matchupGroups.get(m.matchup_id)!.push(m);
        });
        matchupGroups.forEach(group => {
          if (group.length !== 2) return;
          const [t1, t2] = group;
          const p1 = t1.points ?? 0;
          const p2 = t2.points ?? 0;
          const cur1 = maxPfByRoster.get(t1.roster_id) ?? 0;
          const cur2 = maxPfByRoster.get(t2.roster_id) ?? 0;
          maxPfByRoster.set(t1.roster_id, Math.max(cur1, p1));
          maxPfByRoster.set(t2.roster_id, Math.max(cur2, p2));
        });
      });

      // Standings: wins, pointsFor, maxPointsFor, rank
      const standingsList = rosters.map(r => ({
        rosterId: r.roster_id,
        wins: r.settings.wins,
        pointsFor: r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100,
        maxPointsFor: maxPfByRoster.get(r.roster_id) ?? r.settings.fpts + (r.settings.fpts_decimal ?? 0) / 100,
      }));
      standingsList.sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.pointsFor - a.pointsFor;
      });
      const rankByRoster = new Map<number, number>();
      standingsList.forEach((row, i) => rankByRoster.set(row.rosterId, i + 1));

      const NON_PLAYOFF_PICKS = 5;
      const totalTeams = rosters.length;

      // Draft order: 1..12 (roster_id for slot 1, 2, ... 12)
      let draftOrder: number[];
      // A league whose season is already over (an earlier league year) is always ranked on its final results.
      const leagueSeasonNum = parseInt(String(league?.season ?? ""), 10);
      const nflSeasonNum = parseInt(String(nflState?.season ?? ""), 10);
      const seasonIsPast = !Number.isNaN(leagueSeasonNum) && !Number.isNaN(nflSeasonNum) && leagueSeasonNum < nflSeasonNum;
      const isPostseason = seasonIsPast || currentWeek >= playoffWeekStart;

      if (isPostseason) {
        let bracket: Awaited<ReturnType<typeof getWinnersBracket>> | null = null;
        let losersBracket: Awaited<ReturnType<typeof getLosersBracket>> | null = null;
        try {
          [bracket, losersBracket] = await Promise.all([
            getWinnersBracket(leagueId).catch(() => null),
            getLosersBracket(leagueId).catch(() => null),
          ]);
        } catch (_) {}

        const bracketPickAssignment = new Map<number, number>(); // rosterId -> pick index (0-based)
        const allBracket = [...(bracket ?? []), ...(losersBracket ?? [])];
        const p7 = allBracket.find(m => m.p === 7);
        if (p7?.l != null) bracketPickAssignment.set(p7.l, NON_PLAYOFF_PICKS);
        const p5 = allBracket.find(m => m.p === 5);
        if (p5?.l != null) bracketPickAssignment.set(p5.l, NON_PLAYOFF_PICKS + 1);
        if (p5?.w != null) bracketPickAssignment.set(p5.w, NON_PLAYOFF_PICKS + 2);
        const p3 = allBracket.find(m => m.p === 3);
        if (p3?.l != null) bracketPickAssignment.set(p3.l, NON_PLAYOFF_PICKS + 3);
        if (p3?.w != null) bracketPickAssignment.set(p3.w, NON_PLAYOFF_PICKS + 4);
        const p1 = allBracket.find(m => m.p === 1);
        if (p1?.l != null) bracketPickAssignment.set(p1.l, totalTeams - 2);
        if (p1?.w != null) bracketPickAssignment.set(p1.w, totalTeams - 1);

        const bracketRosterIds = new Set(bracketPickAssignment.keys());
        const eliminated = standingsList
          .filter(row => !bracketRosterIds.has(row.rosterId))
          .sort((a, b) => a.maxPointsFor - b.maxPointsFor);
        const pickOrderRosterIds: number[] = [];
        eliminated.forEach(row => pickOrderRosterIds.push(row.rosterId));
        for (let slot = NON_PLAYOFF_PICKS; slot < totalTeams; slot++) {
          const rosterId = Array.from(bracketPickAssignment.entries()).find(([, idx]) => idx === slot)?.[0];
          if (rosterId != null) pickOrderRosterIds.push(rosterId);
        }
        draftOrder =
          pickOrderRosterIds.length >= totalTeams
            ? pickOrderRosterIds.slice(0, totalTeams)
            : rosters.map(r => r.roster_id);
      } else {
        const eliminated = standingsList
          .filter(row => (rankByRoster.get(row.rosterId) ?? 99) > playoffTeams)
          .sort((a, b) => a.maxPointsFor - b.maxPointsFor);
        const playoff = standingsList
          .filter(row => (rankByRoster.get(row.rosterId) ?? 99) <= playoffTeams)
          .sort((a, b) => (rankByRoster.get(b.rosterId) ?? 0) - (rankByRoster.get(a.rosterId) ?? 0));
        draftOrder = [...eliminated.map(r => r.rosterId), ...playoff.map(r => r.rosterId)];
      }

      if (draftOrder.length !== totalTeams) {
        draftOrder = rosters.map(r => r.roster_id);
      }
      return { draftOrder, tradedPicks, rosters, users, league, drafts, rosterOwnerMap };
  }

  app.get("/api/sleeper/league/:leagueId/draft-picks", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { draftOrder, tradedPicks, drafts, rosterOwnerMap } = await computeDraftOddsOrder(leagueId);

      const pickGrade = (round: number, slot: number): string => {
        if (round === 1) {
          if (slot <= 4) return "A+";
          if (slot <= 8) return "A";
          return "B+";
        }
        if (round === 2) {
          if (slot <= 6) return "B";
          return "C+";
        }
        return "C";
      };

      const currentYear = new Date().getFullYear();
      const years = [currentYear, currentYear + 1, currentYear + 2];
      // Use league draft round count (e.g. 3-round rookie draft); default 3 if no draft found
      const draftForRounds = drafts.find(d => d.season === String(currentYear)) ?? drafts[0];
      const numRounds = Math.max(1, draftForRounds?.settings?.rounds ?? 3);
      const rounds = Array.from({ length: numRounds }, (_, i) => i + 1);
      const allPicks: Array<DraftPick & { draftSlot?: number; grade?: string }> = [];
      
      years.forEach(year => {
        rounds.forEach(round => {
          draftOrder.forEach((rosterId, index) => {
            const slot = index + 1;
            const traded = tradedPicks.find(
              tp => tp.season === year.toString() && tp.round === round && tp.roster_id === rosterId
            );
            const originalOwnerId = rosterId;
            const currentOwnerId = traded ? traded.owner_id : rosterId;
            allPicks.push({
              id: `${year}-${round}-${rosterId}`,
              season: year.toString(),
              round,
              rosterId,
              originalOwnerId,
              currentOwnerId,
              originalOwnerName: rosterOwnerMap.get(originalOwnerId),
              currentOwnerName: rosterOwnerMap.get(currentOwnerId),
              draftSlot: slot,
              grade: pickGrade(round, slot),
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

  // Expected rookie contract value of each team's picks in this league year's rookie draft. The Contracts Hub shows it
  // (in purple, outside the cap) from the rollover until the draft is complete. Slots come from Sleeper once the
  // commissioner sets the draft order; until then from the Draft Odds order of the season that just finished.
  app.get("/api/league/:leagueId/draft-capital", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const league: any = await getLeague(leagueId);
      const season = parseInt(league?.season || "", 10) || new Date().getFullYear();
      const drafts = await getLeagueDrafts(leagueId).catch(() => [] as any[]);
      const draft: any = drafts.find(
        (d: any) => String(d.season) === String(season) && ["rookie", "linear", "snake"].includes(d.type),
      );

      if (draft && isDraftComplete(draft.status)) {
        // The first time the draft is seen complete, make sure every drafted rookie has a rookie contract.
        const syncKey = `rookie_sync_done_${season}`;
        if (!(await storage.getLeagueSetting(leagueId, syncKey))) {
          try {
            const { syncRookieContracts } = await import("../rookieContracts");
            await syncRookieContracts(leagueId);
            await storage.setLeagueSetting(leagueId, syncKey, "true");
          } catch (syncErr) {
            console.warn("[rookie-contracts] sync after draft skipped:", (syncErr as Error).message);
          }
        }
        // The board as it was drafted: who picked whom at each slot, and that slot's rookie contract.
        const { rookiePayScale } = await import("../rookieContracts");
        const picks = await getDraftPicks(draft.draft_id).catch(() => [] as any[]);
        const board = picks
          .map((p: any) => ({
            round: p.round,
            slot: p.draft_slot,
            ownerRosterId: p.roster_id,
            originalRosterId: p.roster_id,
            salary: rookiePayScale(p.round, p.draft_slot),
            playerId: p.player_id ? String(p.player_id) : null,
            playerName: [p.metadata?.first_name, p.metadata?.last_name].filter(Boolean).join(" ") || null,
            playerPosition: p.metadata?.position || null,
          }))
          .sort((a: any, b: any) => a.round - b.round || a.slot - b.slot);
        const byRoster: Record<number, { total: number; picks: Array<{ round: number; slot: number; salary: number; fromRosterId: number }> }> = {};
        for (const b of board) {
          if (b.salary <= 0) continue;
          const entry = (byRoster[b.ownerRosterId] ||= { total: 0, picks: [] });
          entry.total += b.salary;
          entry.picks.push({ round: b.round, slot: b.slot, salary: b.salary, fromRosterId: b.originalRosterId });
        }
        return res.json({ season, draftComplete: true, source: "complete", byRoster, board });
      }

      const rosters = await getLeagueRosters(leagueId);
      const rosterByOwner = new Map<string, number>();
      rosters.forEach(r => { if (r.owner_id) rosterByOwner.set(String(r.owner_id), r.roster_id); });

      let slotByRoster = new Map<number, number>();
      let source: "sleeper" | "projected" = "projected";
      const officialOrder = draft?.draft_order as Record<string, number> | null | undefined;
      if (officialOrder && Object.keys(officialOrder).length > 0) {
        for (const [ownerId, slot] of Object.entries(officialOrder)) {
          const rid = rosterByOwner.get(String(ownerId));
          if (rid != null) slotByRoster.set(rid, Number(slot));
        }
        source = "sleeper";
      }
      if (slotByRoster.size < rosters.length) {
        // No official slots yet: order by the season that just finished (the previous league once rolled over).
        slotByRoster = new Map();
        source = "projected";
        const prevId = league?.previous_league_id && league.previous_league_id !== "0" ? String(league.previous_league_id) : null;
        const { draftOrder, rosters: oddsRosters } = await computeDraftOddsOrder(prevId ?? leagueId);
        const ownerOfOddsRoster = new Map<number, string>();
        oddsRosters.forEach(r => ownerOfOddsRoster.set(r.roster_id, String(r.owner_id || "")));
        draftOrder.forEach((oddsRosterId, i) => {
          const owner = ownerOfOddsRoster.get(oddsRosterId);
          const rid = (owner ? rosterByOwner.get(owner) : undefined) ?? oddsRosterId;
          slotByRoster.set(rid, i + 1);
        });
      }

      const { rookiePayScale } = await import("../rookieContracts");
      const rounds = Math.max(1, Number(draft?.settings?.rounds) || 3);
      const traded = await getTradedPicks(leagueId).catch(() => [] as any[]);
      const byRoster: Record<number, { total: number; picks: Array<{ round: number; slot: number; salary: number; fromRosterId: number }> }> = {};
      const board: Array<{ round: number; slot: number; ownerRosterId: number; originalRosterId: number; salary: number; playerId: null; playerName: null; playerPosition: null }> = [];
      for (const [originalRosterId, slot] of slotByRoster) {
        for (let round = 1; round <= rounds; round++) {
          const trade = traded.find(
            (tp: any) => String(tp.season) === String(season) && tp.round === round && tp.roster_id === originalRosterId,
          );
          const owner = trade ? trade.owner_id : originalRosterId;
          const salary = rookiePayScale(round, slot);
          board.push({ round, slot, ownerRosterId: owner, originalRosterId, salary, playerId: null, playerName: null, playerPosition: null });
          if (salary <= 0) continue;
          const entry = (byRoster[owner] ||= { total: 0, picks: [] });
          entry.total += salary;
          entry.picks.push({ round, slot, salary, fromRosterId: originalRosterId });
        }
      }
      board.sort((a, b) => a.round - b.round || a.slot - b.slot);
      res.json({ season, draftComplete: false, source, byRoster, board });
    } catch (error) {
      console.error("Error computing draft capital:", error);
      res.status(500).json({ error: "Failed to compute draft capital" });
    }
  });
}
