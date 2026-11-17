import { describe, expect, it } from "vitest";
import { runRollover, type RolloverDeps, type RolloverInput, type RosterLite, type SleeperLeagueLite } from "./rollover";

// A small in-memory world: Sleeper leagues, the registry's season history, and what the rollover writes.
function world() {
  const sleeper = new Map<string, SleeperLeagueLite>();
  const rosters = new Map<string, RosterLite[]>();
  const ownerOf = new Map<string, string>(); // sleeper id -> registry league id (season history)
  const current = new Map<string, string>(); // registry league id -> current sleeper id
  const copied = new Map<string, { contracts: number; deadCap: number; extensions: number }>();
  const snapshots = new Map<string, number>(); // old sleeper id -> snapshot rows (replaced, not added)
  const migrations: Array<{ id: string; oldId: string; newId: string; status: string; error?: string }> = [];
  const mappingsSaved: string[] = [];
  const audits: any[] = [];
  const w = {
    sleeper, rosters, ownerOf, current, copied, snapshots, migrations, mappingsSaved, audits,
    siteActive: "1112025" as string | null,
    log: [] as string[],
    failOnce: null as null | "snapshots" | "copy" | "commit",
    cleanupFails: false,
  };

  const failIf = (which: "snapshots" | "copy" | "commit") => {
    if (w.failOnce === which) {
      w.failOnce = null;
      throw new Error(`${which} blew up`);
    }
  };

  const deps: RolloverDeps = {
    getSleeperLeague: async (id) => {
      const l = sleeper.get(id);
      if (!l) throw new Error("404");
      return l;
    },
    getRosters: async (id) => rosters.get(id) ?? [],
    ownerOfSleeperId: async (id) => (ownerOf.has(id) ? { leagueId: ownerOf.get(id)! } : null),
    counts: async () => ({ contracts: 40, deadCap: 3, extensions: 5, bids: 2 }),
    rulesNote: async () => "2027 rules saved by the commissioner.",
    beginMigration: async ({ oldId, newId }) => {
      w.log.push("begin");
      const open = migrations.find((m) => m.oldId === oldId && m.newId === newId && m.status !== "completed");
      if (open) {
        open.status = "in_progress";
        return { id: open.id, resumed: true };
      }
      const m = { id: `m${migrations.length + 1}`, oldId, newId, status: "in_progress" };
      migrations.push(m);
      return { id: m.id, resumed: false };
    },
    saveMappings: async (m) => { w.log.push("mappings"); mappingsSaved.push(m.id); },
    snapshotOldSeason: async (oldId) => {
      w.log.push("snapshots");
      failIf("snapshots");
      snapshots.set(oldId, 18); // replaced on every run
    },
    copyData: async (oldId, newId) => {
      w.log.push("copy");
      failIf("copy");
      const counts = { contracts: 40, deadCap: 3, extensions: 5 };
      copied.set(newId, counts); // clean slate: a rerun replaces, never doubles
      return counts;
    },
    carryHubSettings: async () => { w.log.push("hub"); },
    freezeRules: async () => { w.log.push("rules"); return "saved"; },
    commit: async ({ leagueId, newId, migrationId, switchSiteActive }) => {
      w.log.push("commit");
      failIf("commit"); // before any change: the transaction rolls back as a whole
      current.set(leagueId, newId);
      ownerOf.set(newId, leagueId);
      if (switchSiteActive) w.siteActive = newId;
      migrations.find((m) => m.id === migrationId)!.status = "completed";
    },
    failMigration: async (id, message) => {
      const m = migrations.find((x) => x.id === id)!;
      m.status = "failed";
      m.error = message;
    },
    cleanupOldSeason: async () => {
      w.log.push("cleanup");
      if (w.cleanupFails) throw new Error("bids table locked");
      return [];
    },
    audit: async (entry) => { audits.push(entry); },
    invalidateCaches: () => { w.log.push("invalidate"); },
  };

  /** League with a 2025 and (renewed) 2026 Sleeper season. */
  function addLeague(opts: { registryId: string; oldId: string; newId: string; owners: string[]; newOwners?: string[]; link?: string | null; newSeason?: string }) {
    sleeper.set(opts.oldId, { league_id: opts.oldId, season: "2025", previous_league_id: null });
    sleeper.set(opts.newId, { league_id: opts.newId, season: opts.newSeason ?? "2026", previous_league_id: opts.link === undefined ? opts.oldId : opts.link });
    rosters.set(opts.oldId, opts.owners.map((o, i) => ({ roster_id: i + 1, owner_id: o })));
    rosters.set(opts.newId, (opts.newOwners ?? opts.owners).map((o, i) => ({ roster_id: i + 1, owner_id: o })));
    ownerOf.set(opts.oldId, opts.registryId);
    current.set(opts.registryId, opts.oldId);
  }
  const input = (registryId: string, oldId: string, newId: string, extra: Partial<RolloverInput> = {}): RolloverInput => ({
    league: { id: registryId, currentSleeperLeagueId: oldId, currentSeason: "2025" },
    newSleeperLeagueId: newId,
    by: "commissioner-1",
    switchSiteActive: false,
    ...extra,
  });
  return { ...w, deps, addLeague, input, w };
}

