// Sets up the separate test database:  npm run db:push:test
// Creates every table (the app's own and the multi-league registry) in the database named in .env.test.
// It refuses to run unless that is a different database from the real one in .env.
import fs from "fs";
import { parse } from "dotenv";
import { spawnSync } from "child_process";
import { resolveTestDatabaseUrl } from "../server/testDb";

const read = (file: string): Record<string, string> => (fs.existsSync(file) ? parse(fs.readFileSync(file)) : {});

const resolved = resolveTestDatabaseUrl({
  test: read(".env.test").DATABASE_URL,
  real: read(".env").DATABASE_URL,
  shell: process.env.DATABASE_URL,
});
if ("error" in resolved) {
  console.error(`\n${resolved.error}\n`);
  process.exit(1);
}

const { host, database, user } = resolved.identity;
console.log(`Pushing the schema to the TEST database: ${user}@${host}/${database}`);
// drizzle.config.ts reads DATABASE_URL, so give it the test one explicitly (the real one never reaches it).
const result = spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: resolved.url },
});
process.exit(result.status ?? 1);
