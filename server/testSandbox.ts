/**
 * Contracts test mode.
 *
 * A request that carries the `x-contracts-test` header runs inside a sandbox session. While a request is
 * inside a session, `storage` calls never reach the database for anything that changes data:
 *   - the tables the contract process uses (contracts, extensions, bids, RFA, trades, dead cap, league
 *     settings, transaction log) are copied into memory the first time they are read and then read and
 *     written there only;
 *   - read-only storage methods pass straight through to the real database;
 *   - every other method is skipped (nothing is written).
 * Requests without the header are untouched: the proxy hands back the real method exactly as before.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";

export const SANDBOX_HEADER = "x-contracts-test";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_SESSIONS = 25;

type Row = Record<string, any>;

/** In-memory copy of the contract tables for one league. */
class LeagueSandbox {
  contracts: Map<string, Row> | null = null; // key: rosterId:playerId
  deadCap: Map<string, Row> | null = null;
  bids: Map<string, Row> | null = null;
  extensions = new Map<string, Row>();
  extensionSeasonsLoaded = new Set<number>();
  extensionsDeleted = new Set<string>();
  rfaDesignations = new Map<string, Row>();
  rfaDesignationSeasonsLoaded = new Set<number>();
  rfaOffers = new Map<string, Row>();
  rfaOfferSeasonsLoaded = new Set<number>();
  settings = new Map<string, string>();
  trades: Row[] = [];
  transactions: Row[] = [];
}

interface SandboxSession {
  id: string;
  touchedAt: number;
  leagues: Map<string, LeagueSandbox>;
}

const sessions = new Map<string, SandboxSession>();
const sandboxContext = new AsyncLocalStorage<SandboxSession>();

function getSession(id: string): SandboxSession {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (now - s.touchedAt > SESSION_TTL_MS) sessions.delete(key);
  }
  let session = sessions.get(id);
  if (!session) {
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = [...sessions.values()].sort((a, b) => a.touchedAt - b.touchedAt)[0];
      if (oldest) sessions.delete(oldest.id);
    }
    session = { id, touchedAt: now, leagues: new Map() };
    sessions.set(id, session);
  }
  session.touchedAt = now;
  return session;
}

function league(session: SandboxSession, leagueId: string): LeagueSandbox {
  let l = session.leagues.get(leagueId);
  if (!l) {
    l = new LeagueSandbox();
    session.leagues.set(leagueId, l);
  }
  return l;
}

/**
 * Reads from the real database for tables the contract hub added (bids, RFA, settings). If the real database
 * has not been updated with those tables yet, test mode starts them empty instead of failing.
 */
async function readOrEmpty<T>(label: string, read: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await read();
  } catch (e) {
    console.warn(`[test-mode] could not read ${label} from the database (table or columns missing?); starting empty`);
    return empty;
  }
}

const byNewest = (a: Row, b: Row) => (b.createdAt ?? 0) - (a.createdAt ?? 0);
const contractKey = (rosterId: number, playerId: string) => `${rosterId}:${playerId}`;

async function loadContracts(l: LeagueSandbox, real: any, leagueId: string) {
  if (l.contracts) return l.contracts;
  const rows: Row[] = await real.getPlayerContracts(leagueId);
  l.contracts = new Map(rows.map(r => [contractKey(r.rosterId, r.playerId), { ...r }]));
  return l.contracts;
}

async function loadDeadCap(l: LeagueSandbox, real: any, leagueId: string) {
  if (l.deadCap) return l.deadCap;
  const rows: Row[] = await real.getDeadCapEntriesByLeague(leagueId);
  l.deadCap = new Map(rows.map(r => [r.id, { ...r }]));
  return l.deadCap;
}

async function loadBids(l: LeagueSandbox, real: any, leagueId: string) {
  if (l.bids) return l.bids;
  const rows: Row[] = await readOrEmpty("bids", () => real.getAllPlayerBids(leagueId), []);
  l.bids = new Map(rows.map(r => [r.id, { ...r }]));
  return l.bids;
}

