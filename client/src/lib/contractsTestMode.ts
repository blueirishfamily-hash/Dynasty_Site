import { useSyncExternalStore } from "react";
import { queryClient } from "@/lib/queryClient";

/**
 * Contracts test mode (client side).
 * While on, every request to /api carries the x-contracts-test header. The server then runs that request
 * against an in-memory copy of the contract data, so nothing done here can reach the real database.
 */
const HEADER = "x-contracts-test";
const STORAGE_KEY = "contracts-test-mode";

interface TestModeState {
  on: boolean;
  sessionId: string | null;
}

function read(): TestModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.on && typeof parsed.sessionId === "string") return { on: true, sessionId: parsed.sessionId };
    }
  } catch {
    // storage unavailable: test mode stays off
  }
  return { on: false, sessionId: null };
}

let state: TestModeState = read();
const listeners = new Set<() => void>();

function commit(next: TestModeState) {
  state = next;
  try {
    if (next.on) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  listeners.forEach(l => l());
}

function newSessionId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return "t" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

let installed = false;
function installFetchWrapper() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!state.on || !state.sessionId) return original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let path = url;
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return original(input, init);
      path = u.pathname;
    } catch {
      // relative url: use as given
    }
    if (!path.startsWith("/api/")) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(HEADER, state.sessionId);
    return original(input, { ...init, headers });
  };
}
installFetchWrapper();

export function isTestModeOn() {
  return state.on;
}

export function setTestMode(on: boolean) {
  if (on === state.on) return;
  if (on) {
    commit({ on: true, sessionId: newSessionId() });
  } else {
    const id = state.sessionId;
    commit({ on: false, sessionId: null });
    if (id) {
      // Free the server-side copy; failure here is harmless because sessions also expire on their own.
      fetch("/api/contracts-test/session", { method: "DELETE", headers: { [HEADER]: id } }).catch(() => {});
    }
  }
  queryClient.invalidateQueries();
}

/** Throw away everything done in this test session and start again from the real data. */
export async function resetTestMode() {
  if (!state.on || !state.sessionId) return;
  const old = state.sessionId;
  commit({ on: true, sessionId: newSessionId() });
  fetch("/api/contracts-test/session", { method: "DELETE", headers: { [HEADER]: old } }).catch(() => {});
  await queryClient.invalidateQueries();
}

export function useContractsTestMode(): boolean {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state.on,
    () => false,
  );
}
