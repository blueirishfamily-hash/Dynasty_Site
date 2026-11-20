// League Stats data (players, drafts, transactions) built from Sleeper data. Pure functions only (no network, no
// database) so every rule can be unit tested; server/routes/leagueStats.ts fetches and caches.

export interface PlayerRef {
  name: string;
  position: string | null;
  team: string | null;
}

export type PlayerDirectory = Record<string, PlayerRef>;

// ───────────────────────── Players ─────────────────────────

export interface MatchupLike {
  roster_id: number;
  points: number;
  starters: string[] | null;
  players: string[] | null;
  players_points: Record<string, number> | null;
}

export interface PointsTotals {
  /** Points scored while on a team's roster (starters and bench) */
  points: number;
  /** Points scored while in a starting lineup */
  started: number;
  /** Weeks on a roster in a week that was played */
  games: number;
  /** The same points split by the roster (fantasy team) the player was on that week */
  byRoster: Map<number, { points: number; games: number }>;
}

/**
 * Adds up each player's points from a season's weekly matchups. A week that has not been played (no team scored)
 * is ignored, so a season in progress does not count empty weeks.
 */
export function aggregateMatchupPoints(weeks: MatchupLike[][]): Map<string, PointsTotals> {
  const totals = new Map<string, PointsTotals>();
  for (const week of weeks) {
    const played = week.some((m) => (m.points ?? 0) > 0);
    if (!played) continue;
    for (const matchup of week) {
      const pointsByPlayer = matchup.players_points ?? {};
      const starters = new Set((matchup.starters ?? []).map(String));
      for (const [playerId, raw] of Object.entries(pointsByPlayer)) {
        const points = Number(raw) || 0;
        const t = totals.get(playerId) ?? { points: 0, started: 0, games: 0, byRoster: new Map() };
        t.points += points;
        const r = t.byRoster.get(matchup.roster_id) ?? { points: 0, games: 0 };
        r.points += points;
        r.games += 1;
        t.byRoster.set(matchup.roster_id, r);
        if (starters.has(playerId)) t.started += points;
        t.games += 1;
        totals.set(playerId, t);
      }
    }
  }
  return totals;
}

export interface SeasonPlayerTotals {
  season: string;
  totals: Map<string, PointsTotals>;
  /** Roster id to team, to name the teams a player was on that season */
  teams?: Map<number, TeamRef>;
}

export interface PlayerSeasonLine {
  season: string;
  points: number;
  started: number;
  games: number;
  /** Every team the player scored for that season */
  teams: Array<{ franchiseId: string; teamName: string; points: number; games: number }>;
}

