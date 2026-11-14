/**
 * Commissioner edits to contracts and dead cap, with a change log everyone in the league can read.
 *
 * Every write needs the commissioner's user id, a reason, and is logged. The log lives in league settings (a JSON
 * list, newest first, capped), so it needs no table of its own.
 */
import type { Express } from "express";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { getAllPlayers } from "./sleeper";

const LOG_LIMIT = 300;
const REASONS = ["Fix wrong salary", "Missed pickup", "Trade adjustment", "League decision", "Other"];

export interface ChangeLogEntry {
  id: string;
  at: number;
  action: "contract_edit" | "contract_create" | "contract_remove" | "dead_cap_add" | "dead_cap_edit" | "dead_cap_remove";
  rosterId: number;
  playerId: string;
  playerName: string;
  summary: string;
  detail: string;
  reason: string;
  note: string;
}

// league_settings.setting_value is varchar(256), so the log is a ring of small rows (one entry per row) instead of
// one long JSON value: slots ccl_0 .. ccl_49 plus a counter, ccl_n. Oldest entries are overwritten.
const SLOT_COUNT = 50;
const COUNTER_KEY = "ccl_n";
const MAX_VALUE = 250;

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

function packEntry(e: ChangeLogEntry): string {
  const limits = { s: 60, d: 70, o: 40, p: 24 };
  const build = () =>
    JSON.stringify({ i: e.id.slice(0, 8), t: e.at, a: e.action, r: e.rosterId, k: e.playerId, p: clip(e.playerName, limits.p), s: clip(e.summary, limits.s), d: clip(e.detail, limits.d), w: clip(e.reason, 20), o: clip(e.note, limits.o) });
  let out = build();
  for (const key of ["o", "d", "s", "p"] as const) {
    while (out.length > MAX_VALUE && limits[key] > 0) {
      limits[key] = Math.max(0, limits[key] - 10);
      out = build();
    }
  }
  return out.slice(0, 256);
}

function unpackEntry(raw: string): ChangeLogEntry | null {
  try {
    const o = JSON.parse(raw);
    return { id: o.i, at: o.t, action: o.a, rosterId: o.r, playerId: o.k, playerName: o.p ?? "", summary: o.s ?? "", detail: o.d ?? "", reason: o.w ?? "", note: o.o ?? "" };
  } catch {
    return null;
  }
}

async function readLog(leagueId: string): Promise<ChangeLogEntry[]> {
  try {
    const n = parseInt((await storage.getLeagueSetting(leagueId, COUNTER_KEY)) ?? "0", 10) || 0;
    const keys: string[] = [];
    for (let k = n - 1; k >= Math.max(0, n - SLOT_COUNT); k--) keys.push(`ccl_${k % SLOT_COUNT}`);
    const raws = await Promise.all(keys.map(key => storage.getLeagueSetting(leagueId, key)));
    return raws.map(r => (r ? unpackEntry(r) : null)).filter((e): e is ChangeLogEntry => !!e).slice(0, LOG_LIMIT);
  } catch {
    return [];
  }
}

/** The edit itself is already saved by the time this runs, so a log failure is reported but never fails the request. */
async function appendLog(leagueId: string, entry: Omit<ChangeLogEntry, "id" | "at">) {
  try {
    const full: ChangeLogEntry = { id: randomUUID(), at: Date.now(), ...entry };
    const n = parseInt((await storage.getLeagueSetting(leagueId, COUNTER_KEY)) ?? "0", 10) || 0;
    await storage.setLeagueSetting(leagueId, `ccl_${n % SLOT_COUNT}`, packEntry(full));
    await storage.setLeagueSetting(leagueId, COUNTER_KEY, String(n + 1));
  } catch (error) {
    console.error("Could not write the commissioner change log:", error);
  }
}

/** $M by season (from the client) to tenths of $M as stored. Drops zero and invalid seasons. */
function toTenths(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, number> = {};
  for (const [y, v] of Object.entries(input as Record<string, unknown>)) {
    const year = Number(y);
    const m = Number(v);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isFinite(m) || m < 0 || m > 250) return null;
    const tenths = Math.round(m * 10);
    if (tenths > 0) out[String(year)] = tenths;
  }
  return out;
}

const fmt = (tenths: Record<string, number>) =>
  Object.keys(tenths).length === 0
    ? "no salary"
    : Object.entries(tenths).sort().map(([y, v]) => `${y} $${(v / 10).toFixed(1)}`).join(", ");

async function playerName(playerId: string): Promise<string> {
  const players = await getAllPlayers().catch(() => ({} as Record<string, any>));
  const p = players[playerId] || {};
  return String(p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || playerId).slice(0, 128);
}

