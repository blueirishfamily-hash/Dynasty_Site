// Commissioner PIN and admin passcode prompts.
//
// When an /api/ call comes back 401 with code "commissioner_unlock_required" or "admin_unlock_required",
// the fetch wrapper below opens the PIN prompt (UnlockDialog), waits for it, and retries the call once
// after a successful unlock. Pages don't need to know about PINs at all.
//
// Members never see the commissioner prompt: it only opens when the signed-in user is one of this league's
// commissioners (UnlockDialog tells this module who that is). Otherwise the 401 goes back to the page.
import "./league-address"; // install the X-League wrapper first, so retries go through it too
import { queryClient } from "./queryClient";

export type UnlockLeague = { id: string; slug: string; name: string };
export type UnlockRequest = { kind: "commissioner"; league: UnlockLeague } | { kind: "admin" };

type Pending = { request: UnlockRequest; promise: Promise<boolean>; resolve: (ok: boolean) => void };

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The commissioner who may be prompted in the open league (set by UnlockDialog), or null. */
let promptableCommissioner: string | null = null;
export function setPromptableCommissioner(sleeperUserId: string | null) {
  promptableCommissioner = sleeperUserId;
}

export function subscribeUnlock(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentUnlockRequest(): UnlockRequest | null {
  return pending?.request ?? null;
}

/** Opens the prompt (or joins the one already open for the same thing). Resolves true once unlocked. */
export function requestUnlock(request: UnlockRequest): Promise<boolean> {
  if (pending) {
    const same =
      pending.request.kind === request.kind &&
      (request.kind === "admin" || (pending.request.kind === "commissioner" && pending.request.league.id === request.league.id));
    if (same) return pending.promise;
    return pending.promise.then(() => requestUnlock(request));
  }
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  pending = { request, promise, resolve };
  notify();
  return promise;
}

/** Called by the prompt when it closes. */
export function finishUnlock(ok: boolean) {
  const done = pending;
  pending = null;
  notify();
  if (ok) {
    queryClient.invalidateQueries({ queryKey: ["/api/registry/leagues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin"] });
  }
  done?.resolve(ok);
}

function apiPath(input: RequestInfo | URL): string | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/") ? u.pathname : null;
  } catch {
    return null;
  }
}

// The unlock endpoints answer 401 for a wrong PIN; those go straight back to the prompt.
const isUnlockEndpoint = (path: string) =>
  /\/commissioner\/(unlock|set-pin|pin|lock)$/.test(path) || /^\/api\/admin\/(unlock|passcode|passcode\/recover|lock|status)$/.test(path);

async function unlockRequestFor(res: Response): Promise<UnlockRequest | null> {
  if (res.status !== 401) return null;
  let body: any;
  try {
    body = await res.clone().json();
  } catch {
    return null;
  }
  if (body?.code === "admin_unlock_required") return { kind: "admin" };
  if (body?.code === "commissioner_unlock_required" && body.league?.id && promptableCommissioner) {
    return { kind: "commissioner", league: body.league };
  }
  return null;
}

let installed = false;
export function installUnlockRetry() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = apiPath(input);
    if (!path || isUnlockEndpoint(path)) return original(input, init);
    // A Request's body can only be read once, so keep a copy for the retry.
    const retryInput = input instanceof Request ? input.clone() : input;
    const res = await original(input, init);
    const request = await unlockRequestFor(res);
    if (!request) return res;
    const ok = await requestUnlock(request);
    return ok ? original(retryInput, init) : res;
  };
}
installUnlockRetry();
