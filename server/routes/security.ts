// Unlocking: commissioner PINs (per league) and the site admin passcode.
//
// Commissioner:  /api/registry/leagues/:slug/commissioners          who the commissioners are (no hashes)
//                /api/registry/leagues/:slug/unlock-status          who has unlocked this league in this browser
//                /api/registry/leagues/:slug/commissioner/unlock    PIN -> unlock
//                /api/registry/leagues/:slug/commissioner/set-pin   first use: set your own PIN -> unlock
//                /api/registry/leagues/:slug/commissioner/pin       change own PIN (needs current PIN)
//                /api/registry/leagues/:slug/commissioner/lock      end this browser's unlock
// Site admin:    /api/admin/status, /api/admin/unlock, /api/admin/passcode, /api/admin/passcode/recover, /api/admin/lock
import type { Express, Request, Response } from "express";
import { dbLeagueRegistry } from "../leagueRegistry";
import { normalizeSlug, type LeagueContext } from "../middleware/league";
import { createAttemptLimiter, type AttemptKind } from "../security/attempts";
import { adminActor, commissionerActor } from "../security/guards";
import {
  fingerprint,
  hashSecret,
  isValidAdminPasscode,
  isValidPin,
  readPinSlot,
  safeEqual,
  verifySecret,
} from "../security/secrets";
import {
  dbAttemptStore,
  findCommissioner,
  getAdminPasscodeHash,
  listCommissioners,
  setAdminPasscodeHash,
  setCommissionerPinHash,
  setCommissionerPinIfUnset,
  writeAudit,
} from "../security/store";
import { ADMIN_COOKIE, clearCookie, commissionerCookie, deviceKey, encodeToken, setSessionCookie } from "../security/unlock";

const limiter = createAttemptLimiter(dbAttemptStore);

function pausedResponse(res: Response, until: number) {
  res.status(429).json({
    error: "Too many wrong tries. Try again after the pause.",
    code: "paused",
    pausedUntil: until,
  });
}

/** Checks a secret with the wrong-try limits. Sends the error response and returns false when it fails. */
async function checkWithLimits(
  req: Request,
  res: Response,
  kind: AttemptKind,
  target: string,
  check: () => Promise<boolean>,
  wrongMessage: string,
): Promise<boolean> {
  const device = deviceKey(req, res);
  const paused = await limiter.pausedUntil(kind, target, device);
  if (paused) {
    pausedResponse(res, paused);
    return false;
  }
  if (await check()) {
    await limiter.recordSuccess(kind, target, device);
    return true;
  }
  const { pausedUntil, triesLeft } = await limiter.recordFailure(kind, target, device);
  if (pausedUntil) pausedResponse(res, pausedUntil);
  else res.status(401).json({ error: wrongMessage, code: "wrong_secret", triesLeft });
  return false;
}

export async function leagueFromSlug(req: Request, res: Response): Promise<LeagueContext | null> {
  const slug = normalizeSlug(req.params.slug);
  const league = slug ? await dbLeagueRegistry.findBySlug(slug) : null;
  if (!league || league.league.status !== "active") {
    res.status(404).json({ error: "League not found" });
    return null;
  }
  return league;
}

