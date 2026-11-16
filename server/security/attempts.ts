// Wrong-try limits for PINs, setup codes, the admin passcode and (phase 4) invite codes.
//
// Per device: 5 wrong tries pause that secret on that device for 15 minutes (the plan's rule).
// Across all devices: 20 wrong tries within 15 minutes pause that secret for everyone for 15 minutes,
// so clearing cookies to get a new device does not allow unlimited guessing.
import type { PinAttempt } from "../../shared/schema";

export type AttemptKind = "league_pin" | "commissioner_pin" | "admin_passcode" | "invite_code";

export const DEVICE_LIMIT = 5;
export const GLOBAL_LIMIT = 20;
export const WINDOW_MS = 15 * 60 * 1000;
export const PAUSE_MS = 15 * 60 * 1000;
/** device_key of the row that counts wrong tries from every device. */
export const ALL_DEVICES = "*";

export interface AttemptStore {
  get(kind: AttemptKind, target: string, deviceKey: string): Promise<PinAttempt | null>;
  /** Insert or replace the row for (kind, target, deviceKey). */
  save(row: Omit<PinAttempt, "id">): Promise<void>;
  remove(kind: AttemptKind, target: string, deviceKey: string): Promise<void>;
}

export function createAttemptLimiter(store: AttemptStore, now: () => number = Date.now) {
  /** When the secret is paused for this device, the time the pause ends; otherwise null. */
  async function pausedUntil(kind: AttemptKind, target: string, deviceKey: string): Promise<number | null> {
    const [mine, all] = await Promise.all([store.get(kind, target, deviceKey), store.get(kind, target, ALL_DEVICES)]);
    const t = now();
    const until = Math.max(mine?.pausedUntil ?? 0, all?.pausedUntil ?? 0);
    return until > t ? until : null;
  }

  async function bump(kind: AttemptKind, target: string, key: string, limit: number) {
    const t = now();
    const row = await store.get(kind, target, key);
    const fresh = !row || t - row.firstFailedAt > WINDOW_MS || (row.pausedUntil != null && row.pausedUntil <= t);
    const failures = (fresh ? 0 : row!.failures) + 1;
    if (failures >= limit) {
      await store.save({ kind, target, deviceKey: key, failures: 0, firstFailedAt: t, pausedUntil: t + PAUSE_MS });
      return { pausedUntil: t + PAUSE_MS, triesLeft: 0 };
    }
    await store.save({ kind, target, deviceKey: key, failures, firstFailedAt: fresh ? t : row!.firstFailedAt, pausedUntil: null });
    return { pausedUntil: null, triesLeft: limit - failures };
  }

  /**
   * Counts a wrong try. pausedUntil is when the resulting pause ends, if this try caused one;
   * triesLeft is how many more wrong tries this device has before its pause.
   */
  async function recordFailure(kind: AttemptKind, target: string, deviceKey: string): Promise<{ pausedUntil: number | null; triesLeft: number }> {
    const [mine, all] = await Promise.all([
      bump(kind, target, deviceKey, DEVICE_LIMIT),
      bump(kind, target, ALL_DEVICES, GLOBAL_LIMIT),
    ]);
    return { pausedUntil: mine.pausedUntil ?? all.pausedUntil, triesLeft: Math.min(mine.triesLeft, all.triesLeft) };
  }

  /** A correct try clears this device's count (not the all-devices count). */
  async function recordSuccess(kind: AttemptKind, target: string, deviceKey: string) {
    await store.remove(kind, target, deviceKey);
  }

  return { pausedUntil, recordFailure, recordSuccess };
}

export type AttemptLimiter = ReturnType<typeof createAttemptLimiter>;
