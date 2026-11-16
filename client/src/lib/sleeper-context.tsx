import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { LeagueInfo, UserInfo } from "@shared/schema";
import { LEGACY_LEAGUE_SLUG } from "./league-address";

/** The league registry's public details for the league in the address (/api/registry/leagues/:slug). */
export interface RegistryLeague {
  id: string;
  name: string;
  slug: string;
  contractsEnabled: boolean;
  status: string;
  currentSeason: string;
  currentSleeperLeagueId: string;
  joinRequired?: boolean;
  joined?: boolean;
  graceActive?: boolean;
}

interface SleeperContextType {
  user: UserInfo | null;
  league: LeagueInfo | null;
  currentWeek: number;
  season: string;
  isLoading: boolean;
  isOffseason: boolean;
  error: string | null;
  /** The league address (/l/<slug>/) this app is showing. */
  leagueSlug: string;
  /** The registry entry for leagueSlug; null if the registry could not be reached. */
  registryLeague: RegistryLeague | null;
  /** True when the address names no league. */
  leagueNotFound: boolean;
  /** The league asks for its invite code and this browser hasn't joined (and no grace period applies). */
  needsJoin: boolean;
  setUser: (user: UserInfo | null) => void;
  setLeague: (league: LeagueInfo | null) => void;
  clearSession: () => void;
}

const SleeperContext = createContext<SleeperContextType | null>(null);

const LEGACY_STORAGE_KEY_USER = "sleeper_user";
const LEGACY_STORAGE_KEY_LEAGUE = "sleeper_league";

/** The picked team is kept per league, so a device can be a different team in each league. */
function userStorageKey(slug: string) {
  return `sleeper_user:${slug}`;
}

function readStoredUser(slug: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(userStorageKey(slug));
  // Devices from before league addresses saved the user under the old key; that was ATL Dynasty.
  if (!stored && slug === LEGACY_LEAGUE_SLUG) return localStorage.getItem(LEGACY_STORAGE_KEY_USER);
  return stored;
}

/** The cached league is kept per address so one league's data never shows under another's address. */
function leagueStorageKey(slug: string) {
  return `sleeper_league:${slug}`;
}

function readStoredLeague(slug: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const stored = localStorage.getItem(leagueStorageKey(slug));
  // Devices from before league addresses cached ATL Dynasty's league under the old key.
  if (!stored && slug === LEGACY_LEAGUE_SLUG) return localStorage.getItem(LEGACY_STORAGE_KEY_LEAGUE);
  return stored;
}

