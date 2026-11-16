// Which devices have joined which leagues (multi-league plan, "First visit flow" and "Remembered device").
//
// Joining with an invite code (and the league PIN, if one is set) gives the device a random token for that
// league. The token is kept in a long-lived cookie named ld_<league id>; only its hash is stored. A device
// holds one token per league it joined. A league PIN change or reset signs out every device in that league.
//
// Grace period: when a league first gets an invite code, devices that were already using it keep working for
// a while without joining (the commissioner sets how long). A write from an un-joined device during that time
// joins it quietly, so it is remembered when the grace period ends.
import { createHash, randomBytes } from "crypto";
import type { Request, Response } from "express";
import type { LeagueDeviceAccess } from "../../shared/schema";
import { readCookies } from "./unlock";

export const DEVICE_COOKIE_PREFIX = "ld_";
export const GRACE_SETTING_KEY = "join_grace_until";
export const DEFAULT_GRACE_DAYS = 30;
export const MAX_GRACE_DAYS = 90;
const TOUCH_EVERY_MS = 10 * 60 * 1000;
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export const deviceCookieName = (leagueId: string) => `${DEVICE_COOKIE_PREFIX}${leagueId.replace(/[^A-Za-z0-9-]/g, "")}`;
export const newDeviceToken = () => randomBytes(32).toString("base64url");
export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("base64url");

export interface MembershipDeps {
  findDevice(leagueId: string, tokenHash: string): Promise<LeagueDeviceAccess | null>;
  touchDevice(id: string, now: number): Promise<void>;
  createDevice(leagueId: string, tokenHash: string, now: number): Promise<LeagueDeviceAccess>;
  graceUntil(leagueId: string): Promise<number | null>;
}

/** The device behind this request for this league, or null when it hasn't joined (or was signed out). */
export async function deviceFor(req: Request, leagueId: string, deps: MembershipDeps, now = Date.now()): Promise<LeagueDeviceAccess | null> {
  const token = readCookies(req)[deviceCookieName(leagueId)];
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const device = await deps.findDevice(leagueId, hashDeviceToken(token));
  if (!device) return null;
  if (now - device.lastUsedAt > TOUCH_EVERY_MS) deps.touchDevice(device.id, now).catch(() => {});
  return device;
}

export function setDeviceCookie(req: Request, res: Response, leagueId: string, token: string) {
  res.cookie(deviceCookieName(leagueId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure || req.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_MS,
  });
}

/** Joins this device to the league and sets its cookie. */
export async function enrollDevice(req: Request, res: Response, leagueId: string, deps: MembershipDeps, now = Date.now()) {
  const token = newDeviceToken();
  const device = await deps.createDevice(leagueId, hashDeviceToken(token), now);
  setDeviceCookie(req, res, leagueId, token);
  return device;
}

/** League IDs this browser holds a device cookie for (not yet checked against the database). */
export function joinedLeagueIdCandidates(req: Request): string[] {
  return Object.keys(readCookies(req))
    .filter((k) => k.startsWith(DEVICE_COOKIE_PREFIX))
    .map((k) => k.slice(DEVICE_COOKIE_PREFIX.length));
}

export const isGraceActive = (graceUntil: number | null, now = Date.now()) => graceUntil != null && graceUntil > now;

/** Grace end time for a new grace period of this many days (0 ends it). */
export function graceEndFor(days: number, now = Date.now()): number | null {
  const d = Math.min(Math.max(Math.floor(days), 0), MAX_GRACE_DAYS);
  return d === 0 ? null : now + d * 24 * 60 * 60 * 1000;
}
