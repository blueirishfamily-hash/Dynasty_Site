/**
 * Pure contract / cap / FA / RFA / trade rules for dynasty league offseason flow.
 * Salaries in display dollars unless noted (DB contract salaries stored as tenths → use parseContractSalaries).
 */

export const CURRENT_SEASON_CAP = 250;

export type ContractType = "ROOKIE" | "TAGGED" | "STANDARD";

export const LEAGUE_PHASES = [
  "league_year_rollover",
  "tag_extension",
  "fa_round_1",
  "round_1_results",
  "rfa_match_1",
  "fa_round_2",
  "round_2_results",
  "rfa_match_2",
  "regular_season",
] as const;

export type LeaguePhaseId = (typeof LEAGUE_PHASES)[number];

export const PHASE_LABELS: Record<LeaguePhaseId, string> = {
  league_year_rollover: "League Year Rollover",
  tag_extension: "Tag & Extension Phase",
  fa_round_1: "Free Agency Round 1",
  round_1_results: "Round 1 Results",
  rfa_match_1: "RFA Match Window 1",
  fa_round_2: "Free Agency Round 2",
  round_2_results: "Round 2 Results",
  rfa_match_2: "RFA Match Window 2",
  regular_season: "Regular Season",
};

export interface PhaseConfigEntry {
  id: LeaguePhaseId;
  startAt: number | null;
  endAt: number | null;
}

export interface FlatSalaryContract {
  playerId?: string;
  yearlySalary: number;
  startYear: number;
  years: number;
}

export interface TeamCapInput {
  rosterId: number;
  contracts: Array<{
    playerId: string;
    salaries: Record<number, number>; // display dollars per year key
    isRookieContract?: number;
    franchiseTagUsed?: number;
  }>;
  deadCapByYear: Record<number, number>; // display dollars
  capHolds?: FlatSalaryContract[];
}

export interface BidInput {
  id: string;
  rosterId: number;
  playerId: string;
  bidAmount: number; // yearly salary (same units as Contracts UI — display dollars)
  contractYears: number;
  createdAt: number;
  isRfa?: boolean;
  originalRosterId?: number | null;
}

export interface RfaDesignationInput {
  leagueId: string;
  season: number;
  rosterId: number;
  playerId: string;
}

export interface TradePlayerSide {
  playerId: string;
  currentYearSalary: number;
}

// ─── Parsing / classification (extracted from existing client behavior) ───────

export function parseContractSalaries(raw: string | Record<string, number>): Record<number, number> {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    const result: Record<number, number> = {};
    for (const [year, val] of Object.entries(obj)) {
      const y = Number(year);
      if (!isNaN(y)) result[y] = (Number(val) || 0) / 10;
    }
    return result;
  } catch {
    return {};
  }
}

export function contractType(contract: {
  isRookieContract?: number;
  franchiseTagUsed?: number;
}): ContractType {
  if (contract.isRookieContract === 1) return "ROOKIE";
  if (contract.franchiseTagUsed === 1) return "TAGGED";
  return "STANDARD";
}

export function bidTotalValue(yearlySalary: number, years: number): number {
  return yearlySalary * years;
}

/** Same sort as server/routes.ts bids/all — total desc, then yearly desc, then earliest createdAt. */
export function compareBids(a: BidInput, b: BidInput): number {
  const totalA = bidTotalValue(a.bidAmount, a.contractYears);
  const totalB = bidTotalValue(b.bidAmount, b.contractYears);
  if (totalA !== totalB) return totalB - totalA;
  if (a.bidAmount !== b.bidAmount) return b.bidAmount - a.bidAmount;
  // No other tie-break in existing code — earliest bid wins.
  return a.createdAt - b.createdAt;
}

export function resolveBids(
  _playerId: string,
  bids: BidInput[],
): { winner: BidInput | null; reason: string } {
  const active = bids.filter(b => b.bidAmount > 0 && b.contractYears > 0);
  if (active.length === 0) {
    return { winner: null, reason: "No valid bids" };
  }
  const sorted = [...active].sort(compareBids);
  const winner = sorted[0];
  return {
    winner,
    reason: `Winner: roster ${winner.rosterId}, ${winner.contractYears}×$${winner.bidAmount} (total $${bidTotalValue(winner.bidAmount, winner.contractYears)})`,
  };
}

// ─── Cap by season ───────────────────────────────────────────────────────────

