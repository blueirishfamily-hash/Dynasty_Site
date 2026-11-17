// Slow hashing for PINs and the admin passcode (scrypt, Node's built-in crypto).
// Only hashes are stored. A stored value looks like  scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>.
//
// league_commissioners.pin_hash holds the commissioner's PIN hash, or nothing until they set their own PIN at
// their first commissioner action. pin_set_at is when it was set.
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

const N = 1 << 15; // ~100 ms per check: slow enough to resist guessing a leaked 4-digit PIN offline
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (!n || !r || !p || expected.length === 0) return false;
  const key = await scrypt(secret, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
  return timingSafeEqual(key, expected);
}

/** Compares two strings without leaking where they differ (for the recovery key). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// ─── Commissioner PIN slot ─────────────────────────────────────────────────────

/** Rows from before first-use PIN setting may hold an unused one-time setup code. It counts as no PIN. */
const LEGACY_SETUP_PREFIX = "setup:";

export type PinSlot = { state: "none" } | { state: "set"; hash: string };

export function readPinSlot(pinHash: string | null | undefined, _pinSetAt?: number | null): PinSlot {
  if (!pinHash || pinHash.startsWith(LEGACY_SETUP_PREFIX)) return { state: "none" };
  return { state: "set", hash: pinHash };
}

// ─── Format rules ──────────────────────────────────────────────────────────────

/** Commissioner and league PINs: 4 to 8 digits. */
export function isValidPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,8}$/.test(pin);
}

/** Admin passcode: at least 10 characters. */
export function isValidAdminPasscode(passcode: unknown): passcode is string {
  return typeof passcode === "string" && passcode.length >= 10 && passcode.length <= 200;
}

/** A short fingerprint of a stored hash. Unlock tokens carry it, so changing or resetting a secret ends them. */
export function fingerprint(stored: string): string {
  return createHash("sha256").update(stored).digest("base64url").slice(0, 16);
}
