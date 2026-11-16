-- Multi-league phase 1: create the 8 new tables from docs/multi-league/PLAN.md ("Data model").
-- Creates new tables only. It does not touch any existing table or row.
--
-- Run once in the Supabase SQL editor. It runs in one transaction, so it either creates all 8 tables or none.
-- It fails, without changing anything, if any of these table names already exists.
--
-- The DDL is generated from shared/schema.ts by drizzle-kit, so the two match. Do not use `npm run db:push` for this.

BEGIN;

CREATE TABLE "leagues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"invite_code" varchar(32),
	"contracts_enabled" integer DEFAULT 0 NOT NULL,
	"league_pin_hash" text,
	"league_pin_set_at" bigint,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "leagues_slug_unique" UNIQUE("slug"),
	CONSTRAINT "leagues_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "leagues_slug_format" CHECK ("leagues"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "leagues_invite_code_format" CHECK ("leagues"."invite_code" IS NULL OR ("leagues"."invite_code" = upper("leagues"."invite_code") AND length("leagues"."invite_code") >= 6)),
	CONSTRAINT "leagues_contracts_enabled_bool" CHECK ("leagues"."contracts_enabled" IN (0, 1)),
	CONSTRAINT "leagues_status_values" CHECK ("leagues"."status" IN ('active', 'archived'))
);

CREATE TABLE "league_season_history" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"league_id" varchar(36) NOT NULL,
	"season" varchar(8) NOT NULL,
	"sleeper_league_id" varchar(64) NOT NULL,
	"previous_sleeper_league_id" varchar(64),
	"status" varchar(16) NOT NULL,
	"rolled_over_at" bigint,
	"rolled_over_by" varchar(64),
	"migration_id" varchar(36),
	CONSTRAINT "league_season_history_sleeper_league_id_unique" UNIQUE("sleeper_league_id"),
	CONSTRAINT "league_season_history_league_season_unique" UNIQUE("league_id","season"),
	CONSTRAINT "league_season_history_status_values" CHECK ("league_season_history"."status" IN ('current', 'past'))
);

CREATE TABLE "league_commissioners" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"league_id" varchar(36) NOT NULL,
	"sleeper_user_id" varchar(64) NOT NULL,
	"role" varchar(16) NOT NULL,
	"pin_hash" text,
	"pin_set_at" bigint,
	"added_by" varchar(64) NOT NULL,
	"added_at" bigint NOT NULL,
	CONSTRAINT "league_commissioners_league_user_unique" UNIQUE("league_id","sleeper_user_id"),
	CONSTRAINT "league_commissioners_role_values" CHECK ("league_commissioners"."role" IN ('owner', 'co'))
);

CREATE TABLE "league_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"league_id" varchar(36) NOT NULL,
	"season" varchar(8) NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_by" varchar(64) NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "league_rules_league_season_unique" UNIQUE("league_id","season")
);

CREATE TABLE "league_device_access" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"league_id" varchar(36) NOT NULL,
	"device_token_hash" varchar(128) NOT NULL,
	"roster_id" integer,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint NOT NULL,
	"revoked_at" bigint,
	CONSTRAINT "league_device_access_device_token_hash_unique" UNIQUE("device_token_hash")
);

CREATE TABLE "site_admin" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"passcode_hash" text NOT NULL,
	"set_at" bigint NOT NULL,
	CONSTRAINT "site_admin_single_row" CHECK ("site_admin"."id" = 1)
);

CREATE TABLE "pin_attempts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"kind" varchar(32) NOT NULL,
	"target" varchar(64) DEFAULT '' NOT NULL,
	"device_key" varchar(128) NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"first_failed_at" bigint NOT NULL,
	"paused_until" bigint,
	CONSTRAINT "pin_attempts_kind_target_device_unique" UNIQUE("kind","target","device_key"),
	CONSTRAINT "pin_attempts_kind_values" CHECK ("pin_attempts"."kind" IN ('league_pin', 'commissioner_pin', 'admin_passcode', 'invite_code'))
);

CREATE TABLE "audit_log" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"league_id" varchar(36),
	"actor_sleeper_user_id" varchar(64),
	"actor_role" varchar(16) NOT NULL,
	"action" varchar(64) NOT NULL,
	"details" jsonb,
	"created_at" bigint NOT NULL,
	CONSTRAINT "audit_log_actor_role_values" CHECK ("audit_log"."actor_role" IN ('admin', 'commissioner', 'system'))
);

ALTER TABLE "league_season_history" ADD CONSTRAINT "league_season_history_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "league_commissioners" ADD CONSTRAINT "league_commissioners_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "league_rules" ADD CONSTRAINT "league_rules_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "league_device_access" ADD CONSTRAINT "league_device_access_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE no action ON UPDATE no action;

-- Exactly one current season per league.
CREATE UNIQUE INDEX "league_season_history_one_current" ON "league_season_history" USING btree ("league_id") WHERE "league_season_history"."status" = 'current';
CREATE INDEX "league_device_access_league_idx" ON "league_device_access" USING btree ("league_id");
CREATE INDEX "audit_log_league_created_idx" ON "audit_log" USING btree ("league_id","created_at");

-- These tables hold PIN and passcode hashes and device tokens. Turning on row level security with no policies
-- keeps them out of Supabase's public Data API (the anon and authenticated roles see nothing). The app's server
-- connects as the table owner, which RLS does not apply to, so the app is unaffected.
ALTER TABLE "leagues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "league_season_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "league_commissioners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "league_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "league_device_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_admin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pin_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

COMMIT;
