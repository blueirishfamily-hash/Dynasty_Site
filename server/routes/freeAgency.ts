// Free agency bids, preferred free agents, favorites, dead cap and contract drafts.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { getLeague, getAllPlayers, type SleeperPlayer } from "../sleeper";
import type { PlayerBid } from "../../shared/schema";
import {
  dbErrorMessage,
} from "./shared";
import { requireCommissioner } from "../security/guards";

export function registerFreeAgencyRoutes(app: Express): void {
  // ==================== PLAYER BIDS ====================
  
  // Get all bids (for showing results when bidding is closed)
  // NOTE: This route MUST be defined before /bids/:rosterId to prevent "all" being matched as a rosterId
  // This endpoint accesses the same playerBidsTable where bids are stored when created
  app.get("/api/league/:leagueId/bids/all", async (req, res) => {
    try {
      const { leagueId } = req.params;
      console.log(`[Get All Bids] Request received for league ${leagueId}`);
      console.log(`[Get All Bids] Accessing playerBidsTable (same table used by createPlayerBid)`);
      
      const league = await getLeague(leagueId);
      if (!league) {
        console.log(`[Get All Bids] League ${leagueId} not found`);
        return res.status(404).json({ error: "League not found" });
      }
      
      // Use getAllPlayerBids which queries from the same playerBidsTable as createPlayerBid
      const bids = await storage.getAllPlayerBids(leagueId);
      
      console.log(`[Get All Bids] Found ${bids.length} total bids from playerBidsTable for league ${leagueId}`);
      
      // Log sample bid structure for debugging
      if (bids.length > 0) {
        console.log(`[Get All Bids] Sample bid structure:`, {
          id: bids[0].id,
          playerId: bids[0].playerId,
          playerName: bids[0].playerName,
          status: bids[0].status,
          bidAmount: bids[0].bidAmount,
          contractYears: bids[0].contractYears,
          rosterId: bids[0].rosterId,
        });
      }
      
      // Filter to only active bids (in case there are cancelled/inactive bids)
      const activeBids = bids.filter(bid => bid.status === "active" || !bid.status);
      
      console.log(`[Get All Bids] Found ${activeBids.length} active bids (filtered from ${bids.length} total)`);
      
      // Log status breakdown for debugging
      const statusCounts: Record<string, number> = {};
      bids.forEach(bid => {
        const status = bid.status || "null";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      console.log(`[Get All Bids] Status breakdown:`, statusCounts);
      
      // Group by player and sort by total value
      const bidsByPlayer: Record<string, PlayerBid[]> = {};
      activeBids.forEach(bid => {
        if (!bidsByPlayer[bid.playerId]) {
          bidsByPlayer[bid.playerId] = [];
        }
        bidsByPlayer[bid.playerId].push(bid);
      });
      
      console.log(`[Get All Bids] Grouped into ${Object.keys(bidsByPlayer).length} players`);

      // Sort each player's bids by total value, with tiebreaker by per-year value
      Object.keys(bidsByPlayer).forEach(playerId => {
        bidsByPlayer[playerId].sort((a, b) => {
          const totalA = a.bidAmount * a.contractYears;
          const totalB = b.bidAmount * b.contractYears;
          // Primary sort: total value (descending)
          if (totalA !== totalB) {
            return totalB - totalA;
          }
          // Tiebreaker: per-year value (descending) - higher per-year wins
          return b.bidAmount - a.bidAmount;
        });
      });

      console.log(`[Get All Bids] Returning ${Object.keys(bidsByPlayer).length} players with bids from playerBidsTable`);
      res.json(bidsByPlayer);
    } catch (error) {
      console.error("[Get All Bids] Error fetching all bids:", error);
      res.status(500).json({ error: "Failed to fetch all bids" });
    }
  });

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

  // Create a new player bid
  app.post("/api/league/:leagueId/bids", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, playerPosition, playerTeam, bidAmount, maxBid, contractYears, isRookieContract, notes } = req.body;
      
      if (!rosterId || !playerId || !playerName || !bidAmount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const bid = await storage.createPlayerBid({
        leagueId,
        rosterId,
        playerId,
        playerName,
        playerPosition: playerPosition || "N/A",
        playerTeam: playerTeam || null,
        bidAmount,
        maxBid: maxBid || null,
        contractYears: contractYears || 1,
        isRookieContract: isRookieContract || 0,
        notes: notes || null,
      } as any);

      res.json(bid);
    } catch (error) {
      console.error("Error creating bid:", error);
      res.status(500).json({ error: "Failed to create bid" });
    }
  });

  // Update a player bid (privacy: only allows updating if rosterId matches)
  app.patch("/api/league/:leagueId/bids/:bidId", async (req, res) => {
    try {
      const { bidId } = req.params;
      const { rosterId, ...updates } = req.body;
      
      if (!rosterId) {
        return res.status(400).json({ error: "Roster ID required" });
      }

      const bid = await storage.updatePlayerBid(bidId, rosterId, updates);
      
      if (!bid) {
        return res.status(404).json({ error: "Bid not found or unauthorized" });
      }

      res.json(bid);
    } catch (error) {
      console.error("Error updating bid:", error);
      res.status(500).json({ error: "Failed to update bid" });
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

  // Get bidding status
  app.get("/api/league/:leagueId/bidding-status", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const status = await storage.getLeagueSetting(leagueId, "player_bidding_open");
      // Default to "true" (open) if not set
      const isOpen = status !== "false";
      res.json({ isOpen });
    } catch (error) {
      console.error("Error fetching bidding status:", error);
      res.status(500).json({ error: "Failed to fetch bidding status" });
    }
  });

  // Update bidding status (commissioner only)
  app.post("/api/league/:leagueId/bidding-status", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { isOpen } = req.body;
      const league = await getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      if (!(await requireCommissioner(req, res))) return;

      await storage.setLeagueSetting(leagueId, "player_bidding_open", isOpen ? "true" : "false");
      res.json({ isOpen });
    } catch (error) {
      console.error("Error updating bidding status:", error);
      res.status(500).json({ error: "Failed to update bidding status" });
    }
  });

  // Get preferred free agents (trending + expiring not extended); visibility controlled by commissioner
  app.get("/api/league/:leagueId/preferred-free-agents", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const visibleSetting = await storage.getLeagueSetting(leagueId, "preferred_free_agents_visible");
      if (visibleSetting === "false") {
        return res.json({ visible: false, players: [] });
      }

      const skillPositions = new Set(["QB", "RB", "WR", "TE", "K"]);
      const trendingPlayerIds: string[] = [];
      let trendingCountByPlayer: Record<string, number> = {};

      try {
        const trendingRes = await fetch(
          "https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=30"
        );
        if (trendingRes.ok) {
          const trending = await trendingRes.json();
          if (Array.isArray(trending)) {
            for (const item of trending) {
              const pid = item?.player_id ?? item?.playerId;
              if (pid) {
                trendingPlayerIds.push(String(pid));
                if (typeof item?.count === "number") {
                  trendingCountByPlayer[String(pid)] = item.count;
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("Sleeper trending fetch failed:", e);
      }

      const expiringPlayerIds: string[] = [];
      const migration = await storage.getMigrationByNewLeagueId(leagueId);
      if (migration) {
        const oldLeagueId = migration.oldLeagueId;
        const oldSeason = parseInt(migration.oldSeason, 10);
        if (!Number.isNaN(oldSeason)) {
          const contracts = await storage.getPlayerContracts(oldLeagueId);
          for (const contract of contracts) {
            if ((contract as any).extensionApplied === 1) continue;
            let salaries: Record<string, number> = {};
            try {
              const raw = (contract as any).salaries;
              salaries = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
            } catch {
              continue;
            }
            const entries = Object.entries(salaries)
              .map(([y, v]) => ({ year: parseInt(y, 10), value: Number(v) }))
              .filter((e) => !Number.isNaN(e.year) && e.value > 0);
            const lastPaidYear = entries.length ? Math.max(...entries.map((e) => e.year)) : 0;
            const salaryThatYear = lastPaidYear ? Number(salaries[String(lastPaidYear)]) || 0 : 0;
            if (lastPaidYear === oldSeason && salaryThatYear > 0) {
              expiringPlayerIds.push(contract.playerId);
            }
          }
        }
      }

      const mergedIds = new Set<string>();
      const order: string[] = [];
      for (const id of trendingPlayerIds) {
        if (!mergedIds.has(id)) {
          mergedIds.add(id);
          order.push(id);
        }
      }
      for (const id of expiringPlayerIds) {
        if (!mergedIds.has(id)) {
          mergedIds.add(id);
          order.push(id);
        }
      }

      const playersMap = await getAllPlayers().catch(() => ({} as Record<string, SleeperPlayer>));
      const players: Array<{ id: string; name: string; position: string; team: string | null; source: string; trendingCount?: number }> = [];
      for (const playerId of order) {
        const p = playersMap[playerId];
        if (!p) {
          players.push({
            id: playerId,
            name: `Unknown (${playerId})`,
            position: "NA",
            team: null,
            source: trendingPlayerIds.includes(playerId) ? "trending" : "expiring",
            trendingCount: trendingCountByPlayer[playerId],
          });
          continue;
        }
        const position = p.position || "NA";
        if (!skillPositions.has(position)) continue;
        const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
        players.push({
          id: playerId,
          name,
          position,
          team: p.team || null,
          source: trendingPlayerIds.includes(playerId) ? "trending" : "expiring",
          trendingCount: trendingCountByPlayer[playerId],
        });
      }

      res.json({ visible: true, players });
    } catch (error) {
      console.error("Error fetching preferred free agents:", error);
      res.status(500).json({ error: "Failed to fetch preferred free agents" });
    }
  });

  // Set preferred free agents section visibility (commissioner only)
  app.post("/api/league/:leagueId/preferred-free-agents-visibility", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId, visible } = req.body;
      if (!(await requireCommissioner(req, res))) return;
      await storage.setLeagueSetting(leagueId, "preferred_free_agents_visible", visible ? "true" : "false");
      res.json({ visible: !!visible });
    } catch (error) {
      console.error("Error setting preferred free agents visibility:", error);
      res.status(500).json({ error: "Failed to set visibility" });
    }
  });

  // Get favorite expiring players for a team
  app.get("/api/league/:leagueId/favorites/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const favorites = await storage.getFavoriteExpiringPlayers(leagueId, parseInt(rosterId));
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorite expiring players:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  // Add a favorite expiring player
  app.post("/api/league/:leagueId/favorites", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId } = req.body;

      if (!rosterId || !playerId) {
        return res.status(400).json({ error: "Missing required fields: rosterId, playerId" });
      }

      const favorite = await storage.addFavoriteExpiringPlayer({
        leagueId,
        rosterId,
        playerId,
      });
      res.json(favorite);
    } catch (error) {
      console.error("Error adding favorite expiring player:", error);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  // Remove a favorite expiring player
  app.delete("/api/league/:leagueId/favorites/:playerId/:rosterId", async (req, res) => {
    try {
      const { leagueId, playerId, rosterId } = req.params;
      await storage.removeFavoriteExpiringPlayer(leagueId, parseInt(rosterId), playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing favorite expiring player:", error);
      res.status(500).json({ error: "Failed to remove favorite" });
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

  app.post("/api/leagues/:leagueId/process-cut-trade", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, playerPosition, reason, contract } = req.body;
      
      const deadCapPercentages = [0.5, 0.25, 0.1, 0];
      const contractSalaries: Record<string, number> = contract?.salaries || {};
      const years = Object.keys(contractSalaries)
        .map(Number)
        .filter(year => !isNaN(year))
        .sort((a, b) => a - b);

      const deadCapAmounts: Record<string, number> = {};
      
      years.forEach((year, index) => {
        const salary = Number(contractSalaries[String(year)] || 0);
        for (let i = index; i < Math.min(index + deadCapPercentages.length, years.length); i++) {
          const dcPercent = deadCapPercentages[i - index] || 0;
          const dcYear = years[i];
          deadCapAmounts[String(dcYear)] = (deadCapAmounts[String(dcYear)] || 0) + Math.ceil(salary * dcPercent);
        }
      });
      
      const entry = await storage.createDeadCapEntry({
        leagueId,
        rosterId,
        playerId,
        playerName,
        playerPosition,
        reason,
        deadCapSalaries: JSON.stringify(deadCapAmounts),
      });
      
      await storage.deletePlayerContract(leagueId, rosterId, playerId);
      
      res.json({ deadCapEntry: entry });
    } catch (error) {
      console.error("Error processing cut/trade:", error);
      res.status(500).json({ error: "Failed to process cut/trade" });
    }
  });

  // ==================== SAVED CONTRACT DRAFTS ====================
  // Get saved contract drafts for a team
  app.get("/api/league/:leagueId/contract-drafts/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      const drafts = await storage.getSavedContractDrafts(leagueId, parseInt(rosterId));
      res.json(drafts);
    } catch (error) {
      console.error("Error fetching contract drafts:", error);
      res.status(500).json({ error: "Failed to fetch contract drafts", message: dbErrorMessage(error) });
    }
  });

  // Save contract drafts (bulk upsert)
  app.post("/api/league/:leagueId/contract-drafts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, drafts } = req.body;
      
      if (!Array.isArray(drafts)) {
        return res.status(400).json({ error: "Drafts must be an array" });
      }

      // Clear existing drafts first
      await storage.deleteAllSavedContractDrafts(leagueId, rosterId);

      const results = [];
      for (const draft of drafts) {
        const salariesPayload = (() => {
          if (draft.salaries) {
            return typeof draft.salaries === "string" ? draft.salaries : JSON.stringify(draft.salaries);
          }
          const legacy: Record<string, number> = {};
          if (draft.salary2025) legacy["2025"] = draft.salary2025;
          if (draft.salary2026) legacy["2026"] = draft.salary2026;
          if (draft.salary2027) legacy["2027"] = draft.salary2027;
          if (draft.salary2028) legacy["2028"] = draft.salary2028;
          if (draft.salary2029) legacy["2029"] = draft.salary2029;
          return JSON.stringify(legacy);
        })();

        const result = await storage.upsertSavedContractDraft({
          leagueId,
          rosterId,
          playerId: draft.playerId,
          playerName: draft.playerName,
          playerPosition: draft.playerPosition,
          salaries: salariesPayload,
          franchiseTagApplied: draft.franchiseTagApplied || 0,
        });
        results.push(result);
      }
      
      res.json({ saved: results.length, drafts: results });
    } catch (error) {
      console.error("Error saving contract drafts:", error);
      res.status(500).json({ error: "Failed to save contract drafts", message: dbErrorMessage(error) });
    }
  });

  // Delete all saved contract drafts for a team
  app.delete("/api/league/:leagueId/contract-drafts/:rosterId", async (req, res) => {
    try {
      const { leagueId, rosterId } = req.params;
      await storage.deleteAllSavedContractDrafts(leagueId, parseInt(rosterId));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contract drafts:", error);
      res.status(500).json({ error: "Failed to delete contract drafts" });
    }
  });
}
