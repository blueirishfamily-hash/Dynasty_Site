// Site admin: add leagues, edit them, manage commissioners and PIN resets, read the audit log.
// Every route needs the admin unlock. Every change is written to the audit log.
import type { Express, Request, Response } from "express";
import { getLeague, getLeagueUsers } from "../sleeper";
import { walkSeasonChain } from "../leagueChain";
import { leagueResolver } from "../leagueRegistry";
import { normalizeSlug } from "../middleware/league";
import { requireAdmin } from "../security/guards";
import { SETUP_PREFIX, generateSetupCode, hashSecret, normalizeSetupCode, readPinSlot } from "../security/secrets";
import {
  addCommissioner,
  createLeague,
  getCommissioner,
  getLeagueById,
  listAudit,
  listCommissioners,
  listLeaguesWithSeasons,
  registeredSleeperIds,
  removeCommissioner,
  setCommissionerPinHash,
  updateLeague,
  writeAudit,
} from "../security/store";

/** Invite codes: stored upper case, 6 to 32 letters and digits. */
export function normalizeInviteCode(raw: unknown): string | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{6,32}$/.test(code) ? code : "invalid";
}

/** A new setup code and the value stored for it in league_commissioners.pin_hash. */
async function newSetupCode() {
  const code = generateSetupCode();
  return { code, stored: SETUP_PREFIX + (await hashSecret(normalizeSetupCode(code))) };
}

function isUniqueViolation(error: any) {
  return error?.code === "23505" || error?.cause?.code === "23505";
}

