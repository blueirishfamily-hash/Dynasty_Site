// Prospect rankings import against the TEST database (npm run test:db). Needs .env.test and the two ranking
// tables there (npx tsx -r dotenv/config script/create-prospect-ranking-tables.ts dotenv_config_path=.env.test).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { READY, startTestEnv, type Device, type SeededLeague, type TestEnv } from "./harness";

const board = (n: number, names: Record<number, string> = {}) =>
  Array.from({ length: n }, (_, i) => `${i + 1},${names[i + 1] ?? `Filler Player ${i + 1}`},${["RB", "WR", "QB", "TE"][i % 4]},School ${i + 1},1.${String(i + 1).padStart(2, "0")}`).join("\n");

describe.skipIf(!READY)("prospect rankings import (needs .env.test)", () => {
  let env: TestEnv;
  let L: SeededLeague;
  let commish: Device;
  let member: Device;
  let leagueId: string;

  const base = () => `/api/league/${leagueId}/prospect-rankings`;
  const rankingCount = async () => {
    const [r] = await env.db.select({ n: sql<number>`count(*)::int` }).from(schema.draftProspectRankingsTable).where(eq(schema.draftProspectRankingsTable.leagueId, leagueId));
    return Number(r?.n ?? 0);
  };
  const prospect = async (name: string) => {
    const rows = await env.db.select().from(schema.draftProspectsTable).where(eq(schema.draftProspectsTable.leagueId, leagueId));
    return rows.find((p: any) => p.displayName === name);
  };

  beforeAll(async () => {
    env = await startTestEnv();
    L = await env.seedLeague({ key: "pr", season: "2026", teams: 2 });
    leagueId = L.current;
    commish = env.device();
    await env.join(commish, L);
    await env.unlockCommissioner(commish, L);
    member = env.device();
    await env.join(member, L);

    const now = Date.now();
    const mk = (rank: number, displayName: string, school: string, adp: number | null) => ({
      id: randomUUID(), leagueId, season: "2026", rank, displayName, school, position: "WR", adp, createdAt: now, updatedAt: now,
    });
    await env.db.insert(schema.draftProspectsTable).values([
      mk(1, "Marvin Harrison Jr.", "Ohio State", 9.9),
      mk(2, "Ja'Marr Chase", "LSU", 8.8),
      mk(3, "Commissioner Typed", "Somewhere", 7.7),
    ]);
  });

  afterAll(async () => {
    if (!env) return;
    for (const t of ["draft_prospects", "draft_prospect_rankings", "ranking_sync_status"]) {
      await env.db.execute(sql`delete from ${sql.raw(`"${t}"`)} where league_id = ${leagueId}`);
    }
    await env.cleanup();
    await env.stop();
  });

  const importBody = (text: string, extra: Record<string, unknown> = {}) => ({
    season: "2026", source: "Test board", format: "1qb_ppr", text, ...extra,
  });
  const names = { 1: "Marvin Harrison", 2: "Jamarr Chase" };

  it("only lets a commissioner import", async () => {
    const r = await member.post(`${base()}/import`, importBody(board(25, names)));
    expect(r.status).toBe(401);
    expect(await rankingCount()).toBe(0);
  });

  it("previews without writing anything", async () => {
    const r = await commish.post(`${base()}/import`, importBody(board(25, names), { dryRun: true }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, dryRun: true, rowCount: 25, matched: 2 });
    expect(r.body.unmatched).toHaveLength(23);
    expect(await rankingCount()).toBe(0);
    expect((await prospect("Marvin Harrison Jr."))?.adp).toBe(9.9);
    const status = await commish.get(`${base()}?season=2026`);
    expect(status.body.status).toBeNull();
  });

  it("imports, matches by normalized name, and updates only ADP", async () => {
    const r = await commish.post(`${base()}/import`, importBody(board(25, names)));
    expect(r.status).toBe(200);
    expect(r.body.matched).toBe(2);
    expect(await rankingCount()).toBe(25);
    const mh = await prospect("Marvin Harrison Jr.");
    expect(mh?.adp).toBe(1);
    expect(mh?.school).toBe("Ohio State"); // the commissioner's school is kept
    expect((await prospect("Ja'Marr Chase"))?.adp).toBe(2);
    expect((await prospect("Commissioner Typed"))?.adp).toBe(7.7); // not in the import: untouched
    const status = await commish.get(`${base()}?season=2026`);
    expect(status.body.status).toMatchObject({ source: "Test board", format: "1qb_ppr", lastStatus: "ok", rowCount: 25 });
    expect(status.body.unmatched).toHaveLength(23);
  });

  it("keeps the old rankings and ADP when a later import is invalid", async () => {
    const bad = board(25, names).replace("\n3,", "\n2,"); // duplicate rank 2
    const r = await commish.post(`${base()}/import`, importBody(bad));
    expect(r.status).toBe(400);
    expect(r.body.errors.join(" ")).toMatch(/Duplicate ranks/);
    expect(await rankingCount()).toBe(25);
    expect((await prospect("Marvin Harrison Jr."))?.adp).toBe(1);
    const status = await commish.get(`${base()}?season=2026`);
    expect(status.body.status.lastStatus).toBe("failed");
    expect(status.body.status.lastSuccessAt).toBeGreaterThan(0); // the last good date is still there
    expect(status.body.status.rowCount).toBe(25);
  });

  it("adds a ranked player at the end of the list, once", async () => {
    const first = await commish.post(`${base()}/add`, { season: "2026", rank: 10 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ displayName: "Filler Player 10", rank: 4, adp: 10 });
    const again = await commish.post(`${base()}/add`, { season: "2026", rank: 10 });
    expect(again.status).toBe(409);
    const asMember = await member.post(`${base()}/add`, { season: "2026", rank: 11 });
    expect(asMember.status).toBe(401);
  });
});
