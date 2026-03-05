import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, ChevronRight, Save, UserPlus, Calculator, Trash2, Search, AlertTriangle, UserMinus, ArrowRightLeft, DollarSign, Star, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Send, Loader2, PieChart as PieChartIcon, BarChart, Check, X, Undo2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { getRookieSalary, formatDraftPosition } from "@/utils/rookiePayScale";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const TOTAL_CAP = 250;

const COLORS = {
  available: "#3b82f6",
  salaries: "#22c55e",
  deadCap: "#ef4444",
};

// Dynamic year calculation - derived from Sleeper season or current date
// These will be overridden by the component using useSleeper().season
const getContractYears = (currentYear: number) => ({
  CURRENT_YEAR: currentYear,
  CONTRACT_YEARS: [currentYear, currentYear + 1, currentYear + 2, currentYear + 3],
  OPTION_YEAR: currentYear + 4, // Year 5 for extensions, tags, options on 4-year contracts
});

interface PlayerContractData {
  salaries: Record<number, number>;
  fifthYearOption: "accepted" | "declined" | null;
  isOnIr: boolean;
  originalContractYears: number;
  isRookieContract?: boolean;
}

type ContractDataStore = Record<string, Record<string, PlayerContractData>>;

interface PlayerDisplayInfo {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  currentSalary: number;
  injuryStatus: string | null;
}

interface TeamCapData {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  salaries: number;
  deadCap: number;
  available: number;
  players: string[];
}

interface SleeperPlayerData {
  id: string;
  name: string;
  position: string;
  team: string | null;
  age?: number;
  yearsExp?: number;
  status?: string;
  injuryStatus?: string | null;
}

type PlayerMap = Record<string, SleeperPlayerData>;

interface HypotheticalPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  hypotheticalSalaries: Record<number, number>;
  isRosterPlayer: boolean;
  isFreeAgent: boolean;
}

interface HypotheticalContractData {
  salaryOverrides: Record<string, Record<number, number>>;
  addedFreeAgents: HypotheticalPlayer[];
}

interface PlayerBid {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  playerTeam: string | null;
  bidAmount: number;
  maxBid: number | null;
  contractYears: number;
  notes: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

const positionColors: Record<string, string> = {
  QB: "bg-rose-500 text-white",
  RB: "bg-emerald-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

function convertPlayersArrayToMap(players: SleeperPlayerData[]): PlayerMap {
  const map: PlayerMap = {};
  for (const player of players) {
    map[player.id] = player;
  }
  return map;
}

function getPlayersWithContracts(
  players: string[],
  playerMap: PlayerMap,
  teamContracts: Record<string, PlayerContractData>,
  currentYear: number
): PlayerDisplayInfo[] {
  if (!players || players.length === 0) return [];

  return players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const contract = teamContracts[id];
      const currentSalary = contract?.salaries?.[currentYear] || 0;

      return {
        playerId: id,
        name: player.name,
        position: player.position || "NA",
        nflTeam: player.team || null,
        yearsExp: player.yearsExp ?? 0,
        currentSalary,
        injuryStatus: player.injuryStatus || null,
      };
    })
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return b.currentSalary - a.currentSalary;
    });
}

function calculateTeamSalary(
  players: string[],
  teamContracts: Record<string, PlayerContractData>,
  year: number
): number {
  if (!players || players.length === 0) return 0;
  
  return players.reduce((sum, playerId) => {
    const contract = teamContracts[playerId];
    return sum + (contract?.salaries?.[year] || 0);
  }, 0);
}

