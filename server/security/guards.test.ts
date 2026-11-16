import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { LeagueCommissioner } from "../../shared/schema";
import type { LeagueContext } from "../middleware/league";

// In-memory stand-ins for the database (no DB connection in tests).
const commissioners = new Map<string, LeagueCommissioner>();
let adminHash: string | null = null;
vi.mock("./store", () => ({
  getCommissioner: async (id: string) => commissioners.get(id) ?? null,
  getAdminPasscodeHash: async () => adminHash,
}));
vi.mock("../leagueRegistry", () => ({ leagueResolver: { resolve: async () => ({ status: "unregistered" }) } }));

let guards: typeof import("./guards");
let unlock: typeof import("./unlock");
let secrets: typeof import("./secrets");

beforeAll(async () => {
  process.env.UNLOCK_SECRET = "test-secret-test-secret-test-secret-123";
  guards = await import("./guards");
  unlock = await import("./unlock");
  secrets = await import("./secrets");
});

const ctx = (leagueId: string): LeagueContext => ({
  league: { id: leagueId, name: leagueId, slug: leagueId.toLowerCase(), inviteCode: null, contractsEnabled: 1, leaguePinHash: null, leaguePinSetAt: null, status: "active", createdBy: "x", createdAt: 0 },
  season: { id: "s", leagueId, season: "2026", sleeperLeagueId: `${leagueId}-2026`, previousSleeperLeagueId: null, status: "current", rolledOverAt: null, rolledOverBy: null, migrationId: null },
});

function fakeReq(cookies: Record<string, string>, league?: LeagueContext): Request {
  const header = Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
  return { headers: { cookie: header }, league, get: () => undefined } as unknown as Request;
}
function fakeRes() {
  const out = { status: 0, body: null as any };
  const res = { status(code: number) { out.status = code; return res; }, json(b: any) { out.body = b; return res; } } as unknown as Response;
  return { res, out };
}

async function commissionerWithPin(id: string, leagueId: string, userId: string, pin: string) {
  const pinHash = await secrets.hashSecret(pin);
  commissioners.set(id, { id, leagueId, sleeperUserId: userId, role: "owner", pinHash, pinSetAt: 1, addedBy: "admin", addedAt: 1 });
  return unlock.encodeToken({ v: 1, k: "commissioner", leagueId, commissionerId: id, sleeperUserId: userId, f: secrets.fingerprint(pinHash) });
}

beforeEach(() => {
  commissioners.clear();
  adminHash = null;
});

describe("requireCommissioner", () => {
  it("accepts the league's own commissioner unlock and names who acted", async () => {
    const token = await commissionerWithPin("cA", "A", "userA", "1234");
    const { res, out } = fakeRes();
    const actor = await guards.requireCommissioner(fakeReq({ [unlock.commissionerCookie("A")]: token }, ctx("A")), res);
    expect(actor).toEqual({ role: "commissioner", leagueId: "A", commissionerId: "cA", sleeperUserId: "userA", commissionerRole: "owner" });
    expect(out.status).toBe(0);
  });

  it("refuses league A's unlock in league B", async () => {
    const token = await commissionerWithPin("cA", "A", "userA", "1234");
    // Same token presented under B's cookie name, and under A's name while acting in B.
    for (const name of [unlock.commissionerCookie("B"), unlock.commissionerCookie("A")]) {
      const { res, out } = fakeRes();
      expect(await guards.requireCommissioner(fakeReq({ [name]: token }, ctx("B")), res)).toBeNull();
      expect(out.status).toBe(401);
      expect(out.body.code).toBe("commissioner_unlock_required");
    }
  });

  it("ends unlocks when the PIN is reset or changed", async () => {
    const token = await commissionerWithPin("cA", "A", "userA", "1234");
    const row = commissioners.get("cA")!;
    commissioners.set("cA", { ...row, pinHash: "setup:" + (await secrets.hashSecret("CODE")) });
    const { res, out } = fakeRes();
    expect(await guards.requireCommissioner(fakeReq({ [unlock.commissionerCookie("A")]: token }, ctx("A")), res)).toBeNull();
    expect(out.status).toBe(401);

    commissioners.set("cA", { ...row, pinHash: await secrets.hashSecret("1234") }); // same PIN, new hash
    expect(await guards.leagueActor(fakeReq({ [unlock.commissionerCookie("A")]: token }, ctx("A")), ctx("A"))).toBeNull();
  });

  it("ends unlocks when the commissioner is removed", async () => {
    const token = await commissionerWithPin("cA", "A", "userA", "1234");
    commissioners.delete("cA");
    expect(await guards.leagueActor(fakeReq({ [unlock.commissionerCookie("A")]: token }, ctx("A")), ctx("A"))).toBeNull();
  });

  it("refuses commissioner actions in an unregistered league", async () => {
    const { res, out } = fakeRes();
    expect(await guards.requireCommissioner(fakeReq({}, undefined), res)).toBeNull();
    expect(out.status).toBe(403);
    expect(out.body.code).toBe("league_not_registered");
  });

  it("lets the site admin act as commissioner in any league", async () => {
    adminHash = await secrets.hashSecret("admin passcode 1");
    const token = unlock.encodeToken({ v: 1, k: "admin", f: secrets.fingerprint(adminHash) });
    const { res } = fakeRes();
    expect(await guards.requireCommissioner(fakeReq({ [unlock.ADMIN_COOKIE]: token }, ctx("B")), res)).toEqual({ role: "admin" });
  });
});

describe("requireAdmin", () => {
  it("needs a current admin unlock", async () => {
    adminHash = await secrets.hashSecret("admin passcode 1");
    const token = unlock.encodeToken({ v: 1, k: "admin", f: secrets.fingerprint(adminHash) });
    expect(await guards.requireAdmin(fakeReq({ [unlock.ADMIN_COOKIE]: token }), fakeRes().res)).toEqual({ role: "admin" });

    adminHash = await secrets.hashSecret("new admin passcode"); // passcode changed
    const { res, out } = fakeRes();
    expect(await guards.requireAdmin(fakeReq({ [unlock.ADMIN_COOKIE]: token }), res)).toBeNull();
    expect(out.status).toBe(401);
    expect(out.body.code).toBe("admin_unlock_required");
  });

  it("does not accept a commissioner unlock", async () => {
    adminHash = await secrets.hashSecret("admin passcode 1");
    const token = await commissionerWithPin("cA", "A", "userA", "1234");
    const { res, out } = fakeRes();
    expect(await guards.requireAdmin(fakeReq({ [unlock.ADMIN_COOKIE]: token }), res)).toBeNull();
    expect(out.status).toBe(401);
  });
});
