import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import {
  createLeagueResolver,
  normalizeSlug,
  registerLeagueLookup,
  type LeagueContext,
  type LeagueRegistry,
} from "./league";

// Two leagues, each with two seasons. No database: the registry is an in-memory fake.
function ctx(leagueId: string, slug: string, season: string, sleeperLeagueId: string, status: "current" | "past"): LeagueContext {
  return {
    league: {
      id: leagueId, name: slug, slug, inviteCode: null, contractsEnabled: 0, leaguePinHash: null, leaguePinSetAt: null,
      status: "active", createdBy: "admin", createdAt: 0,
    },
    season: {
      id: `${leagueId}-${season}`, leagueId, season, sleeperLeagueId, previousSleeperLeagueId: null, status,
      rolledOverAt: null, rolledOverBy: null, migrationId: null,
    },
  };
}
const SEASONS = [
  ctx("A", "league-a", "2025", "A2025", "past"),
  ctx("A", "league-a", "2026", "A2026", "current"),
  ctx("B", "league-b", "2025", "B2025", "past"),
  ctx("B", "league-b", "2026", "B2026", "current"),
];

function fakeRegistry(opts: { failing?: boolean } = {}) {
  const calls = { bySleeperId: 0, bySlug: 0 };
  const registry: LeagueRegistry = {
    async findBySleeperLeagueId(id) {
      calls.bySleeperId++;
      if (opts.failing) throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      return SEASONS.find((s) => s.season.sleeperLeagueId === id) ?? null;
    },
    async findBySlug(slug) {
      calls.bySlug++;
      if (opts.failing) throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      return SEASONS.find((s) => s.league.slug === slug && s.season.status === "current") ?? null;
    },
  };
  return { registry, calls };
}

describe("normalizeSlug", () => {
  it("accepts league addresses and lower-cases them", () => {
    expect(normalizeSlug("atl-dynasty")).toBe("atl-dynasty");
    expect(normalizeSlug(" ATL-Dynasty ")).toBe("atl-dynasty");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "-a", "a-", "a--b", "a_b", "a/b", "a b", 42, null, "x".repeat(65)]) expect(normalizeSlug(bad)).toBeNull();
  });
});

describe("createLeagueResolver", () => {
  it("finds the league for any of its seasons", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    const past = await resolve("A2025");
    const current = await resolve("A2026");
    expect(past.status === "ok" && past.context.league.id).toBe("A");
    expect(current.status === "ok" && current.context.season.season).toBe("2026");
  });

  it("accepts a Sleeper ID that belongs to the league in the address", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    expect((await resolve("A2025", "league-a")).status).toBe("ok");
  });

  it("refuses a Sleeper ID that belongs to another league", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    expect(await resolve("B2026", "league-a")).toEqual({ status: "mismatch", slug: "league-a", sleeperLeagueId: "B2026" });
  });

  it("reports an unregistered Sleeper ID under a real address as unregistered (strict mode refuses it)", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    expect((await resolve("NOPE", "league-a")).status).toBe("unregistered");
  });

  it("reports an unknown address", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    expect(await resolve("A2026", "league-z")).toEqual({ status: "unknown_slug", slug: "league-z" });
  });

  it("reports an unregistered Sleeper ID without an address", async () => {
    const { resolve } = createLeagueResolver(fakeRegistry().registry);
    expect((await resolve("NOPE")).status).toBe("unregistered");
  });

  it("caches hits and misses until they expire", async () => {
    let t = 0;
    const { registry, calls } = fakeRegistry();
    const { resolve, invalidate } = createLeagueResolver(registry, { ttlMs: 100, missTtlMs: 10, now: () => t });
    await resolve("A2026");
    await resolve("A2026");
    expect(calls.bySleeperId).toBe(1);
    await resolve("NOPE");
    t = 11;
    await resolve("NOPE");
    await resolve("A2026");
    expect(calls.bySleeperId).toBe(3); // miss expired, hit still cached
    invalidate();
    await resolve("A2026");
    expect(calls.bySleeperId).toBe(4);
  });

  it("backs off after a registry error instead of querying on every request", async () => {
    let t = 0;
    const { registry, calls } = fakeRegistry({ failing: true });
    const { resolve } = createLeagueResolver(registry, { unavailableRetryMs: 50, now: () => t });
    expect((await resolve("A2026")).status).toBe("registry_unavailable");
    expect((await resolve("A2026")).status).toBe("registry_unavailable");
    expect(calls.bySleeperId).toBe(1);
    t = 51;
    await resolve("A2026");
    expect(calls.bySleeperId).toBe(2);
  });
});

describe("registerLeagueLookup on an Express app", () => {
  let server: Server;
  let base = "";
  let strictServer: Server;
  let strictBase = "";
  const logs: string[] = [];

  function makeApp(registry: LeagueRegistry, strict: boolean) {
    const app = express();
    registerLeagueLookup(app, createLeagueResolver(registry), { strict, log: (m) => logs.push(m) });
    app.get("/api/league/:leagueId/thing", (req, res) => res.json({ league: req.league?.league.id ?? null }));
    app.get("/api/other/:id", (req, res) => res.json({ league: req.league?.league.id ?? null }));
    return app;
  }
  const listen = (app: express.Express) =>
    new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });

  beforeAll(async () => {
    server = await listen(makeApp(fakeRegistry().registry, false));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    strictServer = await listen(makeApp(fakeRegistry({ failing: true }).registry, true));
    strictBase = `http://127.0.0.1:${(strictServer.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.close(); strictServer.close(); });

  const get = async (url: string, slug?: string) => {
    const r = await fetch(url, { headers: slug ? { "X-League": slug } : {} });
    return { status: r.status, body: await r.json() };
  };

  it("attaches the league to the request", async () => {
    expect(await get(`${base}/api/league/A2026/thing`)).toEqual({ status: 200, body: { league: "A" } });
  });

  it("lets an unregistered league through in lenient mode", async () => {
    expect(await get(`${base}/api/league/NOPE/thing`)).toEqual({ status: 200, body: { league: null } });
  });

  it("lets an unregistered league through under a real address in lenient mode", async () => {
    expect(await get(`${base}/api/league/NOPE/thing`, "league-a")).toEqual({ status: 200, body: { league: null } });
  });

  it("refuses league B's Sleeper ID under league A's address", async () => {
    expect((await get(`${base}/api/league/B2026/thing`, "league-a")).status).toBe(409);
  });

  it("refuses an unknown or malformed address", async () => {
    expect((await get(`${base}/api/league/A2026/thing`, "league-z")).status).toBe(404);
    expect((await get(`${base}/api/league/A2026/thing`, "not a slug")).status).toBe(400);
  });

  it("does not run for routes without :leagueId", async () => {
    expect(await get(`${base}/api/other/1`, "league-z")).toEqual({ status: 200, body: { league: null } });
  });

  it("fails closed in strict mode when the registry is unavailable, and logs once", async () => {
    expect((await get(`${strictBase}/api/league/A2026/thing`)).status).toBe(503);
    expect((await get(`${strictBase}/api/league/A2026/thing`)).status).toBe(503);
    expect(logs.filter((l) => l.includes("registry unavailable"))).toHaveLength(1);
  });
});