export interface PlayerLeader {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  points: number;
  started: number;
  games: number;
  /** The season with the most points */
  best: { season: string; points: number };
  /** Where the player is rostered now (set by the route), if anywhere */
  currentTeam?: { franchiseId: string; teamName: string } | null;
  seasons: PlayerSeasonLine[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One row per player across the given seasons, most points first. Players with no points are left out. */
export function buildPlayerLeaders(seasons: SeasonPlayerTotals[], players: PlayerDirectory): PlayerLeader[] {
  const byPlayer = new Map<string, PlayerSeasonLine[]>();
  for (const { season, totals, teams } of seasons) {
    totals.forEach((t, playerId) => {
      if (t.points === 0 && t.started === 0) return;
      const lines = byPlayer.get(playerId) ?? [];
      const teamLines = Array.from(t.byRoster.entries())
        .map(([rosterId, r]) => {
          const ref = teams?.get(rosterId);
          return { franchiseId: ref?.franchiseId ?? `roster-${rosterId}`, teamName: ref?.teamName ?? `Team ${rosterId}`, points: round1(r.points), games: r.games };
        })
        .sort((a, b) => b.points - a.points);
      lines.push({ season, points: round1(t.points), started: round1(t.started), games: t.games, teams: teamLines });
      byPlayer.set(playerId, lines);
    });
  }
  const leaders: PlayerLeader[] = [];
  byPlayer.forEach((lines, playerId) => {
    const sorted = [...lines].sort((a, b) => a.season.localeCompare(b.season));
    const best = sorted.reduce((a, b) => (b.points > a.points ? b : a), sorted[0]);
    const ref = players[playerId];
    leaders.push({
      playerId,
      // Team defenses have ids like "CIN" and may not be in the player directory.
      name: ref?.name ?? playerId,
      position: ref?.position ?? null,
      team: ref?.team ?? null,
      points: round1(sorted.reduce((s, l) => s + l.points, 0)),
      started: round1(sorted.reduce((s, l) => s + l.started, 0)),
      games: sorted.reduce((s, l) => s + l.games, 0),
      best: { season: best.season, points: best.points },
      seasons: sorted,
    });
  });
  return leaders.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

// ───────────────────────── Drafts ─────────────────────────

/** A draft with many rounds is the startup draft; the yearly rookie drafts have a handful. */
export function draftKind(rounds: number): "startup" | "rookie" {
  return rounds > 5 ? "startup" : "rookie";
}

export interface TeamRef {
  rosterId: number;
  /** Owner user id, or "roster-<id>" for an unowned roster (the same id League History uses) */
  franchiseId: string;
  teamName: string;
}

export interface DraftPickLike {
  round: number;
  roster_id: number;
  player_id: string;
  pick_no: number;
  draft_slot: number;
  metadata?: { first_name?: string; last_name?: string; position?: string; team?: string } | null;
}

export interface StatsDraftPick {
  round: number;
  pickNo: number;
  slot: number;
  rosterId: number;
  franchiseId: string;
  teamName: string;
  /** The team that originally held the slot, when the pick was traded */
  via: { rosterId: number; franchiseId: string; teamName: string } | null;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
}

export function buildDraftPicks(
  picks: DraftPickLike[],
  slotToRoster: Record<string, number> | null | undefined,
  teams: Map<number, TeamRef>,
  players: PlayerDirectory,
): StatsDraftPick[] {
  const team = (rosterId: number): TeamRef => teams.get(rosterId) ?? { rosterId, franchiseId: `roster-${rosterId}`, teamName: `Team ${rosterId}` };
  return [...picks]
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((p) => {
      const owner = team(p.roster_id);
      const originalRoster = slotToRoster?.[String(p.draft_slot)];
      const original = originalRoster != null && originalRoster !== p.roster_id ? team(originalRoster) : null;
      const meta = p.metadata ?? {};
      const ref = players[p.player_id];
      const metaName = `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim();
      return {
        round: p.round,
        pickNo: p.pick_no,
        slot: p.draft_slot,
        rosterId: p.roster_id,
        franchiseId: owner.franchiseId,
        teamName: owner.teamName,
        via: original ? { rosterId: original.rosterId, franchiseId: original.franchiseId, teamName: original.teamName } : null,
        playerId: p.player_id,
        playerName: ref?.name || metaName || "Unknown",
        position: (meta.position || ref?.position || "").toUpperCase(),
        nflTeam: meta.team || ref?.team || "",
      };
    });
}

// ───────────────────────── Transactions ─────────────────────────

export type FeedType = "trade" | "waiver" | "free_agent" | "commissioner";

export interface TransactionLike {
  transaction_id: string;
  type: FeedType;
  status: string;
  status_updated?: number;
  created?: number;
  roster_ids?: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks?: Array<{ season: string; round: number; roster_id: number; previous_owner_id: number; owner_id: number }> | null;
  settings?: Record<string, unknown> | null;
}

export interface FeedAsset {
  kind: "player" | "pick";
  playerId?: string;
  /** Player name, or "2027 round 1 pick" */
  name: string;
  position?: string | null;
  team?: string | null;
}

export interface FeedSide {
  rosterId: number;
  franchiseId: string;
  teamName: string;
  /** What this team got and gave up */
  received: FeedAsset[];
  gave: FeedAsset[];
}

export interface FeedItem {
  id: string;
  type: FeedType;
  season: string;
  week: number;
  at: number;
  /** Waiver claims: the winning bid */
  waiverBid: number | null;
  sides: FeedSide[];
}

const pickAsset = (p: { season: string; round: number; roster_id: number }, ownerOf: (id: number) => string): FeedAsset => ({
  kind: "pick",
  name: `${p.season} round ${p.round} pick`,
  position: null,
  team: ownerOf(p.roster_id) || null,
});

/**
 * Newest first. A trade has a side for each team (what it received and gave up); other moves have one side.
 * Moves that did not complete are left out.
 */
export function buildTransactionFeed(
  weeks: Array<{ week: number; transactions: TransactionLike[] }>,
  season: string,
  teams: Map<number, TeamRef>,
  players: PlayerDirectory,
): FeedItem[] {
  const team = (rosterId: number): TeamRef => teams.get(rosterId) ?? { rosterId, franchiseId: `roster-${rosterId}`, teamName: `Team ${rosterId}` };
  const playerAsset = (playerId: string): FeedAsset => {
    const ref = players[playerId];
    return { kind: "player", playerId, name: ref?.name ?? playerId, position: ref?.position ?? null, team: ref?.team ?? null };
  };
  const items: FeedItem[] = [];
  for (const { week, transactions } of weeks) {
    for (const t of transactions) {
      if (!t || t.status !== "complete") continue;
      const at = Number(t.status_updated || t.created) || 0;
      const rosterIds = new Set<number>(t.roster_ids ?? []);
      Object.values(t.adds ?? {}).forEach((r) => rosterIds.add(Number(r)));
      Object.values(t.drops ?? {}).forEach((r) => rosterIds.add(Number(r)));
      (t.draft_picks ?? []).forEach((p) => {
        rosterIds.add(Number(p.owner_id));
        rosterIds.add(Number(p.previous_owner_id));
      });
      const sides: FeedSide[] = Array.from(rosterIds)
        .sort((a, b) => a - b)
        .map((rosterId) => {
          const ref = team(rosterId);
          const received: FeedAsset[] = Object.entries(t.adds ?? {})
            .filter(([, r]) => Number(r) === rosterId)
            .map(([id]) => playerAsset(id));
          const gave: FeedAsset[] = Object.entries(t.drops ?? {})
            .filter(([, r]) => Number(r) === rosterId)
            .map(([id]) => playerAsset(id));
          (t.draft_picks ?? []).forEach((p) => {
            const ownerOf = (id: number) => team(id).teamName;
            if (Number(p.owner_id) === rosterId) received.push(pickAsset(p, ownerOf));
            if (Number(p.previous_owner_id) === rosterId) gave.push(pickAsset(p, ownerOf));
          });
          return { rosterId, franchiseId: ref.franchiseId, teamName: ref.teamName, received, gave };
        })
        // a team that appears with nothing on either side (for example only in roster_ids) is not shown
        .filter((s) => s.received.length > 0 || s.gave.length > 0);
      if (sides.length === 0) continue;
      const bid = t.type === "waiver" ? Number(t.settings?.waiver_bid) : NaN;
      items.push({
        id: t.transaction_id,
        type: t.type,
        season,
        week,
        at,
        waiverBid: Number.isFinite(bid) ? bid : null,
        sides,
      });
    }
  }
  return items.sort((a, b) => b.at - a.at || b.week - a.week);
}
