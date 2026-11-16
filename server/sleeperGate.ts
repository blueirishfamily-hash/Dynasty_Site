// One door for every Sleeper call (multi-league plan, "Managing Sleeper load").
//
//  - Shared cache: the same Sleeper path is fetched once and reused for every league and request, with a
//    lifetime by how fast the data changes (player list daily, NFL state minutes, league settings and users
//    long, rosters and transactions a few minutes, live matchups about a minute).
//  - Dedupe: identical requests made at the same time share one call.
//  - Queue: real calls go out at most `maxPerMinute` times a minute (default 300, well under Sleeper's 1,000)
//    and `maxConcurrent` at once. Calls over the limit wait their turn instead of failing.
//  - Stats: calls per minute, cache hits and queue depth, for the admin page.
//
// Errors are never cached. Completed weeks and seasons come from the app's snapshot tables, not from here.

export interface GateOptions {
  baseUrl?: string;
  maxPerMinute?: number;
  maxConcurrent?: number;
  maxEntries?: number;
  fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; statusText: string; json(): Promise<unknown> }>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** How long a response is reused, by Sleeper path. */
export function ttlForEndpoint(endpoint: string): number {
  const path = endpoint.split("?")[0];
  if (path === "/players/nfl") return 24 * HOUR;
  if (path.startsWith("/players/nfl/trending")) return 10 * MIN;
  if (path === "/state/nfl") return 2 * MIN;
  if (/^\/user\//.test(path)) return HOUR;
  if (/^\/league\/[^/]+$/.test(path)) return 30 * MIN; // settings
  if (/^\/league\/[^/]+\/users$/.test(path)) return HOUR;
  if (/^\/league\/[^/]+\/matchups\/\d+$/.test(path)) return MIN; // live scores
  if (/^\/league\/[^/]+\/(rosters|transactions\/\d+|traded_picks|drafts)$/.test(path)) return 2 * MIN;
  if (/^\/draft\/[^/]+\/picks$/.test(path)) return MIN; // a draft can be live
  if (/^\/draft\//.test(path)) return 5 * MIN;
  if (/^\/league\/[^/]+\/(winners_bracket|losers_bracket)$/.test(path)) return 5 * MIN;
  if (/^\/stats\//.test(path)) return 10 * MIN;
  if (/^\/projections\//.test(path)) return 30 * MIN;
  return 2 * MIN;
}

/** Large shared payloads are handed out as they are; everything else is copied so callers can't change the cache. */
const sharedAsIs = (endpoint: string) => /^\/(players|stats|projections)\//.test(endpoint);

export function createSleeperGate(options: GateOptions = {}) {
  const baseUrl = options.baseUrl ?? "https://api.sleeper.app/v1";
  const maxPerMinute = options.maxPerMinute ?? 300;
  const maxConcurrent = options.maxConcurrent ?? 8;
  const maxEntries = options.maxEntries ?? 300;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const doFetch = options.fetchImpl ?? ((url: string) => fetch(url) as any);

  const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
  const inFlight = new Map<string, Promise<unknown>>();
  const callTimes: number[] = []; // network calls in the last hour
  const counters = { hits: 0, misses: 0, deduped: 0, errors: 0 };
  let active = 0;
  let queued = 0;
  const waiters: Array<() => void> = [];

  function trimCalls() {
    const cutoff = now() - HOUR;
    while (callTimes.length && callTimes[0] < cutoff) callTimes.shift();
  }

  async function acquire() {
    queued++;
    try {
      while (true) {
        trimCalls();
        const recent = callTimes.filter((t) => t > now() - MIN);
        if (active < maxConcurrent && recent.length < maxPerMinute) break;
        if (recent.length >= maxPerMinute) await sleep(Math.max(50, recent[0] + MIN - now()));
        else await new Promise<void>((r) => waiters.push(r));
      }
    } finally {
      queued--;
    }
    active++;
    callTimes.push(now());
  }

  function release() {
    active--;
    waiters.shift()?.();
  }

  function evict() {
    if (cache.size <= maxEntries) return;
    // Oldest entries first.
    const byAge = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at);
    for (const [key] of byAge.slice(0, cache.size - maxEntries)) cache.delete(key);
  }

  async function get<T>(endpoint: string): Promise<T> {
    const hit = cache.get(endpoint);
    if (hit && now() - hit.at < hit.ttl) {
      counters.hits++;
      return (sharedAsIs(endpoint) ? hit.value : structuredClone(hit.value)) as T;
    }
    let pending = inFlight.get(endpoint);
    if (pending) {
      counters.deduped++;
    } else {
      counters.misses++;
      pending = (async () => {
        await acquire();
        try {
          const response = await doFetch(`${baseUrl}${endpoint}`);
          if (!response.ok) throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
          const value = await response.json();
          cache.set(endpoint, { at: now(), ttl: ttlForEndpoint(endpoint), value });
          evict();
          return value;
        } catch (error) {
          counters.errors++;
          throw error;
        } finally {
          release();
        }
      })().finally(() => inFlight.delete(endpoint));
      inFlight.set(endpoint, pending);
    }
    const value = await pending;
    return (sharedAsIs(endpoint) ? value : structuredClone(value)) as T;
  }

  function stats() {
    trimCalls();
    const t = now();
    const perMinute: number[] = [];
    for (let i = 14; i >= 0; i--) perMinute.push(callTimes.filter((c) => c > t - (i + 1) * MIN && c <= t - i * MIN).length);
    return {
      callsLastMinute: callTimes.filter((c) => c > t - MIN).length,
      callsLastHour: callTimes.length,
      perMinute, // oldest first, last 15 minutes
      limitPerMinute: maxPerMinute,
      cacheEntries: cache.size,
      cacheHits: counters.hits,
      cacheMisses: counters.misses,
      dedupedRequests: counters.deduped,
      errors: counters.errors,
      queued,
      active,
    };
  }

  return { get, stats, clear: () => cache.clear() };
}

export type SleeperGate = ReturnType<typeof createSleeperGate>;