function TeamCapChart({ team, onClick }: { team: TeamCapData; onClick: () => void }) {
  const data = [
    { name: "Available", value: Math.max(0, team.available), color: COLORS.available },
    { name: "Salaries", value: team.salaries, color: COLORS.salaries },
    { name: "Dead Cap", value: team.deadCap, color: COLORS.deadCap },
  ].filter(d => d.value > 0);

  const isOverCap = team.available < 0;
  const hasNoData = team.salaries === 0 && team.deadCap === 0;

  return (
    <Card 
      data-testid={`card-team-cap-${team.rosterId}`}
      className="cursor-pointer hover-elevate transition-all"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {team.avatar ? (
              <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
            ) : null}
            <AvatarFallback className="text-xs">
              {team.teamName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-heading truncate">{team.teamName}</CardTitle>
            <p className="text-xs text-muted-foreground truncate">{team.ownerName}</p>
          </div>
          {isOverCap && (
            <Badge variant="destructive" className="text-xs">Over Cap</Badge>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[180px]">
          {hasNoData ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl font-bold" style={{ color: COLORS.available }}>
                  ${TOTAL_CAP}M
                </div>
                <p className="text-sm text-muted-foreground mt-2">Full Cap Available</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: number) => [`$${value.toFixed(1)}M`, ""]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
          <div>
            <div className="font-medium" style={{ color: COLORS.salaries }}>${team.salaries.toFixed(1)}M</div>
            <div className="text-muted-foreground">Salaries</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: COLORS.deadCap }}>${team.deadCap.toFixed(1)}M</div>
            <div className="text-muted-foreground">Dead Cap</div>
          </div>
          <div>
            <div className="font-medium" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
              ${team.available.toFixed(1)}M
            </div>
            <div className="text-muted-foreground">Available</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface TeamContractModalProps {
  team: TeamCapData | null;
  players: PlayerDisplayInfo[];
  contractData: Record<string, PlayerContractData>;
  open: boolean;
  onClose: () => void;
}

function TeamContractModal({ team, players, contractData, open, onClose }: TeamContractModalProps) {
  const { season } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  
  if (!team) return null;

  const isOverCap = team.available < 0;
  const totalContractSalary = players.reduce((sum, p) => sum + p.currentSalary, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              {team.avatar ? (
                <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
              ) : null}
              <AvatarFallback className="text-lg">
                {team.teamName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="font-heading text-xl">{team.teamName}</DialogTitle>
              <p className="text-sm text-muted-foreground">{team.ownerName}</p>
            </div>
            {isOverCap && (
              <Badge variant="destructive">Over Cap by ${Math.abs(team.available).toFixed(1)}M</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 my-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold">${TOTAL_CAP}M</div>
                <p className="text-xs text-muted-foreground">Total Cap</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: COLORS.salaries }}>
                  ${team.salaries.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Salaries</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: COLORS.deadCap }}>
                  ${team.deadCap.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Dead Cap</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <div className="text-xl font-bold" style={{ color: isOverCap ? COLORS.deadCap : COLORS.available }}>
                  ${team.available.toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">Pos</TableHead>
                <TableHead className="text-center">Team</TableHead>
                <TableHead className="text-center">NFL Yrs</TableHead>
                <TableHead className="text-right">{CURRENT_YEAR} Salary</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((player) => {
                const status = player.injuryStatus === "IR" ? "ir" : 
                               player.injuryStatus === "PUP" ? "pup" : "active";
                return (
                  <TableRow key={player.playerId} data-testid={`row-contract-${player.playerId}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                            alt={player.name}
                          />
                          <AvatarFallback className="text-xs">
                            {player.name.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{player.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={positionColors[player.position] || "bg-gray-500 text-white"}>
                        {player.position}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {player.nflTeam || "FA"}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {player.yearsExp === 0 ? "R" : player.yearsExp}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium" style={{ color: player.currentSalary > 0 ? COLORS.salaries : "inherit" }}>
                      {player.currentSalary > 0 ? `$${player.currentSalary.toFixed(1)}M` : "$0"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={status === "active" ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {status === "active" ? "Active" : status.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {players.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No players on this roster
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        <div className="border-t pt-4 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total ({players.length} players)</span>
            <div className="flex gap-6">
              <span>
                {CURRENT_YEAR} Salaries: <span className="font-medium" style={{ color: COLORS.salaries }}>${totalContractSalary.toFixed(1)}M</span>
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ContractInputTabProps {
  teams: TeamCapData[];
  playerMap: PlayerMap;
  contractData: ContractDataStore;
  onContractChange: (rosterId: string, playerId: string, field: "salaries" | "fifthYearOption" | "isOnIr" | "originalContractYears" | "isRookieContract", value: any) => void;
  onSave: () => void;
  hasChanges: boolean;
  isSaving?: boolean;
  isCommissioner?: boolean;
  deadCapEnabled?: boolean;
  onDeadCapToggle?: (enabled: boolean) => void;
}

function ContractInputTab({ teams, playerMap, contractData, onContractChange, onSave, hasChanges, isSaving = false, isCommissioner = false, deadCapEnabled = true, onDeadCapToggle }: ContractInputTabProps) {
  const { toast } = useToast();
  const { season, league, user, isOffseason } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
  const OPTION_YEAR = CURRENT_YEAR + 4;
  
  const handleDeadCapToggle = (checked: boolean) => {
    if (onDeadCapToggle) {
      onDeadCapToggle(checked);
    }
  };
  
  const [selectedRosterId, setSelectedRosterId] = useState<string>(teams[0]?.rosterId.toString() || "");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  
  // State for rookie draft positions and pay scale application
  const [rookieDraftPositions, setRookieDraftPositions] = useState<Record<string, { round: number | null; draftSlot: number | null }>>({});
  const [applyRookiePayScale, setApplyRookiePayScale] = useState<Record<string, boolean>>({});
  const [manualDraftInputs, setManualDraftInputs] = useState<Record<string, { round: number; draftSlot: number }>>({});
  const [showRookiePayScalePopover, setShowRookiePayScalePopover] = useState<string | null>(null);
  
  // State for auto-save debouncing
  const contractLengthSaveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(contractLengthSaveTimeoutRef.current).forEach(timeout => {
        clearTimeout(timeout);
      });
    };
  }, []);

  // Draft state for auto-save functionality
  interface SavedDraft {
    id: string;
    playerId: string;
    playerName: string;
    playerPosition: string;
    salaries: string;
    franchiseTagApplied: number;
    updatedAt: number;
  }
  
  const [lastSavedAtByTeam, setLastSavedAtByTeam] = useState<Record<string, number | null>>({});
  const [draftsLoadedByTeam, setDraftsLoadedByTeam] = useState<Record<string, boolean>>({});
  
  // Refs for auto-save prevention
  const isInitialMountRef = useRef(true);
  const isLoadingDraftsRef = useRef(false);
  const previousDraftsRef = useRef<string | null>(null);
  
  // Query for saved contract drafts for the currently selected team
  const { data: savedDrafts } = useQuery<SavedDraft[]>({
    queryKey: ['/api/league', league?.leagueId, 'contract-drafts', selectedRosterId],
    enabled: !!league?.leagueId && !!selectedRosterId,
  });

  interface CommissionerExtension {
    id: string;
    playerId: string;
    playerName: string;
    extensionType: number;
    extensionYear: number;
    extensionSalary: number;
    extensionSalary2: number | null;
    isRookieExtension: number;
    status: string;
  }

  const { data: teamExtensionsData } = useQuery<{ extensions: CommissionerExtension[] }>({
    queryKey: ['/api/league', league?.leagueId, 'extensions', CURRENT_YEAR, selectedRosterId],
    enabled: !!league?.leagueId && !!selectedRosterId,
  });

  const confirmedExtensions = useMemo(() => {
    return (teamExtensionsData?.extensions || []).filter(e => e.status === "confirmed");
  }, [teamExtensionsData]);

  const hasAnyFranchiseTagged = useMemo(() => {
    if (!selectedRosterId || !contractData[selectedRosterId]) return false;
    return Object.keys(contractData[selectedRosterId]).some(
      (playerId) => (contractData[selectedRosterId][playerId] as any)?.hasBeenFranchiseTagged === 1
    );
  }, [selectedRosterId, contractData]);

  const undoExtensionMutation = useMutation({
    mutationFn: async (extensionId: string) => {
      return apiRequest("DELETE", `/api/league/${league?.leagueId}/extensions/${extensionId}/undo`);
    },
    onSuccess: () => {
      toast({
        title: "Extension Undone",
        description: "The extension has been reverted and the team can use their extension again.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', league?.leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', league?.leagueId, 'contracts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Undo Extension",
        description: error.message || "Failed to undo extension",
        variant: "destructive",
      });
    },
  });

  const undoFranchiseTagMutation = useMutation({
    mutationFn: async ({ rosterId, playerId }: { rosterId: string; playerId: string }) => {
      return apiRequest("DELETE", `/api/league/${league?.leagueId}/franchise-tag/undo`, {
        userId: user?.userId,
        rosterId,
        playerId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Franchise Tag Undone",
        description: "The franchise tag has been removed and the team can use their tag again.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', league?.leagueId, 'contracts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Undo Franchise Tag",
        description: error.message || "Failed to undo franchise tag",
        variant: "destructive",
      });
    },
  });

  const selectedTeam = teams.find(t => t.rosterId.toString() === selectedRosterId);
  
  const playerInputs = useMemo(() => {
    if (!selectedTeam) return [];
    
    return selectedTeam.players
      .filter(id => playerMap[id])
      .map(id => {
        const player = playerMap[id];
        const yearsExp = player.yearsExp ?? 0;
        const contract = contractData[selectedRosterId]?.[id];

        return {
          playerId: id,
          name: player.name,
          position: player.position || "NA",
          nflTeam: player.team || null,
          yearsExp,
          salaries: contract?.salaries || {},
          fifthYearOption: contract?.fifthYearOption ?? null,
          isOnIr: contract?.isOnIr ?? false,
          originalContractYears: contract?.originalContractYears ?? 0,
          isRookieContract: contract?.isRookieContract ?? false,
        };
      })
      .filter(p => selectedPositions.length === 0 || selectedPositions.includes(p.position))
      .sort((a, b) => {
        const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
        const posA = posOrder.indexOf(a.position);
        const posB = posOrder.indexOf(b.position);
        if (posA !== posB) return posA - posB;
        return a.name.localeCompare(b.name);
      });
  }, [selectedTeam, playerMap, contractData, selectedRosterId, selectedPositions]);

  // Identify rookies (yearsExp === 0)
  const rookiePlayerIds = useMemo(() => {
    return playerInputs
      .filter(p => p.yearsExp === 0)
      .map(p => p.playerId);
  }, [playerInputs]);

  // Fetch draft positions for all rookies
  const draftPositionQueries = useQuery({
    queryKey: ["/api/league", league?.leagueId, "rookie-draft-positions", rookiePlayerIds],
    queryFn: async () => {
      if (!league?.leagueId || rookiePlayerIds.length === 0) return {};
      
      const positions: Record<string, { round: number | null; draftSlot: number | null; season: string | null; draftId: string | null }> = {};
      
      // Fetch draft positions for all rookies in parallel
      await Promise.all(
        rookiePlayerIds.map(async (playerId) => {
          try {
            const res = await fetch(`/api/league/${league.leagueId}/player/${playerId}/draft-position`);
            if (res.ok) {
              const data = await res.json();
              positions[playerId] = {
                round: data.round,
                draftSlot: data.draftSlot,
                season: data.season,
                draftId: data.draftId,
              };
            }
          } catch (error) {
            console.error(`Error fetching draft position for ${playerId}:`, error);
          }
        })
      );
      
      return positions;
    },
    enabled: !!league?.leagueId && rookiePlayerIds.length > 0,
  });

  // Update rookie draft positions state when query data is available
  useEffect(() => {
    if (draftPositionQueries.data) {
      const positions: Record<string, { round: number | null; draftSlot: number | null }> = {};
      Object.entries(draftPositionQueries.data).forEach(([playerId, data]: [string, any]) => {
        positions[playerId] = {
          round: data.round,
          draftSlot: data.draftSlot,
        };
      });
      setRookieDraftPositions(positions);
    }
  }, [draftPositionQueries.data]);

  // Auto-apply rookie pay scale when draft position is detected and contract doesn't exist
  useEffect(() => {
    if (!draftPositionQueries.data) return;

    Object.entries(draftPositionQueries.data).forEach(([playerId, data]: [string, any]) => {
      // Only auto-apply if:
      // 1. Draft position is found (round and draftSlot are not null)
      // 2. Pay scale hasn't been applied yet
      // 3. Player doesn't already have a contract with salaries
      if (data.round && data.draftSlot && !applyRookiePayScale[playerId]) {
        const existingContract = contractData[selectedRosterId]?.[playerId];
        const hasExistingSalaries = existingContract?.salaries && 
          Object.values(existingContract.salaries).some((s: any) => s > 0);
        
        // Only auto-apply if no existing contract or contract has no salaries
        if (!hasExistingSalaries) {
          const salary = getRookieSalary(data.round, data.draftSlot);
          
          // Set 3-year contract
          onContractChange(selectedRosterId, playerId, "originalContractYears", 3);
          
          // Apply salary to all 3 years
          const currentSalaries = existingContract?.salaries || {};
          onContractChange(selectedRosterId, playerId, "salaries", {
            ...currentSalaries,
            [CURRENT_YEAR]: salary,
            [CURRENT_YEAR + 1]: salary,
            [CURRENT_YEAR + 2]: salary,
          });
          
          setApplyRookiePayScale(prev => ({ ...prev, [playerId]: true }));
        }
      }
    });
  }, [draftPositionQueries.data, selectedRosterId, CURRENT_YEAR, contractData, applyRookiePayScale, onContractChange]);

  const handleSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    const currentSalaries = contractData[selectedRosterId]?.[playerId]?.salaries || {};
    
    // Warn if modifying rookie pay scale contract
    if (applyRookiePayScale[playerId] && numValue !== currentSalaries[year]) {
      const player = playerInputs.find(p => p.playerId === playerId);
      if (player?.yearsExp === 0) {
        // Allow the change but remove the rookie pay scale flag if salary is changed
        // This allows manual override
        if (numValue !== getRookieSalary(
          rookieDraftPositions[playerId]?.round || 1,
          rookieDraftPositions[playerId]?.draftSlot || 1
        )) {
          setApplyRookiePayScale(prev => {
            const updated = { ...prev };
            delete updated[playerId];
            return updated;
          });
        }
      }
    }
    
    onContractChange(selectedRosterId, playerId, "salaries", {
      ...currentSalaries,
      [year]: numValue
    });
  };

  const handleFifthYearOptionChange = (playerId: string, value: "accepted" | "declined") => {
    onContractChange(selectedRosterId, playerId, "fifthYearOption", value);
  };

  const handleIrToggle = (playerId: string, isOnIr: boolean) => {
    onContractChange(selectedRosterId, playerId, "isOnIr", isOnIr);
  };

  // Handler for rookie toggle
  const handleRookieToggle = (playerId: string, checked: boolean) => {
    if (checked) {
      // Toggle ON: Set as rookie contract
      onContractChange(selectedRosterId, playerId, "isRookieContract", true);
      onContractChange(selectedRosterId, playerId, "originalContractYears", 3);
      // Trigger auto-save
      triggerContractLengthAutoSave(playerId);
    } else {
      // Toggle OFF: Clear rookie flag, reset contract length, clear salaries
      onContractChange(selectedRosterId, playerId, "isRookieContract", false);
      onContractChange(selectedRosterId, playerId, "originalContractYears", 0);
      
      // Clear all salaries
      const allYears = [...CONTRACT_YEARS, OPTION_YEAR];
      const clearedSalaries: Record<number, number> = {};
      for (const year of allYears) {
        clearedSalaries[year] = 0;
      }
      onContractChange(selectedRosterId, playerId, "salaries", clearedSalaries);
      
      // Clear rookie pay scale flag
      setApplyRookiePayScale(prev => {
        const updated = { ...prev };
        delete updated[playerId];
        return updated;
      });
      
      // Trigger auto-save
      triggerContractLengthAutoSave(playerId);
    }
  };

  // Handler for contract length dropdown change
  const handleContractLengthChange = (playerId: string, value: string) => {
    if (value === "R") {
      // Rookie selected: Set rookie flag and length to 3
      onContractChange(selectedRosterId, playerId, "isRookieContract", true);
      onContractChange(selectedRosterId, playerId, "originalContractYears", 3);
    } else if (value === "0") {
      // No contract: Set to 0 and clear rookie flag
      onContractChange(selectedRosterId, playerId, "originalContractYears", 0);
      onContractChange(selectedRosterId, playerId, "isRookieContract", false);
    } else {
      // Regular contract length: Set length and clear rookie flag
      const length = parseInt(value);
      onContractChange(selectedRosterId, playerId, "originalContractYears", length);
      onContractChange(selectedRosterId, playerId, "isRookieContract", false);
    }
    
    // Trigger auto-save
    triggerContractLengthAutoSave(playerId);
  };

  // Auto-save mutation for contract length
  const saveContractLengthMutation = useMutation({
    mutationFn: async (data: { rosterId: number; playerId: string; originalContractYears: number | null; isRookieContract: number; salaries: Record<number, number> }) => {
      if (!league?.leagueId) {
        throw new Error("League ID is required");
      }
      return apiRequest("POST", `/api/league/${league.leagueId}/contracts`, {
        contracts: [{
          rosterId: data.rosterId,
          playerId: data.playerId,
          salaries: JSON.stringify(data.salaries || {}),
          fifthYearOption: null,
          isOnIr: 0,
          originalContractYears: data.originalContractYears ?? 0,
          isRookieContract: data.isRookieContract,
        }],
        userId: user?.userId,
      });
    },
  });

  // Trigger auto-save with debounce
  const triggerContractLengthAutoSave = (playerId: string) => {
    const contract = contractData[selectedRosterId]?.[playerId];
    if (!contract || !league?.leagueId) return;

    // Clear existing timeout for this player
    if (contractLengthSaveTimeoutRef.current[playerId]) {
      clearTimeout(contractLengthSaveTimeoutRef.current[playerId]);
    }

    // Set new timeout
    contractLengthSaveTimeoutRef.current[playerId] = setTimeout(() => {
      const currentContract = contractData[selectedRosterId]?.[playerId];
      if (currentContract) {
        saveContractLengthMutation.mutate({
          rosterId: parseInt(selectedRosterId),
          playerId,
          originalContractYears: currentContract.originalContractYears ?? 0,
          isRookieContract: currentContract.isRookieContract ? 1 : 0,
          salaries: currentContract.salaries || {},
        });
      }
      delete contractLengthSaveTimeoutRef.current[playerId];
    }, 2000);
  };

  // Handler to edit remaining years (commissioner only)
  const handleRemainingYearsChange = (playerId: string, newRemainingYears: number) => {
    if (newRemainingYears < 0 || newRemainingYears > 5) return;
    
    const currentSalaries = contractData[selectedRosterId]?.[playerId]?.salaries || {};
    const updatedSalaries: Record<number, number> = {};
    
    // If 0, clear all salaries
    if (newRemainingYears === 0) {
      const allYears = [...CONTRACT_YEARS, OPTION_YEAR];
      for (const year of allYears) {
        updatedSalaries[year] = 0;
      }
      onContractChange(selectedRosterId, playerId, "salaries", updatedSalaries);
      // Do not update originalContractYears - contract length is read-only
      return;
    }
    
    // Calculate which years should have salaries
    const allYears = [...CONTRACT_YEARS, OPTION_YEAR];
    const lastYearWithSalary = CURRENT_YEAR + newRemainingYears - 1;
    
    // Copy existing salaries up to the new end year, or use last year's salary
    let lastSalary = 0;
    for (const year of allYears) {
      if (year <= lastYearWithSalary) {
        // Use existing salary if available, otherwise use last known salary
        updatedSalaries[year] = currentSalaries[year] || lastSalary;
        if (updatedSalaries[year] > 0) {
          lastSalary = updatedSalaries[year];
        }
      } else {
        // Set future years to 0
        updatedSalaries[year] = 0;
      }
    }
    
    // Update salaries only - do not modify originalContractYears (contract length is read-only)
    onContractChange(selectedRosterId, playerId, "salaries", updatedSalaries);
  };

  // Handler to manually apply rookie pay scale
  const handleApplyRookiePayScale = (playerId: string, round: number, draftSlot: number) => {
    const salary = getRookieSalary(round, draftSlot);
    
    // Set 3-year contract
    onContractChange(selectedRosterId, playerId, "originalContractYears", 3);
    
    // Apply salary to all 3 years
    const currentSalaries = contractData[selectedRosterId]?.[playerId]?.salaries || {};
    onContractChange(selectedRosterId, playerId, "salaries", {
      ...currentSalaries,
      [CURRENT_YEAR]: salary,
      [CURRENT_YEAR + 1]: salary,
      [CURRENT_YEAR + 2]: salary,
    });
    
    setApplyRookiePayScale(prev => ({ ...prev, [playerId]: true }));
    
    // Update draft position state
    setRookieDraftPositions(prev => ({
      ...prev,
      [playerId]: { round, draftSlot }
    }));
  };

  // Handler to update manual draft input
  const handleManualDraftInputChange = (playerId: string, field: "round" | "draftSlot", value: number) => {
    setManualDraftInputs(prev => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || { round: 1, draftSlot: 1 }),
        [field]: value,
      } as { round: number; draftSlot: number }
    }));
  };

  const totalSalaryByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
    const total = playerInputs.reduce((sum, p) => {
      const isVoided = p.isOnIr && year === CURRENT_YEAR;
      if (year === OPTION_YEAR && p.fifthYearOption !== "accepted") return sum;
      return sum + (isVoided ? 0 : (p.salaries[year] || 0));
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  // Helper function to build drafts array from current contract data for a specific team
  const buildDraftsArray = useCallback((rosterId: string): Array<{
    playerId: string;
    playerName: string;
    playerPosition: string;
    salaries: string;
    franchiseTagApplied: number;
  }> => {
    const drafts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salaries: string;
      franchiseTagApplied: number;
    }> = [];

    const teamContracts = contractData[rosterId] || {};
    const team = teams.find(t => t.rosterId.toString() === rosterId);
    
    if (!team) return drafts;

    // Build drafts from contractData for the selected team
    for (const playerId of Object.keys(teamContracts)) {
      const contract = teamContracts[playerId];
      const player = playerMap[playerId];
      
      if (!player) continue;

      const salaryByYear: Record<string, number> = {};
      const yearKeys = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
      yearKeys.forEach((year) => {
        const value = contract.salaries?.[year] || 0;
        if (value > 0) {
          salaryByYear[String(year)] = Math.round(value * 10);
        }
      });

      // Include if there's any salary value
      if (Object.keys(salaryByYear).length > 0) {
        drafts.push({
          playerId,
          playerName: player.name || "Unknown",
          playerPosition: player.position || "NA",
          salaries: JSON.stringify(salaryByYear),
          franchiseTagApplied: 0, // ContractInputTab doesn't have franchise tag functionality
        });
      }
    }

    return drafts;
  }, [contractData, teams, playerMap, CURRENT_YEAR, OPTION_YEAR]);

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async ({ drafts, rosterId, silent }: { 
      drafts: Array<{
        playerId: string;
        playerName: string;
        playerPosition: string;
        salaries: string;
        franchiseTagApplied: number;
      }>; 
      rosterId: string;
      silent?: boolean;
    }) => {
      if (!league?.leagueId) {
        throw new Error("League ID is required");
      }
      return apiRequest("POST", `/api/league/${league.leagueId}/contract-drafts`, {
        rosterId: parseInt(rosterId),
        drafts,
      });
    },
    onSuccess: (_, variables) => {
      setLastSavedAtByTeam(prev => ({
        ...prev,
        [variables.rosterId]: Date.now(),
      }));
      // Only show toast for manual saves, not auto-saves
      if (!variables.silent) {
        toast({
          title: "Draft Saved",
          description: "Your contract changes have been saved for later.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/league', league?.leagueId, 'contract-drafts'] });
    },
    onError: (error: Error, variables) => {
      // Only show error toast for manual saves, not auto-saves
      if (!variables.silent) {
        toast({
          title: "Save Failed",
          description: error.message || "Failed to save draft.",
          variant: "destructive",
        });
      }
    },
  });

  // Auto-save logic with debouncing
  useEffect(() => {
    // Skip auto-save on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    // Skip if loading drafts
    if (isLoadingDraftsRef.current) {
      return;
    }

    // Skip if no changes
    if (!hasChanges) {
      return;
    }

    // Skip if no league or selected team
    if (!league?.leagueId || !selectedRosterId) {
      return;
    }

    // Build current drafts array
    const currentDrafts = buildDraftsArray(selectedRosterId);
    const currentDraftsJson = JSON.stringify(currentDrafts);

    // Skip if drafts haven't changed
    if (previousDraftsRef.current === currentDraftsJson) {
      return;
    }

    // Update previous drafts ref
    previousDraftsRef.current = currentDraftsJson;

    // Debounce: wait 2 seconds before auto-saving
    const timeoutId = setTimeout(() => {
      // Double-check that drafts still match (user might have made more changes)
      const latestDrafts = buildDraftsArray(selectedRosterId);
      const latestDraftsJson = JSON.stringify(latestDrafts);
      
      if (latestDraftsJson === currentDraftsJson && latestDrafts.length > 0) {
        saveDraftMutation.mutate({ 
          drafts: latestDrafts, 
          rosterId: selectedRosterId, 
          silent: true 
        });
      }
    }, 2000);

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      clearTimeout(timeoutId);
    };
  }, [contractData, selectedRosterId, hasChanges, league?.leagueId, buildDraftsArray]);

  // Load saved drafts when component mounts or selected team changes
  useEffect(() => {
    if (!savedDrafts || !selectedRosterId || !league?.leagueId) {
      return;
    }

    // Skip if drafts have already been loaded for this team
    if (draftsLoadedByTeam[selectedRosterId]) {
      return;
    }

    isLoadingDraftsRef.current = true;

    // Restore contract data from saved drafts
    for (const draft of savedDrafts) {
      const playerId = draft.playerId;
      
      // Restore salaries (convert from tenths to millions)
      const parsedDraftSalaries = (() => {
        try {
          return JSON.parse(draft.salaries || "{}");
        } catch {
          return {};
        }
      })();
      const salaries: Record<number, number> = {};
      Object.entries(parsedDraftSalaries).forEach(([year, value]) => {
        const yearNum = Number(year);
        if (!isNaN(yearNum)) {
          salaries[yearNum] = (Number(value) || 0) / 10;
        }
      });

      // Only restore if there are any salaries
      if (Object.values(salaries).some(s => s > 0)) {
        onContractChange(selectedRosterId, playerId, "salaries", salaries);
      }
    }

    // Mark drafts as loaded for this team
    setDraftsLoadedByTeam(prev => ({
      ...prev,
      [selectedRosterId]: true,
    }));

    // Track latest update time
    if (savedDrafts.length > 0) {
      const latestUpdatedAt = Math.max(...savedDrafts.map(d => d.updatedAt));
      setLastSavedAtByTeam(prev => ({
        ...prev,
        [selectedRosterId]: latestUpdatedAt,
      }));
    }

    isLoadingDraftsRef.current = false;
  }, [savedDrafts, selectedRosterId, league?.leagueId, CURRENT_YEAR, OPTION_YEAR, onContractChange, draftsLoadedByTeam]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <Label htmlFor="team-select" className="text-sm font-medium whitespace-nowrap">
            Select Team:
          </Label>
          <Select 
            value={selectedRosterId} 
            onValueChange={setSelectedRosterId}
          >
            <SelectTrigger className="w-[280px]" data-testid="select-team-dropdown">
              <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem 
                  key={team.rosterId} 
                  value={team.rosterId.toString()}
                  data-testid={`select-team-${team.rosterId}`}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      {team.avatar ? (
                        <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${team.avatar}`} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {team.teamName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{team.teamName}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isCommissioner && (
            <div className="flex items-center gap-2 ml-4">
              <Switch
                checked={deadCapEnabled}
                onCheckedChange={(checked) => handleDeadCapToggle(checked)}
                data-testid="switch-dead-cap-enabled"
              />
              <Label className="text-sm font-medium whitespace-nowrap">Dead Cap Enabled</Label>
            </div>
          )}

          <Label className="text-sm font-medium whitespace-nowrap ml-4">
            Position:
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[140px] justify-between font-normal" data-testid="select-position-filter-league">
                {selectedPositions.length === 0 ? "All Positions" : selectedPositions.sort().join(", ")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[140px] p-2" align="start">
              <label className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1">
                <Checkbox
                  checked={selectedPositions.length === 0}
                  onCheckedChange={checked => {
                    if (checked) setSelectedPositions([]);
                  }}
                />
                <span className="text-sm font-medium">All</span>
              </label>
              {["QB", "RB", "WR", "TE", "K", "DEF"].map(pos => (
                <label key={pos} className="flex items-center gap-2 py-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedPositions.includes(pos)}
                    onCheckedChange={checked => {
                      setSelectedPositions(prev => checked ? [...prev, pos] : prev.filter(p => p !== pos));
                    }}
                  />
                  <span className="text-sm">{pos}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <Button 
          onClick={onSave} 
          disabled={!hasChanges || isSaving}
          data-testid="button-save-contracts"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Contracts
        </Button>
      </div>

      {selectedTeam && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {selectedTeam.avatar ? (
                  <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${selectedTeam.avatar}`} />
                ) : null}
                <AvatarFallback>
                  {selectedTeam.teamName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="font-heading">{selectedTeam.teamName}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedTeam.ownerName}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3 mb-6 p-3 bg-muted/50 rounded-lg">
              {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                <div key={year} className="text-center">
                  <div className="text-xs text-muted-foreground mb-1">
                    {idx === 4 ? `${year} (Ext)` : year} Total
                  </div>
                  <div className="font-bold" style={{ color: (totalSalaryByYear[year] || 0) > TOTAL_CAP ? COLORS.deadCap : COLORS.salaries }}>
                    ${(totalSalaryByYear[year] || 0).toFixed(1)}M
                  </div>
                </div>
              ))}
            </div>

            <ScrollArea className="h-[500px] pr-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Player</TableHead>
                    <TableHead className="text-center w-[60px]">Pos</TableHead>
                    <TableHead className="text-center w-[60px]">Team</TableHead>
                    <TableHead className="text-center w-[55px]">Len</TableHead>
                    <TableHead className="text-center w-[55px]">Rem</TableHead>
                    <TableHead className="text-center w-[70px]">NFL Yrs</TableHead>
                    <TableHead className="text-center w-[70px]">IR Void</TableHead>
                    {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                      <TableHead key={year} className="text-center w-[90px]">
                        {year}{idx === 4 ? " (Ext)" : ""}
                      </TableHead>
                    ))}
                    <TableHead className="text-center w-[80px]">Total</TableHead>
                    <TableHead className="text-center w-[80px]">Remaining</TableHead>
                    {confirmedExtensions.length > 0 && (
                      <TableHead className="text-center w-[70px]">Ext</TableHead>
                    )}
                    {hasAnyFranchiseTagged && (
                      <TableHead className="text-center w-[70px]">Tag</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {playerInputs.map((player) => {
                    const isRookie = player.yearsExp <= 4;
                    
                    return (
                      <TableRow key={player.playerId} data-testid={`row-input-${player.playerId}`}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-9 w-9">
                                <AvatarImage 
                                  src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                                  alt={player.name}
                                />
                                <AvatarFallback className="text-xs">
                                  {player.name.split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{player.name}</span>
                            </div>
                            {player.yearsExp === 0 && (
                              <div className="flex items-center gap-2 ml-11">
                                {rookieDraftPositions[player.playerId]?.round && rookieDraftPositions[player.playerId]?.draftSlot ? (
                                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                                    Rookie {formatDraftPosition(rookieDraftPositions[player.playerId].round!, rookieDraftPositions[player.playerId].draftSlot!)}
                                    {applyRookiePayScale[player.playerId] && " • Applied"}
                                  </Badge>
                                ) : (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" size="sm" className="h-5 text-[10px] px-2">
                                        Apply Rookie Pay Scale
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64">
                                      <div className="space-y-3">
                                        <Label className="text-sm font-semibold">Manual Draft Position</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <Label className="text-xs">Round</Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              max="3"
                                              value={manualDraftInputs[player.playerId]?.round || 1}
                                              onChange={(e) => handleManualDraftInputChange(player.playerId, "round", parseInt(e.target.value) || 1)}
                                              className="h-8"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Pick</Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              max="12"
                                              value={manualDraftInputs[player.playerId]?.draftSlot || 1}
                                              onChange={(e) => handleManualDraftInputChange(player.playerId, "draftSlot", parseInt(e.target.value) || 1)}
                                              className="h-8"
                                            />
                                          </div>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            const round = manualDraftInputs[player.playerId]?.round || 1;
                                            const draftSlot = manualDraftInputs[player.playerId]?.draftSlot || 1;
                                            handleApplyRookiePayScale(player.playerId, round, draftSlot);
                                          }}
                                          className="w-full"
                                        >
                                          Apply ${getRookieSalary(manualDraftInputs[player.playerId]?.round || 1, manualDraftInputs[player.playerId]?.draftSlot || 1)}/yr
                                        </Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                            {player.position}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm font-medium">
                            {player.nflTeam || "FA"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            {isCommissioner ? (
                              <>
                                <Select
                                  value={player.isRookieContract ? "R" : (player.originalContractYears?.toString() || "0")}
                                  onValueChange={(value) => handleContractLengthChange(player.playerId, value)}
                                  disabled={!isCommissioner}
                                >
                                  <SelectTrigger className="h-7 w-12 text-center" data-testid={`select-len-${player.playerId}`}>
                                    <SelectValue placeholder="-" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">-</SelectItem>
                                    <SelectItem value="1">1</SelectItem>
                                    <SelectItem value="2">2</SelectItem>
                                    <SelectItem value="3">3</SelectItem>
                                    <SelectItem value="4">4</SelectItem>
                                    <SelectItem value="R">R</SelectItem>
                                  </SelectContent>
                                </Select>
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={player.isRookieContract || false}
                                    onCheckedChange={(checked) => handleRookieToggle(player.playerId, checked)}
                                    data-testid={`switch-rookie-${player.playerId}`}
                                  />
                                  <Label className="text-xs">Rookie</Label>
                                </div>
                                {player.isRookieContract && (
                                  <Popover open={showRookiePayScalePopover === player.playerId} onOpenChange={(open) => setShowRookiePayScalePopover(open ? player.playerId : null)}>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => setShowRookiePayScalePopover(player.playerId)}
                                        data-testid={`button-apply-pay-scale-${player.playerId}`}
                                      >
                                        Apply Pay Scale
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80" align="end">
                                      <div className="space-y-3">
                                        <div className="text-sm font-medium">Apply Rookie Pay Scale</div>
                                        {rookieDraftPositions[player.playerId]?.round && rookieDraftPositions[player.playerId]?.draftSlot ? (
                                          <div className="space-y-2">
                                            <div className="text-xs text-muted-foreground">
                                              Draft Position: {formatDraftPosition(rookieDraftPositions[player.playerId].round!, rookieDraftPositions[player.playerId].draftSlot!)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              Salary: ${getRookieSalary(rookieDraftPositions[player.playerId].round!, rookieDraftPositions[player.playerId].draftSlot!)}M/year
                                            </div>
                                            <Button
                                              size="sm"
                                              className="w-full"
                                              onClick={() => {
                                                handleApplyRookiePayScale(
                                                  player.playerId,
                                                  rookieDraftPositions[player.playerId].round!,
                                                  rookieDraftPositions[player.playerId].draftSlot!
                                                );
                                                setShowRookiePayScalePopover(null);
                                              }}
                                            >
                                              Apply ${getRookieSalary(rookieDraftPositions[player.playerId].round!, rookieDraftPositions[player.playerId].draftSlot!)}/yr
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            <div className="text-xs text-muted-foreground">
                                              Draft position not found. Enter manually:
                                            </div>
                                            <div className="flex gap-2">
                                              <div className="flex-1">
                                                <Label className="text-xs">Round</Label>
                                                <Input
                                                  type="number"
                                                  min="1"
                                                  max="7"
                                                  value={manualDraftInputs[player.playerId]?.round || 1}
                                                  onChange={(e) => handleManualDraftInputChange(player.playerId, "round", parseInt(e.target.value) || 1)}
                                                  className="h-8"
                                                />
                                              </div>
                                              <div className="flex-1">
                                                <Label className="text-xs">Pick</Label>
                                                <Input
                                                  type="number"
                                                  min="1"
                                                  max="12"
                                                  value={manualDraftInputs[player.playerId]?.draftSlot || 1}
                                                  onChange={(e) => handleManualDraftInputChange(player.playerId, "draftSlot", parseInt(e.target.value) || 1)}
                                                  className="h-8"
                                                />
                                              </div>
                                            </div>
                                            <Button
                                              size="sm"
                                              className="w-full"
                                              onClick={() => {
                                                const round = manualDraftInputs[player.playerId]?.round || 1;
                                                const draftSlot = manualDraftInputs[player.playerId]?.draftSlot || 1;
                                                handleApplyRookiePayScale(player.playerId, round, draftSlot);
                                                setShowRookiePayScalePopover(null);
                                              }}
                                            >
                                              Apply ${getRookieSalary(manualDraftInputs[player.playerId]?.round || 1, manualDraftInputs[player.playerId]?.draftSlot || 1)}/yr
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </>
                            ) : (
                              <span className="text-sm font-medium tabular-nums">
                                {player.isRookieContract ? "R" : (player.originalContractYears?.toString() || "-")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const contractYears = [...CONTRACT_YEARS, OPTION_YEAR].filter(y => (player.salaries[y] || 0) > 0);
                            const lastYear = contractYears.length > 0 ? Math.max(...contractYears) : 0;
                            const remainingYears = lastYear >= CURRENT_YEAR ? lastYear - CURRENT_YEAR + (isOffseason ? 0 : 1) : 0;
                            
                            if (isCommissioner) {
                              return (
                                <Input
                                  type="number"
                                  min="0"
                                  max="5"
                                  step="1"
                                  className="h-7 w-12 text-center tabular-nums text-sm"
                                  value={remainingYears || ""}
                                  onChange={(e) => {
                                    const newValue = parseInt(e.target.value) || 0;
                                    if (newValue >= 0 && newValue <= 5) {
                                      handleRemainingYearsChange(player.playerId, newValue);
                                    }
                                  }}
                                  placeholder="-"
                                  data-testid={`input-remaining-years-${player.playerId}`}
                                />
                              );
                            }
                            
                            return (
                              <span className="text-sm tabular-nums font-medium">
                                {remainingYears > 0 ? remainingYears : "-"}
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-sm tabular-nums">
                            {player.yearsExp === 0 ? "R" : player.yearsExp}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={player.isOnIr}
                            onCheckedChange={(checked) => handleIrToggle(player.playerId, checked)}
                            data-testid={`switch-ir-${player.playerId}`}
                          />
                        </TableCell>
                        {[...CONTRACT_YEARS, OPTION_YEAR].map((year, yearIndex) => {
                          const salaryValue = player.salaries[year] || 0;
                          // Find contract end year (last year with salary > 0)
                          const contractEndYear = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(y => (player.salaries[y] || 0) > 0)
                            .pop() || year;
                          const yearsRemaining = contractEndYear - year + 1;
                          // Current year = 100% dead cap; future years based on years remaining
                          // Years remaining: 1yr=0%, 2yr=25%, 3yr=50%, 4yr=75%, 5yr=100%
                          const deadCapByYearsRemaining: Record<number, number> = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0 };
                          const deadCapPercent = deadCapEnabled ? (year === CURRENT_YEAR ? 1.0 : (deadCapByYearsRemaining[yearsRemaining] || 0)) : 0;
                          const deadCapValue = deadCapEnabled ? (salaryValue * deadCapPercent) : 0;
                          const isCurrentYearVoided = player.isOnIr && year === CURRENT_YEAR;
                          // Manage League: all years from current through current+4 are editable
                          const canEditYear = true;

                          return (
                            <TableCell key={year} className="text-center">
                              {!canEditYear ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-0.5">
                                  {isCurrentYearVoided ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                                        IR VOID
                                      </Badge>
                                      {salaryValue > 0 && (
                                        <span className="text-[10px] text-muted-foreground line-through">
                                          ${salaryValue}M
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <>
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span className="text-xs text-muted-foreground">$</span>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          className="h-7 w-16 text-center tabular-nums text-sm"
                                          placeholder="0"
                                          value={player.salaries[year] || ""}
                                          onChange={(e) => handleSalaryChange(player.playerId, year, e.target.value)}
                                          data-testid={`input-salary-${player.playerId}-${year}`}
                                        />
                                        <span className="text-xs text-muted-foreground">M</span>
                                      </div>
                                      {deadCapEnabled && salaryValue > 0 && deadCapPercent > 0 && (
                                        <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                          DC: ${Math.ceil(deadCapValue)}M ({Math.round(deadCapPercent * 100)}%)
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {(() => {
                            // Total = only completed seasons (years before current year)
                            const totalValue = [...CONTRACT_YEARS, OPTION_YEAR]
                              .filter(year => year < CURRENT_YEAR)
                              .reduce((sum, year) => {
                                if (year === OPTION_YEAR && player.fifthYearOption !== "accepted") return sum;
                                return sum + (player.salaries[year] || 0);
                              }, 0);
                            return totalValue > 0 ? (
                              <span className="font-medium text-primary tabular-nums">${totalValue.toFixed(1)}M</span>
                            ) : "-";
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            // Remaining = current + future years
                            const remainingValue = [...CONTRACT_YEARS, OPTION_YEAR]
                              .filter(year => year >= CURRENT_YEAR)
                              .reduce((sum, year) => {
                                if (year === OPTION_YEAR && player.fifthYearOption !== "accepted") return sum;
                                return sum + (player.salaries[year] || 0);
                              }, 0);
                            return remainingValue > 0 ? (
                              <span className="font-medium text-emerald-600 tabular-nums">${remainingValue.toFixed(1)}M</span>
                            ) : "-";
                          })()}
                        </TableCell>
                        {confirmedExtensions.length > 0 && (
                          <TableCell className="text-center">
                            {(() => {
                              const ext = confirmedExtensions.find(e => e.playerId === player.playerId);
                              if (!ext) return "-";
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => undoExtensionMutation.mutate(ext.id)}
                                      disabled={undoExtensionMutation.isPending}
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Undo {ext.extensionType}-year {ext.isRookieExtension ? "rookie " : ""}extension</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                        )}
                        {hasAnyFranchiseTagged && (
                          <TableCell className="text-center">
                            {(() => {
                              const contract = contractData[selectedRosterId]?.[player.playerId] as any;
                              if (contract?.hasBeenFranchiseTagged !== 1) return "-";
                              return (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() => undoFranchiseTagMutation.mutate({ rosterId: selectedRosterId, playerId: player.playerId })}
                                      disabled={undoFranchiseTagMutation.isPending}
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Undo franchise tag</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {playerInputs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12 + (confirmedExtensions.length > 0 ? 1 : 0) + (hasAnyFranchiseTagged ? 1 : 0)} className="text-center text-muted-foreground py-8">
                        No players on this roster
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ManageTeamContractsTabProps {
  userTeam: TeamCapData | null;
  playerMap: PlayerMap;
  leagueContractData: ContractDataStore;
  allPlayers: SleeperPlayerData[];
  rosterPlayerIds: string[];
  dbContracts: NormalizedPlayerContract[];
  leagueId: string;
  deadCapEnabled?: boolean;
}

function ManageTeamContractsTab({ 
  userTeam, 
  playerMap, 
  leagueContractData, 
  allPlayers,
  rosterPlayerIds,
  dbContracts,
  leagueId,
  deadCapEnabled = true
}: ManageTeamContractsTabProps) {
  const { toast } = useToast();
  const { user, league, season, isOffseason } = useSleeper();
  
  // Check if current user is the commissioner
  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));
  
  // Dynamic year calculation from Sleeper season
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const CONTRACT_YEARS = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
  const OPTION_YEAR = CURRENT_YEAR + 4;
  const [hypotheticalData, setHypotheticalData] = useState<HypotheticalContractData>({
    salaryOverrides: {},
    addedFreeAgents: [],
  });
  const [freeAgentSearch, setFreeAgentSearch] = useState("");
  const [showFreeAgentSearch, setShowFreeAgentSearch] = useState(false);
  const [franchiseTaggedPlayers, setFranchiseTaggedPlayers] = useState<Set<string>>(new Set());
  const [pendingFranchiseTagPlayerId, setPendingFranchiseTagPlayerId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [selectedContractLengths, setSelectedContractLengths] = useState<string[]>([]);
  const [selectedYearsRemaining, setSelectedYearsRemaining] = useState<string[]>([]);
  const [selectedPlayerTypes, setSelectedPlayerTypes] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<"contracts" | "salary-breakdown">("contracts");
  const [openExtensionPopover, setOpenExtensionPopover] = useState<string | null>(null);
  const [ppgSalaryData, setPpgSalaryData] = useState<Record<string, {
    loading: boolean;
    error: string | null;
    data: {
      adjustedPPG: number;
      gamesUsed: number;
      recent15PPG: number;
      previous15PPG: number;
      formulaUsed: string;
      rank: number;
      totalPlayersAtPosition: number;
      position: string;
      neighborAbove: { name: string; salary: number; ppg: number } | null;
      neighborBelow: { name: string; salary: number; ppg: number } | null;
      extensionSalary: number;
      extensionSalaryMillions: number;
      salary1Year?: number;
      salary1YearMillions?: number;
      salary2Year?: number;
      salary2YearMillions?: number;
      salary3Year?: number;
      salary3YearMillions?: number;
      salary4Year?: number;
      salary4YearMillions?: number;
    } | null;
  }>>({});

  const fetchPPGSalary = async (playerId: string, isRookie: boolean) => {
    if (ppgSalaryData[playerId]?.data || ppgSalaryData[playerId]?.loading) return;
    setPpgSalaryData(prev => ({ ...prev, [playerId]: { loading: true, error: null, data: null } }));
    try {
      const endpoint = isRookie
        ? `/api/league/${leagueId}/rookie-extension-salary`
        : `/api/league/${leagueId}/non-rookie-extension-salary`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, rosterId: userTeam?.rosterId }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to calculate salary");
      }
      const data = await res.json();
      setPpgSalaryData(prev => ({ ...prev, [playerId]: { loading: false, error: null, data } }));
    } catch (err: any) {
      setPpgSalaryData(prev => ({ ...prev, [playerId]: { loading: false, error: err.message || "Error", data: null } }));
    }
  };
  
  // Track if we're currently loading drafts to prevent auto-save during load
  const isLoadingDraftsRef = useRef(false);
  // Track if this is the initial mount to prevent auto-save on initial load
  const isInitialMountRef = useRef(true);
  // Track previous drafts state to detect actual changes
  const previousDraftsRef = useRef<string | null>(null);

  // Query for pending approval requests
  const { data: pendingApprovalData } = useQuery<{ hasPending: boolean; request: { id: string; status: string; submittedAt: number } | null }>({
    queryKey: ['/api/league', leagueId, 'contract-approvals', 'pending', userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
  });

  // Query for saved contract drafts
  interface SavedDraft {
    id: string;
    playerId: string;
    playerName: string;
    playerPosition: string;
    salaries: string;
    franchiseTagApplied: number;
    updatedAt: number;
  }
  
  const { data: savedDrafts } = useQuery<SavedDraft[]>({
    queryKey: ['/api/league', leagueId, 'contract-drafts', userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
  });

  // Query for team extension status
  interface TeamExtension {
    id: string;
    leagueId: string;
    rosterId: number;
    season: number;
    playerId: string;
    playerName: string;
    extensionSalary: number;
    extensionYear: number;
    extensionType: number; // 1-4 year extension
    extensionSalary2: number | null;
    isRookieExtension: number; // 0 = regular, 1 = rookie
    status: "pending" | "confirmed";
    createdAt: number;
  }

  interface ExtensionStatus {
    hasUsedExtension: boolean;
    hasUsed1Year: boolean;
    hasUsed2Year: boolean;
    hasUsed3Year: boolean;
    hasUsed4Year: boolean;
    hasUsedNonRookieExtension: boolean;
    nonRookieExtensionCount: number;
    rookieExtensionCount: number;
    rookieHas4Year: boolean;
    extensions: TeamExtension[];
  }

  const { data: extensionStatus, error: extensionStatusError } = useQuery<ExtensionStatus>({
    queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId],
    enabled: !!leagueId && !!userTeam?.rosterId,
    retry: 1,
  });
  
  // Log extension status errors for debugging
  if (extensionStatusError) {
    console.error("Error fetching extension status:", extensionStatusError);
  }

  // Player rankings query removed — rookie extensions now use PPG-based pricing from /rookie-extension-salary endpoint

  // Extension mutation - all extensions use PPG-based pricing
  const applyExtensionMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      playerName: string;
      currentSalary: number;
      extensionType: 1 | 2 | 3 | 4;
      extensionYear: number;
      isPPGBased?: boolean;
      ppgSalary?: number;
    }) => {
      return apiRequest("POST", `/api/league/${leagueId}/extensions`, {
        rosterId: userTeam?.rosterId,
        season: CURRENT_YEAR,
        ...data,
      });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Extension Pending",
        description: `Extension created for ${variables.playerName}. Click Confirm to finalize or Cancel to remove.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId] });
      setOpenExtensionPopover(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Extension Failed",
        description: error.message || "Failed to create extension",
        variant: "destructive",
      });
    },
  });

  // Delete extension mutation (commissioner only - allows team to use extension again)
  const deleteExtensionMutation = useMutation({
    mutationFn: async () => {
      if (!userTeam?.rosterId) {
        throw new Error("Team not found");
      }
      return apiRequest("DELETE", `/api/league/${leagueId}/extensions/${CURRENT_YEAR}/${userTeam.rosterId}`);
    },
    onSuccess: () => {
      toast({
        title: "Extension Removed",
        description: "The extension has been removed. The team can now use their extension again for this season.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contracts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Remove Extension",
        description: error.message || "Failed to remove extension",
        variant: "destructive",
      });
    },
  });

  // Confirm a pending extension (applies salary changes permanently)
  const confirmExtensionMutation = useMutation({
    mutationFn: async (extensionId: string) => {
      if (!userTeam?.rosterId) {
        throw new Error("Team not found");
      }
      return apiRequest("PUT", `/api/league/${leagueId}/extensions/${extensionId}/confirm`, {
        rosterId: userTeam.rosterId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Extension Confirmed",
        description: "The extension has been finalized and applied to the contract.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contracts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Confirm Extension",
        description: error.message || "Failed to confirm extension",
        variant: "destructive",
      });
    },
  });

  // Cancel a pending extension (user can cancel their own pending extensions)
  const cancelPendingExtensionMutation = useMutation({
    mutationFn: async (extensionId: string) => {
      if (!userTeam?.rosterId) {
        throw new Error("Team not found");
      }
      return apiRequest("DELETE", `/api/league/${leagueId}/extensions/pending/${extensionId}?rosterId=${userTeam.rosterId}`);
    },
    onSuccess: () => {
      toast({
        title: "Extension Cancelled",
        description: "The pending extension has been cancelled.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'extensions', CURRENT_YEAR, userTeam?.rosterId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Cancel Extension",
        description: error.message || "Failed to cancel pending extension",
        variant: "destructive",
      });
    },
  });

  // Track the league contract data to detect commissioner changes
  const [prevLeagueContractDataRef, setPrevLeagueContractDataRef] = useState<string | null>(null);

  // Sync with league contract changes - reset overrides when commissioner updates contracts
  useEffect(() => {
    if (!userTeam) return;
    
    const rosterId = userTeam.rosterId.toString();
    const currentTeamContracts = leagueContractData[rosterId];
    const currentContractsJson = JSON.stringify(currentTeamContracts);
    
    // If league contracts changed after initial load, reset local overrides to sync
    if (prevLeagueContractDataRef !== null && currentContractsJson !== prevLeagueContractDataRef) {
      // League contracts were updated by commissioner - clear local overrides
      // Keep draftsLoaded = true so old saved drafts don't get reloaded
      setHypotheticalData({
        salaryOverrides: {},
        addedFreeAgents: [],
      });
      setFranchiseTaggedPlayers(new Set());
      setPendingFranchiseTagPlayerId(null);
      setLastSavedAt(null);
      // Don't set draftsLoaded to false - we want to keep using league values
    }
    
    setPrevLeagueContractDataRef(currentContractsJson);
  }, [leagueContractData, userTeam]);

  // Helper function to build drafts array from current hypothetical data
  const buildDraftsArray = (): Array<{
    playerId: string;
    playerName: string;
    playerPosition: string;
    salaries: string;
    franchiseTagApplied: number;
  }> => {
    const drafts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salaries: string;
      franchiseTagApplied: number;
    }> = [];

    // Add roster players with their hypothetical salaries
    for (const player of rosterPlayers) {
      const salaryByYear: Record<string, number> = {};
      const yearKeys = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
      yearKeys.forEach((year) => {
        const value = player.hypotheticalSalaries[year] || 0;
        if (value > 0) {
          salaryByYear[String(year)] = Math.round(value * 10);
        }
      });

      // Include if there's any salary value or overrides
      if (Object.keys(salaryByYear).length > 0 ||
          hypotheticalData.salaryOverrides[player.playerId]) {
        drafts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salaries: JSON.stringify(salaryByYear),
          franchiseTagApplied: franchiseTaggedPlayers.has(player.playerId) ? 1 : 0,
        });
      }
    }

    // Add free agents with their salaries
    for (const player of hypotheticalData.addedFreeAgents) {
      const salaryByYear: Record<string, number> = {};
      const yearKeys = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
      yearKeys.forEach((year) => {
        const value = player.hypotheticalSalaries[year] || 0;
        if (value > 0) {
          salaryByYear[String(year)] = Math.round(value * 10);
        }
      });

      if (Object.keys(salaryByYear).length > 0) {
        drafts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salaries: JSON.stringify(salaryByYear),
          franchiseTagApplied: 0,
        });
      }
    }

    return drafts;
  };

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async ({ drafts, silent }: { drafts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salaries: string;
      franchiseTagApplied: number;
    }>; silent?: boolean }) => {
      return apiRequest("POST", `/api/league/${leagueId}/contract-drafts`, {
        rosterId: userTeam?.rosterId,
        drafts,
      });
    },
    onSuccess: (_, variables) => {
      setLastSavedAt(Date.now());
      // Only show toast for manual saves, not auto-saves
      if (!variables.silent) {
        toast({
          title: "Draft Saved",
          description: "Your contract changes have been saved for later.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contract-drafts'] });
    },
    onError: (error: Error, variables) => {
      // Only show error toast for manual saves, not auto-saves
      if (!variables.silent) {
        toast({
          title: "Save Failed",
          description: error.message || "Failed to save draft.",
          variant: "destructive",
        });
      }
    },
  });

  // Submit for approval mutation
  const submitForApprovalMutation = useMutation({
    mutationFn: async (contracts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salaries: string;
      franchiseTagApplied: boolean;
    }>) => {
      return apiRequest("POST", `/api/league/${leagueId}/contract-approvals`, {
        rosterId: userTeam?.rosterId,
        teamName: userTeam?.teamName,
        ownerName: userTeam?.ownerName,
        contracts,
      });
    },
    onSuccess: () => {
      toast({
        title: "Contracts Submitted",
        description: "Your contracts have been submitted for commissioner approval.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'contract-approvals'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit contracts for approval.",
        variant: "destructive",
      });
    },
  });

  const allRosterPlayerIdsSet = useMemo(() => {
    return new Set(rosterPlayerIds);
  }, [rosterPlayerIds]);

  // Load saved drafts and restore salary overrides and free agents
  useEffect(() => {
    if (savedDrafts && savedDrafts.length > 0 && !draftsLoaded && userTeam) {
      isLoadingDraftsRef.current = true;
      
      const taggedPlayers = new Set<string>();
      const salaryOverrides: Record<string, Record<number, number>> = {};
      const addedFreeAgents: HypotheticalPlayer[] = [];
      let latestUpdatedAt = 0;
      
      const rosterId = userTeam.rosterId.toString();
      const currentTeamContracts = leagueContractData[rosterId] || {};
      
      for (const draft of savedDrafts) {
        const draftParsed = (() => {
          try {
            return JSON.parse(draft.salaries || "{}");
          } catch {
            return {};
          }
        })();

        // Track franchise tags
        if (draft.franchiseTagApplied === 1) {
          taggedPlayers.add(draft.playerId);
        }
        
        // Track latest update time
        if (draft.updatedAt > latestUpdatedAt) {
          latestUpdatedAt = draft.updatedAt;
        }
        
        // Check if player is in roster (roster player) or not (free agent)
        const isRosterPlayer = allRosterPlayerIdsSet.has(draft.playerId);
        
        if (isRosterPlayer) {
          // This is a roster player - create salary overrides for differences
          const officialContract = currentTeamContracts[draft.playerId];
          const draftSalaries: Record<number, number> = {};
          Object.entries(draftParsed).forEach(([year, value]) => {
            const yearNum = Number(year);
            if (!isNaN(yearNum)) {
              draftSalaries[yearNum] = (Number(value) || 0) / 10;
            }
          });
          
          const officialSalaries = officialContract?.salaries || {};
          const overrides: Record<number, number> = {};
          
          // Only create overrides where draft differs from official
          for (const year of [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR] as const) {
            const draftSalary = draftSalaries[year];
            const officialSalary = officialSalaries[year] || 0;
            
            if (draftSalary > 0 && draftSalary !== officialSalary) {
              overrides[year] = draftSalary;
            }
          }
          
          if (Object.keys(overrides).length > 0) {
            salaryOverrides[draft.playerId] = overrides;
          }
        } else {
          // This is a free agent - add to addedFreeAgents array
          const hypotheticalSalaries: Record<number, number> = {};
          Object.entries(draftParsed).forEach(([year, value]) => {
            const yearNum = Number(year);
            if (!isNaN(yearNum)) {
              hypotheticalSalaries[yearNum] = (Number(value) || 0) / 10;
            }
          });
          
          // Only add if there are any salaries
          if (Object.values(hypotheticalSalaries).some(s => s > 0)) {
            // Try to get player info from playerMap, or use draft data
            const playerInfo = playerMap[draft.playerId];
            addedFreeAgents.push({
              playerId: draft.playerId,
              name: draft.playerName,
              position: draft.playerPosition,
              nflTeam: playerInfo?.team || null,
              yearsExp: playerInfo?.yearsExp ?? 0,
              hypotheticalSalaries,
              isRosterPlayer: false,
              isFreeAgent: true,
            });
          }
        }
      }
      
      // Restore the loaded data
      setFranchiseTaggedPlayers(taggedPlayers);
      setPendingFranchiseTagPlayerId(null);
      setHypotheticalData(prev => ({
        salaryOverrides: { ...prev.salaryOverrides, ...salaryOverrides },
        addedFreeAgents: [...prev.addedFreeAgents, ...addedFreeAgents],
      }));
      setLastSavedAt(latestUpdatedAt);
      setDraftsLoaded(true);
      isLoadingDraftsRef.current = false;
    } else if (savedDrafts && savedDrafts.length === 0 && !draftsLoaded) {
      // No saved drafts - mark as loaded
      setDraftsLoaded(true);
      isLoadingDraftsRef.current = false;
    }
  }, [savedDrafts, draftsLoaded, userTeam, leagueContractData, allRosterPlayerIdsSet, playerMap]);

  // Calculate top 5 salaries by position for franchise tag calculation
  const top5SalariesByPosition = useMemo(() => {
    const salariesByPosition: Record<string, number[]> = {};
    
    for (const contract of dbContracts) {
      const player = playerMap[contract.playerId];
      if (!player?.position) continue;
      
      const salaryCurrent = contract.salaries?.[CURRENT_YEAR] || 0;
      if (salaryCurrent <= 0) continue;
      
      if (!salariesByPosition[player.position]) {
        salariesByPosition[player.position] = [];
      }
      salariesByPosition[player.position].push(salaryCurrent);
    }
    
    // Sort and take top 5, calculate average rounded up
    const result: Record<string, number> = {};
    for (const position of Object.keys(salariesByPosition)) {
      const sorted = salariesByPosition[position].sort((a, b) => b - a);
      const top5 = sorted.slice(0, 5);
      if (top5.length > 0) {
        const avg = top5.reduce((sum, s) => sum + s, 0) / top5.length;
        result[position] = Math.ceil(avg);
      } else {
        result[position] = 0;
      }
    }
    
    return result;
  }, [dbContracts, playerMap, CURRENT_YEAR]);

  // Check if player has been previously franchise tagged (from database)
  const isPlayerPreviouslyFranchiseTagged = (playerId: string): boolean => {
    const contract = dbContracts.find(c => c.playerId === playerId && c.rosterId === userTeam?.rosterId);
    // Check both current franchise tag status and historical tracking
    return contract?.franchiseTagUsed === 1 || (contract as any)?.hasBeenFranchiseTagged === 1;
  };

  // Check if player is eligible for extension
  // Both rookie and non-rookie extensions use PPG-based pricing
  interface ExtensionEligibility {
    eligible: boolean;
    reason: string;
    extensionYear: number;
    currentSalary: number;
    currentSalaryTenths: number;
    canDo1Year: boolean;
    canDo2Year: boolean;
    canDo3Year: boolean;
    canDo4Year: boolean;
    /** True when non-rookie 4-year would exceed OPTION_YEAR (button shown but disabled) */
    wouldExceedMaxYearFor4Year?: boolean;
    oneYearSalary: number;
    twoYearSalary: number;
    threeYearSalary: number;
    fourYearSalary: number;
    isRookieContract: boolean;
    requiresQuartilePricing: boolean;
    requiresPPGPricing: boolean;
  }

  const isPlayerEligibleForExtension = (playerId: string): ExtensionEligibility => {
    const defaultResult: ExtensionEligibility = {
      eligible: false,
      reason: "No contract found",
      extensionYear: 0,
      currentSalary: 0,
      currentSalaryTenths: 0,
      canDo1Year: false,
      canDo2Year: false,
      canDo3Year: false,
      canDo4Year: false,
      oneYearSalary: 0,
      twoYearSalary: 0,
      threeYearSalary: 0,
      fourYearSalary: 0,
      isRookieContract: false,
      requiresQuartilePricing: false,
      requiresPPGPricing: false,
    };

    const contract = dbContracts.find(c => c.playerId === playerId && c.rosterId === userTeam?.rosterId);
    if (!contract) {
      return defaultResult;
    }

    // Check if already has an extension applied
    if (contract.extensionApplied === 1) {
      return { ...defaultResult, reason: "Extension already applied" };
    }

    // Check if player has been extended before on this roster
    if ((contract as any).hasBeenExtended === 1) {
      return { ...defaultResult, reason: "Player has already been extended on this team. Must go to free agency or be franchise tagged first." };
    }

    // Check if player has rookie contract designation
    const isRookieContract = contract.isRookieContract === 1;

    const salaries = contract.salaries || {};
    const salaryEntries = Object.entries(salaries)
      .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
      .filter(entry => !isNaN(entry.year) && entry.value > 0)
      .sort((a, b) => a.year - b.year);

    // Find last and second-to-last contract years
    const lastEntry = salaryEntries[salaryEntries.length - 1];
    const secondLastEntry = salaryEntries[salaryEntries.length - 2];
    const lastYearWithSalary = lastEntry?.year || 0;
    const secondToLastYearWithSalary = secondLastEntry?.year || 0;
    const lastYearSalary = lastEntry?.value || 0;
    const secondToLastYearSalary = secondLastEntry?.value || 0;

    const isInLastYear = lastYearWithSalary === CURRENT_YEAR;
    const isInSecondToLastYear = secondToLastYearWithSalary === CURRENT_YEAR;

    // Rookie contracts: must be in the FINAL year only, and the season must be over (offseason)
    if (isRookieContract) {
      if (!isInLastYear) {
        return { ...defaultResult, isRookieContract: true, requiresPPGPricing: true, reason: "Player is not in the final year of their rookie contract" };
      }
      if (!isOffseason) {
        return { ...defaultResult, isRookieContract: true, requiresPPGPricing: true, reason: "Rookie extensions are only available after the season has ended (offseason)" };
      }
    } else {
      // Non-rookie: must be in last year OR second-to-last year of contract
      if (!isInLastYear && !isInSecondToLastYear) {
        return { ...defaultResult, reason: "Player is not in the final or second-to-last year of their contract" };
      }
    }

    // Use the salary from the year we're extending from
    const salaryToUse = (!isRookieContract && isInSecondToLastYear) ? secondToLastYearSalary : lastYearSalary;

    // Calculate extension year (starts after the last year with salary)
    const extensionYear = lastYearWithSalary + 1;
    
    // All extensions now use PPG-based pricing from server endpoints
    // Salary values will come from ppgSalaryData when the popover opens
    const oneYearSalary = 0;
    const twoYearSalary = 0;
    const threeYearSalary = 0;
    const fourYearSalary = 0;
    
    // Check if we can do each extension type (max year is option year)
    const maxYear = OPTION_YEAR;
    const canDo1Year = extensionYear <= maxYear;
    const canDo2Year = extensionYear + 1 <= maxYear;
    const canDo3Year = extensionYear + 2 <= maxYear;
    // Rookie: 4-year only when it fits within option year. Non-rookie: show 4-year whenever eligible
    const canDo4Year = isRookieContract
      ? extensionYear + 3 <= maxYear
      : (isInLastYear || isInSecondToLastYear);
    const wouldExceedMaxYearFor4Year = !isRookieContract && canDo4Year && extensionYear + 3 > maxYear;

    return {
      eligible: isRookieContract ? (canDo3Year || canDo4Year) : (canDo1Year || canDo2Year || canDo3Year || canDo4Year),
      reason: isRookieContract
        ? "Eligible for PPG-based extension (rookie contract — offseason)"
        : (canDo1Year || canDo2Year || canDo3Year || canDo4Year) 
          ? "Eligible for PPG-based extension" 
          : `Cannot extend - would exceed ${maxYear}`,
      extensionYear,
      currentSalary: salaryToUse,
      currentSalaryTenths: Math.round(salaryToUse * 10),
      canDo1Year: isRookieContract ? false : canDo1Year,
      canDo2Year: isRookieContract ? false : canDo2Year,
      canDo3Year,
      canDo4Year,
      wouldExceedMaxYearFor4Year: wouldExceedMaxYearFor4Year || undefined,
      oneYearSalary,
      twoYearSalary,
      threeYearSalary,
      fourYearSalary,
      isRookieContract,
      requiresQuartilePricing: false,
      requiresPPGPricing: true,
    };
  };

  // Handle applying extension with type selection
  const handleApplyExtension = (playerId: string, playerName: string, extensionYear: number, currentSalaryTenths: number, extensionType: 1 | 2 | 3 | 4, isPPGBased: boolean = false, ppgSalary?: number) => {
    applyExtensionMutation.mutate({
      playerId,
      playerName,
      currentSalary: currentSalaryTenths,
      extensionType,
      extensionYear,
      isPPGBased,
      ppgSalary,
    });
  };

  const freeAgentResults = useMemo(() => {
    if (!freeAgentSearch.trim() || freeAgentSearch.length < 2) return [];
    
    const searchLower = freeAgentSearch.toLowerCase();
    const addedIds = new Set(hypotheticalData.addedFreeAgents.map(p => p.playerId));
    
    return allPlayers
      .filter(player => {
        if (!player.name || !player.position) return false;
        if (!["QB", "RB", "WR", "TE", "K"].includes(player.position)) return false;
        if (allRosterPlayerIdsSet.has(player.id)) return false;
        if (addedIds.has(player.id)) return false;
        return player.name.toLowerCase().includes(searchLower);
      })
      .slice(0, 10);
  }, [freeAgentSearch, allPlayers, allRosterPlayerIdsSet, hypotheticalData.addedFreeAgents]);

  if (!userTeam) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Calculator className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No Team Found</h3>
        <p className="text-muted-foreground text-center max-w-md">
          You need to be logged in with a team in this league to manage hypothetical contracts.
        </p>
      </div>
    );
  }

  const getLeagueSalary = (playerId: string, year: number): number => {
    const rosterId = userTeam.rosterId.toString();
    return leagueContractData[rosterId]?.[playerId]?.salaries?.[year] || 0;
  };

  // Always use league contracts as the source of truth
  // Overrides are only used for the approval workflow (proposing changes)
  const getEffectiveSalary = (playerId: string, year: number): number => {
    // Check if there's a local override for proposal purposes
    const override = hypotheticalData.salaryOverrides[playerId]?.[year];
    if (override !== undefined) return override;
    // Default to league contract value (commissioner-set)
    return getLeagueSalary(playerId, year);
  };

  // Check if player has any local overrides (for display purposes)
  const hasLocalOverride = (playerId: string): boolean => {
    const overrides = hypotheticalData.salaryOverrides[playerId];
    if (!overrides) return false;
    // Check if any override differs from league value
    return CONTRACT_YEARS.some(year => {
      const override = overrides[year];
      const leagueValue = getLeagueSalary(playerId, year);
      return override !== undefined && override !== leagueValue;
    });
  };

  // Helper function to get contract length from dbContracts
  const getContractLength = (playerId: string): number | "R" => {
    const contract = dbContracts.find(c => c.playerId === playerId && c.rosterId === userTeam?.rosterId);
    if (!contract) return 0;
    if (contract.isRookieContract === 1) return "R";
    return contract.originalContractYears || 0;
  };

  // Helper function to calculate years remaining on contract (offseason: current year does not count)
  const getYearsRemaining = (playerId: string, hypotheticalSalaries: Record<number, number>): number => {
    const contractYears = [...CONTRACT_YEARS, OPTION_YEAR].filter(year => (hypotheticalSalaries[year] || 0) > 0);
    if (contractYears.length === 0) return 0;
    const lastYear = Math.max(...contractYears);
    return Math.max(0, lastYear - CURRENT_YEAR + (isOffseason ? 0 : 1));
  };

  const rosterPlayers: HypotheticalPlayer[] = userTeam.players
    .filter(id => playerMap[id])
    .map(id => {
      const player = playerMap[id];
      const hypotheticalSalaries: Record<number, number> = {};
      [...CONTRACT_YEARS, OPTION_YEAR].forEach(year => {
        hypotheticalSalaries[year] = getEffectiveSalary(id, year);
      });

      const pendingExt = extensionStatus?.extensions?.find(
        e => e.playerId === id && e.status === "pending"
      );
      if (pendingExt) {
        for (let i = 0; i < pendingExt.extensionType; i++) {
          const extYear = pendingExt.extensionYear + i;
          if ((hypotheticalSalaries[extYear] || 0) === 0) {
            hypotheticalSalaries[extYear] = pendingExt.extensionSalary / 10;
          }
        }
      }

      return {
        playerId: id,
        name: player.name,
        position: player.position || "NA",
        nflTeam: player.team || null,
        yearsExp: player.yearsExp ?? 0,
        hypotheticalSalaries,
        isRosterPlayer: true,
        isFreeAgent: false,
      };
    })
    .filter(p => {
      // Position filter
      if (selectedPositions.length > 0 && !selectedPositions.includes(p.position)) return false;
      
      // Contract length filter
      if (selectedContractLengths.length > 0) {
        const contractLength = getContractLength(p.playerId);
        const lengthStr = contractLength === "R" ? "R" : String(contractLength);
        if (!selectedContractLengths.includes(lengthStr)) return false;
      }
      
      // Years remaining filter
      if (selectedYearsRemaining.length > 0) {
        const yearsRemaining = getYearsRemaining(p.playerId, p.hypotheticalSalaries);
        const yrStr = yearsRemaining >= 4 ? "4+" : String(yearsRemaining);
        if (!selectedYearsRemaining.includes(yrStr)) return false;
      }
      
      // Player type filter (roster players pass when "Roster Player" selected or no filter)
      if (selectedPlayerTypes.length > 0 && !selectedPlayerTypes.includes("Roster Player")) return false;
      
      return true;
    })
    .sort((a, b) => {
      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];
      const posA = posOrder.indexOf(a.position);
      const posB = posOrder.indexOf(b.position);
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name);
    });

  // Apply filters to free agents as well
  const filteredFreeAgents = hypotheticalData.addedFreeAgents.filter(p => {
    // Position filter
    if (selectedPositions.length > 0 && !selectedPositions.includes(p.position)) return false;
    
    // Contract length filter (free agents have no contract, so only show if no filter or "0" selected)
    if (selectedContractLengths.length > 0 && !selectedContractLengths.includes("0")) return false;
    
    // Years remaining filter (free agents have 0 years remaining)
    if (selectedYearsRemaining.length > 0 && !selectedYearsRemaining.includes("0")) return false;
    
    // Player type filter
    if (selectedPlayerTypes.length > 0 && !selectedPlayerTypes.includes("Free Agent")) return false;
    
    return true;
  });

  // Fetch user's active bids to include in salary breakdown
  const { data: userBids = [] } = useQuery<PlayerBid[]>({
    queryKey: ['/api/league', leagueId, 'bids', userTeam?.rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/${userTeam!.rosterId}`);
      if (!res.ok) throw new Error("Failed to fetch bids");
      return res.json();
    },
    enabled: !!leagueId && !!userTeam,
  });

  const bidHypotheticalPlayers = useMemo(() => {
    const activeBids = userBids.filter(b => b.status === "active");
    if (activeBids.length === 0) return [];

    const existingPlayerIds = new Set([
      ...rosterPlayers.map(p => p.playerId),
      ...filteredFreeAgents.map(p => p.playerId),
    ]);

    return activeBids
      .filter(b => !existingPlayerIds.has(b.playerId))
      .map(bid => {
        const player = playerMap[bid.playerId];
        const hypotheticalSalaries: Record<number, number> = {};
        const bidStartYear = CURRENT_YEAR + 1;
        for (let y = bidStartYear; y < bidStartYear + bid.contractYears; y++) {
          hypotheticalSalaries[y] = bid.bidAmount;
        }
        return {
          playerId: bid.playerId,
          name: player?.name || bid.playerName,
          position: player?.position || bid.playerPosition || "NA",
          nflTeam: player?.team || bid.playerTeam || null,
          yearsExp: player?.yearsExp ?? 0,
          hypotheticalSalaries,
          isRosterPlayer: false,
          isFreeAgent: true,
        } as HypotheticalPlayer;
      });
  }, [userBids, rosterPlayers, filteredFreeAgents, playerMap, CURRENT_YEAR]);

  const allHypotheticalPlayers = [...rosterPlayers, ...filteredFreeAgents, ...bidHypotheticalPlayers];

  // Auto-save hypothetical changes with debouncing
  useEffect(() => {
    // Skip auto-save during initial mount or while loading drafts
    if (isInitialMountRef.current || isLoadingDraftsRef.current || !draftsLoaded) {
      if (draftsLoaded) {
        isInitialMountRef.current = false;
      }
      return;
    }

    // Build current drafts array
    const drafts = buildDraftsArray();
    
    // Skip if there are no drafts to save
    if (drafts.length === 0) {
      // Clear previous drafts ref if we have no drafts
      previousDraftsRef.current = null;
      return;
    }

    // Serialize current drafts for comparison
    const currentDraftsString = JSON.stringify(drafts);
    
    // Only proceed if drafts have actually changed
    if (previousDraftsRef.current === currentDraftsString) {
      // No change detected, skip auto-save
      return;
    }

    // Debounce: wait 1.5 seconds after user stops making changes
    const timeoutId = setTimeout(() => {
      // Double-check that drafts haven't changed during debounce period
      const latestDrafts = buildDraftsArray();
      const latestDraftsString = JSON.stringify(latestDrafts);
      
      // Only save if mutation is not already pending and drafts still match
      if (!saveDraftMutation.isPending && latestDraftsString === currentDraftsString) {
        saveDraftMutation.mutate({ drafts: latestDrafts, silent: true });
        // Update previous drafts ref after saving
        previousDraftsRef.current = latestDraftsString;
      }
    }, 1500);

    // Cleanup timeout on next change
    return () => {
      clearTimeout(timeoutId);
    };
  }, [hypotheticalData, franchiseTaggedPlayers, draftsLoaded, rosterPlayers]);

  const hypotheticalTotalsByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
    const total = allHypotheticalPlayers.reduce((sum, p) => {
      return sum + (p.hypotheticalSalaries[year] || 0);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  const leagueTotalsByYear = [...CONTRACT_YEARS, OPTION_YEAR].reduce((acc, year) => {
    const total = rosterPlayers.reduce((sum, p) => {
      return sum + getLeagueSalary(p.playerId, year);
    }, 0);
    return { ...acc, [year]: total };
  }, {} as Record<number, number>);

  const handleHypotheticalSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setHypotheticalData(prev => ({
      ...prev,
      salaryOverrides: {
        ...prev.salaryOverrides,
        [playerId]: {
          ...prev.salaryOverrides[playerId],
          [year]: numValue,
        }
      }
    }));
  };

  const handleAddFreeAgent = (player: SleeperPlayerData) => {
    const hypotheticalSalaries: Record<number, number> = {};
    [...CONTRACT_YEARS, OPTION_YEAR].forEach(year => {
      hypotheticalSalaries[year] = 0;
    });

    const newFreeAgent: HypotheticalPlayer = {
      playerId: player.id,
      name: player.name,
      position: player.position || "NA",
      nflTeam: player.team || null,
      yearsExp: player.yearsExp ?? 0,
      hypotheticalSalaries,
      isRosterPlayer: false,
      isFreeAgent: true,
    };

    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: [...prev.addedFreeAgents, newFreeAgent],
    }));
    setFreeAgentSearch("");
    setShowFreeAgentSearch(false);
  };

  const handleRemoveFreeAgent = (playerId: string) => {
    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: prev.addedFreeAgents.filter(p => p.playerId !== playerId),
      salaryOverrides: Object.fromEntries(
        Object.entries(prev.salaryOverrides).filter(([id]) => id !== playerId)
      ),
    }));
  };

  const handleFreeAgentSalaryChange = (playerId: string, year: number, value: string) => {
    const numValue = parseFloat(value) || 0;
    setHypotheticalData(prev => ({
      ...prev,
      addedFreeAgents: prev.addedFreeAgents.map(p => {
        if (p.playerId !== playerId) return p;
        return {
          ...p,
          hypotheticalSalaries: {
            ...p.hypotheticalSalaries,
            [year]: numValue,
          }
        };
      }),
    }));
  };

  const handleResetToLeague = () => {
    setHypotheticalData({
      salaryOverrides: {},
      addedFreeAgents: [],
    });
    setFranchiseTaggedPlayers(new Set());
    setPendingFranchiseTagPlayerId(null);
  };

  const handleFranchiseTag = (playerId: string, position: string) => {
    const franchiseSalary = top5SalariesByPosition[position] || 0;
    if (franchiseSalary === 0) return;
    
    // Find last year with salary to determine franchise year
    const currentSalaries = leagueContractData[userTeam!.rosterId.toString()]?.[playerId]?.salaries || {};
    let lastYearWithSalary = 0;
    if (currentSalaries[2028] > 0) lastYearWithSalary = 2028;
    else if (currentSalaries[2027] > 0) lastYearWithSalary = 2027;
    else if (currentSalaries[2026] > 0) lastYearWithSalary = 2026;
    else if (currentSalaries[2025] > 0) lastYearWithSalary = 2025;
    
    const franchiseYear = lastYearWithSalary < OPTION_YEAR ? lastYearWithSalary + 1 : OPTION_YEAR;

    // If already tagged, remove tag (and clear pending if this player was pending)
    if (franchiseTaggedPlayers.has(playerId)) {
      setPendingFranchiseTagPlayerId(prev => (prev === playerId ? null : prev));
      setFranchiseTaggedPlayers(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        setHypotheticalData(prevData => ({
          ...prevData,
          salaryOverrides: {
            ...prevData.salaryOverrides,
            [playerId]: {
              ...prevData.salaryOverrides[playerId],
              [franchiseYear]: 0,
            }
          }
        }));
        return newSet;
      });
      return;
    }

    // If this player is pending, treat click as cancel
    if (pendingFranchiseTagPlayerId === playerId) {
      cancelPendingFranchiseTag(playerId);
      return;
    }

    // Otherwise go to pending (accept/decline like extension) and show pending contract value
    setPendingFranchiseTagPlayerId(playerId);
    setHypotheticalData(prevData => ({
      ...prevData,
      salaryOverrides: {
        ...prevData.salaryOverrides,
        [playerId]: {
          ...prevData.salaryOverrides[playerId],
          [franchiseYear]: franchiseSalary,
        }
      }
    }));
  };

  // Apply franchise tag (called when user confirms pending tag)
  const applyFranchiseTag = useCallback((playerId: string, position: string) => {
    const franchiseSalary = top5SalariesByPosition[position] || 0;
    const currentSalaries = leagueContractData[userTeam!.rosterId.toString()]?.[playerId]?.salaries || {};
    let lastYearWithSalary = 0;
    if (currentSalaries[2028] > 0) lastYearWithSalary = 2028;
    else if (currentSalaries[2027] > 0) lastYearWithSalary = 2027;
    else if (currentSalaries[2026] > 0) lastYearWithSalary = 2026;
    else if (currentSalaries[2025] > 0) lastYearWithSalary = 2025;
    const franchiseYear = lastYearWithSalary < OPTION_YEAR ? lastYearWithSalary + 1 : OPTION_YEAR;
    setFranchiseTaggedPlayers(prev => new Set(prev).add(playerId));
    setHypotheticalData(prevData => ({
      ...prevData,
      salaryOverrides: {
        ...prevData.salaryOverrides,
        [playerId]: {
          ...prevData.salaryOverrides[playerId],
          [franchiseYear]: franchiseSalary,
        }
      }
    }));
    setPendingFranchiseTagPlayerId(null);
  }, [leagueContractData, userTeam, top5SalariesByPosition, OPTION_YEAR]);

  // Revert pending franchise tag salary and clear pending (called on Cancel or when clicking star again)
  const cancelPendingFranchiseTag = useCallback((playerId: string) => {
    const currentSalaries = leagueContractData[userTeam!.rosterId.toString()]?.[playerId]?.salaries || {};
    let lastYearWithSalary = 0;
    if (currentSalaries[2028] > 0) lastYearWithSalary = 2028;
    else if (currentSalaries[2027] > 0) lastYearWithSalary = 2027;
    else if (currentSalaries[2026] > 0) lastYearWithSalary = 2026;
    else if (currentSalaries[2025] > 0) lastYearWithSalary = 2025;
    const franchiseYear = lastYearWithSalary < OPTION_YEAR ? lastYearWithSalary + 1 : OPTION_YEAR;
    setHypotheticalData(prevData => ({
      ...prevData,
      salaryOverrides: {
        ...prevData.salaryOverrides,
        [playerId]: {
          ...prevData.salaryOverrides[playerId],
          [franchiseYear]: 0,
        }
      }
    }));
    setPendingFranchiseTagPlayerId(null);
  }, [leagueContractData, userTeam, OPTION_YEAR]);

  // Apply franchise tag via API (persists immediately; no commissioner approval)
  const applyFranchiseTagMutation = useMutation({
    mutationFn: async ({ playerId, position }: { playerId: string; position: string }) => {
      return apiRequest("POST", `/api/league/${leagueId}/franchise-tag`, {
        userId: user?.userId,
        rosterId: userTeam?.rosterId,
        playerId,
        position,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      toast({
        title: "Franchise tag applied",
        description: "The franchise tag has been applied to the contract.",
      });
      setFranchiseTaggedPlayers(prev => new Set(prev).add(variables.playerId));
      setPendingFranchiseTagPlayerId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to apply franchise tag",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const hasHypotheticalChanges = Object.keys(hypotheticalData.salaryOverrides).length > 0 || 
    hypotheticalData.addedFreeAgents.length > 0;

  // Build contracts array for submission
  const buildContractsForSubmission = () => {
    const contracts: Array<{
      playerId: string;
      playerName: string;
      playerPosition: string;
      salaries: string;
      franchiseTagApplied: boolean;
    }> = [];

    // Add roster players with their salaries
    for (const player of rosterPlayers) {
      const salaryByYear: Record<string, number> = {};
      const yearKeys = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
      yearKeys.forEach((year) => {
        const value = player.hypotheticalSalaries[year] || 0;
        if (value > 0) {
          salaryByYear[String(year)] = Math.round(value * 10);
        }
      });

      // Only include players with at least one salary value
      if (Object.keys(salaryByYear).length > 0) {
        contracts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salaries: JSON.stringify(salaryByYear),
          franchiseTagApplied: franchiseTaggedPlayers.has(player.playerId),
        });
      }
    }

    // Add free agents with their salaries
    for (const player of hypotheticalData.addedFreeAgents) {
      const salaryByYear: Record<string, number> = {};
      const yearKeys = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
      yearKeys.forEach((year) => {
        const value = player.hypotheticalSalaries[year] || 0;
        if (value > 0) {
          salaryByYear[String(year)] = Math.round(value * 10);
        }
      });

      if (Object.keys(salaryByYear).length > 0) {
        contracts.push({
          playerId: player.playerId,
          playerName: player.name,
          playerPosition: player.position,
          salaries: JSON.stringify(salaryByYear),
          franchiseTagApplied: false,
        });
      }
    }

    return contracts;
  };

  const handleSubmitForApproval = () => {
    const contracts = buildContractsForSubmission();
    if (contracts.length === 0) {
      toast({
        title: "No Contracts",
        description: "Please add salary values to at least one player before submitting.",
        variant: "destructive",
      });
      return;
    }
    submitForApprovalMutation.mutate(contracts);
  };

  const handleSaveDraft = () => {
    const drafts = buildDraftsArray();

    if (drafts.length === 0) {
      toast({
        title: "Nothing to Save",
        description: "Make changes to contract values before saving.",
        variant: "destructive",
      });
      return;
    }

    saveDraftMutation.mutate({ drafts, silent: false });
  };

  const hasPendingApproval = pendingApprovalData?.hasPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {userTeam.avatar ? (
                  <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${userTeam.avatar}`} />
                ) : null}
                <AvatarFallback>
                  {userTeam.teamName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="font-heading">{userTeam.teamName}</CardTitle>
                <p className="text-sm text-muted-foreground">{userTeam.ownerName}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFreeAgentSearch(!showFreeAgentSearch)}
                data-testid="button-add-free-agent"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Free Agent
              </Button>
              {hasHypotheticalChanges && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetToLeague}
                  data-testid="button-reset-hypothetical"
                >
                  Reset to League Values
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending}
                data-testid="button-save-draft"
              >
                {saveDraftMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Draft
              </Button>
              {hasPendingApproval ? (
                <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pending Approval
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmitForApproval}
                  disabled={submitForApprovalMutation.isPending}
                  data-testid="button-submit-for-approval"
                >
                  {submitForApprovalMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit for Approval
                </Button>
              )}
              {lastSavedAt && (
                <span className="text-xs text-muted-foreground ml-2">
                  Last saved: {new Date(lastSavedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <div className="px-6 pb-4">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "contracts" | "salary-breakdown")}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="contracts" data-testid="tab-contracts">
                <FileText className="w-4 h-4 mr-2" />
                Contracts
              </TabsTrigger>
              <TabsTrigger value="salary-breakdown" data-testid="tab-salary-breakdown">
                <PieChartIcon className="w-4 h-4 mr-2" />
                Salary Breakdown
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {activeView === "salary-breakdown" ? (
          <CardContent>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                View your team's salary allocation by position for the next four years.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => {
                  // Calculate approved and unapproved totals by position
                  const positionApproved: Record<string, number> = {};
                  const positionUnapproved: Record<string, number> = {};
                  
                  allHypotheticalPlayers.forEach(player => {
                    const effectiveSalary = player.hypotheticalSalaries[year] || 0;
                    const officialSalary = player.isRosterPlayer 
                      ? getLeagueSalary(player.playerId, year)
                      : 0; // Free agents are all unapproved
                    
                    const unapprovedAmount = player.isFreeAgent 
                      ? effectiveSalary 
                      : Math.max(0, effectiveSalary - officialSalary);
                    const approvedAmount = player.isFreeAgent ? 0 : officialSalary;
                    
                    if (effectiveSalary > 0) {
                      const pos = player.position || "OTHER";
                      positionApproved[pos] = (positionApproved[pos] || 0) + approvedAmount;
                      if (unapprovedAmount > 0) {
                        positionUnapproved[pos] = (positionUnapproved[pos] || 0) + unapprovedAmount;
                      }
                    }
                  });
                  
                  // Create pie data with both approved and unapproved segments
                  const pieData: Array<{ name: string; value: number; isUnapproved: boolean; position: string }> = [];
                  
                  // Get all positions that have either approved or unapproved salaries
                  const allPositions = new Set([
                    ...Object.keys(positionApproved),
                    ...Object.keys(positionUnapproved)
                  ]);
                  
                  allPositions.forEach(position => {
                    const approved = positionApproved[position] || 0;
                    const unapproved = positionUnapproved[position] || 0;
                    
                    // Add approved segment first
                    if (approved > 0) {
                      pieData.push({
                        name: position,
                        value: Math.round(approved * 10) / 10,
                        isUnapproved: false,
                        position,
                      });
                    }
                    
                    // Add unapproved segment
                    if (unapproved > 0) {
                      pieData.push({
                        name: `${position} (Pending)`,
                        value: Math.round(unapproved * 10) / 10,
                        isUnapproved: true,
                        position,
                      });
                    }
                  });
                  
                  pieData.sort((a, b) => {
                    // Sort by position first, then by approved/unapproved
                    if (a.position !== b.position) {
                      const posOrder = ["QB", "RB", "WR", "TE", "K", "DEF", "OTHER"];
                      return (posOrder.indexOf(a.position) - posOrder.indexOf(b.position)) || a.position.localeCompare(b.position);
                    }
                    return a.isUnapproved ? 1 : -1; // Approved first
                  });
                  
                  const totalSalary = pieData.reduce((sum, d) => sum + d.value, 0);
                  
                  const PIE_COLORS: Record<string, string> = {
                    QB: "#ef4444",
                    RB: "#10b981",
                    WR: "#3b82f6",
                    TE: "#f97316",
                    K: "#8b5cf6",
                    DEF: "#6b7280",
                    OTHER: "#a3a3a3",
                  };
                  
                  // Function to lighten a color (reduce opacity)
                  const lightenColor = (color: string): string => {
                    // Convert hex to rgba with reduced opacity
                    const hex = color.replace('#', '');
                    const r = parseInt(hex.substr(0, 2), 16);
                    const g = parseInt(hex.substr(2, 2), 16);
                    const b = parseInt(hex.substr(4, 2), 16);
                    return `rgba(${r}, ${g}, ${b}, 0.5)`;
                  };
                  
                  // Generate unique pattern IDs for each position
                  const patternId = (pos: string) => `diagonal-${pos}-${year}`;
                  
                  return (
                    <Card key={year} className="p-4">
                      <div className="text-center mb-2">
                        <h3 className="font-semibold text-lg">
                          {idx === 4 ? `${year} (Ext)` : year}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Total: ${totalSalary.toFixed(1)}M
                        </p>
                      </div>
                      
                      {pieData.length > 0 ? (
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <defs>
                                {Object.keys(PIE_COLORS).map(position => {
                                  const baseColor = PIE_COLORS[position];
                                  const lightColor = lightenColor(baseColor);
                                  return (
                                    <pattern
                                      key={patternId(position)}
                                      id={patternId(position)}
                                      patternUnits="userSpaceOnUse"
                                      width="10"
                                      height="10"
                                      patternTransform="rotate(45)"
                                    >
                                      <rect width="10" height="10" fill={lightColor} />
                                      <line
                                        x1="0"
                                        y1="0"
                                        x2="10"
                                        y2="10"
                                        stroke="rgba(0,0,0,0.3)"
                                        strokeWidth="1.5"
                                      />
                                    </pattern>
                                  );
                                })}
                              </defs>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                label={({ name, value, percent }) => 
                                  `${name.replace(' (Pending)', '')}: $${value}M (${(percent * 100).toFixed(0)}%)`
                                }
                                labelLine={true}
                              >
                                {pieData.map((entry, index) => {
                                  const baseColor = PIE_COLORS[entry.position] || PIE_COLORS.OTHER;
                                  const fill = entry.isUnapproved 
                                    ? `url(#${patternId(entry.position)})`
                                    : baseColor;
                                  
                                  return (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={fill}
                                    />
                                  );
                                })}
                              </Pie>
                              <RechartsTooltip 
                                formatter={(value: number, name: string) => [`$${value.toFixed(1)}M`, name.includes('Pending') ? 'Pending Approval' : 'Approved']}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-64 flex items-center justify-center text-muted-foreground">
                          No salary data for {year}
                        </div>
                      )}
                      
                      <div className="mt-4 space-y-1">
                        {Object.keys({...positionApproved, ...positionUnapproved}).map(position => {
                          const approved = positionApproved[position] || 0;
                          const unapproved = positionUnapproved[position] || 0;
                          const total = approved + unapproved;
                          const baseColor = PIE_COLORS[position] || PIE_COLORS.OTHER;
                          const lightColor = lightenColor(baseColor);
                          
                          return (
                            <div key={position}>
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-3 h-3 rounded-full" 
                                    style={{ backgroundColor: baseColor }}
                                  />
                                  <span>{position}</span>
                                </div>
                                <span className="font-medium tabular-nums">${total.toFixed(1)}M</span>
                              </div>
                              {unapproved > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground ml-5 mt-0.5">
                                  <div className="flex items-center gap-2">
                                    <svg width="10" height="10" className="inline-block">
                                      <defs>
                                        <pattern
                                          id={`legend-pattern-${position}-${year}`}
                                          patternUnits="userSpaceOnUse"
                                          width="4"
                                          height="4"
                                          patternTransform="rotate(45)"
                                        >
                                          <rect width="4" height="4" fill={lightColor} />
                                          <line
                                            x1="0"
                                            y1="0"
                                            x2="4"
                                            y2="4"
                                            stroke="rgba(0,0,0,0.3)"
                                            strokeWidth="0.8"
                                          />
                                        </pattern>
                                      </defs>
                                      <rect width="10" height="10" fill={`url(#legend-pattern-${position}-${year})`} />
                                    </svg>
                                    <span>Pending: ${unapproved.toFixed(1)}M</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </CardContent>
        ) : (
        <CardContent>
          {showFreeAgentSearch && (
            <div className="mb-4 p-4 bg-muted/50 rounded-lg space-y-3">
              <Label className="text-sm font-medium">Search Free Agents</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Type player name..."
                  value={freeAgentSearch}
                  onChange={(e) => setFreeAgentSearch(e.target.value)}
                  className="pl-10"
                  data-testid="input-free-agent-search"
                />
              </div>
              {freeAgentResults.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {freeAgentResults.map(player => (
                    <div 
                      key={player.id}
                      className="flex items-center justify-between p-2 hover-elevate rounded cursor-pointer"
                      onClick={() => handleAddFreeAgent(player)}
                      data-testid={`free-agent-result-${player.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage 
                            src={`https://sleepercdn.com/content/nfl/players/${player.id}.jpg`}
                            alt={player.name}
                          />
                          <AvatarFallback className="text-xs">
                            {player.name.split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium text-sm">{player.name}</span>
                          <div className="flex items-center gap-2">
                            <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1 py-0`}>
                              {player.position}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{player.team || "FA"}</span>
                          </div>
                        </div>
                      </div>
                      <UserPlus className="w-4 h-4 text-primary" />
                    </div>
                  ))}
                </div>
              )}
              {freeAgentSearch.length >= 2 && freeAgentResults.length === 0 && (
                <p className="text-sm text-muted-foreground">No players found matching "{freeAgentSearch}"</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => {
              const leagueTotal = leagueTotalsByYear[year] || 0;
              const hypotheticalTotal = hypotheticalTotalsByYear[year] || 0;
              const difference = hypotheticalTotal - leagueTotal;
              const isOverCap = hypotheticalTotal > TOTAL_CAP;

              return (
                <Card key={year} className="p-3">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">
                      {idx === 4 ? `${year} (Ext)` : year}
                    </div>
                    <div className="font-bold" style={{ color: isOverCap ? COLORS.deadCap : COLORS.salaries }}>
                      ${hypotheticalTotal.toFixed(1)}M
                    </div>
                    {difference !== 0 && (
                      <div className={`text-xs mt-1 ${difference > 0 ? "text-red-500" : "text-green-500"}`}>
                        {difference > 0 ? "+" : ""}{difference.toFixed(1)}M vs league
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Cap Space: ${(TOTAL_CAP - hypotheticalTotal).toFixed(1)}M
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">
                Position:
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-between font-normal" data-testid="select-position-filter-team">
                    {selectedPositions.length === 0 ? "All Positions" : selectedPositions.sort().join(", ")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[140px] p-2" align="start">
                  <label className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1">
                    <Checkbox
                      checked={selectedPositions.length === 0}
                      onCheckedChange={checked => {
                        if (checked) setSelectedPositions([]);
                      }}
                    />
                    <span className="text-sm font-medium">All</span>
                  </label>
                  {["QB", "RB", "WR", "TE", "K", "DEF"].map(pos => (
                    <label key={pos} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <Checkbox
                        checked={selectedPositions.includes(pos)}
                        onCheckedChange={checked => {
                          setSelectedPositions(prev => checked ? [...prev, pos] : prev.filter(p => p !== pos));
                        }}
                      />
                      <span className="text-sm">{pos}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">
                Contract Length:
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-between font-normal" data-testid="select-contract-length-filter">
                    {selectedContractLengths.length === 0 ? "All Lengths" : selectedContractLengths.map(v => v === "R" ? "Rookie (R)" : v === "0" ? "No Contract" : `${v} Yr`).join(", ")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[160px] p-2" align="start">
                  <label className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1">
                    <Checkbox
                      checked={selectedContractLengths.length === 0}
                      onCheckedChange={checked => {
                        if (checked) setSelectedContractLengths([]);
                      }}
                    />
                    <span className="text-sm font-medium">All</span>
                  </label>
                  {[
                    { value: "0", label: "No Contract" },
                    { value: "1", label: "1 Year" },
                    { value: "2", label: "2 Years" },
                    { value: "3", label: "3 Years" },
                    { value: "4", label: "4 Years" },
                    { value: "R", label: "Rookie (R)" },
                  ].map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <Checkbox
                        checked={selectedContractLengths.includes(value)}
                        onCheckedChange={checked => {
                          setSelectedContractLengths(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
                        }}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">
                Years Remaining:
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-between font-normal" data-testid="select-years-remaining-filter">
                    {selectedYearsRemaining.length === 0 ? "All" : selectedYearsRemaining.map(v => v === "4+" ? "4+ Years" : `${v} Yr`).join(", ")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[140px] p-2" align="start">
                  <label className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1">
                    <Checkbox
                      checked={selectedYearsRemaining.length === 0}
                      onCheckedChange={checked => {
                        if (checked) setSelectedYearsRemaining([]);
                      }}
                    />
                    <span className="text-sm font-medium">All</span>
                  </label>
                  {[
                    { value: "0", label: "0 Years" },
                    { value: "1", label: "1 Year" },
                    { value: "2", label: "2 Years" },
                    { value: "3", label: "3 Years" },
                    { value: "4+", label: "4+ Years" },
                  ].map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <Checkbox
                        checked={selectedYearsRemaining.includes(value)}
                        onCheckedChange={checked => {
                          setSelectedYearsRemaining(prev => checked ? [...prev, value] : prev.filter(v => v !== value));
                        }}
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium whitespace-nowrap">
                Type:
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-between font-normal" data-testid="select-player-type-filter">
                    {selectedPlayerTypes.length === 0 ? "All Types" : selectedPlayerTypes.join(", ")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[160px] p-2" align="start">
                  <label className="flex items-center gap-2 py-1.5 cursor-pointer border-b border-border mb-1">
                    <Checkbox
                      checked={selectedPlayerTypes.length === 0}
                      onCheckedChange={checked => {
                        if (checked) setSelectedPlayerTypes([]);
                      }}
                    />
                    <span className="text-sm font-medium">All</span>
                  </label>
                  {["Roster Player", "Free Agent"].map(type => (
                    <label key={type} className="flex items-center gap-2 py-1.5 cursor-pointer">
                      <Checkbox
                        checked={selectedPlayerTypes.includes(type)}
                        onCheckedChange={checked => {
                          setSelectedPlayerTypes(prev => checked ? [...prev, type] : prev.filter(t => t !== type));
                        }}
                      />
                      <span className="text-sm">{type}</span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <ScrollArea className="h-[450px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Player</TableHead>
                  <TableHead className="text-center w-[60px]">Pos</TableHead>
                  <TableHead className="text-center w-[60px]">Team</TableHead>
                  <TableHead className="text-center w-[55px]">Len</TableHead>
                  <TableHead className="text-center w-[55px]">Rem</TableHead>
                  {[...CONTRACT_YEARS, OPTION_YEAR].map((year, idx) => (
                    <TableHead key={year} className="text-center w-[100px]">
                      {idx === 4 ? `${year} (Ext)` : year}
                    </TableHead>
                  ))}
                  <TableHead className="text-center w-[80px]">Total</TableHead>
                  <TableHead className="text-center w-[80px]">Remaining</TableHead>
                  <TableHead className="text-center w-[50px]">Tag</TableHead>
                  <TableHead className="text-center w-[50px]">Extend</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allHypotheticalPlayers.map((player) => {
                  const isModified = player.isRosterPlayer && 
                    Object.keys(hypotheticalData.salaryOverrides[player.playerId] || {}).length > 0;
                  const remainingYears = getYearsRemaining(player.playerId, player.hypotheticalSalaries);
                  const isExpiring = player.isRosterPlayer && !player.isFreeAgent && player.position !== "DEF" && remainingYears === 0;

                  return (
                    <TableRow 
                      key={player.playerId} 
                      className={
                        isExpiring ? "bg-orange-500/15 border-l-4 border-l-orange-500" :
                        player.isFreeAgent ? "bg-primary/5" : ""
                      }
                      data-testid={`row-hypothetical-${player.playerId}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                              alt={player.name}
                            />
                            <AvatarFallback className="text-xs">
                              {player.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{player.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                          {player.position}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">
                          {player.nflTeam || "FA"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          // Get contract length from league data (read-only display)
                          const rosterId = userTeam?.rosterId?.toString() || "";
                          const leaguePlayerData = leagueContractData[rosterId]?.[player.playerId];
                          const contractLength = leaguePlayerData?.originalContractYears || 0;
                          const isRookie = leaguePlayerData?.isRookieContract || false;
                          return (
                            <span className="text-sm tabular-nums font-medium">
                              {isRookie ? "R" : (contractLength > 0 ? contractLength : "-")}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const remainingYears = getYearsRemaining(player.playerId, player.hypotheticalSalaries);
                          return (
                            <span className="text-sm tabular-nums font-medium">
                              {remainingYears > 0 ? remainingYears : "-"}
                            </span>
                          );
                        })()}
                      </TableCell>
                      {[...CONTRACT_YEARS, OPTION_YEAR].map((year, yearIndex) => {
                        const leagueSalary = player.isRosterPlayer ? getLeagueSalary(player.playerId, year) : 0;
                        const currentValue = player.hypotheticalSalaries[year] || 0;
                        const isDifferent = player.isRosterPlayer && currentValue !== leagueSalary;
                        const isPendingExtYear = extensionStatus?.extensions?.some(
                          e => e.playerId === player.playerId && e.status === "pending" &&
                            year >= e.extensionYear && year < e.extensionYear + e.extensionType
                        ) && leagueSalary === 0;
                        // Pending franchise tag year (the extra year shown before confirm)
                        const franchiseYearForPlayer = (() => {
                          const sal = leagueContractData[userTeam?.rosterId.toString()]?.[player.playerId]?.salaries || {};
                          let last = 0;
                          if (sal[2028] > 0) last = 2028; else if (sal[2027] > 0) last = 2027; else if (sal[2026] > 0) last = 2026; else if (sal[2025] > 0) last = 2025;
                          return last < OPTION_YEAR ? last + 1 : OPTION_YEAR;
                        })();
                        const isPendingFranchiseTagYear = pendingFranchiseTagPlayerId === player.playerId && year === franchiseYearForPlayer;
                        // Find contract end year (last year with salary > 0)
                        const contractEndYear = [...CONTRACT_YEARS, OPTION_YEAR]
                          .filter(y => (player.hypotheticalSalaries[y] || 0) > 0)
                          .pop() || year;
                        const yearsRemaining = contractEndYear - year + 1;
                        // Current year = 100% dead cap; future years based on years remaining
                        // Years remaining: 1yr=0%, 2yr=25%, 3yr=50%, 4yr=75%, 5yr=100%
                        const deadCapByYearsRemaining: Record<number, number> = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1.0 };
                        const deadCapPercent = deadCapEnabled ? (year === CURRENT_YEAR ? 1.0 : (deadCapByYearsRemaining[yearsRemaining] || 0)) : 0;
                        const deadCapValue = deadCapEnabled ? (currentValue * deadCapPercent) : 0;

                        const isReadOnlySalary = player.isRosterPlayer && !player.isFreeAgent;
                        return (
                          <TableCell key={year} className="text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center justify-center gap-0.5">
                                {isReadOnlySalary ? (
                                  <div className={isPendingFranchiseTagYear ? "rounded border border-amber-400 border-dashed px-1" : ""}>
                                    <span className="text-xs text-muted-foreground">$</span>
                                    <span className="text-sm tabular-nums font-medium w-16 text-center">
                                      {currentValue ? `${Number(currentValue).toFixed(1)}` : "—"}
                                    </span>
                                    <span className="text-xs text-muted-foreground">M</span>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-xs text-muted-foreground">$</span>
                                    <Input
                                      type="number"
                                      step="0.1"
                                      min="0"
                                      className={`h-7 w-16 text-center tabular-nums text-sm ${isPendingExtYear || isPendingFranchiseTagYear ? "border-amber-400 border-dashed" : isDifferent ? "border-primary" : ""}`}
                                      placeholder="0"
                                      value={currentValue || ""}
                                      onChange={(e) => {
                                        if (player.isFreeAgent) {
                                          handleFreeAgentSalaryChange(player.playerId, year, e.target.value);
                                        } else {
                                          handleHypotheticalSalaryChange(player.playerId, year, e.target.value);
                                        }
                                      }}
                                      data-testid={`input-hypothetical-${player.playerId}-${year}`}
                                    />
                                    <span className="text-xs text-muted-foreground">M</span>
                                  </>
                                )}
                              </div>
                              {isPendingExtYear && (
                                <span className="text-[10px] text-amber-600 italic">pending ext.</span>
                              )}
                              {isPendingFranchiseTagYear && (
                                <span className="text-[10px] text-amber-600 italic">pending tag</span>
                              )}
                              {deadCapEnabled && currentValue > 0 && deadCapPercent > 0 && (
                                <span className="text-[10px]" style={{ color: COLORS.deadCap }}>
                                  DC: ${Math.ceil(deadCapValue)}M ({Math.round(deadCapPercent * 100)}%)
                                </span>
                              )}
                              {player.isRosterPlayer && leagueSalary > 0 && isDifferent && !isReadOnlySalary && (
                                <span className="text-[10px] text-muted-foreground">
                                  League: ${leagueSalary.toFixed(1)}M
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        {(() => {
                          // Total = only completed seasons (years before current year)
                          const totalValue = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(year => year < CURRENT_YEAR)
                            .reduce((sum, year) => sum + (player.hypotheticalSalaries[year] || 0), 0);
                          return totalValue > 0 ? (
                            <span className="font-medium text-primary tabular-nums">${totalValue.toFixed(1)}M</span>
                          ) : "-";
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          // Remaining = current + future years
                          const remainingValue = [...CONTRACT_YEARS, OPTION_YEAR]
                            .filter(year => year >= CURRENT_YEAR)
                            .reduce((sum, year) => sum + (player.hypotheticalSalaries[year] || 0), 0);
                          return remainingValue > 0 ? (
                            <span className="font-medium text-emerald-600 tabular-nums">${remainingValue.toFixed(1)}M</span>
                          ) : "-";
                        })()}
                      </TableCell>
                      {/* Franchise Tag Column */}
                      <TableCell className="text-center">
                        {player.isRosterPlayer && !player.isFreeAgent && (() => {
                          const franchiseSalary = top5SalariesByPosition[player.position] || 0;
                          const isPreviouslyTagged = isPlayerPreviouslyFranchiseTagged(player.playerId);
                          const noPositionData = franchiseSalary === 0;
                          const isThisPlayerTagged = franchiseTaggedPlayers.has(player.playerId);
                          const isPendingFranchiseTag = pendingFranchiseTagPlayerId === player.playerId;
                          const teamAlreadyUsedTag = (franchiseTaggedPlayers.size > 0 || pendingFranchiseTagPlayerId != null) && !isThisPlayerTagged && !isPendingFranchiseTag;
                          const isDisabled = isPreviouslyTagged || noPositionData || teamAlreadyUsedTag;
                          
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center gap-0.5">
                                  <Button
                                    size="icon"
                                    variant={isThisPlayerTagged || isPendingFranchiseTag ? "default" : "ghost"}
                                    className={`h-7 w-7 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""} ${isPendingFranchiseTag ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                                    onClick={() => !isDisabled && handleFranchiseTag(player.playerId, player.position)}
                                    disabled={isDisabled}
                                    data-testid={`button-franchise-tag-${player.playerId}`}
                                  >
                                    <Star className={`w-4 h-4 ${(isThisPlayerTagged || isPendingFranchiseTag) ? "fill-current" : ""}`} />
                                  </Button>
                                  {isPendingFranchiseTag && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          applyFranchiseTagMutation.mutate({ playerId: player.playerId, position: player.position });
                                        }}
                                        disabled={applyFranchiseTagMutation.isPending}
                                        title="Confirm franchise tag"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelPendingFranchiseTag(player.playerId);
                                        }}
                                        disabled={applyFranchiseTagMutation.isPending}
                                        title="Cancel franchise tag"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {(() => {
                                  const contract = dbContracts.find(c => c.playerId === player.playerId && c.rosterId === userTeam?.rosterId);
                                  const hasBeenExtended = (contract as any)?.hasBeenExtended === 1;
                                  const hasBeenFranchiseTagged = (contract as any)?.hasBeenFranchiseTagged === 1;
                                  
                                  if (isPreviouslyTagged) {
                                    return (
                                      <div>
                                        <p>Player has already been franchise tagged on this team. Must be extended or go to free agency first.</p>
                                        {(hasBeenExtended || hasBeenFranchiseTagged) && (
                                          <p className="text-xs mt-1 text-muted-foreground">
                                            Extended: {hasBeenExtended ? "Yes" : "No"} | Tagged: {hasBeenFranchiseTagged ? "Yes" : "No"}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  if (noPositionData) return "No position salary data available";
                                  if (teamAlreadyUsedTag) return "Team can only use 1 franchise tag per season";
                                  if (isPendingFranchiseTag) {
                                    return (
                                      <div>
                                        <p>Franchise tag pending (${franchiseSalary}M). Click check to confirm or X to cancel.</p>
                                      </div>
                                    );
                                  }
                                  if (isThisPlayerTagged) {
                                    return (
                                      <div>
                                        <p>Franchise tag applied: ${franchiseSalary}M</p>
                                        {(hasBeenExtended || hasBeenFranchiseTagged) && (
                                          <p className="text-xs mt-1 text-muted-foreground">
                                            Extended: {hasBeenExtended ? "Yes" : "No"} | Tagged: {hasBeenFranchiseTagged ? "Yes" : "No"}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div>
                                      <p>Apply franchise tag (${franchiseSalary}M - avg of top 5 {player.position}s)</p>
                                      {(hasBeenExtended || hasBeenFranchiseTagged) && (
                                        <p className="text-xs mt-1 text-muted-foreground">
                                          Extended: {hasBeenExtended ? "Yes" : "No"} | Tagged: {hasBeenFranchiseTagged ? "Yes" : "No"}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </TableCell>
                      
                      {/* Extension Column */}
                      <TableCell className="text-center">
                        {player.isRosterPlayer && !player.isFreeAgent && (() => {
                          const extensionEligibility = isPlayerEligibleForExtension(player.playerId);
                          // Separate rookie and non-rookie extension limits
                          const nonRookieExtCount = extensionStatus?.nonRookieExtensionCount || 0;
                          const rookieExtCount = extensionStatus?.rookieExtensionCount || 0;
                          const rookieUsed4Year = extensionStatus?.rookieHas4Year || false;
                          
                          // Check if this specific player has an extension (and its status)
                          const thisPlayerExtension = (extensionStatus?.extensions && Array.isArray(extensionStatus.extensions))
                            ? extensionStatus.extensions.find(e => e.playerId === player.playerId)
                            : undefined;
                          const thisPlayerHasExtension = !!thisPlayerExtension;
                          const isPendingExtension = thisPlayerExtension?.status === "pending";
                          const isConfirmedExtension = thisPlayerExtension?.status === "confirmed";
                          
                          // Determine if the player's extension options are exhausted
                          const isRookiePlayer = extensionEligibility.isRookieContract;
                          let allOptionsExhausted = false;
                          if (isRookiePlayer) {
                            // Rookie: exhausted if 3 rookie extensions used, or if only 4-year left but 4-year already used
                            const can3YrRookie = extensionEligibility.canDo3Year && rookieExtCount < 3;
                            const can4YrRookie = extensionEligibility.canDo4Year && rookieExtCount < 3 && !rookieUsed4Year;
                            allOptionsExhausted = !can3YrRookie && !can4YrRookie;
                          } else {
                            // Non-rookie: exhausted if team already used both non-rookie extensions (2 per season)
                            allOptionsExhausted = nonRookieExtCount >= 2;
                          }

                          // Disable if can't apply extension or all options exhausted; exception: pending extension can always be toggled off (cancel)
                          const anyMutationPending = applyExtensionMutation.isPending || confirmExtensionMutation.isPending || cancelPendingExtensionMutation.isPending || deleteExtensionMutation.isPending;
                          const isApplyingDisabled = !extensionEligibility.eligible || 
                            allOptionsExhausted ||
                            anyMutationPending;
                          const toggleDisabled = isPendingExtension ? anyMutationPending : isApplyingDisabled;
                          
                          return (
                            <Popover open={openExtensionPopover === player.playerId} onOpenChange={(open) => {
                              setOpenExtensionPopover(open ? player.playerId : null);
                              if (open && extensionEligibility.requiresPPGPricing) {
                                fetchPPGSalary(player.playerId, extensionEligibility.isRookieContract);
                              }
                            }}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <PopoverTrigger asChild>
                                    <div className="flex items-center gap-1">
                                      <Switch
                                        checked={thisPlayerHasExtension}
                                        disabled={toggleDisabled}
                                        className={isPendingExtension ? "data-[state=checked]:bg-amber-500" : ""}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            if (extensionEligibility.eligible && !allOptionsExhausted) {
                                              setOpenExtensionPopover(player.playerId);
                                            }
                                          } else {
                                            if (isPendingExtension && thisPlayerExtension) {
                                              cancelPendingExtensionMutation.mutate(thisPlayerExtension.id);
                                            }
                                          }
                                        }}
                                        data-testid={`switch-extend-${player.playerId}`}
                                      />
                                      {isPendingExtension && thisPlayerExtension && (
                                        <div className="flex gap-0.5">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              confirmExtensionMutation.mutate(thisPlayerExtension.id);
                                            }}
                                            disabled={confirmExtensionMutation.isPending}
                                            title="Confirm extension"
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              cancelPendingExtensionMutation.mutate(thisPlayerExtension.id);
                                            }}
                                            disabled={cancelPendingExtensionMutation.isPending}
                                            title="Cancel pending extension"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {(() => {
                                    const contract = dbContracts.find(c => c.playerId === player.playerId && c.rosterId === userTeam?.rosterId);
                                    const hasBeenExtended = (contract as any)?.hasBeenExtended === 1;
                                    const hasBeenFranchiseTagged = (contract as any)?.hasBeenFranchiseTagged === 1;
                                    
                                    // Determine which extension types are available
                                    const availableTypes: string[] = [];
                                    if (isRookiePlayer) {
                                      if (extensionEligibility.canDo3Year && rookieExtCount < 3) availableTypes.push("3-year");
                                      if (extensionEligibility.canDo4Year && rookieExtCount < 3 && !rookieUsed4Year) availableTypes.push("4-year");
                                    } else {
                                      if (extensionEligibility.canDo1Year && nonRookieExtCount < 2) availableTypes.push("1-year");
                                      if (extensionEligibility.canDo2Year && nonRookieExtCount < 2) availableTypes.push("2-year");
                                      if (extensionEligibility.canDo3Year && nonRookieExtCount < 2) availableTypes.push("3-year");
                                      if (extensionEligibility.canDo4Year && nonRookieExtCount < 2) availableTypes.push("4-year");
                                    }
                                    
                                    let mainText = "";
                                    if (isPendingExtension) {
                                      mainText = `Extension pending (${thisPlayerExtension?.extensionType}-year). Click ✓ to confirm or ✕ to cancel.`;
                                    } else if (isConfirmedExtension) {
                                      mainText = "This player has a confirmed extension.";
                                    } else if (availableTypes.length === 0 && extensionEligibility.eligible) {
                                      if (isRookiePlayer) {
                                        mainText = rookieExtCount >= 3
                                          ? `Team has used all 3 rookie extensions for ${CURRENT_YEAR}`
                                          : `Team has already used their 4-year rookie extension for ${CURRENT_YEAR}`;
                                      } else {
                                        mainText = `Team has already used both non-rookie extensions for ${CURRENT_YEAR} (${nonRookieExtCount}/2)`;
                                      }
                                    } else if (extensionEligibility.eligible) {
                                      const limitInfo = isRookiePlayer 
                                        ? ` (${rookieExtCount}/3 rookie extensions used)`
                                        : ` (${nonRookieExtCount}/2 non-rookie extensions used)`;
                                      mainText = `Click to choose extension type (Available: ${availableTypes.join(", ")})${limitInfo}`;
                                    } else {
                                      mainText = extensionEligibility.reason;
                                    }
                                    
                                    return (
                                      <div>
                                        <p>{mainText}</p>
                                        {(hasBeenExtended || hasBeenFranchiseTagged) && (
                                          <p className="text-xs mt-1 text-muted-foreground">
                                            Extended: {hasBeenExtended ? "Yes" : "No"} | Tagged: {hasBeenFranchiseTagged ? "Yes" : "No"}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                              <PopoverContent className="w-80 p-3" align="end">
                                {isPendingExtension && thisPlayerExtension ? (
                                  <div className="space-y-3">
                                    <div className="text-sm font-medium flex items-center gap-2">
                                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                                      Pending Extension — {player.name}
                                    </div>
                                    <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Type:</span>
                                        <span className="font-medium">{thisPlayerExtension.extensionType}-year extension</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Salary:</span>
                                        <span className="font-medium">${(thisPlayerExtension.extensionSalary / 10).toFixed(1)}M/yr</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Starts:</span>
                                        <span className="font-medium">{thisPlayerExtension.extensionYear}</span>
                                      </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      This extension is pending. The contract has not been modified yet.
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                                        onClick={() => {
                                          confirmExtensionMutation.mutate(thisPlayerExtension.id);
                                          setOpenExtensionPopover(null);
                                        }}
                                        disabled={confirmExtensionMutation.isPending}
                                      >
                                        <Check className="h-4 w-4 mr-1" />
                                        Confirm Extension
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={() => {
                                          cancelPendingExtensionMutation.mutate(thisPlayerExtension.id);
                                          setOpenExtensionPopover(null);
                                        }}
                                        disabled={cancelPendingExtensionMutation.isPending}
                                      >
                                        <X className="h-4 w-4 mr-1" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                <div className="space-y-3">
                                  <div className="text-sm font-medium">Extend {player.name}</div>
                                  <div className="text-xs text-amber-600 font-medium">
                                    {isRookiePlayer ? "Rookie contract" : "Non-rookie contract"} — PPG-based pricing
                                  </div>
                                  <div className="space-y-2">
                                    {(() => {
                                      const ppgInfo = ppgSalaryData[player.playerId];
                                      if (!ppgInfo || ppgInfo.loading) {
                                        return (
                                          <div className="text-xs text-muted-foreground py-2">
                                            Calculating PPG-based salary...
                                          </div>
                                        );
                                      }
                                      if (ppgInfo.error) {
                                        return (
                                          <div className="text-xs text-destructive py-2">
                                            {ppgInfo.error}
                                          </div>
                                        );
                                      }
                                      if (!ppgInfo.data) return null;
                                      const d = ppgInfo.data;
                                      return (
                                        <>
                                          <div className="text-xs space-y-1 bg-muted/50 rounded p-2">
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Adj. PPG:</span>
                                              <span className="font-medium">{d.adjustedPPG.toFixed(1)} ({d.formulaUsed === "recent15" ? "recent 15" : "30-game avg"})</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Position Rank:</span>
                                              <span className="font-medium">#{d.rank} of {d.totalPlayersAtPosition} {d.position}s</span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">Games Used:</span>
                                              <span className="font-medium">{d.gamesUsed}</span>
                                            </div>
                                            {d.neighborAbove && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Above:</span>
                                                <span className="font-medium">{d.neighborAbove.name} (${(d.neighborAbove.salary / 10).toFixed(1)}M)</span>
                                              </div>
                                            )}
                                            {d.neighborBelow && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">Below:</span>
                                                <span className="font-medium">{d.neighborBelow.name} (${(d.neighborBelow.salary / 10).toFixed(1)}M)</span>
                                              </div>
                                            )}
                                            <div className="flex justify-between font-medium border-t pt-1 mt-1">
                                              <span className="text-muted-foreground">Base PPG Salary:</span>
                                              <span>${d.extensionSalaryMillions.toFixed(1)}M</span>
                                            </div>
                                          </div>
                                          {isRookiePlayer ? (
                                            <>
                                              {extensionEligibility.canDo3Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      3,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || rookieExtCount >= 3}
                                                >
                                                  <span>3-Year Extension</span>
                                                  <span className="text-emerald-600 font-medium">${d.extensionSalaryMillions.toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {extensionEligibility.canDo4Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      4,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || rookieExtCount >= 3 || rookieUsed4Year}
                                                >
                                                  <span>4-Year Extension</span>
                                                  <span className="text-emerald-600 font-medium">${d.extensionSalaryMillions.toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {!extensionEligibility.canDo3Year && !extensionEligibility.canDo4Year && (
                                                <div className="text-xs text-muted-foreground italic">
                                                  Extension unavailable (would exceed {CURRENT_YEAR + 4})
                                                </div>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              {extensionEligibility.canDo1Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      1,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || nonRookieExtCount >= 2}
                                                >
                                                  <span>1-Year (80%)</span>
                                                  <span className="text-emerald-600 font-medium">${(d.salary1YearMillions ?? Math.ceil(d.extensionSalaryMillions * 0.8)).toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {extensionEligibility.canDo2Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      2,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || nonRookieExtCount >= 2}
                                                >
                                                  <span>2-Year (90%)</span>
                                                  <span className="text-emerald-600 font-medium">${(d.salary2YearMillions ?? Math.ceil(d.extensionSalaryMillions * 0.9)).toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {extensionEligibility.canDo3Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      3,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || nonRookieExtCount >= 2}
                                                >
                                                  <span>3-Year (100%)</span>
                                                  <span className="text-emerald-600 font-medium">${(d.salary3YearMillions ?? Math.ceil(d.extensionSalaryMillions * 1.0)).toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {extensionEligibility.canDo4Year && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="w-full justify-between"
                                                  onClick={() => {
                                                    handleApplyExtension(
                                                      player.playerId,
                                                      player.name,
                                                      extensionEligibility.extensionYear,
                                                      extensionEligibility.currentSalaryTenths,
                                                      4,
                                                      true,
                                                      d.extensionSalary
                                                    );
                                                    setOpenExtensionPopover(null);
                                                  }}
                                                  disabled={applyExtensionMutation.isPending || nonRookieExtCount >= 2 || extensionEligibility.wouldExceedMaxYearFor4Year}
                                                  title={extensionEligibility.wouldExceedMaxYearFor4Year ? `4-year extension would exceed max contract year (${OPTION_YEAR}). Use 3-year or less.` : undefined}
                                                >
                                                  <span>4-Year (110%)</span>
                                                  <span className="text-emerald-600 font-medium">${(d.salary4YearMillions ?? Math.ceil(d.extensionSalaryMillions * 1.1)).toFixed(0)}M/yr</span>
                                                </Button>
                                              )}
                                              {!extensionEligibility.canDo1Year && !extensionEligibility.canDo2Year && !extensionEligibility.canDo3Year && !extensionEligibility.canDo4Year && (
                                                <div className="text-xs text-muted-foreground italic">
                                                  Extension unavailable (would exceed {CURRENT_YEAR + 4})
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-xs text-muted-foreground border-t pt-2">
                                    {isRookiePlayer
                                      ? `Rookie extensions: ${rookieExtCount}/3 used this season. PPG-based pricing (offseason only).`
                                      : `Non-rookie extensions: ${nonRookieExtCount}/2 used this season. PPG-based pricing (80-110%).`
                                    }
                                  </div>
                                </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </TableCell>
                      
                      {/* Remove Free Agent Column */}
                      <TableCell>
                        {player.isFreeAgent && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveFreeAgent(player.playerId)}
                            data-testid={`button-remove-fa-${player.playerId}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {allHypotheticalPlayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                      No players on this roster
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              <span>Click "Save Draft" to save your contract changes for later. Saved drafts are automatically loaded when you return to this page.</span>
            </p>
            <p className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              <span>Click "Submit for Approval" to send your contracts to the commissioner for review. Once approved, they become official league contracts.</span>
            </p>
            <p className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              <span>Franchise tag adds 1 year at the average of top 5 salaries at that position (rounded up). Each team gets 1 tag per season.</span>
            </p>
            <p className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              <span>Extensions use PPG-based pricing. Non-rookies: 1-year (80%), 2-year (90%), 3-year (100%), 4-year (110%) of adjusted PPG salary. Rookies: 3 or 4-year at full PPG salary (offseason only). Each team gets up to 2 non-rookie and 3 rookie extensions per season.</span>
            </p>
          </div>
        </CardContent>
        )}
      </Card>
    </div>
  );
}

interface PlayerBiddingTabProps {
  userTeam: TeamCapData;
  allPlayers: SleeperPlayerData[];
  rosterPlayerIds: string[];
  teamContracts: Record<string, PlayerContractData>;
  teamCapData: TeamCapData[];
  expiringPlayerIds: Set<string>;
}

function PlayerBiddingTab({ userTeam, allPlayers, rosterPlayerIds, teamContracts, teamCapData, expiringPlayerIds }: PlayerBiddingTabProps) {
  const { league, user, season, isOffseason } = useSleeper();
  const leagueId = league?.leagueId;
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const { toast } = useToast();
  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  // Create mapping from rosterId to teamName for displaying bidding results
  const rosterIdToTeamName = useMemo(() => {
    const map = new Map<number, string>();
    teamCapData.forEach(team => {
      map.set(team.rosterId, team.teamName);
    });
    return map;
  }, [teamCapData]);
  const [freeAgentSearch, setFreeAgentSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<SleeperPlayerData | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [contractYears, setContractYears] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [editingBid, setEditingBid] = useState<PlayerBid | null>(null);
  const [bidCardOpen, setBidCardOpen] = useState(false);
  const [filterPosition, setFilterPosition] = useState<string>("all");
  const [filterNflTeam, setFilterNflTeam] = useState<string>("all");
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);

  const allRosterPlayerIdsSet = useMemo(() => {
    return new Set(rosterPlayerIds);
  }, [rosterPlayerIds]);

  // Contract limits by years remaining: 3 with 4+ years left, 4 with 3 years left, 5 with 2 years left. Rookie contracts have no limit.
  const CONTRACT_LIMITS: Record<number, number> = {
    4: 3,
    3: 4,
    2: 5,
  };

  // Calculate existing contract counts by years remaining (not contract length). Rookie contracts are excluded from limits.
  const existingContractCounts = useMemo(() => {
    const counts: Record<number, number> = { 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const playerId of Object.keys(teamContracts)) {
      const contract = teamContracts[playerId];
      if (!contract) continue;
      if (contract.isRookieContract) continue; // Rookie contracts do not count toward any limit
      
      const salaries = contract.salaries || {};
      const yearsWithSalary = Object.keys(salaries).map(Number).filter((y) => (salaries[y] ?? 0) > 0);
      const lastYearWithSalary = yearsWithSalary.length > 0 ? Math.max(...yearsWithSalary) : CURRENT_YEAR - 1;
      const yearsRemaining = lastYearWithSalary >= CURRENT_YEAR ? lastYearWithSalary - CURRENT_YEAR + (isOffseason ? 0 : 1) : 0;
      const bucket = Math.min(Math.max(yearsRemaining, 0), 4) as 1 | 2 | 3 | 4;
      if (bucket >= 1 && bucket <= 4) counts[bucket]++;
    }
    
    return counts;
  }, [teamContracts, CURRENT_YEAR, isOffseason]);

  // Fetch bidding status
  const { data: biddingStatus, refetch: refetchBiddingStatus } = useQuery<{ isOpen: boolean }>({
    queryKey: ['/api/league', leagueId, 'bidding-status'],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bidding-status`);
      if (!res.ok) throw new Error("Failed to fetch bidding status");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const isBiddingOpen = biddingStatus?.isOpen !== false; // Default to true if not set

  // Fetch all bids (for results view when closed)
  const { data: allBidsByPlayer = {}, isLoading: isLoadingAllBids, refetch: refetchAllBids, error: allBidsError } = useQuery<Record<string, PlayerBid[]>>({
    queryKey: ['/api/league', leagueId, 'bids', 'all', isBiddingOpen], // Include isBiddingOpen in key so query refetches when status changes
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/all`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch all bids: ${res.status}`);
      }
      const data = await res.json();
      console.log('[Bidding Results] Fetched bids:', Object.keys(data).length, 'players');
      return data;
    },
    enabled: !!leagueId && !isBiddingOpen,
    retry: false,
  });

  const { data: bids = [], isLoading, refetch } = useQuery<PlayerBid[]>({
    queryKey: ['/api/league', leagueId, 'bids', userTeam.rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/bids/${userTeam.rosterId}`);
      if (!res.ok) throw new Error("Failed to fetch bids");
      return res.json();
    },
    enabled: !!leagueId && !!userTeam && isBiddingOpen,
  });

  const createBidMutation = useMutation({
    mutationFn: async (data: {
      playerId: string;
      playerName: string;
      playerPosition: string;
      playerTeam: string | null;
      bidAmount: number;
      maxBid: number | null;
      contractYears: number;
      notes: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/league/${leagueId}/bids`, {
        rosterId: userTeam.rosterId,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid placed successfully" });
      refetch();
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to place bid", variant: "destructive" });
    },
  });

  const updateBidMutation = useMutation({
    mutationFn: async (data: { bidId: string; updates: Partial<PlayerBid> }) => {
      const res = await apiRequest("PATCH", `/api/league/${leagueId}/bids/${data.bidId}`, {
        rosterId: userTeam.rosterId,
        ...data.updates,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid updated successfully" });
      refetch();
      setEditingBid(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Failed to update bid", variant: "destructive" });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async (bidId: string) => {
      const res = await apiRequest("DELETE", `/api/league/${leagueId}/bids/${bidId}/${userTeam.rosterId}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bid removed" });
      refetch();
    },
    onError: () => {
      toast({ title: "Failed to remove bid", variant: "destructive" });
    },
  });

  const updateBiddingStatusMutation = useMutation({
    mutationFn: async (isOpen: boolean) => {
      const res = await apiRequest("POST", `/api/league/${leagueId}/bidding-status`, { isOpen });
      return res.json();
    },
    onSuccess: (_, isOpen) => {
      toast({ title: `Bidding ${isOpen ? "opened" : "closed"} successfully` });
      
      // Optimistically update the bidding status immediately so isBiddingOpen updates
      queryClient.setQueryData(
        ['/api/league', leagueId, 'bidding-status'],
        { isOpen }
      );
      
      // Invalidate queries to ensure they refetch with the new status
      queryClient.invalidateQueries({ 
        queryKey: ['/api/league', leagueId, 'bidding-status'] 
      });
      
      // Invalidate all bids query so it refetches when the component re-renders with new isBiddingOpen
      queryClient.invalidateQueries({ 
        queryKey: ['/api/league', leagueId, 'bids', 'all'] 
      });
    },
    onError: (error: any) => {
      console.error("Error updating bidding status:", error);
      toast({ title: "Failed to update bidding status", variant: "destructive", description: error?.message || "An error occurred" });
    },
  });

  const resetForm = () => {
    setSelectedPlayer(null);
    setBidAmount("");
    setContractYears("1");
    setNotes("");
    setFreeAgentSearch("");
  };

  // Favorites query for quick bidding on favorited expiring players
  const { data: favorites = [] } = useQuery<Array<{ id: string; playerId: string }>>({
    queryKey: ['/api/league', leagueId, 'favorites', userTeam.rosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/favorites/${userTeam.rosterId}`);
      if (!res.ok) throw new Error("Failed to fetch favorites");
      return res.json();
    },
    enabled: !!leagueId && !!userTeam,
  });

  const favoritePlayerIds = useMemo(() => new Set(favorites.map(f => f.playerId)), [favorites]);

  // Preferred free agents (trending + expiring not extended); visibility set by commissioner
  const { data: preferredFreeAgentsData, isLoading: isLoadingPreferred } = useQuery<{ visible: boolean; players: Array<{ id: string; name: string; position: string; team: string | null; source?: string; trendingCount?: number }> }>({
    queryKey: ["/api/league", leagueId, "preferred-free-agents"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/preferred-free-agents`);
      if (!res.ok) throw new Error("Failed to fetch preferred free agents");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const setPreferredVisibilityMutation = useMutation({
    mutationFn: async (visible: boolean) => {
      const res = await apiRequest("POST", `/api/league/${leagueId}/preferred-free-agents-visibility`, { userId: user?.userId, visible });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "preferred-free-agents"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update visibility", variant: "destructive", description: error.message });
    },
  });

  const preferredFreeAgentsFiltered = useMemo(() => {
    if (!preferredFreeAgentsData?.visible || !preferredFreeAgentsData.players?.length) return [];
    const bidded = new Set(bids.map(b => b.playerId));
    return preferredFreeAgentsData.players.filter(
      p => !allRosterPlayerIdsSet.has(p.id) && !bidded.has(p.id)
    );
  }, [preferredFreeAgentsData, bids, allRosterPlayerIdsSet]);

  const favoriteFreeAgents = useMemo(() => {
    if (!favorites.length) return [];
    const biddedPlayerIds = new Set(bids.map(b => b.playerId));
    return favorites
      .map(fav => allPlayers.find(p => p.id === fav.playerId))
      .filter((p): p is SleeperPlayerData =>
        !!p &&
        (!allRosterPlayerIdsSet.has(p.id) || expiringPlayerIds.has(p.id)) &&
        !biddedPlayerIds.has(p.id)
      );
  }, [favorites, allPlayers, allRosterPlayerIdsSet, bids, expiringPlayerIds]);

  const nflTeams = useMemo(() => {
    const teams = new Set<string>();
    allPlayers.forEach(p => {
      if (p.team && ["QB", "RB", "WR", "TE", "K"].includes(p.position)) {
        teams.add(p.team);
      }
    });
    return Array.from(teams).sort();
  }, [allPlayers]);

  const freeAgentResults = useMemo(() => {
    const hasSearch = freeAgentSearch.trim().length >= 2;
    const showingFavoritesOnly = filterFavoritesOnly && !hasSearch;

    if (!hasSearch && !filterFavoritesOnly) return [];

    const searchLower = freeAgentSearch.toLowerCase();
    const biddedPlayerIds = new Set(bids.map(b => b.playerId));

    return allPlayers
      .filter(player => {
        if (!player.name || !player.position) return false;
        if (!player.team) return false;
        if (!["QB", "RB", "WR", "TE", "K"].includes(player.position)) return false;
        if (allRosterPlayerIdsSet.has(player.id) && !expiringPlayerIds.has(player.id)) return false;
        if (biddedPlayerIds.has(player.id)) return false;
        if (hasSearch && !player.name.toLowerCase().includes(searchLower)) return false;
        if (filterPosition !== "all" && player.position !== filterPosition) return false;
        if (filterNflTeam !== "all" && player.team !== filterNflTeam) return false;
        if (filterFavoritesOnly && !favoritePlayerIds.has(player.id)) return false;
        return true;
      })
      .slice(0, showingFavoritesOnly ? 50 : 10);
  }, [freeAgentSearch, allPlayers, allRosterPlayerIdsSet, bids, filterPosition, filterNflTeam, filterFavoritesOnly, favoritePlayerIds, expiringPlayerIds]);

  const handleSubmitBid = () => {
    if (!selectedPlayer || !bidAmount) return;

    const isRookieBid = contractYears === "R";
    const bidData = {
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      playerPosition: selectedPlayer.position,
      playerTeam: selectedPlayer.team || null,
      bidAmount: parseInt(bidAmount),
      maxBid: null,
      contractYears: isRookieBid ? 3 : parseInt(contractYears),
      isRookieContract: isRookieBid ? 1 : 0,
      notes: notes || null,
    };

    if (editingBid) {
      updateBidMutation.mutate({ bidId: editingBid.id, updates: bidData });
    } else {
      createBidMutation.mutate(bidData);
    }
  };

  const handleEditBid = (bid: PlayerBid) => {
    setEditingBid(bid);
    setSelectedPlayer({
      id: bid.playerId,
      name: bid.playerName,
      position: bid.playerPosition,
      team: bid.playerTeam,
    });
    setBidAmount(bid.bidAmount.toString());
    // Check if this is a rookie bid (contractYears = 3 and isRookieContract flag)
    const isRookieBid = bid.contractYears === 3 && (bid as any).isRookieContract === 1;
    setContractYears(isRookieBid ? "R" : bid.contractYears.toString());
    setNotes(bid.notes || "");
  };

  const handleCancelEdit = () => {
    setEditingBid(null);
    resetForm();
  };

  const activeBids = bids.filter(b => b.status === "active");

  const capProjection = useMemo(() => {
    const seasonYear = parseInt(league?.season || "") || new Date().getFullYear();
    const years = [seasonYear, seasonYear + 1, seasonYear + 2, seasonYear + 3];
    return years.map(year => {
      const existingSalary = Object.values(teamContracts).reduce(
        (sum, c) => sum + (c.salaries[year] || 0), 0
      );
      const bidSalary = activeBids.reduce((sum, b) => {
        const bidStartYear = seasonYear + 1;
        const bidEndYear = bidStartYear + b.contractYears - 1;
        return sum + (year >= bidStartYear && year <= bidEndYear ? b.bidAmount : 0);
      }, 0);
      return { year, existingSalary, bidSalary, total: existingSalary + bidSalary };
    });
  }, [teamContracts, activeBids, league?.season]);

  // Count active bids by contract years. Rookie bids are not counted toward any limit.
  const bidContractCounts = useMemo(() => {
    const counts: Record<number, number> = { 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const bid of activeBids) {
      if (bid.contractYears === 3 && (bid as any).isRookieContract === 1) continue; // Rookie bids have no limit
      if (bid.contractYears >= 1 && bid.contractYears <= 4) counts[bid.contractYears as keyof typeof counts]++;
    }
    return counts;
  }, [activeBids]);

  // Calculate remaining slots by years (2, 3, 4). Rookie (R) has no limit.
  const remainingSlots = useMemo(() => {
    return {
      4: Math.max(0, CONTRACT_LIMITS[4] - existingContractCounts[4] - bidContractCounts[4]),
      3: Math.max(0, CONTRACT_LIMITS[3] - existingContractCounts[3] - bidContractCounts[3]),
      2: Math.max(0, CONTRACT_LIMITS[2] - existingContractCounts[2] - bidContractCounts[2]),
    };
  }, [existingContractCounts, bidContractCounts]);

  // Check if selected contract years would exceed limit. Rookie (R) and 1-year have no limit.
  const isContractYearDisabled = (years: number | "R"): boolean => {
    if (years === 1 || years === "R") return false;
    const limit = CONTRACT_LIMITS[years as number];
    if (!limit) return false;
    const existing = existingContractCounts[years as number] || 0;
    const bidsCount = bidContractCounts[years as number] || 0;
    const adjustedBidsCount = editingBid && editingBid.contractYears === years ? bidsCount - 1 : bidsCount;
    return (existing + adjustedBidsCount) >= limit;
  };

  return (
    <div className="space-y-6">
      {isCommissioner && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Player Bidding Status</Label>
                <p className="text-sm text-muted-foreground">
                  {isBiddingOpen ? "Bidding is currently open" : "Bidding is closed - viewing results"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${isBiddingOpen ? "text-muted-foreground" : "text-foreground"}`}>
                  Closed
                </span>
                <Switch
                  checked={isBiddingOpen}
                  onCheckedChange={(checked) => {
                    updateBiddingStatusMutation.mutate(checked);
                  }}
                  disabled={updateBiddingStatusMutation.isPending}
                />
                <span className={`text-sm font-medium ${isBiddingOpen ? "text-foreground" : "text-muted-foreground"}`}>
                  Open
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(preferredFreeAgentsData?.visible || (isCommissioner && preferredFreeAgentsData !== undefined)) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Preferred Free Agents</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {preferredFreeAgentsData?.visible
                    ? "Top 30 trending (Sleeper) + last season's expiring contracts not extended."
                    : "Hidden from the league. Turn on to show preferred free agents."}
                </p>
              </div>
              {isCommissioner && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="preferred-fa-visibility" className="text-sm text-muted-foreground whitespace-nowrap">
                    Show to league
                  </Label>
                  <Switch
                    id="preferred-fa-visibility"
                    checked={preferredFreeAgentsData?.visible !== false}
                    onCheckedChange={(checked) => setPreferredVisibilityMutation.mutate(checked)}
                    disabled={setPreferredVisibilityMutation.isPending}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          {preferredFreeAgentsData?.visible && (
            <CardContent>
              {isLoadingPreferred ? (
                <p className="text-sm text-muted-foreground py-4">Loading preferred free agents…</p>
              ) : preferredFreeAgentsFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No preferred free agents right now.</p>
              ) : (
                <div className="border rounded-md max-h-64 overflow-auto">
                  {preferredFreeAgentsFiltered.map((p) => (
                    <div
                      key={p.id}
                      className="p-2.5 hover:bg-muted/50 cursor-pointer flex items-center justify-between border-b last:border-b-0"
                      onClick={() => {
                        setSelectedPlayer({ id: p.id, name: p.name, position: p.position, team: p.team });
                        setBidCardOpen(true);
                      }}
                      data-testid={`preferred-fa-${p.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://sleepercdn.com/content/nfl/players/${p.id}.jpg`}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover bg-muted"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        <Badge className={`${positionColors[p.position] || "bg-gray-500"} text-[10px] px-1.5 py-0`}>
                          {p.position}
                        </Badge>
                        <span className="font-medium text-sm">{p.name}</span>
                        {p.source === "trending" && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Trending</Badge>
                        )}
                        {p.source === "expiring" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Expired</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{p.team || "FA"}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {isBiddingOpen ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {activeBids.length}
                  </div>
                  <p className="text-sm text-muted-foreground">Active Bids</p>
                </div>
              </CardContent>
            </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                ${activeBids.reduce((sum, b) => sum + (b.bidAmount * b.contractYears), 0).toFixed(1)}M
              </div>
              <p className="text-sm text-muted-foreground">Total Contract Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-muted-foreground">
                {userTeam.teamName}
              </div>
              <p className="text-sm text-muted-foreground">Your Team</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Contract Limits by Years Left (Existing + Pending Bids)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className={`text-lg font-bold ${remainingSlots[4] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[4] + bidContractCounts[4]}/{CONTRACT_LIMITS[4]}
              </div>
              <p className="text-xs text-muted-foreground">4+ Years Left</p>
            </div>
            <div>
              <div className={`text-lg font-bold ${remainingSlots[3] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[3] + bidContractCounts[3]}/{CONTRACT_LIMITS[3]}
              </div>
              <p className="text-xs text-muted-foreground">3 Years Left</p>
            </div>
            <div>
              <div className="text-lg font-bold text-foreground">—</div>
              <p className="text-xs text-muted-foreground">Rookie (R) — No limit</p>
            </div>
            <div>
              <div className={`text-lg font-bold ${remainingSlots[2] === 0 ? 'text-destructive' : 'text-foreground'}`}>
                {existingContractCounts[2] + bidContractCounts[2]}/{CONTRACT_LIMITS[2]}
              </div>
              <p className="text-xs text-muted-foreground">2 Years Left</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={bidCardOpen} onOpenChange={setBidCardOpen}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DialogTrigger asChild>
          <Card className="cursor-pointer select-none hover:bg-muted/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                {editingBid ? "Edit Bid" : "Place New Bid"}
                <span className="ml-auto text-xs text-muted-foreground font-normal">Click to open</span>
              </CardTitle>
            </CardHeader>
          </Card>
        </DialogTrigger>

        <DialogContent className="max-w-[95vw] w-full h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {editingBid ? "Edit Bid" : "Place New Bid"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {!selectedPlayer ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Select value={filterPosition} onValueChange={setFilterPosition}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Pos</SelectItem>
                      <SelectItem value="QB">QB</SelectItem>
                      <SelectItem value="RB">RB</SelectItem>
                      <SelectItem value="WR">WR</SelectItem>
                      <SelectItem value="TE">TE</SelectItem>
                      <SelectItem value="K">K</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterNflTeam} onValueChange={setFilterNflTeam}>
                    <SelectTrigger className="w-[110px] h-8 text-xs">
                      <SelectValue placeholder="NFL Team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Teams</SelectItem>
                      {nflTeams.map(team => (
                        <SelectItem key={team} value={team}>{team}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant={filterFavoritesOnly ? "default" : "outline"}
                    className="h-8 px-2 text-xs gap-1"
                    onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
                  >
                    <Star className={`w-3.5 h-3.5 ${filterFavoritesOnly ? "fill-yellow-400 text-yellow-400" : ""}`} />
                    Favorites
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search for a player..."
                      value={freeAgentSearch}
                      onChange={(e) => setFreeAgentSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                      data-testid="input-bid-search"
                    />
                  </div>
                  {freeAgentResults.length > 0 && (
                    <div className="border rounded-md max-h-60 overflow-auto">
                      {freeAgentResults.map(player => (
                        <div
                          key={player.id}
                          className="p-2.5 hover-elevate cursor-pointer flex items-center justify-between border-b last:border-b-0"
                          onClick={() => {
                            setSelectedPlayer(player);
                            setFreeAgentSearch("");
                          }}
                          data-testid={`player-option-${player.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {favoritePlayerIds.has(player.id) && (
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                            )}
                            <Badge className={`${positionColors[player.position] || "bg-gray-500"} text-[10px] px-1.5 py-0`}>
                              {player.position}
                            </Badge>
                            <span className="font-medium text-sm">{player.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {player.team || "FA"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {freeAgentResults.length === 0 && filterFavoritesOnly && !freeAgentSearch.trim() && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No favorited free agents available. Star players on the Expiring tab.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <Badge className={positionColors[selectedPlayer.position] || "bg-gray-500"}>
                      {selectedPlayer.position}
                    </Badge>
                    <span className="font-medium">{selectedPlayer.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {selectedPlayer.team || "FA"}
                    </span>
                  </div>
                  {!editingBid && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedPlayer(null)}
                      data-testid="button-clear-player"
                    >
                      Change
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Bid Amount Per Year ($M)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g., 15"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    data-testid="input-bid-amount"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Contract Length (Years)</Label>
                  <Select value={contractYears} onValueChange={setContractYears}>
                    <SelectTrigger data-testid="select-contract-years">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Year (No limit)</SelectItem>
                      <SelectItem value="2" disabled={isContractYearDisabled(2)}>
                        2 Years ({remainingSlots[2]}/{CONTRACT_LIMITS[2]} remaining)
                      </SelectItem>
                      <SelectItem value="3" disabled={isContractYearDisabled(3)}>
                        3 Years ({remainingSlots[3]}/{CONTRACT_LIMITS[3]} remaining)
                      </SelectItem>
                      <SelectItem value="4" disabled={isContractYearDisabled(4)}>
                        4 Years ({remainingSlots[4]}/{CONTRACT_LIMITS[4]} remaining)
                      </SelectItem>
                      <SelectItem value="R" disabled={isContractYearDisabled("R")}>
                        Rookie (R) (No limit)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Limits by years left: 3 with 4+ years left, 4 with 3 years left, 5 with 2 years left. Rookie contracts unlimited.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input
                    placeholder="Optional notes for this bid..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="input-bid-notes"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubmitBid}
                    disabled={!bidAmount || createBidMutation.isPending || updateBidMutation.isPending}
                    className="flex-1"
                    data-testid="button-submit-bid"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {editingBid ? "Update Bid" : "Place Bid"}
                  </Button>
                  {editingBid && (
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs">
                <DollarSign className="w-3.5 h-3.5" />
                Cap Projection (If All Bids Win)
              </Label>
              <svg width={0} height={0} style={{ position: "absolute" }}>
                <defs>
                  <pattern id="diagonalGreen" patternUnits="userSpaceOnUse" width={8} height={8}>
                    <rect width={8} height={8} fill="#22c55e" />
                    <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#16a34a" strokeWidth={2} />
                  </pattern>
                  <pattern id="diagonalRed" patternUnits="userSpaceOnUse" width={8} height={8}>
                    <rect width={8} height={8} fill="#ef4444" />
                    <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#dc2626" strokeWidth={2} />
                  </pattern>
                </defs>
              </svg>
              <div className="border rounded-md p-2">
                <ResponsiveContainer width="100%" height={200}>
                  <RechartsBarChart data={capProjection} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}M`} width={55} domain={[0, (dataMax: number) => Math.max(dataMax, TOTAL_CAP + 10)]} />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [`$${value.toFixed(1)}M`, name === "existingSalary" ? "Committed" : "Bids"]}
                      labelFormatter={(label: string) => `Year: ${label}`}
                    />
                    <ReferenceLine y={TOTAL_CAP} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={2} label={{ value: `Cap: $${TOTAL_CAP}M`, position: "right", fontSize: 10, fill: "#ef4444" }} />
                    <Bar dataKey="existingSalary" stackId="cap" name="Committed" radius={[0, 0, 0, 0]}>
                      {capProjection.map((row, index) => (
                        <Cell key={`committed-${index}`} fill={row.total > TOTAL_CAP ? "#ef4444" : "#22c55e"} />
                      ))}
                    </Bar>
                    <Bar dataKey="bidSalary" stackId="cap" name="Bids" radius={[4, 4, 0, 0]}>
                      {capProjection.map((row, index) => (
                        <Cell key={`bids-${index}`} fill={row.total > TOTAL_CAP ? "url(#diagonalRed)" : "url(#diagonalGreen)"} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
                    <span>Committed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg width={12} height={12} className="rounded-sm">
                      <rect width={12} height={12} fill="url(#diagonalGreen)" />
                    </svg>
                    <span>Bids</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5" style={{ backgroundColor: "#ef4444" }} />
                    <span>Salary Cap</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                    <span>Over Cap</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Your Bids
              <Badge variant="secondary" className="ml-auto">
                Private to your team
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading bids...</div>
            ) : activeBids.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No active bids yet.</p>
                <p className="text-sm mt-1">Search for free agents to place your first bid.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {activeBids.map((bid) => (
                    <div
                      key={bid.id}
                      className="p-3 border rounded-md space-y-2"
                      data-testid={`bid-card-${bid.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={positionColors[bid.playerPosition] || "bg-gray-500"}>
                            {bid.playerPosition}
                          </Badge>
                          <span className="font-medium">{bid.playerName}</span>
                          <span className="text-sm text-muted-foreground">
                            {bid.playerTeam || "FA"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditBid(bid)}
                            data-testid={`button-edit-bid-${bid.id}`}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteBidMutation.mutate(bid.id)}
                            data-testid={`button-delete-bid-${bid.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Per Year:</span>{" "}
                          <span className="font-medium">${bid.bidAmount}M</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Years:</span>{" "}
                          <span className="font-medium">{bid.contractYears}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Value:</span>{" "}
                          <span className="font-medium" style={{ color: COLORS.salaries }}>
                            ${bid.bidAmount * bid.contractYears}M
                          </span>
                        </div>
                      </div>
                      {bid.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          {bid.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
      </Dialog>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  Your bids are private and only visible to you. Other teams cannot see your bid amounts or target players.
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Bidding Results</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingAllBids ? (
              <div className="text-center py-8 text-muted-foreground">Loading results...</div>
            ) : allBidsError ? (
              <div className="text-center py-8">
                <p className="text-destructive font-medium">Error loading results</p>
                <p className="text-sm text-muted-foreground mt-2">{(allBidsError as Error).message}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={() => refetchAllBids()}
                >
                  Retry
                </Button>
              </div>
            ) : !allBidsByPlayer || Object.keys(allBidsByPlayer).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No bids found. {isBiddingOpen ? "Bidding is still open. Close bidding to view results." : "There are no bids in the system."}
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Winning Team</TableHead>
                      <TableHead>Winning Bid</TableHead>
                      <TableHead>2nd Highest</TableHead>
                      <TableHead>3rd Highest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(allBidsByPlayer).map(([playerId, bids]) => {
                      const sortedBids = [...bids].sort((a, b) => {
                        const totalA = a.bidAmount * a.contractYears;
                        const totalB = b.bidAmount * b.contractYears;
                        // Primary sort: total value (descending)
                        if (totalA !== totalB) {
                          return totalB - totalA;
                        }
                        // Tiebreaker: per-year value (descending) - higher per-year wins
                        return b.bidAmount - a.bidAmount;
                      });
                      const winningBid = sortedBids[0];
                      const secondBid = sortedBids[1];
                      const thirdBid = sortedBids[2];
                      const player = allPlayers.find(p => p.id === playerId);
                      
                      return (
                        <TableRow key={playerId}>
                          <TableCell className="font-medium">{winningBid.playerName}</TableCell>
                          <TableCell>{winningBid.playerPosition}</TableCell>
                          <TableCell>
                            {winningBid.rosterId ? (rosterIdToTeamName.get(winningBid.rosterId) || `Team ${winningBid.rosterId}`) : "N/A"}
                          </TableCell>
                          <TableCell>
                            ${winningBid.bidAmount}M × {winningBid.contractYears}yr = ${(winningBid.bidAmount * winningBid.contractYears).toFixed(1)}M
                          </TableCell>
                          <TableCell>
                            {secondBid ? `$${secondBid.bidAmount}M × ${secondBid.contractYears}yr = $${(secondBid.bidAmount * secondBid.contractYears).toFixed(1)}M` : "—"}
                          </TableCell>
                          <TableCell>
                            {thirdBid ? `$${thirdBid.bidAmount}M × ${thirdBid.contractYears}yr = $${(thirdBid.bidAmount * thirdBid.contractYears).toFixed(1)}M` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Box Plot Component for displaying quartile distributions
interface BoxPlotProps {
  position: string;
  boxPlot: {
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    outliers: number[];
  };
  width?: number;
  height?: number;
}

function BoxPlot({ position, boxPlot, width = 400, height = 200 }: BoxPlotProps) {
  const padding = 40;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  
  // Scale values to plot coordinates
  const range = boxPlot.max - boxPlot.min || 1;
  const scale = (value: number) => {
    return padding + ((value - boxPlot.min) / range) * plotWidth;
  };
  
  const q1X = scale(boxPlot.q1);
  const medianX = scale(boxPlot.median);
  const q3X = scale(boxPlot.q3);
  const minX = scale(boxPlot.min);
  const maxX = scale(boxPlot.max);
  const centerY = padding + plotHeight / 2;
  const boxHeight = 60;
  
  return (
    <div className="w-full">
      <div className="text-sm font-medium mb-2">{position}</div>
      <svg width={width} height={height} className="border rounded-md bg-background">
        {/* Bottom whisker (Min to Q1) */}
        <line
          x1={minX}
          y1={centerY - boxHeight / 2}
          x2={minX}
          y2={centerY + boxHeight / 2}
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1={minX}
          y1={centerY}
          x2={q1X}
          y2={centerY}
          stroke="currentColor"
          strokeWidth="2"
        />
        
        {/* Main box (Q1 to Q3) - interquartile range */}
        <rect
          x={q1X}
          y={centerY - boxHeight / 2}
          width={q3X - q1X}
          height={boxHeight}
          fill="hsl(var(--muted))"
          stroke="currentColor"
          strokeWidth="2"
        />
        
        {/* Median line */}
        <line
          x1={medianX}
          y1={centerY - boxHeight / 2}
          x2={medianX}
          y2={centerY + boxHeight / 2}
          stroke="currentColor"
          strokeWidth="3"
        />
        
        {/* Top whisker (Q3 to Max) */}
        <line
          x1={maxX}
          y1={centerY - boxHeight / 2}
          x2={maxX}
          y2={centerY + boxHeight / 2}
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1={q3X}
          y1={centerY}
          x2={maxX}
          y2={centerY}
          stroke="currentColor"
          strokeWidth="2"
        />
        
        {/* Quartile sections colored */}
        {/* Q4 (Min to Q1) - Red */}
        <rect
          x={minX}
          y={centerY - boxHeight / 2}
          width={q1X - minX}
          height={boxHeight}
          fill="#ef4444"
          opacity={0.3}
        />
        {/* Q3 (Q1 to Median) - Orange */}
        <rect
          x={q1X}
          y={centerY - boxHeight / 2}
          width={medianX - q1X}
          height={boxHeight}
          fill="#f97316"
          opacity={0.3}
        />
        {/* Q2 (Median to Q3) - Yellow */}
        <rect
          x={medianX}
          y={centerY - boxHeight / 2}
          width={q3X - medianX}
          height={boxHeight}
          fill="#fbbf24"
          opacity={0.3}
        />
        {/* Q1 (Q3 to Max) - Green */}
        <rect
          x={q3X}
          y={centerY - boxHeight / 2}
          width={maxX - q3X}
          height={boxHeight}
          fill="#22c55e"
          opacity={0.3}
        />
        
        {/* Redraw box outline on top */}
        <rect
          x={q1X}
          y={centerY - boxHeight / 2}
          width={q3X - q1X}
          height={boxHeight}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1={medianX}
          y1={centerY - boxHeight / 2}
          x2={medianX}
          y2={centerY + boxHeight / 2}
          stroke="currentColor"
          strokeWidth="3"
        />
        
        {/* Labels */}
        <text 
          x={minX} 
          y={centerY + boxHeight / 2 + 20} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))"
          fontSize="12"
        >
          {boxPlot.min.toFixed(1)}
        </text>
        <text 
          x={q1X} 
          y={centerY + boxHeight / 2 + 20} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))"
          fontSize="12"
        >
          Q1: {boxPlot.q1.toFixed(1)}
        </text>
        <text 
          x={medianX} 
          y={centerY - boxHeight / 2 - 10} 
          textAnchor="middle" 
          fill="hsl(var(--foreground))"
          fontSize="12"
          fontWeight="500"
        >
          Median: {boxPlot.median.toFixed(1)}
        </text>
        <text 
          x={q3X} 
          y={centerY + boxHeight / 2 + 20} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))"
          fontSize="12"
        >
          Q3: {boxPlot.q3.toFixed(1)}
        </text>
        <text 
          x={maxX} 
          y={centerY + boxHeight / 2 + 20} 
          textAnchor="middle" 
          fill="hsl(var(--muted-foreground))"
          fontSize="12"
        >
          {boxPlot.max.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

interface PlayerRankingsTabProps {
  leagueId: string;
}

interface PlayerRankingData {
  season: string;
  positions: Record<string, {
    players: Array<{
      playerId: string;
      name: string;
      team: string;
      adjustedPPG: number;
      gamesUsed: number;
      quartile: 1 | 2 | 3 | 4;
      value: string;
    }>;
    boxPlot: {
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      outliers: number[];
    };
  }>;
}

function PlayerRankingsTab({ leagueId }: PlayerRankingsTabProps) {
  const { data: rankingsData, isLoading, error } = useQuery<PlayerRankingData>({
    queryKey: ["/api/sleeper/league", leagueId, "player-rankings"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/player-rankings`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Player rankings API error:", errorText);
        throw new Error(`Failed to fetch player rankings: ${res.status} ${errorText}`);
      }
      const data = await res.json();
      console.log("Player rankings data received:", data);
      return data;
    },
    enabled: !!leagueId,
  });

  const quartileColors: Record<1 | 2 | 3 | 4, string> = {
    1: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    2: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
    3: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
    4: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30",
  };

  const positionOrder = ["QB", "RB", "WR", "TE", "K", "DEF"];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading player rankings...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Player Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error instanceof Error ? error.message : "Failed to fetch player rankings"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!rankingsData || !rankingsData.positions || Object.keys(rankingsData.positions).length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Player Rankings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No player rankings data available. This may be because no players have scored points yet this season.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Player Rankings - {rankingsData.season} Season</CardTitle>
          <p className="text-sm text-muted-foreground">
            Box and whisker plots showing adjusted PPG distributions by position (30-game, 2-season formula). Players are assigned quartile values (Q1-Q4) based on their adjusted PPG.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {positionOrder.map((position) => {
              const positionData = rankingsData.positions[position];
              if (!positionData) return null;
              
              return (
                <Card key={position}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{position}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BoxPlot position={position} boxPlot={positionData.boxPlot} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Player Rankings by Position</CardTitle>
          <p className="text-sm text-muted-foreground">
            All players grouped by position with quartile assignments. Q1 = Top 25%, Q2 = 25-50%, Q3 = 50-75%, Q4 = Bottom 25%.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={positionOrder[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              {positionOrder.map((pos) => (
                <TabsTrigger key={pos} value={pos} disabled={!rankingsData.positions[pos]}>
                  {pos}
                </TabsTrigger>
              ))}
            </TabsList>
            {positionOrder.map((position) => {
              const positionData = rankingsData.positions[position];
              if (!positionData) return null;
              
              return (
                <TabsContent key={position} value={position} className="mt-4">
                  <ScrollArea className="h-[600px] w-full rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-right">Adj. PPG</TableHead>
                          <TableHead className="text-center">Quartile</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionData.players.map((player) => (
                          <TableRow key={player.playerId}>
                            <TableCell className="font-medium">{player.name}</TableCell>
                            <TableCell>{player.team || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {player.adjustedPPG.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={quartileColors[player.quartile]}>
                                {player.value}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface ExpiringContractsTabProps {
  teams: TeamCapData[];
  playerMap: PlayerMap;
  contractData: ContractDataStore;
  leagueUsers: any[];
  deadCapEnabled?: boolean;
  leagueId?: string;
  userRosterId?: number;
}

interface ExpiringPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  yearsExp: number;
  currentSalary: number;
  teamName: string;
  ownerName: string;
  avatar: string | null;
  rosterId: number;
}

function ExpiringContractsTab({ teams, playerMap, contractData, leagueUsers, deadCapEnabled = true, leagueId, userRosterId }: ExpiringContractsTabProps) {
  const { season } = useSleeper();
  const { toast } = useToast();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();

  // Favorites query
  const { data: favorites = [] } = useQuery<Array<{ id: string; playerId: string }>>({
    queryKey: ['/api/league', leagueId, 'favorites', userRosterId],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/favorites/${userRosterId}`);
      if (!res.ok) throw new Error("Failed to fetch favorites");
      return res.json();
    },
    enabled: !!leagueId && !!userRosterId,
  });

  const favoritePlayerIds = useMemo(() => new Set(favorites.map(f => f.playerId)), [favorites]);

  const addFavoriteMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await apiRequest("POST", `/api/league/${leagueId}/favorites`, {
        rosterId: userRosterId,
        playerId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'favorites', userRosterId] });
    },
    onError: () => {
      toast({ title: "Failed to add favorite", variant: "destructive" });
    },
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (playerId: string) => {
      const res = await apiRequest("DELETE", `/api/league/${leagueId}/favorites/${playerId}/${userRosterId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/league', leagueId, 'favorites', userRosterId] });
    },
    onError: () => {
      toast({ title: "Failed to remove favorite", variant: "destructive" });
    },
  });

  const toggleFavorite = (playerId: string) => {
    if (favoritePlayerIds.has(playerId)) {
      removeFavoriteMutation.mutate(playerId);
    } else {
      addFavoriteMutation.mutate(playerId);
    }
  };
  
  // Build a map of playerId -> team info for roster players
  const playerTeamMap = useMemo(() => {
    const map = new Map<string, { teamName: string; ownerName: string; avatar: string | null; rosterId: number }>();
    for (const team of teams) {
      for (const playerId of team.players) {
        map.set(playerId, {
          teamName: team.teamName,
          ownerName: team.ownerName,
          avatar: team.avatar,
          rosterId: team.rosterId,
        });
      }
    }
    return map;
  }, [teams]);

  const expiringPlayers = useMemo(() => {
    const players: ExpiringPlayer[] = [];
    
    // Iterate over ALL contracts in the database
    for (const rosterId of Object.keys(contractData)) {
      const teamContracts = contractData[rosterId];
      const team = teams.find(t => t.rosterId.toString() === rosterId);
      
      for (const playerId of Object.keys(teamContracts)) {
        const player = playerMap[playerId];
        if (!player) continue;
        
        const contract = teamContracts[playerId];
        if (!contract) continue;
        
        // Check if player is on current roster (either this team or any team)
        const playerTeam = playerTeamMap.get(playerId);
        if (!playerTeam) continue; // Player not on any roster
        
        const salaryCurrent = contract.salaries[CURRENT_YEAR] || 0;
        const salaryEntries = Object.entries(contract.salaries || {})
          .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
          .filter(entry => !isNaN(entry.year) && entry.value > 0);
        const lastPaidYear = salaryEntries.length > 0
          ? Math.max(...salaryEntries.map(entry => entry.year))
          : 0;
        
        // Player is expiring if their last paid year is the current year
        if (lastPaidYear === CURRENT_YEAR && salaryCurrent > 0) {
          players.push({
            playerId,
            name: player.name,
            position: player.position || "NA",
            nflTeam: player.team || null,
            yearsExp: player.yearsExp ?? 0,
            currentSalary: salaryCurrent,
            teamName: playerTeam.teamName,
            ownerName: playerTeam.ownerName,
            avatar: playerTeam.avatar,
            rosterId: playerTeam.rosterId,
          });
        }
      }
    }
    
    return players.sort((a, b) => b.currentSalary - a.currentSalary);
  }, [teams, playerMap, contractData, playerTeamMap]);

  const totalExpiringValue = expiringPlayers.reduce((sum, p) => sum + p.currentSalary, 0);
  const positionCounts = expiringPlayers.reduce((acc, p) => {
    acc[p.position] = (acc[p.position] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-500">
                {expiringPlayers.length}
              </div>
              <p className="text-sm text-muted-foreground">Expiring Contracts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                ${totalExpiringValue.toFixed(1)}M
              </div>
              <p className="text-sm text-muted-foreground">Total Expiring Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="flex justify-center gap-2 flex-wrap">
                {Object.entries(positionCounts).map(([pos, count]) => (
                  <Badge key={pos} className={`${positionColors[pos] || "bg-gray-500 text-white"}`}>
                    {pos}: {count}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-2">By Position</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Players in Final Contract Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  {!!userRosterId && <TableHead className="w-[40px]"></TableHead>}
                  <TableHead className="w-[180px]">Player</TableHead>
                  <TableHead className="text-center w-[60px]">Pos</TableHead>
                  <TableHead className="text-center w-[60px]">NFL</TableHead>
                  <TableHead className="text-center w-[60px]">Exp</TableHead>
                  <TableHead className="text-right w-[100px]">{CURRENT_YEAR} Salary</TableHead>
                  <TableHead className="text-right w-[100px]">Dead Cap</TableHead>
                  <TableHead className="w-[180px]">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringPlayers.map((player) => {
                  const deadCap = deadCapEnabled ? Math.ceil(player.currentSalary * 0.5) : 0;
                  
                  return (
                    <TableRow key={`${player.rosterId}-${player.playerId}`} data-testid={`row-expiring-${player.playerId}`}>
                      {!!userRosterId && (
                        <TableCell className="px-2">
                          <button
                            onClick={() => toggleFavorite(player.playerId)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title={favoritePlayerIds.has(player.playerId) ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                favoritePlayerIds.has(player.playerId)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground"
                              }`}
                            />
                          </button>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${player.playerId}.jpg`}
                              alt={player.name}
                            />
                            <AvatarFallback className="text-xs">
                              {player.name.split(" ").map(n => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{player.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${positionColors[player.position] || "bg-gray-500 text-white"} text-[10px] px-1.5 py-0`}>
                          {player.position}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium">
                          {player.nflTeam || "FA"}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm tabular-nums">
                          {player.yearsExp === 0 ? "R" : player.yearsExp}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium tabular-nums" style={{ color: COLORS.salaries }}>
                          ${player.currentSalary.toFixed(1)}M
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm tabular-nums" style={{ color: deadCapEnabled ? COLORS.deadCap : "inherit" }}>
                          ${deadCap.toFixed(1)}M
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {player.avatar ? (
                              <AvatarImage src={`https://sleepercdn.com/avatars/thumbs/${player.avatar}`} />
                            ) : null}
                            <AvatarFallback className="text-[8px]">
                              {player.teamName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{player.teamName}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {expiringPlayers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={userRosterId ? 8 : 7} className="text-center text-muted-foreground py-8">
                      No players with expiring contracts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span>Players shown have salary for {CURRENT_YEAR} only, with no contract beyond this season.</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface DbPlayerContract {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  salaries: string;
  fifthYearOption: string | null;
  isOnIr: number;
  franchiseTagUsed: number;
  franchiseTagYear: number | null;
  originalContractYears: number;
  isRookieContract: number;
  extensionApplied: number;
  extensionYear: number | null;
  extensionSalary: number | null;
  updatedAt: number;
}

type NormalizedPlayerContract = Omit<DbPlayerContract, "salaries"> & {
  salaries: Record<number, number>;
};

interface DbDeadCapEntry {
  id: string;
  leagueId: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  reason: string;
  deadCapSalaries: string;
  createdAt: number;
}

interface OrphanedContract {
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  contract: {
    salaries: Record<number, number>;
  };
  teamName: string;
}

interface ContractApprovalRequest {
  id: string;
  leagueId: string;
  rosterId: number;
  teamName: string;
  ownerName: string;
  contractsJson: string;
  status: string;
  submittedAt: number;
  reviewedAt: number | null;
  reviewerNotes: string | null;
}

interface ApprovalContractData {
  playerId: string;
  playerName: string;
  playerPosition: string;
  salaries: string;
  salariesByYear: Record<number, number>;
  franchiseTagApplied?: number;
}

interface ContractApprovalsTabProps {
  leagueId: string;
}

function ContractApprovalsTab({ leagueId }: ContractApprovalsTabProps) {
  const { toast } = useToast();
  const { season } = useSleeper();
  const CURRENT_YEAR = parseInt(season) || new Date().getFullYear();
  const OPTION_YEAR = CURRENT_YEAR + 4;
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [reviewDialog, setReviewDialog] = useState<{ request: ContractApprovalRequest; action: "approve" | "reject" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: approvalRequests, isLoading: isLoadingRequests } = useQuery<ContractApprovalRequest[]>({
    queryKey: ["/api/league", leagueId, "contract-approvals"],
    enabled: !!leagueId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, status, notes }: { requestId: string; status: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/league/${leagueId}/contract-approvals/${requestId}`, {
        status,
        reviewerNotes: notes,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contract-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/league", leagueId, "contracts"] });
      toast({
        title: variables.status === "approved" ? "Contracts Approved" : "Contracts Rejected",
        description: variables.status === "approved" 
          ? "The contracts have been approved and are now official."
          : "The contract request has been rejected.",
      });
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process the request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const toggleExpanded = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };

  const pendingRequests = approvalRequests?.filter(r => r.status === "pending") || [];
  const reviewedRequests = approvalRequests?.filter(r => r.status !== "pending") || [];

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const parseContracts = (json: string): ApprovalContractData[] => {
    try {
      const parsed = JSON.parse(json) as Array<ApprovalContractData>;
      return parsed.map(contract => {
        let salariesByYear: Record<number, number> = {};
        try {
          const salaryObj = JSON.parse(contract.salaries || "{}");
          Object.entries(salaryObj).forEach(([year, value]) => {
            const yearNum = Number(year);
            if (!isNaN(yearNum)) {
              salariesByYear[yearNum] = (Number(value) || 0) / 10;
            }
          });
        } catch {
          salariesByYear = {};
        }
        return { ...contract, salariesByYear };
      });
    } catch {
      return [];
    }
  };

  const calculateTotalSalary = (contracts: ApprovalContractData[], year: number) => {
    return contracts.reduce((sum, c) => sum + (c.salariesByYear?.[year] || 0), 0);
  };

  if (isLoadingRequests) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (pendingRequests.length === 0 && reviewedRequests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium mb-2">No Approval Requests</h2>
            <p className="text-muted-foreground">
              Teams haven't submitted any contracts for approval yet.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Contract Approval Requests</h2>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="w-3 h-3" />
          {pendingRequests.length} Pending
        </Badge>
      </div>

      {pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4 text-yellow-500" />
            Pending Requests ({pendingRequests.length})
          </h3>
          
          {pendingRequests.map(request => {
            const contracts = parseContracts(request.contractsJson);
            const isExpanded = expandedRequests.has(request.id);
            
            return (
              <Card key={request.id} data-testid={`card-approval-${request.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {request.teamName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{request.teamName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{contracts.length} players</Badge>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatDate(request.submittedAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3].map(year => (
                      <Card key={year} className="p-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">{year}</div>
                          <div className="font-bold text-sm text-primary">
                            ${calculateTotalSalary(contracts, year).toFixed(1)}M
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mb-3"
                    onClick={() => toggleExpanded(request.id)}
                    data-testid={`button-expand-${request.id}`}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Contract Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Contract Details ({contracts.length} players)
                      </>
                    )}
                  </Button>

                  {isExpanded && (
                    <ScrollArea className="h-[300px] mb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Player</TableHead>
                            <TableHead className="text-center">Pos</TableHead>
                            {[CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR].map((year, idx) => (
                              <TableHead key={year} className="text-center">{idx === 4 ? `${year} (Ext)` : year}</TableHead>
                            ))}
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Remaining</TableHead>
                            <TableHead className="text-center">Tag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contracts.map(contract => {
                            const yearColumns = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
                            const totalValue = yearColumns.reduce((sum, year) => sum + (contract.salariesByYear?.[year] || 0), 0);
                            const remainingValue = yearColumns.slice(1).reduce((sum, year) => sum + (contract.salariesByYear?.[year] || 0), 0);
                            
                            return (
                              <TableRow key={contract.playerId}>
                                <TableCell className="font-medium">{contract.playerName}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className={`${positionColors[contract.playerPosition] || "bg-gray-500 text-white"} text-[10px]`}>
                                    {contract.playerPosition}
                                  </Badge>
                                </TableCell>
                                {yearColumns.map(year => {
                                  const salary = contract.salariesByYear?.[year] || 0;
                                  return (
                                    <TableCell key={year} className="text-center">
                                      {salary > 0 ? `$${salary.toFixed(1)}M` : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-medium text-primary">
                                  {totalValue > 0 ? `$${totalValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center font-medium text-emerald-600">
                                  {remainingValue > 0 ? `$${remainingValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {contract.franchiseTagApplied ? (
                                    <Badge variant="default" className="text-[10px]">FT</Badge>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}

                  <Separator className="my-3" />

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setReviewDialog({ request, action: "reject" })}
                      data-testid={`button-reject-${request.id}`}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => setReviewDialog({ request, action: "approve" })}
                      data-testid={`button-approve-${request.id}`}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {reviewedRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <CheckCircle className="w-4 h-4" />
            Previously Reviewed ({reviewedRequests.length})
          </h3>
          
          {reviewedRequests.map(request => {
            const contracts = parseContracts(request.contractsJson);
            const isExpanded = expandedRequests.has(request.id);
            
            return (
              <Card key={request.id} className="opacity-90" data-testid={`card-reviewed-${request.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {request.teamName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{request.teamName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{request.ownerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{contracts.length} players</Badge>
                      <Badge 
                        variant={request.status === "approved" ? "default" : "destructive"}
                      >
                        {request.status === "approved" ? (
                          <><CheckCircle className="w-3 h-3 mr-1" /> Approved</>
                        ) : (
                          <><XCircle className="w-3 h-3 mr-1" /> Rejected</>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {request.reviewedAt && formatDate(request.reviewedAt)}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {request.reviewerNotes && (
                    <p className="text-sm text-muted-foreground italic mb-3">
                      "{request.reviewerNotes}"
                    </p>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => toggleExpanded(request.id)}
                    data-testid={`button-expand-reviewed-${request.id}`}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Contract Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Contract Details ({contracts.length} players)
                      </>
                    )}
                  </Button>

                  {isExpanded && (
                    <ScrollArea className="h-[300px] mt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Player</TableHead>
                            <TableHead className="text-center">Pos</TableHead>
                            {[2025, 2026, 2027, 2028, 2029].map((year, idx) => (
                              <TableHead key={year} className="text-center">{idx === 4 ? `${year} (Ext)` : year}</TableHead>
                            ))}
                            <TableHead className="text-center">Total</TableHead>
                            <TableHead className="text-center">Remaining</TableHead>
                            <TableHead className="text-center">Tag</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contracts.map(contract => {
                            const yearColumns = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3, OPTION_YEAR];
                            const totalValue = yearColumns.reduce((sum, year) => sum + (contract.salariesByYear?.[year] || 0), 0);
                            const remainingValue = yearColumns.slice(1).reduce((sum, year) => sum + (contract.salariesByYear?.[year] || 0), 0);
                            
                            return (
                              <TableRow key={contract.playerId}>
                                <TableCell className="font-medium">{contract.playerName}</TableCell>
                                <TableCell className="text-center">
                                  <Badge className={`${positionColors[contract.playerPosition] || "bg-gray-500 text-white"} text-[10px]`}>
                                    {contract.playerPosition}
                                  </Badge>
                                </TableCell>
                                {yearColumns.map(year => {
                                  const salary = contract.salariesByYear?.[year] || 0;
                                  return (
                                    <TableCell key={year} className="text-center">
                                      {salary > 0 ? `$${salary.toFixed(1)}M` : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-medium text-primary">
                                  {totalValue > 0 ? `$${totalValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center font-medium text-emerald-600">
                                  {remainingValue > 0 ? `$${remainingValue.toFixed(1)}M` : "-"}
                                </TableCell>
                                <TableCell className="text-center">
                                  {contract.franchiseTagApplied ? (
                                    <Badge variant="default" className="text-[10px]">FT</Badge>
                                  ) : "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve Contracts" : "Reject Contracts"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reviewDialog?.action === "approve" 
                ? `Are you sure you want to approve the contracts for ${reviewDialog?.request.teamName}? This will make these contracts official.`
                : `Are you sure you want to reject the contracts for ${reviewDialog?.request.teamName}?`
              }
            </p>
            
            <div>
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="Add any notes for the team owner..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="mt-1"
                data-testid="input-review-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewDialog?.action === "approve" ? "default" : "destructive"}
              onClick={() => {
                if (reviewDialog) {
                  reviewMutation.mutate({
                    requestId: reviewDialog.request.id,
                    status: reviewDialog.action === "approve" ? "approved" : "rejected",
                    notes: reviewNotes || undefined,
                  });
                }
              }}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "Processing..." : reviewDialog?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Contracts() {
  const { toast } = useToast();
  const { user, league, isLoading, season } = useSleeper();
  const [, setLocation] = useLocation();
  const [selectedTeam, setSelectedTeam] = useState<TeamCapData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [contractData, setContractData] = useState<ContractDataStore>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Memoized year constants from Sleeper season - used consistently across all components
  const yearConstants = useMemo(() => {
    const currentYear = parseInt(season) || new Date().getFullYear();
    return {
      CURRENT_YEAR: currentYear,
      CONTRACT_YEARS: [currentYear, currentYear + 1, currentYear + 2, currentYear + 3],
      OPTION_YEAR: currentYear + 4,
    };
  }, [season]);
  
  const { CURRENT_YEAR, CONTRACT_YEARS, OPTION_YEAR } = yearConstants;

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  const { data: rosters } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "rosters"],
    enabled: !!league?.leagueId,
  });

  const { data: leagueUsers } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "users"],
    enabled: !!league?.leagueId,
  });

  const { data: playersArray } = useQuery<SleeperPlayerData[]>({
    queryKey: ["/api/sleeper/players"],
    enabled: !!league?.leagueId,
  });

  const { data: dbContracts, refetch: refetchContracts } = useQuery<DbPlayerContract[]>({
    queryKey: ["/api/league", league?.leagueId, "contracts"],
    enabled: !!league?.leagueId,
  });

  const normalizedDbContracts = useMemo<NormalizedPlayerContract[]>(() => {
    if (!dbContracts) return [];
    return dbContracts.map(contract => {
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
        if (!isNaN(yearNum)) {
          salaries[yearNum] = (Number(value) || 0) / 10;
        }
      });
      return { ...contract, salaries };
    });
  }, [dbContracts]);

  const { data: deadCapEntries, refetch: refetchDeadCap } = useQuery<DbDeadCapEntry[]>({
    queryKey: ["/api/leagues", league?.leagueId, "dead-cap"],
    enabled: !!league?.leagueId,
  });

  // Fetch dead cap enabled setting
  const { data: deadCapEnabledData, refetch: refetchDeadCapEnabled } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/league", league?.leagueId, "settings", "dead-cap-enabled"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/settings/dead-cap-enabled`);
      if (!res.ok) throw new Error("Failed to fetch dead cap enabled setting");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const deadCapEnabled = deadCapEnabledData?.enabled ?? true; // Default to true for backward compatibility

  // Mutation to update dead cap enabled setting
  const updateDeadCapEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`/api/league/${league?.leagueId}/settings/dead-cap-enabled?userId=${user?.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update dead cap enabled setting");
      }
      return res.json();
    },
    onSuccess: (_, enabled) => {
      refetchDeadCapEnabled();
      toast({
        title: "Setting Updated",
        description: `Dead cap feature ${enabled ? "enabled" : "disabled"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeadCapToggle = (enabled: boolean) => {
    updateDeadCapEnabledMutation.mutate(enabled);
  };

  useEffect(() => {
    if (dbContracts && dbContracts.length > 0) {
      const contractStore: ContractDataStore = {};
      for (const contract of dbContracts) {
        const rosterId = contract.rosterId.toString();
        if (!contractStore[rosterId]) {
          contractStore[rosterId] = {};
        }
        const parsedSalaries = (() => {
          try {
            return JSON.parse(contract.salaries || "{}");
          } catch {
            return {};
          }
        })();
        const salaries: Record<number, number> = {};
        Object.entries(parsedSalaries).forEach(([year, value]) => {
          const yearNum = Number(year);
          if (!isNaN(yearNum)) {
            salaries[yearNum] = (Number(value) || 0) / 10;
          }
        });
        contractStore[rosterId][contract.playerId] = {
          salaries,
          fifthYearOption: contract.fifthYearOption as "accepted" | "declined" | null,
          isOnIr: contract.isOnIr === 1,
          originalContractYears: contract.originalContractYears || 0,
          isRookieContract: contract.isRookieContract === 1,
          ...((contract as any).franchiseTagUsed !== undefined && { franchiseTagUsed: (contract as any).franchiseTagUsed }),
          ...((contract as any).franchiseTagYear !== undefined && (contract as any).franchiseTagYear !== null && { franchiseTagYear: (contract as any).franchiseTagYear }),
          ...((contract as any).hasBeenFranchiseTagged !== undefined && { hasBeenFranchiseTagged: (contract as any).hasBeenFranchiseTagged }),
        };
      }
      setContractData(contractStore);
    }
  }, [dbContracts]);

  const playerMap = useMemo(() => {
    if (!playersArray) return {};
    return convertPlayersArrayToMap(playersArray);
  }, [playersArray]);

  const userTeam = useMemo(() => {
    if (!user?.userId || !rosters || !leagueUsers) return null;
    
    const userRoster = rosters.find((roster: any) => roster.owner_id === user.userId);
    if (!userRoster) return null;

    const owner = leagueUsers.find((u: any) => u.user_id === user.userId);
    const rosterId = userRoster.roster_id.toString();
    const teamContracts = contractData[rosterId] || {};
    const salaries = calculateTeamSalary(userRoster.players || [], teamContracts, CURRENT_YEAR);
    const deadCap = 0;
    const available = TOTAL_CAP - salaries - deadCap;

    return {
      rosterId: userRoster.roster_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${userRoster.roster_id}`,
      ownerName: owner?.display_name || "Unknown",
      avatar: owner?.avatar || null,
      salaries,
      deadCap,
      available,
      players: userRoster.players || [],
    } as TeamCapData;
  }, [user?.userId, rosters, leagueUsers, contractData]);

  const allRosterPlayerIds = useMemo(() => {
    if (!rosters) return [];
    return rosters.flatMap((roster: any) => roster.players || []);
  }, [rosters]);

  const expiringPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rosterId of Object.keys(contractData)) {
      const teamContracts = contractData[rosterId];
      for (const playerId of Object.keys(teamContracts)) {
        const contract = teamContracts[playerId];
        if (!contract) continue;
        const salaryEntries = Object.entries(contract.salaries || {})
          .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
          .filter(entry => !isNaN(entry.year) && entry.value > 0);
        const lastPaidYear = salaryEntries.length > 0
          ? Math.max(...salaryEntries.map(entry => entry.year))
          : 0;
        if (lastPaidYear === CURRENT_YEAR && (contract.salaries[CURRENT_YEAR] || 0) > 0) {
          ids.add(playerId);
        }
      }
    }
    return ids;
  }, [contractData, CURRENT_YEAR]);

  const rosterPlayerMap = useMemo(() => {
    if (!rosters) return new Map<number, Set<string>>();
    const map = new Map<number, Set<string>>();
    for (const roster of rosters) {
      map.set(roster.roster_id, new Set(roster.players || []));
    }
    return map;
  }, [rosters]);

  const teamDeadCapMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!deadCapEnabled || !deadCapEntries) return map;
    
    for (const entry of deadCapEntries) {
      const currentDeadCap = map.get(entry.rosterId) || 0;
      const parsed = (() => {
        try {
          return JSON.parse(entry.deadCapSalaries || "{}");
        } catch {
          return {};
        }
      })();
      const yearValue = Number(parsed[String(CURRENT_YEAR)] || 0) / 10;
      map.set(entry.rosterId, currentDeadCap + yearValue);
    }
    return map;
  }, [deadCapEntries, deadCapEnabled]);

  const orphanedContracts = useMemo(() => {
    if (!normalizedDbContracts || !rosters || !leagueUsers || !playerMap) return [];
    
    const userMap = new Map(
      (leagueUsers || []).map((u: any) => [u.user_id, u])
    );
    
    const rosterOwnerMap = new Map(
      (rosters || []).map((r: any) => {
        const owner = userMap.get(r.owner_id);
        return [r.roster_id, owner?.metadata?.team_name || owner?.display_name || `Team ${r.roster_id}`];
      })
    );
    
    const orphans: OrphanedContract[] = [];
    
    for (const contract of normalizedDbContracts) {
      const rosterPlayers = rosterPlayerMap.get(contract.rosterId);
      const isOnRoster = rosterPlayers?.has(contract.playerId) ?? false;
      const hasSalary = Object.values(contract.salaries || {}).some((value) => Number(value) > 0);
      
      if (!isOnRoster && hasSalary) {
        const player = playerMap[contract.playerId];
        orphans.push({
          rosterId: contract.rosterId,
          playerId: contract.playerId,
          playerName: player?.name || `Unknown (${contract.playerId})`,
          playerPosition: player?.position || "NA",
          contract: {
            salaries: Object.fromEntries(
              Object.entries(contract.salaries || {}).map(([year, value]) => [
                year,
                Math.round((Number(value) || 0) * 10),
              ])
            ),
          },
          teamName: rosterOwnerMap.get(contract.rosterId) || `Team ${contract.rosterId}`,
        });
      }
    }
    
    return orphans;
  }, [normalizedDbContracts, rosters, leagueUsers, playerMap, rosterPlayerMap]);

  const processCutTradeMutation = useMutation({
    mutationFn: async (data: { 
      rosterId: number; 
      playerId: string; 
      playerName: string;
      playerPosition: string;
      reason: string; 
      contract: any;
    }) => {
      const response = await apiRequest("POST", `/api/leagues/${league?.leagueId}/process-cut-trade`, data);
      return response.json();
    },
    onSuccess: () => {
      refetchContracts();
      refetchDeadCap();
      toast({
        title: "Contract Processed",
        description: "The contract has been converted to dead cap.",
      });
    },
    onError: (error) => {
      console.error("Error processing cut/trade:", error);
      toast({
        title: "Error",
        description: "Failed to process the cut/trade. Please try again.",
        variant: "destructive",
      });
    },
  });

  const [quartileAssignmentResult, setQuartileAssignmentResult] = useState<{
    assigned: number;
    total: number;
    contracts: Array<{ playerId: string; rosterId: number; quartile: number; salary: number; years: number[] }>;
  } | null>(null);

  const assignContractsByQuartileMutation = useMutation({
    mutationFn: async () => {
      if (!league?.leagueId) throw new Error("League ID is required");
      const response = await apiRequest("POST", `/api/league/${league.leagueId}/assign-contracts-by-quartile`, {});
      return response.json();
    },
    onSuccess: (data) => {
      refetchContracts();
      setQuartileAssignmentResult(data);
      toast({
        title: "Contracts Assigned",
        description: `Successfully assigned ${data.assigned || 0} out of ${data.total || 0} contracts based on quartile rankings.`,
      });
    },
    onError: (error: any) => {
      console.error("Error assigning contracts by quartile:", error);
      setQuartileAssignmentResult(null);
      toast({
        title: "Error",
        description: error?.message || "Failed to assign contracts by quartile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContractChange = (
    rosterId: string, 
    playerId: string, 
    field: "salaries" | "fifthYearOption" | "isOnIr" | "originalContractYears" | "isRookieContract", 
    value: any
  ) => {
    setContractData(prev => {
      const teamContracts = prev[rosterId] || {};
      const playerContract = teamContracts[playerId] || { 
        salaries: {},
        fifthYearOption: null,
        isOnIr: false,
        originalContractYears: 0,
        isRookieContract: false
      };
      
      return {
        ...prev,
        [rosterId]: {
          ...teamContracts,
          [playerId]: {
            ...playerContract,
            [field]: value
          }
        }
      };
    });
    setHasChanges(true);
  };

  const saveContractsMutation = useMutation({
    mutationFn: async (contracts: any[]) => {
      const response = await apiRequest("POST", `/api/league/${league?.leagueId}/contracts`, {
        contracts,
        userId: user?.userId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/league", league?.leagueId, "contracts"] });
      toast({
        title: "Contracts Saved",
        description: "All contract data has been saved to the database.",
      });
      setHasChanges(false);
    },
    onError: (error: any) => {
      console.error("Error saving contracts:", error);
      toast({
        title: "Error Saving Contracts",
        description: error?.message || "Failed to save contracts. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handler for "Assign Rookies" button - sets rookie toggle for players with yearsExp < 4
  const handleAssignRookies = () => {
    if (!rosters || !playerMap) {
      toast({
        title: "Error",
        description: "Unable to load rosters or players. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    let count = 0;
    rosters.forEach((roster: any) => {
      const rosterId = roster.roster_id.toString();
      (roster.players || []).forEach((playerId: string) => {
        const player = playerMap[playerId];
        const isDef = (player?.position || "").toUpperCase() === "DEF";
        if (player && (player.yearsExp ?? 0) < 4 && !isDef) {
          const yearsExp = player.yearsExp ?? 0;
          const remainingYears = 4 - yearsExp;
          
          // Set rookie contract flag
          handleContractChange(rosterId, playerId, "isRookieContract", true);
          // Set remaining contract years
          handleContractChange(rosterId, playerId, "originalContractYears", remainingYears);
          count++;
        }
      });
    });

    toast({
      title: "Rookies Assigned",
      description: `Successfully assigned rookie contract designation to ${count} players with less than 4 years of NFL experience.`,
    });
  };

  // Handler for "Assign Rookie Contracts" button - applies rookie pay scale
  const handleAssignRookieContracts = async () => {
    if (!league?.leagueId || !rosters || !playerMap) {
      toast({
        title: "Error",
        description: "Unable to load league, rosters, or players. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    const playersToProcess: Array<{rosterId: string; playerId: string; yearsExp: number}> = [];
    
    // Collect all players with rookie toggle ON (exclude defenses)
    rosters.forEach((roster: any) => {
      const rosterId = roster.roster_id.toString();
      (roster.players || []).forEach((playerId: string) => {
        const contract = contractData[rosterId]?.[playerId];
        const player = playerMap[playerId];
        const isDef = (player?.position || "").toUpperCase() === "DEF";
        if (contract?.isRookieContract && !isDef) {
          playersToProcess.push({
            rosterId,
            playerId,
            yearsExp: player?.yearsExp ?? 0
          });
        }
      });
    });

    if (playersToProcess.length === 0) {
      toast({
        title: "No Players Found",
        description: "No players with rookie contract designation found. Please use 'Assign Rookies' first.",
        variant: "destructive",
      });
      return;
    }

    let assignedCount = 0;
    let errorCount = 0;

    // Fetch draft positions and apply salaries
    for (const {rosterId, playerId, yearsExp} of playersToProcess) {
      try {
        // Fetch draft position
        const res = await fetch(`/api/league/${league.leagueId}/player/${playerId}/draft-position`);
        if (!res.ok) {
          errorCount++;
          continue;
        }

        const draftPos = await res.json();
        const contract = contractData[rosterId]?.[playerId];
        const remainingYears = contract?.originalContractYears || (4 - yearsExp);
        
        let salary = 0;
        if (draftPos && draftPos.round != null && draftPos.draftSlot != null) {
          // If round 4 or 5, use 3.12 salary ($2M)
          if (draftPos.round >= 4) {
            salary = getRookieSalary(3, 12); // $2M
          } else {
            salary = getRookieSalary(draftPos.round, draftPos.draftSlot);
          }
        } else {
          // No draft position (undrafted or not in league draft) - use default rookie salary ($2M)
          salary = getRookieSalary(3, 12);
        }
        
        // Apply salary to remaining years
        const salaries: Record<number, number> = {};
        for (let i = 0; i < remainingYears; i++) {
          salaries[CURRENT_YEAR + i] = salary;
        }
        handleContractChange(rosterId, playerId, "salaries", salaries);
        assignedCount++;
      } catch (error) {
        console.error(`Error processing player ${playerId}:`, error);
        errorCount++;
      }
    }

    if (assignedCount > 0) {
      toast({
        title: "Rookie Contracts Assigned",
        description: `Successfully assigned rookie contracts to ${assignedCount} player${assignedCount !== 1 ? 's' : ''}.${errorCount > 0 ? ` ${errorCount} player${errorCount !== 1 ? 's' : ''} could not be processed.` : ''}`,
      });
    } else {
      toast({
        title: "No Contracts Assigned",
        description: `Unable to assign contracts. ${errorCount > 0 ? `${errorCount} player${errorCount !== 1 ? 's' : ''} had errors.` : 'No draft positions found for eligible players.'}`,
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!league?.leagueId) return;

    const contractsToSave: any[] = [];
    
    for (const rosterId of Object.keys(contractData)) {
      const teamContracts = contractData[rosterId];
      for (const playerId of Object.keys(teamContracts)) {
        const contract = teamContracts[playerId];
        
        // Calculate salaries (allow zero values)
        const salariesPayload: Record<string, number> = {};
        Object.entries(contract.salaries || {}).forEach(([year, value]) => {
          const yearNum = Number(year);
          if (!isNaN(yearNum)) {
            salariesPayload[String(yearNum)] = Math.round((Number(value) || 0) * 10);
          }
        });
        
        // Determine originalContractYears: allow 0, null, or 1-4 values
        let originalContractYears: number | null = null;
        const existingContract = normalizedDbContracts.find(c => c.playerId === playerId && c.rosterId === parseInt(rosterId));
        
        // Use provided value if it's a valid number (0-4), otherwise use existing or default to 0
        if (typeof contract.originalContractYears === 'number' && 
            contract.originalContractYears >= 0 && 
            contract.originalContractYears <= 4) {
          // Use the explicitly set value (including 0)
          originalContractYears = contract.originalContractYears;
        } else if (existingContract) {
          // Existing contract - use DB value (including 0)
          originalContractYears = existingContract.originalContractYears ?? 0;
        } else {
          // New contract - allow 0/null
          originalContractYears = contract.originalContractYears ?? 0;
        }
        
        // Save all contracts regardless of salary values or contract length
        contractsToSave.push({
          rosterId: parseInt(rosterId),
          playerId,
          salaries: JSON.stringify(salariesPayload),
          fifthYearOption: contract.fifthYearOption,
          isOnIr: contract.isOnIr ? 1 : 0,
          originalContractYears,
          isRookieContract: contract.isRookieContract ? 1 : 0,
        });
      }
    }

    // Save all contracts (including those with zero/null values)
    if (contractsToSave.length > 0) {
      saveContractsMutation.mutate(contractsToSave);
    } else {
      // No contracts to save - nothing changed
      toast({
        title: "No Changes",
        description: "No contract changes to save.",
      });
    }
  };

  if (isLoading || !league || !user) {
    return null;
  }

  const userMap = new Map(
    (leagueUsers || []).map((u: any) => [u.user_id, u])
  );

  const teamCapData: TeamCapData[] = (rosters || []).map((roster: any) => {
    const owner = userMap.get(roster.owner_id);
    const rosterId = roster.roster_id.toString();
    const teamContracts = contractData[rosterId] || {};
    const salaries = calculateTeamSalary(roster.players || [], teamContracts, CURRENT_YEAR);
    const deadCap = teamDeadCapMap.get(roster.roster_id) || 0;
    const available = TOTAL_CAP - salaries - deadCap;

    return {
      rosterId: roster.roster_id,
      teamName: owner?.metadata?.team_name || owner?.display_name || `Team ${roster.roster_id}`,
      ownerName: owner?.display_name || "Unknown",
      avatar: owner?.avatar || null,
      salaries,
      deadCap,
      available,
      players: roster.players || [],
    };
  }).sort((a: TeamCapData, b: TeamCapData) => a.rosterId - b.rosterId);

  const totalSalaries = teamCapData.reduce((sum, t) => sum + t.salaries, 0);
  const totalDeadCap = teamCapData.reduce((sum, t) => sum + t.deadCap, 0);
  const teamsOverCap = teamCapData.filter(t => t.available < 0).length;

  const handleTeamClick = (team: TeamCapData) => {
    setSelectedTeam(team);
    setModalOpen(true);
  };

  const selectedTeamPlayers = selectedTeam && Object.keys(playerMap).length > 0
    ? getPlayersWithContracts(
        selectedTeam.players, 
        playerMap, 
        contractData[selectedTeam.rosterId.toString()] || {},
        CURRENT_YEAR
      )
    : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Contracts
          </h1>
          <p className="text-muted-foreground">
            Salary cap utilization across all teams (Cap: ${TOTAL_CAP}M)
          </p>
        </div>
        {isCommissioner && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            Commissioner Access
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="expiring" data-testid="tab-expiring">Expiring Contracts</TabsTrigger>
          <TabsTrigger value="manage-team" data-testid="tab-manage-team">Manage Team Contracts</TabsTrigger>
          <TabsTrigger value="bidding" data-testid="tab-bidding">Player Bidding</TabsTrigger>
          <TabsTrigger value="player-rankings" data-testid="tab-player-rankings">
            <BarChart className="w-4 h-4 mr-2" />
            Player Rankings
          </TabsTrigger>
          {isCommissioner && (
            <>
              <TabsTrigger value="manage-league" data-testid="tab-manage-league">Manage League Contracts</TabsTrigger>
              <TabsTrigger value="approvals" data-testid="tab-approvals">Approvals</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: COLORS.salaries }}>
                    ${totalSalaries.toFixed(1)}M
                  </div>
                  <p className="text-sm text-muted-foreground">Total Salaries</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: COLORS.deadCap }}>
                    ${totalDeadCap.toFixed(1)}M
                  </div>
                  <p className="text-sm text-muted-foreground">Total Dead Cap</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: teamsOverCap > 0 ? COLORS.deadCap : COLORS.available }}>
                    {teamsOverCap}
                  </div>
                  <p className="text-sm text-muted-foreground">Teams Over Cap</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {teamCapData.map((team) => (
              <TeamCapChart 
                key={team.rosterId} 
                team={team} 
                onClick={() => handleTeamClick(team)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="expiring" className="mt-6">
          {Object.keys(playerMap).length > 0 && (
            <ExpiringContractsTab
              teams={teamCapData}
              playerMap={playerMap}
              contractData={contractData}
              leagueUsers={leagueUsers || []}
              deadCapEnabled={deadCapEnabled}
              leagueId={league?.leagueId}
              userRosterId={userTeam?.rosterId}
            />
          )}
        </TabsContent>

        <TabsContent value="manage-team" className="mt-6">
          {Object.keys(playerMap).length > 0 && playersArray && (
            <ManageTeamContractsTab
              userTeam={userTeam}
              playerMap={playerMap}
              leagueContractData={contractData}
              allPlayers={playersArray}
              rosterPlayerIds={allRosterPlayerIds}
              dbContracts={normalizedDbContracts}
              leagueId={league?.leagueId || ""}
              deadCapEnabled={deadCapEnabled}
            />
          )}
        </TabsContent>

        <TabsContent value="bidding" className="mt-6">
          {Object.keys(playerMap).length > 0 && playersArray && userTeam && (
            <PlayerBiddingTab
              userTeam={userTeam}
              allPlayers={playersArray}
              rosterPlayerIds={allRosterPlayerIds}
              teamContracts={contractData[userTeam.rosterId.toString()] || {}}
              teamCapData={teamCapData}
              expiringPlayerIds={expiringPlayerIds}
            />
          )}
        </TabsContent>

        <TabsContent value="player-rankings" className="mt-6">
          {league?.leagueId && (
            <PlayerRankingsTab leagueId={league.leagueId} />
          )}
        </TabsContent>

          {isCommissioner && (
          <>
          <TabsContent value="manage-league" className="mt-6 space-y-6">
            {orphanedContracts.length > 0 && (
              <Card className="border-orange-500/50">
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading flex items-center gap-2 text-orange-500">
                    <AlertTriangle className="w-5 h-5" />
                    Cut/Traded Players Requiring Action ({orphanedContracts.length})
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    These players have contracts but are no longer on their assigned roster. 
                    Process them to convert their remaining contract to dead cap.
                  </p>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-3">
                      {orphanedContracts.map((orphan) => {
                        const salaryYears = Object.entries(orphan.contract.salaries || {})
                          .map(([year, value]) => ({ year: Number(year), value: Number(value) }))
                          .filter(entry => !isNaN(entry.year) && entry.value > 0);
                        const totalRemaining = salaryYears.reduce((sum, entry) => sum + entry.value, 0) / 10;
                        const currentYearSalary = Number(orphan.contract.salaries?.[CURRENT_YEAR] || 0);
                        const nextYearSalary = Number(orphan.contract.salaries?.[CURRENT_YEAR + 1] || 0);
                        const deadCapY1 = deadCapEnabled ? (currentYearSalary * 0.4 / 10) : 0;
                        const deadCapY2 = deadCapEnabled ? ((currentYearSalary * 0.3 + nextYearSalary * 0.4) / 10) : 0;
                        
                        return (
                          <div 
                            key={`${orphan.rosterId}-${orphan.playerId}`}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarImage 
                                  src={`https://sleepercdn.com/content/nfl/players/${orphan.playerId}.jpg`}
                                  alt={orphan.playerName}
                                />
                                <AvatarFallback className="text-xs">
                                  {orphan.playerName.split(" ").map(n => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{orphan.playerName}</span>
                                  <Badge className={positionColors[orphan.playerPosition] || "bg-gray-500"}>
                                    {orphan.playerPosition}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {orphan.teamName} • Remaining: ${totalRemaining.toFixed(1)}M
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => processCutTradeMutation.mutate({
                                  rosterId: orphan.rosterId,
                                  playerId: orphan.playerId,
                                  playerName: orphan.playerName,
                                  playerPosition: orphan.playerPosition,
                                  reason: "cut",
                                  contract: orphan.contract,
                                })}
                                disabled={processCutTradeMutation.isPending}
                                data-testid={`button-process-cut-${orphan.playerId}`}
                              >
                                <UserMinus className="w-4 h-4 mr-1" />
                                Cut
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => processCutTradeMutation.mutate({
                                  rosterId: orphan.rosterId,
                                  playerId: orphan.playerId,
                                  playerName: orphan.playerName,
                                  playerPosition: orphan.playerPosition,
                                  reason: "traded",
                                  contract: orphan.contract,
                                })}
                                disabled={processCutTradeMutation.isPending}
                                data-testid={`button-process-trade-${orphan.playerId}`}
                              >
                                <ArrowRightLeft className="w-4 h-4 mr-1" />
                                Traded
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {deadCapEnabled && deadCapEntries && deadCapEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="font-heading flex items-center gap-2" style={{ color: COLORS.deadCap }}>
                    <DollarSign className="w-5 h-5" />
                    Dead Cap Entries ({deadCapEntries.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[250px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player</TableHead>
                          <TableHead>Team</TableHead>
                          <TableHead className="text-center">Reason</TableHead>
                          {[CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3].map(year => (
                            <TableHead key={year} className="text-center">{year}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {deadCapEntries.map((entry) => {
                          const team = teamCapData.find(t => t.rosterId === entry.rosterId);
                          const deadCapParsed = (() => {
                            try {
                              return JSON.parse(entry.deadCapSalaries || "{}");
                            } catch {
                              return {};
                            }
                          })();
                          const yearColumns = [CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2, CURRENT_YEAR + 3];
                          return (
                            <TableRow key={entry.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge className={positionColors[entry.playerPosition] || "bg-gray-500"}>
                                    {entry.playerPosition}
                                  </Badge>
                                  <span className="font-medium">{entry.playerName}</span>
                                </div>
                              </TableCell>
                              <TableCell>{team?.teamName || `Team ${entry.rosterId}`}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="capitalize">
                                  {entry.reason}
                                </Badge>
                              </TableCell>
                              {yearColumns.map(year => (
                                <TableCell key={year} className="text-center tabular-nums" style={{ color: COLORS.deadCap }}>
                                  ${(Number(deadCapParsed[String(year)] || 0) / 10).toFixed(1)}M
                                </TableCell>
                              ))}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Contract Assignment Tools */}
            <Card className="border-blue-500/50">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading flex items-center gap-2 text-blue-600">
                  <Calculator className="w-5 h-5" />
                  Contract Assignment Tools
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Bulk assign contracts to players based on performance metrics or draft position.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Assign Contracts by Quartile */}
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Assign Contracts by Quartile</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        Automatically assign 2-year contracts to players with 3+ years of NFL experience based on their 
                        fantasy point quartile rankings (Q1: $20M, Q2: $15M, Q3: $10M, Q4: $5M per year).
                      </p>
                      <p className="text-xs text-amber-600 font-medium">
                        This will assign contracts to all eligible players. Existing contracts will be updated.
                      </p>
                      {quartileAssignmentResult && (
                        <div className="mt-3 p-3 bg-background border rounded-md">
                          <p className="text-sm font-medium mb-1">Assignment Results:</p>
                          <p className="text-sm text-muted-foreground">
                            Assigned {quartileAssignmentResult.assigned} out of {quartileAssignmentResult.total} contracts.
                            {quartileAssignmentResult.assigned < quartileAssignmentResult.total && (
                              <span className="text-amber-600"> Some contracts may have failed to assign.</span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="default"
                      onClick={() => {
                        if (confirm("Are you sure you want to assign contracts by quartile? This will assign contracts to all eligible players with 3+ years experience.")) {
                          assignContractsByQuartileMutation.mutate();
                        }
                      }}
                      disabled={assignContractsByQuartileMutation.isPending}
                      className="whitespace-nowrap"
                    >
                      {assignContractsByQuartileMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Assigning...
                        </>
                      ) : (
                        <>
                          <Calculator className="w-4 h-4 mr-2" />
                          Assign by Quartile
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Assign Rookie Contracts */}
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Assign Rookie Contracts</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        Step 1: Use "Assign Rookies" to automatically identify players with less than 4 years of NFL experience and set their rookie contract designation. Step 2: Use "Assign Rookie Contracts" to apply the rookie pay scale based on draft position.
                      </p>
                      <p className="text-xs text-amber-600 font-medium mb-2">
                        Rookies drafted in rounds 1-3 receive contracts based on the rookie pay scale (Round 1: $6-12M, Round 2: $4M, Round 3: $2M per year). Rounds 4-5 use the same pay scale as 3.12 ($2M).
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (confirm("This will set the rookie contract designation for all players with less than 4 years of NFL experience. Continue?")) {
                            handleAssignRookies();
                          }
                        }}
                        className="whitespace-nowrap"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Assign Rookies
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => {
                          if (confirm("This will assign rookie contract salaries based on draft position to all players with the rookie contract designation. Continue?")) {
                            handleAssignRookieContracts();
                          }
                        }}
                        className="whitespace-nowrap"
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Assign Rookie Contracts
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {Object.keys(playerMap).length > 0 && (
              <ContractInputTab 
                teams={teamCapData} 
                playerMap={playerMap}
                contractData={contractData}
                onContractChange={handleContractChange}
                onSave={handleSave}
                hasChanges={hasChanges}
                isSaving={saveContractsMutation.isPending}
                isCommissioner={isCommissioner}
                deadCapEnabled={deadCapEnabled}
                onDeadCapToggle={handleDeadCapToggle}
              />
            )}
          </TabsContent>

          <TabsContent value="approvals" className="mt-6">
            {league?.leagueId && (
              <ContractApprovalsTab leagueId={league.leagueId} />
            )}
          </TabsContent>
          </>
        )}
      </Tabs>

      <TeamContractModal
        team={selectedTeam}
        players={selectedTeamPlayers}
        contractData={contractData[selectedTeam?.rosterId.toString() || ""] || {}}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
