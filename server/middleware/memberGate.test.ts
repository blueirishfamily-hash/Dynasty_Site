import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import type { LeagueDeviceAccess } from "../../shared/schema";
import { createLeagueResolver, type LeagueContext, type LeagueRegistry } from "./league";
import { memberGate, memberWriteTarget, requestRosterIds, type MemberGateDeps } from "./memberGate";
import { deviceCookieName, graceEndFor, hashDeviceToken, newDeviceToken, type MembershipDeps } from "../security/membership";

// ─── Every write route is covered ──────────────────────────────────────────────

function writeRoutes(): string[] {
  const root = path.resolve(__dirname, "..");
  const files = [
    ...fs.readdirSync(path.join(root, "routes")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => path.join(root, "routes", f)),
    path.join(root, "contractHubRoutes.ts"),
    path.join(root, "commissionerEdits.ts"),
    path.join(root, "positionRadar.ts"),
    path.join(root, "testSandbox.ts"),
  ];
  const out: string[] = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/app\.(?:post|put|patch|delete)\(\s*"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

// Write routes that are not for one league's members: site admin, the registry (own PIN checks), unlock, and
// the site-wide season controls that need a commissioner PIN.
const NOT_MEMBER_WRITES = /^\/api\/(admin\/|registry\/|league\/(set-active|advance-year|migration\/)|contracts-test\/)/;

describe("memberWriteTarget", () => {
  const routes = writeRoutes();
  it("finds the routes", () => expect(routes.length).toBeGreaterThan(80));

  it("covers every league write route, and only those", () => {
    for (const route of routes) {
      const concrete = route.replace(/:leagueId/, "L1").replace(/:[A-Za-z]+/g, "x");
      const target = memberWriteTarget(concrete);
      if (NOT_MEMBER_WRITES.test(route)) expect([route, target]).toEqual([route, null]);
      else expect([route, target !== null]).toEqual([route, true]);
    }
  });

  it("reads the league from the path, and a rule vote's league from its rule", () => {
    expect(memberWriteTarget("/api/league/L1/bids")).toEqual({ kind: "league", sleeperLeagueId: "L1" });
    expect(memberWriteTarget("/api/leagues/L1/dead-cap")).toEqual({ kind: "league", sleeperLeagueId: "L1" });
    expect(memberWriteTarget("/api/rule-suggestions/r9/vote")).toEqual({ kind: "rule", ruleId: "r9" });
    expect(memberWriteTarget("/api/league/set-active")).toBeNull();
  });
});

describe("requestRosterIds", () => {
  const req = (p: string, body: any = {}, query: any = {}) => ({ path: p, body, query }) as any;
  it("collects every roster a write names", () => {
    expect(requestRosterIds(req("/api/league/L1/bids", { rosterId: 3 }))).toEqual([3]);
    expect(requestRosterIds(req("/api/league/L1/trade-offers", { teamARosterId: 1, teamBRosterId: "2" }))).toEqual([1, 2]);
    expect(requestRosterIds(req("/api/league/L1/roster/7/round-confirm"))).toEqual([7]);
    expect(requestRosterIds(req("/api/league/L1/bids/b1/4"))).toEqual([4]);
    expect(requestRosterIds(req("/api/league/L1/awards/2026/mvp/nominate", { nominatedByRosterId: 9 }))).toEqual([9]);
    expect(requestRosterIds(req("/api/league/L1/bids", { rosterId: "abc" }))).toEqual([]);
  });
});

// ─── The gate ──────────────────────────────────────────────────────────────────

function ctx(id: string, slug: string, sleeperLeagueId: string, opts: { inviteCode?: string | null; status?: string } = {}): LeagueContext {
  return {
    league: { id, name: slug, slug, inviteCode: opts.inviteCode === undefined ? `${id}CODE00` : opts.inviteCode, contractsEnabled: 1, leaguePinHash: null, leaguePinSetAt: null, status: opts.status ?? "active", createdBy: "x", createdAt: 0 },
    season: { id: "s", leagueId: id, season: "2026", sleeperLeagueId, previousSleeperLeagueId: null, status: "current", rolledOverAt: null, rolledOverBy: null, migrationId: null },
  };
}
const LEAGUES = [
  ctx("A", "league-a", "A2026"),
  ctx("B", "league-b", "B2026"),
  ctx("C", "no-code", "C2026", { inviteCode: null }),
  ctx("D", "archived", "D2026", { status: "archived" }),
];
const ROSTERS: Record<string, number[]> = { A2026: [1, 2, 3], B2026: [10, 11], C2026: [1, 2], D2026: [1] };

function setup(opts: { graceUntil?: number | null; staff?: boolean; rosterFails?: boolean } = {}) {
  const devices = new Map<string, LeagueDeviceAccess>();
  const membership: MembershipDeps = {
    findDevice: async (leagueId, hash) => {
      const d = devices.get(hash);
      return d && d.leagueId === leagueId && d.revokedAt == null ? d : null;
    },
    touchDevice: async () => {},
    createDevice: async (leagueId, hash, now) => {
      const d = { id: `dev-${devices.size}`, leagueId, deviceTokenHash: hash, rosterId: null, createdAt: now, lastUsedAt: now, revokedAt: null };
      devices.set(hash, d);
      return d;
    },
    graceUntil: async () => opts.graceUntil ?? null,
  };
  const registry: LeagueRegistry = {
    findBySleeperLeagueId: async (id) => LEAGUES.find((l) => l.season.sleeperLeagueId === id) ?? null,
    findBySlug: async (slug) => LEAGUES.find((l) => l.league.slug === slug) ?? null,
  };
  const deps: MemberGateDeps = {
    resolver: createLeagueResolver(registry),
    membership,
    ruleLeague: async (id) => (id === "rule-b" ? "B2026" : id === "rule-a" ? "A2026" : undefined),
    rosterIds: async (id) => {
      if (opts.rosterFails) throw new Error("sleeper down");
      return ROSTERS[id] ?? [];
    },
    isUnlockedStaff: async () => !!opts.staff,
  };
  const joined = (leagueId: string) => {
    const token = newDeviceToken();
    devices.set(hashDeviceToken(token), { id: `d-${leagueId}`, leagueId, deviceTokenHash: hashDeviceToken(token), rosterId: null, createdAt: 0, lastUsedAt: Date.now(), revokedAt: null });
    return `${deviceCookieName(leagueId)}=${token}`;
  };
  return { deps, devices, joined };
}

async function run(deps: MemberGateDeps, req: { method?: string; path: string; body?: any; cookie?: string; slug?: string }) {
  const out = { status: 0, body: null as any, next: false, cookies: [] as string[] };
  const res = {
    status(c: number) { out.status = c; return res; },
    json(b: any) { out.body = b; return res; },
    cookie(name: string) { out.cookies.push(name); return res; },
  } as unknown as Response;
  const fake = {
    method: req.method ?? "POST",
    path: req.path,
    body: req.body ?? {},
    query: {},
    headers: { cookie: req.cookie ?? "" },
    secure: false,
    get: (h: string) => (h.toLowerCase() === "x-league" ? req.slug : undefined),
  } as unknown as Request;
  await memberGate(deps)(fake, res, (() => { out.next = true; }) as NextFunction);
  return out;
}

describe("memberGate", () => {
  it("lets reads through", async () => {
    const { deps } = setup();
    expect((await run(deps, { method: "GET", path: "/api/league/A2026/contracts" })).next).toBe(true);
  });

  it("refuses a write from a device that hasn't joined a league with an invite code", async () => {
    const { deps } = setup();
    const out = await run(deps, { path: "/api/league/A2026/bids", body: { rosterId: 1 } });
    expect(out.next).toBe(false);
    expect(out.status).toBe(403);
    expect(out.body.code).toBe("join_required");
  });

  it("lets a joined device write", async () => {
    const { deps, joined } = setup();
    expect((await run(deps, { path: "/api/league/A2026/bids", body: { rosterId: 1 }, cookie: joined("A") })).next).toBe(true);
  });

  it("refuses league A's device in league B, with or without B's address", async () => {
    const { deps, joined } = setup();
    const cookie = joined("A");
    for (const slug of [undefined, "league-b"]) {
      const out = await run(deps, { path: "/api/league/B2026/bids", body: { rosterId: 10 }, cookie, slug });
      expect([out.next, out.status, out.body.code]).toEqual([false, 403, "join_required"]);
    }
  });

  it("refuses league B's Sleeper ID under league A's address", async () => {
    const { deps, joined } = setup();
    const out = await run(deps, { path: "/api/league/B2026/bids", body: { rosterId: 10 }, cookie: `${joined("A")}; ${joined("B")}`, slug: "league-a" });
    expect([out.next, out.status]).toEqual([false, 409]);
  });

  it("refuses a roster from another league even for a joined device", async () => {
    const { deps, joined } = setup();
    const out = await run(deps, { path: "/api/league/A2026/bids", body: { rosterId: 10 }, cookie: joined("A") });
    expect([out.next, out.status, out.body.code]).toEqual([false, 403, "roster_not_in_league"]);
    const trade = await run(deps, { path: "/api/league/A2026/trade-offers", body: { teamARosterId: 1, teamBRosterId: 11 }, cookie: joined("A") });
    expect(trade.body?.code).toBe("roster_not_in_league");
  });

  it("checks rule votes against the rule's own league", async () => {
    const { deps, joined } = setup();
    expect((await run(deps, { path: "/api/rule-suggestions/rule-a/vote", body: { rosterId: 1 }, cookie: joined("A") })).next).toBe(true);
    expect((await run(deps, { path: "/api/rule-suggestions/rule-a/vote", body: { rosterId: 1 }, cookie: joined("B") })).status).toBe(403);
    expect((await run(deps, { path: "/api/rule-suggestions/rule-b/vote", body: { rosterId: 1 }, cookie: joined("B") })).body.code).toBe("roster_not_in_league");
    expect((await run(deps, { path: "/api/rule-suggestions/missing/vote", body: {} })).next).toBe(true); // the route answers 404
  });

  it("doesn't ask a league without an invite code to join, but still checks rosters", async () => {
    const { deps } = setup();
    expect((await run(deps, { path: "/api/league/C2026/bids", body: { rosterId: 1 } })).next).toBe(true);
    expect((await run(deps, { path: "/api/league/C2026/bids", body: { rosterId: 99 } })).body.code).toBe("roster_not_in_league");
  });

  it("joins a device quietly during the grace period, then remembers it", async () => {
    const { deps, devices } = setup({ graceUntil: graceEndFor(30) });
    const out = await run(deps, { path: "/api/league/A2026/bids", body: { rosterId: 1 } });
    expect(out.next).toBe(true);
    expect(out.cookies).toEqual([deviceCookieName("A")]);
    expect(devices.size).toBe(1);
  });

  it("refuses again once the grace period is over", async () => {
    const { deps } = setup({ graceUntil: Date.now() - 1000 });
    expect((await run(deps, { path: "/api/league/A2026/bids", body: {} })).status).toBe(403);
  });

  it("treats an unlocked commissioner or admin as a member", async () => {
    const { deps } = setup({ staff: true });
    expect((await run(deps, { path: "/api/league/A2026/contracts", body: {} })).next).toBe(true);
  });

  it("refuses writes to an archived league", async () => {
    const { deps } = setup();
    expect((await run(deps, { path: "/api/league/D2026/bids", body: {} })).body.code).toBe("league_archived");
  });

  it("keeps today's behavior for a league that isn't registered", async () => {
    const { deps } = setup();
    expect((await run(deps, { path: "/api/league/UNKNOWN/bids", body: { rosterId: 5 } })).next).toBe(true);
  });

  it("fails closed when the roster list can't be read", async () => {
    const { deps, joined } = setup({ rosterFails: true });
    expect((await run(deps, { path: "/api/league/A2026/bids", body: { rosterId: 1 }, cookie: joined("A") })).status).toBe(503);
  });

  it("refuses a device that was signed out", async () => {
    const { deps, devices, joined } = setup();
    const cookie = joined("A");
    for (const d of devices.values()) d.revokedAt = Date.now();
    expect((await run(deps, { path: "/api/league/A2026/bids", body: {}, cookie })).body.code).toBe("join_required");
  });
});
