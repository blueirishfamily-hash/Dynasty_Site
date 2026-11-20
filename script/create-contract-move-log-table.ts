// Creates the contract_move_log table if it does not exist yet:
//   npx tsx -r dotenv/config script/create-contract-move-log-table.ts                       (the database in .env)
//   npx tsx -r dotenv/config script/create-contract-move-log-table.ts dotenv_config_path=.env.test   (the test database)
// Additive only: CREATE TABLE / INDEX IF NOT EXISTS. It never alters or drops anything.
// Mirrors contractMoveLogTable in shared/schema.ts (what drizzle-kit push would create).
import pg from "pg";

const SQL = [
  `CREATE TABLE IF NOT EXISTS "contract_move_log" (
    "id" varchar(36) PRIMARY KEY NOT NULL,
    "league_id" varchar(64) NOT NULL,
    "transaction_id" varchar(64) NOT NULL,
    "kind" varchar(24) NOT NULL,
    "player_id" varchar(64) NOT NULL,
    "player_name" varchar(128) NOT NULL,
    "player_position" varchar(16),
    "from_roster_id" integer,
    "to_roster_id" integer,
    "status" varchar(16) NOT NULL,
    "summary" text NOT NULL,
    "detail" text,
    "flags" text,
    "flag_status" varchar(16),
    "tx_at" bigint NOT NULL,
    "created_at" bigint NOT NULL,
    "resolved_at" bigint,
    "resolved_by" varchar(64),
    CONSTRAINT "contract_move_log_league_id_transaction_id_player_id_kind_unique" UNIQUE("league_id","transaction_id","player_id","kind")
  )`,
  `CREATE INDEX IF NOT EXISTS "contract_move_log_by_status" ON "contract_move_log" USING btree ("league_id","status")`,
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const statement of SQL) await pool.query(statement);
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name = 'contract_move_log'`);
    console.log("Tables present:", rows.map((r) => r.table_name).join(", "));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
