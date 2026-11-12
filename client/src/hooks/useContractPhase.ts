import { useQuery } from "@tanstack/react-query";
import type { LeaguePhaseId, PhaseConfigEntry } from "@shared/contractRules";

export interface ContractPhaseState {
  phases: PhaseConfigEntry[];
  current: LeaguePhaseId;
  ppgMinGames: number;
}

export function useContractPhase(leagueId: string | undefined) {
  return useQuery<ContractPhaseState>({
    queryKey: ["/api/league", leagueId, "contract-phase"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/contract-phase`);
      if (!res.ok) throw new Error("Failed to load phase");
      return res.json();
    },
    enabled: !!leagueId,
    staleTime: 60_000,
  });
}

export function phaseAllowsTab(current: LeaguePhaseId, tab: string): boolean {
  const map: Record<string, LeaguePhaseId[]> = {
    "free-agency-bid": ["fa_round_1", "fa_round_2"],
    "my-wins": ["round_1_results", "round_2_results"],
    "rfa-match": ["rfa_match_1", "rfa_match_2"],
    "fa-recap": ["fa_recap"],
    trades: ["league_year_rollover", "tag_extension", "fa_round_1", "round_1_results", "rfa_match_1", "fa_round_2", "round_2_results", "rfa_match_2", "fa_recap", "regular_season"],
  };
  return (map[tab] || []).includes(current);
}
