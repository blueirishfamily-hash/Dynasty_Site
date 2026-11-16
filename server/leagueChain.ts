// Follows a Sleeper league's previous_league_id links back to its first season, so adding a league to
// the site fills its whole season history.
import type { SleeperLeague } from "./sleeper";

export interface ChainSeason {
  season: string;
  sleeperLeagueId: string;
  previousSleeperLeagueId: string | null;
  name: string;
  status: string;
}

export const MAX_CHAIN_SEASONS = 20;

const noPrevious = (id: string | null | undefined) => !id || id === "0";

/** Seasons oldest first, ending with the given league. Stops at a missing link, a loop, or 20 seasons. */
export async function walkSeasonChain(
  sleeperLeagueId: string,
  fetchLeague: (id: string) => Promise<SleeperLeague>,
): Promise<{ seasons: ChainSeason[]; latest: SleeperLeague; stoppedEarly: boolean }> {
  const latest = await fetchLeague(sleeperLeagueId);
  const seen = new Set<string>();
  const seasons: ChainSeason[] = [];
  let current: SleeperLeague | null = latest;
  let stoppedEarly = false;
  while (current) {
    if (seen.has(current.league_id)) { stoppedEarly = true; break; }
    seen.add(current.league_id);
    const prev = noPrevious(current.previous_league_id) ? null : String(current.previous_league_id);
    seasons.push({
      season: String(current.season),
      sleeperLeagueId: String(current.league_id),
      previousSleeperLeagueId: prev,
      name: current.name,
      status: current.status,
    });
    if (!prev) break;
    if (seasons.length >= MAX_CHAIN_SEASONS) { stoppedEarly = true; break; }
    try {
      current = await fetchLeague(prev);
    } catch {
      stoppedEarly = true; // the link points at a league Sleeper no longer returns
      break;
    }
  }
  seasons.reverse();
  return { seasons, latest, stoppedEarly };
}
