// Shared setup for the database tests (server/integration/*.itest.ts).
//
//  - Uses the separate test database from .env.test, and refuses the real one (server/testDb.ts).
//  - Starts the real Express app on a free port with every route registered.
//  - Replaces Sleeper with fake league data (the app's Sleeper gate calls the global fetch).
//  - Gives each simulated device its own cookie jar.
//  - Seeds fake leagues, and removes everything it created afterwards.
import fs from "fs";
import { randomBytes, randomUUID } from "crypto";
import { parse as parseEnv } from "dotenv";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { sql } from "drizzle-orm";
import { resolveTestDatabaseUrl } from "../testDb";
import * as schema from "../../shared/schema";

const readEnv = (file: string): Record<string, string> => (fs.existsSync(file) ? parseEnv(fs.readFileSync(file)) : {});

export const testDb = resolveTestDatabaseUrl({
  test: readEnv(".env.test").DATABASE_URL,
  real: readEnv(".env").DATABASE_URL,
  shell: process.env.DATABASE_URL,
});
export const READY = "url" in testDb;
if (!READY) console.warn(`[integration] Skipping the database tests: ${(testDb as { error: string }).error}`);

// ─── Fake Sleeper ──────────────────────────────────────────────────────────────

export interface FakeRoster { roster_id: number; owner_id: string; players: string[] }

export class FakeSleeper {
  leagues = new Map<string, any>();
  rosters = new Map<string, FakeRoster[]>();
  users = new Map<string, any[]>();
  failUsers = new Set<string>();
  calls = 0;

  addLeague(id: string, o: { season: string; previous: string | null; name: string; owners: Array<{ id: string; name: string; roster: number; players?: string[] }> }) {
    this.leagues.set(id, {
      league_id: id, name: o.name, season: o.season, status: o.season === "2026" ? "in_season" : "complete",
      previous_league_id: o.previous, total_rosters: o.owners.length, roster_positions: [], scoring_settings: {},
      owner_id: o.owners[0].id, settings: { playoff_week_start: 15, playoff_teams: 6 },
    });
    this.rosters.set(id, o.owners.map((u) => ({ roster_id: u.roster, owner_id: u.id, players: u.players ?? [], starters: [], reserve: [], taxi: [], settings: { wins: 0, losses: 0, ties: 0, fpts: 0 }, league_id: id } as any)));
    this.users.set(id, o.owners.map((u) => ({ user_id: u.id, display_name: u.name, avatar: null, metadata: { team_name: `${u.name}'s team` } })));
  }

  handle(path: string): { status: number; body: unknown } {
    this.calls++;
    const ok = (body: unknown) => ({ status: 200, body });
    const notFound = { status: 404, body: {} };
    let m: RegExpMatchArray | null;
    if (path === "/state/nfl") return ok({ season: "2026", week: 1, season_type: "off", display_week: 1, leg: 1 });
    if (path === "/players/nfl") return ok({});
    if ((m = path.match(/^\/league\/(\d+)$/))) return this.leagues.has(m[1]) ? ok(this.leagues.get(m[1])) : notFound;
    if ((m = path.match(/^\/league\/(\d+)\/rosters$/))) return this.rosters.has(m[1]) ? ok(this.rosters.get(m[1])) : notFound;
    if ((m = path.match(/^\/league\/(\d+)\/users$/))) {
      if (this.failUsers.has(m[1])) return { status: 500, body: {} };
      return this.users.has(m[1]) ? ok(this.users.get(m[1])) : notFound;
    }
    if (/^\/league\/\d+\/(matchups\/\d+|transactions\/\d+|drafts|traded_picks|winners_bracket|losers_bracket)$/.test(path)) return ok([]);
    return notFound;
  }
}

// ─── Devices ───────────────────────────────────────────────────────────────────

export interface Reply { status: number; body: any }

/** One simulated browser: its own cookie jar. */
export class Device {
  jar = new Map<string, string>();
  constructor(private base: string, private realFetch: typeof fetch) {}