async function loadExtensions(l: LeagueSandbox, real: any, leagueId: string, season: number) {
  if (!l.extensionSeasonsLoaded.has(season)) {
    const rows: Row[] = await real.getTeamExtensions(leagueId, season);
    for (const r of rows) {
      if (!l.extensionsDeleted.has(r.id) && !l.extensions.has(r.id)) l.extensions.set(r.id, { ...r });
    }
    l.extensionSeasonsLoaded.add(season);
  }
}

async function loadRfaDesignations(l: LeagueSandbox, real: any, leagueId: string, season: number) {
  if (!l.rfaDesignationSeasonsLoaded.has(season)) {
    const rows: Row[] = await readOrEmpty("RFA designations", () => real.getRfaDesignations(leagueId, season), []);
    for (const r of rows) if (!l.rfaDesignations.has(r.id)) l.rfaDesignations.set(r.id, { ...r });
    l.rfaDesignationSeasonsLoaded.add(season);
  }
}

async function loadRfaOffers(l: LeagueSandbox, real: any, leagueId: string, season: number) {
  if (!l.rfaOfferSeasonsLoaded.has(season)) {
    const rows: Row[] = await readOrEmpty("RFA offers", () => real.getRfaOffers(leagueId, season), []);
    for (const r of rows) if (!l.rfaOffers.has(r.id)) l.rfaOffers.set(r.id, { ...r });
    l.rfaOfferSeasonsLoaded.add(season);
  }
}

type Handler = (session: SandboxSession, real: any, ...args: any[]) => Promise<any>;

