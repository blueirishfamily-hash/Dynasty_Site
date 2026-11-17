// Season rollover (multi-league plan, "Season rollover"): attaching a league's next Sleeper season.
//
// What the rebuild fixes:
//  - The old league comes from the league being rolled (its own current row in league_season_history), not
//    from the site-wide active league.
//  - The new Sleeper league must link back to the old one (previous_league_id) and must not already belong to
//    any league. Checking only that the season number goes up by one could attach another league's season.
//  - Nothing is half-done. Every step before the switch writes only to the NEW league's keys (so nothing the
//    league is using changes) and is safe to run again. The switch itself (season history, the site-wide active
//    league and the migration record) is one database transaction at the end. If a step fails, the old league
//    stays current and running the rollover again resumes the same migration.
//  - A dry run reports what would move without writing anything.
//
// The database work is behind RolloverDeps (server/rolloverStore.ts), so the order of steps, the checks and
// the failure behavior can be tested without a database.

export interface SleeperLeagueLite {
  league_id: string;
  season: string;
  previous_league_id?: string | null;
}
export interface RosterLite {
  roster_id: number;
  owner_id: string | null;
}
export interface MappingInput {
  oldRosterId: number;
  newRosterId: number;
}
export interface RosterMapping extends MappingInput {
  type: "auto" | "manual";
}

export interface RolloverCounts {
  contracts: number;
  deadCap: number;
  extensions: number;
  bids: number;
}

export interface RolloverDeps {
  getSleeperLeague(id: string): Promise<SleeperLeagueLite>;
  getRosters(sleeperLeagueId: string): Promise<RosterLite[]>;
  /** The registry league that already has this Sleeper league ID in its season history, if any. */
  ownerOfSleeperId(sleeperLeagueId: string): Promise<{ leagueId: string } | null>;
  counts(oldSleeperLeagueId: string): Promise<RolloverCounts>;
  /** A sentence about the rules the new season will start with. */
  rulesNote(leagueId: string, newSeason: string): Promise<string>;

  // Writes. Everything up to commit() touches only the new league's data and can run again.
  beginMigration(input: { oldId: string; newId: string; oldSeason: string; newSeason: string; by: string }): Promise<{ id: string; resumed: boolean }>;
  saveMappings(migration: { id: string; oldId: string; newId: string }, mappings: RosterMapping[], by: string): Promise<void>;
  snapshotOldSeason(oldId: string, oldSeason: string, oldRosters: RosterLite[]): Promise<void>;
  copyData(oldId: string, newId: string, mappings: RosterMapping[]): Promise<{ contracts: number; deadCap: number; extensions: number }>;
  carryHubSettings(oldId: string, newId: string): Promise<void>;
  /** Pins the rules the new season starts with: the saved ones, or the current ones carried forward. */
  freezeRules(leagueId: string, newSeason: string, by: string): Promise<"saved" | "carried">;
  /** The one atomic step: season history, site-wide active league (when it is this league), migration record. */
  commit(input: { leagueId: string; oldId: string; newId: string; newSeason: string; migrationId: string; by: string; switchSiteActive: boolean }): Promise<void>;
  failMigration(migrationId: string, message: string): Promise<void>;
  /** After the switch. Returns warnings; failures here don't undo the rollover. */
  cleanupOldSeason(oldId: string): Promise<string[]>;
  audit(entry: { leagueId: string; action: string; details: Record<string, unknown> }): Promise<void>;
  invalidateCaches(): void;
}

export interface RolloverInput {
  league: { id: string; currentSleeperLeagueId: string; currentSeason: string };
  newSleeperLeagueId: string;
  manualMappings?: MappingInput[];
  /** Sleeper user ID of the commissioner, or "admin". */
  by: string;
  /** The old Sleeper league is the site-wide active league, so that setting moves too. */
  switchSiteActive: boolean;
}

export type ProblemCode =
  | "new_league_not_found"
  | "same_league"
  | "already_current"
  | "already_attached"
  | "belongs_to_other_league"
  | "not_next_season"
  | "season_mismatch"
  | "bad_mapping"
  | "unmatched_rosters"
  | "step_failed";

