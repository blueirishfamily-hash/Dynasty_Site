// The database side of the season rollover (see server/rollover.ts for the order and the failure behavior).
//
// Everything before commit() writes only the NEW league's keys, or replaces the old season's own history
// snapshots, so each step can run again after a failure. commit() is a single transaction.
import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  activeLeaguesTable,
  deadCapEntriesTable,
  draftSnapshotsTable,
  leagueMigrationsTable,
  leagueSeasonHistoryTable,
  matchupSnapshotsTable,
  playerBidsTable,
  playerContractsTable,
  rosterMappingsTable,
  standingsSnapshotsTable,
  teamExtensionsTable,
  teamStatsSnapshotsTable,
  transactionSnapshotsTable,
} from "../shared/schema";
import {
  getDraftPicks,
  getLeague,
  getLeagueDrafts,
  getLeagueMatchups,
  getLeagueRosters,
  getLeagueTransactions,
  getLeagueUsers,
  getNFLState,
  type SleeperMatchup,
} from "./sleeper";
import { getEffectiveWeek } from "./routes/shared";
import { freezeRulesForSeason, rulesRows } from "./leagueRules";
import { leagueResolver } from "./leagueRegistry";
import { registeredSleeperIds, writeAudit } from "./security/store";
import type { RolloverDeps } from "./rollover";

const count = async (table: any, where: any): Promise<number> => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return Number(row?.n ?? 0);
};

/** Replaces the old season's history snapshots: clears what an earlier attempt wrote, then writes them again. */
async function clearSeasonSnapshots(leagueId: string, season: string) {
  for (const table of [standingsSnapshotsTable, teamStatsSnapshotsTable, matchupSnapshotsTable, transactionSnapshotsTable, draftSnapshotsTable] as const) {
    await db.delete(table).where(and(eq((table as any).leagueId, leagueId), eq((table as any).season, season)));
  }
}

