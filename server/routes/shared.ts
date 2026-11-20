// Helpers and caches shared by more than one route file.
// Moved out of server/routes.ts unchanged.
import { getPlayerStats, type SleeperNFLState } from "../sleeper";

export function getTeamInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function calculateGrade(percentAboveMedian: number): string {
  if (percentAboveMedian >= 50) return "A+";
  if (percentAboveMedian >= 35) return "A";
  if (percentAboveMedian >= 20) return "A-";
  if (percentAboveMedian >= 10) return "B+";
  if (percentAboveMedian >= 0) return "B";
  if (percentAboveMedian >= -10) return "B-";
  if (percentAboveMedian >= -20) return "C+";
  if (percentAboveMedian >= -35) return "C";
  if (percentAboveMedian >= -50) return "C-";
  return "D";
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function ageFactorScore(age: number | null, position: string): number {
  if (age == null || age < 20 || age > 40) return 0.5;
  const curves: Record<string, { peak: number; width: number }> = {
    QB: { peak: 30, width: 5 },
    RB: { peak: 25, width: 3 },
    WR: { peak: 27, width: 4 },
    TE: { peak: 27, width: 4 },
  };
  const { peak, width } = curves[position] || curves.WR;
  const z = (age - peak) / width;
  return Math.exp(-0.5 * z * z);
}

export function injuryMultiplier(status: string | null | undefined): number {
  if (!status) return 1.0;
  const s = String(status).toLowerCase();
  if (s.includes("questionable")) return 0.90;
  if (s.includes("doubtful")) return 0.75;
  if (s.includes("out") || s.includes("ir") || s.includes("pup") || s.includes("nfi")) return 0.50;
  return 0.85;
}

export function computePlayerValue(params: {
  positionPercentile: number;
  seasonPoints: number;
  performancePoints: number;
  maxPtsForPerformance: number;
  age: number | null;
  injuryStatus: string | null | undefined;
  position: string;
  historicalPts: { y1: number; y2: number; y3: number } | null;
  maxPtsInLeague: number;
}): number {
  const { positionPercentile, seasonPoints, performancePoints, maxPtsForPerformance, age, injuryStatus, position, historicalPts, maxPtsInLeague } = params;

  const rarityScore = Math.max(0, Math.min(1, positionPercentile));

  let monteCarloScore = 0.5;
  if (historicalPts && maxPtsInLeague > 0 && seasonPoints > 0) {
    const drift = historicalPts.y2 > 0 ? (historicalPts.y3 - historicalPts.y2) / historicalPts.y2 : 0;
    const std = 0.15;
    let sum = 0;
    const n = 100;
    for (let i = 0; i < n; i++) {
      let proj = seasonPoints;
      for (let y = 0; y < 3; y++) {
        const noise = (Math.random() - 0.5) * 2 * std * proj;
        proj = Math.max(0, proj * (1 + drift) + noise);
      }
      sum += proj;
    }
    const avgFuture = sum / n;
    monteCarloScore = Math.max(0, Math.min(1, avgFuture / Math.max(maxPtsInLeague, 1)));
  } else if (maxPtsInLeague > 0 && seasonPoints > 0) {
    monteCarloScore = Math.max(0, Math.min(1, seasonPoints / maxPtsInLeague));
  }

  const recentScore = maxPtsForPerformance > 0 ? Math.min(1, performancePoints / maxPtsForPerformance) : 0.5;

  const ageScore = ageFactorScore(age, position);

  const injuryMult = injuryMultiplier(injuryStatus);

  const rawScore = rarityScore * 0.3 + monteCarloScore * 0.2 + recentScore * 0.3 + ageScore * 0.1;
  const withInjury = rawScore * injuryMult;
  return Math.round(Math.min(100, Math.max(0, withInjury * 100)) * 10) / 10;
}


// Helper: extract a useful error message for API responses
export function dbErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as any).code;
    if (code === "ENOTFOUND") return "Database host unreachable (DNS). Is the Supabase project active?";
    if (code === "ECONNREFUSED") return "Database connection refused. Check DATABASE_URL.";
    if (code === "3D000") return "Database does not exist. Check DATABASE_URL.";
    if (code === "42P01") return "Table does not exist. Run 'npm run db:push' to create tables.";
    if (code === "42703") return "Column does not exist. Run 'npm run db:push' to sync schema.";
    if (code === "28P01") return "Database authentication failed. Check password in DATABASE_URL.";
    return error.message;
  }
  return String(error);
}


