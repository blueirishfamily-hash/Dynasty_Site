import { describe, expect, it } from "vitest";
import { identityOf, resolveTestDatabaseUrl } from "./testDb";

const REAL = "postgresql://postgres.realref:secret1@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
const TEST = "postgresql://postgres.testref:secret2@aws-0-us-east-1.pooler.supabase.com:5432/postgres";

describe("identityOf", () => {
  it("reads host, database and user, never the password", () => {
    expect(identityOf(REAL)).toEqual({ host: "aws-0-us-east-1.pooler.supabase.com", database: "postgres", user: "postgres.realref" });
    expect(JSON.stringify(identityOf(REAL))).not.toContain("secret1");
  });
  it("rejects anything that isn't a Postgres URL", () => {
    for (const bad of [undefined, null, "", "not a url", "https://example.com/db"]) expect(identityOf(bad as any)).toBeNull();
  });
});

describe("resolveTestDatabaseUrl", () => {
  it("accepts a separate project", () => {
    const r = resolveTestDatabaseUrl({ test: TEST, real: REAL, shell: REAL });
    expect("url" in r && r.url).toBe(TEST);
  });

  it("asks for .env.test when there isn't one", () => {
    expect(resolveTestDatabaseUrl({ real: REAL })).toMatchObject({ error: expect.stringContaining("No test database yet") });
  });

  it("refuses the real database, even with a different password or a different spelling of the host", () => {
    for (const same of [REAL, REAL.replace("secret1", "other"), REAL.replace("aws-0", "AWS-0")]) {
      const r = resolveTestDatabaseUrl({ test: same, real: REAL });
      expect("error" in r && r.error).toContain("real database");
    }
  });

  it("refuses a DATABASE_URL set in the shell that is the real one", () => {
    const r = resolveTestDatabaseUrl({ test: REAL, shell: REAL });
    expect("error" in r && r.error).toContain("shell");
  });

  it("rejects a test URL that isn't Postgres", () => {
    expect(resolveTestDatabaseUrl({ test: "mysql://x", real: REAL })).toMatchObject({ error: expect.stringContaining("isn't a Postgres") });
  });
});
