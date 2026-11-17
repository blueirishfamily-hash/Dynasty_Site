// Contracts: rookie contract sync, player contracts, extensions and franchise tags.
// Moved out of server/routes.ts unchanged.
import type { Express } from "express";
import { storage } from "../storage";
import { getLeague, getLeagueRosters, getLeagueUsers, getNFLState, getAllPlayers, type SleeperRoster } from "../sleeper";
import { parseContractsCsv, type ImportContext } from "../contractImport";
import { writeAudit } from "../security/store";
import {
  dbErrorMessage,
  fetchAllWeeklyStats,
  computeAdjustedPPGForPlayer,
} from "./shared";
import { auditActor, requireCommissioner } from "../security/guards";
import { rulesForSleeperLeague } from "../leagueRules";
import { extensionMultiplier, lengthLimit } from "../../shared/leagueRules";

export function registerContractsRoutes(app: Express): void {
  // Create (or fix) rookie contracts for everyone drafted in this season's rookie draft. Commissioner only.
  app.post("/api/league/:leagueId/rookie-contracts/sync", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!(await requireCommissioner(req, res))) return;
      const { syncRookieContracts } = await import("../rookieContracts");
      res.json(await syncRookieContracts(leagueId));
    } catch (error) {
      console.error("Error syncing rookie contracts:", error);
      res.status(500).json({ error: "Failed to sync rookie contracts" });
    }
  });

  // Get all player contracts for a league
  app.get("/api/league/:leagueId/contracts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      // Apply Sleeper moves first: drops since dead cap was turned on end contracts, in-season pickups get $1 deals.
      const { syncSleeperContractMoves } = await import("../deadCap");
      await syncSleeperContractMoves(leagueId);
      const contracts = await storage.getPlayerContracts(leagueId);
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ error: "Failed to fetch contracts", message: dbErrorMessage(error) });
    }
  });

  // Save player contracts (bulk upsert) - commissioner only
  app.post("/api/league/:leagueId/contracts", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { contracts, userId } = req.body;
      
      if (!Array.isArray(contracts)) {
        return res.status(400).json({ error: "Contracts must be an array" });
      }

      const league = await getLeague(leagueId).catch(() => null);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }
      if (!(await requireCommissioner(req, res))) return;

      // Get all existing contracts once to avoid repeated queries
      const existingContracts = await storage.getPlayerContracts(leagueId);

      const results = [];
      for (const contract of contracts) {
        // Check if this is a new roster (player moved teams) - if so, reset tracking flags
        const existingContractForPlayer = existingContracts.find(
          c => c.playerId === contract.playerId && c.leagueId === leagueId
        );
        
        // If player is moving to a new roster, reset both tracking flags
        const isNewRoster = existingContractForPlayer && existingContractForPlayer.rosterId !== contract.rosterId;
        
        // Check if franchise tag is being applied
        const isApplyingFranchiseTag = contract.franchiseTagUsed === 1;
        
        // If applying franchise tag, check if player has been franchise tagged before on this roster
        if (isApplyingFranchiseTag && !isNewRoster) {
          const currentContract = existingContracts.find(
            c => c.playerId === contract.playerId && c.rosterId === contract.rosterId
          );
          if (currentContract && (currentContract as any).hasBeenFranchiseTagged === 1) {
            return res.status(400).json({ 
              error: `Player has already been franchise tagged on this team. Must be extended or go to free agency first.`,
              playerId: contract.playerId
            });
          }
        }
        
        // Determine tracking flag values
        let hasBeenExtended: number | undefined;
        let hasBeenFranchiseTagged: number | undefined;
        
        if (isNewRoster) {
          // Player moved teams - reset both flags
          hasBeenExtended = 0;
          hasBeenFranchiseTagged = 0;
        } else {
          // Same roster - preserve existing values unless explicitly setting
          const currentContract = existingContracts.find(
            c => c.playerId === contract.playerId && c.rosterId === contract.rosterId
          );
          if (isApplyingFranchiseTag) {
            // Setting franchise tag - mark as tagged
            hasBeenFranchiseTagged = 1;
            hasBeenExtended = (currentContract as any)?.hasBeenExtended ?? 0;
          } else {
            // Not setting franchise tag - preserve existing values
            hasBeenExtended = (currentContract as any)?.hasBeenExtended ?? 0;
            hasBeenFranchiseTagged = (currentContract as any)?.hasBeenFranchiseTagged ?? 0;
          }
        }
        
        const salariesPayload = typeof contract.salaries === "string"
          ? contract.salaries
          : JSON.stringify(contract.salaries || {});

        // Drop rookie contract tag when franchise tag is applied (or when extended / FA, handled elsewhere)
        const isRookieContract = isApplyingFranchiseTag ? 0 : (contract.isRookieContract || 0);
        const result = await storage.upsertPlayerContract({
          leagueId,
          rosterId: contract.rosterId,
          playerId: contract.playerId,
          salaries: salariesPayload,
          fifthYearOption: contract.fifthYearOption || null,
          isOnIr: contract.isOnIr || 0,
          franchiseTagUsed: contract.franchiseTagUsed,
          franchiseTagYear: contract.franchiseTagYear,
          originalContractYears: contract.originalContractYears,
          isRookieContract,
          extensionApplied: contract.extensionApplied,
          extensionYear: contract.extensionYear,
          extensionSalary: contract.extensionSalary,
          hasBeenExtended,
          hasBeenFranchiseTagged,
        } as any);
        results.push(result);
      }
      
      res.json({ saved: results.length, contracts: results });
    } catch (error) {
      console.error("Error saving contracts:", error);
      res.status(500).json({ error: "Failed to save contracts", message: dbErrorMessage(error) });
    }
  });

  // Starting contracts from a CSV (one column per season). Commissioner only. By default this only checks the
  // file and reports what would be imported (dryRun); with dryRun: false it writes, but only when every row is
  // fine. Rows for players who already have a contract are skipped, or replaced with mode: "replace".
  app.post("/api/league/:leagueId/contracts/import", async (req, res) => {
    try {
      const actor = await requireCommissioner(req, res);
      if (!actor) return;
      const { leagueId } = req.params;
      const { csv, mode, dryRun } = req.body ?? {};
      if (typeof csv !== "string" || csv.trim().length === 0) return res.status(400).json({ error: "Choose a CSV file." });
      if (csv.length > 600_000) return res.status(400).json({ error: "That file is too large." });
      if (mode !== "skip" && mode !== "replace") return res.status(400).json({ error: "Mode is skip or replace." });

      const [league, rosters, users, players, contracts, rules] = await Promise.all([
        getLeague(leagueId),
        getLeagueRosters(leagueId),
        getLeagueUsers(leagueId),
        getAllPlayers(),
        storage.getPlayerContracts(leagueId),
        rulesForSleeperLeague(leagueId),
      ]);
      const userById = new Map(users.map((u) => [u.user_id, u]));
      const playerNames: Record<string, string> = {};
      const ctx: ImportContext = {
        teams: rosters.map((r) => {
          const u = userById.get(r.owner_id);
          const labels = [u?.metadata?.team_name, u?.display_name, `Team ${r.roster_id}`].filter((l): l is string => !!l);
          const playerIds = (r.players ?? []).map(String);
          for (const id of playerIds) {
            const p = players[id];
            if (p) playerNames[id] = p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          }
          return { rosterId: r.roster_id, labels, playerIds };
        }),
        playerNames,
        salaryCap: rules.salaryCap,
        maxContractYears: rules.maxContractYears,
        currentSeason: parseInt(league.season, 10),
        existing: new Map(
          contracts.map((c: any) => {
            let salaries: Record<string, number> = {};
            try {
              salaries = typeof c.salaries === "string" ? JSON.parse(c.salaries || "{}") : c.salaries || {};
            } catch { /* no salaries */ }
            return [`${c.rosterId}:${c.playerId}`, salaries] as const;
          }),
        ),
      };

      const result = parseContractsCsv(csv, ctx, mode);
      if (dryRun !== false) return res.json({ dryRun: true, ...result });
      if (result.problems.length > 0 || result.counts.error > 0) {
        return res.status(400).json({ error: "Fix the problems in the file first. Nothing was imported.", dryRun: false, ...result });
      }
      const toWrite = result.rows.filter((r) => r.status === "ok");
      if (toWrite.length === 0) return res.status(400).json({ error: "There is nothing to import.", dryRun: false, ...result });

      const byKey = new Map(contracts.map((c: any) => [`${c.rosterId}:${c.playerId}`, c]));
      // Each write is an upsert, so if this stops partway, running the same import again finishes it.
      for (const row of toWrite) {
        const prev: any = byKey.get(`${row.rosterId}:${row.playerId}`);
        await storage.upsertPlayerContract({
          leagueId,
          rosterId: row.rosterId!,
          playerId: row.playerId!,
          salaries: JSON.stringify(row.salaries),
          fifthYearOption: prev?.fifthYearOption ?? null,
          isOnIr: prev?.isOnIr ?? 0,
          franchiseTagUsed: prev?.franchiseTagUsed ?? 0,
          franchiseTagYear: prev?.franchiseTagYear ?? null,
          originalContractYears: Object.keys(row.salaries!).length,
          isRookieContract: row.rookie ? 1 : 0,
          extensionApplied: prev?.extensionApplied ?? 0,
          extensionYear: prev?.extensionYear ?? null,
          extensionSalary: prev?.extensionSalary ?? null,
          hasBeenExtended: prev?.hasBeenExtended ?? 0,
          hasBeenFranchiseTagged: prev?.hasBeenFranchiseTagged ?? 0,
        } as any);
      }
      const replaced = toWrite.filter((r) => r.replaces).length;
      await writeAudit({
        leagueId: req.league?.league.id ?? null,
        ...auditActor(actor),
        action: "contracts_imported",
        details: { sleeperLeagueId: leagueId, imported: toWrite.length, replaced, skipped: result.counts.skipped, mode },
      });
      res.json({ dryRun: false, imported: toWrite.length, replaced, skipped: result.counts.skipped, capWarnings: result.capWarnings });
    } catch (error) {
      console.error("Error importing contracts:", error);
      res.status(500).json({ error: "Failed to import contracts" });
    }
  });

  // Delete a player contract
  app.delete("/api/league/:leagueId/contracts/:rosterId/:playerId", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { leagueId, rosterId, playerId } = req.params;
      await storage.deletePlayerContract(leagueId, parseInt(rosterId), playerId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contract:", error);
      res.status(500).json({ error: "Failed to delete contract" });
    }
  });

  // ==================== TEAM EXTENSIONS ====================
  // Get all team extensions for a season
  app.get("/api/league/:leagueId/extensions/:season", async (req, res) => {
    try {
      const { leagueId, season } = req.params;
      const extensions = await storage.getTeamExtensions(leagueId, parseInt(season));
      res.json(extensions);
    } catch (error) {
      console.error("Error fetching extensions:", error);
      res.status(500).json({ error: "Failed to fetch extensions" });
    }
  });

  // Check if team has used their extensions for a season (returns usage by type)
  app.get("/api/league/:leagueId/extensions/:season/:rosterId", async (req, res) => {
    try {
      const { leagueId, season, rosterId } = req.params;
      const allExtensions = await storage.getTeamExtensions(leagueId, parseInt(season));
      const teamExtensions = allExtensions.filter(e => e.rosterId === parseInt(rosterId));
      
      // Separate rookie and non-rookie extensions
      const rookieExtensions = teamExtensions.filter(e => e.isRookieExtension === 1);
      const nonRookieExtensions = teamExtensions.filter(e => e.isRookieExtension !== 1);
      
      // Non-rookie: check which extension types have been used (legacy per-type flags)
      const hasUsed1Year = nonRookieExtensions.some(e => e.extensionType === 1);
      const hasUsed2Year = nonRookieExtensions.some(e => e.extensionType === 2);
      const hasUsed3Year = nonRookieExtensions.some(e => e.extensionType === 3);
      const hasUsed4Year = nonRookieExtensions.some(e => e.extensionType === 4);
      const hasUsedNonRookieExtension = nonRookieExtensions.length > 0;
      const nonRookieExtensionCount = nonRookieExtensions.length;
      
      // Rookie: count total and check for 4-year usage
      const rookieExtensionCount = rookieExtensions.length;
      const rookieHas4Year = rookieExtensions.some(e => e.extensionType === 4);
      
      res.json({ 
        hasUsedExtension: teamExtensions.length > 0,
        hasUsed1Year,
        hasUsed2Year,
        hasUsed3Year,
        hasUsed4Year,
        hasUsedNonRookieExtension,
        nonRookieExtensionCount,
        rookieExtensionCount,
        rookieHas4Year,
        extensions: teamExtensions
      });
    } catch (error) {
      console.error("Error checking extension status:", error);
      res.status(500).json({ error: "Failed to check extension status" });
    }
  });

  // The last season a contract pays anything. Extensions are only allowed when this is the current season.
  function lastPaidYearOfContract(contract: any): number {
    try {
      const raw = typeof contract?.salaries === "string" ? JSON.parse(contract.salaries || "{}") : contract?.salaries || {};
      const years = Object.entries(raw)
        .filter(([y, v]) => !isNaN(Number(y)) && Number(v) > 0)
        .map(([y]) => Number(y));
      return years.length > 0 ? Math.max(...years) : 0;
    } catch {
      return 0;
    }
  }

  // ==================== ROOKIE EXTENSION SALARY CALCULATION ====================
  // Calculate the PPG-based extension salary for a rookie contract player
  app.post("/api/league/:leagueId/rookie-extension-salary", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { playerId, rosterId } = req.body;

      if (!playerId || !rosterId) {
        return res.status(400).json({ error: "playerId and rosterId are required" });
      }

      // Validate player contract is a rookie contract in its final year
      const allContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = allContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      if (!playerContract) {
        return res.status(404).json({ error: "Player contract not found" });
      }
      if (playerContract.isRookieContract !== 1) {
        return res.status(400).json({ error: "Player does not have a rookie contract" });
      }

      const [players, nflState, league] = await Promise.all([
        getAllPlayers(),
        getNFLState(),
        getLeague(leagueId),
      ]);

      const player = players[playerId];
      if (!player) {
        return res.status(404).json({ error: "Player not found in Sleeper data" });
      }
      const position = player.position;
      if (!position) {
        return res.status(400).json({ error: "Player has no position data" });
      }

      const currentSeason = league?.season || nflState.season || new Date().getFullYear().toString();
      const currentSeasonNum = parseInt(currentSeason);
      const previousSeason = String(currentSeasonNum - 1);

      // Check the player is in the final year of their contract
      const contractSalaries: Record<string, number> = (() => {
        try {
          return typeof (playerContract as any).salaries === "string"
            ? JSON.parse((playerContract as any).salaries || "{}")
            : (playerContract as any).salaries || {};
        } catch { return {}; }
      })();
      const salaryEntries = Object.entries(contractSalaries)
        .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
        .filter(e => !isNaN(e.year) && e.value > 0)
        .sort((a, b) => a.year - b.year);
      const lastPaidYear = salaryEntries.length > 0 ? salaryEntries[salaryEntries.length - 1].year : 0;
      if (lastPaidYear !== currentSeasonNum) {
        return res.status(400).json({ error: "Player is not in the final year of their rookie contract" });
      }

      // ── Compute adjusted PPG for the rookie using shared helpers ──
      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);

      const rookiePPGResult = computeAdjustedPPGForPlayer(playerId, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
      if (!rookiePPGResult) {
        return res.status(400).json({ error: "Player has no games played — cannot calculate PPG" });
      }

      const { adjustedPPG, gamesUsed: rookieGamesUsed, recent15PPG, previous15PPG, formulaUsed } = rookiePPGResult;

      // ── Gather all same-position active players across league rosters ──
      const rosters = await getLeagueRosters(leagueId);
      const positionPlayerIds = new Set<string>();
      for (const roster of rosters) {
        for (const pid of roster.players || []) {
          const p = players[pid];
          if (p && p.position === position) {
            positionPlayerIds.add(pid);
          }
        }
      }

      // Build adjusted PPG for each position player using shared helpers
      const playerPPGMap = new Map<string, { ppg: number; gamesPlayed: number }>();
      for (const pid of Array.from(positionPlayerIds)) {
        const ppgResult = computeAdjustedPPGForPlayer(pid, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
        if (ppgResult) {
          playerPPGMap.set(pid, { ppg: ppgResult.adjustedPPG, gamesPlayed: ppgResult.gamesUsed });
        }
      }

      // Sort all players by PPG descending
      const rankedPlayers = Array.from(playerPPGMap.entries())
        .map(([pid, data]) => {
          const p = players[pid];
          const contract = allContracts.find(c => c.playerId === pid);
          const salaries: Record<string, number> = (() => {
            try {
              return typeof (contract as any)?.salaries === "string"
                ? JSON.parse((contract as any).salaries || "{}")
                : (contract as any)?.salaries || {};
            } catch { return {}; }
          })();
          const currentYearSalary = Number(salaries[currentSeason]) || 0;
          return {
            playerId: pid,
            name: p?.full_name || p?.first_name + " " + p?.last_name || pid,
            ppg: data.ppg,
            gamesPlayed: data.gamesPlayed,
            currentYearSalary,
          };
        })
        .sort((a, b) => b.ppg - a.ppg);

      // Find the rookie's rank
      const rookieIndex = rankedPlayers.findIndex(p => p.playerId === playerId);
      if (rookieIndex === -1) {
        return res.status(400).json({ error: "Could not rank player among position peers" });
      }

      const rank = rookieIndex + 1;
      const totalPlayers = rankedPlayers.length;

      // Find neighbors with a valid salary (skip those with 0 salary)
      let neighborAbove: { name: string; salary: number; ppg: number } | null = null;
      let neighborBelow: { name: string; salary: number; ppg: number } | null = null;

      // Look above (lower index = higher rank)
      for (let i = rookieIndex - 1; i >= 0; i--) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborAbove = {
            name: rankedPlayers[i].name,
            salary: rankedPlayers[i].currentYearSalary,
            ppg: rankedPlayers[i].ppg,
          };
          break;
        }
      }

      // Look below (higher index = lower rank)
      for (let i = rookieIndex + 1; i < rankedPlayers.length; i++) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborBelow = {
            name: rankedPlayers[i].name,
            salary: rankedPlayers[i].currentYearSalary,
            ppg: rankedPlayers[i].ppg,
          };
          break;
        }
      }

      // Determine extension salary. The league's minimum extension salary (ATL: $5M) is the floor and fallback.
      const minTenths = Math.round((await rulesForSleeperLeague(leagueId)).extensions.minSalary * 10);
      let extensionSalary: number;
      if (neighborAbove && neighborBelow) {
        extensionSalary = Math.round((neighborAbove.salary + neighborBelow.salary) / 2);
      } else if (neighborAbove) {
        // Rookie is ranked last among salaried players — use highest salary at position
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        extensionSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : minTenths;
      } else if (neighborBelow) {
        // Rookie is ranked first — use highest salary at position
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        extensionSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : minTenths;
      } else {
        // No salaried neighbors at all — minimum
        extensionSalary = minTenths;
      }

      extensionSalary = Math.max(extensionSalary, minTenths);

      console.log(`[Rookie Extension] ${player.full_name || playerId} (${position}): adjustedPPG=${adjustedPPG.toFixed(1)}, rank=${rank}/${totalPlayers}, salary=${extensionSalary/10}M`);

      res.json({
        adjustedPPG: Math.round(adjustedPPG * 10) / 10,
        gamesUsed: rookieGamesUsed,
        recent15PPG: Math.round(recent15PPG * 10) / 10,
        previous15PPG: Math.round(previous15PPG * 10) / 10,
        formulaUsed,
        rank,
        totalPlayersAtPosition: totalPlayers,
        position,
        neighborAbove,
        neighborBelow,
        extensionSalary,
        extensionSalaryMillions: extensionSalary / 10,
      });
    } catch (error: any) {
      console.error("Error calculating rookie extension salary:", error);
      res.status(500).json({ error: "Failed to calculate rookie extension salary", message: error?.message || String(error) });
    }
  });

  // Calculate the PPG-based extension salary for a non-rookie contract player
  app.post("/api/league/:leagueId/non-rookie-extension-salary", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { playerId, rosterId } = req.body;

      if (!playerId || !rosterId) {
        return res.status(400).json({ error: "playerId and rosterId are required" });
      }

      const allContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = allContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      if (!playerContract) {
        return res.status(404).json({ error: "Player contract not found" });
      }

      const [players, nflState, league] = await Promise.all([
        getAllPlayers(),
        getNFLState(),
        getLeague(leagueId),
      ]);

      const player = players[playerId];
      if (!player) {
        return res.status(404).json({ error: "Player not found in Sleeper data" });
      }
      const position = player.position;
      if (!position) {
        return res.status(400).json({ error: "Player has no position data" });
      }

      const currentSeason = league?.season || nflState.season || new Date().getFullYear().toString();
      const currentSeasonNum = parseInt(currentSeason);
      const previousSeason = String(currentSeasonNum - 1);

      if (lastPaidYearOfContract(playerContract) !== currentSeasonNum) {
        return res.status(400).json({ error: "Extensions are only available in the final year of a contract" });
      }

      const [currentWeeklyStats, previousWeeklyStats] = await Promise.all([
        fetchAllWeeklyStats(currentSeason),
        fetchAllWeeklyStats(previousSeason),
      ]);

      const ppgResult = computeAdjustedPPGForPlayer(playerId, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
      if (!ppgResult) {
        return res.status(400).json({ error: "Player has no games played — cannot calculate PPG" });
      }

      const { adjustedPPG, gamesUsed, recent15PPG, previous15PPG, formulaUsed } = ppgResult;

      const rosters = await getLeagueRosters(leagueId);
      const positionPlayerIds = new Set<string>();
      for (const roster of rosters) {
        for (const pid of roster.players || []) {
          const p = players[pid];
          if (p && p.position === position) {
            positionPlayerIds.add(pid);
          }
        }
      }

      const playerPPGMap = new Map<string, { ppg: number; gamesPlayed: number }>();
      for (const pid of Array.from(positionPlayerIds)) {
        const pidResult = computeAdjustedPPGForPlayer(pid, currentSeason, previousSeason, currentWeeklyStats, previousWeeklyStats);
        if (pidResult) {
          playerPPGMap.set(pid, { ppg: pidResult.adjustedPPG, gamesPlayed: pidResult.gamesUsed });
        }
      }

      const rankedPlayers = Array.from(playerPPGMap.entries())
        .map(([pid, data]) => {
          const p = players[pid];
          const contract = allContracts.find(c => c.playerId === pid);
          const salaries: Record<string, number> = (() => {
            try {
              return typeof (contract as any)?.salaries === "string"
                ? JSON.parse((contract as any).salaries || "{}")
                : (contract as any)?.salaries || {};
            } catch { return {}; }
          })();
          const currentYearSalary = Number(salaries[currentSeason]) || 0;
          return {
            playerId: pid,
            name: p?.full_name || p?.first_name + " " + p?.last_name || pid,
            ppg: data.ppg,
            gamesPlayed: data.gamesPlayed,
            currentYearSalary,
          };
        })
        .sort((a, b) => b.ppg - a.ppg);

      const playerIndex = rankedPlayers.findIndex(p => p.playerId === playerId);
      if (playerIndex === -1) {
        return res.status(400).json({ error: "Could not rank player among position peers" });
      }

      const rank = playerIndex + 1;
      const totalPlayers = rankedPlayers.length;

      let neighborAbove: { name: string; salary: number; ppg: number } | null = null;
      let neighborBelow: { name: string; salary: number; ppg: number } | null = null;

      for (let i = playerIndex - 1; i >= 0; i--) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborAbove = { name: rankedPlayers[i].name, salary: rankedPlayers[i].currentYearSalary, ppg: rankedPlayers[i].ppg };
          break;
        }
      }

      for (let i = playerIndex + 1; i < rankedPlayers.length; i++) {
        if (rankedPlayers[i].currentYearSalary > 0) {
          neighborBelow = { name: rankedPlayers[i].name, salary: rankedPlayers[i].currentYearSalary, ppg: rankedPlayers[i].ppg };
          break;
        }
      }

      const extRules = await rulesForSleeperLeague(leagueId);
      const minTenths = Math.round(extRules.extensions.minSalary * 10);
      let baseSalary: number;
      if (neighborAbove && neighborBelow) {
        baseSalary = Math.round((neighborAbove.salary + neighborBelow.salary) / 2);
      } else if (neighborAbove) {
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        baseSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : minTenths;
      } else if (neighborBelow) {
        const allSalaries = rankedPlayers.filter(p => p.currentYearSalary > 0).map(p => p.currentYearSalary);
        baseSalary = allSalaries.length > 0 ? Math.max(...allSalaries) : minTenths;
      } else {
        baseSalary = minTenths;
      }

      baseSalary = Math.max(baseSalary, minTenths);

      // League multipliers by length (ATL: 1 yr 80%, 2 yr 90%, 3 yr 100%, 4 yr 110%), rounded up to whole $M.
      const baseSalaryMillions = baseSalary / 10;
      const salary1Year = Math.ceil(baseSalaryMillions * extensionMultiplier(extRules, 1)) * 10;
      const salary2Year = Math.ceil(baseSalaryMillions * extensionMultiplier(extRules, 2)) * 10;
      const salary3Year = Math.ceil(baseSalaryMillions * extensionMultiplier(extRules, 3)) * 10;
      const salary4Year = Math.ceil(baseSalaryMillions * extensionMultiplier(extRules, 4)) * 10;

      console.log(`[Non-Rookie Extension] ${player.full_name || playerId} (${position}): adjustedPPG=${adjustedPPG.toFixed(1)}, rank=${rank}/${totalPlayers}, baseSalary=${baseSalary/10}M`);

      res.json({
        adjustedPPG: Math.round(adjustedPPG * 10) / 10,
        gamesUsed,
        recent15PPG: Math.round(recent15PPG * 10) / 10,
        previous15PPG: Math.round(previous15PPG * 10) / 10,
        formulaUsed,
        rank,
        totalPlayersAtPosition: totalPlayers,
        position,
        neighborAbove,
        neighborBelow,
        extensionSalary: baseSalary,
        extensionSalaryMillions: baseSalary / 10,
        salary1Year,
        salary1YearMillions: salary1Year / 10,
        salary2Year,
        salary2YearMillions: salary2Year / 10,
        salary3Year,
        salary3YearMillions: salary3Year / 10,
        salary4Year,
        salary4YearMillions: salary4Year / 10,
      });
    } catch (error: any) {
      console.error("Error calculating non-rookie extension salary:", error);
      res.status(500).json({ error: "Failed to calculate extension salary", message: error?.message || String(error) });
    }
  });

  // Apply an extension to a player
  // For non-rookie contracts, extensions use PPG-based pricing with 80/90/100/110% multipliers
  // For rookie contracts (isRookieContract = 1), extensions use PPG-based pricing calculated server-side
  app.post("/api/league/:leagueId/extensions", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { rosterId, playerId, playerName, currentSalary, extensionType, extensionYear, isPPGBased, ppgSalary } = req.body;
      let { season } = req.body;
      
      if (!rosterId || !season || !playerId || !playerName || !extensionType || !extensionYear) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Extensions are only made while the regular-season window is open (it closes after the deadline week).
      const rules = await rulesForSleeperLeague(leagueId);
      {
        const { getPhaseState } = await import("../contractHubRoutes");
        const { current: extPhase } = await getPhaseState(leagueId);
        if (extPhase !== "regular_season") {
          return res.status(400).json({ error: `Extensions can only be made during the regular season, through Week ${rules.contractDeadlineWeek}` });
        }
      }

      // Validate and normalize season to a number
      season = parseInt(season);
      if (isNaN(season) || season < 2020 || season > 2100) {
        return res.status(400).json({ error: "Invalid season year" });
      }

      // Validate extension type (1 = 1-year, 2 = 2-year, 3 = 3-year, 4 = 4-year)
      if (![1, 2, 3, 4].includes(extensionType)) {
        return res.status(400).json({ error: "Extension type must be 1 (1-year), 2 (2-year), 3 (3-year), or 4 (4-year)" });
      }

      // Validate player contract exists and check if it's a rookie contract
      const playerContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = playerContracts.find(c => c.playerId === playerId && c.rosterId === rosterId);
      
      if (!playerContract) {
        return res.status(400).json({ error: "Player contract not found" });
      }

      // Check if extension already applied (confirmed)
      if (playerContract.extensionApplied === 1) {
        return res.status(400).json({ error: "Extension already applied to this player" });
      }

      // Check if there's already a pending extension for this player
      const allExtensionsForSeason = await storage.getTeamExtensions(leagueId, season);
      const existingPendingForPlayer = allExtensionsForSeason.find(
        e => e.playerId === playerId && e.rosterId === rosterId && e.status === "pending"
      );
      if (existingPendingForPlayer) {
        return res.status(400).json({ error: "This player already has a pending extension. Confirm or cancel it first." });
      }

      // Check if player has been extended before on this roster
      if ((playerContract as any).hasBeenExtended === 1) {
        return res.status(400).json({ 
          error: "Player has already been extended on this team. Must go to free agency or be franchise tagged first." 
        });
      }

      const isRookieContract = playerContract.isRookieContract === 1;

      // Check extension limits (rookie and non-rookie have independent limits)
      // Reuse allExtensionsForSeason fetched earlier for the duplicate-pending check
      const teamExtensionsForRoster = allExtensionsForSeason.filter(e => e.rosterId === rosterId);

      const ext = rules.extensions;
      if (isRookieContract) {
        // Rookie extensions per season, and how many of them may be 4-year (ATL: 3, of which 1 four-year)
        const rookieExts = teamExtensionsForRoster.filter(e => e.isRookieExtension === 1);
        if (rookieExts.length >= ext.rookiePerSeason) {
          return res.status(400).json({
            error: `Team has already used all ${ext.rookiePerSeason} rookie extensions for this season`
          });
        }
        if (extensionType === 4 && rookieExts.filter(e => e.extensionType === 4).length >= ext.rookieFourYearPerSeason) {
          return res.status(400).json({
            error: `Team has already used its ${ext.rookieFourYearPerSeason} 4-year rookie extension${ext.rookieFourYearPerSeason === 1 ? "" : "s"} for this season`
          });
        }
      } else {
        // Non-rookie extensions per season (ATL: 2)
        const nonRookieExts = teamExtensionsForRoster.filter(e => e.isRookieExtension !== 1);
        if (nonRookieExts.length >= ext.nonRookiePerSeason) {
          return res.status(400).json({
            error: `Team has already used all ${ext.nonRookiePerSeason} non-rookie extensions for this season`,
            existingExtension: nonRookieExts[0]
          });
        }
      }

      // Validate the league's contract-length limits (same limits as free agency, ATL: 4+ yrs max 3,
      // 3 yrs max 4, 2 yrs max 5). Only non-rookie contracts count; rookie contracts are excluded.
      {
        // The bucket is the extension length itself (3-year ext → 3-year limit, etc.)
        const bucket = Math.min(Math.max(extensionType, 1), 4);
        const limit = lengthLimit(rules, bucket);

        if (limit !== null) {
          // The extension starts next season, so count the contracts the roster will have then: seasons from
          // the extension year on. The player being extended is left out because the extension replaces his deal.
          const rosterContracts = playerContracts.filter(
            c => c.rosterId === rosterId && c.isRookieContract !== 1 && c.playerId !== playerId,
          );
          let bucketCount = 0;
          for (const c of rosterContracts) {
            const salaries: Record<string, number> = (() => {
              try {
                if (typeof (c as any).salaries === "string") return JSON.parse((c as any).salaries || "{}");
                return (c as any).salaries || {};
              } catch { return {}; }
            })();
            const yearsWithSalary = Object.keys(salaries).map(Number).filter(y => y >= season + 1 && (salaries[y] ?? 0) > 0);
            const contractLength = yearsWithSalary.length;
            const cBucket = Math.min(Math.max(contractLength, 0), 4);
            if (cBucket === bucket) bucketCount++;
          }
          if (bucketCount >= limit) {
            return res.status(400).json({
              error: `Roster limit for ${bucket}-year contracts is full (max ${limit}). Cannot apply this extension.`
            });
          }
        }
      }

      // Extensions are only available in the final year of a contract (rookie or not).
      if (lastPaidYearOfContract(playerContract) !== season) {
        return res.status(400).json({ error: "Extensions are only available in the final year of a contract" });
      }

      // Rookie contracts: must be in final year; use PPG-based pricing
      if (isRookieContract) {
        const contractSalaries: Record<string, number> = (() => {
          try {
            if (typeof (playerContract as any).salaries === "string") {
              return JSON.parse((playerContract as any).salaries || "{}");
            }
            return (playerContract as any).salaries || {};
          } catch {
            return {};
          }
        })();
        const salaryEntries = Object.entries(contractSalaries)
          .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
          .filter(e => !isNaN(e.year) && e.value > 0)
          .sort((a, b) => a.year - b.year);
        const lastPaidYear = salaryEntries.length > 0 ? salaryEntries[salaryEntries.length - 1].year : 0;
        if (lastPaidYear !== season) {
          return res.status(400).json({ error: "Player is not in the final year of their rookie contract" });
        }
        // Validate extension type: rookies can only do 3-year or 4-year
        if (extensionType !== 3 && extensionType !== 4) {
          return res.status(400).json({ error: "Rookie contracts can only be extended for 3 or 4 years" });
        }
      }

      // Calculate extension salaries based on type
      let extensionSalary1 = 0;
      let extensionSalary2: number | null = null;
      let extensionSalary3: number | null = null;
      let extensionSalary4: number | null = null;

      // Both rookie and non-rookie extensions use PPG-based pricing
      const salary = ppgSalary;
      if (!salary || salary <= 0) {
        return res.status(400).json({ error: "PPG-based salary is required for extensions. Calculate it first." });
      }

      if (isRookieContract) {
        // Rookie extensions: flat PPG salary for all years
        extensionSalary1 = salary;
        if (extensionType >= 2) extensionSalary2 = salary;
        if (extensionType >= 3) extensionSalary3 = salary;
        if (extensionType >= 4) extensionSalary4 = salary;
      } else {
        // Non-rookie extensions: PPG-based with the league's multipliers by length
        const baseSalaryMillions = salary / 10;
        const salaryPerYear = Math.ceil(baseSalaryMillions * extensionMultiplier(rules, extensionType)) * 10;
        extensionSalary1 = salaryPerYear;
        if (extensionType >= 2) extensionSalary2 = salaryPerYear;
        if (extensionType >= 3) extensionSalary3 = salaryPerYear;
        if (extensionType >= 4) extensionSalary4 = salaryPerYear;
      }

      // Extension years must stay within the league's max contract length (ATL: 5 seasons, through season + 4).
      const maxContractYear = season + rules.maxContractYears - 1;
      const maxExtensionYear = extensionType === 1 ? extensionYear : (extensionType === 2 ? extensionYear + 1 : (extensionType === 3 ? extensionYear + 2 : extensionYear + 3));
      if (extensionYear < season || maxExtensionYear > maxContractYear) {
        return res.status(400).json({ 
          error: `Extension would exceed maximum contract year (${maxContractYear})` 
        });
      }

      // Validate extension target years are currently empty (no salary)
      const existingSalaries = (() => {
        try {
          if (typeof (playerContract as any).salaries === "string") {
            return JSON.parse((playerContract as any).salaries || "{}");
          }
          return (playerContract as any).salaries || {};
        } catch {
          return {};
        }
      })();

      const getSalaryForYear = (year: number): number => {
        const val = (existingSalaries as Record<string, number>)[String(year)];
        return typeof val === "number" ? val : 0;
      };

      // Check that all extension year(s) don't have existing salary
      const extensionYears = [extensionYear];
      if (extensionType >= 2) extensionYears.push(extensionYear + 1);
      if (extensionType >= 3) extensionYears.push(extensionYear + 2);
      if (extensionType >= 4) extensionYears.push(extensionYear + 3);

      for (const year of extensionYears) {
        if (getSalaryForYear(year) > 0) {
          console.error(`Extension blocked: Player ${playerId} already has salary in ${year}`);
        return res.status(400).json({ 
            error: `Cannot extend - player already has salary for ${year}` 
        });
      }
      }

      // Create the extension record as pending (contract is NOT modified yet)
      const extension = await storage.createTeamExtension({
        leagueId,
        rosterId,
        season,
        playerId,
        playerName,
        extensionSalary: extensionSalary1,
        extensionYear,
        extensionType,
        extensionSalary2: extensionType >= 2 ? extensionSalary2 : null,
        isRookieExtension: isRookieContract ? 1 : 0,
      });

      // Store computed salaries in the response so the client can preview them
      res.json({ 
        success: true, 
        extension,
        previewSalaries: {
          salary1: extensionSalary1,
          salary2: extensionSalary2,
          salary3: extensionSalary3,
          salary4: extensionSalary4,
        }
      });
    } catch (error) {
      console.error("Error creating pending extension:", error);
      res.status(500).json({ error: "Failed to create pending extension" });
    }
  });

  // Confirm a pending extension (applies salary changes to the contract)
  app.put("/api/league/:leagueId/extensions/:extensionId/confirm", async (req, res) => {
    try {
      const { leagueId, extensionId } = req.params;
      const { rosterId } = req.body;

      if (!rosterId) {
        return res.status(400).json({ error: "Missing rosterId" });
      }

      {
        const { getPhaseState } = await import("../contractHubRoutes");
        const { current: extPhase, deadlineWeek } = await getPhaseState(leagueId);
        if (extPhase !== "regular_season") {
          return res.status(400).json({ error: `Extensions can only be submitted during the regular season, through Week ${deadlineWeek}` });
        }
      }

      // Look up the extension
      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      // Verify it belongs to this league and roster
      if (extension.leagueId !== leagueId || extension.rosterId !== rosterId) {
        return res.status(403).json({ error: "Extension does not belong to this team" });
      }

      // Verify it's pending
      if (extension.status !== "pending") {
        return res.status(400).json({ error: "Extension is already confirmed" });
      }

      // Re-fetch the player contract to apply salary changes
      const playerContracts = await storage.getPlayerContracts(leagueId);
      const playerContract = playerContracts.find(c => c.playerId === extension.playerId && c.rosterId === rosterId);

      if (!playerContract) {
        return res.status(400).json({ error: "Player contract not found" });
      }

      // Parse existing salaries
      const existingSalaries = (() => {
        try {
          if (typeof (playerContract as any).salaries === "string") {
            return JSON.parse((playerContract as any).salaries || "{}");
          }
          return (playerContract as any).salaries || {};
        } catch {
          return {};
        }
      })();

      // Recalculate extension salaries from the stored extension record
      const extensionSalary1 = extension.extensionSalary;
      const extensionSalary2 = extension.extensionSalary2;
      // For 3-year and 4-year, salary per year equals extensionSalary (same rate each year)
      const extensionSalary3 = extension.extensionType >= 3 ? extensionSalary1 : null;
      const extensionSalary4 = extension.extensionType >= 4 ? extensionSalary1 : null;

      // Update the player's contract with extension info. Drop rookie contract tag once extended.
      const updatedSalaries: Record<string, number> = { ...existingSalaries };
      const salaryUpdates: any = {
        leagueId,
        rosterId,
        playerId: extension.playerId,
        salaries: JSON.stringify(updatedSalaries),
        fifthYearOption: playerContract.fifthYearOption,
        franchiseTagUsed: playerContract.franchiseTagUsed,
        franchiseTagYear: playerContract.franchiseTagYear,
        originalContractYears: playerContract.originalContractYears,
        isRookieContract: 0,
        extensionApplied: 1,
        extensionYear: extension.extensionYear,
        extensionSalary: extensionSalary1,
        extensionType: extension.extensionType,
        hasBeenExtended: 1,
        hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0,
      };
      
      // Set the extension year salary(s) for all extension years
      const setYearSalary = (year: number, salary: number) => {
        updatedSalaries[String(year)] = salary;
        salaryUpdates.salaries = JSON.stringify(updatedSalaries);
      };

      // The new contract replaces whatever was left of the old one from its first year on.
      for (const key of Object.keys(updatedSalaries)) {
        if (Number(key) >= extension.extensionYear) delete updatedSalaries[key];
      }
      setYearSalary(extension.extensionYear, extensionSalary1);
      if (extension.extensionType >= 2 && extensionSalary2 !== null) {
        setYearSalary(extension.extensionYear + 1, extensionSalary2);
      }
      if (extension.extensionType >= 3 && extensionSalary3 !== null) {
        setYearSalary(extension.extensionYear + 2, extensionSalary3);
      }
      if (extension.extensionType >= 4 && extensionSalary4 !== null) {
        setYearSalary(extension.extensionYear + 3, extensionSalary4);
      }
      
      await storage.upsertPlayerContract(salaryUpdates);

      // Update extension status to confirmed
      const updatedExtension = await storage.updateTeamExtensionStatus(extensionId, "confirmed");

      res.json({ success: true, extension: updatedExtension });
    } catch (error) {
      console.error("Error confirming extension:", error);
      res.status(500).json({ error: "Failed to confirm extension" });
    }
  });

  // Apply franchise tag (team applies for own roster; no commissioner approval)
  app.post("/api/league/:leagueId/franchise-tag", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId, rosterId, playerId, position } = req.body;

      if (!userId || rosterId == null || !playerId || !position) {
        return res.status(400).json({ error: "userId, rosterId, playerId, and position are required" });
      }

      const league = await getLeague(leagueId).catch(() => null);
      if (!league) {
        return res.status(404).json({ error: "League not found" });
      }

      const rosters = await getLeagueRosters(leagueId);
      const roster = rosters.find((r: SleeperRoster) => r.roster_id === Number(rosterId));
      if (!roster) {
        return res.status(404).json({ error: "Roster not found" });
      }
      if (String(roster.owner_id) !== String(userId)) {
        // Not the roster's owner: only a commissioner (with their PIN) can tag for another team.
        if (!(await requireCommissioner(req, res))) return;
      }

      const currentYear = parseInt(league.season || String(new Date().getFullYear()), 10) || new Date().getFullYear();
      const tagRules = await rulesForSleeperLeague(leagueId);
      // The last season the league's max contract length reaches (ATL: current + 4).
      const optionYear = currentYear + tagRules.maxContractYears - 1;

      const allContracts = await storage.getPlayerContracts(leagueId);
      const contract = allContracts.find((c: any) => c.playerId === playerId && c.rosterId === Number(rosterId));
      if (!contract) {
        return res.status(404).json({ error: "Player contract not found" });
      }
      if ((contract as any).hasBeenFranchiseTagged === 1) {
        return res.status(400).json({
          error: "Player has already been franchise tagged on this team. Must be extended or go to free agency first.",
        });
      }

      // Tags are only made while the regular-season window is open (it closes after the deadline week).
      const { getPhaseState } = await import("../contractHubRoutes");
      const { current: tagPhase } = await getPhaseState(leagueId);
      if (tagPhase !== "regular_season") {
        return res.status(400).json({ error: `Franchise tags can only be applied during the regular season, through Week ${tagRules.contractDeadlineWeek}` });
      }

      // The league's tags per team for the coming season (ATL: 1).
      const teamTagCount = allContracts.filter(
        (c: any) => c.rosterId === Number(rosterId) && c.franchiseTagUsed === 1 && c.franchiseTagYear === currentYear + 1,
      ).length;
      if (teamTagCount >= tagRules.franchiseTag.perTeamPerSeason) {
        return res.status(400).json({ error: "This team has no franchise tag left this season" });
      }

      const salaries: Record<string, number> = (() => {
        try {
          const raw = typeof (contract as any).salaries === "string"
            ? JSON.parse((contract as any).salaries || "{}")
            : (contract as any).salaries || {};
          const out: Record<string, number> = {};
          Object.entries(raw).forEach(([year, value]) => {
            const v = Number(value);
            if (!isNaN(v)) out[year] = v;
          });
          return out;
        } catch {
          return {};
        }
      })();

      const yearsWithSalary = Object.entries(salaries)
        .filter(([, v]) => v > 0)
        .map(([y]) => parseInt(y, 10))
        .filter((y) => !isNaN(y));
      const lastYearWithSalary = yearsWithSalary.length > 0 ? Math.max(...yearsWithSalary) : currentYear - 1;
      // Only players whose contract ends this season can be tagged.
      if (lastYearWithSalary !== currentYear) {
        return res.status(400).json({ error: "Only players whose contract ends this season can be franchise tagged" });
      }
      const franchiseYear = lastYearWithSalary < optionYear ? lastYearWithSalary + 1 : optionYear;

      const players = await getAllPlayers();
      const salariesByPosition: Record<string, number[]> = {};
      for (const c of allContracts) {
        const p = players[c.playerId];
        const pos = p?.position || (c as any).position;
        if (!pos) continue;
        // Rookie deals do not set the tag price.
        if ((c as any).isRookieContract === 1) continue;
        const raw = typeof (c as any).salaries === "string" ? JSON.parse((c as any).salaries || "{}") : (c as any).salaries || {};
        const currentSalary = raw[String(currentYear)];
        if (currentSalary == null || Number(currentSalary) <= 0) continue;
        if (!salariesByPosition[pos]) salariesByPosition[pos] = [];
        salariesByPosition[pos].push(Number(currentSalary));
      }
      const positionSalaries = salariesByPosition[position] || [];
      // Tag price: average of the league's top-N non-rookie salaries at the position (ATL: 5), rounded up to $0.1M.
      const top = positionSalaries.sort((a, b) => b - a).slice(0, tagRules.franchiseTag.topSalaries);
      const franchiseSalaryTenths = top.length > 0 ? Math.ceil(top.reduce((s, n) => s + n, 0) / top.length) : 0;

      salaries[String(franchiseYear)] = franchiseSalaryTenths;
      const salariesPayload = JSON.stringify(salaries);

      await storage.upsertPlayerContract({
        leagueId,
        rosterId: Number(rosterId),
        playerId,
        salaries: salariesPayload,
        fifthYearOption: (contract as any).fifthYearOption ?? null,
        isOnIr: (contract as any).isOnIr ?? 0,
        franchiseTagUsed: 1,
        franchiseTagYear: franchiseYear,
        originalContractYears: (contract as any).originalContractYears ?? 0,
        isRookieContract: 0,
        extensionApplied: (contract as any).extensionApplied ?? 0,
        extensionYear: (contract as any).extensionYear ?? null,
        extensionSalary: (contract as any).extensionSalary ?? null,
        hasBeenExtended: (contract as any).hasBeenExtended ?? 0,
        hasBeenFranchiseTagged: 1,
      } as any);

      res.json({ success: true });
    } catch (error) {
      console.error("Error applying franchise tag:", error);
      res.status(500).json({ error: "Failed to apply franchise tag", message: dbErrorMessage(error) });
    }
  });

  // Undo franchise tag (commissioner only) - removes tag and sets hasBeenFranchiseTagged to 0
  app.delete("/api/league/:leagueId/franchise-tag/undo", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { userId, rosterId, playerId } = req.body;

      if (!userId || rosterId == null || !playerId) {
        return res.status(400).json({ error: "userId, rosterId, and playerId are required" });
      }

      if (!(await requireCommissioner(req, res))) return;

      const allContracts = await storage.getPlayerContracts(leagueId);
      const contract = allContracts.find((c: any) => c.playerId === playerId && c.rosterId === Number(rosterId));
      if (!contract) {
        return res.status(404).json({ error: "Player contract not found" });
      }
      if ((contract as any).hasBeenFranchiseTagged !== 1) {
        return res.status(400).json({ error: "Player has not been franchise tagged; nothing to undo" });
      }

      const franchiseTagYear = (contract as any).franchiseTagYear;
      const salaries: Record<string, number> = (() => {
        try {
          const raw = typeof (contract as any).salaries === "string"
            ? JSON.parse((contract as any).salaries || "{}")
            : (contract as any).salaries || {};
          const out: Record<string, number> = {};
          Object.entries(raw).forEach(([year, value]) => {
            const v = Number(value);
            if (!isNaN(v)) out[year] = v;
          });
          return out;
        } catch {
          return {};
        }
      })();

      if (franchiseTagYear != null) {
        delete salaries[String(franchiseTagYear)];
      }

      await storage.upsertPlayerContract({
        leagueId,
        rosterId: Number(rosterId),
        playerId,
        salaries: JSON.stringify(salaries),
        fifthYearOption: (contract as any).fifthYearOption ?? null,
        isOnIr: (contract as any).isOnIr ?? 0,
        franchiseTagUsed: 0,
        franchiseTagYear: null,
        originalContractYears: (contract as any).originalContractYears ?? 0,
        isRookieContract: (contract as any).isRookieContract ?? 0,
        extensionApplied: (contract as any).extensionApplied ?? 0,
        extensionYear: (contract as any).extensionYear ?? null,
        extensionSalary: (contract as any).extensionSalary ?? null,
        hasBeenExtended: (contract as any).hasBeenExtended ?? 0,
        hasBeenFranchiseTagged: 0,
      } as any);

      res.json({ success: true, message: "Franchise tag undone successfully" });
    } catch (error) {
      console.error("Error undoing franchise tag:", error);
      res.status(500).json({ error: "Failed to undo franchise tag", message: dbErrorMessage(error) });
    }
  });

  // Cancel a pending extension (user can cancel their own; no contract revert needed)
  app.delete("/api/league/:leagueId/extensions/pending/:extensionId", async (req, res) => {
    try {
      const { leagueId, extensionId } = req.params;
      const rosterId = parseInt(req.query.rosterId as string);

      if (isNaN(rosterId)) {
        return res.status(400).json({ error: "Missing or invalid rosterId" });
      }

      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      if (extension.leagueId !== leagueId || extension.rosterId !== rosterId) {
        return res.status(403).json({ error: "Extension does not belong to this team" });
      }

      if (extension.status !== "pending") {
        return res.status(400).json({ error: "Only pending extensions can be cancelled by the user. Contact a commissioner to remove confirmed extensions." });
      }

      // Delete the pending extension (no contract revert needed since contract was never modified)
      await storage.deleteTeamExtensionById(extensionId);

      res.json({ success: true, message: "Pending extension cancelled" });
    } catch (error) {
      console.error("Error cancelling pending extension:", error);
      res.status(500).json({ error: "Failed to cancel pending extension" });
    }
  });

  // Undo a specific confirmed extension by ID (commissioner only)
  app.delete("/api/league/:leagueId/extensions/:extensionId/undo", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { leagueId, extensionId } = req.params;

      const extension = await storage.getTeamExtensionById(extensionId);
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }
      if (extension.leagueId !== leagueId) {
        return res.status(403).json({ error: "Extension does not belong to this league" });
      }
      if (extension.status !== "confirmed") {
        return res.status(400).json({ error: "Only confirmed extensions can be undone. Use the cancel route for pending extensions." });
      }

      const contracts = await storage.getPlayerContracts(leagueId);
      const playerContract = contracts.find(c => c.playerId === extension.playerId && c.rosterId === extension.rosterId);

      if (playerContract) {
        const existingSalaries = (() => {
          try {
            if (typeof (playerContract as any).salaries === "string") {
              return JSON.parse((playerContract as any).salaries || "{}");
            }
            return (playerContract as any).salaries || {};
          } catch {
            return {};
          }
        })();

        const updatedSalaries: Record<string, number> = { ...existingSalaries };
        const clearYearSalary = (year: number) => {
          updatedSalaries[String(year)] = 0;
        };

        for (let i = 0; i < extension.extensionType; i++) {
          clearYearSalary(extension.extensionYear + i);
        }

        await storage.upsertPlayerContract({
          leagueId,
          rosterId: extension.rosterId,
          playerId: extension.playerId,
          salaries: JSON.stringify(updatedSalaries),
          fifthYearOption: playerContract.fifthYearOption,
          franchiseTagUsed: playerContract.franchiseTagUsed,
          franchiseTagYear: playerContract.franchiseTagYear,
          originalContractYears: playerContract.originalContractYears,
          extensionApplied: 0,
          extensionYear: null,
          extensionSalary: null,
          extensionType: null,
          hasBeenExtended: 0,
          hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0,
        });
      }

      await storage.deleteTeamExtensionById(extensionId);

      res.json({ success: true, message: "Extension undone successfully" });
    } catch (error) {
      console.error("Error undoing extension:", error);
      res.status(500).json({ error: "Failed to undo extension" });
    }
  });

  // Delete a team extension (commissioner only - allows team to use extension again)
  app.delete("/api/league/:leagueId/extensions/:season/:rosterId", async (req, res) => {
    try {
      if (!(await requireCommissioner(req, res))) return;
      const { leagueId, season, rosterId } = req.params;
      const seasonNum = parseInt(season);
      const rosterIdNum = parseInt(rosterId);

      if (isNaN(seasonNum) || isNaN(rosterIdNum)) {
        return res.status(400).json({ error: "Invalid season or roster ID" });
      }

      // Get the extension record to find which player it was applied to
      const extension = await storage.getTeamExtensionByRoster(leagueId, rosterIdNum, seasonNum);
      
      if (!extension) {
        return res.status(404).json({ error: "Extension not found" });
      }

      // Get the player contract to revert it
      const contracts = await storage.getPlayerContracts(leagueId);
      const playerContract = contracts.find(c => c.playerId === extension.playerId && c.rosterId === rosterIdNum);
      
      if (playerContract) {
        // Revert the contract: clear extension year salary(s) and reset flags
        const existingSalaries = (() => {
          try {
            if (typeof (playerContract as any).salaries === "string") {
              return JSON.parse((playerContract as any).salaries || "{}");
            }
            return (playerContract as any).salaries || {};
          } catch {
            return {};
          }
        })();

        const updatedSalaries: Record<string, number> = { ...existingSalaries };
        const salaryUpdates: any = {
          leagueId,
          rosterId: rosterIdNum,
          playerId: extension.playerId,
          salaries: JSON.stringify(updatedSalaries),
          fifthYearOption: playerContract.fifthYearOption,
          franchiseTagUsed: playerContract.franchiseTagUsed,
          franchiseTagYear: playerContract.franchiseTagYear,
          originalContractYears: playerContract.originalContractYears,
          extensionApplied: 0,
          extensionYear: null,
          extensionSalary: null,
          extensionType: null,
          hasBeenExtended: (playerContract as any).hasBeenExtended ?? 0, // Preserve - player has still been extended before
          hasBeenFranchiseTagged: (playerContract as any).hasBeenFranchiseTagged ?? 0, // Preserve existing value
        };

        // Clear the extension year salary(s)
        const clearYearSalary = (year: number) => {
          updatedSalaries[String(year)] = 0;
          salaryUpdates.salaries = JSON.stringify(updatedSalaries);
        };

        for (let i = 0; i < extension.extensionType; i++) {
          clearYearSalary(extension.extensionYear + i);
        }

        await storage.upsertPlayerContract(salaryUpdates);
      }

      // Delete the extension record
      await storage.deleteTeamExtension(leagueId, rosterIdNum, seasonNum);

      res.json({ success: true, message: "Extension removed - team can use extension again" });
    } catch (error) {
      console.error("Error deleting extension:", error);
      res.status(500).json({ error: "Failed to delete extension" });
    }
  });
}
