import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

console.log("[DB] Database module loaded (connection is lazy).");
console.log(`[DB] DATABASE_URL is ${process.env.DATABASE_URL ? "set" : "NOT SET"}`);

let pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDb(): ReturnType<typeof drizzle> {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    console.error("[DB] DATABASE_URL must be set. Add it to .env for API/database features. Dev server will still serve the app.");
    throw new Error("DATABASE_URL must be set. Did you forget to add it to .env?");
  }
  if (process.env.DATABASE_URL?.includes("neon.tech") || process.env.DATABASE_URL?.includes("neondb")) {
    console.warn(
      "[DB] WARNING: DATABASE_URL appears to point to Neon. For Supabase, use your Supabase connection string in .env."
    );
  }
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    _db = drizzle(pool);
    console.log("[DB] Pool created successfully (first use).");
    return _db;
  } catch (err: any) {
    console.error("[DB] Failed to create database pool:", err?.message || String(err));
    throw err;
  }
}

// Lazy proxy: connect only when db is first used (allows dev server to start without DATABASE_URL)
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});
