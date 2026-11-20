// Free agency bids (a team's own bids) and dead cap entries.
import type { Express } from "express";
import { storage } from "../storage";
import {
  dbErrorMessage,
} from "./shared";
import { requireCommissioner } from "../security/guards";

export function registerFreeAgencyRoutes(app: Express): void {

  // Get player bids for a specific team (privacy: only returns bids for the requesting team)
  app.get("/api/league/:leagueId/bids/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const bids = await storage.getPlayerBidsByRoster(leagueId, parseInt(rosterId));
      res.json(bids);
    } catch (error) {
      console.error("Error fetching bids:", error);
      res.status(500).json({ error: "Failed to fetch bids" });
    }
  });

  // Delete a player bid (privacy: only allows deleting if rosterId matches)
  app.delete("/api/league/:leagueId/bids/:bidId/:rosterId", async (req, res) => {
    try {
      const { bidId, rosterId } = req.params;
      await storage.deletePlayerBid(bidId, parseInt(rosterId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting bid:", error);
      res.status(500).json({ error: "Failed to delete bid" });
    }
  });

  app.get("/api/leagues/:leagueId/dead-cap", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { syncSleeperContractMoves } = await import("../deadCap");
      await syncSleeperContractMoves(leagueId);
      const entries = await storage.getDeadCapEntriesByLeague(leagueId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching dead cap entries:", error);
      res.status(500).json({ error: "Failed to fetch dead cap entries", message: dbErrorMessage(error) });
    }
  });

  app.post("/api/leagues/:leagueId/dead-cap", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { leagueId } = req.params;
      const data = req.body;
      
      const entry = await storage.createDeadCapEntry({
        leagueId,
        rosterId: data.rosterId,
        playerId: data.playerId,
        playerName: data.playerName,
        playerPosition: data.playerPosition,
        reason: data.reason,
        deadCapSalaries: data.deadCapSalaries || "{}",
      });
      
      res.json(entry);
    } catch (error) {
      console.error("Error creating dead cap entry:", error);
      res.status(500).json({ error: "Failed to create dead cap entry" });
    }
  });

  app.delete("/api/leagues/:leagueId/dead-cap/:entryId", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { entryId } = req.params;
      await storage.deleteDeadCapEntry(entryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting dead cap entry:", error);
      res.status(500).json({ error: "Failed to delete dead cap entry" });
    }
  });

}
