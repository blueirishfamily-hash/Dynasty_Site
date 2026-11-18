// Cross-league mismatch tests and the season rollover on real rows (multi-league plan, "Risks and questions").
// Needs the separate test database: npm run test:db. Skips itself without .env.test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { READY, startTestEnv, type Device, type SeededLeague, type TestEnv } from "./harness";

function leagueWriteRoutes(): Array<{ method: string; path: string }> {
  const root = path.resolve(__dirname, "..");
  const files = [
    ...fs.readdirSync(path.join(root, "routes")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => path.join(root, "routes", f)),
    path.join(root, "contractHubRoutes.ts"),
    path.join(root, "commissionerEdits.ts"),
    path.join(root, "positionRadar.ts"),
  ];
  const out: Array<{ method: string; path: string }> = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/app\.(post|put|patch|delete)\(\s*"(\/api\/leagues?\/:leagueId\/[^"]*)"/g)) {
      out.push({ method: m[1].toUpperCase(), path: m[2] });
    }
  }
  return out;
}

const cookieName = (prefix: string, id: string) => `${prefix}${id.replace(/[^A-Za-z0-9-]/g, "")}`;

describe.skipIf(!READY)("league separation and rollover (needs .env.test)", () => {
  let env: TestEnv;
  let A: SeededLeague;
  let B: SeededLeague;
  /** Joined league A and unlocked A's commissioner PIN. */
  let allA: Device;

  const count = async (table: any, where: any): Promise<number> => {
    const [r] = await env.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
    return Number(r?.n ?? 0);
  };

  beforeAll(async () => {
    env = await startTestEnv();
    A = await env.seedLeague({ key: "a", season: "2026", teams: 2 });
    B = await env.seedLeague({ key: "b", season: "2026", teams: 2, rosterBase: 10 });
    allA = env.device();
    await env.join(allA, A);
    await env.unlockCommissioner(allA, A);
  });

  afterAll(async () => {
    await env?.cleanup();
    // The test database should be left as it was found.
    const left = env ? await count(schema.leaguesTable, sql`${schema.leaguesTable.slug} like 'itest-%'`) : 0;
    await env?.stop();
    expect(left).toBe(0);
  });

  // ─── Writes ──────────────────────────────────────────────────────────────────

  describe("writes", () => {
    it("every league write route, called with league A's address and league B's Sleeper ID, is refused", async () => {
      const routes = leagueWriteRoutes();
      expect(routes.length).toBeGreaterThanOrEqual(55);
      const bad: string[] = [];
      for (const r of routes) {
        const p = r.path.replace(":leagueId", B.current).replace(/:[A-Za-z]+/g, "x");
        const res = await allA.call(r.method, p, { body: r.method === "DELETE" ? undefined : {}, headers: { "X-League": A.slug } });
        if (res.status !== 409) bad.push(`${r.method} ${r.path} -> ${res.status}`);
      }
      expect(bad).toEqual([]);
    });

    it("league A's device and unlocked commissioner can't write to league B by its Sleeper ID alone", async () => {
      const bad: string[] = [];
      for (const r of leagueWriteRoutes()) {
        const p = r.path.replace(":leagueId", B.current).replace(/:[A-Za-z]+/g, "x");
        const res = await allA.call(r.method, p, { body: r.method === "DELETE" ? undefined : {} });
        if (res.status !== 403 || res.body?.code !== "join_required") bad.push(`${r.method} ${r.path} -> ${res.status} ${res.body?.code ?? ""}`);
      }
      expect(bad).toEqual([]);
    });

    it("a rule vote is checked against the rule's own league", async () => {
      const ruleId = randomUUID();
      await env.db.insert(schema.ruleSuggestionsTable).values({
        id: ruleId, leagueId: B.current, authorId: "x", authorName: "x", rosterId: 10, title: "B's rule", description: "d",
        status: "pending", voteType: "binary", createdAt: Date.now(),
      });
      const withA = await allA.post(`/api/rule-suggestions/${ruleId}/vote`, { rosterId: 1, voterName: "v", vote: "yes" }, { "X-League": A.slug });
      expect(withA.status).toBe(409);
      const bare = await allA.post(`/api/rule-suggestions/${ruleId}/vote`, { rosterId: 1, voterName: "v", vote: "yes" });
      expect([bare.status, bare.body.code]).toEqual([403, "join_required"]);
      const toggle = await allA.post(`/api/rule-suggestions/${ruleId}/toggle-voting`, { leagueId: A.current, enabled: true });
      expect(toggle.status).toBeGreaterThanOrEqual(400); // names league A, but the rule is league B's: never a 2xx
    });

    it("a team from another league is refused, and a team in the league is accepted", async () => {
      const wrong = await allA.post(`/api/league/${A.current}/suggestions`, { authorId: "x", authorName: "x", content: "hi", rosterId: 10 });
      expect([wrong.status, wrong.body.code]).toEqual([403, "roster_not_in_league"]);
      const right = await allA.post(`/api/league/${A.current}/suggestions`, { authorId: "x", authorName: "x", content: "hi", rosterId: 1 });
      expect(right.status).toBe(200);
      expect(await count(schema.suggestionsTable, eq(schema.suggestionsTable.leagueId, A.current))).toBe(1);
      expect(await count(schema.suggestionsTable, eq(schema.suggestionsTable.leagueId, B.current))).toBe(0);
    });

    it("a ballot can't use another league's nominations", async () => {
      await env.modules.storage.setLeagueSetting(A.current, "award_voting_master", "true");
      const mk = async (league: string, name: string) => {
        const id = randomUUID();
        await env.db.insert(schema.awardNominationsTable).values({
          id, leagueId: league, season: "2026", awardType: "mvp", playerId: name, playerName: name, playerPosition: "QB", playerTeam: "KC",
          nominatedBy: "x", nominatedByName: "x", nominatedByRosterId: league === A.current ? 1 : 10, createdAt: Date.now(),
        });
        return id;
      };
      const [b1, b2, b3] = [await mk(B.current, "b1"), await mk(B.current, "b2"), await mk(B.current, "b3")];
      const [a1, a2, a3] = [await mk(A.current, "a1"), await mk(A.current, "a2"), await mk(A.current, "a3")];
      const url = `/api/league/${A.current}/awards/2026/mvp/ballot`;
      const foreign = await allA.post(url, { rosterId: 1, voterName: "v", firstPlaceId: b1, secondPlaceId: b2, thirdPlaceId: b3 });
      expect([foreign.status, foreign.body.error]).toEqual([400, "Invalid nomination ID"]);
      const mixed = await allA.post(url, { rosterId: 1, voterName: "v", firstPlaceId: a1, secondPlaceId: b2, thirdPlaceId: a3 });
      expect(mixed.status).toBe(400);
      const own = await allA.post(url, { rosterId: 1, voterName: "v", firstPlaceId: a1, secondPlaceId: a2, thirdPlaceId: a3 });
      expect(own.status).toBe(200); // the control: the same request with its own nominations works
    });

    it("league A's commissioner can't change league B's contracts by roster and player", async () => {
      const prev = { fifthYearOption: null, isOnIr: 0, franchiseTagUsed: 0, franchiseTagYear: null, originalContractYears: 2, isRookieContract: 0, extensionApplied: 0, extensionYear: null, extensionSalary: null, hasBeenExtended: 0, hasBeenFranchiseTagged: 0 };
      await env.modules.storage.upsertPlayerContract({ leagueId: B.current, rosterId: 10, playerId: "10001", salaries: JSON.stringify({ "2026": 100 }), ...prev } as any);
      const res = await allA.del(`/api/league/${A.current}/contracts/10/10001`);
      expect(res.status).toBe(200); // it deletes nothing in league A...
      expect(await count(schema.playerContractsTable, and(eq(schema.playerContractsTable.leagueId, B.current), eq(schema.playerContractsTable.playerId, "10001")))).toBe(1); // ...and league B's contract is untouched
    });
  });

  // ─── PINs and devices ────────────────────────────────────────────────────────

  describe("PINs and device tokens", () => {
    it("league A's commissioner unlock is refused in league B, under either cookie name", async () => {
      const token = allA.jar.get(cookieName("ul_c_", A.registryId))!;
      expect(token).toBeTruthy();
      const own = await allA.patch(`/api/registry/leagues/${A.slug}/settings`, { joinGraceDays: 0 });
      expect(own.status).toBe(200); // the control: it works in league A

      const underOwnName = env.device();
      underOwnName.jar.set(cookieName("ul_c_", A.registryId), token);
      const r1 = await underOwnName.patch(`/api/registry/leagues/${B.slug}/settings`, { joinGraceDays: 0 });
      expect([r1.status, r1.body.code]).toEqual([401, "commissioner_unlock_required"]);

      const underBName = env.device();
      underBName.jar.set(cookieName("ul_c_", B.registryId), token); // A's token presented as B's
      const r2 = await underBName.patch(`/api/registry/leagues/${B.slug}/settings`, { joinGraceDays: 0 });
      expect([r2.status, r2.body.code]).toEqual([401, "commissioner_unlock_required"]);
      const r3 = await underBName.put(`/api/registry/leagues/${B.slug}/rules/next`, { rules: { salaryCap: 999 } });
      expect(r3.status).toBe(401);
    });

    it("a commissioner with no PIN sets their own once, and the first set wins", async () => {
      const co = `9${Date.now()}`.slice(0, 20);
      await env.db.insert(schema.leagueCommissionersTable).values({
        id: randomUUID(), leagueId: A.registryId, sleeperUserId: co, role: "co", pinHash: null, pinSetAt: null, addedBy: "itest", addedAt: Date.now(),
      });
      const url = `/api/registry/leagues/${A.slug}/commissioner/set-pin`;
      expect((await env.device().post(`/api/registry/leagues/${A.slug}/commissioner/unlock`, { sleeperUserId: co, pin: "1111" })).body.code).toBe("pin_not_set");
      expect((await env.device().post(url, { sleeperUserId: co, newPin: "12" })).status).toBe(400);
      expect((await env.device().post(url, { sleeperUserId: "1", newPin: "1111" })).status).toBe(403); // not a commissioner here
      expect((await env.device().post(url, { sleeperUserId: A.commissioner, newPin: "1111" })).status).toBe(409); // already has a PIN
      const first = env.device();
      expect((await first.post(url, { sleeperUserId: co, newPin: "1111" })).status).toBe(200);
      expect((await env.device().post(url, { sleeperUserId: co, newPin: "2222" })).body.code).toBe("pin_already_set");
      expect((await env.device().post(`/api/registry/leagues/${A.slug}/commissioner/unlock`, { sleeperUserId: co, pin: "1111" })).status).toBe(200);
      expect((await env.device().post(`/api/registry/leagues/${B.slug}/commissioner/set-pin`, { sleeperUserId: co, newPin: "3333" })).status).toBe(403); // not B's commissioner
    });

    it("visiting a league that has an invite code does not join the device", async () => {
      const d = env.device();
      const r = await d.post(`/api/registry/leagues/${A.slug}/device/visit`, {});
      expect([r.status, r.body.enrolled]).toEqual([200, false]);
      expect([...d.jar.keys()].some((k) => k.startsWith("ld_"))).toBe(false);
      expect((await d.post(`/api/registry/leagues/no-such-league/device/visit`, {})).status).toBe(404);
    });

    it("league A's device token is refused in league B", async () => {
      const token = allA.jar.get(cookieName("ld_", A.registryId))!;
      expect(token).toBeTruthy();
      const d = env.device();
      d.jar.set(cookieName("ld_", B.registryId), token);
      const res = await d.post(`/api/league/${B.current}/suggestions`, { authorId: "x", authorName: "x", content: "hi", rosterId: 10 });
      expect([res.status, res.body.code]).toEqual([403, "join_required"]);
    });

    it("a wrong PIN is counted and 5 wrong tries pause the device", async () => {
      const d = env.device();
      const url = `/api/registry/leagues/${B.slug}/commissioner/unlock`;
      for (let i = 0; i < 4; i++) {
        const r = await d.post(url, { sleeperUserId: B.commissioner, pin: "0000" });
        expect([r.status, r.body.triesLeft]).toEqual([401, 4 - i]);
      }
      const fifth = await d.post(url, { sleeperUserId: B.commissioner, pin: "0000" });
      expect(fifth.status).toBe(429);
      const correctWhilePaused = await d.post(url, { sleeperUserId: B.commissioner, pin: B.pin });
      expect(correctWhilePaused.status).toBe(429);
      // Another device isn't paused.
      expect((await env.device().post(url, { sleeperUserId: B.commissioner, pin: B.pin })).status).toBe(200);
    });

    it("an invite code only opens its own league", async () => {
      const d = env.device();
      const check = await d.post("/api/registry/join/check", { inviteCode: A.inviteCode.toLowerCase() });
      expect([check.status, check.body.slug]).toEqual([200, A.slug]);
      const wrong = await d.post("/api/registry/join/check", { inviteCode: "NOTACODE" });
      expect([wrong.status, wrong.body.code]).toEqual([404, "wrong_secret"]);
      const mine = await d.get("/api/registry/my-leagues");
      expect(mine.body).toEqual([]); // checking a code joins nothing
    });
  });

  // ─── Rules ───────────────────────────────────────────────────────────────────

  describe("rules", () => {
    it("rules saved in league A leave league B, and league A's current season, unchanged", async () => {
      const before = (await allA.get(`/api/registry/leagues/${A.slug}/rules`)).body;
      expect(before.current.rules.salaryCap).toBe(250);
      const save = await allA.put(`/api/registry/leagues/${A.slug}/rules/next`, { rules: { salaryCap: 300, awards: { nominationLimit: 7 } } });
      expect(save.status).toBe(200);

      const a = (await allA.get(`/api/registry/leagues/${A.slug}/rules`)).body;
      expect(a.current.rules.salaryCap).toBe(250); // this season keeps the rules it started with
      expect(a.next.saved).toBe(true);
      expect(a.next.rules.salaryCap).toBe(300);
      expect(a.next.rules.awards.nominationLimit).toBe(7);

      const b = (await env.device().get(`/api/registry/leagues/${B.slug}/rules`)).body;
      expect(b.current.rules.salaryCap).toBe(250);
      expect(b.next.saved).toBe(false);
      expect(b.next.rules.salaryCap).toBe(250);
      expect(b.next.rules.awards.nominationLimit).toBe(3);
      expect(await count(schema.leagueRulesTable, eq(schema.leagueRulesTable.leagueId, B.registryId))).toBe(0);
    });

    it("league A's commissioner can't save league B's rules", async () => {
      const res = await allA.put(`/api/registry/leagues/${B.slug}/rules/next`, { rules: { salaryCap: 1 } });
      expect(res.status).toBe(401);
      expect(await count(schema.leagueRulesTable, eq(schema.leagueRulesTable.leagueId, B.registryId))).toBe(0);
    });

    it("the contracts switch is per league", async () => {
      const off = await allA.patch(`/api/registry/leagues/${A.slug}/settings`, { contractsEnabled: false });
      expect(off.status).toBe(200);
      try {
        const a = await env.device().get(`/api/league/${A.current}/contracts`);
        expect([a.status, a.body.code]).toEqual([403, "contracts_off"]);
        const b = await env.device().get(`/api/league/${B.current}/contracts`);
        expect(b.status).toBe(200);
      } finally {
        await allA.patch(`/api/registry/leagues/${A.slug}/settings`, { contractsEnabled: true });
      }
    });
  });

  // ─── Season history ──────────────────────────────────────────────────────────

  describe("season history", () => {
    it("the database refuses a Sleeper ID that already belongs to another league", async () => {
      const attempt = await env.db
        .insert(schema.leagueSeasonHistoryTable)
        .values({ id: randomUUID(), leagueId: B.registryId, season: "2027", sleeperLeagueId: A.current, previousSleeperLeagueId: null, status: "past" })
        .then(() => null, (e: any) => e);
      expect(attempt).toBeTruthy();
      expect(attempt.cause?.code ?? attempt.code).toBe("23505");
    });

    it("the database allows one current season per league", async () => {
      const attempt = await env.db
        .insert(schema.leagueSeasonHistoryTable)
        .values({ id: randomUUID(), leagueId: B.registryId, season: "2030", sleeperLeagueId: `9${Date.now()}`, previousSleeperLeagueId: B.current, status: "current" })
        .then(() => null, (e: any) => e);
      expect(attempt.cause?.code ?? attempt.code).toBe("23505");
    });

    it("a league can't be attached to the site twice", async () => {
      const admin = env.device();
      const set = await admin.post("/api/admin/passcode/recover", { recoveryKey: process.env.ADMIN_RECOVERY_KEY, newPasscode: "itest passcode 12345" });
      expect(set.status).toBe(200);
      const slug = `itest-dup-${Date.now()}`;
      const res = await admin.post("/api/admin/leagues", { sleeperLeagueId: A.current, name: "Dup of A", slug, commissionerSleeperUserId: A.commissioner });
      expect([res.status, res.body.code]).toEqual([409, "season_taken"]);
      expect(await count(schema.leaguesTable, eq(schema.leaguesTable.slug, slug))).toBe(0);
      const dupCode = await admin.patch(`/api/admin/leagues/${B.registryId}`, { inviteCode: A.inviteCode });
      expect([dupCode.status, dupCode.body.code]).toEqual([409, "duplicate"]);
    });

    it("a rollover can't attach another league's season", async () => {
      for (const target of [B.current, B.other]) {
        const r = await allA.post("/api/league/advance-year/preview", { newLeagueId: target }, { "X-League": A.slug });
        expect([r.status, r.body.code]).toEqual([409, "belongs_to_other_league"]);
      }
    });
  });

  // ─── Rollover on real rows ───────────────────────────────────────────────────

  describe("season rollover", () => {
    const flags = { fifthYearOption: null, isOnIr: 0, franchiseTagUsed: 0, franchiseTagYear: null, originalContractYears: 2, isRookieContract: 0, extensionApplied: 0, extensionYear: null, extensionSalary: null, hasBeenExtended: 0, hasBeenFranchiseTagged: 0 };
    const addData = async (L: SeededLeague, contracts: number) => {
      for (let i = 0; i < contracts; i++) {
        await env.modules.storage.upsertPlayerContract({ leagueId: L.current, rosterId: L.rosterIds[0], playerId: `${L.rosterIds[0]}00${i + 1}`, salaries: JSON.stringify({ "2025": 100, "2026": 100 }), ...flags } as any);
      }
      await env.modules.storage.createDeadCapEntry({ leagueId: L.current, rosterId: L.rosterIds[0], playerId: "dead1", playerName: "Dead", playerPosition: "WR", reason: "dropped", deadCapSalaries: JSON.stringify({ "2026": 50 }) } as any);
    };
    const roll = async (L: SeededLeague, dev: Device, dryRun = false) =>
      dev.post(dryRun ? "/api/league/advance-year/preview" : "/api/league/advance-year", { newLeagueId: L.other }, { "X-League": L.slug });
    const currentRow = async (L: SeededLeague) =>
      (await env.db.select().from(schema.leagueSeasonHistoryTable).where(and(eq(schema.leagueSeasonHistoryTable.leagueId, L.registryId), eq(schema.leagueSeasonHistoryTable.status, "current"))))[0];

    it("a dry run changes nothing; a failure halfway switches nothing; running again resumes and finishes", async () => {
      const C = await env.seedLeague({ key: "c", season: "2025", teams: 2, swapNewOwners: true });
      await addData(C, 2);
      const dev = env.device();
      await env.unlockCommissioner(dev, C);

      // Dry run: reports what would move, writes nothing.
      const dry = await roll(C, dev, true);
      expect(dry.status).toBe(200);
      expect(dry.body.plan).toMatchObject({ oldSeason: "2025", newSeason: "2026", counts: { contracts: 2, deadCap: 1 } });
      expect(await count(schema.leagueMigrationsTable, eq(schema.leagueMigrationsTable.oldLeagueId, C.current))).toBe(0);
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, C.other))).toBe(0);
      expect((await currentRow(C)).sleeperLeagueId).toBe(C.current);

      // A failure while saving the old season's history: nothing switches.
      env.sleeper.failUsers.add(C.current);
      const failed = await roll(C, dev);
      expect([failed.status, failed.body.code]).toEqual([500, "step_failed"]);
      expect(failed.body.error).toContain("Nothing was switched");
      expect((await currentRow(C)).sleeperLeagueId).toBe(C.current);
      expect(await count(schema.leagueSeasonHistoryTable, eq(schema.leagueSeasonHistoryTable.sleeperLeagueId, C.other))).toBe(0);
      const [migration] = await env.db.select().from(schema.leagueMigrationsTable).where(eq(schema.leagueMigrationsTable.oldLeagueId, C.current));
      expect(migration.status).toBe("failed");
      expect(migration.errorMessage).toContain("saving the old season's history");
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, C.other))).toBe(0);

      // Run it again: the same migration resumes and finishes.
      env.sleeper.failUsers.delete(C.current);
      const done = await roll(C, dev);
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ success: true, resumed: true, migrationId: migration.id, moved: { contracts: 2, deadCap: 1 } });
      const cur = await currentRow(C);
      expect([cur.season, cur.sleeperLeagueId, cur.previousSleeperLeagueId]).toEqual(["2026", C.other, C.current]);
      const old = (await env.db.select().from(schema.leagueSeasonHistoryTable).where(eq(schema.leagueSeasonHistoryTable.sleeperLeagueId, C.current)))[0];
      expect(old.status).toBe("past");
      const migrations = await env.db.select().from(schema.leagueMigrationsTable).where(eq(schema.leagueMigrationsTable.oldLeagueId, C.current));
      expect(migrations.map((m: any) => m.status)).toEqual(["completed"]); // one record, not two

      // Contracts moved to the new teams: the owners swapped, so roster 1 became roster 2.
      const moved = await env.db.select().from(schema.playerContractsTable).where(eq(schema.playerContractsTable.leagueId, C.other));
      expect(moved).toHaveLength(2);
      expect(new Set(moved.map((m: any) => m.rosterId))).toEqual(new Set([C.rosterIds[1]]));
      expect(await count(schema.deadCapEntriesTable, eq(schema.deadCapEntriesTable.leagueId, C.other))).toBe(1);
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, C.current))).toBe(2); // the old season's rows stay

      // The old season's history was saved once (the retry replaced it, it didn't double it).
      expect(await count(schema.standingsSnapshotsTable, and(eq(schema.standingsSnapshotsTable.leagueId, C.current), eq(schema.standingsSnapshotsTable.snapshotType, "end_of_season")))).toBe(1);
      expect(await count(schema.standingsSnapshotsTable, and(eq(schema.standingsSnapshotsTable.leagueId, C.current), eq(schema.standingsSnapshotsTable.snapshotType, "weekly")))).toBe(14);

      // The new season's rules were pinned, the site-wide active league wasn't touched, and it's all audited.
      expect(await count(schema.leagueRulesTable, and(eq(schema.leagueRulesTable.leagueId, C.registryId), eq(schema.leagueRulesTable.season, "2026")))).toBe(1);
      expect(await count(schema.activeLeaguesTable, eq(schema.activeLeaguesTable.leagueId, C.other))).toBe(0);
      expect(await count(schema.auditLogTable, and(eq(schema.auditLogTable.leagueId, C.registryId), eq(schema.auditLogTable.action, "season_rolled_over")))).toBe(1);
      const reg = (await env.device().get(`/api/registry/leagues/${C.slug}`)).body;
      expect([reg.currentSeason, reg.currentSleeperLeagueId]).toEqual(["2026", C.other]);

      // Running it again is refused: the new season is now the league's current one.
      const again = await roll(C, dev);
      expect([again.status, again.body.code]).toEqual([400, "same_league"]);
      // Attaching the old season again is refused too: it already belongs to this league.
      const back = await dev.post("/api/league/advance-year/preview", { newLeagueId: C.current }, { "X-League": C.slug });
      expect([back.status, back.body.code]).toEqual([409, "already_attached"]);
    });

    it("two leagues rolling over at the same time each move only their own data", async () => {
      const E = await env.seedLeague({ key: "e", season: "2025", teams: 2 });
      const F = await env.seedLeague({ key: "f", season: "2025", teams: 2 });
      await addData(E, 1);
      await addData(F, 3);
      const [de, df] = [env.device(), env.device()];
      await env.unlockCommissioner(de, E);
      await env.unlockCommissioner(df, F);

      const [re, rf] = await Promise.all([roll(E, de), roll(F, df)]);
      expect([re.status, rf.status]).toEqual([200, 200]);
      expect((await currentRow(E)).sleeperLeagueId).toBe(E.other);
      expect((await currentRow(F)).sleeperLeagueId).toBe(F.other);
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, E.other))).toBe(1);
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, F.other))).toBe(3);
      expect(await count(schema.deadCapEntriesTable, eq(schema.deadCapEntriesTable.leagueId, E.other))).toBe(1);
      expect(await count(schema.deadCapEntriesTable, eq(schema.deadCapEntriesTable.leagueId, F.other))).toBe(1);
      // Nothing crossed over.
      expect(await count(schema.playerContractsTable, eq(schema.playerContractsTable.leagueId, F.other))).not.toBe(1);
      expect(await count(schema.leagueMigrationsTable, eq(schema.leagueMigrationsTable.newLeagueId, E.other))).toBe(1);
      expect(await count(schema.leagueMigrationsTable, eq(schema.leagueMigrationsTable.newLeagueId, F.other))).toBe(1);
    });

    it("a league can't attach another league's renewed season, even a valid one", async () => {
      const G = await env.seedLeague({ key: "g", season: "2025", teams: 2 });
      const H = await env.seedLeague({ key: "h", season: "2025", teams: 2 });
      const dev = env.device();
      await env.unlockCommissioner(dev, G);
      const r = await dev.post("/api/league/advance-year/preview", { newLeagueId: H.other }, { "X-League": G.slug });
      expect([r.status, r.body.code]).toEqual([400, "not_next_season"]); // H's 2026 links to H's 2025, not G's
      expect(await count(schema.leagueMigrationsTable, eq(schema.leagueMigrationsTable.newLeagueId, H.other))).toBe(0);
    });
  });
});
