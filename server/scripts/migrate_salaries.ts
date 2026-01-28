import { sql } from "drizzle-orm";
import { db } from "../db";

type ContractRow = {
  id: string;
  salary_2025?: number;
  salary_2026?: number;
  salary_2027?: number;
  salary_2028?: number;
  salary_2029?: number;
  salaries?: string | null;
};

type DraftRow = {
  id: string;
  salary_2025?: number;
  salary_2026?: number;
  salary_2027?: number;
  salary_2028?: number;
  salary_2029?: number;
  salaries?: string | null;
};

type DeadCapRow = {
  id: string;
  dead_cap_2025?: number;
  dead_cap_2026?: number;
  dead_cap_2027?: number;
  dead_cap_2028?: number;
  dead_cap_2029?: number;
  dead_cap_salaries?: string | null;
};

function buildSalaryJson(row: ContractRow | DraftRow): string {
  const salaries: Record<string, number> = {};
  if (row.salary_2025) salaries["2025"] = row.salary_2025;
  if (row.salary_2026) salaries["2026"] = row.salary_2026;
  if (row.salary_2027) salaries["2027"] = row.salary_2027;
  if (row.salary_2028) salaries["2028"] = row.salary_2028;
  if (row.salary_2029) salaries["2029"] = row.salary_2029;
  return JSON.stringify(salaries);
}

function buildDeadCapJson(row: DeadCapRow): string {
  const salaries: Record<string, number> = {};
  if (row.dead_cap_2025) salaries["2025"] = row.dead_cap_2025;
  if (row.dead_cap_2026) salaries["2026"] = row.dead_cap_2026;
  if (row.dead_cap_2027) salaries["2027"] = row.dead_cap_2027;
  if (row.dead_cap_2028) salaries["2028"] = row.dead_cap_2028;
  if (row.dead_cap_2029) salaries["2029"] = row.dead_cap_2029;
  return JSON.stringify(salaries);
}

async function migratePlayerContracts() {
  const rows = await db.execute(sql<ContractRow>`
    SELECT id, salary_2025, salary_2026, salary_2027, salary_2028, salary_2029, salaries
    FROM player_contracts
  `);

  for (const row of rows.rows) {
    const current = row.salaries || "{}";
    if (current !== "{}") continue;
    const salaries = buildSalaryJson(row);
    await db.execute(sql`
      UPDATE player_contracts
      SET salaries = ${salaries}
      WHERE id = ${row.id}
    `);
  }
}

async function migrateContractDrafts() {
  const rows = await db.execute(sql<DraftRow>`
    SELECT id, salary_2025, salary_2026, salary_2027, salary_2028, salary_2029, salaries
    FROM saved_contract_drafts
  `);

  for (const row of rows.rows) {
    const current = row.salaries || "{}";
    if (current !== "{}") continue;
    const salaries = buildSalaryJson(row);
    await db.execute(sql`
      UPDATE saved_contract_drafts
      SET salaries = ${salaries}
      WHERE id = ${row.id}
    `);
  }
}

async function migrateDeadCap() {
  const rows = await db.execute(sql<DeadCapRow>`
    SELECT id, dead_cap_2025, dead_cap_2026, dead_cap_2027, dead_cap_2028, dead_cap_2029, dead_cap_salaries
    FROM dead_cap_entries
  `);

  for (const row of rows.rows) {
    const current = row.dead_cap_salaries || "{}";
    if (current !== "{}") continue;
    const salaries = buildDeadCapJson(row);
    await db.execute(sql`
      UPDATE dead_cap_entries
      SET dead_cap_salaries = ${salaries}
      WHERE id = ${row.id}
    `);
  }
}

async function run() {
  await migratePlayerContracts();
  await migrateContractDrafts();
  await migrateDeadCap();
  console.log("Salary migration completed.");
}

run().catch((err) => {
  console.error("Salary migration failed:", err);
  process.exit(1);
});
