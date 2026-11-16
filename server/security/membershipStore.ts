// Database-backed dependencies for security/membership.ts, plus the grace-period setting.
import { storage } from "../storage";
import type { MembershipDeps } from "./membership";
import { GRACE_SETTING_KEY } from "./membership";
import { createDevice, findActiveDevice, touchDevice } from "./store";

const graceCache = new Map<string, { at: number; value: number | null }>();
const GRACE_CACHE_MS = 30_000;

/**
 * The grace period is kept in league_settings under the registry league's own ID (not a season's Sleeper ID),
 * so it carries across seasons.
 */
export async function readGraceUntil(leagueId: string): Promise<number | null> {
  const hit = graceCache.get(leagueId);
  if (hit && Date.now() - hit.at < GRACE_CACHE_MS) return hit.value;
  const raw = await storage.getLeagueSetting(leagueId, GRACE_SETTING_KEY);
  const n = raw ? Number(raw) : NaN;
  const value = Number.isFinite(n) && n > 0 ? n : null;
  graceCache.set(leagueId, { at: Date.now(), value });
  return value;
}

export async function writeGraceUntil(leagueId: string, until: number | null) {
  await storage.setLeagueSetting(leagueId, GRACE_SETTING_KEY, until == null ? "" : String(until));
  graceCache.delete(leagueId);
}

export const dbMembershipDeps: MembershipDeps = {
  findDevice: findActiveDevice,
  touchDevice: (id, now) => touchDevice(id, now),
  createDevice: (leagueId, hash, now) => createDevice(leagueId, hash, now),
  graceUntil: readGraceUntil,
};
