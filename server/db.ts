import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

if (process.env.DATABASE_URL?.includes("neon.tech") || process.env.DATABASE_URL?.includes("neondb")) {
  console.warn(
    "[DB] WARNING: DATABASE_URL appears to point to Neon. " +
    "For Supabase, set DATABASE_URL in .env to your Supabase connection string and ensure no stale Neon URL in your environment."
  );
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
export const db = drizzle(pool);
