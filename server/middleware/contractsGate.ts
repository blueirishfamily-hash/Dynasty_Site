// Contracts switch (multi-league plan, "Per-league settings"): when a league has contracts off, every
// contract route refuses, so turning the switch off can't be bypassed from the browser. The data is kept.
import type { NextFunction, Request, Response } from "express";
import { LEAGUE_HEADER, normalizeSlug, type LeagueResolver } from "./league";

/**
 * The part of the path after /api/league/:leagueId/ (or /api/leagues/:leagueId/) that belongs to the
 * contracts feature: contracts, extensions, tags, free agency bidding, dead cap, cap checks, RFA,
 * the contract phase, rookie contracts and the commissioner's contract edits.
 */
const CONTRACT_PATHS = new RegExp(
  "^(?:" +
    [
      "contracts(?:/.*)?",
      "rookie-contracts/.*",
      "extensions(?:/.*)?",
      "rookie-extension-salary",
      "non-rookie-extension-salary",
      "franchise-tag(?:/.*)?",
      "draft-capital",
      "bids(?:/.*)?",
      "dead-cap(?:/.*)?",
      "settings/dead-cap-enabled",
      "contract-phase",
      "fa-signed",
      "fa-recap",
      "fa-bids",
      "fa-round(?:/.*)?",
      "fa-round-summary",
      "roster/[^/]+/(?:round-wins|round-confirm|cap-check)",
      "rfa(?:/.*)?",
      "trade-offers",
      "in-season-signing",
      "contract-moves(?:/.*)?",
      "commissioner/(?:contract|dead-cap|change-log)(?:/.*)?",
    ].join("|") +
    ")$",
);

const LEAGUE_ROUTE = /^\/api\/leagues?\/([^/]+)\/(.+)$/;

/** The Sleeper league ID of a contract route, or null when the path isn't one. */
export function contractRouteLeagueId(path: string): string | null {
  const m = path.match(LEAGUE_ROUTE);
  if (!m) return null;
  return CONTRACT_PATHS.test(m[2]) ? decodeURIComponent(m[1]) : null;
}

export function contractsGate(resolver: LeagueResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sleeperLeagueId = contractRouteLeagueId(req.path);
    if (!sleeperLeagueId) return next();
    try {
      const rawSlug = req.get(LEAGUE_HEADER);
      const result = await resolver.resolve(sleeperLeagueId, rawSlug == null ? null : normalizeSlug(rawSlug));
      // Unregistered leagues and an unreachable registry keep today's behavior (contracts available);
      // the shared lookup handles address mismatches.
      if (result.status === "ok" && result.context.league.contractsEnabled !== 1) {
        res.status(403).json({ error: "Contracts are turned off for this league.", code: "contracts_off" });
        return;
      }
    } catch (error) {
      console.error("[Contracts switch] Lookup failed; allowing the request:", error);
    }
    next();
  };
}
