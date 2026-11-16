// The open league's rules (salary cap, rookie scale, extension and tag rules, dead cap, awards...).
// Pages read rules from here instead of hardcoding them. While the rules load, or if the registry can't be
// reached, ATL Dynasty's rules apply, the same fallback the server uses.
import { useQuery } from "@tanstack/react-query";
import { atlDynastyRules, mergeRules, type LeagueRules } from "@shared/leagueRules";
import { useSleeper } from "./sleeper-context";

export interface LeagueRulesResponse {
  currentSeason: string;
  nextSeason: string;
  current: { rules: LeagueRules; fromSeason: string | null };
  next: { rules: LeagueRules; saved: boolean; updatedAt: number | null; updatedBy: string | null };
  emergencies: Array<{ at: number; reason: string; changed: string[] }>;
}

export const leagueRulesKey = (slug: string) => ["/api/registry/leagues", slug, "rules"] as const;

export function useLeagueRulesData() {
  const { leagueSlug } = useSleeper();
  return useQuery<LeagueRulesResponse>({
    queryKey: leagueRulesKey(leagueSlug),
    queryFn: async () => {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(leagueSlug)}/rules`);
      if (!res.ok) throw new Error(`Rules unavailable (${res.status})`);
      const body = await res.json();
      return {
        ...body,
        current: { ...body.current, rules: mergeRules(body.current?.rules) },
        next: { ...body.next, rules: mergeRules(body.next?.rules) },
      };
    },
    enabled: !!leagueSlug,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

const FALLBACK = atlDynastyRules();

/** The rules in effect this season for the open league. */
export function useLeagueRules(): LeagueRules {
  const { data } = useLeagueRulesData();
  return data?.current.rules ?? FALLBACK;
}

/**
 * Whether the open league has contracts turned on. Off hides the contract pages and widgets; the server
 * also refuses contract requests. When the registry can't be reached, contracts stay on (ATL's behavior).
 */
export function useContractsEnabled(): boolean {
  const { leagueSlug, registryLeague } = useSleeper();
  const { data } = useQuery<{ contractsEnabled: boolean } | null>({
    queryKey: ["/api/registry/leagues", leagueSlug],
    queryFn: async () => {
      const res = await fetch(`/api/registry/leagues/${encodeURIComponent(leagueSlug)}`);
      return res.ok ? res.json() : null;
    },
    enabled: !!leagueSlug,
    initialData: registryLeague ?? undefined,
    staleTime: 60 * 1000,
  });
  return data?.contractsEnabled ?? true;
}
