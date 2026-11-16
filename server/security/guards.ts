// Who is acting: the commissioner or site admin whose PIN or passcode unlocked this browser.
//
// Commissioner actions in a league need that league's commissioner unlock (or the site admin's unlock;
// the plan gives the site admin every commissioner action). Admin actions need the admin unlock.
// A commissioner unlock is checked against the league named in the request, so league A's unlock is
// refused in league B.
import type { Request, Response } from "express";
import { LEAGUE_HEADER, normalizeSlug, type LeagueContext } from "../middleware/league";
import { leagueResolver } from "../leagueRegistry";
import { ADMIN_COOKIE, commissionerCookie, decodeToken, readCookies } from "./unlock";
import { fingerprint, readPinSlot } from "./secrets";
import { getAdminPasscodeHash, getCommissioner } from "./store";

export type Actor =
  | { role: "admin" }
  | { role: "commissioner"; leagueId: string; commissionerId: string; sleeperUserId: string; commissionerRole: string };

/** The audit-log fields for an actor. */
export function auditActor(actor: Actor) {
  return actor.role === "admin"
    ? { actorRole: "admin" as const, actorSleeperUserId: null }
    : { actorRole: "commissioner" as const, actorSleeperUserId: actor.sleeperUserId };
}

export async function adminActor(req: Request): Promise<Actor | null> {
  const token = decodeToken(readCookies(req)[ADMIN_COOKIE]);
  if (!token || token.k !== "admin") return null;
  const hash = await getAdminPasscodeHash();
  if (!hash || fingerprint(hash) !== token.f) return null; // passcode changed since this unlock
  return { role: "admin" };
}

export async function commissionerActor(req: Request, leagueId: string): Promise<Actor | null> {
  const token = decodeToken(readCookies(req)[commissionerCookie(leagueId)]);
  if (!token || token.k !== "commissioner" || token.leagueId !== leagueId) return null;
  const row = await getCommissioner(token.commissionerId);
  if (!row || row.leagueId !== leagueId) return null; // removed, or another league's commissioner
  const slot = readPinSlot(row.pinHash, row.pinSetAt);
  if (slot.state !== "set" || fingerprint(row.pinHash!) !== token.f) return null; // PIN changed or reset
  return { role: "commissioner", leagueId, commissionerId: row.id, sleeperUserId: row.sleeperUserId, commissionerRole: row.role };
}

/** The commissioner (or admin) unlocked for this league, or null. Never sends a response. */
export async function leagueActor(req: Request, league: LeagueContext | null | undefined): Promise<Actor | null> {
  try {
    if (league) {
      const commissioner = await commissionerActor(req, league.league.id);
      if (commissioner) return commissioner;
    }
    return await adminActor(req);
  } catch (error) {
    console.error("[Security] Could not check unlock:", error);
    return null;
  }
}

/**
 * For commissioner actions. Returns the actor, or sends 401/403 and returns null.
 * The client opens the PIN prompt on code "commissioner_unlock_required" and retries.
 */
export async function requireCommissioner(req: Request, res: Response, league: LeagueContext | null | undefined = req.league): Promise<Actor | null> {
  if (!league) {
    res.status(403).json({ error: "This league is not registered, so commissioner actions are unavailable.", code: "league_not_registered" });
    return null;
  }
  const actor = await leagueActor(req, league);
  if (actor) return actor;
  res.status(401).json({
    error: "Enter your commissioner PIN to continue.",
    code: "commissioner_unlock_required",
    league: { id: league.league.id, slug: league.league.slug, name: league.league.name },
  });
  return null;
}

/**
 * For commissioner actions whose Sleeper league ID is not a :leagueId route parameter (it comes in the body).
 * Looks the league up the same way the shared lookup does, including the X-League address check.
 */
export async function requireCommissionerFor(req: Request, res: Response, sleeperLeagueId: unknown): Promise<Actor | null> {
  if (typeof sleeperLeagueId !== "string" || !sleeperLeagueId) {
    res.status(400).json({ error: "leagueId is required" });
    return null;
  }
  const rawSlug = req.get(LEAGUE_HEADER);
  const slug = rawSlug == null ? null : normalizeSlug(rawSlug);
  const result = await leagueResolver.resolve(sleeperLeagueId, slug);
  if (result.status === "mismatch" || result.status === "unknown_slug") {
    res.status(409).json({ error: "This league ID does not belong to the league in the address" });
    return null;
  }
  return requireCommissioner(req, res, result.status === "ok" ? result.context : null);
}

/** For site admin actions. Returns the actor, or sends 401 and returns null. */
export async function requireAdmin(req: Request, res: Response): Promise<Actor | null> {
  try {
    const actor = await adminActor(req);
    if (actor) return actor;
  } catch (error) {
    console.error("[Security] Could not check admin unlock:", error);
  }
  res.status(401).json({ error: "Enter the admin passcode to continue.", code: "admin_unlock_required" });
  return null;
}
