import { useEffect, useState } from "react";

/** How far (in overall picks) a prospect's ADP can be from one of your picks to count as "in range". */
export const ADP_RANGE_TOLERANCE = 2;

export function normalizePosition(position?: string | null): string {
  return (position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || "";
}

/** Same range rule the table highlight and the ideal-pick logic have always used. */
export function adpInRangeOfPick(adp: number | string | null | undefined, pickNum: number): boolean {
  if (adp == null) return false;
  const a = Number(adp);
  return Math.abs(a - pickNum) <= ADP_RANGE_TOLERANCE && pickNum >= a - ADP_RANGE_TOLERANCE;
}

export function adpInRangeOfAnyPick(adp: number | string | null | undefined, pickNums: number[]): boolean {
  return adp != null && pickNums.some((n) => adpInRangeOfPick(adp, n));
}

interface RankedProspect {
  adp?: number | string | null;
  rank?: number | null;
  position?: string | null;
}

/**
 * The single best-fit prospect for one pick: in range, positions of need first, then closest
 * ADP to the pick, then board rank.
 */
export function idealProspectForPick<T extends RankedProspect>(
  prospects: T[],
  pickNum: number,
  needPositions: Set<string>
): T | null {
  const need = (p: T) => needPositions.has(normalizePosition(p.position));
  const candidates = prospects.filter((p) => adpInRangeOfPick(p.adp, pickNum));
  const sorted = [...candidates].sort((a, b) => {
    const needA = need(a);
    const needB = need(b);
    if (needA !== needB) return needB ? 1 : -1;
    const diffA = Math.abs(Number(a.adp) - pickNum);
    const diffB = Math.abs(Number(b.adp) - pickNum);
    if (diffA !== diffB) return diffA - diffB;
    return (a.rank ?? 99) - (b.rank ?? 99);
  });
  return sorted[0] ?? null;
}

export function filterProspects<T extends { displayName: string; position?: string | null }>(
  prospects: T[],
  opts: { search: string; position: string }
): T[] {
  const q = opts.search.trim().toLowerCase();
  return prospects.filter((p) => {
    if (opts.position !== "all" && normalizePosition(p.position) !== opts.position) return false;
    return !q || p.displayName.toLowerCase().includes(q);
  });
}

/** Tracks a CSS media query. Used to choose between inline detail (desktop) and the dialog (phone/tablet). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
