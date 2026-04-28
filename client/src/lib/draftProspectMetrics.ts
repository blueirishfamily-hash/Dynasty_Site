import type { DraftProspect } from "@shared/schema";

export type ProspectEnriched = DraftProspect & {
  photoUrl?: string | null;
  sleeperTeam?: string | null;
  sleeperCollege?: string | null;
};

export function parseCombineData(combineData: string | null): Record<string, string> {
  if (!combineData) return {};
  try {
    return JSON.parse(combineData) as Record<string, string>;
  } catch {
    return {};
  }
}

export function parseCollegeAwards(collegeAwards: string | null): string[] {
  if (!collegeAwards) return [];
  try {
    const arr = JSON.parse(collegeAwards);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

export type AdvancedStatsPayload = {
  speedScore: number | null;
  dominatorByYear: { year: number; dominator: number }[];
  bestDominator: number | null;
  breakoutSeason: number | null;
  yprrByYear: { year: number; yprr: number }[];
  bestYprr: number | null;
  dominatorUnavailableReason?: string | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRate(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null || n < 0) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

export function parseAdvancedStats(advancedStats: string | null): AdvancedStatsPayload | null {
  if (!advancedStats) return null;
  try {
    const parsed = JSON.parse(advancedStats) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const raw = parsed as Record<string, unknown>;

    const dominatorByYear = Array.isArray(raw.dominatorByYear)
      ? raw.dominatorByYear
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const year = toFiniteNumber(row.year);
            const dominator = toRate(row.dominator);
            if (year == null || dominator == null) return null;
            return { year: Math.round(year), dominator };
          })
          .filter((x): x is { year: number; dominator: number } => x != null)
      : [];

    const yprrByYear = Array.isArray(raw.yprrByYear)
      ? raw.yprrByYear
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            const year = toFiniteNumber(row.year);
            const yprr = toFiniteNumber(row.yprr);
            if (year == null || yprr == null) return null;
            return { year: Math.round(year), yprr };
          })
          .filter((x): x is { year: number; yprr: number } => x != null)
      : [];

    const speedScore = toFiniteNumber(raw.speedScore);
    const bestDominator = toRate(raw.bestDominator);
    const breakoutSeasonRaw = toFiniteNumber(raw.breakoutSeason);
    const breakoutSeason = breakoutSeasonRaw != null ? Math.round(breakoutSeasonRaw) : null;
    const bestYprr = toFiniteNumber(raw.bestYprr);
    const dominatorUnavailableReason =
      typeof raw.dominatorUnavailableReason === "string" && raw.dominatorUnavailableReason.trim()
        ? raw.dominatorUnavailableReason.trim()
        : null;

    return {
      speedScore,
      dominatorByYear,
      bestDominator,
      breakoutSeason,
      yprrByYear,
      bestYprr,
      dominatorUnavailableReason,
    };
  } catch {
    return null;
  }
}

type StatTier = "elite" | "mediocre" | "below";

export function getSpeedScoreTier(score: number): StatTier {
  if (score >= 110) return "elite";
  if (score >= 100) return "mediocre";
  return "below";
}

export function getDominatorTier(rate: number): StatTier {
  if (rate >= 0.3) return "elite";
  if (rate >= 0.2) return "mediocre";
  return "below";
}

export function getYprrTier(yprr: number): StatTier {
  if (yprr >= 2) return "elite";
  if (yprr >= 1.2) return "mediocre";
  return "below";
}

export const STAT_TIER_CLASS: Record<StatTier, string> = {
  elite: "font-mono font-medium text-emerald-600 dark:text-emerald-400",
  mediocre: "font-mono font-medium text-amber-600 dark:text-amber-400",
  below: "font-mono font-medium text-red-600 dark:text-red-400",
};

export const COMBINE_RADAR_METRICS: Record<string, { label: string; lowerIsBetter: boolean }> = {
  "40Yd": { label: "40 yd", lowerIsBetter: true },
  "10YdSplit": { label: "10 yd", lowerIsBetter: true },
  vertical: { label: "Vertical", lowerIsBetter: false },
  broad: { label: "Broad", lowerIsBetter: false },
  bench: { label: "Bench", lowerIsBetter: false },
  "3cone": { label: "3-cone", lowerIsBetter: true },
  shuttle: { label: "Shuttle", lowerIsBetter: true },
};

