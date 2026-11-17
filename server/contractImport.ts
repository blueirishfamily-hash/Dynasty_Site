// Starting contracts from a CSV (multi-league plan, "New league setup"). Sleeper has no contracts, so a league
// that turns contracts on starts with none; the commissioner can enter them by hand or upload a CSV.
//
// One row per contract, one column per season:
//     team,player,salary_2026,salary_2027,salary_2028,rookie
//     Rough Start,Patrick Mahomes,30,30,30,
//     Second Team,Rookie Name,4,4,4,yes
// Salaries are in $M. A blank season has no salary. A contract's seasons must be consecutive. Teams are matched by
// team name, owner name or roster number; players by name among that team's Sleeper roster (or by a player_id
// column). This module only reads and checks the file; it writes nothing.
import { parse } from "csv-parse/sync";

export const MAX_IMPORT_ROWS = 1500;

export interface ImportTeam {
  rosterId: number;
  /** Names that identify the team: team name, owner display name. */
  labels: string[];
  /** Sleeper player IDs on the roster. */
  playerIds: string[];
}

export interface ImportContext {
  teams: ImportTeam[];
  /** Name by Sleeper player ID (only the roster players are needed). */
  playerNames: Record<string, string>;
  salaryCap: number;
  maxContractYears: number;
  currentSeason: number;
  /** Existing contracts: "rosterId:playerId" to salaries in tenths by season. */
  existing: Map<string, Record<string, number>>;
}

export type RowStatus = "ok" | "skipped" | "error";

export interface ImportRow {
  line: number;
  team: string;
  player: string;
  rosterId?: number;
  playerId?: string;
  /** Salaries in tenths of $M by season, as stored. */
  salaries?: Record<string, number>;
  rookie: boolean;
  status: RowStatus;
  message?: string;
  /** In replace mode, the player already has a contract that this row overwrites. */
  replaces?: boolean;
}

export interface ImportResult {
  /** Problems with the file as a whole (missing columns, seasons outside the allowed range...). */
  problems: string[];
  rows: ImportRow[];
  counts: { ok: number; skipped: number; error: number };
  /** Teams that would be over the cap after the import, by season. Not a block: the commissioner decides. */
  capWarnings: string[];
  /** The seasons the file may have columns for. */
  seasons: number[];
}

