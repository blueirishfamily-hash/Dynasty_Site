// The separate test database (multi-league plan, "Risks and questions"): the mismatch and rollover tests write
// real rows, so they must never point at the real database. This decides which connection string is the test
// one and refuses anything that matches the real one.

export interface DatabaseIdentity {
  host: string;
  database: string;
  user: string;
}

/** Host, database and user from a Postgres URL, or null when it isn't one. Never includes the password. */
export function identityOf(url: string | undefined | null): DatabaseIdentity | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    return { host: u.hostname.toLowerCase(), database: decodeURIComponent(u.pathname.replace(/^\//, "")), user: decodeURIComponent(u.username) };
  } catch {
    return null;
  }
}

/** Supabase pooler users look like postgres.<project ref>; the ref is what tells two projects apart. */
const same = (a: DatabaseIdentity, b: DatabaseIdentity) => a.host === b.host && a.database === b.database && a.user === b.user;

export function resolveTestDatabaseUrl(sources: {
  /** DATABASE_URL from .env.test */
  test?: string;
  /** DATABASE_URL from .env (the real database) */
  real?: string;
  /** DATABASE_URL already set in the shell, which could be the real one */
  shell?: string;
}): { url: string; identity: DatabaseIdentity } | { error: string } {
  const test = identityOf(sources.test);
  if (!sources.test) return { error: "No test database yet. Create .env.test with its own DATABASE_URL (see .env.test.example)." };
  if (!test) return { error: "The DATABASE_URL in .env.test isn't a Postgres connection string." };
  for (const [label, other] of [["the real database in .env", sources.real], ["the DATABASE_URL set in this shell", sources.shell]] as const) {
    const id = identityOf(other);
    if (id && same(test, id)) {
      return { error: `The test DATABASE_URL points at ${label}. Tests write real rows, so they need a separate database (a second Supabase project).` };
    }
  }
  return { url: sources.test, identity: test };
}