export function parseCombineNumber(v: string): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Build radar data: rank vs other prospects in same position (100 = best, further out = better). */
export function buildCombineRadarData(
  prospect: ProspectEnriched,
  allProspects: ProspectEnriched[]
): { subject: string; value: number; fullMark: 100 }[] {
  const rows: { subject: string; value: number; fullMark: 100 }[] = [];
  const myCombine = parseCombineData(prospect.combineData);
  const position = (prospect.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
  const samePositionProspects =
    position != null
      ? allProspects.filter((p) => {
          const pPos = (p.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
          return pPos === position;
        })
      : [];

  for (const [key, { label, lowerIsBetter }] of Object.entries(COMBINE_RADAR_METRICS)) {
    const myVal = parseCombineNumber(myCombine[key] ?? "");
    if (myVal === null) continue;

    const valuesWithId = samePositionProspects
      .map((p) => {
        const val = parseCombineNumber((parseCombineData(p.combineData)[key] ?? "") as string);
        return val !== null ? { id: p.id, val } : null;
      })
      .filter((x): x is { id: string; val: number } => x != null);

    if (valuesWithId.length < 2) continue;

    if (lowerIsBetter) valuesWithId.sort((a, b) => a.val - b.val);
    else valuesWithId.sort((a, b) => b.val - a.val);

    const rank = valuesWithId.findIndex((x) => x.id === prospect.id) + 1;
    if (rank < 1) continue;
    const n = valuesWithId.length;
    const score = n <= 1 ? 100 : ((n - rank + 1) / n) * 100;
    rows.push({ subject: label, value: Math.round(score), fullMark: 100 });
  }

  return rows;
}

export type CombineRankEntry = {
  key: string;
  label: string;
  value: string;
  rank: number | null;
  outOf: number | null;
  lowerIsBetter: boolean;
};

/**
 * For each combine metric on this prospect, compute their rank among same-position
 * prospects who also recorded that metric. Returns ALL metrics that the prospect has
 * a value for (value is always present); rank/outOf are null when fewer than 2 peers
 * have that metric.
 *
 * Non-COMBINE_RADAR_METRICS fields (height, weight, arm, hand, wingspan) are appended
 * without rank info since they have no lowerIsBetter semantic defined.
 */
export function buildCombineRankData(
  prospect: ProspectEnriched,
  allProspects: ProspectEnriched[]
): CombineRankEntry[] {
  const myCombine = parseCombineData(prospect.combineData);
  if (Object.keys(myCombine).length === 0) return [];

  const position = (prospect.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
  const peers =
    position != null
      ? allProspects.filter((p) => {
          const pPos = (p.position ?? "").trim().toUpperCase().replace(/[0-9]/g, "") || null;
          return pPos === position;
        })
      : [];

  const result: CombineRankEntry[] = [];

  const DISPLAY_ORDER = ["40Yd", "10YdSplit", "vertical", "broad", "bench", "3cone", "shuttle", "height", "weight", "arm", "hand", "wingspan"];

  const allKeys = Array.from(
    new Set([...DISPLAY_ORDER.filter((k) => myCombine[k] != null && myCombine[k] !== ""), ...Object.keys(myCombine).filter((k) => myCombine[k] != null && myCombine[k] !== "")])
  );

  for (const key of allKeys) {
    const rawVal = myCombine[key];
    if (!rawVal) continue;

    const metricDef = COMBINE_RADAR_METRICS[key];
    const label = metricDef?.label ?? key.replace(/([A-Z])/g, " $1").trim();

    if (!metricDef) {
      result.push({ key, label, value: rawVal, rank: null, outOf: null, lowerIsBetter: false });
      continue;
    }

    const { lowerIsBetter } = metricDef;
    const myVal = parseCombineNumber(rawVal);
    if (myVal === null) {
      result.push({ key, label, value: rawVal, rank: null, outOf: null, lowerIsBetter });
      continue;
    }

    const peerVals = peers
      .map((p) => {
        const v = parseCombineNumber(parseCombineData(p.combineData)[key] ?? "");
        return v !== null ? { id: p.id, val: v } : null;
      })
      .filter((x): x is { id: string; val: number } => x != null);

    if (peerVals.length < 2) {
      result.push({ key, label, value: rawVal, rank: null, outOf: null, lowerIsBetter });
      continue;
    }

    if (lowerIsBetter) peerVals.sort((a, b) => a.val - b.val);
    else peerVals.sort((a, b) => b.val - a.val);

    const rank = peerVals.findIndex((x) => x.id === prospect.id) + 1;
    result.push({
      key,
      label,
      value: rawVal,
      rank: rank > 0 ? rank : null,
      outOf: peerVals.length,
      lowerIsBetter,
    });
  }

  return result;
}

/** Primary NFL team logo URL (Sleeper CDN, same root domain as player headshots). */
export function getNflTeamLogoUrl(abbr: string): string {
  const a = abbr.trim().toLowerCase();
  return `https://sleepercdn.com/images/team_logos/nfl/${a}.jpg`;
}

/** Fallback when Sleeper logo is missing or fails to load. */
export function getNflTeamLogoUrlEspn(abbr: string): string {
  const a = abbr.trim().toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${a}.png`;
}

/** Use as `<img onError={(e) => applyNflTeamLogoFallback(e.currentTarget, abbr)} />` */
export function applyNflTeamLogoFallback(img: HTMLImageElement, abbr: string): void {
  if (img.dataset.logoFallback === "espn") {
    img.style.visibility = "hidden";
    return;
  }
  img.dataset.logoFallback = "espn";
  img.src = getNflTeamLogoUrlEspn(abbr);
}
