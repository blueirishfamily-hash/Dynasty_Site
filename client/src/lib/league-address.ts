// League addresses: every page lives under /l/<slug>/ (multi-league plan, "League address in links").
//
// The current address is kept here so every /api/ request can say which league it is for (X-League
// header). The server refuses a Sleeper league ID that belongs to a different league than the address.

/** Old addresses without /l/<slug>/ open this league unless the device last used another one. */
export const LEGACY_LEAGUE_SLUG = "atl-dynasty";

export const LEAGUE_HEADER = "X-League";
const LAST_SLUG_KEY = "last_league_slug";

/** Same rule as the server and the database: lower-case letters and digits, single hyphens between them. */
export function isValidLeagueSlug(slug: string): boolean {
  return slug.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

let currentSlug: string | null = null;

export function getLeagueSlug(): string | null {
  return currentSlug;
}

/** Called when a /l/<slug>/ page renders. Also remembers the league as this device's last used one. */
export function setLeagueSlug(slug: string | null) {
  currentSlug = slug;
  if (!slug) return;
  try {
    localStorage.setItem(LAST_SLUG_KEY, slug);
  } catch {
    // storage unavailable (private window): the address still works, it just isn't remembered
  }
}

export function getLastLeagueSlug(): string | null {
  try {
    const slug = localStorage.getItem(LAST_SLUG_KEY);
    return slug && isValidLeagueSlug(slug) ? slug : null;
  } catch {
    return null;
  }
}

/** Where an old address (no /l/<slug>/) goes: same page and query string under the last used league. */
export function legacyRedirectTarget(path: string, search: string): string {
  const slug = getLastLeagueSlug() ?? LEGACY_LEAGUE_SLUG;
  const rest = path === "/" ? "" : path;
  return `/l/${slug}${rest}${search ? `?${search.replace(/^\?/, "")}` : ""}`;
}

/** Adds X-League to same-origin /api/ requests while a league address is open. */
function needsLeagueHeader(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

let installed = false;
export function installLeagueHeader() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const slug = currentSlug;
    if (!slug || !needsLeagueHeader(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has(LEAGUE_HEADER)) headers.set(LEAGUE_HEADER, slug);
    return original(input, { ...init, headers });
  };
}
installLeagueHeader();
