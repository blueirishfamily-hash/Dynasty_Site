import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import type { NextFunction, Request, Response } from "express";
import { contractRouteLeagueId, contractsGate } from "./contractsGate";
import { createLeagueResolver, type LeagueContext } from "./league";

// Every route the app registers, read from the source, with its expected contracts-switch membership.
function allRoutes(): string[] {
  const root = path.resolve(__dirname, "..");
  const files = [
    ...fs.readdirSync(path.join(root, "routes")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => path.join(root, "routes", f)),
    path.join(root, "contractHubRoutes.ts"),
    path.join(root, "commissionerEdits.ts"),
    path.join(root, "positionRadar.ts"),
  ];
  const out: string[] = [];
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/app\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)) out.push(m[1]);
  }
  return out;
}

// Routes that are part of the contracts feature. Anything else must stay open when contracts are off.
const CONTRACT_ROUTE = /\/(contracts|rookie-contracts|extensions|rookie-extension-salary|non-rookie-extension-salary|franchise-tag|draft-capital|bids|bidding-status|preferred-free-agents|favorites|dead-cap|process-cut-trade|contract-drafts|assign-contracts-by-quartile|contract-phase|fa-signed|fa-recap|fa-bids|fa-round|rfa|trade-offers|in-season-signing|cap-check|round-wins|round-confirm|commissioner\/(contract|dead-cap|change-log))/;

describe("contractRouteLeagueId", () => {
  const routes = allRoutes();
  it("finds the routes", () => expect(routes.length).toBeGreaterThan(150));

  it("covers every contract route and nothing else", () => {
    for (const route of routes) {
      const concrete = route.replace(/:leagueId/, "L1").replace(/:[A-Za-z]+/g, "x");
      const expected = route.startsWith("/api/league") && CONTRACT_ROUTE.test(route) && !route.startsWith("/api/league/migration") ? "L1" : null;
      expect([route, contractRouteLeagueId(concrete)]).toEqual([route, expected]);
    }
  });

  it("leaves standings, settings and history alone", () => {
    for (const p of ["/api/league/L1/settings/award_points_visible", "/api/sleeper/league/L1/standings", "/api/league/L1/year-recap", "/api/league/L1/draft-prospects"]) {
      expect(contractRouteLeagueId(p)).toBeNull();
    }
  });
});

describe("contractsGate", () => {
  const ctx = (contractsEnabled: number): LeagueContext => ({
    league: { id: "A", name: "A", slug: "a", inviteCode: null, contractsEnabled, leaguePinHash: null, leaguePinSetAt: null, status: "active", createdBy: "x", createdAt: 0 },
    season: { id: "s", leagueId: "A", season: "2026", sleeperLeagueId: "L1", previousSleeperLeagueId: null, status: "current", rolledOverAt: null, rolledOverBy: null, migrationId: null },
  });
  async function run(contractsEnabled: number | null, p: string) {
    const resolver = createLeagueResolver({
      findBySleeperLeagueId: async () => (contractsEnabled == null ? null : ctx(contractsEnabled)),
      findBySlug: async () => null,
    });
    const out = { status: 0, body: null as any, next: false };
    const res = { status(c: number) { out.status = c; return res; }, json(b: any) { out.body = b; return res; } } as unknown as Response;
    await contractsGate(resolver)({ path: p, get: () => undefined } as unknown as Request, res, (() => { out.next = true; }) as NextFunction);
    return out;
  }

  it("refuses contract routes when the league has contracts off", async () => {
    const out = await run(0, "/api/league/L1/contracts");
    expect(out.next).toBe(false);
    expect(out.status).toBe(403);
    expect(out.body.code).toBe("contracts_off");
  });

  it("allows contract routes when contracts are on, or the league isn't registered", async () => {
    expect((await run(1, "/api/league/L1/contracts")).next).toBe(true);
    expect((await run(null, "/api/league/L1/contracts")).next).toBe(true);
  });

  it("never blocks other routes", async () => {
    expect((await run(0, "/api/sleeper/league/L1/standings")).next).toBe(true);
  });
});
