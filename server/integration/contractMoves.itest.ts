// Automatic contract moves against the TEST database (npm run test:db). Needs .env.test and the contract_move_log table
// there (npx tsx -r dotenv/config script/create-contract-move-log-table.ts dotenv_config_path=.env.test).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema";
import { READY, startTestEnv, type Device, type SeededLeague, type TestEnv } from "./harness";

const SEASON_START = 1_000;
const T = 5_000; // the first batch of transactions: after the season began, before automatic moves are turned on
const YEAR = 2026;

describe.skipIf(!READY)("automatic contract moves (needs .env.test)", () => {
  let env: TestEnv;
  let L: SeededLeague;
  let commish: Device;
  let member: Device;
  let leagueId: string;
  let moves: typeof import("../contractMoves");

  const base = () => `/api/league/${leagueId}/contract-moves`;
  const contract = async (rosterId: number, playerId: string) => {
    const rows = await env.db
      .select()
      .from(schema.playerContractsTable)
      .where(and(eq(schema.playerContractsTable.leagueId, leagueId), eq(schema.playerContractsTable.rosterId, rosterId), eq(schema.playerContractsTable.playerId, playerId)));
    return rows[0] as any;
  };
  const deadCap = async (rosterId: number, playerId: string) => {
    const rows = await env.db
      .select()
      .from(schema.deadCapEntriesTable)
      .where(and(eq(schema.deadCapEntriesTable.leagueId, leagueId), eq(schema.deadCapEntriesTable.rosterId, rosterId), eq(schema.deadCapEntriesTable.playerId, playerId)));
    return rows[0] as any;
  };
  const logCount = async () => {
    const [r] = await env.db.select({ n: sql<number>`count(*)::int` }).from(schema.contractMoveLogTable).where(eq(schema.contractMoveLogTable.leagueId, leagueId));
    return Number(r?.n ?? 0);
  };
  const list = async (device = commish) => (await device.get(base())).body;
  const byPlayer = (body: any, playerId: string) => body.moves.find((m: any) => m.playerId === playerId);

  const tx = (id: string, type: string, at: number, extra: Record<string, unknown>) => ({
    transaction_id: id, type, status: "complete", status_updated: at, created: at, adds: null, drops: null, draft_picks: [], waiver_budget: [], settings: null, roster_ids: [], ...extra,
  });

  beforeAll(async () => {
    env = await startTestEnv();
    moves = await import("../contractMoves");
    L = await env.seedLeague({ key: "cm", season: "2026", teams: 2 });
    leagueId = L.current;
    commish = env.device();
    await env.join(commish, L);
    await env.unlockCommissioner(commish, L);
    member = env.device();
    await env.join(member, L);
    // Automatic moves are on by default; these scenarios start with them switched off so every move is a proposal.
    expect((await commish.put(base() + "/live", { enabled: false })).body.live).toBe(false);

    // Regular season, started long ago; dead cap on since before the transactions.
    const { storage } = env.modules;
    await storage.setLeagueSetting(leagueId, "contract_current_phase", "regular_season");
    await storage.setLeagueSetting(leagueId, "regular_season_started_at", String(SEASON_START));
    await storage.setLeagueSetting(leagueId, "dead_cap_enabled", "true");
    await storage.setLeagueSetting(leagueId, "dead_cap_enabled_at", String(SEASON_START));

    // Roster 1 owns players 1001 and 1002, roster 2 owns 2001 and 2002 (see the harness). Contracts for the first three.
    const now = 100;
    const mk = (rosterId: number, playerId: string, salaries: Record<string, number>) => ({
      id: randomUUID(), leagueId, rosterId, playerId, salaries: JSON.stringify(salaries), isOnIr: 0, franchiseTagUsed: 0, originalContractYears: 2,
      isRookieContract: 0, extensionApplied: 0, hasBeenExtended: 1, hasBeenFranchiseTagged: 1, updatedAt: now,
    });
    await env.db.insert(schema.playerContractsTable).values([
      mk(1, "1001", { [YEAR]: 80, [YEAR + 1]: 80 }), // traded to roster 2
      mk(1, "1002", { [YEAR]: 60, [YEAR + 1]: 60, [YEAR + 2]: 60 }), // dropped by roster 1
      mk(2, "2001", { [YEAR]: 2400 }), // a big contract so roster 2 goes over the cap after the trade
    ]);

    // Sleeper's rosters as they stand after the transactions below.
    const sleeperRosters = env.sleeper.rosters.get(leagueId)!;
    const r1 = sleeperRosters.find((r) => r.roster_id === L.rosterIds[0])!;
    const r2 = sleeperRosters.find((r) => r.roster_id === L.rosterIds[1])!;
    r1.players = ["3002", "3003", "3004"];
    r2.players = ["2001", "2002", "1001", "3001"];

    env.sleeper.addTransactions(leagueId, 3, [
      tx("tx-trade", "trade", T, { adds: { "1001": L.rosterIds[1] }, drops: { "1001": L.rosterIds[0] } }),
      tx("tx-drop", "free_agent", T + 10, { drops: { "1002": L.rosterIds[0] } }),
      tx("tx-waiver", "waiver", T + 20, { adds: { "3001": L.rosterIds[1] }, settings: { waiver_bid: 7 } }),
      tx("tx-fa", "free_agent", T + 30, { adds: { "3002": L.rosterIds[0] } }),
    ]);
  });

  afterAll(async () => {
    if (!env) return;
    await env.db.execute(sql`delete from contract_move_log where league_id = ${leagueId}`);
    await env.cleanup();
    await env.stop();
  });

  it("only lists proposals for the commissioner, and changes no contract while automatic moves are off", async () => {
    const asCommish = await list();
    expect(asCommish.live).toBe(false);
    expect(asCommish.moves.map((m: any) => [m.kind, m.status]).sort()).toEqual([
      ["drop", "proposed"], ["pickup", "proposed"], ["pickup", "proposed"], ["trade_move", "proposed"],
    ]);
    const asMember = await list(member);
    expect(asMember.moves).toEqual([]);
    // nothing was written to the contracts
    expect((await contract(L.rosterIds[0], "1001"))?.salaries).toBeTruthy();
    expect(await contract(L.rosterIds[1], "1001")).toBeUndefined();
    expect(await contract(L.rosterIds[0], "3002")).toBeUndefined();
  });

  it("describes each move and uses the waiver bid", async () => {
    const body = await list();
    expect(byPlayer(body, "3001").detail).toMatchObject({ waiverBid: 7, amount: 7 });
    expect(byPlayer(body, "3002").detail).toMatchObject({ waiverBid: null, amount: 1 });
    expect(byPlayer(body, "1002").summary).toContain("dead cap");
  });

  it("does not log the same transaction twice when the plan is run again", async () => {
    const before = await logCount();
    const again = await moves.runContractMoves(leagueId, { force: true });
    expect(again.logged).toBe(0);
    expect(await logCount()).toBe(before);
  });

  it("flags a team that would go over the cap, for the commissioner and the team", async () => {
    const body = await list();
    const trade = byPlayer(body, "1001");
    expect(trade.flagStatus).toBe("open");
    expect(trade.flags[0]).toMatchObject({ type: "over_cap", rosterId: L.rosterIds[1], year: YEAR, cap: 250 });
    // flags are open to the league, but only the commissioner can mark one handled
    const noPin = await member.post(`${base()}/${trade.id}/resolve-flag`, {});
    expect(noPin.status).toBe(401);
  });

  it("lets only the commissioner approve, then moves the contract and starts the new team's tracking fresh", async () => {
    const trade = byPlayer(await list(), "1001");
    expect((await member.post(`${base()}/${trade.id}/approve`, {})).status).toBe(401);
    const ok = await commish.post(`${base()}/${trade.id}/approve`, {});
    expect(ok.status).toBe(200);
    expect(await contract(L.rosterIds[0], "1001")).toBeUndefined();
    const moved = await contract(L.rosterIds[1], "1001");
    expect(JSON.parse(moved.salaries)).toEqual({ [YEAR]: 80, [YEAR + 1]: 80 });
    expect(moved.hasBeenExtended).toBe(0);
    expect(moved.hasBeenFranchiseTagged).toBe(0);
    // approving twice is refused
    expect((await commish.post(`${base()}/${trade.id}/approve`, {})).status).toBe(409);
  });

  it("can reject a proposal, and an over-the-cap flag can be marked handled", async () => {
    let body = await list();
    const fa = byPlayer(body, "3002");
    expect((await commish.post(`${base()}/${fa.id}/reject`, {})).status).toBe(200);
    expect(await contract(L.rosterIds[0], "3002")).toBeUndefined();
    const trade = byPlayer(body, "1001");
    expect((await commish.post(`${base()}/${trade.id}/resolve-flag`, {})).status).toBe(200);
    body = await list();
    expect(byPlayer(body, "1001").flagStatus).toBe("resolved");
  });

  it("approve-all applies the rest in order: drop with dead cap, waiver pickup at the bid", async () => {
    const res = await commish.post(`${base()}/approve-all`, {});
    expect(res.status).toBe(200);
    expect(res.body.failed).toEqual([]);
    expect(await contract(L.rosterIds[0], "1002")).toBeUndefined();
    const dead = await deadCap(L.rosterIds[0], "1002");
    // this season 100%; next season has two years left (25%); the last season has one left (0%)
    expect(JSON.parse(dead.deadCapSalaries)).toEqual({ [YEAR]: 60, [YEAR + 1]: 15 });
    expect(dead.reason).toBe("dropped");
    const pickup = await contract(L.rosterIds[1], "3001");
    expect(JSON.parse(pickup.salaries)).toEqual({ [YEAR]: 70 });
    expect(pickup.originalContractYears).toBe(1);
  });

  it("applies new transactions by itself once the commissioner turns automatic moves on", async () => {
    const on = await commish.put(`${base()}/live`, { enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.live).toBe(true);
    const liveAt: number = on.body.liveAt;
    // a free agent pickup and a waiver claim of $0 after the switch was turned on
    env.sleeper.addTransactions(leagueId, 4, [
      tx("tx-live-fa", "free_agent", liveAt + 500, { adds: { "3003": L.rosterIds[0] } }),
      tx("tx-live-w0", "waiver", liveAt + 600, { adds: { "3004": L.rosterIds[0] }, settings: { waiver_bid: 0 } }),
    ]);
    // The app's Sleeper gate keeps each week's transactions for a couple of minutes; start fresh so the new ones show.
    const { sleeperGate } = await import("../sleeper");
    sleeperGate.clear();
    const r = await moves.runContractMoves(leagueId, { force: true });
    expect(r.applied).toBe(2);
    expect(JSON.parse((await contract(L.rosterIds[0], "3003")).salaries)).toEqual({ [YEAR]: 10 });
    expect(JSON.parse((await contract(L.rosterIds[0], "3004")).salaries)).toEqual({ [YEAR]: 10 }); // a $0 bid counts as $1
    // running again changes nothing
    expect((await moves.runContractMoves(leagueId, { force: true })).logged).toBe(0);
  });

  it("is on by default: it records when it started, leaves earlier moves for approval, and applies new ones by itself", async () => {
    const L2 = await env.seedLeague({ key: "cm2", season: "2026", teams: 2 });
    const id2 = L2.current;
    const c2 = env.device();
    await env.join(c2, L2);
    await env.unlockCommissioner(c2, L2);
    const { storage } = env.modules;
    await storage.setLeagueSetting(id2, "contract_current_phase", "regular_season");
    await storage.setLeagueSetting(id2, "regular_season_started_at", String(SEASON_START));
    await env.db.insert(schema.playerContractsTable).values({
      id: randomUUID(), leagueId: id2, rosterId: L2.rosterIds[0], playerId: `${L2.rosterIds[0]}001`, salaries: JSON.stringify({ [YEAR]: 50 }),
      isOnIr: 0, franchiseTagUsed: 0, originalContractYears: 1, isRookieContract: 0, extensionApplied: 0, hasBeenExtended: 0, hasBeenFranchiseTagged: 0, updatedAt: 100,
    });
    // An earlier trade (before anyone used the feature) ...
    env.sleeper.addTransactions(id2, 3, [
      tx("tx2-old", "trade", T, { adds: { [`${L2.rosterIds[0]}001`]: L2.rosterIds[1] }, drops: { [`${L2.rosterIds[0]}001`]: L2.rosterIds[0] } }),
    ]);
    const url = `/api/league/${id2}/contract-moves`;
    const first = (await c2.get(url)).body;
    expect(first.live).toBe(true);
    expect(first.liveAt).toBeGreaterThan(Date.now() - 60_000);
    expect(first.moves.map((m: any) => [m.kind, m.status])).toEqual([["trade_move", "proposed"]]); // waits for approval
    expect((await c2.get(url)).body.liveAt).toBe(first.liveAt); // the start does not move

    // ... and one that happens after it started is applied without anyone doing anything.
    const { sleeperGate } = await import("../sleeper");
    env.sleeper.addTransactions(id2, 4, [
      tx("tx2-new", "free_agent", first.liveAt + 1000, { adds: { "3009": L2.rosterIds[0] } }),
    ]);
    sleeperGate.clear();
    expect((await moves.runContractMoves(id2, { force: true })).applied).toBe(1);
    const rows = await env.db.select().from(schema.playerContractsTable).where(and(eq(schema.playerContractsTable.leagueId, id2), eq(schema.playerContractsTable.playerId, "3009")));
    expect(JSON.parse(rows[0].salaries)).toEqual({ [YEAR]: 10 });

    // Switching it off sticks: it is not turned back on by itself.
    expect((await c2.put(`${url}/live`, { enabled: false })).body.live).toBe(false);
    expect((await c2.get(url)).body.live).toBe(false);
    await env.db.execute(sql`delete from contract_move_log where league_id = ${id2}`);
  });

  it("can be turned off again by the commissioner only", async () => {
    expect((await member.put(`${base()}/live`, { enabled: false })).status).toBe(401);
    const off = await commish.put(`${base()}/live`, { enabled: false });
    expect(off.body.live).toBe(false);
  });
});
