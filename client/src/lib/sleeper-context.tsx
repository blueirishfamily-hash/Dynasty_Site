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
    const storedUser = localStorage.getItem(STORAGE_KEY_USER);
    const storedLeague = localStorage.getItem(STORAGE_KEY_LEAGUE);

    if (storedUser) {
      try {
        setUserState(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(STORAGE_KEY_USER);
      }
    }

    if (storedLeague) {
      try {
        setLeagueState(JSON.parse(storedLeague));
      } catch {
        localStorage.removeItem(STORAGE_KEY_LEAGUE);
      }
    }

    fetch("/api/sleeper/nfl-state")
      .then(res => res.json())
      .then(data => {
        setCurrentWeek(data.week || 1);
        setSeason(data.season || new Date().getFullYear().toString());
      })
      .catch(err => {
        console.error("Failed to fetch NFL state:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
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
