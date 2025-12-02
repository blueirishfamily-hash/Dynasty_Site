import { randomUUID } from "crypto";
import type { RuleSuggestion, InsertRuleSuggestion, AwardNomination, InsertAwardNomination } from "@shared/schema";

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
  voteRuleSuggestion(id: string, oderId: string, voteType: "up" | "down"): Promise<RuleSuggestion | undefined>;
  updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined>;
  
  getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardNomination[]>;
  createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination>;
  voteAwardNomination(id: string, oderId: string): Promise<AwardNomination | undefined>;
}

export class MemStorage implements IStorage {
  private sessions: Map<string, UserSession>;
  private ruleSuggestions: Map<string, RuleSuggestion>;
  private awardNominations: Map<string, AwardNomination>;

  constructor() {
    this.sessions = new Map();
    this.ruleSuggestions = new Map();
    this.awardNominations = new Map();
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
    const suggestions: RuleSuggestion[] = [];
    this.ruleSuggestions.forEach((s) => {
      if (s.leagueId === leagueId) {
        suggestions.push(s);
      }
    });
    return suggestions.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion> {
    const id = randomUUID();
    const suggestion: RuleSuggestion = {
      id,
      ...data,
      status: "pending",
      upvotes: [],
      downvotes: [],
      createdAt: Date.now(),
    };
    this.ruleSuggestions.set(id, suggestion);
    return suggestion;
  }

  async voteRuleSuggestion(id: string, oderId: string, voteType: "up" | "down"): Promise<RuleSuggestion | undefined> {
    const suggestion = this.ruleSuggestions.get(id);
    if (!suggestion) return undefined;

    suggestion.upvotes = suggestion.upvotes.filter((v) => v !== oderId);
    suggestion.downvotes = suggestion.downvotes.filter((v) => v !== oderId);

    if (voteType === "up") {
      suggestion.upvotes.push(oderId);
    } else {
      suggestion.downvotes.push(oderId);
    }

    this.ruleSuggestions.set(id, suggestion);
    return suggestion;
  }

  async updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined> {
    const suggestion = this.ruleSuggestions.get(id);
    if (!suggestion) return undefined;
    
    suggestion.status = status;
    this.ruleSuggestions.set(id, suggestion);
    return suggestion;
  }

  async getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardNomination[]> {
    const nominations: AwardNomination[] = [];
    this.awardNominations.forEach((n) => {
      if (n.leagueId === leagueId && n.season === season && n.awardType === awardType) {
        nominations.push(n);
      }
    });
    return nominations.sort((a, b) => b.votes.length - a.votes.length);
  }

  async createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination> {
    const existingKey = `${data.leagueId}-${data.season}-${data.awardType}-${data.playerId}`;
    let existing: AwardNomination | undefined;
    this.awardNominations.forEach((n) => {
      if (n.leagueId === data.leagueId && n.season === data.season && 
          n.awardType === data.awardType && n.playerId === data.playerId) {
        existing = n;
      }
    });
    
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const nomination: AwardNomination = {
      id,
      ...data,
      votes: [data.nominatedBy],
      createdAt: Date.now(),
    };
    this.awardNominations.set(id, nomination);
    return nomination;
  }

  async voteAwardNomination(id: string, oderId: string): Promise<AwardNomination | undefined> {
    const nomination = this.awardNominations.get(id);
    if (!nomination) return undefined;

    this.awardNominations.forEach((n) => {
      if (n.leagueId === nomination.leagueId && 
          n.season === nomination.season && 
          n.awardType === nomination.awardType) {
        n.votes = n.votes.filter((v) => v !== oderId);
        this.awardNominations.set(n.id, n);
      }
    });

    nomination.votes.push(oderId);
    this.awardNominations.set(id, nomination);
    return nomination;
  }
}

export const storage = new MemStorage();