function salariesForSeason(
  team: TeamCapInput,
  year: number,
  extra: FlatSalaryContract[] = [],
  excludePlayerIds: Set<string> = new Set(),
): number {
  let sum = 0;
  for (const c of team.contracts) {
    if (excludePlayerIds.has(c.playerId)) continue;
    sum += c.salaries[year] || 0;
  }
  for (const e of extra) {
    for (let i = 0; i < e.years; i++) {
      const y = e.startYear + i;
      if (y === year) sum += e.yearlySalary;
    }
  }
  for (const h of team.capHolds || []) {
    for (let i = 0; i < h.years; i++) {
      const y = h.startYear + i;
      if (y === year) sum += h.yearlySalary;
    }
  }
  sum += team.deadCapByYear[year] || 0;
  return Math.round(sum * 100) / 100;
}

export function capBySeason(
  team: TeamCapInput,
  years: number[],
  extraContracts: FlatSalaryContract[] = [],
  excludePlayerIds: string[] = [],
): Record<number, { committed: number; cap: number; room: number }> {
  const exclude = new Set(excludePlayerIds);
  const out: Record<number, { committed: number; cap: number; room: number }> = {};
  for (const year of years) {
    const committed = salariesForSeason(team, year, extraContracts, exclude);
    const cap = CURRENT_SEASON_CAP;
    out[year] = {
      committed,
      cap,
      room: Math.round((cap - committed) * 100) / 100,
    };
  }
  return out;
}

export function fitsUnderCapAllSeasons(
  team: TeamCapInput,
  contracts: FlatSalaryContract[],
  years?: number[],
): { ok: boolean; worstSeason: number | null; overBy: number; reason: string } {
  const contractYears = new Set<number>();
  for (const c of contracts) {
    for (let i = 0; i < c.years; i++) contractYears.add(c.startYear + i);
  }
  const seasonList = years ?? [...contractYears].sort((a, b) => a - b);
  const bySeason = capBySeason(team, seasonList, contracts);
  let worst: number | null = null;
  let maxOver = 0;
  for (const y of seasonList) {
    const room = bySeason[y]?.room ?? 0;
    if (room < 0) {
      const over = -room;
      if (over > maxOver) {
        maxOver = over;
        worst = y;
      }
    }
  }
  if (worst !== null) {
    return {
      ok: false,
      worstSeason: worst,
      overBy: Math.round(maxOver * 100) / 100,
      reason: `Over cap by $${maxOver.toFixed(1)} in ${worst}`,
    };
  }
  return { ok: true, worstSeason: null, overBy: 0, reason: "Fits under cap in all seasons" };
}

export function validateRoundResolution(
  team: TeamCapInput,
  keptWins: FlatSalaryContract[],
  currentYear: number,
): { canConfirm: boolean; bySeason: ReturnType<typeof capBySeason>; reason: string } {
  const years = new Set<number>();
  for (const w of keptWins) {
    for (let i = 0; i < w.years; i++) years.add(w.startYear + i);
  }
  if (years.size === 0) years.add(currentYear);
  const seasonList = [...years].sort((a, b) => a - b);
  const fit = fitsUnderCapAllSeasons(team, keptWins, seasonList);
  const bySeason = capBySeason(team, seasonList, keptWins);
  return {
    canConfirm: fit.ok,
    bySeason,
    reason: fit.reason,
  };
}

// ─── RFA ─────────────────────────────────────────────────────────────────────

export function designateRFA(
  existingDesignations: RfaDesignationInput[],
  params: RfaDesignationInput & {
    currentPhase: LeaguePhaseId;
    isExpiringRookie: boolean;
  },
): { ok: boolean; reason: string } {
  if (params.currentPhase !== "tag_extension") {
    return { ok: false, reason: "RFA designation only allowed during Tag & Extension Phase" };
  }
  if (!params.isExpiringRookie) {
    return { ok: false, reason: "Player must be on an expiring rookie contract on your roster" };
  }
  const teamCount = existingDesignations.filter(
    d => d.season === params.season && d.rosterId === params.rosterId,
  ).length;
  if (teamCount >= 1) {
    return { ok: false, reason: "Each team may designate at most 1 RFA per season" };
  }
  return { ok: true, reason: "RFA designated" };
}

export function canMatchRFA(
  originalTeam: TeamCapInput,
  offer: FlatSalaryContract,
): { eligible: boolean; shortSeason: number | null; overBy: number; reason: string } {
  const years: number[] = [];
  for (let i = 0; i < offer.years; i++) years.push(offer.startYear + i);
  const fit = fitsUnderCapAllSeasons(originalTeam, [offer], years);
  if (fit.ok) {
    return { eligible: true, shortSeason: null, overBy: 0, reason: "Can match offer" };
  }
  return {
    eligible: false,
    shortSeason: fit.worstSeason,
    overBy: fit.overBy,
    reason: `Not eligible to match: $${fit.overBy.toFixed(1)} short in ${fit.worstSeason}`,
  };
}

