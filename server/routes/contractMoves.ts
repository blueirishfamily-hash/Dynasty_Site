// Routes for the Contracts Hub "Contract moves" tab: the log of automatic contract moves, the commissioner's switch,
// approving or rejecting proposals, and marking an over-the-cap flag as handled.
import type { Express } from "express";
import { storage } from "../storage";
import { leagueActor, requireCommissioner, type Actor } from "../security/guards";
import {
  applyContractMove,
  getContractMovesLiveAt,
  parseFlags,
  rejectContractMove,
  resolveContractMoveFlag,
  runContractMoves,
  setContractMovesLive,
} from "../contractMoves";
import type { ContractMove } from "../../shared/schema";

const actorId = (actor: Actor) => (actor.role === "admin" ? "admin" : actor.sleeperUserId);

function present(row: ContractMove) {
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(row.detail || "{}");
  } catch { /* leave empty */ }
  const { effect: _effect, ...rest } = detail as { effect?: unknown };
  return {
    id: row.id,
    transactionId: row.transactionId,
    kind: row.kind,
    playerId: row.playerId,
    playerName: row.playerName,
    playerPosition: row.playerPosition,
    fromRosterId: row.fromRosterId,
    toRosterId: row.toRosterId,
    status: row.status,
    summary: row.summary,
    detail: rest,
    flags: parseFlags(row),
    flagStatus: row.flagStatus,
    txAt: Number(row.txAt),
    createdAt: Number(row.createdAt),
    resolvedAt: row.resolvedAt == null ? null : Number(row.resolvedAt),
  };
}

export function registerContractMovesRoutes(app: Express): void {
  // The log. Everyone in the league sees what was applied and any over-the-cap flags. Proposals (waiting for the
  // commissioner) are shown only to the commissioner. Also refreshes the log from Sleeper (at most every few minutes).
  app.get("/api/league/:leagueId/contract-moves", async (req, res) => {
    try {
      const { leagueId } = req.params;
      await runContractMoves(leagueId);
      const commissioner = !!(await leagueActor(req, req.league));
      const liveAt = await getContractMovesLiveAt(leagueId);
      const rows = await storage.getContractMoves(leagueId);
      const visible = rows
        .filter((r) => r.status !== "skipped")
        .filter((r) => commissioner || (r.status !== "proposed" && r.status !== "rejected"));
      res.json({ live: liveAt != null, liveAt, commissioner, moves: visible.slice(0, 300).map(present) });
    } catch (error: any) {
      console.error("Error reading contract moves:", error);
      res.status(500).json({ error: "Failed to read contract moves" });
    }
  });

  // Turn automatic contract moves on or off. Body: { enabled: boolean }
  app.put("/api/league/:leagueId/contract-moves/live", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const { leagueId } = req.params;
      const liveAt = await setContractMovesLive(leagueId, req.body?.enabled === true);
      res.json({ live: liveAt != null, liveAt });
    } catch (error: any) {
      console.error("Error switching contract moves:", error);
      res.status(500).json({ error: "Failed to change the setting" });
    }
  });

  app.post("/api/league/:leagueId/contract-moves/:id/approve", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const { leagueId, id } = req.params;
      const row = await storage.getContractMoveById(leagueId, id);
      if (!row) return res.status(404).json({ error: "Move not found" });
      if (row.status !== "proposed") return res.status(409).json({ error: `This move is already ${row.status}.` });
      const outcome = await applyContractMove(leagueId, row, actorId(actor));
      if (!outcome.ok) return res.status(409).json({ error: outcome.error ?? "Could not apply this move" });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error approving contract move:", error);
      res.status(500).json({ error: "Failed to approve the move" });
    }
  });

  // Approve every proposed move, oldest first (so a trade is applied before the drop that followed it).
  app.post("/api/league/:leagueId/contract-moves/approve-all", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const { leagueId } = req.params;
      const proposed = (await storage.getContractMoves(leagueId, ["proposed"])).sort((a, b) => Number(a.txAt) - Number(b.txAt));
      let applied = 0;
      const failed: string[] = [];
      for (const row of proposed) {
        const outcome = await applyContractMove(leagueId, row, actorId(actor));
        if (outcome.ok) applied++;
        else failed.push(`${row.playerName}: ${outcome.error}`);
      }
      res.json({ applied, failed });
    } catch (error: any) {
      console.error("Error approving all contract moves:", error);
      res.status(500).json({ error: "Failed to approve the moves" });
    }
  });

  app.post("/api/league/:leagueId/contract-moves/:id/reject", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const ok = await rejectContractMove(req.params.leagueId, req.params.id, actorId(actor));
      if (!ok) return res.status(409).json({ error: "This move is not waiting for a decision." });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error rejecting contract move:", error);
      res.status(500).json({ error: "Failed to reject the move" });
    }
  });

  // The commissioner marks an over-the-cap flag as dealt with.
  app.post("/api/league/:leagueId/contract-moves/:id/resolve-flag", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const ok = await resolveContractMoveFlag(req.params.leagueId, req.params.id, actorId(actor));
      if (!ok) return res.status(409).json({ error: "This flag is not open." });
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Error resolving flag:", error);
      res.status(500).json({ error: "Failed to resolve the flag" });
    }
  });
}
