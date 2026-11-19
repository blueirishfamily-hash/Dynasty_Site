import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useSleeper } from "@/lib/sleeper-context";
import { PlayerDetailModal } from "@/components/PlayerDetailModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContractsEnabled, useLeagueRules } from "@/lib/leagueRules";
import { AssetPanel, type TeamNeed } from "./AssetPanel";
import { CapByYearTable } from "./CapByYearTable";
import { TradeSummary, type TradeLine } from "./TradeSummary";
import { ValueBalanceBar } from "./ValueBalanceBar";
import {
  calculateCurrentTeamSalary,
  calculateSalaryCapImpactWithOpponent,
  compareTradeValue,
  contractSummary,
  pickLabel,
  pickTradeValue,
  playerTradeValue,
  type ContractDataStore,
  type DbPlayerContract,
  type Player,
  type TeamAssets,
} from "./tradeMath";

interface TradeCenterProps {
  userTeam: TeamAssets;
  leagueTeams: TeamAssets[];
  leagueId?: string;
  userRosterId?: number;
  getRosterId?: (teamId: string) => number | undefined;
  onProposeTrade?: (
    userAssets: { players: string[]; picks: string[] },
    theirAssets: { players: string[]; picks: string[] },
    targetTeamId: string
  ) => void;
}

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const STRENGTH_COLORS = ["bg-red-500", "bg-amber-500", "bg-yellow-500", "bg-emerald-500"] as const;