export function SleeperProvider({ children, leagueSlug }: { children: ReactNode; leagueSlug: string }) {
  const STORAGE_KEY_LEAGUE = leagueStorageKey(leagueSlug);
  const STORAGE_KEY_USER = userStorageKey(leagueSlug);
  const [registryLeague, setRegistryLeague] = useState<RegistryLeague | null>(null);
  const [leagueNotFound, setLeagueNotFound] = useState(false);
  const [user, setUserState] = useState<UserInfo | null>(null);
  const [league, setLeagueState] = useState<LeagueInfo | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [isLoading, setIsLoading] = useState(true);
  const [isOffseason, setIsOffseason] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Safety: never stay on loading screen longer than 8s (e.g. preview browser, slow network)
    const forceDoneTimer = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

    const initializeApp = async () => {
      try {
        // Load stored league first (faster, works offline)
        // Check if localStorage is available (SSR safety)
        if (typeof localStorage !== 'undefined') {
          const storedLeague = readStoredLeague(leagueSlug);
          if (storedLeague) {
            try {
              const leagueInfo = JSON.parse(storedLeague);
              setLeagueState(leagueInfo);
            } catch {
              localStorage.removeItem(STORAGE_KEY_LEAGUE);
            }
          }

          // Load stored user if available
          const storedUser = readStoredUser(leagueSlug);
          if (storedUser) {
            try {
              setUserState(JSON.parse(storedUser));
            } catch {
              localStorage.removeItem(STORAGE_KEY_USER);
            }
          }
        }

        // Fetch NFL state and active league in parallel (with timeout so we don't hang forever)
        const fetchWithTimeout = (url: string, ms = 10000) =>
          Promise.race([
            fetch(url),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), ms)
            ),
          ]).catch(() => null);

        // The address names the league: the registry gives its current Sleeper league ID.
        const [nflStateRes, registryRes] = await Promise.all([
          fetchWithTimeout("/api/sleeper/nfl-state"),
          fetchWithTimeout(`/api/registry/leagues/${encodeURIComponent(leagueSlug)}`),
        ]);

        let registryEntry: RegistryLeague | null = null;
        if (registryRes?.ok) {
          try {
            registryEntry = await registryRes.json();
          } catch {
            registryEntry = null;
          }
        }
        if (registryRes?.status === 404) {
          setLeagueNotFound(true);
          setLeagueState(null);
          setError("League not found");
          return;
        }
        setRegistryLeague(registryEntry);

        // ATL Dynasty still loads the site-wide active league (active_leagues), as before league addresses:
        // Settings' league switch and Advance League Year write there, and the registry only learns about
        // new seasons once rollover is rebuilt in phase 5. Other leagues load the registry's current season.
        let activeLeagueRes: Response | null = null;
        if (leagueSlug === LEGACY_LEAGUE_SLUG) {
          activeLeagueRes = await fetchWithTimeout("/api/league/active");
        } else if (!registryEntry) {
          setLeagueState(null);
          setError("Failed to connect to league: league registry unavailable");
          return;
        }

        // Get NFL state
        let nflState: any = null;
        try {
          if (nflStateRes?.ok) {
            nflState = await nflStateRes.json();
            // Check if NFL is in offseason
            const offseason = nflState.seasonType === "off" || nflState.seasonType === "post";
            setIsOffseason(offseason);
            if (offseason) {
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
          const storedLeague = readStoredLeague(leagueSlug);
          if (storedLeague) {
            try {
              const parsed = JSON.parse(storedLeague);
              activeLeagueId = parsed?.leagueId || null;
            } catch {
              activeLeagueId = null;
            }
          }
        }
        if (!activeLeagueId && registryEntry) activeLeagueId = registryEntry.currentSleeperLeagueId;

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
            const hasStoredLeague = readStoredLeague(leagueSlug);
            if (!hasStoredLeague) {
              setError(`Failed to connect to league: ${err?.message || "Network error"}`);
              setSeason(nflState?.season || new Date().getFullYear().toString());
            } else {
              // If we have stored league, use its season
              try {
                const storedLeague = JSON.parse(readStoredLeague(leagueSlug)!);
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
          const hasStoredLeague = readStoredLeague(leagueSlug);
          if (hasStoredLeague) {
            try {
              const storedLeague = JSON.parse(readStoredLeague(leagueSlug)!);
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
        clearTimeout(forceDoneTimer);
        setIsLoading(false);
      }
    };

    initializeApp();
    return () => clearTimeout(forceDoneTimer);
  }, [leagueSlug]);

  const setUser = (newUser: UserInfo | null) => {
    setUserState(newUser);
    if (newUser) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
      if (leagueSlug === LEGACY_LEAGUE_SLUG) localStorage.removeItem(LEGACY_STORAGE_KEY_USER);
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
    if (leagueSlug === LEGACY_LEAGUE_SLUG) {
      localStorage.removeItem(LEGACY_STORAGE_KEY_USER);
      localStorage.removeItem(LEGACY_STORAGE_KEY_LEAGUE);
    }
  };

  return (
    <SleeperContext.Provider
      value={{
        user,
        league,
        currentWeek,
        season,
        isLoading,
        isOffseason,
        error,
        leagueSlug,
        registryLeague,
        leagueNotFound,
        needsJoin: !!registryLeague && !!registryLeague.joinRequired && !registryLeague.joined && !registryLeague.graceActive,
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
