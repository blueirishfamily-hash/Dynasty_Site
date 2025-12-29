import { z } from "zod";
import { pgTable, text, integer, bigint, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Database Tables for persistent storage

export const ruleSuggestionsTable = pgTable("rule_suggestions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  authorId: varchar("author_id", { length: 64 }).notNull(),
  authorName: varchar("author_name", { length: 128 }).notNull(),
  rosterId: integer("roster_id").notNull(),
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

export const playerContractsTable = pgTable("player_contracts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  salary2025: integer("salary_2025").notNull().default(0),
  salary2026: integer("salary_2026").notNull().default(0),
  salary2027: integer("salary_2027").notNull().default(0),
  salary2028: integer("salary_2028").notNull().default(0),
  salary2029: integer("salary_2029").notNull().default(0),
  fifthYearOption: varchar("fifth_year_option", { length: 8 }),
  isOnIr: integer("is_on_ir").notNull().default(0),
  franchiseTagUsed: integer("franchise_tag_used").notNull().default(0),
  franchiseTagYear: integer("franchise_tag_year"),
  originalContractYears: integer("original_contract_years").notNull().default(1),
  isRookieContract: integer("is_rookie_contract").notNull().default(0),
  extensionApplied: integer("extension_applied").notNull().default(0),
  extensionYear: integer("extension_year"),
  extensionSalary: integer("extension_salary"),
  extensionType: integer("extension_type"), // 1 = 1-year at 1.2x, 2 = 2-year at 1.5x, 3 = 3-year at 1.8x, 4 = 4-year at 2x
  hasBeenExtended: integer("has_been_extended").notNull().default(0), // Tracks if player has been extended on this roster (resets when player moves teams)
  hasBeenFranchiseTagged: integer("has_been_franchise_tagged").notNull().default(0), // Tracks if player has been franchise tagged on this roster (resets when player moves teams)
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Team extension usage tracking per season
export const teamExtensionsTable = pgTable("team_extensions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  season: integer("season").notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  playerName: varchar("player_name", { length: 128 }).notNull(),
  extensionSalary: integer("extension_salary").notNull(),
  extensionYear: integer("extension_year").notNull(),
  extensionType: integer("extension_type").notNull().default(1), // 1 = 1-year at 1.2x, 2 = 2-year at 1.5x
  extensionSalary2: integer("extension_salary_2"), // Second year salary for 2-year extensions
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const playerBidsTable = pgTable("player_bids", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  playerName: varchar("player_name", { length: 128 }).notNull(),
  playerPosition: varchar("player_position", { length: 16 }).notNull(),
  playerTeam: varchar("player_team", { length: 8 }),
  bidAmount: integer("bid_amount").notNull(),
  maxBid: integer("max_bid"),
  contractYears: integer("contract_years").notNull().default(1),
  isRookieContract: integer("is_rookie_contract").notNull().default(0),
  notes: text("notes"),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const deadCapEntriesTable = pgTable("dead_cap_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  playerName: varchar("player_name", { length: 128 }).notNull(),
  playerPosition: varchar("player_position", { length: 16 }).notNull(),
  reason: varchar("reason", { length: 16 }).notNull(),
  deadCap2025: integer("dead_cap_2025").notNull().default(0),
  deadCap2026: integer("dead_cap_2026").notNull().default(0),
  deadCap2027: integer("dead_cap_2027").notNull().default(0),
  deadCap2028: integer("dead_cap_2028").notNull().default(0),
  deadCap2029: integer("dead_cap_2029").notNull().default(0),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

// Saved contract drafts - team-specific saved hypothetical contracts
export const savedContractDraftsTable = pgTable("saved_contract_drafts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  playerId: varchar("player_id", { length: 64 }).notNull(),
  playerName: varchar("player_name", { length: 128 }).notNull(),
  playerPosition: varchar("player_position", { length: 16 }).notNull(),
  salary2025: integer("salary_2025").notNull().default(0),
  salary2026: integer("salary_2026").notNull().default(0),
  salary2027: integer("salary_2027").notNull().default(0),
  salary2028: integer("salary_2028").notNull().default(0),
  salary2029: integer("salary_2029").notNull().default(0),
  franchiseTagApplied: integer("franchise_tag_applied").notNull().default(0),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

// Contract approval requests - submitted by teams for commissioner approval
export const contractApprovalRequestsTable = pgTable("contract_approval_requests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  leagueId: varchar("league_id", { length: 64 }).notNull(),
  rosterId: integer("roster_id").notNull(),
  teamName: varchar("team_name", { length: 128 }).notNull(),
  ownerName: varchar("owner_name", { length: 128 }).notNull(),
  contractsJson: text("contracts_json").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  submittedAt: bigint("submitted_at", { mode: "number" }).notNull(),
  reviewedAt: bigint("reviewed_at", { mode: "number" }),
  reviewerNotes: text("reviewer_notes"),
});

// Drizzle insert schemas
export const insertRuleSuggestionDbSchema = createInsertSchema(ruleSuggestionsTable).omit({ id: true, createdAt: true, status: true });
export const insertRuleVoteDbSchema = createInsertSchema(ruleVotesTable).omit({ id: true, createdAt: true });
export const insertAwardNominationDbSchema = createInsertSchema(awardNominationsTable).omit({ id: true, createdAt: true });
export const insertAwardBallotDbSchema = createInsertSchema(awardBallotsTable).omit({ id: true, createdAt: true });
export const insertLeagueSettingDbSchema = createInsertSchema(leagueSettingsTable).omit({ id: true, updatedAt: true });
export const insertPlayerContractDbSchema = createInsertSchema(playerContractsTable).omit({ id: true, updatedAt: true });
export const insertPlayerBidDbSchema = createInsertSchema(playerBidsTable).omit({ id: true, createdAt: true, updatedAt: true, status: true });
export const insertDeadCapEntryDbSchema = createInsertSchema(deadCapEntriesTable).omit({ id: true, createdAt: true });
export const insertSavedContractDraftDbSchema = createInsertSchema(savedContractDraftsTable).omit({ id: true, updatedAt: true });
export const insertContractApprovalRequestDbSchema = createInsertSchema(contractApprovalRequestsTable).omit({ id: true, submittedAt: true, status: true, reviewedAt: true, reviewerNotes: true });
export const insertTeamExtensionDbSchema = createInsertSchema(teamExtensionsTable).omit({ id: true, createdAt: true });

// Player Contract types
export type PlayerContract = typeof playerContractsTable.$inferSelect;
export type InsertPlayerContract = z.infer<typeof insertPlayerContractDbSchema>;

// Player Bid types
export type PlayerBid = typeof playerBidsTable.$inferSelect;
export type InsertPlayerBid = z.infer<typeof insertPlayerBidDbSchema>;

// Dead Cap Entry types
export type DeadCapEntry = typeof deadCapEntriesTable.$inferSelect;
export type InsertDeadCapEntry = z.infer<typeof insertDeadCapEntryDbSchema>;

// Saved Contract Draft types
export type SavedContractDraft = typeof savedContractDraftsTable.$inferSelect;
export type InsertSavedContractDraft = z.infer<typeof insertSavedContractDraftDbSchema>;

// Contract Approval Request types
export type ContractApprovalRequest = typeof contractApprovalRequestsTable.$inferSelect;
export type InsertContractApprovalRequest = z.infer<typeof insertContractApprovalRequestDbSchema>;

// Team Extension types
export type TeamExtension = typeof teamExtensionsTable.$inferSelect;
export type InsertTeamExtension = z.infer<typeof insertTeamExtensionDbSchema>;

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
  rosterId: z.number(),
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