export interface Problem {
  code: ProblemCode;
  message: string;
  /** step_failed: the step that failed. */
  step?: string;
  unmatched?: Array<{ oldRosterId: number; ownerId: string | null }>;
}

export interface RolloverPlan {
  oldSeason: string;
  newSeason: string;
  mappings: RosterMapping[];
  counts: RolloverCounts;
  rulesNote: string;
  notes: string[];
}

export type RolloverResult =
  | { ok: false; problem: Problem }
  | { ok: true; dryRun: true; plan: RolloverPlan }
  | {
      ok: true;
      dryRun: false;
      migrationId: string;
      resumed: boolean;
      plan: RolloverPlan;
      moved: { contracts: number; deadCap: number; extensions: number };
      rules: "saved" | "carried";
      warnings: string[];
    };

const problem = (code: ProblemCode, message: string, extra: Partial<Problem> = {}): { ok: false; problem: Problem } => ({
  ok: false,
  problem: { code, message, ...extra },
});

/** Every check, with no writes. Returns the plan, or the first problem. */
export async function checkRollover(deps: RolloverDeps, input: RolloverInput): Promise<{ ok: true; plan: RolloverPlan } | { ok: false; problem: Problem }> {
  const oldId = input.league.currentSleeperLeagueId;
  const newId = input.newSleeperLeagueId.trim();
  if (!/^\d{6,25}$/.test(newId)) return problem("new_league_not_found", "Enter the new season's Sleeper league ID (digits only).");
  if (newId === oldId) return problem("same_league", "That's the league's current season. Enter the new season's Sleeper league ID.");

  // Which league owns the new Sleeper ID? Only a league's own next season can be attached.
  const owner = await deps.ownerOfSleeperId(newId);
  if (owner && owner.leagueId !== input.league.id) {
    return problem("belongs_to_other_league", "That Sleeper league already belongs to a different league on this site, so it can't be attached here.");
  }
  if (owner) return problem("already_attached", "That Sleeper league is already one of this league's seasons.");

  let newLeague: SleeperLeagueLite;
  let oldLeague: SleeperLeagueLite;
  try {
    [newLeague, oldLeague] = await Promise.all([deps.getSleeperLeague(newId), deps.getSleeperLeague(oldId)]);
  } catch {
    return problem("new_league_not_found", "Sleeper has no league with that ID.");
  }

  const oldSeason = Number(oldLeague.season);
  const newSeason = Number(newLeague.season);
  if (!Number.isInteger(oldSeason) || !Number.isInteger(newSeason) || newSeason !== oldSeason + 1) {
    return problem("season_mismatch", `Expected the ${oldSeason + 1} season, but that league is ${newLeague.season}.`);
  }
  // The link back is what proves it is this league's next season.
  if (String(newLeague.previous_league_id ?? "") !== oldId) {
    return problem(
      "not_next_season",
      "That Sleeper league isn't linked to this league's current season (its previous-season link doesn't point here). Renew the league in Sleeper instead of creating a new one.",
    );
  }

  const [oldRosters, newRosters] = await Promise.all([deps.getRosters(oldId), deps.getRosters(newId)]);
  const ownerToNew = new Map<string, number>();
  for (const r of newRosters) if (r.owner_id) ownerToNew.set(r.owner_id, r.roster_id);
  const oldIds = new Set(oldRosters.map((r) => r.roster_id));
  const newIds = new Set(newRosters.map((r) => r.roster_id));

  const byOld = new Map<number, RosterMapping>();
  for (const r of oldRosters) {
    const mapped = r.owner_id ? ownerToNew.get(r.owner_id) : undefined;
    if (mapped != null) byOld.set(r.roster_id, { oldRosterId: r.roster_id, newRosterId: mapped, type: "auto" });
  }
  for (const m of input.manualMappings ?? []) {
    if (!m || !oldIds.has(m.oldRosterId) || !newIds.has(m.newRosterId)) {
      return problem("bad_mapping", "A team mapping names a team that isn't in these leagues.");
    }
    byOld.set(m.oldRosterId, { oldRosterId: m.oldRosterId, newRosterId: m.newRosterId, type: "manual" });
  }
  const targets = Array.from(byOld.values()).map((m) => m.newRosterId);
  if (new Set(targets).size !== targets.length) return problem("bad_mapping", "Two teams are mapped to the same team in the new season.");

  const unmatched = oldRosters.filter((r) => !byOld.has(r.roster_id)).map((r) => ({ oldRosterId: r.roster_id, ownerId: r.owner_id }));
  if (unmatched.length > 0) {
    return problem("unmatched_rosters", "Some teams can't be matched to a team in the new season.", { unmatched });
  }

  const [counts, rulesNote] = await Promise.all([deps.counts(oldId), deps.rulesNote(input.league.id, String(newSeason))]);
  return {
    ok: true,
    plan: {
      oldSeason: String(oldSeason),
      newSeason: String(newSeason),
      mappings: Array.from(byOld.values()),
      counts,
      rulesNote,
      notes: [
        "The old season's standings, matchups, transactions and drafts are saved as history.",
        "Contracts, dead cap and extensions are copied to the new teams.",
        `Free agency bids for ${oldSeason} are cleared and the Contracts Hub restarts at the league year rollover.`,
        input.switchSiteActive ? "This league's active season on the site switches to the new one." : "This league's season on the site switches to the new one.",
      ],
    },
  };
}

