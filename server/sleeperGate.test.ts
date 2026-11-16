import { describe, expect, it } from "vitest";
import { createSleeperGate, ttlForEndpoint } from "./sleeperGate";

function fakeFetch(data: (url: string) => unknown = (u) => ({ url: u }), failFirst = 0) {
  const calls: string[] = [];
  let failures = failFirst;
  const impl = async (url: string) => {
    calls.push(url);
    if (failures-- > 0) return { ok: false, status: 500, statusText: "boom", json: async () => ({}) };
    return { ok: true, status: 200, statusText: "OK", json: async () => data(url) };
  };
  return { impl, calls };
}

describe("ttlForEndpoint", () => {
  it("matches how fast each kind of data changes", () => {
    const m = 60_000, h = 60 * m;
    expect(ttlForEndpoint("/players/nfl")).toBe(24 * h);
    expect(ttlForEndpoint("/state/nfl")).toBe(2 * m);
    expect(ttlForEndpoint("/league/123")).toBe(30 * m);
    expect(ttlForEndpoint("/league/123/users")).toBe(h);
    expect(ttlForEndpoint("/league/123/rosters")).toBe(2 * m);
    expect(ttlForEndpoint("/league/123/matchups/4")).toBe(m);
    expect(ttlForEndpoint("/stats/nfl/regular/2026/4")).toBe(10 * m);
  });
});

describe("sleeper gate", () => {
  it("reuses a response for every league and request until it expires", async () => {
    let t = 0;
    const f = fakeFetch();
    const gate = createSleeperGate({ fetchImpl: f.impl, now: () => t });
    await gate.get("/state/nfl");
    await gate.get("/state/nfl");
    expect(f.calls).toHaveLength(1);
    t = 2 * 60_000 + 1;
    await gate.get("/state/nfl");
    expect(f.calls).toHaveLength(2);
    expect(gate.stats().cacheHits).toBe(1);
  });

  it("shares one call between identical simultaneous requests", async () => {
    const f = fakeFetch();
    const gate = createSleeperGate({ fetchImpl: f.impl });
    await Promise.all([gate.get("/league/1/rosters"), gate.get("/league/1/rosters"), gate.get("/league/1/rosters")]);
    expect(f.calls).toHaveLength(1);
    expect(gate.stats().dedupedRequests).toBe(2);
  });

  it("hands out copies so one caller can't change what another sees", async () => {
    const gate = createSleeperGate({ fetchImpl: fakeFetch(() => [{ roster_id: 1 }]).impl });
    const a: any[] = await gate.get("/league/1/rosters");
    a.push({ roster_id: 99 });
    expect(await gate.get("/league/1/rosters")).toEqual([{ roster_id: 1 }]);
  });

  it("never caches an error", async () => {
    const f = fakeFetch(undefined, 1);
    const gate = createSleeperGate({ fetchImpl: f.impl });
    await expect(gate.get("/state/nfl")).rejects.toThrow("Sleeper API error: 500");
    await expect(gate.get("/state/nfl")).resolves.toBeDefined();
    expect(f.calls).toHaveLength(2);
  });

  it("holds calls over the per-minute limit until the minute passes", async () => {
    let t = 0;
    const f = fakeFetch();
    const slept: number[] = [];
    const gate = createSleeperGate({
      fetchImpl: f.impl,
      maxPerMinute: 3,
      now: () => t,
      sleep: async (ms) => { slept.push(ms); t += ms; },
    });
    for (let i = 0; i < 4; i++) await gate.get(`/league/${i}/rosters`);
    expect(f.calls).toHaveLength(4);
    expect(slept.length).toBeGreaterThan(0); // the 4th call waited for the window
    expect(t).toBeGreaterThanOrEqual(60_000);
    expect(gate.stats().limitPerMinute).toBe(3);
  });

  it("caps how many calls run at once", async () => {
    let running = 0, peak = 0;
    const impl = async (url: string) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { ok: true, status: 200, statusText: "OK", json: async () => ({ url }) };
    };
    const gate = createSleeperGate({ fetchImpl: impl, maxConcurrent: 2 });
    await Promise.all(Array.from({ length: 6 }, (_, i) => gate.get(`/league/${i}/rosters`)));
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("keeps the cache to its size limit", async () => {
    const gate = createSleeperGate({ fetchImpl: fakeFetch().impl, maxEntries: 3 });
    for (let i = 0; i < 6; i++) await gate.get(`/league/${i}/rosters`);
    expect(gate.stats().cacheEntries).toBe(3);
  });

  it("reports calls per minute", async () => {
    let t = 10 * 60_000;
    const gate = createSleeperGate({ fetchImpl: fakeFetch().impl, now: () => t });
    await gate.get("/league/1/rosters");
    await gate.get("/league/2/rosters");
    const s = gate.stats();
    expect(s.callsLastMinute).toBe(2);
    expect(s.perMinute).toHaveLength(15);
  });
});
