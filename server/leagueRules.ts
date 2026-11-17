// Per-league rules from league_rules. Routes call rulesForSleeperLeague(): the rules in effect for the
// season that Sleeper league ID belongs to, never a global value, so one league's rules can't reach another.
import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { leagueRulesTable } from "../shared/schema";
import { atlDynastyRules, rulesForSeason, type LeagueRules } from "../shared/leagueRules";
import { leagueResolver } from "./leagueRegistry";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; rows: Array<{ season: string; rules: unknown; updatedBy: string; updatedAt: number }> }>();

export async function rulesRows(leagueId: string) {
  const hit = cache.get(leagueId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows = await db
    .select({ season: leagueRulesTable.season, rules: leagueRulesTable.rules, updatedBy: leagueRulesTable.updatedBy, updatedAt: leagueRulesTable.updatedAt })
    .from(leagueRulesTable)
    .where(eq(leagueRulesTable.leagueId, leagueId))
    .orderBy(asc(leagueRulesTable.season));
  cache.set(leagueId, { at: Date.now(), rows });
  return rows;
}

/** The rules in effect for a league in a season. */
export async function leagueRulesFor(leagueId: string, season: string) {
  return rulesForSeason(await rulesRows(leagueId), season);
}

/**
 * The rules for the season this Sleeper league ID belongs to. An unregistered league, or an unreachable
 * registry, gets ATL Dynasty's rules, which is what every league used before per-league rules.
 */
export async function rulesForSleeperLeague(sleeperLeagueId: string): Promise<LeagueRules> {
  try {
    const found = await leagueResolver.resolve(sleeperLeagueId);
    if (found.status !== "ok") return atlDynastyRules();
    return (await leagueRulesFor(found.context.league.id, found.context.season.season)).rules;
  } catch (error) {
    console.error("[Rules] Could not read league rules; using ATL Dynasty's:", error);
    return atlDynastyRules();
  }
}

export async function saveRulesRow(leagueId: string, season: string, rules: LeagueRules, updatedBy: string, now = Date.now()) {
  await db
    .insert(leagueRulesTable)
    .values({ id: randomUUID(), leagueId, season, rules, updatedBy, updatedAt: now })
    .onConflictDoUpdate({ target: [leagueRulesTable.leagueId, leagueRulesTable.season], set: { rules, updatedBy, updatedAt: now } });
  cache.delete(leagueId);
}

export async function deleteRulesRow(leagueId: string, season: string) {
  await db.delete(leagueRulesTable).where(and(eq(leagueRulesTable.leagueId, leagueId), eq(leagueRulesTable.season, season)));
  cache.delete(leagueId);
}

/**
 * Pins the rules a season starts with, at rollover: the rules the commissioner saved for it, or the current
 * rules carried forward. Without a row of its own, a season would pick up later changes to an earlier one.
 */
export async function freezeRulesForSeason(leagueId: string, season: string, by: string): Promise<"saved" | "carried"> {
  cache.delete(leagueId);
  const rows = await rulesRows(leagueId);
  if (rows.some((r) => r.season === season)) return "saved";
  await saveRulesRow(leagueId, season, rulesForSeason(rows, season).rules, by);
  return "carried";
}
