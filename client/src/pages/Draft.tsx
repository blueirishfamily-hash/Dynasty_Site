import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Calendar, Dice1, Trophy, TrendingDown, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface DraftInfo {
  draftId: string;
  leagueId: string;
  season: string;
  status: string;
  type: string;
  rounds: number;
  startTime: number;
  created: number;
}

interface DraftPickData {
  round: number;
  rosterId: number;
  playerId: string;
  pickedBy: string;
  pickNo: number;
  draftSlot: number;
  playerName: string;
  position: string;
  team: string;
  fantasyTeam: string;
  yearsExp?: number;
}

interface DraftPick {
  round: number;
  pick: number;
  originalOwner: { name: string; initials: string; avatar?: string | null };
  currentOwner: { name: string; initials: string; avatar?: string | null };
  player?: { id: string; name: string; position: string; team: string };
  fantasyTeam?: string;
  isUserPick?: boolean;
  isNFLRookie?: boolean;
  rosterId?: number;
}

interface TeamStanding {
  rosterId: number;
  rank: number;
  name: string;
  initials: string;
  avatar?: string | null;
  wins: number;
  losses: number;
  pointsFor: number;
  isUser?: boolean;
}

interface PlayoffPrediction {
  rosterId: number;
  name: string;
  initials: string;
  makePlayoffsPct: number;
  oneSeedPct: number;
  projectedWins: number;
}

interface DraftOddsTeam {
  rosterId: number;
  name: string;
  initials: string;
  record: string;
  wins: number;
  losses: number;
  pointsFor: number;
  isPlayoffTeam: boolean;
  projectedFinish?: number;
  maxPoints: number;
  pickOdds: number[];
  isUser?: boolean;
  missPlayoffsPct?: number;
  makePlayoffsPct?: number;
  projectedWins?: number;
  status: "eliminated" | "clinched" | "bubble";
  isLocked?: boolean;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
};