const norm = (s: string) => s.toLowerCase().replace(/[.'’`]/g, "").replace(/\s+/g, " ").trim();
const NAME_SUFFIX = /\s+(jr|sr|ii|iii|iv|v)$/;
const normName = (s: string) => norm(s).replace(NAME_SUFFIX, "");
const truthy = (s: string) => /^(1|y|yes|true|x|rookie)$/i.test(s.trim());

/** "$12.5M", "12,5" style input to a number, or NaN. Blank is NaN too. */
function parseMoney(raw: string): number {
  const s = raw.trim().replace(/^\$/, "").replace(/m$/i, "").replace(/,/g, "");
  return s === "" ? NaN : Number(s);
}

export function parseContractsCsv(text: string, ctx: ImportContext, mode: "skip" | "replace"): ImportResult {
  const seasons = Array.from({ length: ctx.maxContractYears }, (_, i) => ctx.currentSeason + i);
  const empty = (problems: string[]): ImportResult => ({ problems, rows: [], counts: { ok: 0, skipped: 0, error: 0 }, capWarnings: [], seasons });

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
      trim: true,
    });
  } catch (e: any) {
    return empty([`The file isn't a readable CSV: ${e?.message ?? e}`]);
  }
  if (records.length === 0) return empty(["The file has no contract rows."]);
  if (records.length > MAX_IMPORT_ROWS) return empty([`The file has ${records.length} rows; the most at once is ${MAX_IMPORT_ROWS}.`]);

  const columns = Object.keys(records[0]);
  const problems: string[] = [];
  if (!columns.includes("team")) problems.push('The file needs a "team" column.');
  if (!columns.includes("player") && !columns.includes("player_id")) problems.push('The file needs a "player" column (or "player_id").');

  const seasonColumns: Array<{ column: string; season: number }> = [];
  for (const c of columns) {
    const m = c.match(/^(?:salary[_ ]?)?(\d{4})$/);
    if (!m) continue;
    const season = Number(m[1]);
    if (!seasons.includes(season)) problems.push(`The "${c}" column is outside ${seasons[0]}-${seasons[seasons.length - 1]}, the seasons this league's contracts can cover.`);
    else seasonColumns.push({ column: c, season });
  }
  if (seasonColumns.length === 0 && problems.length === 0) problems.push(`The file needs at least one salary column, like salary_${ctx.currentSeason}.`);
  if (problems.length > 0) return empty(problems);

  // Team lookup. A team name or owner name that two teams share can't be used.
  const labelOwners = new Map<string, Set<number>>();
  for (const t of ctx.teams) for (const l of t.labels) {
    const k = norm(l);
    if (!k) continue;
    if (!labelOwners.has(k)) labelOwners.set(k, new Set());
    labelOwners.get(k)!.add(t.rosterId);
  }
  const teamById = new Map(ctx.teams.map((t) => [t.rosterId, t]));

  const seen = new Set<string>();
  const rows: ImportRow[] = records.map((rec, i): ImportRow => {
    const line = i + 2; // the header is line 1
    const teamCell = (rec["team"] ?? "").trim();
    const playerCell = (rec["player"] ?? "").trim();
    const row: ImportRow = { line, team: teamCell, player: playerCell || rec["player_id"] || "", rookie: truthy(rec["rookie"] ?? ""), status: "error" };
    const fail = (message: string): ImportRow => ({ ...row, status: "error", message });

    // Team
    if (!teamCell) return fail("No team.");
    const owners = labelOwners.get(norm(teamCell));
    let team: ImportTeam | undefined;
    if (owners && owners.size > 1) return fail(`More than one team is called "${teamCell}". Use the roster number instead.`);
    if (owners && owners.size === 1) team = teamById.get(Array.from(owners)[0]);
    else if (/^\d+$/.test(teamCell)) team = teamById.get(Number(teamCell));
    if (!team) return fail(`No team called "${teamCell}" in this league.`);
    row.rosterId = team.rosterId;

    // Player: a player_id column wins; otherwise the name, among this team's roster.
    const idCell = (rec["player_id"] ?? "").trim();
    let playerId: string | undefined;
    if (idCell) {
      if (!team.playerIds.includes(idCell)) return fail(`Player ID ${idCell} isn't on ${teamCell}'s roster in Sleeper.`);
      playerId = idCell;
    } else {
      if (!playerCell) return fail("No player.");
      const matches = team.playerIds.filter((id) => normName(ctx.playerNames[id] ?? "") === normName(playerCell));
      if (matches.length === 0) return fail(`"${playerCell}" isn't on ${teamCell}'s roster in Sleeper. Check the spelling, or add the player on Sleeper first.`);
      if (matches.length > 1) return fail(`More than one "${playerCell}" is on ${teamCell}'s roster. Add a player_id column to pick one.`);
      playerId = matches[0];
    }
    row.playerId = playerId;
    row.player = ctx.playerNames[playerId] ?? row.player;

    const key = `${team.rosterId}:${playerId}`;
    if (seen.has(key)) return fail(`${row.player} is listed more than once for ${teamCell}.`);
    seen.add(key);

    // Salaries
    const salaries: Record<string, number> = {};
    for (const { column, season } of seasonColumns) {
      const cell = rec[column] ?? "";
      if (cell.trim() === "") continue;
      const m = parseMoney(cell);
      if (!Number.isFinite(m) || m < 0) return fail(`"${cell}" in ${season} isn't a salary.`);
      if (m > ctx.salaryCap) return fail(`${season} salary $${m}M is over the league's $${ctx.salaryCap}M cap.`);
      const tenths = Math.round(m * 10);
      if (tenths > 0) salaries[String(season)] = tenths;
    }
    const years = Object.keys(salaries).map(Number).sort((a, b) => a - b);
    if (years.length === 0) return fail("No salary in any season.");
    for (let k = 1; k < years.length; k++) {
      if (years[k] !== years[k - 1] + 1) return fail(`The contract skips ${years[k - 1] + 1}. A contract's seasons must be consecutive.`);
    }
    row.salaries = salaries;

    if (ctx.existing.has(key)) {
      if (mode === "skip") return { ...row, status: "skipped", message: "Already has a contract. Use replace to overwrite it." };
      return { ...row, status: "ok", replaces: true };
    }
    return { ...row, status: "ok" };
  });

  // Cap check: existing contracts that stay, plus the contracts being imported.
  const capWarnings: string[] = [];
  const committed = new Map<number, Record<string, number>>(); // rosterId -> season -> tenths
  const add = (rosterId: number, season: string, tenths: number) => {
    const m = committed.get(rosterId) ?? {};
    m[season] = (m[season] ?? 0) + tenths;
    committed.set(rosterId, m);
  };
  const replacedKeys = new Set(rows.filter((r) => r.status === "ok" && r.replaces).map((r) => `${r.rosterId}:${r.playerId}`));
  ctx.existing.forEach((salaries, key) => {
    if (replacedKeys.has(key)) return;
    const rosterId = Number(key.split(":")[0]);
    for (const [season, tenths] of Object.entries(salaries)) add(rosterId, season, tenths);
  });
  for (const r of rows) if (r.status === "ok" && r.rosterId != null && r.salaries) for (const [season, tenths] of Object.entries(r.salaries)) add(r.rosterId, season, tenths);
  committed.forEach((bySeason, rosterId) => {
    for (const [season, tenths] of Object.entries(bySeason)) {
      if (tenths > ctx.salaryCap * 10) {
        const t = teamById.get(rosterId);
        capWarnings.push(`${t?.labels[0] ?? `Team ${rosterId}`} would be $${((tenths - ctx.salaryCap * 10) / 10).toFixed(1)}M over the cap in ${season}.`);
      }
    }
  });

  const counts = { ok: 0, skipped: 0, error: 0 };
  for (const r of rows) counts[r.status]++;
  return { problems: [], rows, counts, capWarnings, seasons };
}