const ATL = { registryId: "ATL", oldId: "1112025", newId: "1112026", owners: ["u1", "u2", "u3"] };
const FRIENDS = { registryId: "FRIENDS", oldId: "2222025", newId: "2222026", owners: ["f1", "f2"] };

describe("dry run", () => {
  it("reports what would move and writes nothing", async () => {
    const t = world();
    t.addLeague(ATL);
    const r = await runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: true });
    expect(r.ok && r.dryRun && r.plan).toMatchObject({
      oldSeason: "2025",
      newSeason: "2026",
      counts: { contracts: 40, deadCap: 3, extensions: 5, bids: 2 },
      rulesNote: "2027 rules saved by the commissioner.",
    });
    expect(r.ok && r.plan.mappings).toHaveLength(3);
    expect(t.log).toEqual([]);
    expect(t.migrations).toEqual([]);
    expect(t.current.get("ATL")).toBe("1112025");
  });
});

describe("checks before anything is written", () => {
  async function refused(setup: (t: ReturnType<typeof world>) => void, newId = "1112026") {
    const t = world();
    t.addLeague(ATL);
    setup(t);
    const r = await runRollover(t.deps, t.input("ATL", "1112025", newId), { dryRun: false });
    expect(t.log).toEqual([]); // not even the migration record
    expect(t.current.get("ATL")).toBe("1112025");
    return r;
  }

  it("requires the new Sleeper league to link back to the current one", async () => {
    const r = await refused((t) => t.sleeper.set("1112026", { league_id: "1112026", season: "2026", previous_league_id: "999999999" }));
    expect(!r.ok && r.problem.code).toBe("not_next_season");
    const none = await refused((t) => t.sleeper.set("1112026", { league_id: "1112026", season: "2026", previous_league_id: null }));
    expect(!none.ok && none.problem.code).toBe("not_next_season");
  });

  it("refuses a Sleeper league that already belongs to another league", async () => {
    const r = await refused((t) => { t.addLeague(FRIENDS); t.ownerOf.set("1112026", "FRIENDS"); });
    expect(!r.ok && r.problem.code).toBe("belongs_to_other_league");
  });

  it("refuses a season that isn't the next one", async () => {
    const r = await refused((t) => t.sleeper.set("1112026", { league_id: "1112026", season: "2027", previous_league_id: "1112025" }));
    expect(!r.ok && r.problem.code).toBe("season_mismatch");
  });

  it("refuses the current season, an unknown league and a malformed ID", async () => {
    expect((await refused(() => {}, "1112025"))).toMatchObject({ problem: { code: "same_league" } });
    expect((await refused(() => {}, "123456789"))).toMatchObject({ problem: { code: "new_league_not_found" } });
    expect((await refused(() => {}, "abc"))).toMatchObject({ problem: { code: "new_league_not_found" } });
  });

  it("lists teams it can't match, and accepts manual mappings", async () => {
    const t = world();
    t.addLeague({ ...ATL, newOwners: ["u1", "u2", "someone-new"] });
    const first = await runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: true });
    expect(!first.ok && first.problem.code).toBe("unmatched_rosters");
    expect(!first.ok && first.problem.unmatched).toEqual([{ oldRosterId: 3, ownerId: "u3" }]);
    const fixed = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { manualMappings: [{ oldRosterId: 3, newRosterId: 3 }] }), { dryRun: true });
    expect(fixed.ok && fixed.plan.mappings.find((m) => m.oldRosterId === 3)?.type).toBe("manual");
  });

  it("refuses bad or duplicate mappings", async () => {
    const t = world();
    t.addLeague({ ...ATL, newOwners: ["u1", "u2", "new"] });
    const bad = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { manualMappings: [{ oldRosterId: 9, newRosterId: 3 }] }), { dryRun: true });
    expect(!bad.ok && bad.problem.code).toBe("bad_mapping");
    const dup = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { manualMappings: [{ oldRosterId: 3, newRosterId: 1 }] }), { dryRun: true });
    expect(!dup.ok && dup.problem.code).toBe("bad_mapping");
  });
});

describe("running the rollover", () => {
  it("does the steps in order and switches last", async () => {
    const t = world();
    t.addLeague(ATL);
    const r = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false });
    expect(r.ok && !r.dryRun && r.moved).toEqual({ contracts: 40, deadCap: 3, extensions: 5 });
    expect(t.log).toEqual(["begin", "mappings", "snapshots", "copy", "hub", "rules", "commit", "invalidate", "cleanup"]);
    expect(t.current.get("ATL")).toBe("1112026");
    expect(t.w.siteActive).toBe("1112026");
    expect(t.migrations[0].status).toBe("completed");
    expect(t.audits[0]).toMatchObject({ leagueId: "ATL", action: "season_rolled_over", details: { fromSeason: "2025", toSeason: "2026", previousLinkMatches: true, rules: "saved" } });
  });

  it("refuses to run again once the season is attached", async () => {
    const t = world();
    t.addLeague(ATL);
    await runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: false });
    const again = await runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: false });
    expect(!again.ok && again.problem.code).toBe("already_attached");
  });

  it("a failure in cleanup doesn't undo the rollover", async () => {
    const t = world();
    t.addLeague(ATL);
    t.w.cleanupFails = true;
    const r = await runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: false });
    expect(r.ok && !r.dryRun && r.warnings[0]).toContain("Cleanup of the old season failed");
    expect(t.current.get("ATL")).toBe("1112026");
  });
});

