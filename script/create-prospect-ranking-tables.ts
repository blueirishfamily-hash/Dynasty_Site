// Creates the two prospect-ranking tables if they do not exist yet:  npx tsx -r dotenv/config script/create-prospect-ranking-tables.ts
// Additive only: CREATE TABLE / INDEX IF NOT EXISTS. It never alters or drops anything.
// Mirrors draftProspectRankingsTable and rankingSyncStatusTable in shared/schema.ts (what drizzle-kit push would create).
import pg from "pg";

const SQL = [
  `CREATE TABLE IF NOT EXISTS "draft_prospect_rankings" (
    "id" varchar(36) PRIMARY KEY NOT NULL,
    "league_id" varchar(64) NOT NULL,
    "season" varchar(8) NOT NULL,
    "source" varchar(64) NOT NULL,
    "format" varchar(32) NOT NULL,
    "rank" integer NOT NULL,
    "player_name" varchar(128) NOT NULL,
    "name_key" varchar(128) NOT NULL,
    "position" varchar(8),
    "school" varchar(128),
    "source_value" text,
    "raw_payload" text,
    "fetched_at" bigint NOT NULL,
    CONSTRAINT "draft_prospect_rankings_league_id_season_source_format_rank_unique" UNIQUE("league_id","season","source","format","rank")
  )`,
  `CREATE INDEX IF NOT EXISTS "draft_prospect_rankings_by_name" ON "draft_prospect_rankings" USING btree ("league_id","season","source","format","name_key")`,
  `CREATE TABLE IF NOT EXISTS "ranking_sync_status" (
    "league_id" varchar(64) NOT NULL,
    "season" varchar(8) NOT NULL,
    "source" varchar(64) NOT NULL,
    "format" varchar(32) NOT NULL,
    "last_attempt_at" bigint NOT NULL,
    "last_success_at" bigint,
    "last_status" varchar(16) NOT NULL,
    "last_error" text,
    "row_count" integer,
    CONSTRAINT "ranking_sync_status_league_id_season_source_format_pk" PRIMARY KEY("league_id","season","source","format")
  )`,
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const statement of SQL) await pool.query(statement);
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name IN ('draft_prospect_rankings','ranking_sync_status') ORDER BY 1`
    );
    console.log("Tables present:", rows.map((r) => r.table_name).join(", "));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
