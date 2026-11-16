// Reads the league registry tables (leagues, league_season_history). Read-only.
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { leaguesTable, leagueSeasonHistoryTable } from "../shared/schema";
import { createLeagueResolver, type LeagueContext, type LeagueRegistry } from "./middleware/league";

export const dbLeagueRegistry: LeagueRegistry = {
  async findBySleeperLeagueId(sleeperLeagueId: string): Promise<LeagueContext | null> {
    const rows = await db
      .select({ league: leaguesTable, season: leagueSeasonHistoryTable })
      .from(leagueSeasonHistoryTable)
      .innerJoin(leaguesTable, eq(leaguesTable.id, leagueSeasonHistoryTable.leagueId))
      .where(eq(leagueSeasonHistoryTable.sleeperLeagueId, sleeperLeagueId))
      .limit(1);
    return rows[0] ?? null;
  },

  async findBySlug(slug: string): Promise<LeagueContext | null> {
    const rows = await db
      .select({ league: leaguesTable, season: leagueSeasonHistoryTable })
      .from(leaguesTable)
      .innerJoin(
        leagueSeasonHistoryTable,
        and(eq(leagueSeasonHistoryTable.leagueId, leaguesTable.id), eq(leagueSeasonHistoryTable.status, "current")),
      )
      .where(eq(leaguesTable.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  },
};

/** The app's one league resolver. Call leagueResolver.invalidate() after adding a league or rolling one over. */
export const leagueResolver = createLeagueResolver(dbLeagueRegistry);
