// Database access for the registry tables used by phase 2: pin_attempts, site_admin,
// league_commissioners, audit_log, and adding leagues with their season history.
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "../db";
import {
  auditLogTable,
  leagueCommissionersTable,
  leagueDeviceAccessTable,
  leagueSeasonHistoryTable,
  leaguesTable,
  pinAttemptsTable,
  siteAdminTable,
  type AuditLogEntry,
  type League,
  type LeagueCommissioner,
  type LeagueDeviceAccess,
  type LeagueSeasonHistory,
} from "../../shared/schema";
import type { AttemptKind, AttemptStore } from "./attempts";

// ─── Wrong tries ───────────────────────────────────────────────────────────────

export const dbAttemptStore: AttemptStore = {
  async get(kind, target, deviceKey) {
    const rows = await db
      .select()
      .from(pinAttemptsTable)
      .where(and(eq(pinAttemptsTable.kind, kind), eq(pinAttemptsTable.target, target), eq(pinAttemptsTable.deviceKey, deviceKey)))
      .limit(1);
    return rows[0] ?? null;
  },
  async save(row) {
    await db
      .insert(pinAttemptsTable)
      .values({ id: randomUUID(), ...row })
      .onConflictDoUpdate({
        target: [pinAttemptsTable.kind, pinAttemptsTable.target, pinAttemptsTable.deviceKey],
        set: { failures: row.failures, firstFailedAt: row.firstFailedAt, pausedUntil: row.pausedUntil },
      });
  },
  async remove(kind: AttemptKind, target, deviceKey) {
    await db
      .delete(pinAttemptsTable)
      .where(and(eq(pinAttemptsTable.kind, kind), eq(pinAttemptsTable.target, target), eq(pinAttemptsTable.deviceKey, deviceKey)));
  },
};

// ─── Site admin passcode ───────────────────────────────────────────────────────

export async function getAdminPasscodeHash(): Promise<string | null> {
  const rows = await db.select().from(siteAdminTable).where(eq(siteAdminTable.id, 1)).limit(1);
  return rows[0]?.passcodeHash ?? null;
}

export async function setAdminPasscodeHash(hash: string, now: number) {
  await db
    .insert(siteAdminTable)
    .values({ id: 1, passcodeHash: hash, setAt: now })
    .onConflictDoUpdate({ target: siteAdminTable.id, set: { passcodeHash: hash, setAt: now } });
}

// ─── Commissioners ─────────────────────────────────────────────────────────────

export async function listCommissioners(leagueId: string): Promise<LeagueCommissioner[]> {
  return db
    .select()
    .from(leagueCommissionersTable)
    .where(eq(leagueCommissionersTable.leagueId, leagueId))
    .orderBy(asc(leagueCommissionersTable.addedAt));
}