/** Runs the rollover, or only reports what it would do. Safe to run again after a failure. */
export async function runRollover(deps: RolloverDeps, input: RolloverInput, options: { dryRun: boolean }): Promise<RolloverResult> {
  const checked = await checkRollover(deps, input);
  if (!checked.ok) return checked;
  const { plan } = checked;
  if (options.dryRun) return { ok: true, dryRun: true, plan };

  const oldId = input.league.currentSleeperLeagueId;
  const newId = input.newSleeperLeagueId.trim();
  const migration = await deps.beginMigration({ oldId, newId, oldSeason: plan.oldSeason, newSeason: plan.newSeason, by: input.by });

  let step = "start";
  try {
    step = "team mappings";
    await deps.saveMappings({ id: migration.id, oldId, newId }, plan.mappings, input.by);

    step = "saving the old season's history";
    const oldRosters = await deps.getRosters(oldId);
    await deps.snapshotOldSeason(oldId, plan.oldSeason, oldRosters);

    step = "copying contracts, dead cap and extensions";
    const moved = await deps.copyData(oldId, newId, plan.mappings);

    step = "carrying over Contracts Hub settings";
    await deps.carryHubSettings(oldId, newId);

    step = "pinning the new season's rules";
    const rules = await deps.freezeRules(input.league.id, plan.newSeason, input.by);

    // The switch. Before this, the old season is still the league's current one.
    step = "switching to the new season";
    await deps.commit({
      leagueId: input.league.id,
      oldId,
      newId,
      newSeason: plan.newSeason,
      migrationId: migration.id,
      by: input.by,
      switchSiteActive: input.switchSiteActive,
    });
    deps.invalidateCaches();

    const warnings = await deps.cleanupOldSeason(oldId).catch((e: any) => [`Cleanup of the old season failed: ${e?.message ?? e}`]);
    await deps.audit({
      leagueId: input.league.id,
      action: "season_rolled_over",
      details: {
        fromSeason: plan.oldSeason,
        toSeason: plan.newSeason,
        fromSleeperLeagueId: oldId,
        toSleeperLeagueId: newId,
        previousLinkMatches: true,
        migrationId: migration.id,
        resumed: migration.resumed,
        moved,
        rules,
        warnings: warnings.length ? warnings : undefined,
      },
    });
    return { ok: true, dryRun: false, migrationId: migration.id, resumed: migration.resumed, plan, moved, rules, warnings };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    await deps.failMigration(migration.id, `${step}: ${message}`).catch(() => {});
    return problem(
      "step_failed",
      `The rollover stopped while ${step}. Nothing was switched: the league is still on ${plan.oldSeason}. Run it again to resume. (${message})`,
      { step },
    );
  }
}
