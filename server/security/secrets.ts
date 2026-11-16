// Slow hashing for PINs, setup codes and the admin passcode (scrypt, Node's built-in crypto).
// Only hashes are stored. A stored value looks like  scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>.
//
// league_commissioners.pin_hash holds either a PIN hash or, while the commissioner still has to set a PIN,
// the hash of a one-time setup code prefixed with "setup:". pin_set_at is when the PIN was set or the
// setup code was issued.
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, createHash, type ScryptOptions } from "crypto";

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

export const SETUP_PREFIX = "setup:";
/** A setup code works for 7 days after it is issued. */
export const SETUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PinSlot =
  | { state: "none" }
  | { state: "set"; hash: string }
  | { state: "setup_pending"; hash: string; issuedAt: number | null };

export function readPinSlot(pinHash: string | null | undefined, pinSetAt: number | null | undefined): PinSlot {
  if (!pinHash) return { state: "none" };
  if (pinHash.startsWith(SETUP_PREFIX)) return { state: "setup_pending", hash: pinHash.slice(SETUP_PREFIX.length), issuedAt: pinSetAt ?? null };
  return { state: "set", hash: pinHash };
}

export function setupCodeExpired(slot: PinSlot, now: number): boolean {
  return slot.state === "setup_pending" && (slot.issuedAt == null || now - slot.issuedAt > SETUP_CODE_TTL_MS);
}

// Setup codes avoid look-alike characters (0/O, 1/I/L) so they can be read out loud or typed from a text.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A one-time setup code like "K7MQ-2XRP-9TWD" (60 bits). */
export function generateSetupCode(): string {
  const chars = Array.from({ length: 12 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

/** Codes are compared without dashes, spaces or case, so "k7mq 2xrp 9twd" works too. */
export function normalizeSetupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
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