function setCommissionerUnlock(req: Request, res: Response, leagueId: string, commissionerId: string, sleeperUserId: string, pinHash: string) {
  setSessionCookie(
    req,
    res,
    commissionerCookie(leagueId),
    encodeToken({ v: 1, k: "commissioner", leagueId, commissionerId, sleeperUserId, f: fingerprint(pinHash) }),
  );
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      console.error(`[Security] ${req.method} ${req.path} failed:`, error?.code || error);
      if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

export function registerSecurityRoutes(app: Express): void {
  // ─── Commissioners ───────────────────────────────────────────────────────────

  app.get("/api/registry/leagues/:slug/commissioners", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const rows = await listCommissioners(league.league.id);
    res.json(rows.map((c) => {
      const slot = readPinSlot(c.pinHash, c.pinSetAt);
      return {
        sleeperUserId: c.sleeperUserId,
        role: c.role,
        pinState: slot.state,
      };
    }));
  }));

  app.get("/api/registry/leagues/:slug/unlock-status", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const [commissioner, admin] = await Promise.all([commissionerActor(req, league.league.id), adminActor(req)]);
    res.json({
      commissioner: commissioner?.role === "commissioner"
        ? { sleeperUserId: commissioner.sleeperUserId, role: commissioner.commissionerRole }
        : null,
      admin: !!admin,
    });
  }));

  app.post("/api/registry/leagues/:slug/commissioner/unlock", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const { sleeperUserId, pin } = req.body ?? {};
    if (typeof sleeperUserId !== "string" || typeof pin !== "string") return res.status(400).json({ error: "sleeperUserId and pin are required" });
    const row = await findCommissioner(league.league.id, sleeperUserId);
    if (!row) return res.status(403).json({ error: "You are not a commissioner of this league.", code: "not_commissioner" });
    const slot = readPinSlot(row.pinHash, row.pinSetAt);
    if (slot.state === "none") return res.status(409).json({ error: "You don't have a PIN yet. Set one.", code: "pin_not_set" });
    const ok = await checkWithLimits(req, res, "commissioner_pin", row.id, () => verifySecret(pin, slot.hash), "Wrong PIN.");
    if (!ok) return;
    setCommissionerUnlock(req, res, league.league.id, row.id, row.sleeperUserId, row.pinHash!);
    res.json({ unlocked: true, sleeperUserId: row.sleeperUserId, role: row.role });
  }));

  // First use: a commissioner who hasn't set a PIN sets their own. There is nothing to prove who they are beyond
  // being listed as a commissioner of the league, so whoever gets here first for a commissioner with no PIN sets
  // it. Set your PIN right after being added. Every set is written to the audit log.
  app.post("/api/registry/leagues/:slug/commissioner/set-pin", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const { sleeperUserId, newPin } = req.body ?? {};
    if (typeof sleeperUserId !== "string") return res.status(400).json({ error: "sleeperUserId is required" });
    if (!isValidPin(newPin)) return res.status(400).json({ error: "A PIN is 4 to 8 digits.", code: "invalid_pin" });
    const row = await findCommissioner(league.league.id, sleeperUserId);
    if (!row) return res.status(403).json({ error: "You are not a commissioner of this league.", code: "not_commissioner" });
    const alreadySet = () => res.status(409).json({ error: "A PIN is already set. Enter it to unlock.", code: "pin_already_set" });
    if (readPinSlot(row.pinHash, row.pinSetAt).state !== "none") return alreadySet();
    const now = Date.now();
    const pinHash = await hashSecret(newPin);
    if (!(await setCommissionerPinIfUnset(row.id, pinHash, now))) return alreadySet(); // someone set it a moment ago
    await writeAudit({ leagueId: league.league.id, actorSleeperUserId: row.sleeperUserId, actorRole: "commissioner", action: "commissioner_pin_set", details: { commissionerId: row.id } }, now);
    setCommissionerUnlock(req, res, league.league.id, row.id, row.sleeperUserId, pinHash);
    res.json({ unlocked: true, sleeperUserId: row.sleeperUserId, role: row.role });
  }));

  app.post("/api/registry/leagues/:slug/commissioner/pin", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    // The current PIN is checked below (with the wrong-try limits), so this doesn't also need an unlocked browser.
    const actor = await commissionerActor(req, league.league.id);
    const { currentPin, newPin, sleeperUserId } = req.body ?? {};
    const who = actor && actor.role === "commissioner" ? actor.sleeperUserId : sleeperUserId;
    if (typeof who !== "string") return res.status(400).json({ error: "sleeperUserId is required" });
    if (!isValidPin(newPin)) return res.status(400).json({ error: "A PIN is 4 to 8 digits.", code: "invalid_pin" });
    const row = await findCommissioner(league.league.id, who);
    const slot = readPinSlot(row?.pinHash, row?.pinSetAt);
    if (!row) return res.status(403).json({ error: "You are not a commissioner of this league.", code: "not_commissioner" });
    if (slot.state !== "set") return res.status(409).json({ error: "Your PIN is not set yet. Set it first.", code: "pin_not_set" });
    const ok = await checkWithLimits(req, res, "commissioner_pin", row.id, () => verifySecret(String(currentPin ?? ""), slot.hash), "Your current PIN is wrong.");
    if (!ok) return;
    const now = Date.now();
    const pinHash = await hashSecret(newPin);
    await setCommissionerPinHash(row.id, pinHash, now);
    await writeAudit({ leagueId: league.league.id, actorSleeperUserId: row.sleeperUserId, actorRole: "commissioner", action: "commissioner_pin_changed", details: { commissionerId: row.id } }, now);
    setCommissionerUnlock(req, res, league.league.id, row.id, row.sleeperUserId, pinHash);
    res.json({ changed: true });
  }));

  app.post("/api/registry/leagues/:slug/commissioner/lock", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    clearCookie(req, res, commissionerCookie(league.league.id));
    res.json({ locked: true });
  }));

  // ─── Site admin ──────────────────────────────────────────────────────────────

  const recoveryKey = () => {
    const key = process.env.ADMIN_RECOVERY_KEY;
    return key && key.length >= 24 ? key : null;
  };

  app.get("/api/admin/status", handle(async (req, res) => {
    const [hash, actor] = await Promise.all([getAdminPasscodeHash(), adminActor(req)]);
    res.json({ passcodeSet: !!hash, recoveryKeyConfigured: !!recoveryKey(), unlocked: !!actor });
  }));

  app.post("/api/admin/unlock", handle(async (req, res) => {
    const { passcode } = req.body ?? {};
    if (typeof passcode !== "string") return res.status(400).json({ error: "passcode is required" });
    const hash = await getAdminPasscodeHash();
    if (!hash) return res.status(409).json({ error: "The admin passcode is not set yet. Set it with the recovery key.", code: "passcode_not_set" });
    const ok = await checkWithLimits(req, res, "admin_passcode", "passcode", () => verifySecret(passcode, hash), "Wrong passcode.");
    if (!ok) return;
    setSessionCookie(req, res, ADMIN_COOKIE, encodeToken({ v: 1, k: "admin", f: fingerprint(hash) }));
    res.json({ unlocked: true });
  }));

  // First-time setup, or a forgotten passcode: needs ADMIN_RECOVERY_KEY from the server's .env.
  app.post("/api/admin/passcode/recover", handle(async (req, res) => {
    const key = recoveryKey();
    if (!key) return res.status(409).json({ error: "ADMIN_RECOVERY_KEY (24+ characters) is not set in the server's .env.", code: "recovery_not_configured" });
    const { recoveryKey: given, newPasscode } = req.body ?? {};
    if (!isValidAdminPasscode(newPasscode)) return res.status(400).json({ error: "The passcode needs at least 10 characters.", code: "invalid_passcode" });
    const ok = await checkWithLimits(req, res, "admin_passcode", "recovery", async () => typeof given === "string" && safeEqual(given, key), "Wrong recovery key.");
    if (!ok) return;
    const now = Date.now();
    const hadPasscode = !!(await getAdminPasscodeHash());
    const hash = await hashSecret(newPasscode);
    await setAdminPasscodeHash(hash, now);
    await writeAudit({ leagueId: null, actorSleeperUserId: null, actorRole: "admin", action: hadPasscode ? "admin_passcode_recovered" : "admin_passcode_set", details: null }, now);
    setSessionCookie(req, res, ADMIN_COOKIE, encodeToken({ v: 1, k: "admin", f: fingerprint(hash) }));
    res.json({ unlocked: true });
  }));

  app.post("/api/admin/passcode", handle(async (req, res) => {
    if (!(await adminActor(req))) return res.status(401).json({ error: "Enter the admin passcode to continue.", code: "admin_unlock_required" });
    const { currentPasscode, newPasscode } = req.body ?? {};
    if (!isValidAdminPasscode(newPasscode)) return res.status(400).json({ error: "The passcode needs at least 10 characters.", code: "invalid_passcode" });
    const hash = await getAdminPasscodeHash();
    const ok = await checkWithLimits(req, res, "admin_passcode", "passcode", () => verifySecret(String(currentPasscode ?? ""), hash), "Your current passcode is wrong.");
    if (!ok) return;
    const now = Date.now();
    const newHash = await hashSecret(newPasscode);
    await setAdminPasscodeHash(newHash, now);
    await writeAudit({ leagueId: null, actorSleeperUserId: null, actorRole: "admin", action: "admin_passcode_changed", details: null }, now);
    setSessionCookie(req, res, ADMIN_COOKIE, encodeToken({ v: 1, k: "admin", f: fingerprint(newHash) }));
    res.json({ changed: true });
  }));

  app.post("/api/admin/lock", (req, res) => {
    clearCookie(req, res, ADMIN_COOKIE);
    res.json({ locked: true });
  });
}
