/**
 * Position profile for the player card: a handful of stats that matter for the player's position, each as a
 * percentile among the league's players at that position. Computed from Sleeper season stats, per game and as
 * season totals.
 */
import type { Express } from "express";
import { getAllPlayers, getLeague, getNFLState, getPlayerStats } from "./sleeper";

type Stat = Record<string, number>;
type Kind = "count" | "rate" | "inverse";

interface AxisDef {
  key: string;
  label: string;
  /** Label when showing season totals, when it differs (PPG becomes Fantasy pts). */
  totalLabel?: string;
  kind: Kind;
  /** "num" 1 decimal, "pct" a percentage, "pts" fantasy points. */
  unit: "num" | "pct" | "pts" | "int";
  /** Season total (counts) or the rate itself (rates). Null when it can't be computed. */
  value: (s: Stat) => number | null;
  /** Whether the stat line has enough volume for a rate to mean something. */
  volume?: (s: Stat) => boolean;
}

const n = (s: Stat, k: string) => Number(s[k]) || 0;
const pts = (s: Stat) => Number(s.pts_ppr ?? s.pts_half_ppr ?? s.pts_std) || 0;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const pctOf = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

const FANTASY: AxisDef = { key: "pts", label: "PPG", totalLabel: "Fantasy pts", kind: "count", unit: "pts", value: pts };

const AXES: Record<string, AxisDef[]> = {
  WR: [
    { key: "tgt", label: "Targets", kind: "count", unit: "num", value: s => n(s, "rec_tgt") },
    { key: "rec", label: "Receptions", kind: "count", unit: "num", value: s => n(s, "rec") },
    { key: "recyd", label: "Rec yards", kind: "count", unit: "num", value: s => n(s, "rec_yd") },
    { key: "rectd", label: "Rec TDs", kind: "count", unit: "num", value: s => n(s, "rec_td") },
    { key: "ypt", label: "Yds / target", kind: "rate", unit: "num", value: s => ratio(n(s, "rec_yd"), n(s, "rec_tgt")), volume: s => n(s, "rec_tgt") >= 15 },
    FANTASY,
  ],
  RB: [
    { key: "att", label: "Carries", kind: "count", unit: "num", value: s => n(s, "rush_att") },
    { key: "rushyd", label: "Rush yards", kind: "count", unit: "num", value: s => n(s, "rush_yd") },
    { key: "ypc", label: "Yds / carry", kind: "rate", unit: "num", value: s => ratio(n(s, "rush_yd"), n(s, "rush_att")), volume: s => n(s, "rush_att") >= 30 },
    { key: "rushtd", label: "Rush TDs", kind: "count", unit: "num", value: s => n(s, "rush_td") },
    { key: "rec", label: "Receptions", kind: "count", unit: "num", value: s => n(s, "rec") },
    { key: "recyd", label: "Rec yards", kind: "count", unit: "num", value: s => n(s, "rec_yd") },
  ],
  QB: [
    { key: "passyd", label: "Pass yards", kind: "count", unit: "num", value: s => n(s, "pass_yd") },
    { key: "passtd", label: "Pass TDs", kind: "count", unit: "num", value: s => n(s, "pass_td") },
    { key: "cmp", label: "Comp %", kind: "rate", unit: "pct", value: s => pctOf(n(s, "pass_cmp"), n(s, "pass_att")), volume: s => n(s, "pass_att") >= 50 },
    { key: "int", label: "Turnover avoidance", kind: "inverse", unit: "num", value: s => n(s, "pass_int") },
    { key: "rushyd", label: "Rush yards", kind: "count", unit: "num", value: s => n(s, "rush_yd") },
    { key: "rushtd", label: "Rush TDs", kind: "count", unit: "num", value: s => n(s, "rush_td") },
  ],
  K: [
    { key: "fgm", label: "FG made", kind: "count", unit: "num", value: s => n(s, "fgm") },
    { key: "fgpct", label: "FG %", kind: "rate", unit: "pct", value: s => pctOf(n(s, "fgm"), n(s, "fga")), volume: s => n(s, "fga") >= 5 },
    { key: "fg40", label: "FG 40+ yds", kind: "count", unit: "num", value: s => n(s, "fgm_40_49") + (s.fgm_50p != null ? n(s, "fgm_50p") : n(s, "fgm_50_59") + n(s, "fgm_60p")) },
    { key: "fg50", label: "FG 50+ yds", kind: "count", unit: "num", value: s => (s.fgm_50p != null ? n(s, "fgm_50p") : n(s, "fgm_50_59") + n(s, "fgm_60p")) },
    { key: "xpm", label: "XP made", kind: "count", unit: "num", value: s => n(s, "xpm") },
    FANTASY,
  ],
};
AXES.TE = [
  AXES.WR[0], AXES.WR[1], AXES.WR[2], AXES.WR[3], AXES.WR[4], FANTASY,
];

/** Whether a stat line is a regular at the position, so peers are compared with peers. */
const REGULAR: Record<string, (s: Stat, gp: number) => boolean> = {
  WR: (s, gp) => n(s, "rec_tgt") / gp >= 2,
  TE: (s, gp) => n(s, "rec_tgt") / gp >= 2,
  RB: (s, gp) => (n(s, "rush_att") + n(s, "rec_tgt")) / gp >= 3,
  QB: (s, gp) => n(s, "pass_att") / gp >= 10,
  K: s => n(s, "fga") + n(s, "xpm") >= 3,
};