function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      await fn(req, res);
    } catch (error: any) {
      if (isUniqueViolation(error) && !res.headersSent) {
        return res.status(409).json({ error: "That address or invite code is already used by another league.", code: "duplicate" });
      }
      console.error(`[Admin] ${req.method} ${req.path} failed:`, error?.code || error);
      if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

function publicCommissioner(c: { id: string; sleeperUserId: string; role: string; pinHash: string | null; pinSetAt: number | null; addedAt: number }) {
  return { id: c.id, sleeperUserId: c.sleeperUserId, role: c.role, pinState: readPinSlot(c.pinHash, c.pinSetAt).state, pinSetAt: c.pinSetAt, addedAt: c.addedAt };
}

/** Season chain plus everything the admin needs to decide whether it can be added. */
async function previewLeague(sleeperLeagueId: string) {
  const chain = await walkSeasonChain(sleeperLeagueId, getLeague);
  const [taken, users] = await Promise.all([
    registeredSleeperIds(chain.seasons.map((s) => s.sleeperLeagueId)),
    getLeagueUsers(chain.latest.league_id).catch(() => []),
  ]);
  return {
    name: chain.latest.name,
    seasons: chain.seasons,
    stoppedEarly: chain.stoppedEarly,
    alreadyRegistered: taken.map((t) => ({ season: t.season, sleeperLeagueId: t.sleeperLeagueId, leagueId: t.leagueId })),
    sleeperOwnerId: chain.latest.owner_id ?? null,
    users: users.map((u) => ({ sleeperUserId: u.user_id, displayName: u.display_name, teamName: u.metadata?.team_name ?? null })),
  };
}

export function registerAdminLeagueRoutes(app: Express): void {
  app.get("/api/admin/leagues", handle(async (_req, res) => {
    const leagues = await listLeaguesWithSeasons();
    res.json(leagues.map(({ league, seasons, commissioners }) => ({
      id: league.id,
      name: league.name,
      slug: league.slug,
      inviteCode: league.inviteCode,
      contractsEnabled: league.contractsEnabled === 1,
      leaguePinSet: !!league.leaguePinHash,
      status: league.status,
      createdAt: league.createdAt,
      seasons: seasons.map((s) => ({ season: s.season, sleeperLeagueId: s.sleeperLeagueId, previousSleeperLeagueId: s.previousSleeperLeagueId, status: s.status })),
      commissioners: commissioners.map(publicCommissioner),
    })));
  }));

  app.post("/api/admin/leagues/preview", handle(async (req, res) => {
    const id = String(req.body?.sleeperLeagueId ?? "").trim();
    if (!/^\d{6,25}$/.test(id)) return res.status(400).json({ error: "Enter a Sleeper league ID (digits only)." });
    try {
      res.json(await previewLeague(id));
    } catch {
      res.status(404).json({ error: "Sleeper has no league with that ID." });
    }
  }));

  app.post("/api/admin/leagues", handle(async (req, res) => {
    const { sleeperLeagueId, name, slug: rawSlug, inviteCode: rawCode, contractsEnabled, commissionerSleeperUserId } = req.body ?? {};
    const id = String(sleeperLeagueId ?? "").trim();
    const slug = normalizeSlug(rawSlug);
    const inviteCode = normalizeInviteCode(rawCode);
    if (!/^\d{6,25}$/.test(id)) return res.status(400).json({ error: "Enter a Sleeper league ID (digits only)." });
    if (!slug) return res.status(400).json({ error: "The address can use lower-case letters, digits and single hyphens." });
    if (inviteCode === "invalid") return res.status(400).json({ error: "Invite codes are 6 to 32 letters and digits." });
    if (typeof name !== "string" || !name.trim() || name.trim().length > 128) return res.status(400).json({ error: "Enter a league name (up to 128 characters)." });
    if (typeof commissionerSleeperUserId !== "string" || !commissionerSleeperUserId) return res.status(400).json({ error: "Pick the commissioner." });

    // Re-check against Sleeper here rather than trusting the preview the browser saw.
    let preview;
    try {
      preview = await previewLeague(id);
    } catch {
      return res.status(404).json({ error: "Sleeper has no league with that ID." });
    }
    if (preview.alreadyRegistered.length > 0) {
      return res.status(409).json({ error: "Some of these seasons already belong to a league on the site.", code: "season_taken", alreadyRegistered: preview.alreadyRegistered });
    }
    if (!preview.users.some((u) => u.sleeperUserId === commissionerSleeperUserId)) {
      return res.status(400).json({ error: "The commissioner must be a member of the league on Sleeper." });
    }

    const setup = await newSetupCode();
    const now = Date.now();
    const created = await createLeague({
      name: name.trim(),
      slug,
      inviteCode,
      contractsEnabled: contractsEnabled === true,
      createdBy: "admin",
      seasons: preview.seasons.map((s) => ({ season: s.season, sleeperLeagueId: s.sleeperLeagueId, previousSleeperLeagueId: s.previousSleeperLeagueId })),
      owner: { sleeperUserId: commissionerSleeperUserId, setupCodeHash: setup.stored },
    }, now);
    leagueResolver.invalidate();
    await writeAudit({
      leagueId: created.leagueId,
      actorSleeperUserId: null,
      actorRole: "admin",
      action: "league_added",
      details: { slug, seasons: preview.seasons.map((s) => s.season), commissioner: commissionerSleeperUserId, contractsEnabled: contractsEnabled === true },
    }, now);
    res.status(201).json({ leagueId: created.leagueId, slug, setupCode: setup.code });
  }));

  app.patch("/api/admin/leagues/:id", handle(async (req, res) => {
    const league = await getLeagueById(req.params.id);
    if (!league) return res.status(404).json({ error: "League not found" });
    const body = req.body ?? {};
    const patch: Parameters<typeof updateLeague>[1] = {};
    const changed: string[] = [];
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 128) return res.status(400).json({ error: "Enter a league name (up to 128 characters)." });
      patch.name = body.name.trim(); changed.push("name");
    }
    if (body.slug !== undefined) {
      const slug = normalizeSlug(body.slug);
      if (!slug) return res.status(400).json({ error: "The address can use lower-case letters, digits and single hyphens." });
      patch.slug = slug; changed.push("slug");
    }
    if (body.inviteCode !== undefined) {
      const code = normalizeInviteCode(body.inviteCode);
      if (code === "invalid") return res.status(400).json({ error: "Invite codes are 6 to 32 letters and digits." });
      patch.inviteCode = code; changed.push("inviteCode");
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "archived") return res.status(400).json({ error: "Status is active or archived." });
      patch.status = body.status; changed.push("status");
    }
    if (body.contractsEnabled !== undefined) {
      patch.contractsEnabled = body.contractsEnabled === true ? 1 : 0; changed.push("contractsEnabled");
    }
    if (changed.length === 0) return res.status(400).json({ error: "Nothing to change." });
    await updateLeague(league.id, patch);
    leagueResolver.invalidate();
    await writeAudit({
      leagueId: league.id,
      actorSleeperUserId: null,
      actorRole: "admin",
      action: "league_updated",
      // Never log the invite code itself.
      details: { changed, before: { name: league.name, slug: league.slug, status: league.status, contractsEnabled: league.contractsEnabled === 1 }, after: { ...patch, inviteCode: undefined } },
    });
    res.json({ updated: changed });
  }));

  // Clears the league PIN (asked when a device first joins). Signing devices out happens in phase 4.
  app.post("/api/admin/leagues/:id/reset-league-pin", handle(async (req, res) => {
    const league = await getLeagueById(req.params.id);
    if (!league) return res.status(404).json({ error: "League not found" });
    await updateLeague(league.id, { leaguePinHash: null, leaguePinSetAt: null });
    leagueResolver.invalidate();
    await writeAudit({ leagueId: league.id, actorSleeperUserId: null, actorRole: "admin", action: "league_pin_reset", details: null });
    res.json({ reset: true });
  }));

  app.post("/api/admin/leagues/:id/commissioners", handle(async (req, res) => {
    const league = await getLeagueById(req.params.id);
    if (!league) return res.status(404).json({ error: "League not found" });
    const { sleeperUserId, role } = req.body ?? {};
    if (typeof sleeperUserId !== "string" || !/^\d{1,25}$/.test(sleeperUserId)) return res.status(400).json({ error: "Pick a Sleeper user." });
    if (role !== "owner" && role !== "co") return res.status(400).json({ error: "Role is owner or co." });
    const setup = await newSetupCode();
    const now = Date.now();
    const row = await addCommissioner({ leagueId: league.id, sleeperUserId, role, pinHash: setup.stored, pinSetAt: now, addedBy: "admin", addedAt: now });
    await writeAudit({ leagueId: league.id, actorSleeperUserId: null, actorRole: "admin", action: "commissioner_added", details: { commissionerId: row.id, sleeperUserId, role } }, now);
    res.status(201).json({ commissioner: publicCommissioner(row), setupCode: setup.code });
  }));

  app.delete("/api/admin/leagues/:id/commissioners/:cid", handle(async (req, res) => {
    const row = await getCommissioner(req.params.cid);
    if (!row || row.leagueId !== req.params.id) return res.status(404).json({ error: "Commissioner not found" });
    const all = await listCommissioners(row.leagueId);
    if (all.length <= 1) return res.status(409).json({ error: "A league needs at least one commissioner." });
    await removeCommissioner(row.id);
    await writeAudit({ leagueId: row.leagueId, actorSleeperUserId: null, actorRole: "admin", action: "commissioner_removed", details: { commissionerId: row.id, sleeperUserId: row.sleeperUserId, role: row.role } });
    res.json({ removed: true });
  }));

  // Clears the PIN and issues a one-time setup code. The old PIN and its unlocks stop working at once.
  app.post("/api/admin/leagues/:id/commissioners/:cid/reset-pin", handle(async (req, res) => {
    const row = await getCommissioner(req.params.cid);
    if (!row || row.leagueId !== req.params.id) return res.status(404).json({ error: "Commissioner not found" });
    const setup = await newSetupCode();
    const now = Date.now();
    await setCommissionerPinHash(row.id, setup.stored, now);
    await writeAudit({ leagueId: row.leagueId, actorSleeperUserId: null, actorRole: "admin", action: "commissioner_pin_reset", details: { commissionerId: row.id, sleeperUserId: row.sleeperUserId } }, now);
    res.json({ setupCode: setup.code });
  }));

  app.get("/api/admin/audit", handle(async (req, res) => {
    const leagueId = typeof req.query.leagueId === "string" && req.query.leagueId ? req.query.leagueId : null;
    const limit = Number(req.query.limit) || 200;
    res.json(await listAudit(leagueId, limit));
  }));
}