export function applyCapHold(team: TeamCapInput, offer: FlatSalaryContract): TeamCapInput {
  const holds = [...(team.capHolds || []), offer];
  return { ...team, capHolds: holds };
}

export function releaseCapHold(team: TeamCapInput, playerId: string): TeamCapInput {
  const holds = (team.capHolds || []).filter(h => h.playerId !== playerId);
  return { ...team, capHolds: holds };
}

// ─── Trades (current season only) ────────────────────────────────────────────

export function validateTradeSide(
  salaryBefore: number,
  sends: TradePlayerSide[],
  receives: TradePlayerSide[],
): { pass: boolean; salaryAfter: number; netChange: number; reason: string } {
  const sent = sends.reduce((s, p) => s + p.currentYearSalary, 0);
  const recv = receives.reduce((s, p) => s + p.currentYearSalary, 0);
  const netChange = recv - sent;
  const salaryAfter = salaryBefore + netChange;
  const cap = CURRENT_SEASON_CAP;
  if (salaryAfter <= cap) {
    return {
      pass: true,
      salaryAfter,
      netChange,
      reason: `Allowed: $${(cap - salaryAfter).toFixed(1)} of room left`,
    };
  }
  if (netChange < 0) {
    return {
      pass: true,
      salaryAfter,
      netChange,
      reason: "Allowed: takes on less salary than it sends out",
    };
  }
  return {
    pass: false,
    salaryAfter,
    netChange,
    reason: `Blocked: $${(salaryAfter - cap).toFixed(1)} over the cap and adds salary`,
  };
}

export function validateTrade(
  sideA: { salaryBefore: number },
  sideB: { salaryBefore: number },
  aSends: TradePlayerSide[],
  bSends: TradePlayerSide[],
): {
  teamA: ReturnType<typeof validateTradeSide>;
  teamB: ReturnType<typeof validateTradeSide>;
  bothPass: boolean;
} {
  const teamA = validateTradeSide(sideA.salaryBefore, aSends, bSends);
  const teamB = validateTradeSide(sideB.salaryBefore, bSends, aSends);
  return { teamA, teamB, bothPass: teamA.pass && teamB.pass };
}

// ─── In-season signing ───────────────────────────────────────────────────────

export function createInSeasonSigning(
  faabBid: number | null,
): { contractType: ContractType; years: number; yearlySalary: number; reason: string } {
  const yearlySalary = faabBid != null && faabBid > 0 ? faabBid : 1;
  return {
    contractType: "STANDARD",
    years: 1,
    yearlySalary,
    reason: yearlySalary === 1 ? "1-year STANDARD at $1 (no FAAB bid)" : `1-year STANDARD at FAAB $${yearlySalary}`,
  };
}

// ─── Phase resolution ────────────────────────────────────────────────────────

export function parsePhaseConfig(json: string | null | undefined): PhaseConfigEntry[] {
  const defaults: PhaseConfigEntry[] = LEAGUE_PHASES.map(id => ({
    id,
    startAt: null,
    endAt: null,
  }));
  if (!json) return defaults;
  try {
    const parsed = JSON.parse(json) as PhaseConfigEntry[];
    if (!Array.isArray(parsed)) return defaults;
    const byId = new Map(parsed.map(p => [p.id, p]));
    return LEAGUE_PHASES.map(id => byId.get(id) ?? { id, startAt: null, endAt: null });
  } catch {
    return defaults;
  }
}

export function getCurrentPhase(
  phases: PhaseConfigEntry[],
  now: number = Date.now(),
  manualOverride: LeaguePhaseId | null = null,
): LeaguePhaseId {
  const withDates = phases.filter(p => p.startAt != null && p.endAt != null);
  if (withDates.length > 0) {
    for (const p of phases) {
      if (p.startAt != null && p.endAt != null && now >= p.startAt && now <= p.endAt) {
        return p.id;
      }
    }
    const future = phases.find(p => p.startAt != null && p.startAt > now);
    if (future) {
      const idx = LEAGUE_PHASES.indexOf(future.id);
      return idx > 0 ? LEAGUE_PHASES[idx - 1] : LEAGUE_PHASES[0];
    }
    return "regular_season";
  }
  if (manualOverride && LEAGUE_PHASES.includes(manualOverride)) {
    return manualOverride;
  }
  return "tag_extension";
}

export function formatPhaseDate(ts: number | null): string {
  if (ts == null) return "Date TBD";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
