// Membership checks on writes (multi-league plan, "Membership check"): every write to a league needs a device
// that joined that league, and any roster it names must belong to that league.
//
//  - Commissioner or admin unlock counts as a member (they are checked by their own PIN or passcode).
//  - Leagues without an invite code can't be joined, so they aren't asked to; the roster check still applies.
//  - During a league's grace period, a write from a device that hasn't joined joins it quietly.
//  - Unregistered leagues and an unreachable registry keep today's lenient behavior, like the league lookup.
//
// Reads stay open (the plan limits this check to writes). The client asks for the invite code before showing a
// league's pages.
import type { NextFunction, Request, Response } from "express";
import type { LeagueContext, LeagueResolver } from "./league";
import { LEAGUE_HEADER, normalizeSlug } from "./league";
import { deviceFor, enrollDevice, isGraceActive, type MembershipDeps } from "../security/membership";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** /api/league/<word> routes that are not for one league. */
const NOT_A_LEAGUE_ID = new Set(["active", "list", "set-active", "advance-year", "migration"]);

export type WriteTarget = { kind: "league"; sleeperLeagueId: string } | { kind: "rule"; ruleId: string };

/** Which league a write belongs to, from its path: /api/league(s)/<id>/..., or a rule vote (the rule's league). */
export function memberWriteTarget(path: string): WriteTarget | null {
  const league = path.match(/^\/api\/leagues?\/([^/]+)\/./);
  if (league && !NOT_A_LEAGUE_ID.has(league[1])) return { kind: "league", sleeperLeagueId: decodeURIComponent(league[1]) };
  const rule = path.match(/^\/api\/rule-suggestions\/([^/]+)\/(?:vote|toggle-voting)$/);
  if (rule) return { kind: "rule", ruleId: decodeURIComponent(rule[1]) };
  return null;
}

const BODY_ROSTER_FIELDS = ["rosterId", "teamARosterId", "teamBRosterId", "nominatedByRosterId", "originalRosterId"];

/** Roster IDs a write names: body fields, a roster in the path, or a trailing roster in a bid, favorite or draft path. */
export function requestRosterIds(req: Pick<Request, "path" | "body" | "query">): number[] {
  const ids = new Set<number>();
  const add = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
    if (Number.isInteger(n) && n > 0) ids.add(n);
  };
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const f of BODY_ROSTER_FIELDS) add(body[f]);
  add((req.query as Record<string, unknown> | undefined)?.rosterId);
  const roster = req.path.match(/\/roster\/(\d+)(?:\/|$)/);
  if (roster) add(roster[1]);
  const trailing = req.path.match(/\/(?:bids|favorites|contract-drafts)\/(?:[^/]+\/)?(\d+)$/);
  if (trailing) add(trailing[1]);
  return Array.from(ids);
}

export interface MemberGateDeps {
  resolver: LeagueResolver;
  membership: MembershipDeps;
  /** The Sleeper league ID of a rule suggestion. */
  ruleLeague(ruleId: string): Promise<string | undefined>;
  /** Roster IDs in a Sleeper league. */
  rosterIds(sleeperLeagueId: string): Promise<number[]>;
  /** Whether a commissioner or admin is unlocked for this league. */
  isUnlockedStaff(req: Request, league: LeagueContext): Promise<boolean>;
}

export function memberGate(deps: MemberGateDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const target = memberWriteTarget(req.path);
    if (!target) return next();
    try {
      const sleeperLeagueId = target.kind === "league" ? target.sleeperLeagueId : await deps.ruleLeague(target.ruleId);
      if (!sleeperLeagueId) return next(); // unknown rule: the route answers 404

      const rawSlug = req.get(LEAGUE_HEADER);
      const resolved = await deps.resolver.resolve(sleeperLeagueId, rawSlug == null ? null : normalizeSlug(rawSlug));
      if (resolved.status === "mismatch") {
        res.status(409).json({ error: "This league ID does not belong to the league in the address" });
        return;
      }
      if (resolved.status === "unknown_slug") {
        res.status(404).json({ error: "League not found" });
        return;
      }
      if (resolved.status !== "ok") return next(); // unregistered, or the registry is unavailable
      const ctx = resolved.context;
      const league = ctx.league;

      if (league.status !== "active") {
        res.status(403).json({ error: "This league is archived.", code: "league_archived" });
        return;
      }

      if (league.inviteCode && !(await deps.isUnlockedStaff(req, ctx))) {
        const device = await deviceFor(req, league.id, deps.membership);
        if (!device) {
          if (isGraceActive(await deps.membership.graceUntil(league.id))) {
            await enrollDevice(req, res, league.id, deps.membership);
          } else {
            res.status(403).json({
              error: "Join this league with its invite code first.",
              code: "join_required",
              league: { slug: league.slug, name: league.name },
            });
            return;
          }
        }
      }

      const named = requestRosterIds(req);
      if (named.length > 0) {
        let allowed: number[];
        try {
          allowed = await deps.rosterIds(sleeperLeagueId);
        } catch {
          res.status(503).json({ error: "Couldn't check the team right now. Try again in a moment." });
          return;
        }
        if (named.some((id) => !allowed.includes(id))) {
          res.status(403).json({ error: "That team isn't in this league.", code: "roster_not_in_league" });
          return;
        }
      }
      next();
    } catch (error) {
      console.error("[Membership] Check failed:", error);
      res.status(503).json({ error: "Couldn't check league membership. Try again in a moment." });
    }
  };
}