// Helper function to get effective week - handles offseason detection and capping
export const getEffectiveWeek = (nflState: SleeperNFLState, league: any): number => {
  const nflWeek = nflState.week;
  const nflSeason = nflState.season;
  const leagueSeason = league?.season;
  const seasonType = nflState.season_type;
  
  // Debug logging
  console.log(`[Effective Week] Input - nflWeek: ${nflWeek}, nflSeason: ${nflSeason}, leagueSeason: ${leagueSeason}, seasonType: ${seasonType}`);
  
  // Get playoff week start from league settings (default to 15 for standard leagues)
  const playoffWeekStart = (league?.settings as any)?.playoff_week_start || 15;
  const lastRegularSeasonWeek = playoffWeekStart - 1; // Typically 14
  
  // Normalize seasons to strings for comparison
  const leagueSeasonStr = leagueSeason ? leagueSeason.toString() : null;
  const nflSeasonStr = nflSeason ? nflSeason.toString() : null;
  
  // Check if we're viewing a past season (league season is before NFL season year)
  const leagueSeasonYear = leagueSeason ? parseInt(leagueSeasonStr!) : null;
  const nflSeasonYear = nflSeason ? parseInt(nflSeasonStr!) : null;
  const isPastSeason = leagueSeasonYear && nflSeasonYear && leagueSeasonYear < nflSeasonYear;
  
  // If viewing a past season, use the last regular season week (season is complete)
  if (isPastSeason) {
    console.log(`[Effective Week] Past season detected (league ${leagueSeason}, NFL ${nflSeason}). Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // If league has advanced to new season, use actual week
  if (leagueSeasonStr && nflSeasonStr && leagueSeasonStr !== nflSeasonStr) {
    console.log(`[Effective Week] League advanced (season ${leagueSeason} !== NFL ${nflSeason}). Using actual week ${nflWeek}.`);
    return nflWeek;
  }
  
  // Check if seasons match (for offseason detection)
  const seasonsMatch = leagueSeasonStr && nflSeasonStr && leagueSeasonStr === nflSeasonStr;
  
  // Get current date info
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12 (Jan = 1, Feb = 2, Mar = 3, ..., Dec = 12)
  const currentYear = currentDate.getFullYear();
  
  // SIMPLIFIED APPROACH: If week is 1-5 and it's NOT September-December (NFL regular season months), we're in offseason
  // NFL regular season runs September-December (months 9-12)
  // If we're at week 1-5 outside of those months, the season has ended and reset
  const isNFLRegularSeasonMonths = currentMonth >= 9 && currentMonth <= 12; // Sept-Dec
  const isLowWeek = nflWeek >= 1 && nflWeek <= 5;
  
  // Primary check: season_type explicitly indicates offseason
  const isOffseasonByType = seasonsMatch && (seasonType === "off" || seasonType === "post");
  
  // Secondary check: Low week (1-5) outside NFL regular season months = offseason
  // This is the most reliable indicator - if it's January-August and week is 1-5, season has ended
  // Exception: If it's September and week 1, it might be the start of a new season, so only apply if seasons don't match (indicating offseason)
  // If seasons match in September week 1, it's likely offseason reset from previous season
  if (isLowWeek && !isNFLRegularSeasonMonths && league && leagueSeasonStr) {
    console.log(`[Effective Week] Offseason detected: Week ${nflWeek} in month ${currentMonth} (outside Sept-Dec). Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // Also check: If it's September-October (months 9-10) and week is 1, but seasons match (league hasn't advanced),
  // it's likely offseason reset, not the start of a new season
  if (nflWeek === 1 && (currentMonth === 9 || currentMonth === 10) && seasonsMatch && league && leagueSeasonStr) {
    console.log(`[Effective Week] Offseason detected: Week 1 in ${currentMonth === 9 ? 'September' : 'October'} with matching seasons (likely offseason reset). Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // Tertiary check: season_type indicates offseason AND seasons match
  if (isOffseasonByType) {
    console.log(`[Effective Week] Offseason detected by season_type: ${seasonType}. Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // Quaternary check: Low week (1-3) with seasons matching (very likely offseason reset)
  // If seasons match and week is 1-3, the league hasn't advanced, so it's offseason reset
  if (seasonsMatch && nflWeek >= 1 && nflWeek <= 3) {
    console.log(`[Effective Week] Offseason detected: Week ${nflWeek} with matching seasons (league hasn't advanced). Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // Final aggressive check: If week is 1-2 and we have league data, assume offseason
  // (This catches any remaining edge cases)
  if (nflWeek >= 1 && nflWeek <= 2 && league && leagueSeasonStr) {
    console.log(`[Effective Week] Final aggressive check: Week ${nflWeek} with league data, assuming offseason. Using last regular season week ${lastRegularSeasonWeek}.`);
    return lastRegularSeasonWeek;
  }
  
  // If season is complete (week > 18) and league hasn't advanced (same season), cap at week 18
  if (nflWeek > 18 && seasonsMatch) {
    console.log(`[Effective Week] Season completed (week ${nflWeek}) but league hasn't advanced (season ${leagueSeason} === ${nflSeason}). Capping at week 18.`);
    return 18;
  }
  
  // Default: return the NFL week as-is
  console.log(`[Effective Week] Returning default NFL week: ${nflWeek} (seasonsMatch: ${seasonsMatch}, leagueSeason: ${leagueSeason}, nflSeason: ${nflSeason}, month: ${currentMonth})`);
  return nflWeek;
};

// Cache for player weekly stats (keyed by season)
export const playerStatsCache: Map<string, { 
  data: Map<string, number[]>; // playerId -> array of weekly points
  timestamp: number;
}> = new Map();
export const STATS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes


// ── Shared PPG helpers (used by rookie extension pricing) ──

export type WeeklyStatsCache = Record<string, Record<string, number>>[];

export async function fetchAllWeeklyStats(season: string): Promise<WeeklyStatsCache> {
  const promises: Promise<Record<string, Record<string, number>>>[] = [];
  for (let w = 1; w <= 18; w++) {
    promises.push(getPlayerStats(season, w).catch(() => ({})));
  }
  return Promise.all(promises);
}

export function extractPlayerGamesFromCache(
  playerId: string,
  season: string,
  weeklyStats: WeeklyStatsCache
): { week: number; season: string; pts: number }[] {
  const games: { week: number; season: string; pts: number }[] = [];
  for (let w = 0; w < weeklyStats.length; w++) {
    const stats = weeklyStats[w][playerId];
    if (stats) {
      const pts = (stats as any).pts_ppr || (stats as any).pts_half_ppr || (stats as any).pts_std || 0;
      if (pts > 0) {
        games.push({ week: w + 1, season, pts });
      }
    }
  }
  return games;
}

export function computeAdjustedPPGFromGames(
  currentSeasonGames: { week: number; season: string; pts: number }[],
  previousSeasonGames: { week: number; season: string; pts: number }[]
): { adjustedPPG: number; gamesUsed: number; recent15PPG: number; previous15PPG: number; formulaUsed: string } | null {
  const allGames = [
    ...currentSeasonGames.sort((a, b) => b.week - a.week),
    ...previousSeasonGames.sort((a, b) => b.week - a.week),
  ].slice(0, 30);

  if (allGames.length === 0) return null;

  const recent15 = allGames.slice(0, Math.min(15, allGames.length));
  const previous15 = allGames.slice(recent15.length);

  const avg = (arr: { pts: number }[]) =>
    arr.length > 0 ? arr.reduce((s, g) => s + g.pts, 0) / arr.length : 0;

  const recent15PPG = avg(recent15);
  const previous15PPG = avg(previous15);

  let adjustedPPG: number;
  let formulaUsed: string;
  if (previous15.length === 0 || recent15PPG >= previous15PPG) {
    adjustedPPG = recent15PPG;
    formulaUsed = "recent15";
  } else {
    adjustedPPG = avg(allGames);
    formulaUsed = "all30avg";
  }

  return { adjustedPPG, gamesUsed: allGames.length, recent15PPG, previous15PPG, formulaUsed };
}

export function computeAdjustedPPGForPlayer(
  playerId: string,
  currentSeason: string,
  previousSeason: string,
  currentWeeklyStats: WeeklyStatsCache,
  previousWeeklyStats: WeeklyStatsCache
): { adjustedPPG: number; gamesUsed: number; recent15PPG: number; previous15PPG: number; formulaUsed: string } | null {
  const currentGames = extractPlayerGamesFromCache(playerId, currentSeason, currentWeeklyStats);
  const previousGames = extractPlayerGamesFromCache(playerId, previousSeason, previousWeeklyStats);
  return computeAdjustedPPGFromGames(currentGames, previousGames);
}


// Helper function to check if draft is complete
// Handles multiple status value variations from Sleeper API
export function isDraftComplete(status: string): boolean {
  if (!status) return false;
  const normalizedStatus = String(status || "").toLowerCase().trim();
  return normalizedStatus === "complete" || 
         normalizedStatus === "completed" || 
         normalizedStatus === "finished" ||
         normalizedStatus === "closed" ||
         normalizedStatus === "done" ||
         normalizedStatus === "ended";
}
