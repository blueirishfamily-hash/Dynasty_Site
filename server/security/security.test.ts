import { describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import {
  SETUP_CODE_TTL_MS,
  fingerprint,
  generateSetupCode,
  hashSecret,
  isValidAdminPasscode,
  isValidPin,
  normalizeSetupCode,
  readPinSlot,
  setupCodeExpired,
  verifySecret,
} from "./secrets";
import { decodeToken, encodeToken, type UnlockToken } from "./unlock";
import { ALL_DEVICES, DEVICE_LIMIT, GLOBAL_LIMIT, PAUSE_MS, WINDOW_MS, createAttemptLimiter, type AttemptStore } from "./attempts";
import type { PinAttempt } from "../../shared/schema";
import { walkSeasonChain } from "../leagueChain";
import type { SleeperLeague } from "../sleeper";

describe("secret hashing", () => {
  it("verifies the right secret and refuses others", async () => {
    const stored = await hashSecret("4821");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("4821");
    expect(await verifySecret("4821", stored)).toBe(true);
    expect(await verifySecret("4822", stored)).toBe(false);
    expect(await verifySecret("4821", null)).toBe(false);
    expect(await verifySecret("4821", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashSecret("4821")).not.toBe(await hashSecret("4821"));
  });
});

describe("PIN slot", () => {
  it("tells a set PIN from a pending setup code", () => {
    expect(readPinSlot(null, null)).toEqual({ state: "none" });
    expect(readPinSlot("scrypt$x", 5)).toEqual({ state: "set", hash: "scrypt$x" });
    expect(readPinSlot("setup:scrypt$x", 5)).toEqual({ state: "setup_pending", hash: "scrypt$x", issuedAt: 5 });
  });

  it("expires setup codes after 7 days", () => {
    const slot = readPinSlot("setup:scrypt$x", 1000);
    expect(setupCodeExpired(slot, 1000 + SETUP_CODE_TTL_MS)).toBe(false);
    expect(setupCodeExpired(slot, 1001 + SETUP_CODE_TTL_MS)).toBe(true);
  });

  it("makes readable setup codes that verify however they are typed", async () => {
    const code = generateSetupCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    const stored = await hashSecret(normalizeSetupCode(code));
    expect(await verifySecret(normalizeSetupCode(code.toLowerCase().replace(/-/g, " ")), stored)).toBe(true);
  });

  it("checks PIN and passcode formats", () => {
    for (const ok of ["1234", "12345678"]) expect(isValidPin(ok)).toBe(true);
    for (const bad of ["123", "123456789", "12a4", 1234, null]) expect(isValidPin(bad)).toBe(false);
    expect(isValidAdminPasscode("short")).toBe(false);
    expect(isValidAdminPasscode("long enough!")).toBe(true);
  });
});

describe("unlock tokens", () => {
  const secret = randomBytes(32);
  const token: UnlockToken = { v: 1, k: "commissioner", leagueId: "L1", commissionerId: "C1", sleeperUserId: "U1", f: "abc" };

  it("round-trips a signed token", () => {
    expect(decodeToken(encodeToken(token, secret), secret)).toEqual(token);
  });

  it("refuses tampered tokens and other secrets", () => {
    const value = encodeToken(token, secret);
    const [body, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...token, leagueId: "L2" })).toString("base64url");
    expect(decodeToken(`${forged}.${sig}`, secret)).toBeNull();
    expect(decodeToken(`${body}.${sig}x`, secret)).toBeNull();
    expect(decodeToken(value, randomBytes(32))).toBeNull();
    expect(decodeToken("nonsense", secret)).toBeNull();
    expect(decodeToken(undefined, secret)).toBeNull();
  });

  it("fingerprints change when the stored hash changes", async () => {
    expect(fingerprint(await hashSecret("1111"))).not.toBe(fingerprint(await hashSecret("1111")));
  });
});