const MIN_GAMES = 3;
const STATS_TTL_MS = 15 * 60 * 1000;
const statsCache = new Map<string, { at: number; stats: Record<string, Stat> }>();

async function seasonStats(season: number): Promise<Record<string, Stat>> {
  const hit = statsCache.get(String(season));
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.stats;
  const stats = (await getPlayerStats(String(season)).catch(() => ({}))) as Record<string, Stat>;
  statsCache.set(String(season), { at: Date.now(), stats });
  return stats;
}

const hasGames = (stats: Record<string, Stat>) => Object.values(stats).some(s => Number(s?.gp) > 0);

/** Percentile (0–100) of `x` among `peers`, counting ties as half. Lower is better for inverse stats. */
function percentile(x: number, peers: number[], lowerIsBetter: boolean): number | null {
  if (peers.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of peers) {
    if (v === x) equal++;
    else if (lowerIsBetter ? v > x : v < x) below++;
  }
  return Math.round(((below + equal / 2) / peers.length) * 100);
}

interface Computed {
  gp: number;
  peers: number;
  /** Per axis: per-game value, total value, per-game percentile, total percentile. */
  axes: Array<{ perGame: number | null; total: number | null; pctPerGame: number | null; pctTotal: number | null }>;
}

function computeSeason(position: string, playerId: string, stats: Record<string, Stat>, players: Record<string, any>): Computed | null {
  const me = stats[playerId];
  const gp = Number(me?.gp) || 0;
  if (!me || gp <= 0) return null;
  const defs = AXES[position];
  const isRegular = REGULAR[position];

  const peerLines: Array<{ s: Stat; gp: number }> = [];
  for (const [id, s] of Object.entries(stats)) {
    if (id === playerId || players[id]?.position !== position) continue;
    const g = Number(s?.gp) || 0;
    if (g < MIN_GAMES || !isRegular(s, g)) continue;
    peerLines.push({ s, gp: g });
  }

  const axes = defs.map(def => {
    const mine = def.value(me);
    const lower = def.kind === "inverse";
    const volumeOk = def.kind !== "rate" || (def.volume ? def.volume(me) : true);
    const peerTotals: number[] = [];
    const peerPerGame: number[] = [];
    for (const p of peerLines) {
      if (def.kind === "rate" && def.volume && !def.volume(p.s)) continue;
      const v = def.value(p.s);
      if (v == null) continue;
      peerTotals.push(v);
      peerPerGame.push(def.kind === "rate" ? v : v / p.gp);
    }
    if (mine == null || !volumeOk) return { perGame: null, total: null, pctPerGame: null, pctTotal: null };
    const mineGame = def.kind === "rate" ? mine : mine / gp;
    return {
      perGame: mineGame,
      total: mine,
      pctPerGame: percentile(mineGame, peerPerGame, lower),
      pctTotal: percentile(mine, peerTotals, lower),
    };
  });
  return { gp, peers: peerLines.length + 1, axes };
}

export async function buildPositionRadar(leagueId: string, playerId: string) {
  const [players, league, nflState] = await Promise.all([getAllPlayers(), getLeague(leagueId), getNFLState().catch(() => null as any)]);
  const position = String(players[playerId]?.position || "");
  if (!AXES[position]) return { position, axes: [] as any[] };

  const leagueSeason = parseInt(String(league?.season || nflState?.season || new Date().getFullYear()), 10);
  // The latest season with games, and the one before it for comparison.
  let season = leagueSeason;
  let stats = await seasonStats(season);
  if (!hasGames(stats)) {
    season = leagueSeason - 1;
    stats = await seasonStats(season);
  }
  const previousSeason = season - 1;
  const [previousStats] = await Promise.all([seasonStats(previousSeason)]);

  const cur = computeSeason(position, playerId, stats, players);
  const prev = computeSeason(position, playerId, previousStats, players);
  if (!cur) return { position, season, axes: [] as any[] };

  const defs = AXES[position];
  return {
    position,
    season,
    previousSeason: prev ? previousSeason : null,
    games: cur.gp,
    previousGames: prev?.gp ?? null,
    peers: cur.peers,
    lowSample: cur.gp < MIN_GAMES,
    axes: defs.map((def, i) => ({
      key: def.key,
      label: def.label,
      totalLabel: def.totalLabel ?? def.label,
      kind: def.kind,
      unit: def.unit,
      perGame: { value: cur.axes[i].perGame, pct: cur.axes[i].pctPerGame, prior: prev?.axes[i].pctPerGame ?? null },
      total: { value: cur.axes[i].total, pct: cur.axes[i].pctTotal, prior: prev?.axes[i].pctTotal ?? null },
    })),
  };
}

export function registerPositionRadarRoutes(app: Express) {
  app.get("/api/sleeper/league/:leagueId/player/:playerId/radar", async (req, res) => {
    try {
      res.json(await buildPositionRadar(req.params.leagueId, req.params.playerId));
    } catch (error) {
      console.error("Error building position radar:", error);
      res.status(500).json({ error: "Failed to build position profile" });
    }
  });
}
