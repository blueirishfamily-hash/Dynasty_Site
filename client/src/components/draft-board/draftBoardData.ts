import { pickTradeValue } from "../trade-center/tradeMath";

export interface OwnerInfo {
  name: string;
  initials: string;
  avatar?: string | null;
}

/** The subset of the Draft page's pick shape these helpers need. */
export interface BoardPick {
  round: number;
  pick: number;
  rosterId?: number;
  originalOwner: OwnerInfo;
  currentOwner: OwnerInfo;
  player?: { id: string; name: string; position: string; team: string };
  fantasyTeam?: string;
  isUserPick?: boolean;
}

export interface BoardTile {
  key: string;
  round: number;
  slot: number;
  label: string;
  pick?: BoardPick;
  /** Initials of the original owner when the pick has been traded */
  viaInitials?: string;
}

export const slotLabel = (round: number, slot: number) =>
  `${round}.${String(slot).padStart(2, "0")}`;

const NAME_SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

/** "Marvin Harrison Jr." becomes "Harrison"; single names are returned as is. */
export function lastName(full: string): string {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "Unknown";
  let i = parts.length - 1;
  while (i > 0 && NAME_SUFFIXES.has(parts[i].toLowerCase())) i--;
  return parts[i];
}

/**
 * Future picks: one row of tiles per round, in draft order. Row order comes from
 * `order` (roster ids, slot 1 first) so the board agrees with the Draft Odds table.
 */
export function buildFutureBoard(
  picks: BoardPick[],
  order: number[],
  rounds: number,
  teamCount: number
): BoardTile[][] {
  const useOrder = order.length >= teamCount;
  return Array.from({ length: rounds }, (_, r) => {
    const round = r + 1;
    return Array.from({ length: teamCount }, (_, s) => {
      const slot = s + 1;
      const pick = picks.find(
        (p) => p.round === round && (useOrder ? p.rosterId === order[s] : p.pick === slot)
      );
      const traded = pick && pick.originalOwner.initials !== pick.currentOwner.initials;
      return {
        key: `${round}-${slot}`,
        round,
        slot,
        label: slotLabel(round, slot),
        pick,
        viaInitials: traded ? pick!.originalOwner.initials : undefined,
      };
    });
  });
}

/** Completed drafts: tiles by draft slot within each round. */
export function buildHistoricalBoard(picks: BoardPick[], teamCount: number): BoardTile[][] {
  if (picks.length === 0) return [];
  const maxRound = Math.max(...picks.map((p) => p.round || 1), 1);
  return Array.from({ length: maxRound }, (_, r) => {
    const round = r + 1;
    const inRound = picks.filter((p) => p.round === round);
    const slots = Math.max(teamCount, ...inRound.map((p) => p.pick || 0));
    return Array.from({ length: slots }, (_, s) => {
      const slot = s + 1;
      return {
        key: `${round}-${slot}`,
        round,
        slot,
        label: slotLabel(round, slot),
        pick: inRound.find((p) => p.pick === slot),
      };
    });
  });
}

export interface RawPick {
  id?: string;
  season: string;
  round: number | string;
  currentOwnerId: number;
  originalOwnerId: number;
  originalOwnerName?: string;
  grade?: string;
  draftSlot?: number;
}

export interface CapitalPick {
  key: string;
  label: string;
  via?: string;
  grade?: string;
  value: number;
}

export interface DraftCapital {
  thisYear: CapitalPick[];
  tradedAway: { key: string; label: string; to: string }[];
  later: { key: string; label: string; via?: string }[];
  totalValue: number;
  /** 1 = most pick value in the league; null if it can't be worked out */
  rank: number | null;
  teams: number;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function buildDraftCapital(
  raw: RawPick[],
  opts: {
    userRosterId: number;
    season: string;
    order: number[];
    names: Map<number, string>;
  }
): DraftCapital {
  const { userRosterId, season, order, names } = opts;
  // Same grade-based pick value the Trade Center uses.
  const valueOf = (p: RawPick) => pickTradeValue({ id: "", year: 0, round: 0, grade: p.grade });
  const slotOf = (p: RawPick): number | undefined => {
    const idx = order.indexOf(p.originalOwnerId);
    if (idx >= 0) return idx + 1;
    return p.draftSlot ? Number(p.draftSlot) : undefined;
  };
  const label = (p: RawPick) => {
    const round = Number(p.round);
    const slot = slotOf(p);
    return slot ? slotLabel(round, slot) : `${p.season} R${round}`;
  };
  const bySlot = (a: RawPick, b: RawPick) =>
    Number(a.round) - Number(b.round) || (slotOf(a) ?? 99) - (slotOf(b) ?? 99);
  const nameOf = (id: number, fallback?: string) => names.get(id) ?? fallback ?? `Team ${id}`;

  const mine = raw.filter((p) => p.currentOwnerId === userRosterId);

  const thisYear = mine
    .filter((p) => p.season === season)
    .sort(bySlot)
    .map((p, i) => ({
      key: `${p.id ?? i}-${p.round}`,
      label: label(p),
      via: p.originalOwnerId !== userRosterId ? nameOf(p.originalOwnerId, p.originalOwnerName) : undefined,
      grade: p.grade,
      value: valueOf(p),
    }));

  const tradedAway = raw
    .filter(
      (p) => p.season === season && p.originalOwnerId === userRosterId && p.currentOwnerId !== userRosterId
    )
    .sort(bySlot)
    .map((p, i) => ({
      key: `${p.id ?? i}-${p.round}`,
      label: label(p),
      to: nameOf(p.currentOwnerId),
    }));

  const later = mine
    .filter((p) => Number(p.season) > Number(season))
    .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.round) - Number(b.round))
    .map((p, i) => ({
      key: `${p.id ?? i}-${p.season}-${p.round}`,
      label: `${p.season} R${Number(p.round)}`,
      via: p.originalOwnerId !== userRosterId ? nameOf(p.originalOwnerId, p.originalOwnerName) : undefined,
    }));

  const totals = new Map<number, number>();
  names.forEach((_, id) => totals.set(id, 0));
  raw.forEach((p) => totals.set(p.currentOwnerId, (totals.get(p.currentOwnerId) ?? 0) + valueOf(p)));
  const totalValue = totals.get(userRosterId) ?? 0;
  const teams = totals.size;
  const rank =
    raw.length > 0 && teams > 1
      ? 1 + Array.from(totals.values()).filter((v) => v > totalValue).length
      : null;

  return { thisYear, tradedAway, later, totalValue, rank, teams };
}