export function registerCommissionerEditRoutes(app: Express, isCommissioner: (userId: string, leagueId?: string) => Promise<boolean>) {
  /** Returns the cleaned reason, or sends the error response and returns null. */
  const guard = async (req: any, res: any, userId: unknown, reason: unknown): Promise<string | null> => {
    if (typeof userId !== "string" || !userId || !(await isCommissioner(userId, req.params.leagueId))) {
      res.status(403).json({ error: "Only the commissioner can edit contracts" });
      return null;
    }
    const r = typeof reason === "string" ? reason.trim() : "";
    if (!r || !REASONS.includes(r)) {
      res.status(400).json({ error: "Pick a reason for this change" });
      return null;
    }
    return r;
  };
  const noteOf = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 300) : "");

  app.get("/api/league/:leagueId/commissioner/change-log", async (req, res) => {
    try {
      res.json(await readLog(req.params.leagueId));
    } catch (error) {
      console.error("Error reading change log:", error);
      res.status(500).json({ error: "Failed to read the change log" });
    }
  });

  // Create or edit a contract. Body: { userId, rosterId, playerId, salaries ($M by season), flags?, reason, note? }
  app.post("/api/league/:leagueId/commissioner/contract", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId, rosterId, playerId, salaries, flags, reason, note } = req.body ?? {};
      const why = await guard(req, res, userId, reason);
      if (why == null) return;
      const roster = Number(rosterId);
      if (!Number.isInteger(roster) || typeof playerId !== "string" || !playerId) {
        return res.status(400).json({ error: "Team and player are required" });
      }
      const tenths = toTenths(salaries);
      if (!tenths) return res.status(400).json({ error: "Salaries must be between $0 and $250" });
      const years = Object.keys(tenths).map(Number).sort((a, b) => a - b);
      if (years.length === 0) return res.status(400).json({ error: "Set at least one season's salary, or remove the contract" });

      const existing = (await storage.getPlayerContracts(leagueId)).find(c => c.rosterId === roster && c.playerId === playerId) as any;
      let before: Record<string, number> = {};
      try {
        before = JSON.parse(existing?.salaries || "{}");
      } catch { /* */ }

      const f = flags ?? {};
      const pick = (key: string, current: number | undefined) => (typeof f[key] === "boolean" ? (f[key] ? 1 : 0) : (current ?? 0));
      const tagged = pick("tagged", existing?.franchiseTagUsed);
      const extended = pick("extended", existing?.extensionApplied);
      const saved = await storage.upsertPlayerContract({
        leagueId,
        rosterId: roster,
        playerId,
        salaries: JSON.stringify(tenths),
        fifthYearOption: existing?.fifthYearOption ?? null,
        isOnIr: pick("ir", existing?.isOnIr),
        franchiseTagUsed: tagged,
        franchiseTagYear: tagged ? (existing?.franchiseTagYear ?? years[0]) : null,
        originalContractYears: existing?.originalContractYears ?? years.length,
        isRookieContract: pick("rookie", existing?.isRookieContract),
        extensionApplied: extended,
        extensionYear: extended ? (existing?.extensionYear ?? years[0]) : null,
        extensionSalary: existing?.extensionSalary ?? null,
        // Tag and extension history are separate indicators. Each is set only by its own flag
        // (an active tag/extension implies its own history, never the other's).
        hasBeenExtended: typeof f.everExtended === "boolean" ? (f.everExtended || extended ? 1 : 0) : (extended ? 1 : (existing?.hasBeenExtended ?? 0)),
        hasBeenFranchiseTagged: typeof f.everTagged === "boolean" ? (f.everTagged || tagged ? 1 : 0) : (tagged ? 1 : (existing?.hasBeenFranchiseTagged ?? 0)),
      } as any);

      const name = await playerName(playerId);
      await appendLog(leagueId, {
        action: existing ? "contract_edit" : "contract_create",
        rosterId: roster,
        playerId,
        playerName: name,
        summary: existing ? `${name} contract edited` : `${name} contract created`,
        detail: existing ? `${fmt(before)} → ${fmt(tenths)}` : fmt(tenths),
        reason: why,
        note: noteOf(note),
      });
      res.json(saved);
    } catch (error) {
      console.error("Error saving commissioner contract edit:", error);
      res.status(500).json({ error: "Failed to save the contract" });
    }
  });

  // Remove a contract. No dead cap is created. Query: userId, reason, note
  app.delete("/api/league/:leagueId/commissioner/contract/:rosterId/:playerId", async (req, res) => {
    try {
      const { leagueId, rosterId, playerId } = req.params;
      const why = await guard(req, res, req.query.userId, req.query.reason);
      if (why == null) return;
      const roster = parseInt(rosterId, 10);
      const existing = (await storage.getPlayerContracts(leagueId)).find(c => c.rosterId === roster && c.playerId === playerId) as any;
      if (!existing) return res.status(404).json({ error: "No contract to remove" });
      let before: Record<string, number> = {};
      try {
        before = JSON.parse(existing.salaries || "{}");
      } catch { /* */ }
      await storage.deletePlayerContract(leagueId, roster, playerId);
      const name = await playerName(playerId);
      await appendLog(leagueId, {
        action: "contract_remove",
        rosterId: roster,
        playerId,
        playerName: name,
        summary: `${name} contract removed`,
        detail: `Was ${fmt(before)}`,
        reason: why,
        note: noteOf(req.query.note),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing commissioner contract:", error);
      res.status(500).json({ error: "Failed to remove the contract" });
    }
  });

  // Add a dead cap entry, or replace one (entryId). Body: { userId, rosterId, playerId, playerName?, playerPosition?, deadCapSalaries ($M), entryId?, reason, note? }
  app.post("/api/league/:leagueId/commissioner/dead-cap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId, rosterId, playerId, deadCapSalaries, entryId, reason, note } = req.body ?? {};
      const why = await guard(req, res, userId, reason);
      if (why == null) return;
      const roster = Number(rosterId);
      if (!Number.isInteger(roster) || typeof playerId !== "string" || !playerId) {
        return res.status(400).json({ error: "Team and player are required" });
      }
      const tenths = toTenths(deadCapSalaries);
      if (!tenths || Object.keys(tenths).length === 0) return res.status(400).json({ error: "Enter at least one season of dead cap" });

      const entries = await storage.getDeadCapEntriesByLeague(leagueId);
      const old = entryId ? entries.find(e => e.id === entryId) : null;
      if (entryId && !old) return res.status(404).json({ error: "That dead cap entry no longer exists" });
      const players = await getAllPlayers().catch(() => ({} as Record<string, any>));
      const p = players[playerId] || {};
      const name = String(req.body.playerName || old?.playerName || (await playerName(playerId))).slice(0, 128);
      if (old) await storage.deleteDeadCapEntry(old.id);
      const created = await storage.createDeadCapEntry({
        leagueId,
        rosterId: roster,
        playerId,
        playerName: name,
        playerPosition: String(req.body.playerPosition || old?.playerPosition || p.position || "").slice(0, 16),
        reason: old?.reason || "commissioner",
        deadCapSalaries: JSON.stringify(tenths),
      } as any);
      let before: Record<string, number> = {};
      try {
        before = JSON.parse(old?.deadCapSalaries || "{}");
      } catch { /* */ }
      await appendLog(leagueId, {
        action: old ? "dead_cap_edit" : "dead_cap_add",
        rosterId: roster,
        playerId,
        playerName: name,
        summary: old ? `${name} dead cap edited` : `${name} dead cap added`,
        detail: old ? `${fmt(before)} → ${fmt(tenths)}` : fmt(tenths),
        reason: why,
        note: noteOf(note),
      });
      res.json(created);
    } catch (error) {
      console.error("Error saving commissioner dead cap edit:", error);
      res.status(500).json({ error: "Failed to save the dead cap entry" });
    }
  });

  app.delete("/api/league/:leagueId/commissioner/dead-cap/:entryId", async (req, res) => {
    try {
      const { leagueId, entryId } = req.params;
      const why = await guard(req, res, req.query.userId, req.query.reason);
      if (why == null) return;
      const entry = (await storage.getDeadCapEntriesByLeague(leagueId)).find(e => e.id === entryId);
      if (!entry) return res.status(404).json({ error: "That dead cap entry no longer exists" });
      let before: Record<string, number> = {};
      try {
        before = JSON.parse(entry.deadCapSalaries || "{}");
      } catch { /* */ }
      await storage.deleteDeadCapEntry(entryId);
      await appendLog(leagueId, {
        action: "dead_cap_remove",
        rosterId: entry.rosterId,
        playerId: entry.playerId,
        playerName: entry.playerName,
        summary: `${entry.playerName} dead cap removed`,
        detail: `Was ${fmt(before)}`,
        reason: why,
        note: noteOf(req.query.note),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing commissioner dead cap entry:", error);
      res.status(500).json({ error: "Failed to remove the dead cap entry" });
    }
  });
}

export { REASONS as COMMISSIONER_EDIT_REASONS };
