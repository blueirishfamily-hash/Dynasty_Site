// Rule suggestions and votes, voting windows, award voting and nominations, suggestions.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { getLeague } from "../sleeper";
import { leagueActor, requireCommissioner, requireCommissionerFor } from "../security/guards";
import { rulesForSleeperLeague } from "../leagueRules";

/** Points for 1st, 2nd and 3rd on a ballot under the league's rules (ATL: 3/2/1). */
async function ballotPoints(leagueId: string): Promise<[number, number, number]> {
  const pts = (await rulesForSleeperLeague(leagueId)).awards.ballotPoints;
  return [pts[0] ?? 0, pts[1] ?? 0, pts[2] ?? 0];
}

export function registerGovernanceRoutes(app: Express): void {
  // Rule Suggestions API - Health Check
  app.get("/api/league/:leagueId/rule-suggestions/health", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      console.log("[API] GET /api/league/:leagueId/rule-suggestions/health - Checking database health for league:", leagueId);
      
      if (!leagueId) {
        return res.status(400).json({ 
          healthy: false,
          error: "League ID is required" 
        });
      }

      // Test database connection and table existence
      try {
        // Try a simple query to check if table exists
        const testQuery = await storage.getRuleSuggestions(leagueId);
        return res.json({
          healthy: true,
          tableExists: true,
          connectionStatus: "connected",
          message: "Database connection and table are healthy"
        });
      } catch (dbError: any) {
        const errorMessage = dbError.message || "Unknown database error";
        const tableMissing = errorMessage.includes("does not exist") || 
                            errorMessage.includes("relation") ||
                            errorMessage.includes("migrations");
        const connectionError = errorMessage.includes("connection") || 
                              errorMessage.includes("timeout");
        
        return res.status(500).json({
          healthy: false,
          tableExists: !tableMissing,
          connectionStatus: connectionError ? "disconnected" : "connected",
          error: errorMessage,
          suggestion: tableMissing 
            ? "Run 'npm run db:push' to create the required tables."
            : connectionError
            ? "Check DATABASE_URL environment variable."
            : "Check database configuration."
        });
      }
    } catch (error: any) {
      console.error("[API] Error in health check:", error);
      return res.status(500).json({
        healthy: false,
        error: error.message || "Health check failed"
      });
    }
  });

  // Rule Suggestions API
  app.get("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      if (!leagueId) {
        return res.status(400).json({ error: "League ID is required" });
      }

      let currentSeason: string | null = null;
      try {
        const league = await getLeague(leagueId);
        currentSeason = league?.season ?? null;
      } catch {
        // league may not exist; still return suggestions
      }
      const suggestions = await storage.getRuleSuggestions(leagueId, currentSeason);

      // Get voting status for each rule (only if there are suggestions)
      const suggestionsWithVoting = suggestions.length > 0
        ? await Promise.all(
            suggestions.map(async (suggestion) => {
              const votingEnabled = await storage.getLeagueSetting(
                leagueId,
                `rule_voting_enabled_${suggestion.id}`
              );
              return {
                ...suggestion,
                votingEnabled: votingEnabled === "true",
              };
            })
          )
        : [];

      const votingMasterEnabled = (await storage.getLeagueSetting(leagueId, "rule_voting_master")) === "true";
      const closesAtRaw = await storage.getLeagueSetting(leagueId, "rule_voting_closes_at");
      const votingClosesAt =
        closesAtRaw != null && closesAtRaw !== ""
          ? parseInt(closesAtRaw, 10)
          : null;
      const votingClosesAtValid = typeof votingClosesAt === "number" && !isNaN(votingClosesAt) ? votingClosesAt : null;
      res.json({ suggestions: suggestionsWithVoting, votingMasterEnabled, votingClosesAt: votingClosesAtValid });
    } catch (error: any) {
      console.error("Error fetching rule suggestions:", error);
      const errorMessage = error?.message || "Unknown error";
      const errorCode = error?.code;
      
      // Check if table doesn't exist (PostgreSQL error code 42P01)
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("rule_suggestions")) {
        return res.status(500).json({ 
          error: "Database table does not exist. Please run 'npm run db:push' to create the required tables.",
          details: errorMessage,
          code: errorCode
        });
      }
      
      res.status(500).json({ 
        error: "Failed to fetch rule suggestions",
        details: errorMessage,
        code: errorCode
      });
    }
  });

  app.get("/api/league/:leagueId/rule-voting-master", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      if (!leagueId) return res.status(400).json({ error: "League ID is required" });
      const votingMasterEnabled = (await storage.getLeagueSetting(leagueId, "rule_voting_master")) === "true";
      res.json({ votingMasterEnabled });
    } catch (error) {
      console.error("Error fetching rule voting master:", error);
      res.status(500).json({ error: "Failed to fetch voting state" });
    }
  });

  app.post("/api/league/:leagueId/rule-voting-master", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { enabled } = req.body;
      if (!(await requireCommissioner(req, res))) return;
      await storage.setLeagueSetting(leagueId, "rule_voting_master", enabled ? "true" : "false");
      res.json({ votingMasterEnabled: !!enabled });
    } catch (error) {
      console.error("Error setting rule voting master:", error);
      res.status(500).json({ error: "Failed to set voting state" });
    }
  });

  app.post("/api/league/:leagueId/rule-voting-closes-at", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { closesAt } = req.body;
      if (!(await requireCommissioner(req, res))) return;
      if (closesAt == null) {
        await storage.setLeagueSetting(leagueId, "rule_voting_closes_at", "");
      } else {
        const ts = typeof closesAt === "number" ? closesAt : parseInt(String(closesAt), 10);
        if (isNaN(ts)) return res.status(400).json({ error: "closesAt must be a valid timestamp (ms)." });
        await storage.setLeagueSetting(leagueId, "rule_voting_closes_at", String(ts));
      }
      const raw = await storage.getLeagueSetting(leagueId, "rule_voting_closes_at");
      const votingClosesAt =
        raw != null && raw !== "" ? (parseInt(raw, 10) || null) : null;
      res.json({ votingClosesAt });
    } catch (error) {
      console.error("Error setting rule voting closes at:", error);
      res.status(500).json({ error: "Failed to set voting close time" });
    }
  });

  // Awards voting window (separate from rule voting).
  // Phases: "nominate" (switch off: nominations open, ballots closed) -> "open" (ballots open until the
  // close time, nominations closed) -> "closed" (close time passed).
  async function getAwardVotingState(leagueId: string) {
    const masterEnabled = (await storage.getLeagueSetting(leagueId, "award_voting_master")) === "true";
    const raw = await storage.getLeagueSetting(leagueId, "award_voting_closes_at");
    const closesAt = raw != null && raw !== "" ? (parseInt(raw, 10) || null) : null;
    const phase: "nominate" | "open" | "closed" = !masterEnabled
      ? "nominate"
      : closesAt == null || Date.now() < closesAt
        ? "open"
        : "closed";
    return { masterEnabled, closesAt, phase };
  }

  app.get("/api/league/:leagueId/award-voting", async (req, res) => {
    try {
      res.json(await getAwardVotingState(req.params.leagueId));
    } catch (error) {
      console.error("Error fetching award voting state:", error);
      res.status(500).json({ error: "Failed to fetch awards voting state" });
    }
  });

  app.post("/api/league/:leagueId/award-voting", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { enabled, closesAt } = req.body;
      if (!(await requireCommissioner(req, res))) return;
      if (enabled !== undefined) {
        await storage.setLeagueSetting(leagueId, "award_voting_master", enabled ? "true" : "false");
      }
      if (closesAt !== undefined) {
        if (closesAt === null) {
          await storage.setLeagueSetting(leagueId, "award_voting_closes_at", "");
        } else {
          const ts = typeof closesAt === "number" ? closesAt : parseInt(String(closesAt), 10);
          if (isNaN(ts)) return res.status(400).json({ error: "closesAt must be a valid timestamp (ms)." });
          await storage.setLeagueSetting(leagueId, "award_voting_closes_at", String(ts));
        }
      }
      res.json(await getAwardVotingState(leagueId));
    } catch (error) {
      console.error("Error setting award voting state:", error);
      res.status(500).json({ error: "Failed to update awards voting" });
    }
  });

  app.post("/api/league/:leagueId/rule-suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { authorId, authorName, rosterId, title, description, voteType, options } = req.body;
      
      if (!leagueId) {
        return res.status(400).json({ error: "League ID is required" });
      }
      if (!authorId) {
        return res.status(400).json({ error: "Author ID is required" });
      }
      if (!authorName || authorName.trim() === "") {
        return res.status(400).json({ error: "Author name is required" });
      }
      if (rosterId === undefined || rosterId === null) {
        return res.status(400).json({ error: "Roster ID is required. Please select your team first." });
      }
      if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Title is required" });
      }
      if (!description || description.trim() === "") {
        return res.status(400).json({ error: "Description is required" });
      }
      const resolvedVoteType = voteType === "multi_choice" ? "multi_choice" : "binary";
      if (resolvedVoteType === "multi_choice") {
        if (!Array.isArray(options) || options.length < 3) {
          return res.status(400).json({ error: "Multi-choice rules require at least 3 options." });
        }
        const validOptions = options.filter((o: unknown) => typeof o === "string" && o.trim() !== "");
        if (validOptions.length < 3) {
          return res.status(400).json({ error: "Multi-choice rules require at least 3 non-empty options." });
        }
      }

      const parsedRosterId = parseInt(String(rosterId), 10);
      if (isNaN(parsedRosterId) || parsedRosterId <= 0) {
        return res.status(400).json({ error: "Invalid roster ID. Please select your team again." });
      }

      const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
      // While voting is open only a commissioner (unlocked with their PIN) can add suggestions.
      const authorIsCommissioner = !!(await leagueActor(req, req.league));
      if (votingMaster === "true" && !authorIsCommissioner) {
        return res.status(403).json({
          error: "Suggestions are closed while voting is open. Only the commissioner can suggest during this time.",
        });
      }

      let season: string | undefined;
      try {
        const league = await getLeague(leagueId);
        season = league?.season;
      } catch {
        // leave season undefined for legacy behavior
      }

      const suggestion = await storage.createRuleSuggestion({
        leagueId,
        authorId,
        authorName: authorName.trim(),
        rosterId: parsedRosterId,
        title: title.trim(),
        description: description.trim(),
        ...(season != null && { season }),
        ...(resolvedVoteType === "multi_choice" && { voteType: "multi_choice", options: options.map((o: string) => String(o).trim()) }),
      });
      
      // Default voting to enabled for new rules
      await storage.setLeagueSetting(
        leagueId,
        `rule_voting_enabled_${suggestion.id}`,
        "true"
      );
      
      res.json({ ...suggestion, votingEnabled: true });
    } catch (error) {
      console.error("Error creating rule suggestion:", error);
      res.status(500).json({ error: "Failed to create rule suggestion" });
    }
  });

  // Update a rule suggestion (author or commissioner only)
  app.put("/api/league/:leagueId/rule-suggestions/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const { userId, title, description, voteType, options } = req.body;
      
      console.log("[API] PUT /api/league/:leagueId/rule-suggestions/:id - Updating rule in rule_suggestions table. ID:", id);
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      if (title === undefined && description === undefined && voteType === undefined && options === undefined) {
        return res.status(400).json({ error: "Must provide title, description, voteType, or options to update" });
      }
      if (voteType === "multi_choice" && (!Array.isArray(options) || options.length < 3)) {
        return res.status(400).json({ error: "Multi-choice rules require at least 3 options." });
      }

      // Get the rule suggestion to check authorization
      const rule = await storage.getRuleSuggestionById(id);
      if (!rule) {
        console.log("[API] Rule suggestion not found in rule_suggestions table. ID:", id);
        return res.status(404).json({ error: "Rule suggestion not found" });
      }

      if (rule.leagueId !== leagueId) {
        return res.status(400).json({ error: "Rule suggestion does not belong to this league" });
      }

      // Check authorization: user must be the author or a commissioner
      // The author can edit their own suggestion; anyone else needs the commissioner PIN.
      const isAuthor = rule.authorId === userId;
      if (!isAuthor && !(await requireCommissioner(req, res))) return;

      // Update the rule suggestion
      const updateData: { title?: string; description?: string; voteType?: "binary" | "multi_choice"; options?: string[] | null } = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (voteType !== undefined) updateData.voteType = voteType;
      if (options !== undefined) updateData.options = Array.isArray(options) ? options.map((o: string) => String(o).trim()) : null;

      const updated = await storage.updateRuleSuggestion(id, updateData);
      if (!updated) {
        return res.status(500).json({ error: "Failed to update rule suggestion" });
      }

      console.log("[API] Successfully updated rule in rule_suggestions table. ID:", id);

      // Get voting status
      const votingEnabled = await storage.getLeagueSetting(
        leagueId,
        `rule_voting_enabled_${id}`
      );

      res.json({ ...updated, votingEnabled: votingEnabled === "true" });
    } catch (error: any) {
      console.error("[API] Error updating rule in rule_suggestions table:", error);
      const errorMessage = error.message || "Failed to update rule suggestion";
      if (errorMessage.includes("does not exist") || errorMessage.includes("migrations")) {
        return res.status(500).json({ 
          error: "Database table error. Please ensure rule_suggestions table exists.",
          details: errorMessage 
        });
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Delete a rule suggestion (author or commissioner only)
  app.delete("/api/league/:leagueId/rule-suggestions/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      const { userId } = req.body;
      
      console.log("[API] DELETE /api/league/:leagueId/rule-suggestions/:id - Deleting rule from rule_suggestions table. ID:", id);
      
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }

      // Get the rule suggestion to check authorization
      const rule = await storage.getRuleSuggestionById(id);
      if (!rule) {
        console.log("[API] Rule suggestion not found in rule_suggestions table. ID:", id);
        return res.status(404).json({ error: "Rule suggestion not found" });
      }

      if (rule.leagueId !== leagueId) {
        return res.status(400).json({ error: "Rule suggestion does not belong to this league" });
      }

      // Check authorization: user must be the author or a commissioner
      // The author can delete their own suggestion; anyone else needs the commissioner PIN.
      const isAuthor = rule.authorId === userId;
      if (!isAuthor && !(await requireCommissioner(req, res))) return;

      // Delete the rule suggestion (this will also delete associated votes)
      await storage.deleteRuleSuggestion(id);
      console.log("[API] Successfully deleted rule from rule_suggestions table. ID:", id);

      // Also delete the voting setting if it exists
      try {
        await storage.setLeagueSetting(
          leagueId,
          `rule_voting_enabled_${id}`,
          ""
        );
      } catch (e) {
        // Ignore errors deleting the setting
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[API] Error deleting rule from rule_suggestions table:", error);
      const errorMessage = error.message || "Failed to delete rule suggestion";
      if (errorMessage.includes("does not exist") || errorMessage.includes("migrations")) {
        return res.status(500).json({ 
          error: "Database table error. Please ensure rule_suggestions table exists.",
          details: errorMessage 
        });
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Suggestions API (general feedback to commissioner)
  app.get("/api/league/:leagueId/suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      if (!leagueId) return res.status(400).json({ error: "League ID is required" });
      if (!(await requireCommissioner(req, res))) return;
      const suggestions = await storage.getSuggestions(leagueId);
      res.json({ suggestions });
    } catch (error: any) {
      console.error("Error fetching suggestions:", error);
      res.status(500).json({ error: "Failed to fetch suggestions" });
    }
  });

  app.post("/api/league/:leagueId/suggestions", async (req, res) => {
    try {
      const leagueId = req.params.leagueId;
      const { authorId, authorName, content } = req.body;
      if (!leagueId) return res.status(400).json({ error: "League ID is required" });
      if (!authorId || !authorName) return res.status(400).json({ error: "Author ID and name are required" });
      if (!content || typeof content !== "string" || content.trim().length === 0) {
        return res.status(400).json({ error: "Content is required" });
      }
      const suggestion = await storage.createSuggestion({
        leagueId,
        authorId,
        authorName,
        content: content.trim(),
      });
      res.json(suggestion);
    } catch (error: any) {
      console.error("Error creating suggestion:", error);
      res.status(500).json({ error: "Failed to create suggestion" });
    }
  });

  app.delete("/api/league/:leagueId/suggestions/:id", async (req, res) => {
    try {
      const { leagueId, id } = req.params;
      if (!leagueId || !id) return res.status(400).json({ error: "League ID and suggestion ID are required" });
      if (!(await requireCommissioner(req, res))) return;
      await storage.deleteSuggestion(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting suggestion:", error);
      res.status(500).json({ error: "Failed to delete suggestion" });
    }
  });

  // Cast vote on a rule (1 vote per team per rule; binary or ranked for multi-choice)
  app.post("/api/rule-suggestions/:id/vote", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rule = await storage.getRuleSuggestionById(ruleId);
      if (!rule) {
        return res.status(404).json({ error: "Rule suggestion not found" });
      }
      const voteType = (rule as any).voteType ?? "binary";
      const options = (rule as any).options as string[] | null | undefined;
      const N = Array.isArray(options) ? options.length : 0;

      if (voteType === "multi_choice") {
        const { rosterId, voterName, leagueId, points } = req.body;
        if (!rosterId || !voterName || !leagueId || !Array.isArray(points)) {
          return res.status(400).json({ error: "Missing required fields: rosterId, voterName, leagueId, points" });
        }
        if (points.length !== N) {
          return res.status(400).json({ error: "Points array length must match number of options." });
        }
        const expected = new Set(Array.from({ length: N }, (_, i) => i + 1));
        const given = new Set(points.map((p: number) => Number(p)));
        const valid = expected.size === given.size && [...expected].every((v) => given.has(v));
        if (!valid) {
          return res.status(400).json({ error: "Points must be a permutation of 1 to N (one rank per option)." });
        }
        const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
        if (votingMaster !== "true") {
          return res.status(403).json({ error: "Voting is currently closed." });
        }
        const closesAtRaw = await storage.getLeagueSetting(leagueId, "rule_voting_closes_at");
        if (closesAtRaw != null && closesAtRaw !== "") {
          const closesAt = parseInt(closesAtRaw, 10);
          if (!isNaN(closesAt) && Date.now() >= closesAt) {
            return res.status(403).json({ error: "Voting has closed." });
          }
        }
        await storage.castRuleRankedVote(ruleId, parseInt(rosterId), voterName, points.map((p: number) => Number(p)));
        return res.json({ success: true });
      }

      const { rosterId, voterName, vote, leagueId } = req.body;
      if (!rosterId || !voterName || !vote || !leagueId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (vote !== "approve" && vote !== "reject") {
        return res.status(400).json({ error: "Invalid vote type" });
      }
      const votingMaster = await storage.getLeagueSetting(leagueId, "rule_voting_master");
      if (votingMaster !== "true") {
        return res.status(403).json({ error: "Voting is currently closed." });
      }
      const closesAtRaw = await storage.getLeagueSetting(leagueId, "rule_voting_closes_at");
      if (closesAtRaw != null && closesAtRaw !== "") {
        const closesAt = parseInt(closesAtRaw, 10);
        if (!isNaN(closesAt) && Date.now() >= closesAt) {
          return res.status(403).json({ error: "Voting has closed." });
        }
      }
      const ruleVote = await storage.castRuleVote({
        ruleId,
        rosterId: parseInt(rosterId),
        voterName,
        vote,
      });
      res.json(ruleVote);
    } catch (error) {
      console.error("Error voting on rule suggestion:", error);
      res.status(500).json({ error: "Failed to vote on rule suggestion" });
    }
  });

  // Get votes for a specific rule
  app.get("/api/rule-suggestions/:id/votes", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rule = await storage.getRuleSuggestionById(ruleId);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      const voteType = (rule as any).voteType ?? "binary";
      const votingMasterEnabled = (await storage.getLeagueSetting(rule.leagueId, "rule_voting_master")) === "true";
      const closesAtRaw = await storage.getLeagueSetting(rule.leagueId, "rule_voting_closes_at");
      const votingClosedByDeadline =
        closesAtRaw != null &&
        closesAtRaw !== "" &&
        !isNaN(parseInt(closesAtRaw, 10)) &&
        Date.now() >= parseInt(closesAtRaw, 10);
      const effectivelyClosed = !votingMasterEnabled || votingClosedByDeadline;
      if (!effectivelyClosed) {
        if (voteType === "multi_choice") {
          return res.json({ ranked: true, pointsByOption: [], firstPlaceVotesByOption: [], voterCount: 0 });
        }
        return res.json({ approveCount: 0, rejectCount: 0 });
      }
      if (voteType === "multi_choice") {
        const { pointsByOption, firstPlaceVotesByOption, voterCount } = await storage.getRuleRankedVotes(ruleId);
        return res.json({ ranked: true, pointsByOption, firstPlaceVotesByOption, voterCount });
      }
      const votes = await storage.getRuleVotes(ruleId);
      const approveCount = votes.filter(v => v.vote === "approve").length;
      const rejectCount = votes.filter(v => v.vote === "reject").length;
      res.json({ votes, approveCount, rejectCount });
    } catch (error) {
      console.error("Error fetching rule votes:", error);
      res.status(500).json({ error: "Failed to fetch rule votes" });
    }
  });

  // Get user's vote on a rule
  app.get("/api/rule-suggestions/:id/votes/:rosterId", async (req, res) => {
    try {
      const ruleId = req.params.id;
      const rosterId = parseInt(req.params.rosterId);
      const rule = await storage.getRuleSuggestionById(ruleId);
      const voteType = rule ? (rule as any).voteType ?? "binary" : "binary";
      if (voteType === "multi_choice") {
        const pointsByOption = await storage.getRuleRankedVoteByRoster(ruleId, rosterId);
        return res.json(pointsByOption != null ? { pointsByOption } : null);
      }
      const vote = await storage.getRuleVoteByRoster(ruleId, rosterId);
      res.json(vote || null);
    } catch (error) {
      console.error("Error fetching user vote:", error);
      res.status(500).json({ error: "Failed to fetch user vote" });
    }
  });

  // Toggle voting on/off for a rule (commissioner only)
  app.post("/api/rule-suggestions/:id/toggle-voting", async (req, res) => {
    try {
      const { leagueId, enabled } = req.body;
      if (!leagueId || typeof enabled !== "boolean") {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (!(await requireCommissionerFor(req, res, leagueId))) return;
      
      await storage.setLeagueSetting(
        leagueId,
        `rule_voting_enabled_${req.params.id}`,
        enabled ? "true" : "false"
      );
      res.json({ success: true, votingEnabled: enabled });
    } catch (error) {
      console.error("Error toggling voting:", error);
      res.status(500).json({ error: "Failed to toggle voting" });
    }
  });

  // Award Nominations API
  app.get("/api/league/:leagueId/awards/:season/:awardType", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      res.json(nominations);
    } catch (error) {
      console.error("Error fetching award nominations:", error);
      res.status(500).json({ error: "Failed to fetch award nominations" });
    }
  });

  // Create nomination (max 3 per team per award type)
  app.post("/api/league/:leagueId/awards/:season/:awardType/nominate", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { playerId, playerName, playerPosition, playerTeam, nominatedBy, nominatedByName, nominatedByRosterId } = req.body;
      
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      if (!playerId || !playerName || !nominatedBy || !nominatedByName || !nominatedByRosterId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if ((await getAwardVotingState(leagueId)).phase !== "nominate") {
        return res.status(403).json({ error: "Nominations are closed." });
      }

      // The league's nomination limit per team per award (ATL: 3)
      const limit = (await rulesForSleeperLeague(leagueId)).awards.nominationLimit;
      const currentCount = await storage.getNominationCountByRoster(leagueId, season, awardType, nominatedByRosterId);
      if (currentCount >= limit) {
        return res.status(400).json({ error: `Maximum ${limit} nominations per team per award` });
      }

      const nomination = await storage.createAwardNomination({
        leagueId,
        season,
        awardType,
        playerId,
        playerName,
        playerPosition: playerPosition || "",
        playerTeam: playerTeam || null,
        nominatedBy,
        nominatedByName,
        nominatedByRosterId,
      });
      res.json(nomination);
    } catch (error) {
      console.error("Error creating award nomination:", error);
      res.status(500).json({ error: "Failed to create award nomination" });
    }
  });

  // Get nomination count for a roster
  app.get("/api/league/:leagueId/awards/:season/:awardType/nominations/count/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, awardType, rosterId } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const count = await storage.getNominationCountByRoster(leagueId, season, awardType, parseInt(rosterId));
      const limit = (await rulesForSleeperLeague(leagueId)).awards.nominationLimit;
      res.json({ count, limit, remaining: Math.max(0, limit - count) });
    } catch (error) {
      console.error("Error fetching nomination count:", error);
      res.status(500).json({ error: "Failed to fetch nomination count" });
    }
  });

  // Submit ranked ballot (points per place come from the league's rules; ATL 3/2/1)
  app.post("/api/league/:leagueId/awards/:season/:awardType/ballot", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      const { rosterId, voterName, firstPlaceId, secondPlaceId, thirdPlaceId } = req.body;
      
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      if (!rosterId || !voterName || !firstPlaceId || !secondPlaceId || !thirdPlaceId) {
        return res.status(400).json({ error: "Missing required fields - must vote for 1st, 2nd, and 3rd place" });
      }

      if ((await getAwardVotingState(leagueId)).phase !== "open") {
        return res.status(403).json({ error: "Awards voting is not open." });
      }

      // Validate all three picks are different
      if (firstPlaceId === secondPlaceId || firstPlaceId === thirdPlaceId || secondPlaceId === thirdPlaceId) {
        return res.status(400).json({ error: "Cannot vote for the same player multiple times" });
      }

      // Validate all picks are valid nominations
      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      const nominationIds = new Set(nominations.map(n => n.id));
      if (!nominationIds.has(firstPlaceId) || !nominationIds.has(secondPlaceId) || !nominationIds.has(thirdPlaceId)) {
        return res.status(400).json({ error: "Invalid nomination ID" });
      }

      const ballot = await storage.upsertAwardBallot({
        leagueId,
        season,
        awardType,
        rosterId,
        voterName,
        firstPlaceId,
        secondPlaceId,
        thirdPlaceId,
      });
      res.json(ballot);
    } catch (error) {
      console.error("Error submitting ballot:", error);
      res.status(500).json({ error: "Failed to submit ballot" });
    }
  });

  // Get user's current ballot
  app.get("/api/league/:leagueId/awards/:season/:awardType/ballot/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, awardType, rosterId } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }
      const ballot = await storage.getAwardBallotByRoster(leagueId, season, awardType, parseInt(rosterId));
      res.json(ballot || null);
    } catch (error) {
      console.error("Error fetching ballot:", error);
      res.status(500).json({ error: "Failed to fetch ballot" });
    }
  });

  // Get award results with scores
  app.get("/api/league/:leagueId/awards/:season/:awardType/results", async (req, res) => {
    try {
      const { leagueId, season, awardType } = req.params;
      if (awardType !== "mvp" && awardType !== "roy" && awardType !== "gm") {
        return res.status(400).json({ error: "Invalid award type" });
      }

      const nominations = await storage.getAwardNominations(leagueId, season, awardType);
      const ballots = await storage.getAwardBallots(leagueId, season, awardType);
      const [p1, p2, p3] = await ballotPoints(leagueId);
      const awardRules = (await rulesForSleeperLeague(leagueId)).awards;

      // Calculate scores for each nomination
      const scores = new Map<string, number>();
      nominations.forEach(n => scores.set(n.id, 0));

      ballots.forEach(ballot => {
        const current1 = scores.get(ballot.firstPlaceId) || 0;
        const current2 = scores.get(ballot.secondPlaceId) || 0;
        const current3 = scores.get(ballot.thirdPlaceId) || 0;
        scores.set(ballot.firstPlaceId, current1 + p1);
        scores.set(ballot.secondPlaceId, current2 + p2);
        scores.set(ballot.thirdPlaceId, current3 + p3);
      });

      const results = nominations.map(n => ({
        ...n,
        score: scores.get(n.id) || 0,
        firstPlaceVotes: ballots.filter(b => b.firstPlaceId === n.id).length,
        secondPlaceVotes: ballots.filter(b => b.secondPlaceId === n.id).length,
        thirdPlaceVotes: ballots.filter(b => b.thirdPlaceId === n.id).length,
      })).sort((a, b) => b.score - a.score);

      res.json({ 
        results, 
        totalBallots: ballots.length,
        totalTeams: nominations.length > 0 ? awardRules.resultTeamCount : 0,
        ballotPoints: [p1, p2, p3],
      });
    } catch (error) {
      console.error("Error fetching award results:", error);
      res.status(500).json({ error: "Failed to fetch award results" });
    }
  });
}