  async call(method: string, path: string, opts: { body?: unknown; headers?: Record<string, string> } = {}): Promise<Reply> {
    const cookie = Array.from(this.jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
    const res = await this.realFetch(`${this.base}${path}`, {
      method,
      headers: { ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    for (const sc of res.headers.getSetCookie()) {
      const pair = sc.split(";")[0];
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = decodeURIComponent(pair.slice(i + 1));
      if (/expires=thu, 01 jan 1970/i.test(sc) || /max-age=0/i.test(sc)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    const text = await res.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }
  get = (p: string, h?: Record<string, string>) => this.call("GET", p, { headers: h });
  post = (p: string, body: unknown = {}, h?: Record<string, string>) => this.call("POST", p, { body, headers: h });
  put = (p: string, body: unknown = {}, h?: Record<string, string>) => this.call("PUT", p, { body, headers: h });
  patch = (p: string, body: unknown = {}, h?: Record<string, string>) => this.call("PATCH", p, { body, headers: h });
  del = (p: string, h?: Record<string, string>) => this.call("DELETE", p, { headers: h });
}

// ─── Seeded leagues ────────────────────────────────────────────────────────────

export interface SeededLeague {
  key: string;
  registryId: string;
  slug: string;
  inviteCode: string;
  commissioner: string;
  pin: string;
  /** The Sleeper ID of the league's current season. */
  current: string;
  /** Sleeper ID of the previous season (leagues seeded on 2026), or the league's new 2026 season (leagues seeded on 2025). */
  other: string;
  rosterIds: number[];
  owners: string[];
}

const numericId = () => `1${Date.now()}${Math.floor(Math.random() * 1e6).toString().padStart(6, "0")}`.slice(0, 24);
const suffix = randomBytes(3).toString("hex");

export interface TestEnv {
  base: string;
  sleeper: FakeSleeper;
  device(): Device;
  db: any;
  seedLeague(o: { key: string; season: "2025" | "2026"; teams?: number; rosterBase?: number; contractsEnabled?: boolean; inviteCode?: boolean; swapNewOwners?: boolean }): Promise<SeededLeague>;
  unlockCommissioner(device: Device, league: SeededLeague): Promise<void>;
  join(device: Device, league: SeededLeague): Promise<void>;
  cleanup(): Promise<void>;
  stop(): Promise<void>;
  modules: { leagueResolver: any; storage: any };
}

export async function startTestEnv(): Promise<TestEnv> {
  if (!("url" in testDb)) throw new Error("No test database");
  process.env.DATABASE_URL = testDb.url;
  process.env.UNLOCK_SECRET = "itest-unlock-secret-itest-unlock-secret-1234";
  process.env.ADMIN_RECOVERY_KEY = "itest-recovery-key-0123456789abcdef";
  process.env.ORIGIN = "http://127.0.0.1:1"; // the rollover's self-requests for the recap fail fast

  const realFetch = globalThis.fetch;
  const sleeper = new FakeSleeper();
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://api.sleeper.app/v1")) {
      const r = sleeper.handle(url.slice("https://api.sleeper.app/v1".length).split("?")[0]);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  }) as typeof fetch;

  const { db } = await import("../db");
  const { registerRoutes } = await import("../routes");
  const { leagueResolver } = await import("../leagueRegistry");
  const { storage } = await import("../storage");
  const { hashSecret } = await import("../security/secrets");

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  const server: Server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const startedAt = Date.now();
  const registryIds: string[] = [];
  const sleeperIds: string[] = [];

  const env: TestEnv = {
    base,
    sleeper,
    db,
    modules: { leagueResolver, storage },
    device: () => new Device(base, realFetch),

    async seedLeague(o) {
      const registryId = randomUUID();
      const slug = `itest-${o.key}-${suffix}`;
      const inviteCode = `ITEST${o.key.toUpperCase()}${suffix.toUpperCase()}`;
      const commissioner = `${numericId()}`;
      // The commissioner owns the first roster.
      const owners = [commissioner, ...Array.from({ length: (o.teams ?? 2) - 1 }, () => numericId())];
      const rosterIds = owners.map((_, i) => (o.rosterBase ?? 1) + i);
      const oldId = numericId();
      const curId = numericId();
      const mk = (season: string, prev: string | null, swap = false) => sleeper.addLeague(season === "2025" ? oldId : curId, {
        season, previous: prev, name: `Itest ${o.key}`,
        owners: (swap ? [...owners].reverse() : owners).map((id, i) => ({ id, name: `${o.key}${i}`, roster: rosterIds[i], players: [`${rosterIds[i]}001`, `${rosterIds[i]}002`] })),
      });
      let current: string, other: string;
      if (o.season === "2026") {
        mk("2025", null); mk("2026", oldId);
        current = curId; other = oldId;
        sleeperIds.push(oldId, curId);
      } else {
        // The league is on 2025; its renewed 2026 season exists in Sleeper but isn't attached yet.
        mk("2025", null);
        sleeper.addLeague(curId, {
          season: "2026", previous: oldId, name: `Itest ${o.key}`,
          owners: (o.swapNewOwners ? [...owners].reverse() : owners).map((id, i) => ({ id, name: `${o.key}${i}`, roster: rosterIds[i], players: [] })),
        });
        current = oldId; other = curId;
        sleeperIds.push(oldId, curId);
      }
      const now = Date.now();
      await db.insert(schema.leaguesTable).values({
        id: registryId, name: `Itest ${o.key}`, slug, inviteCode: o.inviteCode === false ? null : inviteCode,
        contractsEnabled: o.contractsEnabled === false ? 0 : 1, status: "active", createdBy: "itest", createdAt: now,
      });
      registryIds.push(registryId);
      await db.insert(schema.leagueSeasonHistoryTable).values(
        o.season === "2026"
          ? [
              { id: randomUUID(), leagueId: registryId, season: "2025", sleeperLeagueId: oldId, previousSleeperLeagueId: null, status: "past" },
              { id: randomUUID(), leagueId: registryId, season: "2026", sleeperLeagueId: curId, previousSleeperLeagueId: oldId, status: "current" },
            ]
          : [{ id: randomUUID(), leagueId: registryId, season: "2025", sleeperLeagueId: oldId, previousSleeperLeagueId: null, status: "current" }],
      );
      const pin = "4321";
      await db.insert(schema.leagueCommissionersTable).values({
        id: randomUUID(), leagueId: registryId, sleeperUserId: commissioner, role: "owner",
        pinHash: await hashSecret(pin), pinSetAt: now, addedBy: "itest", addedAt: now,
      });
      leagueResolver.invalidate();
      return { key: o.key, registryId, slug, inviteCode, commissioner, pin, current, other, rosterIds, owners };
    },

    async unlockCommissioner(device, league) {
      const r = await device.post(`/api/registry/leagues/${league.slug}/commissioner/unlock`, { sleeperUserId: league.commissioner, pin: league.pin });
      if (r.status !== 200) throw new Error(`unlock failed: ${r.status} ${JSON.stringify(r.body)}`);
    },
    async join(device, league) {
      const r = await device.post("/api/registry/join", { inviteCode: league.inviteCode });
      if (r.status !== 200) throw new Error(`join failed: ${r.status} ${JSON.stringify(r.body)}`);
    },

    async cleanup() {
      const ids = [...registryIds, ...sleeperIds];
      const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
      const run = async (label: string, q: any) => {
        try { await db.execute(q); } catch (e: any) { console.warn(`[integration] cleanup ${label}: ${e?.message}`); }
      };
      if (ids.length) {
        for (const t of ["player_contracts", "dead_cap_entries", "team_extensions", "rule_suggestions", "award_nominations", "award_ballots", "league_settings", "standings_snapshots", "team_stats_snapshots", "matchup_snapshots", "transaction_snapshots", "draft_snapshots", "year_recap_snapshots", "metrics_snapshots", "player_bids", "contract_transactions", "active_leagues", "suggestions"]) {
          await run(t, sql`delete from ${sql.raw(`"${t}"`)} where league_id in (${list})`);
        }
        await run("roster_mappings", sql`delete from roster_mappings where old_league_id in (${list}) or new_league_id in (${list})`);
        await run("league_migrations", sql`delete from league_migrations where old_league_id in (${list}) or new_league_id in (${list})`);
      }
      if (registryIds.length) {
        const rl = sql.join(registryIds.map((i) => sql`${i}`), sql`, `);
        for (const t of ["audit_log", "league_device_access", "league_rules", "league_commissioners", "league_season_history"]) {
          await run(t, sql`delete from ${sql.raw(`"${t}"`)} where league_id in (${rl})`);
        }
        await run("leagues", sql`delete from leagues where id in (${rl})`);
      }
      await run("pin_attempts", sql`delete from pin_attempts where first_failed_at >= ${startedAt}`);
      await run("site_admin", sql`delete from site_admin`);
      await run("audit_log (site)", sql`delete from audit_log where league_id is null and created_at >= ${startedAt}`);
    },

    async stop() {
      await new Promise<void>((r) => server.close(() => r()));
      globalThis.fetch = realFetch;
    },
  };
  return env;
}
