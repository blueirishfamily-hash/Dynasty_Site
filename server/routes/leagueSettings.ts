// League rules and League Settings (multi-league plan, "Per-league settings").
//
//   GET    /api/registry/leagues/:slug/rules           current and next-season rules (anyone in the league)
//   PUT    /api/registry/leagues/:slug/rules/next      save next season's rules (commissioner PIN)
//   DELETE /api/registry/leagues/:slug/rules/next      discard next season's saved rules (commissioner PIN)
//   PUT    /api/registry/leagues/:slug/rules/current   emergency change to this season, with a reason (admin passcode)
//   GET    /api/registry/leagues/:slug/settings        contracts switch, invite code, league PIN, commissioners (commissioner PIN)
//   PATCH  /api/registry/leagues/:slug/settings        change those (commissioner PIN)
//   POST   /api/registry/leagues/:slug/commissioners   add a co-commissioner, returns a setup code (commissioner PIN)
//   DELETE /api/registry/leagues/:slug/commissioners/:sleeperUserId   remove a co-commissioner (commissioner PIN)
//
// Rule changes a commissioner saves apply from next season, so signed contracts and cap math don't shift
// mid-year. Only the site admin can change the season in progress. Every change is in the audit log.
import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { auditLogTable } from "../../shared/schema";
import { changedRuleKeys, mergeRules, validateRules, type LeagueRules } from "../../shared/leagueRules";
import { leagueRulesFor, rulesRows, saveRulesRow, deleteRulesRow } from "../leagueRules";
import { leagueResolver } from "../leagueRegistry";
import { auditActor, requireAdmin, requireCommissioner } from "../security/guards";
import { SETUP_PREFIX, generateSetupCode, hashSecret, isValidPin, normalizeSetupCode, readPinSlot } from "../security/secrets";
import { addCommissioner, findCommissioner, listCommissioners, removeCommissioner, updateLeague, writeAudit } from "../security/store";
import { normalizeInviteCode } from "./adminLeagues";
import { leagueFromSlug } from "./security";

