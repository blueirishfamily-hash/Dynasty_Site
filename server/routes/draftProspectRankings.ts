// Draft prospect rankings: commissioner paste/CSV import, status, and the "not in your list" panel.
// Nothing here fetches from the internet. The import is the only way rankings get in, so there is
// no scheduler and no scraping.
import type { Express } from "express";
import { storage } from "../storage";
import { requireCommissioner } from "../security/guards";
import {
  matchRankingsToProspects,
  parseRankingsText,
  validateRankings,
  type RankingRow,
} from "../prospectRankings";

const DEFAULT_SOURCE = "Manual import";
const DEFAULT_FORMAT = "1qb_ppr";

const clean = (v: unknown, fallback: string, max: number): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return (s || fallback).slice(0, max);
};

const toPublicRow = (r: { rank: number; playerName: string; position: string | null; school: string | null; sourceValue: string | null }) => ({
  rank: r.rank,
  playerName: r.playerName,
  position: r.position,
  school: r.school,
  sourceValue: r.sourceValue,
});

export function registerDraftProspectRankingsRoutes(app: Express): void {
  // Status for the Prospects tab, plus ranked players who are not in the league's list.
  app.get("/api/league/:leagueId/prospect-rankings", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const season = (req.query.season as string) || "2026";
      const statuses = (await storage.getRankingSyncStatuses(leagueId, season)) ?? [];
      const active = [...statuses].sort((a, b) => b.lastAttemptAt - a.lastAttemptAt)[0] ?? null;
      let unmatched: ReturnType<typeof toPublicRow>[] = [];
      if (active) {
        const rankings = (await storage.getProspectRankings(leagueId, season, active.source, active.format)) ?? [];
        const prospects = await storage.getDraftProspects(leagueId, season);
        const rows: RankingRow[] = rankings.map((r) => ({
          rank: r.rank,
          playerName: r.playerName,
          nameKey: r.nameKey,
          position: r.position,
          school: r.school,
          sourceValue: r.sourceValue,
          adp: null,
        }));
        unmatched = matchRankingsToProspects(rows, prospects).unmatched.map(toPublicRow);
      }
      res.json({ status: active, unmatched });
    } catch (error: any) {
      console.error("Error fetching prospect rankings status:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch rankings status" });
    }
  });

  // Import pasted text or CSV. With dryRun the response is a preview and nothing is stored.
  app.post("/api/league/:leagueId/prospect-rankings/import", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!(await requireCommissioner(req, res))) return;
      const season = clean(req.body?.season, "2026", 8);
      const source = clean(req.body?.source, DEFAULT_SOURCE, 64);
      const format = clean(req.body?.format, DEFAULT_FORMAT, 32);
      const dryRun = req.body?.dryRun === true;
      const text = typeof req.body?.text === "string" ? req.body.text : "";

      const parsed = parseRankingsText(text);
      const problems = [...parsed.errors, ...(parsed.rows.length > 0 ? validateRankings(parsed.rows) : [])];
      if (problems.length > 0 || parsed.rows.length === 0) {
        const errors = problems.length > 0 ? problems : ["Nothing to import."];
        // A failed import changes nothing; it only records that the last attempt failed.
        if (!dryRun) {
          await storage.recordRankingSyncResult({ leagueId, season, source, format, ok: false, error: errors.slice(0, 3).join(" ") });
        }
        return res.status(400).json({ ok: false, errors });
      }

      const prospects = await storage.getDraftProspects(leagueId, season);
      const { matches, unmatched } = matchRankingsToProspects(parsed.rows, prospects);
      const changes = matches.map((m) => {
        const p = prospects.find((x) => x.id === m.prospectId)!;
        return {
          prospectId: p.id,
          name: p.displayName,
          oldAdp: p.adp ?? null,
          newAdp: m.row.adp ?? m.row.rank,
        };
      });

      if (!dryRun) {
        await storage.replaceProspectRankings(leagueId, season, source, format, parsed.rows);
        await storage.updateDraftProspectsAdp(
          leagueId,
          season,
          changes.map((c) => ({ id: c.prospectId, adp: c.newAdp }))
        );
        await storage.recordRankingSyncResult({ leagueId, season, source, format, ok: true, rowCount: parsed.rows.length });
      }

      res.json({
        ok: true,
        dryRun,
        rowCount: parsed.rows.length,
        matched: matches.length,
        unmatched: unmatched.map(toPublicRow),
        changes: changes.slice(0, 60),
      });
    } catch (error: any) {
      console.error("Error importing prospect rankings:", error);
      res.status(500).json({ ok: false, errors: [error?.message || "Failed to import rankings"] });
    }
  });

  // Add a ranked player to the league's prospect list ("Not in your list" panel).
  app.post("/api/league/:leagueId/prospect-rankings/add", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!(await requireCommissioner(req, res))) return;
      const season = clean(req.body?.season, "2026", 8);
      const rank = Number(req.body?.rank);
      if (!Number.isInteger(rank)) return res.status(400).json({ error: "rank is required" });

      const statuses = (await storage.getRankingSyncStatuses(leagueId, season)) ?? [];
      const active = [...statuses].sort((a, b) => b.lastAttemptAt - a.lastAttemptAt)[0];
      if (!active) return res.status(404).json({ error: "No imported rankings for this season" });
      const rankings = (await storage.getProspectRankings(leagueId, season, active.source, active.format)) ?? [];
      const row = rankings.find((r) => r.rank === rank);
      if (!row) return res.status(404).json({ error: "That ranked player was not found" });

      const prospects = await storage.getDraftProspects(leagueId, season);
      const rankRow: RankingRow = { ...row, adp: null };
      if (matchRankingsToProspects([rankRow], prospects).matches.length > 0) {
        return res.status(409).json({ error: `${row.playerName} is already in your list` });
      }
      const added = await storage.addDraftProspectAtEnd(leagueId, season, {
        displayName: row.playerName,
        position: row.position,
        school: row.school,
        adp: row.rank,
      });
      if (!added) return res.status(409).json({ error: "Your prospect list is full (40). Delete one first." });
      res.json(added);
    } catch (error: any) {
      console.error("Error adding ranked prospect:", error);
      res.status(500).json({ error: error?.message || "Failed to add prospect" });
    }
  });
}