export async function getCommissioner(id: string): Promise<LeagueCommissioner | null> {
  const rows = await db.select().from(leagueCommissionersTable).where(eq(leagueCommissionersTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findCommissioner(leagueId: string, sleeperUserId: string): Promise<LeagueCommissioner | null> {
  const rows = await db
    .select()
    .from(leagueCommissionersTable)
    .where(and(eq(leagueCommissionersTable.leagueId, leagueId), eq(leagueCommissionersTable.sleeperUserId, sleeperUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setCommissionerPinHash(id: string, pinHash: string | null, at: number | null) {
  await db.update(leagueCommissionersTable).set({ pinHash, pinSetAt: at }).where(eq(leagueCommissionersTable.id, id));
}

/**
 * First-use PIN: sets the PIN only if the commissioner still has none (or an unused legacy setup code), so if two
 * people race to set it, the first one wins. Returns whether this call set it.
 */
export async function setCommissionerPinIfUnset(id: string, pinHash: string, at: number): Promise<boolean> {
  const rows = await db
    .update(leagueCommissionersTable)
    .set({ pinHash, pinSetAt: at })
    .where(and(eq(leagueCommissionersTable.id, id), or(isNull(leagueCommissionersTable.pinHash), like(leagueCommissionersTable.pinHash, "setup:%"))))
    .returning({ id: leagueCommissionersTable.id });
  return rows.length > 0;
}

export async function addCommissioner(row: Omit<LeagueCommissioner, "id">): Promise<LeagueCommissioner> {
  const created = { id: randomUUID(), ...row };
  await db.insert(leagueCommissionersTable).values(created);
  return created;
}

export async function removeCommissioner(id: string) {
  await db.delete(leagueCommissionersTable).where(eq(leagueCommissionersTable.id, id));
}

// ─── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditInput {
  leagueId: string | null;
  actorSleeperUserId: string | null;
  actorRole: "admin" | "commissioner" | "system";
  action: string;
  details?: Record<string, unknown> | null;
}

export async function writeAudit(entry: AuditInput, now = Date.now()) {
  try {
    await db.insert(auditLogTable).values({
      id: randomUUID(),
      leagueId: entry.leagueId,
      actorSleeperUserId: entry.actorSleeperUserId,
      actorRole: entry.actorRole,
      action: entry.action,
      details: entry.details ?? null,
      createdAt: now,
    });
  } catch (error) {
    // The action already happened; a failed log write must not undo or hide it.
    console.error("[Audit] Could not write audit entry:", entry.action, error);
  }
}

export async function listAudit(leagueId: string | null, limit = 200): Promise<AuditLogEntry[]> {
  const q = db.select().from(auditLogTable);
  const filtered = leagueId ? q.where(eq(auditLogTable.leagueId, leagueId)) : q;
  return filtered.orderBy(desc(auditLogTable.createdAt)).limit(Math.min(Math.max(limit, 1), 500));
}

// ─── Leagues ───────────────────────────────────────────────────────────────────

export interface LeagueWithSeasons {
  league: League;
  seasons: LeagueSeasonHistory[];
  commissioners: LeagueCommissioner[];
}

export async function listLeaguesWithSeasons(): Promise<LeagueWithSeasons[]> {
  const leagues = await db.select().from(leaguesTable).orderBy(asc(leaguesTable.createdAt));
  if (leagues.length === 0) return [];
  const ids = leagues.map((l) => l.id);
  const [seasons, commissioners] = await Promise.all([
    db.select().from(leagueSeasonHistoryTable).where(inArray(leagueSeasonHistoryTable.leagueId, ids)).orderBy(asc(leagueSeasonHistoryTable.season)),
    db.select().from(leagueCommissionersTable).where(inArray(leagueCommissionersTable.leagueId, ids)).orderBy(asc(leagueCommissionersTable.addedAt)),
  ]);
  return leagues.map((league) => ({
    league,
    seasons: seasons.filter((s) => s.leagueId === league.id),
    commissioners: commissioners.filter((c) => c.leagueId === league.id),
  }));
}

export async function getLeagueById(id: string): Promise<League | null> {
  const rows = await db.select().from(leaguesTable).where(eq(leaguesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Sleeper league IDs (from the list) that already belong to a league on the site. */
export async function registeredSleeperIds(sleeperIds: string[]): Promise<LeagueSeasonHistory[]> {
  if (sleeperIds.length === 0) return [];
  return db.select().from(leagueSeasonHistoryTable).where(inArray(leagueSeasonHistoryTable.sleeperLeagueId, sleeperIds));
}

export interface NewLeagueInput {
  name: string;
  slug: string;
  inviteCode: string | null;
  contractsEnabled: boolean;
  createdBy: string;
  /** Oldest first. The last one becomes the current season. */
  seasons: Array<{ season: string; sleeperLeagueId: string; previousSleeperLeagueId: string | null }>;
  owner: { sleeperUserId: string };
}

/** Adds a league, its season history and its owner in one transaction. */
export async function createLeague(input: NewLeagueInput, now = Date.now()) {
  return db.transaction(async (tx) => {
    const leagueId = randomUUID();
    await tx.insert(leaguesTable).values({
      id: leagueId,
      name: input.name,
      slug: input.slug,
      inviteCode: input.inviteCode,
      contractsEnabled: input.contractsEnabled ? 1 : 0,
      status: "active",
      createdBy: input.createdBy,
      createdAt: now,
    });
    await tx.insert(leagueSeasonHistoryTable).values(
      input.seasons.map((s, i) => ({
        id: randomUUID(),
        leagueId,
        season: s.season,
        sleeperLeagueId: s.sleeperLeagueId,
        previousSleeperLeagueId: s.previousSleeperLeagueId,
        status: i === input.seasons.length - 1 ? "current" : "past",
      })),
    );
    const ownerId = randomUUID();
    await tx.insert(leagueCommissionersTable).values({
      id: ownerId,
      leagueId,
      sleeperUserId: input.owner.sleeperUserId,
      role: "owner",
      pinHash: null, // the owner sets their own PIN at their first commissioner action
      pinSetAt: null,
      addedBy: input.createdBy,
      addedAt: now,
    });
    return { leagueId, ownerCommissionerId: ownerId };
  });
}

export async function updateLeague(
  id: string,
  patch: Partial<Pick<League, "name" | "slug" | "inviteCode" | "status" | "contractsEnabled" | "leaguePinHash" | "leaguePinSetAt">>,
) {
  await db.update(leaguesTable).set(patch).where(eq(leaguesTable.id, id));
}

// ─── Devices that joined a league ──────────────────────────────────────────────

/** The active league with this invite code (stored upper case) and its current season, or null. */
export async function findLeagueByInviteCode(code: string) {
  const rows = await db
    .select()
    .from(leaguesTable)
    .where(and(eq(leaguesTable.inviteCode, code.trim().toUpperCase()), eq(leaguesTable.status, "active")))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDevice(leagueId: string, tokenHash: string, now = Date.now()): Promise<LeagueDeviceAccess> {
  const row = { id: randomUUID(), leagueId, deviceTokenHash: tokenHash, rosterId: null, createdAt: now, lastUsedAt: now, revokedAt: null };
  await db.insert(leagueDeviceAccessTable).values(row);
  return row;
}

/** The device with this token hash for this league, if it hasn't been signed out. */
export async function findActiveDevice(leagueId: string, tokenHash: string): Promise<LeagueDeviceAccess | null> {
  const rows = await db
    .select()
    .from(leagueDeviceAccessTable)
    .where(and(
      eq(leagueDeviceAccessTable.deviceTokenHash, tokenHash),
      eq(leagueDeviceAccessTable.leagueId, leagueId),
      isNull(leagueDeviceAccessTable.revokedAt),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchDevice(id: string, now = Date.now()) {
  await db.update(leagueDeviceAccessTable).set({ lastUsedAt: now }).where(eq(leagueDeviceAccessTable.id, id));
}

export async function setDeviceRoster(id: string, rosterId: number | null) {
  await db.update(leagueDeviceAccessTable).set({ rosterId }).where(eq(leagueDeviceAccessTable.id, id));
}

/** Signs out every device in a league (a league PIN change or reset does this). Returns how many. */
export async function revokeAllDevices(leagueId: string, now = Date.now()): Promise<number> {
  const rows = await db
    .update(leagueDeviceAccessTable)
    .set({ revokedAt: now })
    .where(and(eq(leagueDeviceAccessTable.leagueId, leagueId), isNull(leagueDeviceAccessTable.revokedAt)))
    .returning({ id: leagueDeviceAccessTable.id });
  return rows.length;
}
