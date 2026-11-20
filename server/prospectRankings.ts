// Draft prospect rankings import: parse pasted text or CSV, validate it, and match it to the league's prospects.
// Pure functions only (no database, no network) so they are easy to test.

export interface RankingRow {
  rank: number;
  playerName: string;
  nameKey: string;
  position: string | null;
  school: string | null;
  /** Free text from the source, such as "1.04 · 4,193". Stored as is. */
  sourceValue: string | null;
  /** Only set when the import has an ADP column with a number in it */
  adp: number | null;
}

export interface ParseResult {
  rows: RankingRow[];
  errors: string[];
}

export const MIN_ROWS = 20;
export const MAX_ROWS = 300;

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Lowercase, no accents, no punctuation, no Jr./III style suffix: "Marvin Harrison Jr." becomes "marvin harrison". */
export function normalizeName(name: string): string {
  const cleaned = (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`,]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts.join(" ");
}

export function normalizeSchool(school: string | null | undefined): string {
  return (school || "")
    .toLowerCase()
    .replace(/\buniversity of\b/g, "")
    .replace(/\buniversity\b/g, "")
    .replace(/\bstate\b/g, "st")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizePosition(position: string | null | undefined): string | null {
  const p = (position || "").trim().toUpperCase().replace(/[0-9]/g, "");
  return p || null;
}

/** Split one line into cells. Handles tab, pipe and comma separators and double-quoted cells. */
export function splitLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : line.includes("|") ? "|" : ",";
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

type Column = "rank" | "name" | "position" | "school" | "value" | "adp";

const HEADER_ALIASES: Record<string, Column> = {
  rank: "rank",
  rk: "rank",
  "#": "rank",
  name: "name",
  player: "name",
  prospect: "name",
  pos: "position",
  position: "position",
  school: "school",
  college: "school",
  value: "value",
  "pick value": "value",
  adp: "adp",
};

const DEFAULT_COLUMNS: Column[] = ["rank", "name", "position", "school", "value"];

/** Parse pasted rankings. Columns: rank, name, position, school, value (a header row is optional). */
export function parseRankingsText(text: string): ParseResult {
  const errors: string[] = [];
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: ["Nothing to import. Paste rankings with one prospect per line."] };

  let columns = DEFAULT_COLUMNS;
  let start = 0;
  const firstCells = splitLine(lines[0]).map((c) => c.toLowerCase());
  const looksLikeHeader =
    firstCells.length > 1 &&
    !/^\d+$/.test(firstCells[0]) &&
    firstCells.some((c) => HEADER_ALIASES[c] === "name");
  if (looksLikeHeader) {
    columns = firstCells.map((c) => HEADER_ALIASES[c] as Column | undefined) as Column[];
    start = 1;
    if (!columns.includes("rank") || !columns.includes("name")) {
      return { rows: [], errors: ["The header row needs at least rank and name columns."] };
    }
  }

  const rows: RankingRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const get = (col: Column): string => {
      const idx = columns.indexOf(col);
      if (idx < 0) return "";
      // A value like "1.01 · 4,193" has a comma in it. When the value is the last column, keep everything
      // after it instead of cutting it at the comma.
      if (col === "value" && idx === columns.length - 1) return cells.slice(idx).join(",").trim();
      return (cells[idx] ?? "").trim();
    };
    const rankText = get("rank").replace(/[^\d]/g, "");
    const name = get("name");
    if (!rankText || !name) {
      errors.push(`Line ${i + 1}: needs a rank and a name.`);
      continue;
    }
    const adpText = get("adp");
    const adp = adpText && Number.isFinite(Number(adpText)) ? Number(adpText) : null;
    rows.push({
      rank: parseInt(rankText, 10),
      playerName: name,
      nameKey: normalizeName(name),
      position: normalizePosition(get("position")),
      school: get("school") || null,
      sourceValue: get("value") || null,
      adp,
    });
  }
  return { rows, errors };
}

/** Checks a parsed list before anything is stored. Returns a list of problems (empty means valid). */
export function validateRankings(rows: RankingRow[]): string[] {
  const problems: string[] = [];
  if (rows.length < MIN_ROWS) problems.push(`Found ${rows.length} prospects; at least ${MIN_ROWS} are needed.`);
  if (rows.length > MAX_ROWS) problems.push(`Found ${rows.length} prospects; at most ${MAX_ROWS} are allowed.`);

  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const r of rows) {
    if (!r.playerName.trim()) problems.push(`Rank ${r.rank} has no name.`);
    if (seen.has(r.rank)) dupes.add(r.rank);
    seen.add(r.rank);
  }
  if (dupes.size > 0) problems.push(`Duplicate ranks: ${Array.from(dupes).sort((a, b) => a - b).join(", ")}.`);

  if (rows.length > 0 && dupes.size === 0) {
    const sorted = Array.from(seen).sort((a, b) => a - b);
    const missing: number[] = [];
    for (let n = 1; n <= sorted[sorted.length - 1]; n++) if (!seen.has(n)) missing.push(n);
    if (sorted[0] !== 1 || missing.length > 0) {
      const shown = missing.slice(0, 8).join(", ") + (missing.length > 8 ? ", ..." : "");
      problems.push(`Ranks must run 1 to ${rows.length} with no gaps${missing.length ? ` (missing ${shown})` : ""}.`);
    }
  }

  const keys = new Map<string, number>();
  for (const r of rows) {
    const prev = keys.get(r.nameKey);
    if (prev != null) problems.push(`"${r.playerName}" appears twice (ranks ${prev} and ${r.rank}).`);
    else keys.set(r.nameKey, r.rank);
  }
  return problems;
}

export interface ProspectLite {
  id: string;
  displayName: string;
  school?: string | null;
  position?: string | null;
}

export interface MatchResult {
  matches: { prospectId: string; row: RankingRow }[];
  unmatched: RankingRow[];
}

/**
 * Match ranking rows to the league's prospects by normalized name. If two prospects share a name,
 * the school (when both sides have one) picks between them. A school mismatch on a single candidate
 * does not block the match, because transfers and spelling differences are common.
 */
export function matchRankingsToProspects(rows: RankingRow[], prospects: ProspectLite[]): MatchResult {
  const byName = new Map<string, ProspectLite[]>();
  for (const p of prospects) {
    const key = normalizeName(p.displayName);
    const list = byName.get(key) ?? [];
    list.push(p);
    byName.set(key, list);
  }
  const claimed = new Set<string>();
  const matches: MatchResult["matches"] = [];
  const unmatched: RankingRow[] = [];
  for (const row of rows) {
    const candidates = (byName.get(row.nameKey) ?? []).filter((p) => !claimed.has(p.id));
    let pick: ProspectLite | undefined;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else if (candidates.length > 1) {
      const rowSchool = normalizeSchool(row.school);
      pick = candidates.find((p) => rowSchool && normalizeSchool(p.school) === rowSchool) ?? candidates[0];
    }
    if (pick) {
      claimed.add(pick.id);
      matches.push({ prospectId: pick.id, row });
    } else {
      unmatched.push(row);
    }
  }
  return { matches, unmatched };
}
