import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

console.log("[DB] Initializing database connection...");
console.log(`[DB] DATABASE_URL is ${process.env.DATABASE_URL ? "set" : "NOT SET"}`);
console.log(`[DB] NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

if (!process.env.DATABASE_URL) {
  console.error("[DB] FATAL: DATABASE_URL must be set. Did you forget to add it to Render environment variables?");
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

if (process.env.DATABASE_URL?.includes("neon.tech") || process.env.DATABASE_URL?.includes("neondb")) {
  console.warn(
    "[DB] WARNING: DATABASE_URL appears to point to Neon. " +
    "For Supabase, set DATABASE_URL in .env to your Supabase connection string and ensure no stale Neon URL in your environment."
  );
}

let pool: pg.Pool;
try {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  console.log("[DB] Pool created successfully");
} catch (err: any) {
  console.error("[DB] FATAL: Failed to create database pool:", err?.message || String(err));
  throw err;
}

export const db = drizzle(pool);
