// Shared league lookup (multi-league plan, "Code changes by area" > Server > League lookup).
//
// Every route with a :leagueId parameter (a Sleeper league ID) runs through this once per request via
// app.param. It finds the lasting league that owns that Sleeper ID in league_season_history and puts it on
// req.league. When the request also names a league address (the X-League header, sent by pages under
// /l/<slug>/), a Sleeper ID that belongs to a different league is refused, and the address must exist.
//
// Until phase 4 the lookup is lenient so ATL Dynasty keeps working while the registry fills in: an
// unregistered Sleeper ID passes through without req.league, and so does every request if the registry
// tables are missing or the database is unreachable. Set strict to refuse those instead.
import type { Express, NextFunction, Request, Response } from "express";
import type { League, LeagueSeasonHistory } from "../../shared/schema";

export interface LeagueContext {
  league: League;
  /** The season row the request's Sleeper league ID belongs to (or the current season, for a slug lookup). */
  season: LeagueSeasonHistory;
}

declare module "express-serve-static-core" {
  interface Request {
    league?: LeagueContext;
  }
}

/** Where leagues are read from. The database version is in server/leagueRegistry.ts; tests pass a fake. */
export interface LeagueRegistry {
  findBySleeperLeagueId(sleeperLeagueId: string): Promise<LeagueContext | null>;
  /** The league with this address and its current season. */
  findBySlug(slug: string): Promise<LeagueContext | null>;
}

export type LeagueResolution =
  | { status: "ok"; context: LeagueContext }
  | { status: "unregistered" } // Sleeper ID not in any league's history
  | { status: "unknown_slug"; slug: string }
  | { status: "mismatch"; slug: string; sleeperLeagueId: string } // Sleeper ID belongs to another league
  | { status: "registry_unavailable"; error: unknown };

export const LEAGUE_HEADER = "x-league";

/** League addresses: lower-case letters and digits, single hyphens between them. Same rule as the database. */
export function normalizeSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 64 ? slug : null;
}

interface CacheEntry<T> { value: T; expiresAt: number }

export interface LeagueResolverOptions {
  /** How long a lookup is reused. Default 60 s. */
  ttlMs?: number;
  /** How long "not registered" is reused. Default 15 s, so a newly added league shows up quickly. */
  missTtlMs?: number;
  /** After a registry error, how long to skip the database before trying again. Default 60 s. */
  unavailableRetryMs?: number;
  now?: () => number;
}

export function createLeagueResolver(registry: LeagueRegistry, options: LeagueResolverOptions = {}) {
  const ttlMs = options.ttlMs ?? 60_000;
  const missTtlMs = options.missTtlMs ?? 15_000;
  const unavailableRetryMs = options.unavailableRetryMs ?? 60_000;
  const now = options.now ?? Date.now;
  const bySleeperId = new Map<string, CacheEntry<LeagueContext | null>>();
  const bySlug = new Map<string, CacheEntry<LeagueContext | null>>();

  async function cached(map: Map<string, CacheEntry<LeagueContext | null>>, key: string, load: () => Promise<LeagueContext | null>) {
    const hit = map.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    const value = await load();
    map.set(key, { value, expiresAt: now() + (value ? ttlMs : missTtlMs) });
    return value;
  }

  // After a registry error (say the tables are not created yet), skip the database for a while instead of
  // failing a query on every request.
  let unavailable: { until: number; error: unknown } | null = null;

  async function resolve(sleeperLeagueId: string, slug?: string | null): Promise<LeagueResolution> {
    if (unavailable && unavailable.until > now()) return { status: "registry_unavailable", error: unavailable.error };
    try {
      const context = await cached(bySleeperId, sleeperLeagueId, () => registry.findBySleeperLeagueId(sleeperLeagueId));
      if (slug) {
        const named = await cached(bySlug, slug, () => registry.findBySlug(slug));
        if (!named) return { status: "unknown_slug", slug };
        if (context && context.league.id !== named.league.id) return { status: "mismatch", slug, sleeperLeagueId };
      }
      return context ? { status: "ok", context } : { status: "unregistered" };
    } catch (error) {
      unavailable = { until: now() + unavailableRetryMs, error };
      return { status: "registry_unavailable", error };
    }
  }

  /** Forget cached lookups, e.g. after a league is added or rolled over. */
  function invalidate() {
    bySleeperId.clear();
    bySlug.clear();
    unavailable = null;
  }

  return { resolve, invalidate };
}

export type LeagueResolver = ReturnType<typeof createLeagueResolver>;

export interface LeagueParamOptions {
  /** Refuse unregistered Sleeper IDs and fail closed when the registry is unavailable. Off until phase 4. */
  strict?: boolean;
  log?: (message: string) => void;
}

/** The app.param("leagueId") handler. */
export function leagueParamHandler(resolver: LeagueResolver, options: LeagueParamOptions = {}) {
  const log = options.log ?? ((m: string) => console.warn(m));
  let warnedUnavailable = false;

  return async (req: Request, res: Response, next: NextFunction, value: string) => {
    const rawSlug = req.get(LEAGUE_HEADER);
    const slug = rawSlug == null ? null : normalizeSlug(rawSlug);
    if (rawSlug != null && !slug) {
      res.status(400).json({ error: "Invalid league address" });
      return;
    }

    const result = await resolver.resolve(String(value), slug);
    switch (result.status) {
      case "ok":
        req.league = result.context;
        return next();
      case "unregistered":
        if (options.strict) {
          res.status(404).json({ error: "League not found" });
          return;
        }
        return next();
      case "unknown_slug":
        res.status(404).json({ error: "League not found" });
        return;
      case "mismatch":
        res.status(409).json({ error: "This league ID does not belong to the league in the address" });
        return;
      case "registry_unavailable":
        if (!warnedUnavailable) {
          warnedUnavailable = true;
          const code = (result.error as any)?.code;
          log(`[League] League registry unavailable${code ? ` (${code})` : ""}; continuing without league lookup.`);
        }
        if (options.strict) {
          res.status(503).json({ error: "League registry unavailable" });
          return;
        }
        return next();
    }
  };
}

/** Registers the lookup for every route that has a :leagueId parameter. */
export function registerLeagueLookup(app: Express, resolver: LeagueResolver, options?: LeagueParamOptions) {
  const handler = leagueParamHandler(resolver, options);
  app.param("leagueId", (req, res, next, value) => {
    handler(req, res, next, value).catch(next);
  });
}
