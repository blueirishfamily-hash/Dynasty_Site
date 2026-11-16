// League registry routes for the client: look up a league by its address (/l/<slug>/...).
// Read-only. Returns only public details: never PIN hashes or the invite code.
import type { Express } from "express";
import { dbLeagueRegistry } from "../leagueRegistry";
import { normalizeSlug } from "../middleware/league";

export interface PublicLeague {
  id: string;
  name: string;
  slug: string;
  contractsEnabled: boolean;
  status: string;
  currentSeason: string;
  currentSleeperLeagueId: string;
}

export function registerLeaguesRoutes(app: Express): void {
  app.get("/api/registry/leagues/:slug", async (req, res) => {
    const slug = normalizeSlug(req.params.slug);
    if (!slug) return res.status(404).json({ error: "League not found" });
    try {
      const found = await dbLeagueRegistry.findBySlug(slug);
      if (!found || found.league.status !== "active") return res.status(404).json({ error: "League not found" });
      const body: PublicLeague = {
        id: found.league.id,
        name: found.league.name,
        slug: found.league.slug,
        contractsEnabled: found.league.contractsEnabled === 1,
        status: found.league.status,
        currentSeason: found.season.season,
        currentSleeperLeagueId: found.season.sleeperLeagueId,
      };
      res.json(body);
    } catch (error: any) {
      console.error("[Registry] League lookup by address failed:", error?.code || error);
      res.status(503).json({ error: "League registry unavailable" });
    }
  });
}