/** Sandboxed versions of the storage methods the contract process calls. Behaviour mirrors DatabaseStorage. */
const HANDLERS: Record<string, Handler> = {
  // ── Player contracts ──
  async getPlayerContracts(s, real, leagueId: string) {
    const l = league(s, leagueId);
    return [...(await loadContracts(l, real, leagueId)).values()];
  },

  async upsertPlayerContract(s, real, data: Row) {
    const l = league(s, data.leagueId);
    const contracts = await loadContracts(l, real, data.leagueId);
    const key = contractKey(data.rosterId, data.playerId);
    const existing = contracts.get(key);
    const now = Date.now();

    if (existing) {
      const updated: Row = {
        ...existing,
        salaries: data.salaries ?? existing.salaries,
        fifthYearOption: data.fifthYearOption !== undefined ? data.fifthYearOption : existing.fifthYearOption,
        isOnIr: data.isOnIr ?? existing.isOnIr,
        franchiseTagUsed: data.franchiseTagUsed ?? existing.franchiseTagUsed,
        franchiseTagYear: data.franchiseTagYear ?? existing.franchiseTagYear,
        originalContractYears:
          data.originalContractYears !== undefined ? data.originalContractYears : existing.originalContractYears,
        isRookieContract: data.isRookieContract ?? existing.isRookieContract,
        extensionApplied: data.extensionApplied ?? existing.extensionApplied,
        extensionYear: data.extensionYear ?? existing.extensionYear,
        extensionSalary: data.extensionSalary ?? existing.extensionSalary,
        extensionType: data.extensionType ?? existing.extensionType,
        updatedAt: now,
      };
      if (data.hasBeenExtended !== undefined) {
        updated.hasBeenExtended = data.hasBeenExtended ?? existing.hasBeenExtended ?? 0;
      }
      if (data.hasBeenFranchiseTagged !== undefined) {
        updated.hasBeenFranchiseTagged = data.hasBeenFranchiseTagged ?? existing.hasBeenFranchiseTagged ?? 0;
      }
      contracts.set(key, updated);
      return updated;
    }

    const inserted: Row = {
      id: randomUUID(),
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      salaries: data.salaries ?? "{}",
      fifthYearOption: data.fifthYearOption ?? null,
      isOnIr: data.isOnIr ?? 0,
      franchiseTagUsed: data.franchiseTagUsed ?? 0,
      franchiseTagYear: data.franchiseTagYear ?? null,
      originalContractYears: data.originalContractYears !== undefined ? data.originalContractYears : 1,
      isRookieContract: data.isRookieContract ?? 0,
      extensionApplied: data.extensionApplied ?? 0,
      extensionYear: data.extensionYear ?? null,
      extensionSalary: data.extensionSalary ?? null,
      extensionType: data.extensionType ?? null,
      hasBeenExtended: data.hasBeenExtended ?? 0,
      hasBeenFranchiseTagged: data.hasBeenFranchiseTagged ?? 0,
      updatedAt: now,
    };
    contracts.set(key, inserted);
    return inserted;
  },

  async deletePlayerContract(s, real, leagueId: string, rosterId: number, playerId: string) {
    const contracts = await loadContracts(league(s, leagueId), real, leagueId);
    contracts.delete(contractKey(rosterId, playerId));
  },

  // ── Team extensions ──
  async getTeamExtensions(s, real, leagueId: string, season: number) {
    const l = league(s, leagueId);
    await loadExtensions(l, real, leagueId, season);
    return [...l.extensions.values()].filter(e => e.season === season).sort(byNewest);
  },

  async getTeamExtensionByRoster(s, real, leagueId: string, rosterId: number, season: number, extensionType?: number) {
    const l = league(s, leagueId);
    await loadExtensions(l, real, leagueId, season);
    return [...l.extensions.values()].find(
      e =>
        e.season === season &&
        e.rosterId === rosterId &&
        (extensionType === undefined || e.extensionType === extensionType),
    );
  },

  async getTeamExtensionById(s, real, extensionId: string) {
    for (const l of s.leagues.values()) {
      const found = l.extensions.get(extensionId);
      if (found) return found;
      if (l.extensionsDeleted.has(extensionId)) return undefined;
    }
    const row: Row | undefined = await real.getTeamExtensionById(extensionId);
    if (!row) return undefined;
    const l = league(s, row.leagueId);
    if (l.extensionsDeleted.has(row.id)) return undefined;
    const copy = { ...row };
    l.extensions.set(row.id, copy);
    return copy;
  },

  async createTeamExtension(s, _real, data: Row) {
    const l = league(s, data.leagueId);
    const row: Row = {
      id: randomUUID(),
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      season: data.season,
      playerId: data.playerId,
      playerName: data.playerName,
      extensionSalary: data.extensionSalary,
      extensionYear: data.extensionYear,
      extensionType: data.extensionType || 1,
      extensionSalary2: data.extensionSalary2 || null,
      isRookieExtension: data.isRookieExtension || 0,
      status: "pending",
      createdAt: Date.now(),
    };
    l.extensions.set(row.id, row);
    return row;
  },

  async updateTeamExtensionStatus(s, real, extensionId: string, status: string) {
    const row: Row | undefined = await HANDLERS.getTeamExtensionById(s, real, extensionId);
    if (!row) return undefined;
    row.status = status;
    return row;
  },

  async deleteTeamExtensionById(s, real, extensionId: string) {
    const row: Row | undefined = await HANDLERS.getTeamExtensionById(s, real, extensionId);
    if (!row) return;
    const l = league(s, row.leagueId);
    l.extensions.delete(extensionId);
    l.extensionsDeleted.add(extensionId);
  },

  async deleteTeamExtension(s, real, leagueId: string, rosterId: number, season: number) {
    const l = league(s, leagueId);
    await loadExtensions(l, real, leagueId, season);
    for (const [id, e] of [...l.extensions]) {
      if (e.season === season && e.rosterId === rosterId) {
        l.extensions.delete(id);
        l.extensionsDeleted.add(id);
      }
    }
  },

  // ── Dead cap ──
  async getDeadCapEntriesByLeague(s, real, leagueId: string) {
    return [...(await loadDeadCap(league(s, leagueId), real, leagueId)).values()].sort(byNewest);
  },

  async createDeadCapEntry(s, real, data: Row) {
    const dead = await loadDeadCap(league(s, data.leagueId), real, data.leagueId);
    const row: Row = {
      id: randomUUID(),
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      reason: data.reason,
      deadCapSalaries: data.deadCapSalaries ?? "{}",
      createdAt: Date.now(),
    };
    dead.set(row.id, row);
    return row;
  },

  async deleteDeadCapEntry(s, real, id: string) {
    for (const [leagueId, l] of s.leagues) {
      const dead = await loadDeadCap(l, real, leagueId);
      if (dead.delete(id)) return;
    }
  },

  // ── League settings (phase config, round confirmations) ──
  async getLeagueSetting(s, real, leagueId: string, settingKey: string) {
    const l = league(s, leagueId);
    if (l.settings.has(settingKey)) return l.settings.get(settingKey);
    return readOrEmpty("league settings", () => real.getLeagueSetting(leagueId, settingKey), undefined);
  },

  async setLeagueSetting(s, _real, leagueId: string, settingKey: string, settingValue: string) {
    league(s, leagueId).settings.set(settingKey, settingValue);
    return { id: randomUUID(), leagueId, settingKey, settingValue, updatedAt: Date.now() };
  },

  // ── Bids ──
  async getAllPlayerBids(s, real, leagueId: string) {
    return [...(await loadBids(league(s, leagueId), real, leagueId)).values()].sort(byNewest);
  },

  async getPlayerBidsByRoster(s, real, leagueId: string, rosterId: number) {
    const bids = await loadBids(league(s, leagueId), real, leagueId);
    return [...bids.values()].filter(b => b.rosterId === rosterId).sort(byNewest);
  },

  async getBidsByLeagueRound(s, real, leagueId: string, round: number, season: number) {
    const bids = await loadBids(league(s, leagueId), real, leagueId);
    return [...bids.values()].filter(b => b.round === round && b.season === season).sort(byNewest);
  },

  async getBidsWithResult(s, real, leagueId: string, rosterId: number, result: string) {
    const bids = await loadBids(league(s, leagueId), real, leagueId);
    return [...bids.values()].filter(b => b.rosterId === rosterId && b.result === result);
  },

  async createPlayerBid(s, real, data: Row) {
    const bids = await loadBids(league(s, data.leagueId), real, data.leagueId);
    const now = Date.now();
    const row: Row = {
      id: randomUUID(),
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      playerTeam: data.playerTeam ?? null,
      bidAmount: data.bidAmount,
      maxBid: data.maxBid ?? null,
      contractYears: data.contractYears ?? 1,
      isRookieContract: data.isRookieContract ?? 0,
      notes: data.notes ?? null,
      round: data.round ?? null,
      season: data.season ?? null,
      isRfa: data.isRfa ?? 0,
      originalRosterId: data.originalRosterId ?? null,
      result: data.result ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    bids.set(row.id, row);
    return row;
  },

  async updatePlayerBid(s, real, id: string, rosterId: number, updates: Row) {
    for (const [leagueId, l] of s.leagues) {
      const bids = await loadBids(l, real, leagueId);
      const existing = bids.get(id);
      if (existing && existing.rosterId === rosterId) {
        const updated = { ...existing, ...updates, updatedAt: Date.now() };
        bids.set(id, updated);
        return updated;
      }
    }
    return undefined;
  },

  async deletePlayerBid(s, real, id: string, rosterId: number) {
    for (const [leagueId, l] of s.leagues) {
      const bids = await loadBids(l, real, leagueId);
      const existing = bids.get(id);
      if (existing && existing.rosterId === rosterId) {
        bids.delete(id);
        return;
      }
    }
  },

  // ── RFA ──
  async getRfaDesignations(s, real, leagueId: string, season: number) {
    const l = league(s, leagueId);
    await loadRfaDesignations(l, real, leagueId, season);
    return [...l.rfaDesignations.values()].filter(d => d.season === season);
  },

  async getRfaDesignationByRoster(s, real, leagueId: string, season: number, rosterId: number) {
    const rows: Row[] = await HANDLERS.getRfaDesignations(s, real, leagueId, season);
    return rows.find(d => d.rosterId === rosterId);
  },

  async createRfaDesignation(s, real, data: Row) {
    const l = league(s, data.leagueId);
    await loadRfaDesignations(l, real, data.leagueId, data.season);
    const row: Row = { ...data, id: randomUUID(), createdAt: Date.now() };
    l.rfaDesignations.set(row.id, row);
    return row;
  },

  async getRfaOffers(s, real, leagueId: string, season: number, window?: number) {
    const l = league(s, leagueId);
    await loadRfaOffers(l, real, leagueId, season);
    return [...l.rfaOffers.values()].filter(o => o.season === season && (window == null || o.window === window));
  },

  async getRfaOffersForOriginalRoster(s, real, leagueId: string, season: number, originalRosterId: number) {
    const rows: Row[] = await HANDLERS.getRfaOffers(s, real, leagueId, season);
    return rows.filter(o => o.originalRosterId === originalRosterId);
  },

  async getRfaOffersForBiddingRoster(s, real, leagueId: string, season: number, biddingRosterId: number) {
    const rows: Row[] = await HANDLERS.getRfaOffers(s, real, leagueId, season);
    return rows.filter(o => o.biddingRosterId === biddingRosterId);
  },

  async createRfaOffer(s, real, data: Row) {
    const l = league(s, data.leagueId);
    await loadRfaOffers(l, real, data.leagueId, data.season);
    const now = Date.now();
    const row: Row = { ...data, id: randomUUID(), status: "pending", createdAt: now, updatedAt: now };
    l.rfaOffers.set(row.id, row);
    return row;
  },

  async updateRfaOfferStatus(s, _real, id: string, status: string) {
    for (const l of s.leagues.values()) {
      const existing = l.rfaOffers.get(id);
      if (existing) {
        const updated = { ...existing, status, updatedAt: Date.now() };
        l.rfaOffers.set(id, updated);
        return updated;
      }
    }
    return undefined;
  },

  // ── Trades and transaction log ──
  async createTradeOffer(s, _real, data: Row) {
    const row: Row = { ...data, id: randomUUID(), status: "pending", createdAt: Date.now() };
    league(s, data.leagueId).trades.push(row);
    return row;
  },

  async getTradeOffers(s, _real, leagueId: string, season: number) {
    return league(s, leagueId)
      .trades.filter(t => t.season === season)
      .sort(byNewest);
  },

  async logContractTransaction(s, _real, data: Row) {
    const row: Row = { ...data, id: randomUUID(), createdAt: Date.now() };
    league(s, data.leagueId).transactions.push(row);
    return row;
  },

  async getContractTransactions(s, _real, leagueId: string, limit = 100) {
    return [...league(s, leagueId).transactions].sort(byNewest).slice(0, limit);
  },
};

// Methods that only read. Anything that looks like it could change data is excluded even if it starts with "get".
const READ_NAME = /^(get|find|list|is|has|count)[A-Z]/;
const READ_ALLOW = new Set(["getSavedContractDrafts"]);
const WRITE_WORD = /(Create|Update|Upsert|Delete|Insert|Set|Save|Add|Remove|Reset|Migrate|Clear)/;

export class SandboxBlockedError extends Error {
  constructor(method: string) {
    super(`Test mode blocked storage.${method}: it would change the database.`);
    this.name = "SandboxBlockedError";
  }
}

/**
 * Wraps the real storage. Outside a test session every method is returned unchanged; inside a session
 * only the sandboxed handlers and read-only methods work; any other method is skipped and returns undefined.
 */
export function createSandboxAwareStorage<T extends object>(real: T): T {
  return new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof prop !== "string" || typeof value !== "function") return value;

      const session = sandboxContext.getStore();
      if (!session) return value.bind(target);

      const handler = HANDLERS[prop];
      if (handler) return (...args: any[]) => handler(session, target, ...args);

      if (READ_ALLOW.has(prop) || (READ_NAME.test(prop) && !WRITE_WORD.test(prop))) return value.bind(target);

      // Writes the test mode does not simulate (snapshot caches, drafts and so on) are skipped, not failed:
      // callers that fire them without waiting would otherwise crash the server on an unhandled rejection.
      return async () => {
        console.warn(`[test-mode] skipped storage.${prop} (would change the database)`);
        return undefined;
      };
    },
  });
}

/** Express middleware: runs the rest of the request inside the sandbox session named by the header. */
export function sandboxMiddleware(req: Request, res: Response, next: NextFunction) {
  const id = req.header(SANDBOX_HEADER);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return next();
  res.setHeader("x-contracts-test-mode", "1");
  sandboxContext.run(getSession(id), () => next());
}

export function registerSandboxRoutes(app: Express) {
  // Throw away everything done in this test session so the next read comes from the real data again.
  app.delete("/api/contracts-test/session", (req, res) => {
    const id = req.header(SANDBOX_HEADER);
    if (!id) return res.status(400).json({ error: "Not a test-mode request" });
    sessions.delete(id);
    res.json({ reset: true });
  });
}
