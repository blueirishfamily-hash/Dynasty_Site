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

        // Fetch NFL state and active league in parallel
        const [nflStateRes, activeLeagueRes] = await Promise.all([
          fetch("/api/sleeper/nfl-state").catch(() => null),
          fetch("/api/league/active").catch(() => null),
        ]);

        // Get NFL state
        let nflState: any = null;
        try {
          if (nflStateRes?.ok) {
            nflState = await nflStateRes.json();
            // Check if NFL is in offseason
            const isOffseason = nflState.seasonType === "off" || nflState.seasonType === "post";
            if (isOffseason) {
              setCurrentWeek(18);
            } else {
              setCurrentWeek(nflState.week || 1);
            }
          }
        } catch (err) {
          console.warn("Failed to fetch NFL state:", err);
        }

        let activeLeagueId: string | null = null;
        if (activeLeagueRes?.ok) {
          try {
            const activeLeague = await activeLeagueRes.json();
            activeLeagueId = activeLeague?.leagueId || null;
          } catch {
            activeLeagueId = null;
          }
        } else if (activeLeagueRes?.status === 404) {
          // If 404, check if we have stored league data to use
          const storedLeague = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_LEAGUE) : null;
          if (storedLeague) {
            try {
              const parsed = JSON.parse(storedLeague);
              activeLeagueId = parsed?.leagueId || null;
            } catch {
              activeLeagueId = null;
            }
          }
        }

        // Fetch the active league (refresh stored data) and prioritize its season
        if (activeLeagueId) {
          try {
            const leagueRes = await fetch(`/api/sleeper/league/${activeLeagueId}`).catch(() => null);
            if (leagueRes?.ok) {
              const leagueData = await leagueRes.json();
          const leagueInfo: LeagueInfo = {
            leagueId: leagueData.leagueId,
            name: leagueData.name,
            season: leagueData.season,
            totalRosters: leagueData.totalRosters,
            rosterPositions: leagueData.rosterPositions || [],
            playoffTeams: leagueData.playoffTeams,
            playoffWeekStart: leagueData.playoffWeekStart,
            waiverBudget: leagueData.waiverBudget,
            commissionerId: leagueData.commissionerId,
          };
              setLeagueState(leagueInfo);
              localStorage.setItem(STORAGE_KEY_LEAGUE, JSON.stringify(leagueInfo));
              
              // Prioritize league season over NFL state season
              setSeason(leagueInfo.season || nflState?.season || new Date().getFullYear().toString());
            } else {
              throw new Error("Active league not found");
            }
          } catch (err: any) {
            console.error("Error fetching league:", err);
            const hasStoredLeague = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_LEAGUE);
            if (!hasStoredLeague) {
              setError(`Failed to connect to league: ${err?.message || "Network error"}`);
              setSeason(nflState?.season || new Date().getFullYear().toString());
            } else {
              // If we have stored league, use its season
              try {
                const storedLeague = JSON.parse(localStorage.getItem(STORAGE_KEY_LEAGUE)!);
                if (storedLeague?.season) {
                  setSeason(storedLeague.season);
                } else {
                  setSeason(nflState?.season || new Date().getFullYear().toString());
                }
              } catch {
                setSeason(nflState?.season || new Date().getFullYear().toString());
              }
            }
          }
        } else {
          // No active league from API - try to use stored league data
          const hasStoredLeague = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_LEAGUE);
          if (hasStoredLeague) {
            try {
              const storedLeague = JSON.parse(localStorage.getItem(STORAGE_KEY_LEAGUE)!);
              if (storedLeague?.leagueId) {
                // Use stored league data
                setLeagueState(storedLeague);
                setSeason(storedLeague.season || nflState?.season || new Date().getFullYear().toString());
                console.log("Using stored league data:", storedLeague.leagueId);
              } else {
                setSeason(nflState?.season || new Date().getFullYear().toString());
              }
            } catch {
              setSeason(nflState?.season || new Date().getFullYear().toString());
            }
          } else {
            // No stored league either - show error but don't block the app
            console.warn("No active league configured and no stored league data");
            setError("No league configured. Please set up a league ID in Settings.");
            setSeason(nflState?.season || new Date().getFullYear().toString());
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
