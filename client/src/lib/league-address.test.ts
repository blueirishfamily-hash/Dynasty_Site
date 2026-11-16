import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal browser stand-ins: the module installs its fetch wrapper on import.
const seen: Array<{ url: string; league: string | null }> = [];
const store = new Map<string, string>();
const original = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  seen.push({ url, league: new Headers(init?.headers).get("X-League") });
  return new Response("{}");
});

let mod: typeof import("./league-address");

beforeAll(async () => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:5174" }, fetch: original });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  mod = await import("./league-address");
});

beforeEach(() => {
  seen.length = 0;
  store.clear();
  mod.setLeagueSlug(null);
});

describe("X-League header", () => {
  it("is not sent before a league address is open", async () => {
    await window.fetch("/api/sleeper/nfl-state");
    expect(seen[0].league).toBeNull();
  });

  it("is added to same-origin /api/ requests, keeping other headers", async () => {
    mod.setLeagueSlug("atl-dynasty");
    await window.fetch("/api/league/123/contracts", { headers: { "Content-Type": "application/json" } });
    await window.fetch("http://localhost:5174/api/registry/leagues/atl-dynasty");
    expect(seen.map((s) => s.league)).toEqual(["atl-dynasty", "atl-dynasty"]);
  });

  it("is not added to other sites or non-API paths", async () => {
    mod.setLeagueSlug("atl-dynasty");
    await window.fetch("https://api.sleeper.app/v1/league/1");
    await window.fetch("/assets/logo.png");
    expect(seen.map((s) => s.league)).toEqual([null, null]);
  });

  it("does not replace a header the caller set", async () => {
    mod.setLeagueSlug("atl-dynasty");
    await window.fetch("/api/x", { headers: { "X-League": "other-league" } });
    expect(seen[0].league).toBe("other-league");
  });
});

describe("league addresses", () => {
  it("validates slugs like the server", () => {
    expect(mod.isValidLeagueSlug("atl-dynasty")).toBe(true);
    for (const bad of ["ATL", "a--b", "-a", "a_b", ""]) expect(mod.isValidLeagueSlug(bad)).toBe(false);
  });

  it("redirects old addresses to ATL Dynasty, keeping the page and query", () => {
    expect(mod.legacyRedirectTarget("/", "")).toBe("/l/atl-dynasty");
    expect(mod.legacyRedirectTarget("/standings", "view=bracket")).toBe("/l/atl-dynasty/standings?view=bracket");
    expect(mod.legacyRedirectTarget("/history/teams/4", "?a=1")).toBe("/l/atl-dynasty/history/teams/4?a=1");
  });

  it("redirects to the last league this device used", () => {
    mod.setLeagueSlug("friends-league");
    expect(mod.legacyRedirectTarget("/team", "")).toBe("/l/friends-league/team");
  });
});
