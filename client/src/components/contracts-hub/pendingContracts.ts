import { useCallback, useEffect, useState } from "react";

// Extensions wait on the server as "pending" rows. Franchise tags wait here, in this browser,
// until the team approves them (approving sends them through the existing franchise-tag route).
export interface PendingTag {
  rosterId: number;
  playerId: string;
  playerName: string;
  position: string;
}

export interface PendingExtensionLike {
  id: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  extensionType: number;
  extensionYear: number;
  extensionSalary: number; // tenths of $M, as stored
  extensionSalary2?: number | null;
  status: string;
}

const storageKey = (leagueId: string, season: number) => `dynasty:pending-tags:${leagueId}:${season}`;

function loadTags(key: string): PendingTag[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function usePendingTags(leagueId: string | undefined, season: number) {
  const key = leagueId ? storageKey(leagueId, season) : null;
  const [tags, setTags] = useState<PendingTag[]>([]);

  useEffect(() => {
    setTags(key ? loadTags(key) : []);
  }, [key]);

  const persist = useCallback(
    (next: PendingTag[]) => {
      setTags(next);
      if (!key) return;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable: tags stay in memory for this visit */
      }
    },
    [key],
  );

  const addTag = useCallback(
    (tag: PendingTag) => {
      persist([...tags.filter(t => !(t.rosterId === tag.rosterId && t.playerId === tag.playerId)), tag]);
    },
    [tags, persist],
  );

  const removeTag = useCallback(
    (rosterId: number, playerId: string) => {
      persist(tags.filter(t => !(t.rosterId === rosterId && t.playerId === playerId)));
    },
    [tags, persist],
  );

  return { tags, addTag, removeTag };
}

// Salary per season ($M) a pending extension will write on approval. Mirrors the confirm route:
// year 1 = extensionSalary, year 2 = extensionSalary2 (when set), years 3 and 4 = extensionSalary.
export function extensionSalaries(ext: PendingExtensionLike): Record<number, number> {
  const s1 = ext.extensionSalary / 10;
  const out: Record<number, number> = { [ext.extensionYear]: s1 };
  if (ext.extensionType >= 2 && ext.extensionSalary2 != null) out[ext.extensionYear + 1] = ext.extensionSalary2 / 10;
  if (ext.extensionType >= 3) out[ext.extensionYear + 2] = s1;
  if (ext.extensionType >= 4) out[ext.extensionYear + 3] = s1;
  return out;
}

export interface SalaryContract {
  playerId: string;
  parsedSalaries: Record<number, number>;
  /** 1 for a rookie deal. Rookie deals are left out of the franchise tag price. */
  isRookieContract?: number;
}

// Franchise tag salary ($M): average of the top 5 current-season non-rookie salaries at the position, rounded up
// to the nearest 0.1, the same way the franchise-tag route prices it.
export function tagSalary(
  position: string,
  currentYear: number,
  contracts: SalaryContract[],
  positionOf: (playerId: string) => string | undefined,
): number {
  const tenths: number[] = [];
  for (const c of contracts) {
    const sal = c.parsedSalaries[currentYear] || 0;
    if (c.isRookieContract === 1) continue;
    if (sal > 0 && positionOf(c.playerId) === position) tenths.push(Math.round(sal * 10));
  }
  const top5 = tenths.sort((a, b) => b - a).slice(0, 5);
  if (top5.length === 0) return 0;
  return Math.ceil(top5.reduce((s, n) => s + n, 0) / top5.length) / 10;
}

export interface EffectContract extends SalaryContract {
  rosterId: number;
  contractThrough?: number | null;
}

// What a team's pending extensions and tags change on the books, per season ($M).
// `added` is the new money. `replaced` is the existing salary of an extended player from the extension's
// first year on, because approving an extension replaces the rest of that contract with the new one.
export function pendingSalaryEffects(
  rosterId: number,
  extensions: PendingExtensionLike[],
  tags: PendingTag[],
  contracts: EffectContract[],
  currentYear: number,
  positionOf: (playerId: string) => string | undefined,
): { added: Record<number, number>; replaced: Record<number, number> } {
  const added: Record<number, number> = {};
  const replaced: Record<number, number> = {};
  const add = (map: Record<number, number>, year: number, amount: number) => {
    map[year] = Math.round(((map[year] || 0) + amount) * 10) / 10;
  };

  for (const e of extensions) {
    if (e.rosterId !== rosterId || e.status !== "pending") continue;
    for (const [year, amount] of Object.entries(extensionSalaries(e))) add(added, Number(year), amount);
    const existing = contracts.find(c => c.rosterId === rosterId && c.playerId === e.playerId);
    if (existing) {
      for (const [year, amount] of Object.entries(existing.parsedSalaries)) {
        if (Number(year) >= e.extensionYear && amount > 0) add(replaced, Number(year), amount);
      }
    }
  }

  for (const t of tags) {
    if (t.rosterId !== rosterId) continue;
    const contract = contracts.find(c => c.rosterId === rosterId && c.playerId === t.playerId);
    const tagYear = (contract?.contractThrough ?? currentYear) + 1;
    add(added, tagYear, tagSalary(t.position, currentYear, contracts, positionOf));
  }

  return { added, replaced };
}
