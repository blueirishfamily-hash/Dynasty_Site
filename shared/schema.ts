import { z } from "zod";
import { pgTable, text, integer, bigint, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Database Tables for persistent storage

export const ruleSuggestionsTable = pgTable("rule_suggestions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  authorId: varchar("author_id", { length: 64 }).notNull(),
  authorName: varchar("author_name", { length: 128 }).notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const ruleVotesTable = pgTable("rule_votes", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ruleId: varchar("rule_id", { length: 36 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  voterName: varchar("voter_name", { length: 128 }).notNull(),
  vote: varchar("vote", { length: 16 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const awardNominationsTable = pgTable("award_nominations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  season: varchar("season", { length: 8 }).notNull(),
  awardType: varchar("award_type", { length: 16 }).notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  playerName: varchar("player_name", { length: 128 }).notNull(),
  playerPosition: varchar("player_position", { length: 16 }).notNull(),
  playerTeam: varchar("player_team", { length: 8 }),
  nominatedBy: varchar("nominated_by", { length: 64 }).notNull(),
  nominatedByName: varchar("nominated_by_name", { length: 128 }).notNull(),
  nominatedByRosterId: integer("nominated_by_roster_id").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const awardBallotsTable = pgTable("award_ballots", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  season: varchar("season", { length: 8 }).notNull(),
  awardType: varchar("award_type", { length: 16 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  voterName: varchar("voter_name", { length: 128 }).notNull(),
  firstPlaceId: varchar("first_place_id", { length: 36 }).notNull(),
  secondPlaceId: varchar("second_place_id", { length: 36 }).notNull(),
  thirdPlaceId: varchar("third_place_id", { length: 36 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const leagueSettingsTable = pgTable("league_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  settingKey: varchar("setting_key", { length: 64 }).notNull(),
  settingValue: varchar("setting_value", { length: 256 }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Drizzle insert schemas
export const insertRuleSuggestionDbSchema = createInsertSchema(ruleSuggestionsTable).omit({ id: true, createdAt: true, status: true });
export const insertRuleVoteDbSchema = createInsertSchema(ruleVotesTable).omit({ id: true, createdAt: true });
export const insertAwardNominationDbSchema = createInsertSchema(awardNominationsTable).omit({ id: true, createdAt: true });
export const insertAwardBallotDbSchema = createInsertSchema(awardBallotsTable).omit({ id: true, createdAt: true });
export const insertLeagueSettingDbSchema = createInsertSchema(leagueSettingsTable).omit({ id: true, updatedAt: true });

// League Settings types
export type LeagueSetting = typeof leagueSettingsTable.$inferSelect;
export type InsertLeagueSetting = z.infer<typeof insertLeagueSettingDbSchema>;

// Zod Schemas for API validation

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
  commissionerId: z.string().optional(),
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

export const ruleSuggestionSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  upvotes: z.array(z.string()),
  downvotes: z.array(z.string()),
  createdAt: z.number(),
});
export type RuleSuggestion = z.infer<typeof ruleSuggestionSchema>;

export const insertRuleSuggestionSchema = ruleSuggestionSchema.omit({ 
  id: true, 
  upvotes: true, 
  downvotes: true, 
  createdAt: true,
  status: true,
});
export type InsertRuleSuggestion = z.infer<typeof insertRuleSuggestionSchema>;

export const awardNominationSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  season: z.string(),
  awardType: z.enum(["mvp", "roy", "gm"]),
  playerId: z.string(),
  playerName: z.string(),
  playerPosition: z.string(),
  playerTeam: z.string().nullable(),
  nominatedBy: z.string(),
  nominatedByName: z.string(),
  nominatedByRosterId: z.number(),
  createdAt: z.number(),
});
export type AwardNomination = z.infer<typeof awardNominationSchema>;

export const insertAwardNominationSchema = awardNominationSchema.omit({ 
  id: true, 
  createdAt: true 
});
export type InsertAwardNomination = z.infer<typeof insertAwardNominationSchema>;

// Award ballot for ranked voting (1st = 3pts, 2nd = 2pts, 3rd = 1pt)
export const awardBallotSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  season: z.string(),
  awardType: z.enum(["mvp", "roy", "gm"]),
  rosterId: z.number(),
  voterName: z.string(),
  firstPlaceId: z.string(),
  secondPlaceId: z.string(),
  thirdPlaceId: z.string(),
  createdAt: z.number(),
});
export type AwardBallot = z.infer<typeof awardBallotSchema>;

export const insertAwardBallotSchema = awardBallotSchema.omit({
  id: true,
  createdAt: true,
});
export type InsertAwardBallot = z.infer<typeof insertAwardBallotSchema>;

// Rule vote by team (1 vote per team per rule)
export const ruleVoteSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  rosterId: z.number(),
  voterName: z.string(),
  vote: z.enum(["approve", "reject"]),
  createdAt: z.number(),
});
export type RuleVote = z.infer<typeof ruleVoteSchema>;

export const insertRuleVoteSchema = ruleVoteSchema.omit({
  id: true,
  createdAt: true,
});
export type InsertRuleVote = z.infer<typeof insertRuleVoteSchema>;
