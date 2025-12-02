const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  sport: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    playoff_teams?: number;
    waiver_budget?: number;
    [key: string]: unknown;
  };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  starters: string[] | null;
  starters_points: number[] | null;
  players: string[] | null;
  players_points: Record<string, number> | null;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  status: string;
  status_updated: number;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  draft_picks: SleeperTradedPick[];
  waiver_budget: Array<{ sender: number; receiver: number; amount: number }>;
  settings: Record<string, unknown> | null;
  consenter_ids?: number[];
  leg?: number;
}

export interface SleeperTradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  position: string;
  team: string | null;
  age?: number;
  years_exp?: number;
  status?: string;
  injury_status?: string | null;
}

export interface SleeperNFLState {
  week: number;
  season: string;
  season_type: string;
  display_week: number;
  leg?: number;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: {
    team_name?: string;
  };
}

async function fetchFromSleeper<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${SLEEPER_BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function getSleeperUser(username: string): Promise<SleeperUser | null> {
  try {
    return await fetchFromSleeper<SleeperUser>(`/user/${username}`);
  } catch {
    return null;
  }
}

export async function getUserLeagues(userId: string, season: string): Promise<SleeperLeague[]> {
  return fetchFromSleeper<SleeperLeague[]>(`/user/${userId}/leagues/nfl/${season}`);
}

export async function getLeague(leagueId: string): Promise<SleeperLeague> {
  return fetchFromSleeper<SleeperLeague>(`/league/${leagueId}`);
}

export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return fetchFromSleeper<SleeperRoster[]>(`/league/${leagueId}/rosters`);
}

export async function getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
  return fetchFromSleeper<SleeperLeagueUser[]>(`/league/${leagueId}/users`);
}

export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  return fetchFromSleeper<SleeperMatchup[]>(`/league/${leagueId}/matchups/${week}`);
}

export async function getLeagueTransactions(leagueId: string, week: number): Promise<SleeperTransaction[]> {
  return fetchFromSleeper<SleeperTransaction[]>(`/league/${leagueId}/transactions/${week}`);
}

export async function getAllLeagueTransactions(leagueId: string, currentWeek: number): Promise<SleeperTransaction[]> {
  const allTransactions: SleeperTransaction[] = [];
  for (let week = 1; week <= currentWeek; week++) {
    const weekTransactions = await getLeagueTransactions(leagueId, week);
    allTransactions.push(...weekTransactions);
  }
  return allTransactions.sort((a, b) => b.created - a.created);
}

export async function getTradedPicks(leagueId: string): Promise<SleeperTradedPick[]> {
  return fetchFromSleeper<SleeperTradedPick[]>(`/league/${leagueId}/traded_picks`);
}

export async function getNFLState(): Promise<SleeperNFLState> {
  return fetchFromSleeper<SleeperNFLState>(`/state/nfl`);
}

let playersCache: Record<string, SleeperPlayer> | null = null;
let playersCacheTime: number = 0;
const PLAYERS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  const now = Date.now();
  if (playersCache && now - playersCacheTime < PLAYERS_CACHE_DURATION) {
    return playersCache;
  }
  
  playersCache = await fetchFromSleeper<Record<string, SleeperPlayer>>(`/players/nfl`);
  playersCacheTime = now;
  return playersCache;
}

export async function getPlayerStats(season: string, week?: number): Promise<Record<string, Record<string, number>>> {
  const weekPart = week ? `/${week}` : "";
  return fetchFromSleeper<Record<string, Record<string, number>>>(`/stats/nfl/regular/${season}${weekPart}`);
}

export async function getPlayerProjections(season: string, week: number): Promise<Record<string, Record<string, number>>> {
  return fetchFromSleeper<Record<string, Record<string, number>>>(`/projections/nfl/regular/${season}/${week}`);
}
