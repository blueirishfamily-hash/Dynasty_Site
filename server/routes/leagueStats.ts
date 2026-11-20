// League Stats: read-only endpoints for the Players, Drafts and Transactions tabs.
// Everything is built from Sleeper data; completed seasons are memoized in memory because they never change.
import type { Express } from "express";
import { loadLeagueHistory } from "../loadLeagueHistory";
import { getAllPlayers, getDraft, getLeagueRosters, getDraftPicks, getLeagueDrafts, getLeagueMatchups, getLeagueTransactions } from "../sleeper";
import {
  aggregateMatchupPoints,
  buildDraftPicks,
  buildPlayerLeaders,
  buildTransactionFeed,
  draftKind,
  type FeedItem,
  type MatchupLike,
  type PlayerDirectory,
  type PointsTotals,
  type TeamRef,
  type TransactionLike,
} from "../leagueStats";
import type { HistorySeason } from "@shared/leagueHistory";

const LAST_WEEK = 18;

const completedPoints = new Map<string, Map<string, PointsTotals>>();
const completedFeeds = new Map<string, FeedItem[]>();

async function playerDirectory(): Promise<PlayerDirectory> {
  const all = await getAllPlayers().catch(() => ({}) as Record<string, any>);
  const dir: PlayerDirectory = {};
  for (const [id, p] of Object.entries(all as Record<string, any>)) {
    dir[id] = {
      name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id,
      position: p.position ?? null,
      team: p.team ?? null,
    };
  }
  return dir;
}

function teamsOf(season: HistorySeason): Map<number, TeamRef> {
  return new Map(season.teams.map((t) => [t.rosterId, { rosterId: t.rosterId, franchiseId: t.franchiseId, teamName: t.name }]));
}

async function weekMatchups(leagueId: string, weeks: number[]): Promise<MatchupLike[][]> {
  const out: MatchupLike[][] = [];
  // a few at a time so a cold first load does not hammer Sleeper
  for (let i = 0; i < weeks.length; i += 4) {
    const chunk = await Promise.all(weeks.slice(i, i + 4).map((w) => getLeagueMatchups(leagueId, w).catch(() => []) as Promise<MatchupLike[]>));
    out.push(...chunk);
  }
  return out;
}

async function seasonPoints(season: HistorySeason): Promise<Map<string, PointsTotals>> {
  const cached = completedPoints.get(season.leagueId);
  if (cached) return cached;
  // Regular season only: every week before the playoffs
  const weeks = Array.from({ length: Math.max(0, season.playoffWeekStart - 1) }, (_, i) => i + 1);
  const totals = aggregateMatchupPoints(await weekMatchups(season.leagueId, weeks));
  if (season.complete) completedPoints.set(season.leagueId, totals);
  return totals;
}

async function seasonFeed(season: HistorySeason, players: PlayerDirectory): Promise<FeedItem[]> {
  const cached = completedFeeds.get(season.leagueId);
  if (cached) return cached;
  const weeks = Array.from({ length: LAST_WEEK }, (_, i) => i + 1);
  const fetched: Array<{ week: number; transactions: TransactionLike[] }> = [];
  for (let i = 0; i < weeks.length; i += 4) {
    const chunk = await Promise.all(
      weeks.slice(i, i + 4).map(async (week) => ({
        week,
        transactions: (await getLeagueTransactions(season.leagueId, week).catch(() => [])) as unknown as TransactionLike[],
      })),
    );
    fetched.push(...chunk);
  }
  const feed = buildTransactionFeed(fetched, season.season, teamsOf(season), players);
  if (season.complete) completedFeeds.set(season.leagueId, feed);
  return feed;
}

export function registerLeagueStatsRoutes(app: Express): void {
  // Player leaders: season "all" or a single season year
  app.get("/api/league/:leagueId/stats/players", async (req, res) => {
    try {
      const history = await loadLeagueHistory(req.params.leagueId);
      if (!history) return res.status(502).json({ error: "No league history available" });
      const wanted = String(req.query.season ?? "all");
      const seasons = history.seasons.filter((s) => wanted === "all" || s.season === wanted);
      const [directory, ...totals] = await Promise.all([playerDirectory(), ...seasons.map((s) => seasonPoints(s))]);
      const leaders = buildPlayerLeaders(
        seasons.map((s, i) => ({ season: s.season, totals: totals[i], teams: teamsOf(s) })),
        directory,
      );
      // Where each player is rostered now: the newest season's league
      const latest = history.seasons[history.seasons.length - 1];
      if (latest) {
        const rosters = await getLeagueRosters(latest.leagueId).catch(() => []);
        const teams = teamsOf(latest);
        const owner = new Map<string, { franchiseId: string; teamName: string }>();
        for (const r of rosters) {
          const t = teams.get(r.roster_id);
          if (t) (r.players ?? []).forEach((id: string) => owner.set(String(id), { franchiseId: t.franchiseId, teamName: t.teamName }));
        }
        leaders.forEach((l) => (l.currentTeam = owner.get(l.playerId) ?? null));
      }
      res.json({ season: wanted, leaders: leaders.slice(0, 300) });
    } catch (error) {
      console.error("Error building player stats:", error);
      res.status(500).json({ error: "Failed to build player stats" });
    }
  });

  // Drafts for one season (or every season when season is "all")
  app.get("/api/league/:leagueId/stats/drafts", async (req, res) => {
    try {
      const history = await loadLeagueHistory(req.params.leagueId);
      if (!history) return res.status(502).json({ error: "No league history available" });
      const wanted = String(req.query.season ?? "all");
      const seasons = history.seasons.filter((s) => wanted === "all" || s.season === wanted);
      const directory = await playerDirectory();
      const drafts: Array<Record<string, unknown>> = [];
      for (const season of seasons) {
        const list = await getLeagueDrafts(season.leagueId).catch(() => []);
        for (const summary of list) {
          if (summary.status !== "complete" && summary.status !== "drafting") continue;
          const [draft, picks] = await Promise.all([getDraft(summary.draft_id).catch(() => summary), getDraftPicks(summary.draft_id).catch(() => [])]);
          const rounds = Number(draft.settings?.rounds) || 0;
          drafts.push({
            draftId: draft.draft_id,
            season: season.season,
            status: draft.status,
            kind: draftKind(rounds),
            rounds,
            picks: buildDraftPicks(picks, draft.slot_to_roster_id, teamsOf(season), directory),
          });
        }
      }
      res.json({ season: wanted, drafts });
    } catch (error) {
      console.error("Error building drafts:", error);
      res.status(500).json({ error: "Failed to build drafts" });
    }
  });

  // Transaction feed, newest first
  app.get("/api/league/:leagueId/stats/transactions", async (req, res) => {
    try {
      const history = await loadLeagueHistory(req.params.leagueId);
      if (!history) return res.status(502).json({ error: "No league history available" });
      const wanted = String(req.query.season ?? "all");
      const seasons = history.seasons.filter((s) => wanted === "all" || s.season === wanted);
      const directory = await playerDirectory();
      const feeds: FeedItem[][] = [];
      for (const season of seasons) feeds.push(await seasonFeed(season, directory));
      const items = feeds.flat().sort((a, b) => b.at - a.at);
      res.json({ season: wanted, items });
    } catch (error) {
      console.error("Error building transaction feed:", error);
      res.status(500).json({ error: "Failed to build transactions" });
    }
  });
}
