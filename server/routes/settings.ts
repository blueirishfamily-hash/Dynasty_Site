// League settings (key-value).
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import {
  dbErrorMessage,
} from "./shared";
import { isCommissioner } from "../middleware/commissioner";

export function registerSettingsRoutes(app: Express): void {
  // IMPORTANT: Specific routes like /settings/dead-cap-enabled MUST be defined BEFORE
  // generic wildcard routes like /settings/:settingKey. Express matches routes in order,
  // so wildcards will catch specific paths if they come first. Do not reorganize these
  // routes without understanding this constraint.
  
  // Get dead cap enabled setting (MUST be before generic /settings/:settingKey route)
  app.get("/api/league/:leagueId/settings/dead-cap-enabled", async (req, res) => {
    try {
      const { leagueId } = req.params;
      // Off until the commissioner turns it on. enabledAt: only drops after this time create dead cap.
      const { getDeadCapSetting } = await import("../deadCap");
      res.json(await getDeadCapSetting(leagueId));
    } catch (error) {
      console.error("Error fetching dead cap enabled setting:", error);
      res.status(500).json({ error: "Failed to fetch dead cap enabled setting", message: dbErrorMessage(error) });
    }
  });

  // Set dead cap enabled setting (commissioner only) (MUST be before generic /settings/:settingKey route)
  app.put("/api/league/:leagueId/settings/dead-cap-enabled", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const userId = req.query.userId as string;
      const { enabled } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Enabled must be a boolean" });
      }

      // Check if user is commissioner
      const isComm = await isCommissioner(userId, leagueId);
      
      if (!isComm) {
        return res.status(403).json({ error: "Unauthorized: Only commissioners can change this setting" });
      }
      
      const { setDeadCapEnabled } = await import("../deadCap");
      res.json(await setDeadCapEnabled(leagueId, enabled));
    } catch (error) {
      console.error("Error setting dead cap enabled setting:", error);
      res.status(500).json({ error: "Failed to set dead cap enabled setting" });
    }
  });

  // Get league setting (generic - must come AFTER specific routes like dead-cap-enabled)
  app.get("/api/league/:leagueId/settings/:settingKey", async (req, res) => {
    try {
      const { leagueId, settingKey } = req.params;
      const value = await storage.getLeagueSetting(leagueId, settingKey);
      res.json({ value: value || null });
    } catch (error) {
      console.error("Error fetching league setting:", error);
      res.status(500).json({ error: "Failed to fetch league setting" });
    }
  });

  // Set league setting (commissioner only - verified on client) (generic - must come AFTER specific routes)
  app.post("/api/league/:leagueId/settings/:settingKey", async (req, res) => {
    try {
      const { leagueId, settingKey } = req.params;
      const { value } = req.body;
      
      if (typeof value !== "string") {
        return res.status(400).json({ error: "Value must be a string" });
      }
      
      const setting = await storage.setLeagueSetting(leagueId, settingKey, value);
      res.json(setting);
    } catch (error) {
      console.error("Error setting league setting:", error);
      res.status(500).json({ error: "Failed to set league setting" });
    }
  });
}
