import { randomUUID } from "crypto";
import { eq, and, desc } from "drizzle-orm";
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
  ContractApprovalRequest, InsertContractApprovalRequest
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
  createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion>;
  updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined>;
  
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
      title: row.title,
      description: row.description,
      status: row.status as "pending" | "approved" | "rejected",
      upvotes: [],
      downvotes: [],
      createdAt: row.createdAt,
    }));
  }

  async createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion> {
    const id = randomUUID();
    const createdAt = Date.now();

    await db.insert(ruleSuggestionsTable).values({
      id,
      leagueId: data.leagueId,
      authorId: data.authorId,
      authorName: data.authorName,
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
      title: updated.title,
      description: updated.description,
      status: updated.status as "pending" | "approved" | "rejected",
      upvotes: [],
      downvotes: [],
      createdAt: updated.createdAt,
    };
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
          fifthYearOption: data.fifthYearOption,
          franchiseTagUsed: data.franchiseTagUsed ?? existing.franchiseTagUsed,
          franchiseTagYear: data.franchiseTagYear ?? existing.franchiseTagYear,
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
      fifthYearOption: data.fifthYearOption,
      franchiseTagUsed: data.franchiseTagUsed ?? 0,
      franchiseTagYear: data.franchiseTagYear ?? null,
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
}

export const storage = new DatabaseStorage();
