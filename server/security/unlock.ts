// Unlock tokens and cookies.
//
// After a correct commissioner PIN or admin passcode, the server sets a signed session cookie (no expiry,
// so it ends when the browser closes). The token names who unlocked and carries a fingerprint of their
// stored hash, so changing or resetting that PIN or passcode ends every unlock made with the old one.
//
// UNLOCK_SECRET in .env signs the tokens. Without it, a random secret is used and unlocks end when the
// server restarts.
import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";

let warned = false;
let fallbackSecret: Buffer | null = null;
function signingSecret(): Buffer {
  const configured = process.env.UNLOCK_SECRET;
  if (configured && configured.length >= 32) return Buffer.from(configured, "utf8");
  if (!warned) {
    warned = true;
    console.warn("[Security] UNLOCK_SECRET is missing or shorter than 32 characters; unlocks will end when the server restarts.");
  }
  fallbackSecret ??= randomBytes(32);
  return fallbackSecret;
}

export type UnlockToken =
  | { v: 1; k: "commissioner"; leagueId: string; commissionerId: string; sleeperUserId: string; f: string }
  | { v: 1; k: "admin"; f: string };

function sign(body: string, secret: Buffer) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function encodeToken(token: UnlockToken, secret: Buffer = signingSecret()): string {
  const body = Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function decodeToken(value: string | undefined, secret: Buffer = signingSecret()): UnlockToken | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = Buffer.from(value.slice(dot + 1), "base64url");
  const expected = Buffer.from(sign(body, secret), "base64url");
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  try {
    const token = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (token?.v !== 1) return null;
    if (token.k === "admin" && typeof token.f === "string") return token;
    if (
      token.k === "commissioner" &&
      typeof token.leagueId === "string" &&
      typeof token.commissionerId === "string" &&
      typeof token.sleeperUserId === "string" &&
      typeof token.f === "string"
    ) return token;
    return null;
  } catch {
    return null;
  }
}

// ─── Cookies ───────────────────────────────────────────────────────────────────

export const ADMIN_COOKIE = "ul_admin";
export const DEVICE_COOKIE = "did";
export const commissionerCookie = (leagueId: string) => `ul_c_${leagueId.replace(/[^A-Za-z0-9-]/g, "")}`;

export function readCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

function isHttps(req: Request) {
  return req.secure || req.get("x-forwarded-proto") === "https";
}

/** Session cookie: no Max-Age, so it ends when the browser closes. */
export function setSessionCookie(req: Request, res: Response, name: string, value: string) {
  res.cookie(name, value, { httpOnly: true, sameSite: "strict", secure: isHttps(req), path: "/" });
}

export function clearCookie(req: Request, res: Response, name: string) {
  res.clearCookie(name, { httpOnly: true, sameSite: "strict", secure: isHttps(req), path: "/" });
}

/**
 * This device's key for counting wrong tries: a long-lived random cookie, hashed before it is stored.
 * Sets the cookie on the first request that needs it.
 */
export function deviceKey(req: Request, res: Response): string {
  let id = readCookies(req)[DEVICE_COOKIE];
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = randomBytes(18).toString("base64url");
    res.cookie(DEVICE_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(req),
      path: "/",
      maxAge: 400 * 24 * 60 * 60 * 1000,
    });
  }
  return createHash("sha256").update(id).digest("base64url");
}
