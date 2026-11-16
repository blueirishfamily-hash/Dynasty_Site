// Who the open league's commissioners are, from the league registry (replaces the hardcoded user IDs).
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "./sleeper-context";

export interface LeagueCommissionerInfo {
  sleeperUserId: string;
  role: "owner" | "co";
  pinState: "none" | "set" | "setup_pending" | "setup_expired";
}

export function useLeagueCommissioners() {
  const { leagueSlug } = useSleeper();
  return useQuery<LeagueCommissionerInfo[]>({
    queryKey: ["/api/registry/leagues", leagueSlug, "commissioners"],
    queryFn: async () => {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(leagueSlug)}/commissioners`);
      if (!res.ok) throw new Error(`Commissioners unavailable (${res.status})`);
      return res.json();
    },
    enabled: !!leagueSlug,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Whether the signed-in user is one of this league's commissioners. This only decides what the page shows;
 * the server still asks for the commissioner PIN before any commissioner action.
 * If the registry can't be reached, the Sleeper league owner counts, as before league registration.
 */
export function useIsCommissioner(): boolean {
  const { user, league } = useSleeper();
  const { data, isError } = useLeagueCommissioners();
  if (!user?.userId) return false;
  if (data) return data.some((c) => c.sleeperUserId === user.userId);
  if (isError) return !!league?.commissionerId && league.commissionerId === user.userId;
  return false;
}

/** The signed-in user's own commissioner entry in this league, if any. */
export function useMyCommissionerEntry(): LeagueCommissionerInfo | null {
  const { user } = useSleeper();
  const { data } = useLeagueCommissioners();
  return (user?.userId && data?.find((c) => c.sleeperUserId === user.userId)) || null;
}

export interface MyLeague {
  slug: string;
  name: string;
  rosterId: number | null;
}

/** The leagues this browser has joined (from its per-league device cookies). */
export function useMyLeagues() {
  return useQuery<MyLeague[]>({
    queryKey: ["/api/registry/my-leagues"],
    queryFn: async () => {
      const res = await fetch("/api/registry/my-leagues");
      if (!res.ok) throw new Error("Could not load your leagues");
      return res.json();
    },
    staleTime: 60 * 1000,
    retry: 1,
  });
}