async function writeSeasonSnapshots(oldLeagueId: string, oldRosters: Array<{ roster_id: number; owner_id: string | null }>, baseUrl: string) {
  const oldLeague = await getLeague(oldLeagueId);
  const nflState = await getNFLState();
  const effectiveWeek = getEffectiveWeek(nflState, oldLeague);

  const users = await getLeagueUsers(oldLeagueId);
  const userMap = new Map(users.map((u) => [u.user_id, u]));
  const rosterTotals = new Map<number, { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }>();
  oldRosters.forEach((r) => rosterTotals.set(r.roster_id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 }));

  for (let week = 1; week <= effectiveWeek; week++) {
    const matchups = await getLeagueMatchups(oldLeagueId, week).catch(() => []);
    const groups = new Map<number, SleeperMatchup[]>();
    matchups.forEach((m) => {
      if (!groups.has(m.matchup_id)) groups.set(m.matchup_id, []);
      groups.get(m.matchup_id)!.push(m);
    });
    groups.forEach((group) => {
      if (group.length !== 2) return;
      const [t1, t2] = group;
      const score1 = t1.points || 0;
      const score2 = t2.points || 0;
      const r1 = rosterTotals.get(t1.roster_id);
      const r2 = rosterTotals.get(t2.roster_id);
      if (!r1 || !r2) return;
      r1.pointsFor += score1;
      r1.pointsAgainst += score2;
      r2.pointsFor += score2;
      r2.pointsAgainst += score1;
      if (score1 > score2) { r1.wins += 1; r2.losses += 1; }
      else if (score2 > score1) { r2.wins += 1; r1.losses += 1; }
      else if (score1 !== 0 || score2 !== 0) { r1.ties += 1; r2.ties += 1; }
    });

    const standingsData = oldRosters.map((r) => {
      const totals = rosterTotals.get(r.roster_id);
      const owner = r.owner_id ? userMap.get(r.owner_id) : undefined;
      return {
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        name: owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`,
        wins: totals?.wins || 0,
        losses: totals?.losses || 0,
        ties: totals?.ties || 0,
        pointsFor: totals?.pointsFor || 0,
        pointsAgainst: totals?.pointsAgainst || 0,
        week,
      };
    }).sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));

    await storage.createStandingsSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, week, snapshotType: "weekly", standingsData: JSON.stringify(standingsData) });
    for (const [rosterId, totals] of Array.from(rosterTotals.entries())) {
      await storage.createTeamStatsSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, week, rosterId, statsData: JSON.stringify(totals) });
    }
    await storage.createMatchupSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, week, matchupData: JSON.stringify(matchups) });
    const weekTransactions = await getLeagueTransactions(oldLeagueId, week).catch(() => []);
    await storage.createTransactionSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, week, transactionData: JSON.stringify(weekTransactions) });
    // Per-week player stats snapshots are skipped (too slow); the end-of-season aggregate is used instead.
  }

  await storage.createStandingsSnapshot({
    leagueId: oldLeagueId,
    season: oldLeague.season,
    week: null,
    snapshotType: "end_of_season",
    standingsData: JSON.stringify(Array.from(rosterTotals.entries()).map(([rosterId, totals]) => ({ rosterId, ...totals }))),
  });
  for (const [rosterId, totals] of Array.from(rosterTotals.entries())) {
    await storage.createTeamStatsSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, week: null, rosterId, statsData: JSON.stringify(totals) });
  }

  const drafts = await getLeagueDrafts(oldLeagueId).catch(() => []);
  for (const draft of drafts.filter((d) => d.status === "complete")) {
    const picks = await getDraftPicks(draft.draft_id).catch(() => []);
    await storage.createDraftSnapshot({ leagueId: oldLeagueId, season: oldLeague.season, draftId: draft.draft_id, draftData: JSON.stringify(draft), picksData: JSON.stringify(picks) });
  }

  // Year recap and metrics for historical viewing (read from the app's own endpoints). These two are upserts,
  // and a failure here is not fatal: the history page can build them from Sleeper later.
  try {
    const [yearRecapRes, teamLuckRes, heatCheckRes, powerRankingsRes] = await Promise.all([
      fetch(`${baseUrl}/api/league/${oldLeagueId}/year-recap`),
      fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/team-luck`),
      fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/heat-check`),
      fetch(`${baseUrl}/api/sleeper/league/${oldLeagueId}/power-rankings`),
    ]);
    if (yearRecapRes.ok) await storage.upsertYearRecapSnapshot(oldLeagueId, oldLeague.season, JSON.stringify(await yearRecapRes.json()));
    if (teamLuckRes.ok && heatCheckRes.ok && powerRankingsRes.ok) {
      const [teamLuck, heatCheck, powerRankings] = await Promise.all([teamLuckRes.json(), heatCheckRes.json(), powerRankingsRes.json()]);
      await storage.upsertMetricsSnapshot(oldLeagueId, oldLeague.season, JSON.stringify(teamLuck), JSON.stringify(heatCheck), JSON.stringify(powerRankings));
    }
  } catch (err) {
    console.error("[Rollover] Year recap and metrics snapshots skipped (non-fatal):", err);
  }
}

export function createDbRolloverDeps(options: { baseUrl: string; actor: { actorRole: "admin" | "commissioner"; actorSleeperUserId: string | null } }): RolloverDeps {
  return {
    getSleeperLeague: (id) => getLeague(id),
    getRosters: async (id) => (await getLeagueRosters(id)).map((r) => ({ roster_id: r.roster_id, owner_id: r.owner_id ?? null })),
    ownerOfSleeperId: async (id) => {
      const rows = await registeredSleeperIds([id]);
      return rows[0] ? { leagueId: rows[0].leagueId } : null;
    },
    counts: async (oldId) => ({
      contracts: await count(playerContractsTable, eq(playerContractsTable.leagueId, oldId)),
      deadCap: await count(deadCapEntriesTable, eq(deadCapEntriesTable.leagueId, oldId)),
      extensions: await count(teamExtensionsTable, eq(teamExtensionsTable.leagueId, oldId)),
      bids: await count(playerBidsTable, eq(playerBidsTable.leagueId, oldId)),
    }),
    rulesNote: async (leagueId, newSeason) => {
      const saved = (await rulesRows(leagueId)).some((r) => r.season === newSeason);
      return saved
        ? `The ${newSeason} rules the commissioner saved take effect.`
        : `No ${newSeason} rules were saved, so ${newSeason} keeps ${Number(newSeason) - 1}'s rules.`;
    },

    beginMigration: async ({ oldId, newId, oldSeason, newSeason, by }) => {
      const [open] = await db
        .select()
        .from(leagueMigrationsTable)
        .where(and(eq(leagueMigrationsTable.oldLeagueId, oldId), eq(leagueMigrationsTable.newLeagueId, newId), inArray(leagueMigrationsTable.status, ["in_progress", "failed"])))
        .limit(1);
      if (open) {
        // Resume: the same migration record, with its team mappings written again from scratch.
        await db.update(leagueMigrationsTable).set({ status: "in_progress", errorMessage: null, migratedBy: by }).where(eq(leagueMigrationsTable.id, open.id));
        await db.delete(rosterMappingsTable).where(eq(rosterMappingsTable.migrationId, open.id));
        return { id: open.id, resumed: true };
      }
      const created = await storage.createLeagueMigration({ oldLeagueId: oldId, newLeagueId: newId, oldSeason, newSeason, migratedBy: by, status: "in_progress" });
      return { id: created.id, resumed: false };
    },
    saveMappings: async (migration, mappings, by) => {
      for (const m of mappings) {
        await storage.createRosterMapping({
          migrationId: migration.id,
          oldLeagueId: migration.oldId,
          oldRosterId: m.oldRosterId,
          newLeagueId: migration.newId,
          newRosterId: m.newRosterId,
          mappingType: m.type,
          mappedBy: m.type === "manual" ? by : null,
        });
      }
    },
    snapshotOldSeason: async (oldId, oldSeason, oldRosters) => {
      await clearSeasonSnapshots(oldId, oldSeason);
      await writeSeasonSnapshots(oldId, oldRosters, options.baseUrl);
    },
    copyData: async (oldId, newId, mappings) => {
      // Each of these clears the new league's rows before copying, so running them again replaces, never doubles.
      const byOld = new Map(mappings.map((m) => [m.oldRosterId, { newRosterId: m.newRosterId }]));
      const deadCap = await storage.migrateDeadCapEntries(oldId, newId, byOld);
      const extensions = await storage.migrateTeamExtensions(oldId, newId, byOld);
      const contracts = await storage.migratePlayerContracts(oldId, newId, byOld);
      return { contracts: contracts.copied, deadCap: deadCap.copied, extensions: extensions.copied };
    },
    carryHubSettings: async (oldId, newId) => {
      // The new league year starts in the rollover phase, ready for free agency.
      const { startNewLeagueYear } = await import("./contractHubRoutes");
      await startNewLeagueYear(oldId, newId);
    },
    freezeRules: (leagueId, newSeason, by) => freezeRulesForSeason(leagueId, newSeason, by),

    commit: async ({ leagueId, oldId, newId, newSeason, migrationId, by, switchSiteActive }) => {
      const now = Date.now();
      await db.transaction(async (tx) => {
        await tx
          .update(leagueSeasonHistoryTable)
          .set({ status: "past" })
          .where(and(eq(leagueSeasonHistoryTable.leagueId, leagueId), eq(leagueSeasonHistoryTable.status, "current")));
        await tx.insert(leagueSeasonHistoryTable).values({
          id: randomUUID(),
          leagueId,
          season: newSeason,
          sleeperLeagueId: newId,
          previousSleeperLeagueId: oldId,
          status: "current",
          rolledOverAt: now,
          rolledOverBy: by,
          migrationId,
        });
        if (switchSiteActive) {
          await tx.update(activeLeaguesTable).set({ isActive: 0, deactivatedAt: now }).where(eq(activeLeaguesTable.leagueId, oldId));
          await tx
            .insert(activeLeaguesTable)
            .values({ id: randomUUID(), leagueId: newId, season: newSeason, isActive: 1, activatedAt: now, deactivatedAt: null })
            .onConflictDoUpdate({ target: activeLeaguesTable.leagueId, set: { season: newSeason, isActive: 1, activatedAt: now, deactivatedAt: null } });
        }
        await tx.update(leagueMigrationsTable).set({ status: "completed", errorMessage: null }).where(eq(leagueMigrationsTable.id, migrationId));
      });
    },
    failMigration: async (id, message) => {
      await db.update(leagueMigrationsTable).set({ status: "failed", errorMessage: message.slice(0, 1000) }).where(eq(leagueMigrationsTable.id, id));
    },
    cleanupOldSeason: async (oldId) => {
      const warnings: string[] = [];
      try {
        await storage.deleteAllPlayerBids(oldId);
      } catch (e: any) {
        warnings.push(`Old free agency bids weren't cleared: ${e?.message ?? e}`);
      }
      try {
        // They stay in the database but no longer show on the Rule Changes tab.
        await storage.archiveRuleSuggestions(oldId);
      } catch (e: any) {
        warnings.push(`Old rule suggestions weren't archived: ${e?.message ?? e}`);
      }
      return warnings;
    },
    audit: async ({ leagueId, action, details }) => {
      await writeAudit({ leagueId, ...options.actor, action, details });
    },
    invalidateCaches: () => leagueResolver.invalidate(),
  };
}
