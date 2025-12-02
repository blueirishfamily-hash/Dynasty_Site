import { z } from "zod";

export const positionSchema = z.enum(["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB", "FLEX", "SUPER_FLEX"]);
export type Position = z.infer<typeof positionSchema>;

export const rosterStatusSchema = z.enum(["starter", "bench", "taxi", "ir"]);
export type RosterStatus = z.infer<typeof rosterStatusSchema>;

export const playerSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: positionSchema,
  team: z.string().nullable(),
  age: z.number().optional(),
  yearsExp: z.number().optional(),
  status: rosterStatusSchema.optional(),
  injuryStatus: z.string().nullable().optional(),
});
export type Player = z.infer<typeof playerSchema>;

export const rosterPlayerSchema = playerSchema.extend({
  seasonPoints: z.number(),
  weeklyAvg: z.number(),
  positionRank: z.number(),
  status: rosterStatusSchema,
});
export type RosterPlayer = z.infer<typeof rosterPlayerSchema>;

export const teamStandingSchema = z.object({
  rosterId: z.number(),
  rank: z.number(),
  name: z.string(),
  initials: z.string(),
  ownerId: z.string(),
  wins: z.number(),
  losses: z.number(),
  ties: z.number().optional(),
  pointsFor: z.number(),
  pointsAgainst: z.number(),
  streak: z.string().optional(),
  isUser: z.boolean().optional(),
});
export type TeamStanding = z.infer<typeof teamStandingSchema>;

export const matchupTeamSchema = z.object({
  rosterId: z.number(),
  name: z.string(),
  initials: z.string(),
  projectedScore: z.number(),
  actualScore: z.number().optional(),
  record: z.string(),
  starters: z.array(z.string()),
});
export type MatchupTeam = z.infer<typeof matchupTeamSchema>;

export const transactionSchema = z.object({
  id: z.string(),
  type: z.enum(["trade", "waiver", "add", "drop", "commissioner"]),
  teamName: z.string(),
  teamInitials: z.string(),
  description: z.string(),
  timestamp: z.string(),
  players: z.array(z.object({
    name: z.string(),
    action: z.enum(["added", "dropped"]),
  })),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const draftPickSchema = z.object({
  id: z.string(),
  season: z.string(),
  round: z.number(),
  rosterId: z.number(),
  originalOwnerId: z.number(),
  currentOwnerId: z.number(),
  originalOwnerName: z.string().optional(),
  currentOwnerName: z.string().optional(),
});
export type DraftPick = z.infer<typeof draftPickSchema>;

export const positionDepthPlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  team: z.string().nullable(),
  points: z.number(),
  medianPoints: z.number(),
  percentAboveMedian: z.number(),
});
export type PositionDepthPlayer = z.infer<typeof positionDepthPlayerSchema>;

export const positionDepthSchema = z.object({
  grade: z.string(),
  players: z.array(positionDepthPlayerSchema),
});
export type PositionDepth = z.infer<typeof positionDepthSchema>;

export const leagueInfoSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  season: z.string(),
  totalRosters: z.number(),
  rosterPositions: z.array(z.string()),
  playoffTeams: z.number().optional(),
  waiverBudget: z.number().optional(),
});
export type LeagueInfo = z.infer<typeof leagueInfoSchema>;

export const userInfoSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatar: z.string().nullable(),
});
export type UserInfo = z.infer<typeof userInfoSchema>;

export const tradeAssetSchema = z.object({
  type: z.enum(["player", "pick"]),
  name: z.string(),
  details: z.string().optional(),
});
export type TradeAsset = z.infer<typeof tradeAssetSchema>;

export const tradeTeamSchema = z.object({
  rosterId: z.number(),
  name: z.string(),
  initials: z.string(),
  assets: z.array(tradeAssetSchema),
});
export type TradeTeam = z.infer<typeof tradeTeamSchema>;

export const tradeHistoryItemSchema = z.object({
  id: z.string(),
  date: z.string(),
  teamA: tradeTeamSchema,
  teamB: tradeTeamSchema,
});
export type TradeHistoryItem = z.infer<typeof tradeHistoryItemSchema>;
