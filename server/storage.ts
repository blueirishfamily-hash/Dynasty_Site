import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
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
}

export const storage = new MemStorage();
