import { createSleeperGate } from "./sleeperGate";

// Every Sleeper call goes through one gate: shared cache, one queue under Sleeper's rate limit, and stats.
export const sleeperGate = createSleeperGate();

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
  owner_id: string;
  previous_league_id?: string | null;
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
  injury_body_part?: string | null;
  injury_notes?: string | null;
  injury_start_date?: string | null;
  news_updated?: number | null;
  practice_participation?: string | null;
  practice_description?: string | null;
  number?: number;
  height?: string;
  weight?: string;
  college?: string;
  depth_chart_order?: number | null;
  depth_chart_position?: string | null;
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

/** GET a Sleeper path (like "/league/123/rosters") through the shared cache and queue. */
export function fetchFromSleeper<T>(endpoint: string): Promise<T> {
  return sleeperGate.get<T>(endpoint);
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

/** The 5 MB player list: fetched at most once a day for the whole site, as Sleeper asks. */
export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  return fetchFromSleeper<Record<string, SleeperPlayer>>(`/players/nfl`);
}

export async function getPlayerStats(season: string, week?: number): Promise<Record<string, Record<string, number>>> {
  const weekPart = week ? `/${week}` : "";
  return fetchFromSleeper<Record<string, Record<string, number>>>(`/stats/nfl/regular/${season}${weekPart}`);
}

export async function getPlayerProjections(season: string, week: number): Promise<Record<string, Record<string, number>>> {
  return fetchFromSleeper<Record<string, Record<string, number>>>(`/projections/nfl/regular/${season}/${week}`);
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  status: string;
  type: string;
  settings: {
    rounds: number;
    slots_wr: number;
    slots_rb: number;
    slots_qb: number;
    slots_te: number;
    slots_flex: number;
    slots_super_flex: number;
    pick_timer: number;
    [key: string]: unknown;
  };
  start_time: number;
  created: number;
  /** Draft slot (as a string) to the roster that originally owned it */
  slot_to_roster_id?: Record<string, number> | null;
}

export interface SleeperDraftPick {
  round: number;
  roster_id: number;
  player_id: string;
  picked_by: string;
  pick_no: number;
  draft_slot: number;
  draft_id: string;
  metadata: {
    first_name: string;
    last_name: string;
    position: string;
    team: string;
    years_exp: string;
  };
}

export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
  return fetchFromSleeper<SleeperDraft[]>(`/league/${leagueId}/drafts`);
}

export async function getDraft(draftId: string): Promise<SleeperDraft> {
  return fetchFromSleeper<SleeperDraft>(`/draft/${draftId}`);
}

export async function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  return fetchFromSleeper<SleeperDraftPick[]>(`/draft/${draftId}/picks`);
}

export interface SleeperBracketMatchup {
  r: number; // Round number
  m: number; // Matchup number
  t1: number | null; // Team 1 roster ID
  t2: number | null; // Team 2 roster ID
  w: number | null; // Winner roster ID
  l: number | null; // Loser roster ID
  t1_from?: { w?: number; l?: number }; // Where team 1 comes from
  t2_from?: { w?: number; l?: number }; // Where team 2 comes from
  p?: number; // Final placement (1 = champion)
}

export async function getWinnersBracket(leagueId: string): Promise<SleeperBracketMatchup[]> {
  return fetchFromSleeper<SleeperBracketMatchup[]>(`/league/${leagueId}/winners_bracket`);
}

export async function getLosersBracket(leagueId: string): Promise<SleeperBracketMatchup[] | null> {
  try {
    return await fetchFromSleeper<SleeperBracketMatchup[]>(`/league/${leagueId}/losers_bracket`);
  } catch (error) {
    // Losers bracket may not exist for all leagues
    return null;
  }
}