// Commissioner check used by route files.
// Moved out of server/routes.ts unchanged.
import { getLeague } from "../sleeper";

// Admin Database Inspection API (Commissioner Only)
export const COMMISSIONER_USER_IDS = ["900186363130503168"]; // Add commissioner user IDs here

// Helper function to check if user is commissioner
export async function isCommissioner(userId: string, leagueId?: string): Promise<boolean> {
  if (COMMISSIONER_USER_IDS.includes(userId)) {
    return true;
  }
  if (leagueId) {
    try {
      const league = await getLeague(leagueId);
      return league && league.owner_id === userId;
    } catch {
      return false;
    }
  }
  return false;
}