describe("a failure halfway, then a resume", () => {
  for (const step of ["snapshots", "copy"] as const) {
    it(`fails while ${step}: nothing is switched, and running again resumes the same migration`, async () => {
      const t = world();
      t.addLeague(ATL);
      t.w.failOnce = step;
      const failed = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false });
      expect(!failed.ok && failed.problem.code).toBe("step_failed");
      expect(!failed.ok && failed.problem.message).toContain("Nothing was switched");
      expect(t.log).not.toContain("commit");
      expect(t.current.get("ATL")).toBe("1112025"); // the league is still on its old season
      expect(t.w.siteActive).toBe("1112025");
      expect(t.ownerOf.has("1112026")).toBe(false);
      expect(t.migrations).toHaveLength(1);
      expect(t.migrations[0].status).toBe("failed");
      expect(t.migrations[0].error).toContain(`${step} blew up`);

      const resumed = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false });
      expect(resumed.ok && !resumed.dryRun && resumed.resumed).toBe(true);
      expect(t.migrations).toHaveLength(1); // the same migration record, not a second one
      expect(t.migrations[0].status).toBe("completed");
      expect(t.current.get("ATL")).toBe("1112026");
      expect(t.w.siteActive).toBe("1112026");
      expect(t.snapshots.get("1112025")).toBe(18); // replaced, not doubled
      expect(t.copied.get("1112026")).toEqual({ contracts: 40, deadCap: 3, extensions: 5 });
    });
  }

  it("fails in the switch itself: all or nothing", async () => {
    const t = world();
    t.addLeague(ATL);
    t.w.failOnce = "commit";
    const failed = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false });
    expect(!failed.ok && failed.problem.step).toBe("switching to the new season");
    expect(t.current.get("ATL")).toBe("1112025");
    expect(t.w.siteActive).toBe("1112025");
    expect(t.migrations[0].status).toBe("failed");
    expect(t.log).not.toContain("cleanup"); // the old season's data is only touched after a successful switch
    const resumed = await runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false });
    expect(resumed.ok).toBe(true);
    expect(t.current.get("ATL")).toBe("1112026");
  });
});

describe("two leagues rolling over in the same week", () => {
  it("each moves only its own data, and only the site-active league moves the site setting", async () => {
    const t = world();
    t.addLeague(ATL);
    t.addLeague(FRIENDS);
    const [a, f] = await Promise.all([
      runRollover(t.deps, t.input("ATL", "1112025", "1112026", { switchSiteActive: true }), { dryRun: false }),
      runRollover(t.deps, t.input("FRIENDS", "2222025", "2222026", { switchSiteActive: false }), { dryRun: false }),
    ]);
    expect(a.ok && f.ok).toBe(true);
    expect(t.current.get("ATL")).toBe("1112026");
    expect(t.current.get("FRIENDS")).toBe("2222026");
    expect(t.w.siteActive).toBe("1112026"); // not overwritten by the other league's rollover
    expect(t.migrations.map((m) => [m.oldId, m.newId, m.status])).toEqual([
      ["1112025", "1112026", "completed"],
      ["2222025", "2222026", "completed"],
    ]);
    expect(Array.from(t.copied.keys()).sort()).toEqual(["1112026", "2222026"]);
  });

  it("one league failing doesn't hold up or undo the other", async () => {
    const t = world();
    t.addLeague(ATL);
    t.addLeague(FRIENDS);
    t.w.failOnce = "copy"; // whichever league copies first fails
    const results = await Promise.all([
      runRollover(t.deps, t.input("ATL", "1112025", "1112026"), { dryRun: false }),
      runRollover(t.deps, t.input("FRIENDS", "2222025", "2222026"), { dryRun: false }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rolled = ["ATL", "FRIENDS"].filter((id) => t.current.get(id) !== (id === "ATL" ? "1112025" : "2222025"));
    expect(rolled).toHaveLength(1);
  });

  it("a league can't attach the other league's new season", async () => {
    const t = world();
    t.addLeague(ATL);
    t.addLeague(FRIENDS);
    const r = await runRollover(t.deps, t.input("ATL", "1112025", "2222026"), { dryRun: false });
    expect(!r.ok && r.problem.code).toBe("not_next_season"); // 2222026 links to 2222025, not 1112025
    expect(t.log).toEqual([]);
  });
});