describe("wrong-try limits", () => {
  function memoryStore(): AttemptStore {
    const rows = new Map<string, PinAttempt>();
    const key = (k: string, t: string, d: string) => `${k}|${t}|${d}`;
    return {
      async get(k, t, d) { return rows.get(key(k, t, d)) ?? null; },
      async save(row) { rows.set(key(row.kind, row.target, row.deviceKey), { id: "x", ...row }); },
      async remove(k, t, d) { rows.delete(key(k, t, d)); },
    };
  }

  it("pauses a device for 15 minutes after 5 wrong tries", async () => {
    let t = 0;
    const lim = createAttemptLimiter(memoryStore(), () => t);
    for (let i = 1; i < DEVICE_LIMIT; i++) {
      expect(await lim.recordFailure("commissioner_pin", "C1", "dev")).toEqual({ pausedUntil: null, triesLeft: DEVICE_LIMIT - i });
    }
    expect(await lim.recordFailure("commissioner_pin", "C1", "dev")).toEqual({ pausedUntil: PAUSE_MS, triesLeft: 0 });
    expect(await lim.pausedUntil("commissioner_pin", "C1", "dev")).toBe(PAUSE_MS);
    expect(await lim.pausedUntil("commissioner_pin", "C1", "other-device")).toBeNull();
    expect(await lim.pausedUntil("commissioner_pin", "C2", "dev")).toBeNull();
    t = PAUSE_MS + 1;
    expect(await lim.pausedUntil("commissioner_pin", "C1", "dev")).toBeNull();
  });

  it("forgets old wrong tries after the 15-minute window", async () => {
    let t = 0;
    const lim = createAttemptLimiter(memoryStore(), () => t);
    for (let i = 1; i < DEVICE_LIMIT; i++) await lim.recordFailure("admin_passcode", "passcode", "dev");
    t = WINDOW_MS + 1;
    expect((await lim.recordFailure("admin_passcode", "passcode", "dev")).pausedUntil).toBeNull();
  });

  it("a correct try clears the device's count", async () => {
    const lim = createAttemptLimiter(memoryStore(), () => 0);
    for (let i = 1; i < DEVICE_LIMIT; i++) await lim.recordFailure("commissioner_pin", "C1", "dev");
    await lim.recordSuccess("commissioner_pin", "C1", "dev");
    expect((await lim.recordFailure("commissioner_pin", "C1", "dev")).triesLeft).toBe(DEVICE_LIMIT - 1);
  });

  it("pauses the secret for everyone after 20 wrong tries from many devices", async () => {
    const store = memoryStore();
    const lim = createAttemptLimiter(store, () => 0);
    let paused: number | null = null;
    for (let i = 0; i < GLOBAL_LIMIT; i++) paused = (await lim.recordFailure("commissioner_pin", "C1", `device-${i}`)).pausedUntil;
    expect(paused).toBe(PAUSE_MS);
    expect(await lim.pausedUntil("commissioner_pin", "C1", "brand-new-device")).toBe(PAUSE_MS);
    expect((await store.get("commissioner_pin", "C1", ALL_DEVICES))?.pausedUntil).toBe(PAUSE_MS);
  });
});

describe("walkSeasonChain", () => {
  const league = (id: string, season: string, prev: string | null): SleeperLeague =>
    ({ league_id: id, season, previous_league_id: prev, name: "L", status: "complete", owner_id: "o" }) as SleeperLeague;

  it("returns every season oldest first", async () => {
    const all: Record<string, SleeperLeague> = { a: league("a", "2023", null), b: league("b", "2024", "a"), c: league("c", "2025", "b") };
    const { seasons, stoppedEarly } = await walkSeasonChain("c", async (id) => all[id]);
    expect(seasons.map((s) => [s.season, s.sleeperLeagueId, s.previousSleeperLeagueId])).toEqual([
      ["2023", "a", null], ["2024", "b", "a"], ["2025", "c", "b"],
    ]);
    expect(stoppedEarly).toBe(false);
  });

  it("treats a previous ID of 0 as the first season", async () => {
    const { seasons } = await walkSeasonChain("a", async () => league("a", "2025", "0"));
    expect(seasons).toHaveLength(1);
    expect(seasons[0].previousSleeperLeagueId).toBeNull();
  });

  it("stops at a broken link or a loop", async () => {
    const broken = await walkSeasonChain("b", async (id) => {
      if (id === "b") return league("b", "2024", "gone");
      throw new Error("404");
    });
    expect(broken.seasons.map((s) => s.sleeperLeagueId)).toEqual(["b"]);
    expect(broken.stoppedEarly).toBe(true);
    const loop = await walkSeasonChain("x", async (id) => (id === "x" ? league("x", "2025", "y") : league("y", "2024", "x")));
    expect(loop.seasons.map((s) => s.sleeperLeagueId)).toEqual(["y", "x"]);
    expect(loop.stoppedEarly).toBe(true);
  });
});
