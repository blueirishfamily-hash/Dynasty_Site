import { randomUUID } from "crypto";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  ruleSuggestionsTable,
  ruleVotesTable,
  awardNominationsTable,
  awardBallotsTable,
  leagueSettingsTable,
  playerContractsTable,
  playerBidsTable,
  deadCapEntriesTable,
  savedContractDraftsTable,
  contractApprovalRequestsTable,
  teamExtensionsTable,
} from "@shared/schema";
import type { 
  RuleSuggestion, InsertRuleSuggestion, 
  AwardNomination, InsertAwardNomination,
  AwardBallot, InsertAwardBallot,
  RuleVote, InsertRuleVote,
  LeagueSetting,
  PlayerContract, InsertPlayerContract,
  PlayerBid, InsertPlayerBid,
  DeadCapEntry, InsertDeadCapEntry,
  SavedContractDraft, InsertSavedContractDraft,
  ContractApprovalRequest, InsertContractApprovalRequest,
  TeamExtension, InsertTeamExtension
} from "@shared/schema";

export interface UserSession {
  id: string;
  sleeperUsername: string;
  sleeperId: string;
  selectedLeagueId: string | null;
  createdAt: number;
}

export interface IStorage {
  getSession(id: string): Promise<UserSession | undefined>;
  createSession(sleeperUsername: string, sleeperId: string): Promise<UserSession>;
  updateSessionLeague(sessionId: string, leagueId: string): Promise<UserSession | undefined>;
  deleteSession(id: string): Promise<void>;
  
  getRuleSuggestions(leagueId: string): Promise<RuleSuggestion[]>;
  getRuleSuggestionById(id: string): Promise<RuleSuggestion | undefined>;
  createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion>;
  updateRuleSuggestion(id: string, data: { title?: string; description?: string }): Promise<RuleSuggestion | undefined>;
  updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined>;
  deleteRuleSuggestion(id: string): Promise<void>;
  
  getRuleVotes(ruleId: string): Promise<RuleVote[]>;
  castRuleVote(data: InsertRuleVote): Promise<RuleVote>;
  getRuleVoteByRoster(ruleId: string, rosterId: number): Promise<RuleVote | undefined>;
  
  getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm"): Promise<AwardNomination[]>;
  createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination>;
  getNominationCountByRoster(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm", rosterId: number): Promise<number>;
  
  getAwardBallots(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm"): Promise<AwardBallot[]>;
  upsertAwardBallot(data: InsertAwardBallot): Promise<AwardBallot>;
  getAwardBallotByRoster(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm", rosterId: number): Promise<AwardBallot | undefined>;
  
  getLeagueSetting(leagueId: string, settingKey: string): Promise<string | undefined>;
  setLeagueSetting(leagueId: string, settingKey: string, settingValue: string): Promise<LeagueSetting>;
  
  getPlayerContracts(leagueId: string): Promise<PlayerContract[]>;
  upsertPlayerContract(data: InsertPlayerContract): Promise<PlayerContract>;
  deletePlayerContract(leagueId: string, rosterId: number, playerId: string): Promise<void>;
  
  getPlayerBidsByRoster(leagueId: string, rosterId: number): Promise<PlayerBid[]>;
  createPlayerBid(data: InsertPlayerBid): Promise<PlayerBid>;
  updatePlayerBid(id: string, rosterId: number, updates: Partial<InsertPlayerBid>): Promise<PlayerBid | undefined>;
  deletePlayerBid(id: string, rosterId: number): Promise<void>;
  
  getSavedContractDrafts(leagueId: string, rosterId: number): Promise<SavedContractDraft[]>;
  upsertSavedContractDraft(data: InsertSavedContractDraft): Promise<SavedContractDraft>;
  deleteSavedContractDraft(leagueId: string, rosterId: number, playerId: string): Promise<void>;
  deleteAllSavedContractDrafts(leagueId: string, rosterId: number): Promise<void>;
  
  getContractApprovalRequests(leagueId: string): Promise<ContractApprovalRequest[]>;
  getContractApprovalRequestByRoster(leagueId: string, rosterId: number): Promise<ContractApprovalRequest | undefined>;
  createContractApprovalRequest(data: InsertContractApprovalRequest): Promise<ContractApprovalRequest>;
  updateContractApprovalRequest(id: string, status: "pending" | "approved" | "rejected", reviewerNotes?: string): Promise<ContractApprovalRequest | undefined>;
  deleteContractApprovalRequest(id: string): Promise<void>;
  
  getTeamExtensions(leagueId: string, season: number): Promise<TeamExtension[]>;
  getTeamExtensionByRoster(leagueId: string, rosterId: number, season: number): Promise<TeamExtension | undefined>;
  createTeamExtension(data: InsertTeamExtension): Promise<TeamExtension>;
  deleteTeamExtension(leagueId: string, rosterId: number, season: number): Promise<void>;
  
  // Database inspection methods
  getTableList(): Promise<Array<{ name: string; rowCount: number }>>;
  getTableSchema(tableName: string): Promise<Array<{ column: string; type: string; nullable: boolean; default: string | null }>>;
  getTableData(tableName: string, limit: number, offset: number, filters?: Record<string, any>): Promise<any[]>;
  getTableRowCount(tableName: string, filters?: Record<string, any>): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  private sessions: Map<string, UserSession>;

  constructor() {
    this.sessions = new Map();
  }

  async getSession(id: string): Promise<UserSession | undefined> {
    return this.sessions.get(id);
  }

  async createSession(sleeperUsername: string, sleeperId: string): Promise<UserSession> {
    const id = randomUUID();
    const session: UserSession = {
      id,
      sleeperUsername,
      sleeperId,
      selectedLeagueId: null,
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async updateSessionLeague(sessionId: string, leagueId: string): Promise<UserSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.selectedLeagueId = leagueId;
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  /**
   * Get all rule suggestions for a league from rule_suggestions table.
   * Follows Database Connection Pattern: uses db from ./db, table from @shared/schema.
   */
  async getRuleSuggestions(leagueId: string): Promise<RuleSuggestion[]> {
    try {
      console.log("[Storage] Querying rule_suggestions table for leagueId:", leagueId);
      if (!leagueId) {
        throw new Error("leagueId is required to query rule_suggestions table");
      }
      
      // Database Connection Pattern: Use db from ./db, table from @shared/schema, Drizzle query builders
      const rows = await db
        .select()
        .from(ruleSuggestionsTable)
        .where(eq(ruleSuggestionsTable.leagueId, leagueId))
        .orderBy(desc(ruleSuggestionsTable.createdAt));

      console.log("[Storage] Successfully queried rule_suggestions table. Found", rows.length, "rows for leagueId:", leagueId);
      
      const suggestions = rows.map(row => {
        // Validate each row has required fields
        if (!row.id || !row.title || !row.description) {
          console.warn("[Storage] Invalid row in rule_suggestions table:", row);
          return null;
        }
        return {
          id: row.id,
          leagueId: row.leagueId,
          authorId: row.authorId,
          authorName: row.authorName,
          rosterId: row.rosterId,
          title: row.title,
          description: row.description,
          status: row.status as "pending" | "approved" | "rejected",
          upvotes: [],
          downvotes: [],
          createdAt: row.createdAt,
        };
      }).filter((s): s is RuleSuggestion => s !== null);
      
      console.log("[Storage] Returning", suggestions.length, "valid rule suggestions from rule_suggestions table");
      return suggestions;
    } catch (error: any) {
      console.error("[Storage] Error querying rule_suggestions table:", error);
      
      // Check for PostgreSQL error codes
      const errorCode = error.code;
      const errorMessage = error.message || "";
      
      // PostgreSQL error code 42P01 = relation does not exist
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation")) {
        throw new Error("rule_suggestions table does not exist in database. Please run 'npm run db:push' to create the required tables.");
      }
      
      // PostgreSQL error code 08003 = connection does not exist, 08006 = connection failure
      if (errorCode === "08003" || errorCode === "08006" || 
          errorMessage.includes("connection") || errorMessage.includes("timeout") ||
          errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
        throw new Error("Database connection error. Please check DATABASE_URL environment variable.");
      }
      
      // PostgreSQL error code 23505 = unique violation (shouldn't happen here, but good to catch)
      if (errorCode === "23505") {
        throw new Error("Duplicate entry detected. This rule suggestion may already exist.");
      }
      
      // Re-throw with more context
      throw new Error(`Database error: ${errorMessage || "Unknown error occurred"}`);
    }
  }

  /**
   * Create a new rule suggestion in rule_suggestions table.
   * Follows Database Connection Pattern: uses db from ./db, table from @shared/schema.
   */
  async createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion> {
    try {
      console.log("[Storage] Inserting into rule_suggestions table:", {
        leagueId: data.leagueId,
        authorId: data.authorId,
        title: data.title,
      });
      
      // Database Connection Pattern: Generate ID and timestamp, use db.insert with table from @shared/schema
      const id = randomUUID();
      const createdAt = Date.now();

      await db.insert(ruleSuggestionsTable).values({
        id,
        leagueId: data.leagueId,
        authorId: data.authorId,
        authorName: data.authorName,
        rosterId: data.rosterId,
        title: data.title,
        description: data.description,
        status: "pending",
        createdAt,
      });

      console.log("[Storage] Successfully inserted into rule_suggestions table. ID:", id);

      return {
        id,
        ...data,
        status: "pending",
        upvotes: [],
        downvotes: [],
        createdAt,
      };
    } catch (error: any) {
      console.error("[Storage] Error inserting into rule_suggestions table:", error);
      
      // Check for PostgreSQL error codes
      const errorCode = error.code;
      const errorMessage = error.message || "";
      
      // PostgreSQL error code 42P01 = relation does not exist
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation")) {
        throw new Error("rule_suggestions table does not exist in database. Please run 'npm run db:push' to create the required tables.");
      }
      
      // PostgreSQL error code 08003 = connection does not exist, 08006 = connection failure
      if (errorCode === "08003" || errorCode === "08006" || 
          errorMessage.includes("connection") || errorMessage.includes("timeout") ||
          errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
        throw new Error("Database connection error. Please check DATABASE_URL environment variable.");
      }
      
      // PostgreSQL error code 23505 = unique violation
      if (errorCode === "23505") {
        throw new Error("A rule suggestion with this ID already exists.");
      }
      
      // PostgreSQL error code 23502 = not null violation
      if (errorCode === "23502") {
        throw new Error("Missing required field. Please ensure all fields are provided.");
      }
      
      // Re-throw with more context
      throw new Error(`Database error: ${errorMessage || "Unknown error occurred"}`);
    }
  }

  async getRuleSuggestionById(id: string): Promise<RuleSuggestion | undefined> {
    try {
      console.log("[Storage] Querying rule_suggestions table for rule ID:", id);
      const [row] = await db
        .select()
        .from(ruleSuggestionsTable)
        .where(eq(ruleSuggestionsTable.id, id));

      if (!row) {
        console.log("[Storage] Rule suggestion not found in rule_suggestions table for ID:", id);
        return undefined;
      }

      console.log("[Storage] Found rule suggestion in rule_suggestions table:", id);
      return {
        id: row.id,
        leagueId: row.leagueId,
        authorId: row.authorId,
        authorName: row.authorName,
        rosterId: row.rosterId,
        title: row.title,
        description: row.description,
        status: row.status as "pending" | "approved" | "rejected",
        upvotes: [],
        downvotes: [],
        createdAt: row.createdAt,
      };
    } catch (error: any) {
      console.error("[Storage] Error querying rule_suggestions table by ID:", error);
      if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
        throw new Error("rule_suggestions table does not exist in database. Please run migrations.");
      }
      throw error;
    }
  }

  async updateRuleSuggestion(id: string, data: { title?: string; description?: string }): Promise<RuleSuggestion | undefined> {
    try {
      console.log("[Storage] Updating rule_suggestions table for rule ID:", id);
      const updateData: { title?: string; description?: string } = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.description !== undefined) updateData.description = data.description;

      if (Object.keys(updateData).length === 0) {
        // No updates to make, just return the existing rule
        return this.getRuleSuggestionById(id);
      }

      const [updated] = await db
        .update(ruleSuggestionsTable)
        .set(updateData)
        .where(eq(ruleSuggestionsTable.id, id))
        .returning();

      if (!updated) {
        console.log("[Storage] Rule suggestion not found in rule_suggestions table for update. ID:", id);
        return undefined;
      }

      console.log("[Storage] Successfully updated rule_suggestions table. ID:", id);
      return {
        id: updated.id,
        leagueId: updated.leagueId,
        authorId: updated.authorId,
        authorName: updated.authorName,
        rosterId: updated.rosterId,
        title: updated.title,
        description: updated.description,
        status: updated.status as "pending" | "approved" | "rejected",
        upvotes: [],
        downvotes: [],
        createdAt: updated.createdAt,
      };
    } catch (error: any) {
      console.error("[Storage] Error updating rule_suggestions table:", error);
      if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
        throw new Error("rule_suggestions table does not exist in database. Please run migrations.");
      }
      throw error;
    }
  }

