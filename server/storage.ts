import { randomUUID } from "crypto";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
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
  leagueMigrationsTable,
  rosterMappingsTable,
  activeLeaguesTable,
  standingsSnapshotsTable,
  playerStatsSnapshotsTable,
  teamStatsSnapshotsTable,
  draftSnapshotsTable,
  matchupSnapshotsTable,
  transactionSnapshotsTable,
  favoriteExpiringPlayersTable,
} from "../shared/schema";
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
  TeamExtension, InsertTeamExtension,
  LeagueMigration, InsertLeagueMigration,
  RosterMapping, InsertRosterMapping,
  ActiveLeague, InsertActiveLeague,
  StandingsSnapshot, InsertStandingsSnapshot,
  PlayerStatsSnapshot, InsertPlayerStatsSnapshot,
  TeamStatsSnapshot, InsertTeamStatsSnapshot,
  DraftSnapshot, InsertDraftSnapshot,
  MatchupSnapshot, InsertMatchupSnapshot,
  TransactionSnapshot, InsertTransactionSnapshot,
  FavoriteExpiringPlayer, InsertFavoriteExpiringPlayer,
} from "../shared/schema";

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
  getAllPlayerBids(leagueId: string): Promise<PlayerBid[]>;
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

  // Active league tracking
  getActiveLeague(): Promise<ActiveLeague | undefined>;
  listLeagues(): Promise<ActiveLeague[]>;
  upsertActiveLeague(data: InsertActiveLeague): Promise<ActiveLeague>;
  deactivateLeague(leagueId: string): Promise<void>;

  // League migration + roster mapping
  createLeagueMigration(data: InsertLeagueMigration): Promise<LeagueMigration>;
  updateLeagueMigration(id: string, updates: Partial<InsertLeagueMigration> & { status?: string; errorMessage?: string | null }): Promise<LeagueMigration | undefined>;
  createRosterMapping(data: InsertRosterMapping): Promise<RosterMapping>;
  getRosterMappings(migrationId: string): Promise<RosterMapping[]>;

  // Snapshot storage
  createStandingsSnapshot(data: InsertStandingsSnapshot): Promise<StandingsSnapshot>;
  createPlayerStatsSnapshot(data: InsertPlayerStatsSnapshot): Promise<PlayerStatsSnapshot>;
  createTeamStatsSnapshot(data: InsertTeamStatsSnapshot): Promise<TeamStatsSnapshot>;
  createDraftSnapshot(data: InsertDraftSnapshot): Promise<DraftSnapshot>;
  createMatchupSnapshot(data: InsertMatchupSnapshot): Promise<MatchupSnapshot>;
  createTransactionSnapshot(data: InsertTransactionSnapshot): Promise<TransactionSnapshot>;
  getStandingsSnapshots(leagueId: string, season: string, week?: number | null): Promise<StandingsSnapshot[]>;
  getPlayerStatsSnapshots(leagueId: string, season: string, week?: number | null): Promise<PlayerStatsSnapshot[]>;
  getTeamStatsSnapshots(leagueId: string, season: string, week?: number | null): Promise<TeamStatsSnapshot[]>;
  getDraftSnapshots(leagueId: string, season: string): Promise<DraftSnapshot[]>;
  getMatchupSnapshots(leagueId: string, season: string, week: number): Promise<MatchupSnapshot[]>;
  getTransactionSnapshots(leagueId: string, season: string, week: number): Promise<TransactionSnapshot[]>;

  // Bidding reset
  deleteAllPlayerBids(leagueId: string): Promise<void>;
  
  // Favorite expiring players
  getFavoriteExpiringPlayers(leagueId: string, rosterId: number): Promise<FavoriteExpiringPlayer[]>;
  addFavoriteExpiringPlayer(data: InsertFavoriteExpiringPlayer): Promise<FavoriteExpiringPlayer>;
  removeFavoriteExpiringPlayer(leagueId: string, rosterId: number, playerId: string): Promise<void>;

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

  async getRuleSuggestions(leagueId: string): Promise<RuleSuggestion[]> {
    try {
      const rows = await db
        .select()
        .from(ruleSuggestionsTable)
        .where(eq(ruleSuggestionsTable.leagueId, leagueId))
        .orderBy(desc(ruleSuggestionsTable.createdAt));

      return rows.map(row => ({
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
      }));
    } catch (error: any) {
      console.error("[Storage] Error fetching rule suggestions:", error);
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code;
      
      // Check if table doesn't exist
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation")) {
        throw new Error(`Database table 'rule_suggestions' does not exist. Please run 'npm run db:push' to create the required tables.`);
      }
      
      throw error;
    }
  }

  async createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion> {
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

    return {
      id,
      ...data,
      status: "pending",
      upvotes: [],
      downvotes: [],
      createdAt,
    };
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
      // If rosterId changed, this is a player moving teams - reset tracking flags
      const isNewRoster = existing.rosterId !== data.rosterId;
      
      // Build update object, conditionally including tracking fields
      const updateData: any = {
          salaries: (data as any).salaries ?? existing.salaries,
          fifthYearOption: data.fifthYearOption,
          isOnIr: data.isOnIr ?? existing.isOnIr,
          franchiseTagUsed: data.franchiseTagUsed ?? existing.franchiseTagUsed,
          franchiseTagYear: data.franchiseTagYear ?? existing.franchiseTagYear,
          originalContractYears: data.originalContractYears !== undefined ? data.originalContractYears : existing.originalContractYears,
          isRookieContract: (data as any).isRookieContract ?? existing.isRookieContract,
          extensionApplied: data.extensionApplied ?? existing.extensionApplied,
          extensionYear: data.extensionYear ?? existing.extensionYear,
          extensionSalary: data.extensionSalary ?? existing.extensionSalary,
          extensionType: (data as any).extensionType ?? existing.extensionType,
        updatedAt: Date.now(),
      };

      // Only update hasBeenExtended and hasBeenFranchiseTagged if explicitly provided or if roster changed
      // This allows the code to work even if these database columns don't exist yet
      if (isNewRoster || (data as any).hasBeenExtended !== undefined) {
        updateData.hasBeenExtended = isNewRoster ? 0 : ((data as any).hasBeenExtended ?? existing.hasBeenExtended ?? 0);
      }
      if (isNewRoster || (data as any).hasBeenFranchiseTagged !== undefined) {
        updateData.hasBeenFranchiseTagged = isNewRoster ? 0 : ((data as any).hasBeenFranchiseTagged ?? existing.hasBeenFranchiseTagged ?? 0);
      }
      
      // Fix updatedAt to use the variable consistently
      updateData.updatedAt = updatedAt;
      
      try {
        const [updated] = await db
          .update(playerContractsTable)
          .set(updateData)
          .where(eq(playerContractsTable.id, existing.id))
          .returning();

        return updated;
      } catch (error: any) {
        // Handle missing column errors (PostgreSQL error code 42703 or error messages about missing columns)
        const errorCode = error?.code;
        const errorMessage = (error?.message || String(error) || '').toLowerCase();
        const isColumnError = errorCode === '42703' || 
                              (errorMessage.includes('column') && 
                               (errorMessage.includes('does not exist') || 
                                errorMessage.includes('undefined') ||
                                errorMessage.includes('unknown')));
        
        if (isColumnError && (updateData.hasBeenExtended !== undefined || updateData.hasBeenFranchiseTagged !== undefined)) {
          // Retry without the problematic tracking fields
          const retryUpdateData = { ...updateData };
          delete retryUpdateData.hasBeenExtended;
          delete retryUpdateData.hasBeenFranchiseTagged;
          
          const [updated] = await db
            .update(playerContractsTable)
            .set(retryUpdateData)
            .where(eq(playerContractsTable.id, existing.id))
            .returning();
          return updated;
        }

        // Handle not-null violation (23502) for has_been_extended / has_been_franchise_tagged
        const isNotNullError = errorCode === '23502' &&
          (errorMessage.includes('has_been_extended') || errorMessage.includes('has_been_franchise_tagged'));
        if (isNotNullError) {
          const retryUpdateData = {
            ...updateData,
            hasBeenExtended: updateData.hasBeenExtended ?? existing.hasBeenExtended ?? 0,
            hasBeenFranchiseTagged: updateData.hasBeenFranchiseTagged ?? existing.hasBeenFranchiseTagged ?? 0,
          };
          const [updated] = await db
            .update(playerContractsTable)
            .set(retryUpdateData)
            .where(eq(playerContractsTable.id, existing.id))
            .returning();
          return updated;
        }

        // Re-throw if it's not a column error or if retry didn't work
        throw error;
      }
    }

    // Build insert object, conditionally including tracking fields only if provided
    // This allows the code to work even if database columns don't exist yet
    const insertData: any = {
      id: randomUUID(),
      leagueId: data.leagueId,
      rosterId: data.rosterId,
      playerId: data.playerId,
      salaries: (data as any).salaries ?? "{}",
      fifthYearOption: data.fifthYearOption,
      isOnIr: data.isOnIr ?? 0,
      franchiseTagUsed: data.franchiseTagUsed ?? 0,
      franchiseTagYear: data.franchiseTagYear ?? null,
      originalContractYears: data.originalContractYears !== undefined ? data.originalContractYears : 1,
      isRookieContract: (data as any).isRookieContract ?? 0,
      extensionApplied: data.extensionApplied ?? 0,
      extensionYear: data.extensionYear ?? null,
      extensionSalary: data.extensionSalary ?? null,
      extensionType: (data as any).extensionType ?? null,
      updatedAt,
    };

    // Only include hasBeenExtended and hasBeenFranchiseTagged if explicitly provided
    // This allows the code to work even if these database columns don't exist yet
    if ((data as any).hasBeenExtended !== undefined) {
      insertData.hasBeenExtended = (data as any).hasBeenExtended;
    }
    if ((data as any).hasBeenFranchiseTagged !== undefined) {
      insertData.hasBeenFranchiseTagged = (data as any).hasBeenFranchiseTagged;
    }

    try {
      const [inserted] = await db.insert(playerContractsTable).values(insertData).returning();
      return inserted;
    } catch (error: any) {
      // Handle missing column errors (PostgreSQL error code 42703 or error messages about missing columns)
      const errorCode = error?.code;
      const errorMessage = (error?.message || String(error) || '').toLowerCase();
      const isColumnError = errorCode === '42703' || 
                            (errorMessage.includes('column') && 
                             (errorMessage.includes('does not exist') || 
                              errorMessage.includes('undefined') ||
                              errorMessage.includes('unknown')));
      
      if (isColumnError && (insertData.hasBeenExtended !== undefined || insertData.hasBeenFranchiseTagged !== undefined)) {
        // Retry without the problematic tracking fields
        const retryInsertData = { ...insertData };
        delete retryInsertData.hasBeenExtended;
        delete retryInsertData.hasBeenFranchiseTagged;
        
        const [inserted] = await db.insert(playerContractsTable).values(retryInsertData).returning();
        return inserted;
      }

      // Handle not-null violation (23502) for has_been_extended / has_been_franchise_tagged
      const isNotNullError = errorCode === '23502' &&
        (errorMessage.includes('has_been_extended') || errorMessage.includes('has_been_franchise_tagged'));
      if (isNotNullError) {
        const retryInsertData = { ...insertData, hasBeenExtended: 0, hasBeenFranchiseTagged: 0 };
        const [inserted] = await db.insert(playerContractsTable).values(retryInsertData).returning();
        return inserted;
      }
      
      // Re-throw if it's not a column error or if retry didn't work
      throw error;
    }
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

  async getAllPlayerBids(leagueId: string): Promise<PlayerBid[]> {
    console.log(`[Storage] getAllPlayerBids: Fetching all bids from playerBidsTable for league ${leagueId}`);
    const rows = await db
      .select()
      .from(playerBidsTable)
      .where(eq(playerBidsTable.leagueId, leagueId))
      .orderBy(desc(playerBidsTable.createdAt));
    
    console.log(`[Storage] getAllPlayerBids: Found ${rows.length} bids from playerBidsTable (same table used by createPlayerBid)`);
    return rows;
  }

  async createPlayerBid(data: InsertPlayerBid): Promise<PlayerBid> {
    console.log(`[Storage] createPlayerBid: Inserting bid into playerBidsTable for league ${data.leagueId}, player ${data.playerId}`);
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
      isRookieContract: (data as any).isRookieContract ?? 0,
      notes: data.notes,
      status: "active",
      createdAt: now,
      updatedAt: now,
    }).returning();

    console.log(`[Storage] createPlayerBid: Successfully inserted bid into playerBidsTable (same table used by getAllPlayerBids)`);
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
      deadCapSalaries: (data as any).deadCapSalaries ?? "{}",
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
          salaries: (data as any).salaries ?? existing.salaries,
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
      salaries: (data as any).salaries ?? "{}",
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

  async getTeamExtensionByRoster(leagueId: string, rosterId: number, season: number, extensionType?: number): Promise<TeamExtension | undefined> {
    const conditions = [
      eq(teamExtensionsTable.leagueId, leagueId),
      eq(teamExtensionsTable.rosterId, rosterId),
      eq(teamExtensionsTable.season, season)
    ];
    
    if (extensionType !== undefined) {
      conditions.push(eq(teamExtensionsTable.extensionType, extensionType));
    }
    
    const [row] = await db
      .select()
      .from(teamExtensionsTable)
      .where(and(...conditions));

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
      isRookieExtension: data.isRookieExtension || 0,
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

  async getActiveLeague(): Promise<ActiveLeague | undefined> {
    const [row] = await db
      .select()
      .from(activeLeaguesTable)
      .where(eq(activeLeaguesTable.isActive, 1))
      .orderBy(desc(activeLeaguesTable.activatedAt))
      .limit(1);
    return row;
  }

  async listLeagues(): Promise<ActiveLeague[]> {
    return db
      .select()
      .from(activeLeaguesTable)
      .orderBy(desc(activeLeaguesTable.activatedAt));
  }

  async upsertActiveLeague(data: InsertActiveLeague): Promise<ActiveLeague> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db
      .insert(activeLeaguesTable)
      .values({
        id,
        leagueId: data.leagueId,
        season: data.season,
        isActive: data.isActive ?? 1,
        activatedAt: now,
        deactivatedAt: data.deactivatedAt ?? null,
      })
      .onConflictDoUpdate({
        target: activeLeaguesTable.leagueId,
        set: {
          season: data.season,
          isActive: data.isActive ?? 1,
          activatedAt: now,
          deactivatedAt: data.deactivatedAt ?? null,
        },
      })
      .returning();
    return inserted;
  }

  async deactivateLeague(leagueId: string): Promise<void> {
    await db
      .update(activeLeaguesTable)
      .set({ isActive: 0, deactivatedAt: Date.now() })
      .where(eq(activeLeaguesTable.leagueId, leagueId));
  }

  async createLeagueMigration(data: InsertLeagueMigration): Promise<LeagueMigration> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db
      .insert(leagueMigrationsTable)
      .values({
        id,
        oldLeagueId: data.oldLeagueId,
        newLeagueId: data.newLeagueId,
        oldSeason: data.oldSeason,
        newSeason: data.newSeason,
        migratedBy: data.migratedBy,
        migratedAt: now,
        status: data.status ?? "completed",
        errorMessage: null,
      })
      .returning();
    return inserted;
  }

  async updateLeagueMigration(
    id: string,
    updates: Partial<InsertLeagueMigration> & { status?: string; errorMessage?: string | null }
  ): Promise<LeagueMigration | undefined> {
    const [row] = await db
      .update(leagueMigrationsTable)
      .set({
        oldLeagueId: updates.oldLeagueId,
        newLeagueId: updates.newLeagueId,
        oldSeason: updates.oldSeason,
        newSeason: updates.newSeason,
        migratedBy: updates.migratedBy,
        status: updates.status,
        errorMessage: updates.errorMessage ?? null,
      })
      .where(eq(leagueMigrationsTable.id, id))
      .returning();
    return row;
  }

  async createRosterMapping(data: InsertRosterMapping): Promise<RosterMapping> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db
      .insert(rosterMappingsTable)
      .values({
        id,
        migrationId: data.migrationId,
        oldLeagueId: data.oldLeagueId,
        oldRosterId: data.oldRosterId,
        newLeagueId: data.newLeagueId,
        newRosterId: data.newRosterId,
        mappingType: data.mappingType,
        mappedBy: data.mappedBy ?? null,
        mappedAt: now,
      })
      .returning();
    return inserted;
  }

  async getRosterMappings(migrationId: string): Promise<RosterMapping[]> {
    return db
      .select()
      .from(rosterMappingsTable)
      .where(eq(rosterMappingsTable.migrationId, migrationId))
      .orderBy(desc(rosterMappingsTable.mappedAt));
  }

  async createStandingsSnapshot(data: InsertStandingsSnapshot): Promise<StandingsSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(standingsSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week ?? null,
      snapshotType: data.snapshotType,
      standingsData: data.standingsData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async createPlayerStatsSnapshot(data: InsertPlayerStatsSnapshot): Promise<PlayerStatsSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(playerStatsSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week ?? null,
      playerId: data.playerId,
      statsData: data.statsData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async createTeamStatsSnapshot(data: InsertTeamStatsSnapshot): Promise<TeamStatsSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(teamStatsSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week ?? null,
      rosterId: data.rosterId,
      statsData: data.statsData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async createDraftSnapshot(data: InsertDraftSnapshot): Promise<DraftSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(draftSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      draftId: data.draftId,
      draftData: data.draftData,
      picksData: data.picksData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async createMatchupSnapshot(data: InsertMatchupSnapshot): Promise<MatchupSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(matchupSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week,
      matchupData: data.matchupData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async createTransactionSnapshot(data: InsertTransactionSnapshot): Promise<TransactionSnapshot> {
    const id = randomUUID();
    const now = Date.now();
    const [inserted] = await db.insert(transactionSnapshotsTable).values({
      id,
      leagueId: data.leagueId,
      season: data.season,
      week: data.week,
      transactionData: data.transactionData,
      createdAt: now,
    }).returning();
    return inserted;
  }

  async getStandingsSnapshots(leagueId: string, season: string, week?: number | null): Promise<StandingsSnapshot[]> {
    const conditions = [eq(standingsSnapshotsTable.leagueId, leagueId), eq(standingsSnapshotsTable.season, season)];
    if (week === null) {
      conditions.push(isNull(standingsSnapshotsTable.week));
    } else if (week !== undefined) {
      conditions.push(eq(standingsSnapshotsTable.week, week));
    }
    return db.select().from(standingsSnapshotsTable).where(and(...conditions));
  }

  async getPlayerStatsSnapshots(leagueId: string, season: string, week?: number | null): Promise<PlayerStatsSnapshot[]> {
    const conditions = [eq(playerStatsSnapshotsTable.leagueId, leagueId), eq(playerStatsSnapshotsTable.season, season)];
    if (week === null) {
      conditions.push(isNull(playerStatsSnapshotsTable.week));
    } else if (week !== undefined) {
      conditions.push(eq(playerStatsSnapshotsTable.week, week));
    }
    return db.select().from(playerStatsSnapshotsTable).where(and(...conditions));
  }

  async getTeamStatsSnapshots(leagueId: string, season: string, week?: number | null): Promise<TeamStatsSnapshot[]> {
    const conditions = [eq(teamStatsSnapshotsTable.leagueId, leagueId), eq(teamStatsSnapshotsTable.season, season)];
    if (week === null) {
      conditions.push(isNull(teamStatsSnapshotsTable.week));
    } else if (week !== undefined) {
      conditions.push(eq(teamStatsSnapshotsTable.week, week));
    }
    return db.select().from(teamStatsSnapshotsTable).where(and(...conditions));
  }

  async getDraftSnapshots(leagueId: string, season: string): Promise<DraftSnapshot[]> {
    return db
      .select()
      .from(draftSnapshotsTable)
      .where(and(eq(draftSnapshotsTable.leagueId, leagueId), eq(draftSnapshotsTable.season, season)));
  }

  async getMatchupSnapshots(leagueId: string, season: string, week: number): Promise<MatchupSnapshot[]> {
    return db
      .select()
      .from(matchupSnapshotsTable)
      .where(and(
        eq(matchupSnapshotsTable.leagueId, leagueId),
        eq(matchupSnapshotsTable.season, season),
        eq(matchupSnapshotsTable.week, week)
      ));
  }

  async getTransactionSnapshots(leagueId: string, season: string, week: number): Promise<TransactionSnapshot[]> {
    return db
      .select()
      .from(transactionSnapshotsTable)
      .where(and(
        eq(transactionSnapshotsTable.leagueId, leagueId),
        eq(transactionSnapshotsTable.season, season),
        eq(transactionSnapshotsTable.week, week)
      ));
  }

  async deleteAllPlayerBids(leagueId: string): Promise<void> {
    await db
      .delete(playerBidsTable)
      .where(eq(playerBidsTable.leagueId, leagueId));
  }

  // Database inspection methods
  async getTableList(): Promise<Array<{ name: string; rowCount: number }>> {
    try {
      // First, verify database connection by checking if DATABASE_URL is set
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL environment variable is not set. Database connection cannot be established.");
      }

      // Get list of tables from information_schema
      const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      console.log(`[Storage] Found ${tables.rows.length} tables in database`);

      // Return table list with row counts
      // For now, return all tables with 0 counts - counts can be fetched individually when viewing tables
      // This avoids SQL injection concerns with dynamic table names in COUNT queries
      const tableList = (tables.rows as Array<{ table_name: string }>).map(row => ({
        name: row.table_name,
        rowCount: 0, // Will be calculated on-demand when viewing table details
      }));

      return tableList;
    } catch (error: any) {
      console.error("[Storage] Error getting table list:", error);
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code;
      
      // Provide more specific error messages
      if (errorMessage.includes("DATABASE_URL")) {
        throw new Error("Database connection not configured. Please set DATABASE_URL environment variable.");
      }
      if (errorCode === "08003" || errorCode === "08006" || errorMessage.includes("connection")) {
        throw new Error("Database connection failed. Please check DATABASE_URL and ensure the database is accessible.");
      }
      if (errorCode === "42P01" || errorMessage.includes("does not exist") || errorMessage.includes("relation")) {
        throw new Error("Database schema issue. Please run 'npm run db:push' to create required tables.");
      }
      
      throw new Error(`Failed to get table list: ${errorMessage}`);
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
        league_migrations: leagueMigrationsTable,
        roster_mappings: rosterMappingsTable,
        active_leagues: activeLeaguesTable,
        standings_snapshots: standingsSnapshotsTable,
        player_stats_snapshots: playerStatsSnapshotsTable,
        team_stats_snapshots: teamStatsSnapshotsTable,
        draft_snapshots: draftSnapshotsTable,
        matchup_snapshots: matchupSnapshotsTable,
        transaction_snapshots: transactionSnapshotsTable,
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
        league_migrations: leagueMigrationsTable,
        roster_mappings: rosterMappingsTable,
        active_leagues: activeLeaguesTable,
        standings_snapshots: standingsSnapshotsTable,
        player_stats_snapshots: playerStatsSnapshotsTable,
        team_stats_snapshots: teamStatsSnapshotsTable,
        draft_snapshots: draftSnapshotsTable,
        matchup_snapshots: matchupSnapshotsTable,
        transaction_snapshots: transactionSnapshotsTable,
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

  // Favorite expiring players

  async getFavoriteExpiringPlayers(leagueId: string, rosterId: number): Promise<FavoriteExpiringPlayer[]> {
    return db
      .select()
      .from(favoriteExpiringPlayersTable)
      .where(
        and(
          eq(favoriteExpiringPlayersTable.leagueId, leagueId),
          eq(favoriteExpiringPlayersTable.rosterId, rosterId)
        )
      );
  }

  async addFavoriteExpiringPlayer(data: InsertFavoriteExpiringPlayer): Promise<FavoriteExpiringPlayer> {
    const id = randomUUID();
    const now = Date.now();

    // Check if already exists to avoid duplicates
    const existing = await db
      .select()
      .from(favoriteExpiringPlayersTable)
      .where(
        and(
          eq(favoriteExpiringPlayersTable.leagueId, data.leagueId),
          eq(favoriteExpiringPlayersTable.rosterId, data.rosterId),
          eq(favoriteExpiringPlayersTable.playerId, data.playerId)
        )
      );

    if (existing.length > 0) {
      return existing[0];
    }

    const [inserted] = await db
      .insert(favoriteExpiringPlayersTable)
      .values({ id, ...data, createdAt: now })
      .returning();

    return inserted;
  }

  async removeFavoriteExpiringPlayer(leagueId: string, rosterId: number, playerId: string): Promise<void> {
    await db
      .delete(favoriteExpiringPlayersTable)
      .where(
        and(
          eq(favoriteExpiringPlayersTable.leagueId, leagueId),
          eq(favoriteExpiringPlayersTable.rosterId, rosterId),
          eq(favoriteExpiringPlayersTable.playerId, playerId)
        )
      );
  }
}

export const storage = new DatabaseStorage();