function getTeamInitials(name: string): string {
  const words = name.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

export default function Draft() {
  const { user, league, season } = useSleeper();
  const [activeTab, setActiveTab] = useState<"future" | "historical" | "odds">("future");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [showRookiesOnly, setShowRookiesOnly] = useState(false);
  const lockedOddsRef = useRef<Map<number, number[]>>(new Map());

  const { data: draftPicks, isLoading: picksLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: standings } = useQuery<TeamStanding[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId || ""}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery<DraftInfo[]>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "drafts"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/drafts`);
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  // Fetch historical drafts for 2023 and 2024 leagues directly from Sleeper
  const HISTORICAL_LEAGUE_2023 = "918240874625257472";
  const HISTORICAL_LEAGUE_2024 = "1048746932522405888";

  const { data: historicalDrafts2023 } = useQuery<DraftInfo[]>({
    queryKey: ["/api/sleeper/league", HISTORICAL_LEAGUE_2023, "drafts"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${HISTORICAL_LEAGUE_2023}/drafts`);
      if (!res.ok) throw new Error("Failed to fetch 2023 drafts");
      return res.json();
    },
  });

  const { data: historicalDrafts2024, isLoading: historicalDraftsLoading } = useQuery<DraftInfo[]>({
    queryKey: ["/api/sleeper/league", HISTORICAL_LEAGUE_2024, "drafts"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${HISTORICAL_LEAGUE_2024}/drafts`);
      if (!res.ok) throw new Error("Failed to fetch 2024 drafts");
      return res.json();
    },
  });

  // Combine current league drafts with historical 2023 and 2024 drafts
  const allDrafts = useMemo(() => {
    const current = (drafts || []).filter((d) => d && d.draftId);
    const historical2023 = (historicalDrafts2023 || []).filter((d) => d && d.draftId);
    const historical2024 = (historicalDrafts2024 || []).filter((d) => d && d.draftId);
    // Combine and deduplicate by draftId
    const draftMap = new Map<string, DraftInfo>();
    [...current, ...historical2023, ...historical2024].forEach(d => {
      if (!draftMap.has(d.draftId)) {
        draftMap.set(d.draftId, d);
      }
    });
    return Array.from(draftMap.values());
  }, [drafts, historicalDrafts2023, historicalDrafts2024]);

  // Determine if selected draft is from 2023/2024 (fetch from Sleeper) or snapshot
  const selectedDraftInfo = useMemo(() => {
    if (!selectedDraftId) return { isSnapshot: false, leagueId: null, season: null };
    
    // Check if it's from 2023 or 2024
    const draft2023 = historicalDrafts2023?.find(d => d.draftId === selectedDraftId);
    const draft2024 = historicalDrafts2024?.find(d => d.draftId === selectedDraftId);
    
    if (draft2023) {
      return { isSnapshot: false, leagueId: HISTORICAL_LEAGUE_2023, season: "2023" };
    }
    if (draft2024) {
      return { isSnapshot: false, leagueId: HISTORICAL_LEAGUE_2024, season: "2024" };
    }
    
    // Check if it's from snapshot (has isSnapshot flag)
    const allHistorical = [...(historicalDrafts2023 || []), ...(historicalDrafts2024 || [])];
    const snapshotDraft = allHistorical.find(d => d.draftId === selectedDraftId && (d as any).isSnapshot);
    if (snapshotDraft) {
      // Would need to determine leagueId and season from snapshot - for now, treat as Sleeper
      return { isSnapshot: false, leagueId: null, season: null };
    }
    
    return { isSnapshot: false, leagueId: null, season: null };
  }, [selectedDraftId, historicalDrafts2023, historicalDrafts2024]);

  const { data: historicalPicks, isLoading: historicalLoading } = useQuery<DraftPickData[]>({
    queryKey: ["/api/draft", selectedDraftId, "picks", selectedDraftInfo.isSnapshot, selectedDraftInfo.leagueId, selectedDraftInfo.season],
    queryFn: async () => {
      if (selectedDraftInfo.isSnapshot && selectedDraftInfo.leagueId && selectedDraftInfo.season) {
        // Fetch from snapshot endpoint
        const res = await fetch(`/api/league/${selectedDraftInfo.leagueId}/historical/draft/${selectedDraftId}/picks?season=${selectedDraftInfo.season}`);
        if (!res.ok) throw new Error("Failed to fetch draft picks from snapshot");
        return res.json();
      } else {
        // Fetch from Sleeper API (for 2023/2024 or current drafts)
        const res = await fetch(`/api/sleeper/draft/${selectedDraftId}/picks`);
        if (!res.ok) throw new Error("Failed to fetch draft picks");
        return res.json();
      }
    },
    enabled: !!selectedDraftId,
  });

  const { data: playoffPredictions } = useQuery<{ predictions: PlayoffPrediction[]; remainingWeeks: number; currentWeek: number }>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: bracketData } = useQuery<{
    matchups: Array<{ winner: number | null; loser: number | null }>;
    consolationMatchups?: Array<{ winner: number | null; loser: number | null }>;
  }>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "bracket"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/bracket`);
      if (!res.ok) throw new Error("Failed to fetch bracket");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });


  // Helper function to check if draft is complete
  // Handles multiple status value variations from Sleeper API
  const isDraftComplete = (status: string) => {
    if (!status) return false;
    const normalizedStatus = status.toLowerCase().trim();
    return normalizedStatus === "complete" || 
           normalizedStatus === "completed" || 
           normalizedStatus === "finished" ||
           normalizedStatus === "closed" ||
           normalizedStatus === "done" ||
           normalizedStatus === "ended";
  };


  const is2023Draft = selectedDraftInfo.season === "2023";

  // Reset rookies-only toggle when switching away from 2023 draft
  useEffect(() => {
    if (!is2023Draft) {
      setShowRookiesOnly(false);
    }
  }, [is2023Draft]);

  // Auto-select most recent completed draft when drafts load or Historical tab is selected
  // Only auto-select if no draft is currently selected
  useEffect(() => {
    if (!selectedDraftId && allDrafts && allDrafts.length > 0) {
      // When Historical tab is active, prioritize most recent completed draft
      if (activeTab === "historical") {
        // Get all completed drafts
        const allCompletedDrafts = allDrafts
          .filter(d => isDraftComplete(d.status))
          .sort((a, b) => parseInt(b.season) - parseInt(a.season));
        
        // Select most recent (first in sorted array)
        if (allCompletedDrafts.length > 0 && allCompletedDrafts[0].draftId) {
          setSelectedDraftId(allCompletedDrafts[0].draftId);
          return;
        }
      }
      
      // For other tabs or if no completed draft found, use existing logic
      const draft2024 = allDrafts.find(d => d.season === "2024" && isDraftComplete(d.status));
      if (draft2024?.draftId) {
        setSelectedDraftId(draft2024.draftId);
      } else {
        const latestCompleted = allDrafts
          .filter(d => isDraftComplete(d.status))
          .sort((a, b) => parseInt(b.season) - parseInt(a.season))[0];
        if (latestCompleted?.draftId) {
          setSelectedDraftId(latestCompleted.draftId);
        }
      }
    }
  }, [allDrafts, selectedDraftId, activeTab]);

  const userTeamStanding = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeamStanding?.rosterId;
  const currentYear = parseInt(season) + 1;
  const totalRounds = 3;
  const playoffTeams = league?.playoffTeams || 6;
  const totalTeams = league?.totalRosters || 12;

  const rosterNameMap = new Map<number, { name: string; initials: string; avatar?: string | null }>();
  standings?.forEach((s: any) => {
    rosterNameMap.set(s.rosterId, { name: s.name, initials: s.initials, avatar: s.avatar });
  });

  const formattedFuturePicks: DraftPick[] = (draftPicks || [])
    .filter((p: any) => p && p.season === currentYear.toString())
    .filter((p: any) => Number(p.round || 0) > 0 && Number(p.round || 0) <= totalRounds)
    .map((pick: any) => {
      const originalOwner = rosterNameMap.get(pick.originalOwnerId) || { name: `Team ${pick.originalOwnerId}`, initials: "??", avatar: null };
      const currentOwner = rosterNameMap.get(pick.currentOwnerId) || { name: `Team ${pick.currentOwnerId}`, initials: "??", avatar: null };
      
      return {
        round: Number(pick.round || 1),
        pick: Number(pick.rosterId || 0),
        originalOwner: { name: originalOwner.name, initials: originalOwner.initials, avatar: originalOwner.avatar },
        currentOwner: { name: currentOwner.name, initials: currentOwner.initials, avatar: currentOwner.avatar },
        isUserPick: pick.currentOwnerId === userRosterId,
        player: undefined,
      };
    })
    .sort((a: DraftPick, b: DraftPick) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.pick - b.pick;
    });

  const formattedHistoricalPicks: DraftPick[] = (historicalPicks || [])
    .filter((p) => !!p)
    .filter((p) => {
      // For 2023 draft, show all rounds. For other drafts, filter to totalRounds
      if (is2023Draft) return true;
      return Number(p.round || 0) <= totalRounds;
    })
    .filter((p) => {
      // If showing rookies only for 2023 draft, filter to NFL rookies (yearsExp === 0)
      if (is2023Draft && showRookiesOnly) {
        return (p.yearsExp ?? 0) === 0;
      }
      return true;
    })
    .map((pick) => {
      // For historical drafts, use fantasyTeam from snapshot if available
      // Otherwise fall back to rosterNameMap from current league
      const fantasyTeamName = pick.fantasyTeam || `Team ${pick.rosterId}`;
      const owner = rosterNameMap.get(pick.rosterId) || { 
        name: fantasyTeamName, 
        initials: fantasyTeamName.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase() || "??", 
        avatar: null 
      };
      
      const isNFLRookie = is2023Draft && (pick.yearsExp ?? 0) === 0;
      
      return {
        round: Number(pick.round || 1),
        pick: Number(pick.draftSlot || 0),
        originalOwner: { name: fantasyTeamName, initials: owner.initials, avatar: owner.avatar },
        currentOwner: { name: fantasyTeamName, initials: owner.initials, avatar: owner.avatar },
        isUserPick: pick.pickedBy === user?.userId,
        fantasyTeam: fantasyTeamName,
        player: {
          id: pick.playerId || "",
          name: pick.playerName || "Unknown",
          position: pick.position || "",
          team: pick.team || "",
        },
        isNFLRookie,
        rosterId: pick.rosterId ? Number(pick.rosterId) : undefined,
      };
    })
    .sort((a: DraftPick, b: DraftPick) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.pick - b.pick;
    });

  // Filter for completed drafts (for historical tab)
  // Check multiple status values to handle different Sleeper API responses
  const completedDrafts = allDrafts
    .filter(d => isDraftComplete(d.status))
    .sort((a, b) => parseInt(b.season) - parseInt(a.season));

  // Calculate draft odds using Monte Carlo simulation
  // Non-playoff teams get picks 1-5 based on max points (lowest = pick 1)
  // Playoff teams get picks 6-12 based on postseason finish (worst finisher = pick 6, champion = pick 12)
  // Bubble teams have odds spread across all picks based on their playoff probability
  // After regular season ends, eliminated teams are locked into draft slots by points scored
  const calculateDraftOdds = (): DraftOddsTeam[] => {
    if (!standings) return [];

    const SIMULATIONS = 10000;
    const NON_PLAYOFF_PICKS = 5; // Picks 1-5 for non-playoff teams
    
    // Determine if regular season has ended based on playoff_week_start from Sleeper settings
    // Get playoff week start from league (defaults to 15 if not available)
    // Regular season ends at week 14, playoffs run weeks 15-17
    const playoffWeekStart = league?.playoffWeekStart || 15;
    const currentWeek = playoffPredictions?.currentWeek;
    
    // Regular season ends at week (playoff_week_start - 1)
    // Regular season has ended if current week >= playoff_week_start
    // Also check remainingWeeks === 0 as a fallback
    const regularSeasonEnded = currentWeek !== undefined 
      ? currentWeek >= playoffWeekStart 
      : playoffPredictions?.remainingWeeks === 0;

    const predictionMap = new Map(
      (playoffPredictions?.predictions || []).map(p => [p.rosterId, p])
    );

    // Helper function to determine which teams have locked odds
    const getLockedTeams = (): Set<number> => {
      const locked = new Set<number>();
      
      // Eliminated teams lock after regular season ends
      if (regularSeasonEnded) {
        standings.forEach(team => {
          const prediction = predictionMap.get(team.rosterId);
          const makePlayoffsPct = prediction?.makePlayoffsPct ?? (team.rank <= playoffTeams ? 100 : 0);
          if (makePlayoffsPct === 0) {
            locked.add(team.rosterId);
          }
        });
      }
      
      // Playoff teams lock after they lose in the playoffs
      if (bracketData) {
        // Check winners bracket
        bracketData.matchups?.forEach(matchup => {
          if (matchup.loser !== null) {
            locked.add(matchup.loser);
          }
        });
        
        // Check losers bracket (consolation matchups)
        bracketData.consolationMatchups?.forEach(matchup => {
          if (matchup.loser !== null) {
            locked.add(matchup.loser);
          }
        });
      }
      
      return locked;
    };

    const lockedTeams = getLockedTeams();

    // Build list of teams with prediction data
    const teamsWithData: DraftOddsTeam[] = standings.map(team => {
      const pointsFor = Number(team.pointsFor ?? 0);
      const wins = Number(team.wins ?? 0);
      const losses = Number(team.losses ?? 0);
      const prediction = predictionMap.get(team.rosterId);
      const makePlayoffsPct = prediction?.makePlayoffsPct ?? (team.rank <= playoffTeams ? 100 : 0);
      
      // Determine team status
      let status: "eliminated" | "clinched" | "bubble";
      if (makePlayoffsPct === 0) {
        status = "eliminated";
      } else if (makePlayoffsPct >= 100) {
        status = "clinched";
      } else {
        status = "bubble";
      }
      
      const isLocked = lockedTeams.has(team.rosterId);
      
      // If team is locked, use previously stored odds if available
      const storedOdds = isLocked ? lockedOddsRef.current.get(team.rosterId) : undefined;
      
      return {
        rosterId: team.rosterId,
        name: team.name,
        initials: team.initials,
        record: `${wins}-${losses}`,
        wins,
        losses,
        pointsFor,
        isPlayoffTeam: makePlayoffsPct >= 50,
        projectedFinish: undefined,
        maxPoints: pointsFor,
        pickOdds: storedOdds || new Array(totalTeams).fill(0),
        isUser: team.isUser,
        missPlayoffsPct: 100 - makePlayoffsPct,
        makePlayoffsPct,
        projectedWins: prediction?.projectedWins ?? wins,
        status,
        isLocked,
      };
    });

    // Track pick counts per team across simulations
    const pickCounts: Map<number, number[]> = new Map();
    teamsWithData.forEach(team => {
      pickCounts.set(team.rosterId, new Array(totalTeams).fill(0));
    });

    // Bayesian smoothing function to prevent 0%/100% for playoff teams
    // This accounts for upset potential in playoffs
    const smoothProbability = (successes: number, trials: number): number => {
      // Bayesian smoothing: (successes + 1) / (trials + 2)
      // 0/10000 becomes 0.01%, 10000/10000 becomes 99.99%
      const smoothed = (successes + 1) / (trials + 2);
      return Math.round(smoothed * 1000) / 10; // Round to 1 decimal place
    };

    // If regular season has ended, lock eliminated teams into draft slots by points scored
    // Lowest points = Pick 1, highest points among eliminated = Pick 5
    if (regularSeasonEnded) {
      const eliminatedTeams = teamsWithData.filter(t => t.status === "eliminated" && !t.isLocked);
      const lockedEliminatedTeams = teamsWithData.filter(t => t.status === "eliminated" && t.isLocked);
      const clinched = teamsWithData.filter(t => t.status === "clinched" && !t.isLocked);
      const lockedClinchedTeams = teamsWithData.filter(t => t.status === "clinched" && t.isLocked);
      
      // Sort eliminated teams by points (lowest first = pick 1)
      // Include locked eliminated teams in sorting to maintain correct order
      const allEliminatedTeams = teamsWithData.filter(t => t.status === "eliminated");
      allEliminatedTeams.sort((a, b) => a.pointsFor - b.pointsFor);
      
      // Assign 100% odds for eliminated teams (locked in - no uncertainty)
      // Only update odds for non-locked teams, locked teams already have their odds preserved
      eliminatedTeams.forEach((team, index) => {
        // Find the team's position among all eliminated teams
        const positionInAll = allEliminatedTeams.findIndex(t => t.rosterId === team.rosterId);
        if (positionInAll < NON_PLAYOFF_PICKS) {
          team.pickOdds = new Array(totalTeams).fill(0);
          team.pickOdds[positionInAll] = 100;
        }
      });
      
      // For locked eliminated teams, ensure their odds are set correctly if not already set
      lockedEliminatedTeams.forEach(team => {
        const positionInAll = allEliminatedTeams.findIndex(t => t.rosterId === team.rosterId);
        if (positionInAll < NON_PLAYOFF_PICKS && (!team.pickOdds || team.pickOdds.every(odds => odds === 0))) {
          team.pickOdds = new Array(totalTeams).fill(0);
          team.pickOdds[positionInAll] = 100;
        }
      });
      
      
      // For non-locked playoff teams, run Monte Carlo for picks 6-12 based on playoff finish
      if (clinched.length > 0) {
        for (let sim = 0; sim < SIMULATIONS; sim++) {
          // Sort clinched teams with random variance for playoff finish
          const sortedClinched = [...clinched].sort((a, b) => {
            const varianceA = (Math.random() - 0.5) * 2;
            const varianceB = (Math.random() - 0.5) * 2;
            const winsA = (a.projectedWins ?? a.wins) + varianceA;
            const winsB = (b.projectedWins ?? b.wins) + varianceB;
            if (Math.abs(winsA - winsB) > 0.1) return winsA - winsB;
            return a.pointsFor - b.pointsFor;
          });
          
          sortedClinched.forEach((team, index) => {
            const pickPosition = NON_PLAYOFF_PICKS + index;
            if (pickPosition < totalTeams) {
              const counts = pickCounts.get(team.rosterId)!;
              counts[pickPosition]++;
            }
          });
        }
        
        // Convert counts to percentages with Bayesian smoothing for playoff teams
        // This ensures no playoff team shows exactly 0% or 100% for any pick in their range
        clinched.forEach(team => {
          const counts = pickCounts.get(team.rosterId)!;
          team.pickOdds = counts.map((count, pickIndex) => {
            // Only apply smoothing to picks 6-12 (playoff team range)
            if (pickIndex >= NON_PLAYOFF_PICKS && pickIndex < totalTeams) {
              return smoothProbability(count, SIMULATIONS);
            }
            return 0; // Playoff teams have 0% chance at picks 1-5
          });
        });
      }
      
      // Sort teams by their most likely pick position
      teamsWithData.sort((a, b) => {
        const maxOddsA = Math.max(...a.pickOdds);
        const maxOddsB = Math.max(...b.pickOdds);
        const bestPickA = a.pickOdds.indexOf(maxOddsA);
        const bestPickB = b.pickOdds.indexOf(maxOddsB);
        return bestPickA - bestPickB;
      });
      
      // Store locked odds for future recalculations
      teamsWithData.forEach(team => {
        if (team.isLocked) {
          lockedOddsRef.current.set(team.rosterId, team.pickOdds);
        }
      });
      
      return teamsWithData;
    }

    // Run Monte Carlo simulations (regular season still ongoing)
    // Filter out locked teams from simulations
    const unlockedTeams = teamsWithData.filter(t => !t.isLocked);
    
    for (let sim = 0; sim < SIMULATIONS; sim++) {
      // For each simulation, determine which teams make playoffs
      const madePlayoffs: DraftOddsTeam[] = [];
      const missedPlayoffs: DraftOddsTeam[] = [];

      unlockedTeams.forEach(team => {
        const rand = Math.random() * 100;
        if (rand < (team.makePlayoffsPct ?? 0)) {
          madePlayoffs.push(team);
        } else {
          missedPlayoffs.push(team);
        }
      });

      // Ensure we have exactly playoffTeams making playoffs
      // If too many made it, remove the ones with lowest probability
      while (madePlayoffs.length > playoffTeams) {
        madePlayoffs.sort((a, b) => (a.makePlayoffsPct ?? 0) - (b.makePlayoffsPct ?? 0));
        const removed = madePlayoffs.shift()!;
        missedPlayoffs.push(removed);
      }
      // If too few made it, add the ones with highest probability
      while (madePlayoffs.length < playoffTeams && missedPlayoffs.length > 0) {
        missedPlayoffs.sort((a, b) => (b.makePlayoffsPct ?? 0) - (a.makePlayoffsPct ?? 0));
        const added = missedPlayoffs.shift()!;
        madePlayoffs.push(added);
      }

      // Sort missed playoff teams by max points (with random variance for ties)
      // Lowest max points = Pick 1
      const sortedMissed = [...missedPlayoffs].sort((a, b) => {
        // Add small random variance to create uncertainty in close races
        const varianceA = (Math.random() - 0.5) * 50; // +/- 25 points variance
        const varianceB = (Math.random() - 0.5) * 50;
        const pointsA = a.maxPoints + varianceA;
        const pointsB = b.maxPoints + varianceB;
        if (Math.abs(pointsA - pointsB) > 0.1) return pointsA - pointsB;
        return a.wins - b.wins;
      });

      // Sort made playoff teams by projected finish (with random variance)
      // Worst finish = Pick 6, Best finish (champion) = Pick 12
      const sortedMade = [...madePlayoffs].sort((a, b) => {
        // More variance for playoff finish since playoffs are more unpredictable
        const varianceA = (Math.random() - 0.5) * 2; // +/- 1 win variance
        const varianceB = (Math.random() - 0.5) * 2;
        const winsA = (a.projectedWins ?? a.wins) + varianceA;
        const winsB = (b.projectedWins ?? b.wins) + varianceB;
        if (Math.abs(winsA - winsB) > 0.1) return winsA - winsB; // Fewer wins = earlier pick
        return a.pointsFor - b.pointsFor;
      });

      // Assign picks for this simulation
      // Non-playoff teams get picks 1-5
      sortedMissed.forEach((team, index) => {
        if (index < NON_PLAYOFF_PICKS) {
          const counts = pickCounts.get(team.rosterId)!;
          counts[index]++;
        }
      });

      // Playoff teams get picks 6-12 (or 6 to totalTeams)
      sortedMade.forEach((team, index) => {
        const pickPosition = NON_PLAYOFF_PICKS + index;
        if (pickPosition < totalTeams) {
          const counts = pickCounts.get(team.rosterId)!;
          counts[pickPosition]++;
        }
      });
    }

    // Convert counts to percentages (preserve to thousandth place)
    // Only update odds for unlocked teams
    unlockedTeams.forEach(team => {
      const counts = pickCounts.get(team.rosterId)!;
      team.pickOdds = counts.map(count => (count / SIMULATIONS) * 100);
    });

    // Apply minimum floor of 0.001% for all picks within each team's competitive range
    // This represents the "upset" factor - any team can theoretically get any pick in their range
    // Skip this for locked teams as their odds are already finalized
    const MIN_ODDS = 0.001;
    unlockedTeams.forEach(team => {
      // Determine the pick range for this team based on status
      let pickRange: [number, number];
      if (team.status === "eliminated") {
        // Eliminated teams compete for picks 1-5 (indices 0-4)
        pickRange = [0, NON_PLAYOFF_PICKS - 1];
      } else if (team.status === "clinched") {
        // Clinched teams compete for picks 6-12 (indices 5-11)
        pickRange = [NON_PLAYOFF_PICKS, totalTeams - 1];
      } else {
        // Bubble teams can get any pick
        pickRange = [0, totalTeams - 1];
      }

      // Apply minimum floor within the range
      let adjustmentNeeded = 0;
      for (let i = pickRange[0]; i <= pickRange[1]; i++) {
        if (team.pickOdds[i] < MIN_ODDS) {
          adjustmentNeeded += MIN_ODDS - team.pickOdds[i];
          team.pickOdds[i] = MIN_ODDS;
        }
      }

      // Redistribute the adjustment from picks that have room to spare
      if (adjustmentNeeded > 0) {
        const picksWithRoom = [];
        for (let i = pickRange[0]; i <= pickRange[1]; i++) {
          if (team.pickOdds[i] > MIN_ODDS) {
            picksWithRoom.push(i);
          }
        }
        if (picksWithRoom.length > 0) {
          const reduction = adjustmentNeeded / picksWithRoom.length;
          picksWithRoom.forEach(i => {
            team.pickOdds[i] = Math.max(MIN_ODDS, team.pickOdds[i] - reduction);
          });
        }
      }
    });

    // Sort teams by their most likely pick position
    teamsWithData.sort((a, b) => {
      const maxOddsA = Math.max(...a.pickOdds);
      const maxOddsB = Math.max(...b.pickOdds);
      const bestPickA = a.pickOdds.indexOf(maxOddsA);
      const bestPickB = b.pickOdds.indexOf(maxOddsB);
      return bestPickA - bestPickB;
    });

    // Store locked odds for future recalculations
    teamsWithData.forEach(team => {
      if (team.isLocked) {
        lockedOddsRef.current.set(team.rosterId, team.pickOdds);
      }
    });

    return teamsWithData;
  };

  const draftOddsTeams = calculateDraftOdds();

  const renderDraftGrid = (picks: DraftPick[], showPlayers: boolean) => {
    if (!picks || picks.length === 0) {
      return <p className="text-center text-muted-foreground py-8">No picks available</p>;
    }
    
    const teamsCount = league?.totalRosters || 12;
    // Calculate max rounds from picks (for 2023 draft which may have more than totalRounds)
    const maxRounds = picks.length > 0 ? Math.max(...picks.map(p => p.round || 1)) : totalRounds;
    const displayRounds = is2023Draft ? Math.max(maxRounds, 1) : totalRounds;
    
    // For historical drafts, create a mapping from rosterId to display order
    // Get unique rosterIds from picks and sort them
    const uniqueRosterIds = Array.from(new Set(
      picks
        .map(p => {
          // For historical picks, we need to get rosterId from the pick data
          // Check if pick has a rosterId property (from historical picks)
          const rosterId = p.rosterId ?? p.pick;
          return rosterId && !isNaN(Number(rosterId)) ? Number(rosterId) : null;
        })
        .filter((id): id is number => id !== null)
    )).sort((a, b) => a - b);
    
    // Create rosterId to team index mapping
    const rosterIdToIndex = new Map<number, number>();
    uniqueRosterIds.forEach((rosterId, index) => {
      rosterIdToIndex.set(rosterId, index);
    });
    
    return (
      <ScrollArea className="w-full">
        <div className="min-w-[600px]">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${displayRounds}, minmax(180px, 1fr))` }}>
            {Array.from({ length: displayRounds }, (_, i) => (
              <div key={i} className="text-center font-medium text-sm p-2 bg-muted rounded-md">
                Round {i + 1}
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-2">
            {Array.from({ length: Math.max(teamsCount, uniqueRosterIds.length || teamsCount) }, (_, teamIndex) => {
              // For historical drafts, use the rosterId from the mapping
              // For future drafts, use teamIndex + 1
              let targetRosterId: number;
              if (is2023Draft && uniqueRosterIds.length > 0) {
                if (teamIndex >= uniqueRosterIds.length) {
                  return null; // Skip rows beyond available rosterIds
                }
                targetRosterId = uniqueRosterIds[teamIndex];
              } else {
                targetRosterId = teamIndex + 1;
              }
              
              return (
                <div
                  key={teamIndex}
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${displayRounds}, minmax(180px, 1fr))` }}
                >
                  {Array.from({ length: displayRounds }, (_, roundIndex) => {
                    const pick = picks.find((p) => {
                      try {
                        if (is2023Draft && p.rosterId !== undefined && p.rosterId !== null) {
                          // For 2023 draft, match by rosterId
                          return p.round === roundIndex + 1 && p.rosterId === targetRosterId;
                        } else {
                          // For other drafts, match by pick number (which is rosterId for future picks, draftSlot for historical)
                          return p.round === roundIndex + 1 && p.pick === targetRosterId;
                        }
                      } catch (error) {
                        console.error("Error matching pick:", error, p);
                        return false;
                      }
                    });
                    if (!pick) return <div key={roundIndex} className="h-20" />;

                  const isTraded = pick.originalOwner?.initials !== pick.currentOwner?.initials;

                  return (
                    <div
                      key={roundIndex}
                      className={`p-2 rounded-md border border-border hover-elevate ${
                        pick.isUserPick ? "bg-primary/10 border-primary/30" : "bg-card"
                      }`}
                      data-testid={`pick-${pick.round}-${pick.pick}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {pick.round}.{String(pick.pick || "").padStart(2, "0")}
                        </span>
                        {isTraded && !showPlayers && pick.originalOwner?.initials && (
                          <Badge variant="outline" className="text-[10px] px-1">
                            via {pick.originalOwner.initials}
                          </Badge>
                        )}
                      </div>

                      {pick.player ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            <AvatarImage 
                              src={`https://sleepercdn.com/content/nfl/players/${pick.player.id}.jpg`}
                              alt={pick.player.name || ""}
                            />
                            <AvatarFallback className="text-xs">
                              {(pick.player.name || "").split(" ").map((n) => n[0]).join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{pick.player.name || "Unknown"}</p>
                            <div className="flex items-center gap-1 flex-wrap">
                              {pick.player.position && (
                                <Badge
                                  className={`text-[10px] px-1.5 ${
                                    positionColors[pick.player.position] || "bg-muted"
                                  }`}
                                >
                                  {pick.player.position}
                                </Badge>
                              )}
                              {pick.isNFLRookie && (
                                <Badge className="text-[10px] px-1.5 bg-green-500 text-white">
                                  NFL Rookie
                                </Badge>
                              )}
                              {pick.player.team && (
                                <span className="text-xs text-muted-foreground">
                                  {pick.player.team}
                                </span>
                              )}
                            </div>
                            {pick.fantasyTeam && (
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {pick.fantasyTeam}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            {pick.currentOwner?.avatar && (
                              <AvatarImage src={pick.currentOwner.avatar} alt={pick.currentOwner?.name || ""} />
                            )}
                            <AvatarFallback
                              className={`text-xs ${
                                pick.isUserPick
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              {pick.currentOwner?.initials || "??"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground truncate">
                            {pick.currentOwner?.name || "Unknown Team"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              );
            })}
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
  };

  if (!league) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view draft capital.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Draft Board</h1>
        <p className="text-muted-foreground">View draft capital, historical picks, and projected draft order</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <CardTitle className="font-heading text-lg">Draft Picks</CardTitle>
              <Badge variant="outline">
                {activeTab === "future" 
                  ? currentYear 
                  : activeTab === "historical" 
                    ? (selectedDraftId ? completedDrafts.find(d => d.draftId === selectedDraftId)?.season : "")
                    : `${currentYear} Odds`
                }
              </Badge>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "future" | "historical" | "odds")}>
              <TabsList>
                <TabsTrigger value="future" data-testid="tab-future-draft">
                  Future Picks
                </TabsTrigger>
                <TabsTrigger value="historical" data-testid="tab-historical-draft">
                  Historical
                </TabsTrigger>
                <TabsTrigger value="odds" data-testid="tab-draft-odds">
                  <Dice1 className="w-4 h-4 mr-1" />
                  Draft Odds
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeTab === "future" ? (
            <>
              <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-primary/30 border border-primary/50" />
                  <span>Your Picks</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1">
                    via XX
                  </Badge>
                  <span>Traded Pick</span>
                </div>
              </div>
              {picksLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : formattedFuturePicks.length > 0 ? (
                renderDraftGrid(formattedFuturePicks, false)
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No draft pick data available
                </p>
              )}
            </>
          ) : activeTab === "historical" ? (
            <div className="space-y-4">
              {(draftsLoading || historicalDraftsLoading) ? (
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-9 w-32" />
                  ))}
                </div>
              ) : completedDrafts.length > 0 ? (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {completedDrafts.map((draft) => (
                      <Button
                        key={draft.draftId}
                        variant={selectedDraftId === draft.draftId ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedDraftId(draft.draftId)}
                        data-testid={`draft-button-${draft.season}`}
                      >
                        <Calendar className="w-4 h-4 mr-1.5" />
                        {draft.season} {draft.type === "startup" ? "Startup" : "Rookie"}
                      </Button>
                    ))}
                  </div>

                  {selectedDraftId ? (
                    historicalLoading ? (
                      <div className="space-y-2">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : formattedHistoricalPicks.length > 0 ? (
                      <>
                        {is2023Draft && (
                          <div className="flex items-center gap-2 mb-4 p-3 bg-muted rounded-md">
                            <Switch
                              id="show-rookies-only"
                              checked={showRookiesOnly}
                              onCheckedChange={setShowRookiesOnly}
                            />
                            <Label htmlFor="show-rookies-only" className="text-sm cursor-pointer">
                              Show NFL Rookies Only
                            </Label>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.QB}`}>QB</Badge>
                            <span>Quarterback</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.RB}`}>RB</Badge>
                            <span>Running Back</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.WR}`}>WR</Badge>
                            <span>Wide Receiver</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 ${positionColors.TE}`}>TE</Badge>
                            <span>Tight End</span>
                          </div>
                        </div>
                        {renderDraftGrid(formattedHistoricalPicks, true)}
                      </>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        No picks found for this draft
                      </p>
                    )
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Select a draft to view results
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <p>No historical drafts found.</p>
                  {drafts && drafts.length > 0 && (
                    <p className="text-xs mt-2">
                      Found {drafts.length} total drafts. 
                      Completed drafts: {drafts.filter((d: any) => isDraftComplete(d.status)).length}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <CardDescription>
                Probabilities based on 10,000 Monte Carlo simulations. Non-playoff teams compete for picks 1-5 (lowest max points = Pick 1). 
                Playoff teams get picks 6-12 based on postseason finish (worst = Pick 6, champion = Pick 12). 
                Bubble teams have odds spread across all picks based on their playoff probability.
              </CardDescription>
              
              <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <span>Eliminated (Picks 1-5)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-chart-3" />
                  <span>Bubble (Any Pick)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-primary" />
                  <span>Clinched (Picks 6-12)</span>
                </div>
              </div>

              <ScrollArea className="w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10">Team</TableHead>
                      <TableHead className="text-center">Record</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Points For</TableHead>
                      {Array.from({ length: Math.min(totalTeams, 12) }, (_, i) => (
                        <TableHead key={i} className="text-center w-16">
                          Pick {i + 1}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftOddsTeams.map((team, index) => (
                      <TableRow 
                        key={team.rosterId}
                        className={team.isUser ? "bg-primary/5" : ""}
                        data-testid={`draft-odds-row-${team.rosterId}`}
                      >
                        <TableCell className="sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback
                                className={`text-xs ${
                                  team.isUser
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                {team.initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className={`font-medium ${team.isUser ? "text-primary" : ""}`}>
                              {team.name}
                            </span>
                            {team.isUser && (
                              <Badge variant="outline" className="text-xs">
                                You
                              </Badge>
                            )}
                            {team.isLocked && (
                              <Badge variant="outline" className="text-xs ml-1">
                                <Lock className="w-3 h-3 mr-1" />
                                Locked
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium">
                          {team.record}
                        </TableCell>
                        <TableCell className="text-center">
                          {team.status === "clinched" ? (
                            <Badge className="bg-primary text-primary-foreground">
                              <Trophy className="w-3 h-3 mr-1" />
                              Clinched
                            </Badge>
                          ) : team.status === "eliminated" ? (
                            <Badge variant="destructive">
                              <TrendingDown className="w-3 h-3 mr-1" />
                              Eliminated
                            </Badge>
                          ) : (
                            <Badge className="bg-chart-3 text-white">
                              {Math.round(team.makePlayoffsPct ?? 0)}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(team.pointsFor ?? 0).toFixed(1)}
                        </TableCell>
                        {Array.from({ length: Math.min(totalTeams, 12) }, (_, pickIndex) => {
                          const odds = team.pickOdds[pickIndex] || 0;
                          const maxOdds = Math.max(...team.pickOdds);
                          const isHighest = odds === maxOdds && odds > 0;
                          
                          let bgClass = "";
                          if (odds >= 50) {
                            bgClass = "bg-primary/30 font-bold text-primary";
                          } else if (odds >= 25) {
                            bgClass = "bg-primary/15 font-medium";
                          } else if (odds >= 10) {
                            bgClass = "bg-muted/80";
                          } else if (odds > 0) {
                            bgClass = "bg-muted/40 text-muted-foreground";
                          }
                          
                          return (
                            <TableCell 
                              key={pickIndex} 
                              className={`text-center tabular-nums text-sm ${bgClass} ${isHighest ? "ring-2 ring-primary ring-inset" : ""}`}
                            >
                              {odds > 0 ? `${odds.toFixed(3)}%` : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
