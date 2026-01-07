import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { LeagueInfo, UserInfo } from "@shared/schema";

interface SleeperContextType {
  user: UserInfo | null;
  league: LeagueInfo | null;
  currentWeek: number;
  season: string;
  isLoading: boolean;
  error: string | null;
  setUser: (user: UserInfo | null) => void;
  setLeague: (league: LeagueInfo | null) => void;
  clearSession: () => void;
}

const SleeperContext = createContext<SleeperContextType | null>(null);

const STORAGE_KEY_USER = "sleeper_user";
const STORAGE_KEY_LEAGUE = "sleeper_league";

// Hardcoded league ID for this site
const DEFAULT_LEAGUE_ID = "1194798912048705536";

export function SleeperProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserInfo | null>(null);
  const [league, setLeagueState] = useState<LeagueInfo | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load stored league first (faster, works offline)
        // Check if localStorage is available (SSR safety)
        if (typeof localStorage !== 'undefined') {
          const storedLeague = localStorage.getItem(STORAGE_KEY_LEAGUE);
          if (storedLeague) {
            try {
              const leagueInfo = JSON.parse(storedLeague);
              setLeagueState(leagueInfo);
            } catch {
              localStorage.removeItem(STORAGE_KEY_LEAGUE);
            }
          }

          // Load stored user if available
          const storedUser = localStorage.getItem(STORAGE_KEY_USER);
          if (storedUser) {
            try {
              setUserState(JSON.parse(storedUser));
            } catch {
              localStorage.removeItem(STORAGE_KEY_USER);
            }
          }
        }

        // Fetch NFL state
        try {
          const nflStateRes = await fetch("/api/sleeper/nfl-state");
          if (nflStateRes.ok) {
            const nflState = await nflStateRes.json();
            setCurrentWeek(nflState.week || 1);
            setSeason(nflState.season || new Date().getFullYear().toString());
          }
        } catch (err) {
          console.warn("Failed to fetch NFL state:", err);
        }

        // Fetch the default league (refresh stored data)
        if (DEFAULT_LEAGUE_ID) {
          try {
            const leagueRes = await fetch(`/api/sleeper/league/${DEFAULT_LEAGUE_ID}`);
            if (leagueRes.ok) {
              const leagueData = await leagueRes.json();
              const leagueInfo: LeagueInfo = {
                leagueId: leagueData.leagueId,
                name: leagueData.name,
                season: leagueData.season,
                totalRosters: leagueData.totalRosters,
                rosterPositions: leagueData.rosterPositions || [],
                playoffTeams: leagueData.playoffTeams,
                waiverBudget: leagueData.waiverBudget,
                commissionerId: leagueData.commissionerId,
              };
              setLeagueState(leagueInfo);
              localStorage.setItem(STORAGE_KEY_LEAGUE, JSON.stringify(leagueInfo));
            } else {
              let errorData: any = { error: "Unknown error" };
              try {
                errorData = await leagueRes.json();
              } catch {
                // If response isn't JSON, use status text
                errorData = { error: leagueRes.statusText || `HTTP ${leagueRes.status}` };
              }
              console.error(`Failed to fetch league ${DEFAULT_LEAGUE_ID}:`, errorData);
              const hasStoredLeague = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_LEAGUE);
              if (!hasStoredLeague) {
                setError(`Failed to load league: ${errorData.error || "League not found"}`);
              }
            }
          } catch (err: any) {
            console.error("Error fetching league:", err);
            const hasStoredLeague = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_LEAGUE);
            if (!hasStoredLeague) {
              setError(`Failed to connect to league: ${err?.message || "Network error"}`);
            }
          }
        } else {
          console.warn("DEFAULT_LEAGUE_ID is not set");
          const hasStoredLeague = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_LEAGUE);
          if (!hasStoredLeague) {
            setError("No league configured. Please set up a league ID.");
          }
        }
      } catch (err: any) {
        console.error("Failed to initialize app:", err);
        setError(`Failed to initialize: ${err?.message || "Unknown error"}`);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  const setUser = (newUser: UserInfo | null) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  };

  const setLeague = (newLeague: LeagueInfo | null) => {
    setLeagueState(newLeague);
    if (newLeague) {
      localStorage.setItem(STORAGE_KEY_LEAGUE, JSON.stringify(newLeague));
    } else {
      localStorage.removeItem(STORAGE_KEY_LEAGUE);
    }
  };

  const clearSession = () => {
    setUser(null);
    setLeague(null);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_LEAGUE);
  };

  return (
    <SleeperContext.Provider
      value={{
        user,
        league,
        currentWeek,
        season,
        isLoading,
        error,
        setUser,
        setLeague,
        clearSession,
      }}
    >
      {children}
    </SleeperContext.Provider>
  );
}

export function useSleeper() {
  const context = useContext(SleeperContext);
  if (!context) {
    throw new Error("useSleeper must be used within a SleeperProvider");
  }
  return context;
}
