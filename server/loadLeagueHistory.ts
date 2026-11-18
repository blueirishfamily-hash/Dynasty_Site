// Loads the full league history (every season of the dynasty chain). Finished seasons are stored after the
// first build; the live season is cached in memory for a few minutes. Used by the History page and the weekly report.
import { storage } from "./storage";
import { assembleLeagueHistory, buildSeasonHistory } from "./leagueHistory";
import { getLeague } from "./sleeper";
import type { LeagueHistory, SeasonHistory } from "../shared/leagueHistory";

const liveSeasonHistoryCache = new Map<string, { at: number; data: SeasonHistory }>();
const LIVE_TTL = 5 * 60 * 1000;

/** Returns null when no season could be built. */
export async function loadLeagueHistory(leagueId: string): Promise<LeagueHistory | null> {
  const chain: { leagueId: string; season: string; status: string }[] = [];
  let nextId: string | null = leagueId;
  let leagueName = "";
  while (nextId) {
    try {
      const info = await getLeague(nextId);
      if (!leagueName) leagueName = info.name;
      chain.push({ leagueId: nextId, season: info.season, status: info.status });
      nextId = (info as any).previous_league_id || null;
    } catch {
      break;
    }
  }

  const seasons = await Promise.all(
    chain.map(async ({ leagueId: id, season, status }): Promise<SeasonHistory | null> => {
      try {
        if (status === "complete") {
          const stored = await storage.getLeagueHistorySnapshot(id, season).catch(() => undefined);
          if (stored) {
            try {
              return JSON.parse(stored) as SeasonHistory;
            } catch {
              /* rebuild below */
            }
          }
          const built = await buildSeasonHistory(id);
          await storage.saveLeagueHistorySnapshot(id, season, JSON.stringify(built)).catch((error) => {
            console.error("Could not store league history snapshot:", error?.message || error);
          });
          return built;
        }
        const cached = liveSeasonHistoryCache.get(id);
        if (cached && Date.now() - cached.at < LIVE_TTL) return cached.data;
        const built = await buildSeasonHistory(id);
        liveSeasonHistoryCache.set(id, { at: Date.now(), data: built });
        return built;
      } catch (error) {
        console.error(`Error building league history for ${season}:`, error);
        return null;
      }
    }),
  );

  const built = seasons.filter((s): s is SeasonHistory => s !== null);
  if (built.length === 0) return null;
  return assembleLeagueHistory(leagueName, built);
}
