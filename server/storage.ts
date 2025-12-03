import { randomUUID } from "crypto";
import type { 
  RuleSuggestion, InsertRuleSuggestion, 
  AwardNomination, InsertAwardNomination,
  AwardBallot, InsertAwardBallot,
  RuleVote, InsertRuleVote
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
  
  // Rule suggestions
  getRuleSuggestions(leagueId: string): Promise<RuleSuggestion[]>;
  createRuleSuggestion(data: InsertRuleSuggestion): Promise<RuleSuggestion>;
  updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined>;
  
  // Rule votes (1 vote per team per rule)
  getRuleVotes(ruleId: string): Promise<RuleVote[]>;
  castRuleVote(data: InsertRuleVote): Promise<RuleVote>;
  getRuleVoteByRoster(ruleId: string, rosterId: number): Promise<RuleVote | undefined>;
  
  // Award nominations (max 3 per team per award type)
  getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardNomination[]>;
  createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination>;
  getNominationCountByRoster(leagueId: string, season: string, awardType: "mvp" | "roy", rosterId: number): Promise<number>;
  
  // Award ballots (ranked voting: 1st=3pts, 2nd=2pts, 3rd=1pt)
  getAwardBallots(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardBallot[]>;
  upsertAwardBallot(data: InsertAwardBallot): Promise<AwardBallot>;
  getAwardBallotByRoster(leagueId: string, season: string, awardType: "mvp" | "roy", rosterId: number): Promise<AwardBallot | undefined>;
}

export class MemStorage implements IStorage {
  private sessions: Map<string, UserSession>;
  private ruleSuggestions: Map<string, RuleSuggestion>;
  private awardNominations: Map<string, AwardNomination>;
  private ruleVotes: Map<string, RuleVote>;
  private awardBallots: Map<string, AwardBallot>;

  constructor() {
    this.sessions = new Map();
    this.ruleSuggestions = new Map();
    this.awardNominations = new Map();
    this.ruleVotes = new Map();
    this.awardBallots = new Map();
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

  async updateRuleSuggestionStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<RuleSuggestion | undefined> {
    const suggestion = this.ruleSuggestions.get(id);
    if (!suggestion) return undefined;
    
    suggestion.status = status;
    this.ruleSuggestions.set(id, suggestion);
    return suggestion;
  }

  // Rule votes
  async getRuleVotes(ruleId: string): Promise<RuleVote[]> {
    const votes: RuleVote[] = [];
    this.ruleVotes.forEach((v) => {
      if (v.ruleId === ruleId) {
        votes.push(v);
      }
    });
    return votes;
  }

  async castRuleVote(data: InsertRuleVote): Promise<RuleVote> {
    // Check if vote already exists for this roster on this rule
    let existingVote: RuleVote | undefined;
    this.ruleVotes.forEach((v) => {
      if (v.ruleId === data.ruleId && v.rosterId === data.rosterId) {
        existingVote = v;
      }
    });

    if (existingVote) {
      // Update existing vote
      existingVote.vote = data.vote;
      existingVote.voterName = data.voterName;
      this.ruleVotes.set(existingVote.id, existingVote);
      return existingVote;
    }

    // Create new vote
    const id = randomUUID();
    const vote: RuleVote = {
      id,
      ...data,
      createdAt: Date.now(),
    };
    this.ruleVotes.set(id, vote);
    return vote;
  }

  async getRuleVoteByRoster(ruleId: string, rosterId: number): Promise<RuleVote | undefined> {
    let found: RuleVote | undefined;
    this.ruleVotes.forEach((v) => {
      if (v.ruleId === ruleId && v.rosterId === rosterId) {
        found = v;
      }
    });
    return found;
  }

  // Award nominations
  async getAwardNominations(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardNomination[]> {
    const nominations: AwardNomination[] = [];
    this.awardNominations.forEach((n) => {
      if (n.leagueId === leagueId && n.season === season && n.awardType === awardType) {
        nominations.push(n);
      }
    });
    return nominations.sort((a, b) => b.createdAt - a.createdAt);
  }

  async createAwardNomination(data: InsertAwardNomination): Promise<AwardNomination> {
    // Check if player already nominated
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
      createdAt: Date.now(),
    };
    this.awardNominations.set(id, nomination);
    return nomination;
  }

  async getNominationCountByRoster(leagueId: string, season: string, awardType: "mvp" | "roy", rosterId: number): Promise<number> {
    let count = 0;
    this.awardNominations.forEach((n) => {
      if (n.leagueId === leagueId && n.season === season && 
          n.awardType === awardType && n.nominatedByRosterId === rosterId) {
        count++;
      }
    });
    return count;
  }

  // Award ballots
  async getAwardBallots(leagueId: string, season: string, awardType: "mvp" | "roy"): Promise<AwardBallot[]> {
    const ballots: AwardBallot[] = [];
    this.awardBallots.forEach((b) => {
      if (b.leagueId === leagueId && b.season === season && b.awardType === awardType) {
        ballots.push(b);
      }
    });
    return ballots;
  }

  async upsertAwardBallot(data: InsertAwardBallot): Promise<AwardBallot> {
    // Check if ballot already exists for this roster
    let existingBallot: AwardBallot | undefined;
    this.awardBallots.forEach((b) => {
      if (b.leagueId === data.leagueId && b.season === data.season && 
          b.awardType === data.awardType && b.rosterId === data.rosterId) {
        existingBallot = b;
      }
    });

    if (existingBallot) {
      // Update existing ballot
      existingBallot.firstPlaceId = data.firstPlaceId;
      existingBallot.secondPlaceId = data.secondPlaceId;
      existingBallot.thirdPlaceId = data.thirdPlaceId;
      existingBallot.voterName = data.voterName;
      this.awardBallots.set(existingBallot.id, existingBallot);
      return existingBallot;
    }

    // Create new ballot
    const id = randomUUID();
    const ballot: AwardBallot = {
      id,
      ...data,
      createdAt: Date.now(),
    };
    this.awardBallots.set(id, ballot);
    return ballot;
  }

  async getAwardBallotByRoster(leagueId: string, season: string, awardType: "mvp" | "roy", rosterId: number): Promise<AwardBallot | undefined> {
    let found: AwardBallot | undefined;
    this.awardBallots.forEach((b) => {
      if (b.leagueId === leagueId && b.season === season && 
          b.awardType === awardType && b.rosterId === rosterId) {
        found = b;
      }
    });
    return found;
  }
}

export const storage = new MemStorage();