  async updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined> {
    const [updated] = await db
      .update(ruleSuggestionsTable)
      .set({ status })
      .where(eq(ruleSuggestionsTable.id, id))
      .returning();

    if (!updated) return undefined;

    return {
      id: updated.id,
      leagueId: updated.leagueId,
      authorId: updated.authorId,
      authorName: updated.authorName,
      rosterId: updated.rosterId,
      title: updated.title,
      description: updated.description,
      status: updated.status as "pending" | "approved" | "rejected",
      upvotes: [],
      downvotes: [],
      createdAt: updated.createdAt,
    };
  }

  async deleteRuleSuggestion(id: string): Promise<void> {
    try {
      console.log("[Storage] Deleting from rule_suggestions table. Rule ID:", id);
      
      // First delete all associated votes
      await db
        .delete(ruleVotesTable)
        .where(eq(ruleVotesTable.ruleId, id));
      
      // Then delete the rule suggestion
      await db
        .delete(ruleSuggestionsTable)
        .where(eq(ruleSuggestionsTable.id, id));
      
      console.log("[Storage] Successfully deleted from rule_suggestions table. Rule ID:", id);
    } catch (error: any) {
      console.error("[Storage] Error deleting from rule_suggestions table:", error);
      if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
        throw new Error("rule_suggestions table does not exist in database. Please run migrations.");
      }
      throw error;
    }
  }

  async getRuleVotes(ruleId: string): Promise<RuleVote[]> {
    const rows = await db
      .select()
      .from(ruleVotesTable)
      .where(eq(ruleVotesTable.ruleId, ruleId));

    return rows.map(row => ({
      id: row.id,
      ruleId: row.ruleId,
      rosterId: row.rosterId,
      voterName: row.voterName,
      vote: row.vote as "approve" | "reject",
      createdAt: row.createdAt,
    }));
  }

  async castRuleVote(data: InsertRuleVote): Promise<RuleVote> {
    const existing = await this.getRuleVoteByRoster(data.ruleId, data.rosterId);

    if (existing) {
      const [updated] = await db
        .update(ruleVotesTable)
        .set({ vote: data.vote, voterName: data.voterName })
        .where(eq(ruleVotesTable.id, existing.id))
        .returning();

      return {
        id: updated.id,
        ruleId: updated.ruleId,
        rosterId: updated.rosterId,
        voterName: updated.voterName,
        vote: updated.vote as "approve" | "reject",
        createdAt: updated.createdAt,
      };
    }

    const id = randomUUID();
    const createdAt = Date.now();

    await db.insert(ruleVotesTable).values({
      id,
      ruleId: data.ruleId,
      rosterId: data.rosterId,
      voterName: data.voterName,
      vote: data.vote,
      createdAt,
    });

    return {
      id,
      ...data,
      createdAt,
    };
  }

  async getRuleVoteByRoster(ruleId: string, rosterId: number): Promise<RuleVote | undefined> {
    const [row] = await db
      .select()
      .from(ruleVotesTable)
      .where(and(
        eq(ruleVotesTable.ruleId, ruleId),
        eq(ruleVotesTable.rosterId, rosterId)
      ));

    if (!row) return undefined;

    return {
      id: row.id,
      ruleId: row.ruleId,
      rosterId: row.rosterId,
      voterName: row.voterName,
      vote: row.vote as "approve" | "reject",
      createdAt: row.createdAt,
    };
  }

  async getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm"): Promise<AwardNomination[]> {
    const rows = await db
      .select()
      .from(awardNominationsTable)
      .where(and(
        eq(awardNominationsTable.leagueId, leagueId),
        eq(awardNominationsTable.season, season),
        eq(awardNominationsTable.awardType, awardType)
      ))
      .orderBy(desc(awardNominationsTable.createdAt));

    return rows.map(row => ({
      id: row.id,
      leagueId: row.leagueId,
      season: row.season,
      awardType: row.awardType as "mvp" | "roy" | "gm",
      playerId: row.playerId,
      playerName: row.playerName,
      playerPosition: row.playerPosition,
      playerTeam: row.playerTeam,
      nominatedBy: row.nominatedBy,
      nominatedByName: row.nominatedByName,
      nominatedByRosterId: row.nominatedByRosterId,
      createdAt: row.createdAt,
    }));
  }

  async createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination> {
    const [existing] = await db
      .select()
      .from(awardNominationsTable)
      .where(and(
        eq(awardNominationsTable.leagueId, data.leagueId),
        eq(awardNominationsTable.season, data.season),
        eq(awardNominationsTable.awardType, data.awardType),
        eq(awardNominationsTable.playerId, data.playerId)
      ));

    if (existing) {
      return {
        id: existing.id,
        leagueId: existing.leagueId,
        season: existing.season,
        awardType: existing.awardType as "mvp" | "roy" | "gm",
        playerId: existing.playerId,
        playerName: existing.playerName,
        playerPosition: existing.playerPosition,
        playerTeam: existing.playerTeam,
        nominatedBy: existing.nominatedBy,
        nominatedByName: existing.nominatedByName,
        nominatedByRosterId: existing.nominatedByRosterId,
        createdAt: existing.createdAt,
      };
    }

    const id = randomUUID();
    const createdAt = Date.now();

    await db.insert(awardNominationsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      awardType: data.awardType,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      playerTeam: data.playerTeam,
      nominatedBy: data.nominatedBy,
      nominatedByName: data.nominatedByName,
      nominatedByRosterId: data.nominatedByRosterId,
      createdAt,
    });

    return {
      id,
      ...data,
      createdAt,
    };
  }

  async getNominationCountByRoster(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm", rosterId: number): Promise<number> {
    const rows = await db
      .select()
      .from(awardNominationsTable)
      .where(and(
        eq(awardNominationsTable.leagueId, leagueId),
        eq(awardNominationsTable.season, season),
        eq(awardNominationsTable.awardType, awardType),
        eq(awardNominationsTable.nominatedByRosterId, rosterId)
      ));

    return rows.length;
  }

  async getAwardBallots(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm"): Promise<AwardBallot[]> {
    const rows = await db
      .select()
      .from(awardBallotsTable)
      .where(and(
        eq(awardBallotsTable.leagueId, leagueId),
        eq(awardBallotsTable.season, season),
        eq(awardBallotsTable.awardType, awardType)
      ));

    return rows.map(row => ({
      id: row.id,
      leagueId: row.leagueId,
      season: row.season,
      awardType: row.awardType as "mvp" | "roy" | "gm",
      rosterId: row.rosterId,
      voterName: row.voterName,
      firstPlaceId: row.firstPlaceId,
      secondPlaceId: row.secondPlaceId,
      thirdPlaceId: row.thirdPlaceId,
      createdAt: row.createdAt,
    }));
  }

  async upsertAwardBallot(data: InsertAwardBallot): Promise<AwardBallot> {
    const existing = await this.getAwardBallotByRoster(data.leagueId, data.season, data.awardType, data.rosterId);

    if (existing) {
      const [updated] = await db
        .update(awardBallotsTable)
        .set({
          firstPlaceId: data.firstPlaceId,
          secondPlaceId: data.secondPlaceId,
          thirdPlaceId: data.thirdPlaceId,
          voterName: data.voterName,
        })
        .where(eq(awardBallotsTable.id, existing.id))
        .returning();

      return {
        id: updated.id,
        leagueId: updated.leagueId,
        season: updated.season,
        awardType: updated.awardType as "mvp" | "roy" | "gm",
        rosterId: updated.rosterId,
        voterName: updated.voterName,
        firstPlaceId: updated.firstPlaceId,
        secondPlaceId: updated.secondPlaceId,
        thirdPlaceId: updated.thirdPlaceId,
        createdAt: updated.createdAt,
      };
    }

    const id = randomUUID();
    const createdAt = Date.now();

    await db.insert(awardBallotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      awardType: data.awardType,
      rosterId: data.rosterId,
      voterName: data.voterName,
      firstPlaceId: data.firstPlaceId,
      secondPlaceId: data.secondPlaceId,
      thirdPlaceId: data.thirdPlaceId,
      createdAt,
    });

    return {
      id,
      ...data,
      createdAt,
    };
  }

  async getAwardBallotByRoster(leagueId: string, season: string, awardType: "mvp" | "roy" | "gm", rosterId: number): Promise<AwardBallot | undefined> {
    const [row] = await db
      .select()
      .from(awardBallotsTable)
      .where(and(
        eq(awardBallotsTable.leagueId, leagueId),
        eq(awardBallotsTable.season, season),
        eq(awardBallotsTable.awardType, awardType),
        eq(awardBallotsTable.rosterId, rosterId)
      ));

    if (!row) return undefined;

    return {
      id: row.id,
      leagueId: row.leagueId,
      season: row.season,
      awardType: row.awardType as "mvp" | "roy" | "gm",
      rosterId: row.rosterId,
      voterName: row.voterName,
      firstPlaceId: row.firstPlaceId,
      secondPlaceId: row.secondPlaceId,
      thirdPlaceId: row.thirdPlaceId,
      createdAt: row.createdAt,
    };
  }

  async getLeagueSetting(leagueId: string, settingKey: string): Promise<string | undefined> {
    const [row] = await db
      .select()
      .from(leagueSettingsTable)
      .where(and(
        eq(leagueSettingsTable.leagueId, leagueId),
        eq(leagueSettingsTable.settingKey, settingKey)
      ));

    return row?.settingValue;
  }

  async setLeagueSetting(leagueId: string, settingKey: string, settingValue: string): Promise<LeagueSetting> {
    const [existing] = await db
      .select()
      .from(leagueSettingsTable)
      .where(and(
        eq(leagueSettingsTable.leagueId, leagueId),
        eq(leagueSettingsTable.settingKey, settingKey)
      ));

    const updatedAt = Date.now();

    if (existing) {
      await db
        .update(leagueSettingsTable)
        .set({ settingValue, updatedAt })
        .where(eq(leagueSettingsTable.id, existing.id));

      return {
        ...existing,
        settingValue,
        updatedAt,
      };
    }

    const id = randomUUID();
    await db.insert(leagueSettingsTable).values({
      id,
      leagueId,
      settingKey,
      settingValue,
      updatedAt,
    });

    return {
      id,
      leagueId,
      settingKey,
      settingValue,
      updatedAt,
    };
  }

  async getPlayerContracts(leagueId: string): Promise<PlayerContract[]> {
    const rows = await db
      .select()
      .from(playerContractsTable)
      .where(eq(playerContractsTable.leagueId, leagueId));

    return rows;
  }

  async upsertPlayerContract(data: InsertPlayerContract): Promise<PlayerContract> {
    const [existing] = await db
      .select()
      .from(playerContractsTable)
      .where(and(
        eq(playerContractsTable.leagueId, data.leagueId),
        eq(playerContractsTable.rosterId, data.rosterId),
        eq(playerContractsTable.playerId, data.playerId)
      ));

    const updatedAt = Date.now();

    if (existing) {
      const [updated] = await db
        .update(playerContractsTable)
        .set({
          salary2025: data.salary2025,
          salary2026: data.salary2026,
          salary2027: data.salary2027,
          salary2028: data.salary2028,
          salary2029: (data as any).salary2029 ?? existing.salary2029,
          fifthYearOption: data.fifthYearOption,
          isOnIr: data.isOnIr ?? existing.isOnIr,
          franchiseTagUsed: data.franchiseTagUsed ?? existing.franchiseTagUsed,
          franchiseTagYear: data.franchiseTagYear ?? existing.franchiseTagYear,
          originalContractYears: data.originalContractYears ?? existing.originalContractYears,
          extensionApplied: data.extensionApplied ?? existing.extensionApplied,
          extensionYear: data.extensionYear ?? existing.extensionYear,
          extensionSalary: data.extensionSalary ?? existing.extensionSalary,
          extensionType: (data as any).extensionType ?? existing.extensionType,
          updatedAt,
        })
        .where(eq(playerContractsTable.id, existing.id))
        .returning();

      return updated;
    }

    const id = randomUUID();
    const [inserted] = await db.insert(playerContractsTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      salary2025: data.salary2025,
      salary2026: data.salary2026,
      salary2027: data.salary2027,
      salary2028: data.salary2028,
      salary2029: (data as any).salary2029 ?? 0,
      fifthYearOption: data.fifthYearOption,
      isOnIr: data.isOnIr ?? 0,
      franchiseTagUsed: data.franchiseTagUsed ?? 0,
      franchiseTagYear: data.franchiseTagYear ?? null,
      originalContractYears: data.originalContractYears ?? 1,
      extensionApplied: data.extensionApplied ?? 0,
      extensionYear: data.extensionYear ?? null,
      extensionSalary: data.extensionSalary ?? null,
      extensionType: (data as any).extensionType ?? null,
      updatedAt,
    }).returning();

    return inserted;
  }

  async deletePlayerContract(leagueId: string, rosterId: number, playerId: string): Promise<void> {
    await db
      .delete(playerContractsTable)
      .where(and(
        eq(playerContractsTable.leagueId, leagueId),
        eq(playerContractsTable.rosterId, rosterId),
        eq(playerContractsTable.playerId, playerId)
      ));
  }

  async getPlayerBidsByRoster(leagueId: string, rosterId: number): Promise<PlayerBid[]> {
    const rows = await db
      .select()
      .from(playerBidsTable)
      .where(and(
        eq(playerBidsTable.leagueId, leagueId),
        eq(playerBidsTable.rosterId, rosterId)
      ))
      .orderBy(desc(playerBidsTable.createdAt));

    return rows;
  }

  async createPlayerBid(data: InsertPlayerBid): Promise<PlayerBid> {
    const id = randomUUID();
    const now = Date.now();

    const [inserted] = await db.insert(playerBidsTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      playerTeam: data.playerTeam,
      bidAmount: data.bidAmount,
      maxBid: data.maxBid,
      contractYears: data.contractYears,
      notes: data.notes,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).returning();

    return inserted;
  }

  async updatePlayerBid(id: string, rosterId: number, updates: Partial<InsertPlayerBid>): Promise<PlayerBid | undefined> {
    const [existing] = await db
      .select()
      .from(playerBidsTable)
      .where(and(
        eq(playerBidsTable.id, id),
        eq(playerBidsTable.rosterId, rosterId)
      ));

    if (!existing) return undefined;

    const [updated] = await db
      .update(playerBidsTable)
      .set({
        ...updates,
        updatedAt: Date.now(),
      })
      .where(and(
        eq(playerBidsTable.id, id),
        eq(playerBidsTable.rosterId, rosterId)
      ))
      .returning();

    return updated;
  }

  async deletePlayerBid(id: string, rosterId: number): Promise<void> {
    await db
      .delete(playerBidsTable)
      .where(and(
        eq(playerBidsTable.id, id),
        eq(playerBidsTable.rosterId, rosterId)
      ));
  }

  async getDeadCapEntriesByLeague(leagueId: string): Promise<DeadCapEntry[]> {
    const rows = await db
      .select()
      .from(deadCapEntriesTable)
      .where(eq(deadCapEntriesTable.leagueId, leagueId))
      .orderBy(desc(deadCapEntriesTable.createdAt));

    return rows;
  }

  async createDeadCapEntry(data: InsertDeadCapEntry): Promise<DeadCapEntry> {
    const id = randomUUID();
    const now = Date.now();

    const [inserted] = await db.insert(deadCapEntriesTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      reason: data.reason,
      deadCap2025: data.deadCap2025,
      deadCap2026: data.deadCap2026,
      deadCap2027: data.deadCap2027,
      deadCap2028: data.deadCap2028,
      createdAt: now,
    }).returning();

    return inserted;
  }

  async deleteDeadCapEntry(id: string): Promise<void> {
    await db
      .delete(deadCapEntriesTable)
      .where(eq(deadCapEntriesTable.id, id));
  }

  async getSavedContractDrafts(leagueId: string, rosterId: number): Promise<SavedContractDraft[]> {
    const rows = await db
      .select()
      .from(savedContractDraftsTable)
      .where(and(
        eq(savedContractDraftsTable.leagueId, leagueId),
        eq(savedContractDraftsTable.rosterId, rosterId)
      ))
      .orderBy(desc(savedContractDraftsTable.updatedAt));

    return rows;
  }

  async upsertSavedContractDraft(data: InsertSavedContractDraft): Promise<SavedContractDraft> {
    const now = Date.now();
    
    const [existing] = await db
      .select()
      .from(savedContractDraftsTable)
      .where(and(
        eq(savedContractDraftsTable.leagueId, data.leagueId),
        eq(savedContractDraftsTable.rosterId, data.rosterId),
        eq(savedContractDraftsTable.playerId, data.playerId)
      ));

    if (existing) {
      const [updated] = await db
        .update(savedContractDraftsTable)
        .set({
          playerName: data.playerName,
          playerPosition: data.playerPosition,
          salary2025: data.salary2025,
          salary2026: data.salary2026,
          salary2027: data.salary2027,
          salary2028: data.salary2028,
          salary2029: (data as any).salary2029 ?? existing.salary2029,
          franchiseTagApplied: data.franchiseTagApplied,
          updatedAt: now,
        })
        .where(eq(savedContractDraftsTable.id, existing.id))
        .returning();
      return updated;
    }

    const id = randomUUID();
    const [inserted] = await db.insert(savedContractDraftsTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      playerName: data.playerName,
      playerPosition: data.playerPosition,
      salary2025: data.salary2025,
      salary2026: data.salary2026,
      salary2027: data.salary2027,
      salary2028: data.salary2028,
      salary2029: (data as any).salary2029 ?? 0,
      franchiseTagApplied: data.franchiseTagApplied,
      updatedAt: now,
    }).returning();

    return inserted;
  }

  async deleteSavedContractDraft(leagueId: string, rosterId: number, playerId: string): Promise<void> {
    await db
      .delete(savedContractDraftsTable)
      .where(and(
        eq(savedContractDraftsTable.leagueId, leagueId),
        eq(savedContractDraftsTable.rosterId, rosterId),
        eq(savedContractDraftsTable.playerId, playerId)
      ));
  }

  async deleteAllSavedContractDrafts(leagueId: string, rosterId: number): Promise<void> {
    await db
      .delete(savedContractDraftsTable)
      .where(and(
        eq(savedContractDraftsTable.leagueId, leagueId),
        eq(savedContractDraftsTable.rosterId, rosterId)
      ));
  }

  async getContractApprovalRequests(leagueId: string): Promise<ContractApprovalRequest[]> {
    const rows = await db
      .select()
      .from(contractApprovalRequestsTable)
      .where(eq(contractApprovalRequestsTable.leagueId, leagueId))
      .orderBy(desc(contractApprovalRequestsTable.submittedAt));

    return rows;
  }

  async getContractApprovalRequestByRoster(leagueId: string, rosterId: number): Promise<ContractApprovalRequest | undefined> {
    const [row] = await db
      .select()
      .from(contractApprovalRequestsTable)
      .where(and(
        eq(contractApprovalRequestsTable.leagueId, leagueId),
        eq(contractApprovalRequestsTable.rosterId, rosterId),
        eq(contractApprovalRequestsTable.status, "pending")
      ));

    return row;
  }

  async createContractApprovalRequest(data: InsertContractApprovalRequest): Promise<ContractApprovalRequest> {
    const id = randomUUID();
    const now = Date.now();

    const [inserted] = await db.insert(contractApprovalRequestsTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      teamName: data.teamName,
      ownerName: data.ownerName,
      contractsJson: data.contractsJson,
      status: "pending",
      submittedAt: now,
    }).returning();

    return inserted;
  }

  async updateContractApprovalRequest(id: string, status: "pending" | "approved" | "rejected", reviewerNotes?: string): Promise<ContractApprovalRequest | undefined> {
    const [existing] = await db
      .select()
      .from(contractApprovalRequestsTable)
      .where(eq(contractApprovalRequestsTable.id, id));

    if (!existing) return undefined;

    const [updated] = await db
      .update(contractApprovalRequestsTable)
      .set({
        status,
        reviewedAt: Date.now(),
        reviewerNotes: reviewerNotes || null,
      })
      .where(eq(contractApprovalRequestsTable.id, id))
      .returning();

    return updated;
  }

  async deleteContractApprovalRequest(id: string): Promise<void> {
    await db
      .delete(contractApprovalRequestsTable)
      .where(eq(contractApprovalRequestsTable.id, id));
  }

  async getTeamExtensions(leagueId: string, season: number): Promise<TeamExtension[]> {
    const rows = await db
      .select()
      .from(teamExtensionsTable)
      .where(and(
        eq(teamExtensionsTable.leagueId, leagueId),
        eq(teamExtensionsTable.season, season)
      ))
      .orderBy(desc(teamExtensionsTable.createdAt));

    return rows;
  }

  async getTeamExtensionByRoster(leagueId: string, rosterId: number, season: number): Promise<TeamExtension | undefined> {
    const [row] = await db
      .select()
      .from(teamExtensionsTable)
      .where(and(
        eq(teamExtensionsTable.leagueId, leagueId),
        eq(teamExtensionsTable.rosterId, rosterId),
        eq(teamExtensionsTable.season, season)
      ));

    return row;
  }

  async createTeamExtension(data: InsertTeamExtension): Promise<TeamExtension> {
    const id = randomUUID();
    const now = Date.now();

    const [inserted] = await db.insert(teamExtensionsTable).values({
      id,
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      season: data.season,
      playerId: data.playerId,
      playerName: data.playerName,
      extensionSalary: data.extensionSalary,
      extensionYear: data.extensionYear,
      extensionType: data.extensionType || 1,
      extensionSalary2: data.extensionSalary2 || null,
      createdAt: now,
    }).returning();

    return inserted;
  }

  async deleteTeamExtension(leagueId: string, rosterId: number, season: number): Promise<void> {
    await db
      .delete(teamExtensionsTable)
      .where(and(
        eq(teamExtensionsTable.leagueId, leagueId),
        eq(teamExtensionsTable.rosterId, rosterId),
        eq(teamExtensionsTable.season, season)
      ));
  }

  // Database inspection methods
  async getTableList(): Promise<Array<{ name: string; rowCount: number }>> {
    try {
      // Get list of tables from information_schema
      const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      const tableList = [];
      for (const row of tables.rows as Array<{ table_name: string }>) {
        const tableName = row.table_name;
        try {
          // Get row count for each table
          const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${sql.identifier(tableName)}`));
          const rowCount = parseInt((countResult.rows[0] as { count: string }).count || "0", 10);
          tableList.push({ name: tableName, rowCount });
        } catch (error) {
          // If we can't count rows, still include the table with 0 count
          console.warn(`[Storage] Could not get row count for table ${tableName}:`, error);
          tableList.push({ name: tableName, rowCount: 0 });
        }
      }

      return tableList;
    } catch (error: any) {
      console.error("[Storage] Error getting table list:", error);
      throw new Error(`Failed to get table list: ${error.message}`);
    }
  }

  async getTableSchema(tableName: string): Promise<Array<{ column: string; type: string; nullable: boolean; default: string | null }>> {
    try {
      const schema = await db.execute(sql`
        SELECT 
          column_name as column,
          data_type as type,
          is_nullable = 'YES' as nullable,
          column_default as default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);

      return (schema.rows as Array<{ column: string; type: string; nullable: boolean; default: string | null }>).map(row => ({
        column: row.column,
        type: row.type,
        nullable: row.nullable,
        default: row.default,
      }));
    } catch (error: any) {
      console.error(`[Storage] Error getting schema for table ${tableName}:`, error);
      throw new Error(`Failed to get table schema: ${error.message}`);
    }
  }

  async getTableData(tableName: string, limit: number, offset: number, filters?: Record<string, any>): Promise<any[]> {
    try {
      // Map table names to their Drizzle table objects
      const tableMap: Record<string, any> = {
        rule_suggestions: ruleSuggestionsTable,
        rule_votes: ruleVotesTable,
        award_nominations: awardNominationsTable,
        award_ballots: awardBallotsTable,
        league_settings: leagueSettingsTable,
        player_contracts: playerContractsTable,
        player_bids: playerBidsTable,
        dead_cap_entries: deadCapEntriesTable,
        saved_contract_drafts: savedContractDraftsTable,
        contract_approval_requests: contractApprovalRequestsTable,
        team_extensions: teamExtensionsTable,
      };

      const table = tableMap[tableName];
      if (!table) {
        throw new Error(`Table ${tableName} not found in table map`);
      }

      // Build where conditions from filters
      const conditions = [];
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null && value !== "") {
            // Map snake_case to camelCase for column names
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            const column = (table as any)[camelKey] || (table as any)[key];
            if (column) {
              conditions.push(eq(column, value));
            }
          }
        }
      }

      let query = db.select().from(table);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      // Try to order by createdAt, id, or updatedAt (whichever exists)
      try {
        const tableObj = table as any;
        if (tableObj.createdAt) {
          query = query.orderBy(desc(tableObj.createdAt)) as any;
        } else if (tableObj.id) {
          query = query.orderBy(desc(tableObj.id)) as any;
        } else if (tableObj.updatedAt) {
          query = query.orderBy(desc(tableObj.updatedAt)) as any;
        }
      } catch {
        // If ordering fails, continue without orderBy
      }
      
      query = query.limit(limit).offset(offset) as any;
      const results = await query;
      return results;
    } catch (error: any) {
      console.error(`[Storage] Error getting data from table ${tableName}:`, error);
      throw new Error(`Failed to get table data: ${error.message}`);
    }
  }

  async getTableRowCount(tableName: string, filters?: Record<string, any>): Promise<number> {
    try {
      // Map table names to their Drizzle table objects
      const tableMap: Record<string, any> = {
        rule_suggestions: ruleSuggestionsTable,
        rule_votes: ruleVotesTable,
        award_nominations: awardNominationsTable,
        award_ballots: awardBallotsTable,
        league_settings: leagueSettingsTable,
        player_contracts: playerContractsTable,
        player_bids: playerBidsTable,
        dead_cap_entries: deadCapEntriesTable,
        saved_contract_drafts: savedContractDraftsTable,
        contract_approval_requests: contractApprovalRequestsTable,
        team_extensions: teamExtensionsTable,
      };

      const table = tableMap[tableName];
      if (!table) {
        throw new Error(`Table ${tableName} not found in table map`);
      }

      // Build where conditions from filters
      // Map filter keys (snake_case or camelCase) to Drizzle column objects
      const columnMap: Record<string, any> = {};
      for (const key in table) {
        if (key !== 'getSQL' && typeof table[key] === 'object' && table[key] !== null) {
          // Store both camelCase and snake_case versions
          columnMap[key] = table[key];
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          columnMap[snakeKey] = table[key];
        }
      }

      const conditions = [];
      if (filters) {
        for (const [key, value] of Object.entries(filters)) {
          if (value !== undefined && value !== null && value !== "") {
            const column = columnMap[key];
            if (column) {
              conditions.push(eq(column, value));
            }
          }
        }
      }

      let query = db.select({ count: sql<number>`count(*)` }).from(table);
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const result = await query;
      return result[0]?.count || 0;
    } catch (error: any) {
      console.error(`[Storage] Error getting row count for table ${tableName}:`, error);
      throw new Error(`Failed to get table row count: ${error.message}`);
    }
  }
}

export const storage = new DatabaseStorage();
