// Joining a league and remembered devices (multi-league plan, "First visit flow").
//
//   POST /api/registry/join/check   invite code -> the league's name and whether it asks for a PIN
//   POST /api/registry/join         invite code (+ league PIN if set) -> this device joins, cookie is set
//   GET  /api/registry/my-leagues   the leagues this browser has joined
//   POST /api/registry/leagues/:slug/device/visit  an open league (no invite code) remembers this device as joined
//   POST /api/registry/leagues/:slug/device/team   remember which team this device picked in the league
//
// There is no public list of leagues: a league shows up only after its exact invite code is entered. Wrong
// codes and wrong league PINs are rate limited (5 per device, then a 15-minute pause).
import type { Express, Request, Response } from "express";
import { getLeagueRosters } from "../sleeper";
import { createAttemptLimiter } from "../security/attempts";
import { verifySecret } from "../security/secrets";
import { deviceFor, enrollDevice, joinedLeagueIdCandidates } from "../security/membership";
import { dbMembershipDeps } from "../security/membershipStore";
import { dbAttemptStore, findLeagueByInviteCode, getLeagueById, setDeviceRoster } from "../security/store";
import { deviceKey } from "../security/unlock";
import { dbLeagueRegistry } from "../leagueRegistry";
import { normalizeSlug } from "../middleware/league";
import type { League } from "../../shared/schema";

const limiter = createAttemptLimiter(dbAttemptStore);

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      console.error(`[Join] ${req.method} ${req.path} failed:`, error?.code || error);
      if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

const paused = (res: Response, until: number) =>
  res.status(429).json({ error: "Too many wrong tries. Try again after the pause.", code: "paused", pausedUntil: until });

/** Looks the invite code up under the wrong-try limits. Sends the error and returns null when it fails. */
async function leagueForCode(req: Request, res: Response): Promise<League | null> {
  const raw = typeof req.body?.inviteCode === "string" ? req.body.inviteCode.trim().toUpperCase() : "";
  const device = deviceKey(req, res);
  const until = await limiter.pausedUntil("invite_code", "", device);
  if (until) {
    paused(res, until);
    return null;
  }
  const league = /^[A-Z0-9]{6,32}$/.test(raw) ? await findLeagueByInviteCode(raw) : null;
  if (league) {
    await limiter.recordSuccess("invite_code", "", device);
    return league;
  }
  const fail = await limiter.recordFailure("invite_code", "", device);
  if (fail.pausedUntil) paused(res, fail.pausedUntil);
  else res.status(404).json({ error: "That code doesn't match a league.", code: "wrong_secret", triesLeft: fail.triesLeft });
  return null;
}

export function registerJoinRoutes(app: Express): void {
  app.post("/api/registry/join/check", handle(async (req, res) => {
    const league = await leagueForCode(req, res);
    if (!league) return;
    const already = !!(await deviceFor(req, league.id, dbMembershipDeps));
    res.json({ slug: league.slug, name: league.name, pinRequired: !!league.leaguePinHash && !already, alreadyJoined: already });
  }));

  app.post("/api/registry/join", handle(async (req, res) => {
    const league = await leagueForCode(req, res);
    if (!league) return;
    if (await deviceFor(req, league.id, dbMembershipDeps)) {
      return res.json({ joined: true, slug: league.slug, name: league.name, alreadyJoined: true });
    }
    if (league.leaguePinHash) {
      const pin = typeof req.body?.leaguePin === "string" ? req.body.leaguePin : "";
      const device = deviceKey(req, res);
      const until = await limiter.pausedUntil("league_pin", league.id, device);
      if (until) return paused(res, until);
      if (!pin) return res.status(401).json({ error: "Enter the league PIN.", code: "pin_required" });
      if (!(await verifySecret(pin, league.leaguePinHash))) {
        const fail = await limiter.recordFailure("league_pin", league.id, device);
        if (fail.pausedUntil) return paused(res, fail.pausedUntil);
        return res.status(401).json({ error: "Wrong league PIN.", code: "wrong_secret", triesLeft: fail.triesLeft });
      }
      await limiter.recordSuccess("league_pin", league.id, device);
    }
    await enrollDevice(req, res, league.id, dbMembershipDeps);
    res.json({ joined: true, slug: league.slug, name: league.name });
  }));

  app.get("/api/registry/my-leagues", handle(async (req, res) => {
    const out: Array<{ slug: string; name: string; rosterId: number | null }> = [];
    for (const id of joinedLeagueIdCandidates(req).slice(0, 25)) {
      const device = await deviceFor(req, id, dbMembershipDeps);
      if (!device) continue;
      const league = await getLeagueById(id);
      if (league && league.status === "active") out.push({ slug: league.slug, name: league.name, rosterId: device.rosterId });
    }
    res.json(out);
  }));

  // Opening a league that has no invite code records this device as a member, as if it had joined with a code. That
  // way devices that already use an open league stay members if a code is added later. Leagues with a code do nothing here.
  app.post("/api/registry/leagues/:slug/device/visit", handle(async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    const found = slug ? await dbLeagueRegistry.findBySlug(slug) : null;
    if (!found || found.league.status !== "active") return res.status(404).json({ error: "League not found" });
    if (found.league.inviteCode) return res.json({ enrolled: false });
    if (await deviceFor(req, found.league.id, dbMembershipDeps)) return res.json({ enrolled: false });
    await enrollDevice(req, res, found.league.id, dbMembershipDeps);
    res.json({ enrolled: true });
  }));

  app.post("/api/registry/leagues/:slug/device/team", handle(async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    const found = slug ? await dbLeagueRegistry.findBySlug(slug) : null;
    if (!found) return res.status(404).json({ error: "League not found" });
    const device = await deviceFor(req, found.league.id, dbMembershipDeps);
    if (!device) return res.status(403).json({ error: "Join this league first.", code: "join_required" });
    const rosterId = Number(req.body?.rosterId);
    if (!Number.isInteger(rosterId) || rosterId <= 0) return res.status(400).json({ error: "Pick a team." });
    const rosters = await getLeagueRosters(found.season.sleeperLeagueId);
    if (!rosters.some((r) => r.roster_id === rosterId)) return res.status(403).json({ error: "That team isn't in this league.", code: "roster_not_in_league" });
    await setDeviceRoster(device.id, rosterId);
    res.json({ saved: true });
  }));
}