const nextSeasonOf = (season: string) => String(Number(season) + 1);

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error: any) {
      if ((error?.code === "23505" || error?.cause?.code === "23505") && !res.headersSent) {
        return res.status(409).json({ error: "That invite code is already used by another league.", code: "duplicate" });
      }
      console.error(`[League settings] ${req.method} ${req.path} failed:`, error?.code || error);
      if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

/** Reads and validates a rules object from the request. Sends 400 and returns null when invalid. */
function rulesFromBody(req: Request, res: Response): LeagueRules | null {
  const rules = mergeRules(req.body?.rules);
  const errors = validateRules(rules);
  if (errors.length > 0) {
    res.status(400).json({ error: errors[0], errors, code: "invalid_rules" });
    return null;
  }
  return rules;
}

export function registerLeagueSettingsRoutes(app: Express): void {
  app.get("/api/registry/leagues/:slug/rules", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const season = league.season.season;
    const nextSeason = nextSeasonOf(season);
    const rows = await rulesRows(league.league.id);
    const current = await leagueRulesFor(league.league.id, season);
    const next = await leagueRulesFor(league.league.id, nextSeason);
    const savedNext = rows.find((r) => r.season === nextSeason);
    const emergencies = await db
      .select()
      .from(auditLogTable)
      .where(and(eq(auditLogTable.leagueId, league.league.id), inArray(auditLogTable.action, ["rules_emergency_change"])))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(20);
    res.json({
      currentSeason: season,
      nextSeason,
      current: { rules: current.rules, fromSeason: current.fromSeason },
      next: { rules: next.rules, saved: !!savedNext, updatedAt: savedNext?.updatedAt ?? null, updatedBy: savedNext?.updatedBy ?? null },
      emergencies: emergencies
        .filter((e) => (e.details as any)?.season === season)
        .map((e) => ({ at: e.createdAt, reason: (e.details as any)?.reason ?? "", changed: (e.details as any)?.changed ?? [] })),
    });
  }));

  app.put("/api/registry/leagues/:slug/rules/next", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const actor = await requireCommissioner(req, res, league);
    if (!actor) return;
    const rules = rulesFromBody(req, res);
    if (!rules) return;
    const nextSeason = nextSeasonOf(league.season.season);
    const before = (await leagueRulesFor(league.league.id, nextSeason)).rules;
    const changed = changedRuleKeys(before, rules).filter((k) => k !== "phases");
    const who = actor.role === "commissioner" ? actor.sleeperUserId : "admin";
    await saveRulesRow(league.league.id, nextSeason, rules, who);
    await writeAudit({ leagueId: league.league.id, ...auditActor(actor), action: "rules_saved_next", details: { season: nextSeason, changed } });
    res.json({ saved: true, season: nextSeason, changed });
  }));

  app.delete("/api/registry/leagues/:slug/rules/next", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const actor = await requireCommissioner(req, res, league);
    if (!actor) return;
    const nextSeason = nextSeasonOf(league.season.season);
    await deleteRulesRow(league.league.id, nextSeason);
    await writeAudit({ leagueId: league.league.id, ...auditActor(actor), action: "rules_next_discarded", details: { season: nextSeason } });
    res.json({ discarded: true });
  }));

  // Emergency change to the season in progress: site admin only, with a reason.
  app.put("/api/registry/leagues/:slug/rules/current", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    if (!(await requireAdmin(req, res))) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: "Give a reason for changing this season's rules (5 to 500 characters)." });
    const rules = rulesFromBody(req, res);
    if (!rules) return;
    const season = league.season.season;
    const before = (await leagueRulesFor(league.league.id, season)).rules;
    const changed = changedRuleKeys(before, rules).filter((k) => k !== "phases");
    if (changed.length === 0) return res.status(400).json({ error: "Nothing changed." });
    await saveRulesRow(league.league.id, season, rules, "admin");
    await writeAudit({ leagueId: league.league.id, actorSleeperUserId: null, actorRole: "admin", action: "rules_emergency_change", details: { season, reason, changed } });
    res.json({ saved: true, season, changed });
  }));

  // ─── League access and commissioners ─────────────────────────────────────────

  app.get("/api/registry/leagues/:slug/settings", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    if (!(await requireCommissioner(req, res, league))) return;
    const commissioners = await listCommissioners(league.league.id);
    res.json({
      contractsEnabled: league.league.contractsEnabled === 1,
      inviteCode: league.league.inviteCode,
      leaguePinSet: !!league.league.leaguePinHash,
      commissioners: commissioners.map((c) => ({ sleeperUserId: c.sleeperUserId, role: c.role, pinState: readPinSlot(c.pinHash, c.pinSetAt).state })),
    });
  }));

  app.patch("/api/registry/leagues/:slug/settings", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const actor = await requireCommissioner(req, res, league);
    if (!actor) return;
    const body = req.body ?? {};
    const patch: Parameters<typeof updateLeague>[1] = {};
    const changed: string[] = [];
    if (body.contractsEnabled !== undefined) {
      if (typeof body.contractsEnabled !== "boolean") return res.status(400).json({ error: "contractsEnabled must be true or false." });
      patch.contractsEnabled = body.contractsEnabled ? 1 : 0;
      changed.push("contractsEnabled");
    }
    if (body.inviteCode !== undefined) {
      const code = normalizeInviteCode(body.inviteCode);
      if (code === "invalid") return res.status(400).json({ error: "Invite codes are 6 to 32 letters and digits." });
      patch.inviteCode = code;
      changed.push("inviteCode");
    }
    if (body.leaguePin !== undefined) {
      if (body.leaguePin === null) {
        patch.leaguePinHash = null;
        patch.leaguePinSetAt = null;
      } else {
        if (!isValidPin(body.leaguePin)) return res.status(400).json({ error: "A league PIN is 4 to 8 digits." });
        patch.leaguePinHash = await hashSecret(body.leaguePin);
        patch.leaguePinSetAt = Date.now();
      }
      changed.push("leaguePin");
    }
    if (changed.length === 0) return res.status(400).json({ error: "Nothing to change." });
    await updateLeague(league.league.id, patch);
    leagueResolver.invalidate();
    await writeAudit({
      leagueId: league.league.id,
      ...auditActor(actor),
      action: "league_settings_changed",
      // Never log the invite code or PIN themselves.
      details: { changed, contractsEnabled: body.contractsEnabled, leaguePinCleared: body.leaguePin === null || undefined },
    });
    res.json({ updated: changed });
  }));

  app.post("/api/registry/leagues/:slug/commissioners", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const actor = await requireCommissioner(req, res, league);
    if (!actor) return;
    const sleeperUserId = req.body?.sleeperUserId;
    if (typeof sleeperUserId !== "string" || !/^\d{1,25}$/.test(sleeperUserId)) return res.status(400).json({ error: "Pick a league member." });
    if (await findCommissioner(league.league.id, sleeperUserId)) return res.status(409).json({ error: "They're already a commissioner." });
    const code = generateSetupCode();
    const now = Date.now();
    const row = await addCommissioner({
      leagueId: league.league.id,
      sleeperUserId,
      role: "co",
      pinHash: SETUP_PREFIX + (await hashSecret(normalizeSetupCode(code))),
      pinSetAt: now,
      addedBy: actor.role === "commissioner" ? actor.sleeperUserId : "admin",
      addedAt: now,
    });
    await writeAudit({ leagueId: league.league.id, ...auditActor(actor), action: "commissioner_added", details: { commissionerId: row.id, sleeperUserId, role: "co" } }, now);
    res.status(201).json({ setupCode: code });
  }));

  app.delete("/api/registry/leagues/:slug/commissioners/:sleeperUserId", handle(async (req, res) => {
    const league = await leagueFromSlug(req, res);
    if (!league) return;
    const actor = await requireCommissioner(req, res, league);
    if (!actor) return;
    const row = await findCommissioner(league.league.id, req.params.sleeperUserId);
    if (!row) return res.status(404).json({ error: "Not a commissioner of this league." });
    // Commissioners manage co-commissioners; changing the owner is a site admin action.
    if (row.role === "owner") return res.status(403).json({ error: "Only the site admin can remove the league owner." });
    await removeCommissioner(row.id);
    await writeAudit({ leagueId: league.league.id, ...auditActor(actor), action: "commissioner_removed", details: { commissionerId: row.id, sleeperUserId: row.sleeperUserId, role: row.role } });
    res.json({ removed: true });
  }));
}