export default function TradeCenter({
  userTeam,
  leagueTeams,
  leagueId,
  userRosterId,
  getRosterId,
  onProposeTrade,
}: TradeCenterProps) {
  const contractsOn = useContractsEnabled();
  const deadCapShares = useLeagueRules().deadCap.shareByYearsLeft;
  const TOTAL_CAP = useLeagueRules().salaryCap;
  const { season, currentWeek, isOffseason } = useSleeper();
  const currentYear = parseInt(season) || new Date().getFullYear();
  const contractYears = useMemo(
    () => [currentYear, currentYear + 1, currentYear + 2, currentYear + 3],
    [currentYear]
  );

  const [selectedTeamId, setSelectedTeamId] = useState<string>(leagueTeams[0]?.teamId || "");
  const [selectedUserPlayers, setSelectedUserPlayers] = useState<Set<string>>(new Set());
  const [selectedUserPicks, setSelectedUserPicks] = useState<Set<string>>(new Set());
  const [selectedTheirPlayers, setSelectedTheirPlayers] = useState<Set<string>>(new Set());
  const [selectedTheirPicks, setSelectedTheirPicks] = useState<Set<string>>(new Set());
  const [positionFilterUser, setPositionFilterUser] = useState<string>("all");
  const [positionFilterOpponent, setPositionFilterOpponent] = useState<string>("all");
  const [searchUser, setSearchUser] = useState("");
  const [searchOpponent, setSearchOpponent] = useState("");
  const [openPlayer, setOpenPlayer] = useState<{ id: string; name: string } | null>(null);
  const [mobileSide, setMobileSide] = useState<"user" | "opponent">("user");

  const selectedTeam = leagueTeams.find((t) => t.teamId === selectedTeamId);

  // Position strength for each team relative to the league (unchanged calculation).
  const teamNeeds = useMemo(() => {
    const allTeams = [userTeam, ...leagueTeams].filter(Boolean) as TeamAssets[];
    const totalTeams = allTeams.length;
    const strengthByTeamAndPos = new Map<string, number>();
    allTeams.forEach((team) => {
      POSITIONS.forEach((pos) => {
        const playersAtPos = team.players.filter((p) => p.position === pos);
        let strength = 0;
        if (playersAtPos.length > 0) {
          const sumValTimesStarts = playersAtPos.reduce(
            (s, p) => s + (p.tradeValue ?? 0) * (p.gamesStarted ?? 0),
            0
          );
          const sumStarts = playersAtPos.reduce((s, p) => s + (p.gamesStarted ?? 0), 0);
          strength =
            sumStarts > 0
              ? sumValTimesStarts / sumStarts
              : playersAtPos.reduce((s, p) => s + (p.tradeValue ?? 0), 0) / playersAtPos.length;
        }
        strengthByTeamAndPos.set(`${team.teamId}:${pos}`, strength);
      });
    });
    return (team: TeamAssets): TeamNeed[] =>
      POSITIONS.map((pos) => {
        const myStrength = strengthByTeamAndPos.get(`${team.teamId}:${pos}`) ?? 0;
        const teamsWithLowerStrength = allTeams.filter(
          (t) => (strengthByTeamAndPos.get(`${t.teamId}:${pos}`) ?? 0) < myStrength
        ).length;
        const percentile = totalTeams <= 1 ? 50 : (teamsWithLowerStrength / (totalTeams - 1)) * 100;
        const strength = percentile >= 75 ? 4 : percentile >= 50 ? 3 : percentile >= 25 ? 2 : 1;
        return { pos, strength, color: STRENGTH_COLORS[strength - 1] };
      });
  }, [userTeam, leagueTeams]);

  const { data: dbContracts } = useQuery<DbPlayerContract[]>({
    queryKey: ["/api/league", leagueId, "contracts"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/contracts`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const { data: deadCapEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/league", leagueId, "settings", "dead-cap-enabled"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/settings/dead-cap-enabled`);
      if (!res.ok) throw new Error("Failed to fetch dead cap enabled setting");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const deadCapEnabled = deadCapEnabledData?.enabled ?? true;

  const contractData = useMemo<ContractDataStore>(() => {
    if (!dbContracts || dbContracts.length === 0) return {};
    const store: ContractDataStore = {};
    for (const contract of dbContracts) {
      const rosterIdStr = contract.rosterId.toString();
      if (!store[rosterIdStr]) store[rosterIdStr] = {};
      const parsed = (() => {
        try {
          return JSON.parse(contract.salaries || "{}");
        } catch {
          return {};
        }
      })();
      const salaries: Record<number, number> = {};
      Object.entries(parsed).forEach(([year, value]) => {
        const yearNum = Number(year);
        if (!isNaN(yearNum)) salaries[yearNum] = Number(value || 0) / 10;
      });
      store[rosterIdStr][contract.playerId] = {
        salaries,
        fifthYearOption: contract.fifthYearOption as "accepted" | "declined" | null,
        isOnIr: contract.isOnIr === 1,
        originalContractYears: contract.originalContractYears || 0,
        isRookieContract: contract.isRookieContract === 1,
      };
    }
    return store;
  }, [dbContracts]);

  const opponentRosterId = selectedTeamId && getRosterId ? getRosterId(selectedTeamId) : undefined;

  const hasSelection =
    selectedUserPlayers.size > 0 ||
    selectedUserPicks.size > 0 ||
    selectedTheirPlayers.size > 0 ||
    selectedTheirPicks.size > 0;

  const capImpact = useMemo(() => {
    if (!leagueId || !userRosterId || !opponentRosterId || !hasSelection) return null;
    return calculateSalaryCapImpactWithOpponent(
      Array.from(selectedUserPlayers),
      Array.from(selectedTheirPlayers),
      Array.from(selectedTheirPlayers),
      Array.from(selectedUserPlayers),
      userRosterId,
      opponentRosterId,
      contractData,
      currentYear,
      contractYears,
      deadCapEnabled,
      deadCapShares
    );
  }, [
    leagueId,
    userRosterId,
    opponentRosterId,
    hasSelection,
    selectedUserPlayers,
    selectedTheirPlayers,
    contractData,
    currentYear,
    contractYears,
    deadCapEnabled,
    deadCapShares,
  ]);

  const teamSalaries = useMemo(() => {
    if (!capImpact || !userRosterId || !opponentRosterId || !selectedTeam) return null;
    const userCurrent = contractYears.map((year) =>
      calculateCurrentTeamSalary(userTeam.players.map((p) => p.id), contractData, userRosterId, year)
    );
    const opponentCurrent = contractYears.map((year) =>
      calculateCurrentTeamSalary(selectedTeam.players.map((p) => p.id), contractData, opponentRosterId, year)
    );
    return {
      userNew: userCurrent.map((c, i) => c + capImpact.userImpact[i].netChange),
      opponentNew: opponentCurrent.map((c, i) => c + capImpact.opponentImpact[i].netChange),
    };
  }, [capImpact, userRosterId, opponentRosterId, contractData, contractYears, userTeam.players, selectedTeam]);

  const toggleIn = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeFrom = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const clearAll = () => {
    setSelectedUserPlayers(new Set());
    setSelectedUserPicks(new Set());
    setSelectedTheirPlayers(new Set());
    setSelectedTheirPicks(new Set());
  };

  // Changing partner drops anything selected from the previous partner.
  const changePartner = (teamId: string) => {
    setSelectedTeamId(teamId);
    setSelectedTheirPlayers(new Set());
    setSelectedTheirPicks(new Set());
    setSearchOpponent("");
    setPositionFilterOpponent("all");
  };

  const handlePropose = () => {
    onProposeTrade?.(
      { players: Array.from(selectedUserPlayers), picks: Array.from(selectedUserPicks) },
      { players: Array.from(selectedTheirPlayers), picks: Array.from(selectedTheirPicks) },
      selectedTeamId
    );
  };

  const filterPlayers = (players: Player[], position: string, search: string) => {
    let list = players;
    if (position !== "all" && position !== "picks") list = list.filter((p) => p.position === position);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  };

  const filteredUserPlayers = useMemo(
    () => filterPlayers(userTeam.players, positionFilterUser, searchUser),
    [userTeam.players, positionFilterUser, searchUser]
  );
  const filteredOpponentPlayers = useMemo(
    () => (selectedTeam ? filterPlayers(selectedTeam.players, positionFilterOpponent, searchOpponent) : []),
    [selectedTeam, positionFilterOpponent, searchOpponent]
  );
  const userPicksShown =
    positionFilterUser === "all" || positionFilterUser === "picks" ? userTeam.draftPicks : [];
  const opponentPicksShown =
    selectedTeam && (positionFilterOpponent === "all" || positionFilterOpponent === "picks")
      ? selectedTeam.draftPicks
      : [];

  const userPlayersById = useMemo(() => new Map(userTeam.players.map((p) => [p.id, p])), [userTeam.players]);
  const theirPlayersById = useMemo(
    () => new Map((selectedTeam?.players ?? []).map((p) => [p.id, p])),
    [selectedTeam]
  );
  const userPicksById = useMemo(() => new Map(userTeam.draftPicks.map((p) => [p.id, p])), [userTeam.draftPicks]);
  const theirPicksById = useMemo(
    () => new Map((selectedTeam?.draftPicks ?? []).map((p) => [p.id, p])),
    [selectedTeam]
  );

  const valueComparison = useMemo(
    () =>
      compareTradeValue(
        {
          players: Array.from(selectedUserPlayers).map((id) => userPlayersById.get(id)),
          picks: Array.from(selectedUserPicks).map((id) => userPicksById.get(id)),
        },
        {
          players: Array.from(selectedTheirPlayers).map((id) => theirPlayersById.get(id)),
          picks: Array.from(selectedTheirPicks).map((id) => theirPicksById.get(id)),
        }
      ),
    [
      selectedUserPlayers,
      selectedUserPicks,
      selectedTheirPlayers,
      selectedTheirPicks,
      userPlayersById,
      userPicksById,
      theirPlayersById,
      theirPicksById,
    ]
  );

  const playerDetail = (p: Player | undefined, rosterId: number | undefined) => {
    if (!p) return "";
    const parts: string[] = [];
    if (p.positionRank != null) parts.push(`${p.position}${p.positionRank}`);
    if (p.weeklyAvg != null) parts.push(`${p.weeklyAvg}/wk`);
    if (contractsOn && rosterId) {
      const c = contractSummary(contractData[rosterId.toString()]?.[p.id], currentYear);
      if (c) parts.push(`$${c.salary.toFixed(1)}M · ${c.yearsLeft} yr`);
    }
    return parts.join(" · ");
  };

  const giveLines: TradeLine[] = [
    ...Array.from(selectedUserPlayers).map((id) => {
      const p = userPlayersById.get(id);
      return {
        key: `p-${id}`,
        name: p?.name ?? "Unknown player",
        position: p?.position,
        detail: playerDetail(p, userRosterId),
        value: playerTradeValue(p),
        onOpen: p ? () => setOpenPlayer({ id: p.id, name: p.name }) : undefined,
        onRemove: () => removeFrom(id, setSelectedUserPlayers),
      };
    }),
    ...Array.from(selectedUserPicks).map((id) => {
      const pick = userPicksById.get(id);
      return {
        key: `k-${id}`,
        name: pick ? pickLabel(pick) : "Unknown pick",
        detail: pick?.originalOwner ? `from ${pick.originalOwner}` : "Own pick",
        value: pickTradeValue(pick),
        isPick: true,
        onRemove: () => removeFrom(id, setSelectedUserPicks),
      };
    }),
  ];

  const getLines: TradeLine[] = [
    ...Array.from(selectedTheirPlayers).map((id) => {
      const p = theirPlayersById.get(id);
      return {
        key: `p-${id}`,
        name: p?.name ?? "Unknown player",
        position: p?.position,
        detail: playerDetail(p, opponentRosterId),
        value: playerTradeValue(p),
        onOpen: p ? () => setOpenPlayer({ id: p.id, name: p.name }) : undefined,
        onRemove: () => removeFrom(id, setSelectedTheirPlayers),
      };
    }),
    ...Array.from(selectedTheirPicks).map((id) => {
      const pick = theirPicksById.get(id);
      return {
        key: `k-${id}`,
        name: pick ? pickLabel(pick) : "Unknown pick",
        detail: pick?.originalOwner ? `from ${pick.originalOwner}` : "Own pick",
        value: pickTradeValue(pick),
        isPick: true,
        onRemove: () => removeFrom(id, setSelectedTheirPicks),
      };
    }),
  ];

  const partnerPicker = (
    <Select value={selectedTeamId} onValueChange={changePartner}>
      <SelectTrigger className="w-full" data-testid="select-trade-partner" aria-label="Trade partner">
        <SelectValue placeholder="Select team" />
      </SelectTrigger>
      <SelectContent>
        {leagueTeams.map((team) => (
          <SelectItem key={team.teamId} value={team.teamId}>
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                {team.teamAvatar && <AvatarImage src={team.teamAvatar} alt={team.teamName} />}
                <AvatarFallback className="text-xs">{team.teamInitials}</AvatarFallback>
              </Avatar>
              {team.teamName}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const cap =
    contractsOn && capImpact && selectedTeam && teamSalaries ? (
      <CapByYearTable
        years={contractYears}
        user={{
          name: userTeam.teamName,
          changes: capImpact.userImpact.map((i) => i.netChange),
          newSalaries: teamSalaries.userNew,
        }}
        partner={{
          name: selectedTeam.teamName,
          changes: capImpact.opponentImpact.map((i) => i.netChange),
          newSalaries: teamSalaries.opponentNew,
        }}
        totalCap={TOTAL_CAP}
        deadCapEnabled={deadCapEnabled}
      />
    ) : null;

  const canPropose = hasSelection && !!selectedTeam;
  const totalOut = selectedUserPlayers.size + selectedUserPicks.size;
  const totalIn = selectedTheirPlayers.size + selectedTheirPicks.size;

  return (
    <div className="space-y-4 pb-24 md:pb-0">
      {/* Phone: compact summary strip */}
      <div className="md:hidden border border-border rounded-lg bg-card p-3 space-y-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trading with</p>
          {partnerPicker}
        </div>
        {hasSelection ? (
          <>
            <ValueBalanceBar
              giveTotal={valueComparison.giveTotal}
              getTotal={valueComparison.getTotal}
              bias={valueComparison.bias}
              label={valueComparison.label}
              compact
            />
            <p className="text-xs text-muted-foreground text-center">
              {totalOut} out, {totalIn} in
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center">Pick assets below to build a trade</p>
        )}
      </div>

      {/* Phone: roster switcher */}
      <div className="md:hidden grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/50" role="group" aria-label="Show roster">
        {(["user", "opponent"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={mobileSide === s}
            onClick={() => setMobileSide(s)}
            className={`min-h-[40px] rounded-md text-sm font-medium ${
              mobileSide === s ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            {s === "user" ? "Your assets" : "Their assets"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] items-start">
        <AssetPanel
          side="user"
          title="Your assets"
          team={userTeam}
          needs={teamNeeds(userTeam)}
          players={filteredUserPlayers}
          picks={userPicksShown}
          selectedPlayers={selectedUserPlayers}
          selectedPicks={selectedUserPicks}
          onTogglePlayer={(id) => toggleIn(id, setSelectedUserPlayers)}
          onTogglePick={(id) => toggleIn(id, setSelectedUserPicks)}
          onOpenPlayer={(p) => setOpenPlayer({ id: p.id, name: p.name })}
          positionFilter={positionFilterUser}
          onPositionFilterChange={setPositionFilterUser}
          search={searchUser}
          onSearchChange={setSearchUser}
          className={`${mobileSide === "user" ? "block" : "hidden"} md:block`}
        />

        <TradeSummary
          partnerPicker={partnerPicker}
          giveLines={giveLines}
          getLines={getLines}
          comparison={valueComparison}
          hasSelection={hasSelection}
          cap={cap}
          onReset={clearAll}
          onPropose={handlePropose}
          canPropose={canPropose}
          className="order-last md:order-first md:col-span-2 xl:order-none xl:col-span-1 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
        />

        <AssetPanel
          side="opponent"
          title="Their assets"
          team={selectedTeam}
          needs={selectedTeam ? teamNeeds(selectedTeam) : undefined}
          players={filteredOpponentPlayers}
          picks={opponentPicksShown}
          selectedPlayers={selectedTheirPlayers}
          selectedPicks={selectedTheirPicks}
          onTogglePlayer={(id) => toggleIn(id, setSelectedTheirPlayers)}
          onTogglePick={(id) => toggleIn(id, setSelectedTheirPicks)}
          onOpenPlayer={(p) => setOpenPlayer({ id: p.id, name: p.name })}
          positionFilter={positionFilterOpponent}
          onPositionFilterChange={setPositionFilterOpponent}
          search={searchOpponent}
          onSearchChange={setSearchOpponent}
          emptyMessage="Choose a trade partner"
          className={`${mobileSide === "opponent" ? "block" : "hidden"} md:block`}
        />
      </div>

      <PlayerDetailModal
        playerId={openPlayer?.id ?? null}
        playerName={openPlayer?.name ?? ""}
        week={currentWeek}
        leagueId={leagueId}
        isOffseason={isOffseason}
        season={season}
        onClose={() => setOpenPlayer(null)}
      />

      {/* Phone: sticky action bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex gap-2">
        <Button variant="outline" className="flex-1 min-h-[44px]" onClick={clearAll} disabled={!hasSelection}>
          <X className="w-4 h-4 mr-1" />
          Reset
        </Button>
        <Button className="flex-1 min-h-[44px]" onClick={handlePropose} disabled={!canPropose}>
          <Check className="w-4 h-4 mr-1" />
          Propose trade
        </Button>
      </div>
    </div>
  );
}
