import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Radar, Swords, Trophy } from "lucide-react";
import { PlayerDetailModal } from "@/components/PlayerDetailModal";
import MatchupScoutingReport from "@/components/MatchupScoutingReport";

interface MatchupPlayer {
  id: string;
  name: string;
  position: string;
  team: string;
  points: number;
  projectedPoints: number;
  boom: number;
  bust: number;
  gamesPlayed: number;
  status?: string | null;
  isOnBye?: boolean;
}

interface MatchupTeam {
  rosterId: number;
  name: string;
  initials: string;
  avatar: string | null;
  score: number;
  projectedTotal: number;
  record: string;
  starters: MatchupPlayer[];
  bench: MatchupPlayer[];
  maxPointsFor?: number;
}

interface MatchupData {
  userTeam: MatchupTeam;
  opponentTeam: MatchupTeam | null;
  week: number;
}

const positionColors: Record<string, string> = {
  QB: "bg-red-500 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-gray-500 text-white",
  FLEX: "bg-teal-500 text-white",
};

const posAccent: Record<string, string> = {
  QB: "#F472B6",
  RB: "#34D399",
  WR: "#60A5FA",
  TE: "#FBBF24",
  K: "#A78BFA",
  DEF: "#94A3B8",
  FLEX: "#2DD4BF",
};

interface RosterSlot {
  slotLabel: string;
  position: string;
  userPlayer: MatchupPlayer | null;
  opponentPlayer: MatchupPlayer | null;
}

const OUT_STATUSES = new Set(["OUT", "IR", "PUP", "SUS", "NA", "DNR"]);

/** A starter who has not scored yet and is expected to play. */
function isYetToPlay(p: MatchupPlayer | null | undefined): p is MatchupPlayer {
  if (!p) return false;
  if (p.points !== 0 || p.isOnBye) return false;
  if (p.status && OUT_STATUSES.has(p.status.toUpperCase())) return false;
  return true;
}

function normCdf(z: number): number {
  // Abramowitz and Stegun 7.1.26 approximation of the error function
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Win probability from the current score plus projections for players who have not played yet.
 * Each remaining player's spread comes from the boom value (projection + 1.25 standard deviations).
 */
function computeWinProbability(user: MatchupTeam, opp: MatchupTeam): number {
  const remU = user.starters.filter(isYetToPlay);
  const remO = opp.starters.filter(isYetToPlay);
  const mean =
    user.score +
    remU.reduce((s, p) => s + (p.projectedPoints || 0), 0) -
    (opp.score + remO.reduce((s, p) => s + (p.projectedPoints || 0), 0));
  const sd = (p: MatchupPlayer) => Math.max(2, ((p.boom || 0) - (p.projectedPoints || 0)) / 1.25);
  const variance = [...remU, ...remO].reduce((s, p) => s + sd(p) ** 2, 0);
  if (variance === 0) return mean > 0 ? 100 : mean < 0 ? 0 : 50;
  const pct = Math.round(normCdf(mean / Math.sqrt(variance)) * 100);
  return Math.min(99, Math.max(1, pct));
}

function PlayerPhoto({ player, size = 36 }: { player: MatchupPlayer; size?: number }) {
  const [failed, setFailed] = useState(false);
  const isDef = player.position === "DEF";
  const src = isDef
    ? `https://sleepercdn.com/images/team_logos/nfl/${(player.team || player.id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/${player.id}.jpg`;
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-slate-900"
      style={{ width: size, height: size, background: posAccent[player.position] || "#94A3B8" }}
    >
      {failed ? (
        initials
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={isDef ? "h-full w-full object-contain p-1" : "h-full w-full object-cover object-top"}
        />
      )}
    </span>
  );
}

function StatusTag({ player }: { player: MatchupPlayer }) {
  if (player.status) return <span className="ml-1 text-xs text-destructive font-normal">({player.status})</span>;
  if (player.isOnBye) return <span className="ml-1 text-xs text-muted-foreground font-normal">(BYE)</span>;
  return null;
}

function ProjLine({ player }: { player: MatchupPlayer }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="tabular-nums cursor-help">
          <span className={player.projectedPoints === 0 ? "text-muted-foreground" : "text-foreground"}>{player.projectedPoints}</span>
          <span className="mx-1">·</span>
          <span className="text-chart-2">{player.boom}</span>
          <span className="mx-0.5">/</span>
          <span className="text-destructive">{player.bust}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p className="font-medium">Projected: {player.projectedPoints} pts</p>
        {(player.status || player.isOnBye) && (
          <p className="text-destructive">{player.status || "On Bye"} - Not expected to play</p>
        )}
        <p>Boom/Bust Range: {player.boom} / {player.bust}</p>
        <p className="text-muted-foreground">
          Based on{" "}
          {player.gamesPlayed >= 3
            ? `${player.gamesPlayed} games`
            : player.gamesPlayed > 0
              ? `${player.gamesPlayed} game (blended)`
              : "position avg"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/** One side of a bar: solid fill is points scored, dashed outline is the projection. */
function PointsBar({
  points,
  projected,
  max,
  align,
}: {
  points: number;
  projected: number;
  max: number;
  align: "right" | "left";
}) {
  const w = Math.min(100, (points / max) * 100);
  const pw = Math.min(100, (projected / max) * 100);
  const side = align === "right" ? { right: 0 } : { left: 0 };
  // Color by progress toward projection: hit it, close, well under, or not scored yet
  const ratio = projected > 0 ? points / projected : points > 0 ? 1 : 0;
  const fill =
    points <= 0 ? "bg-muted-foreground/40" : ratio >= 1 ? "bg-emerald-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="relative h-6 rounded-md bg-muted/40">
      <span className="absolute inset-y-0 rounded-md border border-dashed border-muted-foreground/40" style={{ ...side, width: `${pw}%` }} />
      <span
        className={`absolute inset-y-[3px] rounded ${fill}`}
        style={{ ...side, width: `${w}%` }}
      />
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums ${align === "right" ? "left-2" : "right-2"}`}
      >
        {points.toFixed(2)}
      </span>
    </div>
  );
}

export default function Matchup() {
  const { user, league, currentWeek } = useSleeper();
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "preview">("live");

  const { data: matchup, isLoading } = useQuery<MatchupData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "matchup-detail", user?.userId, selectedWeek],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/matchup-detail?userId=${user?.userId}&week=${selectedWeek}`
      );
      if (!res.ok) throw new Error("Failed to fetch matchup");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const handlePrevWeek = () => {
    if (selectedWeek > 1) setSelectedWeek(selectedWeek - 1);
  };

  const handleNextWeek = () => {
    if (selectedWeek < 18) setSelectedWeek(selectedWeek + 1);
  };

  const userTeam = matchup?.userTeam;
  const opponentTeam = matchup?.opponentTeam;
  const userWinning = userTeam && opponentTeam && userTeam.score > opponentTeam.score;
  const isTied = userTeam && opponentTeam && userTeam.score === opponentTeam.score;
  const isWeekCompleted = selectedWeek < currentWeek;
  const scoreDiff = userTeam && opponentTeam
    ? Math.abs(userTeam.score - opponentTeam.score).toFixed(2)
    : "0.00";

  const { rosterSlots, maxPoints } = useMemo(() => {
    if (!userTeam) {
      return { rosterSlots: [], maxPoints: 0 };
    }

    const userStarters = [...userTeam.starters].filter(p => p != null);
    const opponentStarters = opponentTeam ? [...opponentTeam.starters].filter(p => p != null) : [];

    const allPoints = [
      ...userStarters.flatMap(p => [p?.points ?? 0, p?.projectedPoints ?? 0]),
      ...opponentStarters.flatMap(p => [p?.points ?? 0, p?.projectedPoints ?? 0]),
    ].filter(points => typeof points === "number");

    const maxPts = allPoints.length > 0 ? Math.max(...allPoints, 1) : 1;

    const slotOrder = ["QB", "RB1", "RB2", "WR1", "WR2", "TE", "FLEX1", "FLEX2", "K", "DEF"];

    const assignPlayersToSlots = (starters: MatchupPlayer[]): Map<string, MatchupPlayer | null> => {
      const slots = new Map<string, MatchupPlayer | null>();
      slotOrder.forEach(slot => slots.set(slot, null));

      const available = [...starters].filter(p => p != null);

      const findAndAssign = (slotName: string, positions: string[]) => {
        const idx = available.findIndex(p => p != null && positions.includes(p.position));
        if (idx !== -1) {
          const player = available.splice(idx, 1)[0];
          if (player != null) {
            slots.set(slotName, player);
          }
        }
      };

      findAndAssign("QB", ["QB"]);
      findAndAssign("RB1", ["RB"]);
      findAndAssign("RB2", ["RB"]);
      findAndAssign("WR1", ["WR"]);
      findAndAssign("WR2", ["WR"]);
      findAndAssign("TE", ["TE"]);
      findAndAssign("FLEX1", ["RB", "WR", "TE"]);
      findAndAssign("FLEX2", ["RB", "WR", "TE"]);
      findAndAssign("K", ["K"]);
      findAndAssign("DEF", ["DEF"]);

      return slots;
    };

    const userSlots = assignPlayersToSlots(userStarters);
    const opponentSlots = assignPlayersToSlots(opponentStarters);

    const slots: RosterSlot[] = slotOrder.map(slotLabel => {
      const basePosition = slotLabel.replace(/[0-9]/g, "");
      return {
        slotLabel,
        position: basePosition,
        userPlayer: userSlots.get(slotLabel) || null,
        opponentPlayer: opponentSlots.get(slotLabel) || null,
      };
    });

    return { rosterSlots: slots, maxPoints: maxPts };
  }, [userTeam, opponentTeam]);

  // Win probability, yet-to-play totals and position edge
  const live = useMemo(() => {
    if (!userTeam || !opponentTeam) return null;
    let userWinPct: number;
    if (isWeekCompleted) {
      userWinPct = userTeam.score > opponentTeam.score ? 100 : userTeam.score < opponentTeam.score ? 0 : 50;
    } else {
      userWinPct = computeWinProbability(userTeam, opponentTeam);
    }
    const remU = userTeam.starters.filter(isYetToPlay);
    const remO = opponentTeam.starters.filter(isYetToPlay);
    const sumProj = (list: MatchupPlayer[]) => list.reduce((s, p) => s + (p.projectedPoints || 0), 0);

    const groups = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const edge = groups.map((pos) => {
      const u = userTeam.starters.filter((p) => p?.position === pos).reduce((s, p) => s + (p.points || 0), 0);
      const o = opponentTeam.starters.filter((p) => p?.position === pos).reduce((s, p) => s + (p.points || 0), 0);
      const total = u + o;
      return { pos, user: u, opp: o, diff: u - o, share: total > 0 ? (u / total) * 100 : 50 };
    });

    return {
      userWinPct,
      oppWinPct: 100 - userWinPct,
      remainingUser: { count: remU.length, proj: sumProj(remU) },
      remainingOpp: { count: remO.length, proj: sumProj(remO) },
      edge,
    };
  }, [userTeam, opponentTeam, isWeekCompleted]);

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view your matchup.
          </p>
        </div>
      </div>
    );
  }

  const statusBadge = () => {
    const label = isWeekCompleted
      ? isTied
        ? `Tied ${scoreDiff !== "0.00" ? `(${scoreDiff} pts)` : ""}`
        : userWinning
          ? `Won by ${scoreDiff} pts`
          : `Lost by ${scoreDiff} pts`
      : isTied
        ? `Tied ${scoreDiff !== "0.00" ? `(${scoreDiff} pts)` : ""}`
        : userWinning
          ? `Winning by ${scoreDiff} pts`
          : `Trailing by ${scoreDiff} pts`;
    return (
      <Badge variant={userWinning ? "default" : isTied ? "outline" : "secondary"} className="px-4 py-1">
        {userWinning && <Trophy className="w-3 h-3 mr-1" />}
        {label}
      </Badge>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl font-bold">Matchup</h1>
          <p className="text-muted-foreground">View your weekly head-to-head matchup</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePrevWeek}
            disabled={selectedWeek <= 1}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Badge variant="outline" className="px-3 py-1.5" data-testid="badge-current-week">
            Week {selectedWeek}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNextWeek}
            disabled={selectedWeek >= 18}
            data-testid="button-next-week"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "live" | "preview")}>
        <TabsList className="mb-4">
          <TabsTrigger value="live" className="gap-2" data-testid="tab-live-matchup">
            <Swords className="w-4 h-4" />
            Live Matchup
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2" data-testid="tab-matchup-preview">
            <Radar className="w-4 h-4" />
            Scouting Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-0">
          {isLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : userTeam && opponentTeam && live ? (
            <div className="space-y-6">
              {/* Score header */}
              <Card className="bg-gradient-to-r from-primary/10 via-transparent to-muted/50">
                <CardContent className="py-5 sm:py-6 space-y-4">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left min-w-0">
                      <Avatar className="w-12 h-12 sm:w-16 sm:h-16 ring-2 ring-primary ring-offset-2 ring-offset-background">
                        {userTeam.avatar && <AvatarImage src={userTeam.avatar} alt={userTeam.name} />}
                        <AvatarFallback className="bg-primary text-primary-foreground text-lg sm:text-xl font-bold">
                          {userTeam.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-heading font-bold text-sm sm:text-lg truncate" data-testid="text-user-name">{userTeam.name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">{userTeam.record}</p>
                        {userTeam.maxPointsFor !== undefined && selectedWeek <= currentWeek && (
                          <p className="text-xs text-muted-foreground">Max PF: {userTeam.maxPointsFor.toFixed(2)}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6">
                      <div className="text-center">
                        <p className={`text-2xl sm:text-4xl font-bold tabular-nums ${userWinning ? "text-primary" : ""}`} data-testid="text-user-score">
                          {userTeam.score.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">Proj: {userTeam.projectedTotal.toFixed(2)}</p>
                      </div>
                      <span className="text-sm sm:text-xl font-bold text-muted-foreground">VS</span>
                      <div className="text-center">
                        <p className={`text-2xl sm:text-4xl font-bold tabular-nums ${!userWinning && !isTied ? "text-primary" : ""}`} data-testid="text-opponent-score">
                          {opponentTeam.score.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">Proj: {opponentTeam.projectedTotal.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-4 text-center sm:text-right min-w-0">
                      <div className="min-w-0">
                        <p className="font-heading font-bold text-sm sm:text-lg truncate" data-testid="text-opponent-name">{opponentTeam.name}</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">{opponentTeam.record}</p>
                        {opponentTeam.maxPointsFor !== undefined && selectedWeek <= currentWeek && (
                          <p className="text-xs text-muted-foreground">Max PF: {opponentTeam.maxPointsFor.toFixed(2)}</p>
                        )}
                      </div>
                      <Avatar className="w-12 h-12 sm:w-16 sm:h-16">
                        {opponentTeam.avatar && <AvatarImage src={opponentTeam.avatar} alt={opponentTeam.name} />}
                        <AvatarFallback className="bg-muted text-muted-foreground text-lg sm:text-xl font-bold">
                          {opponentTeam.initials}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>

                  <div className="flex justify-center">{statusBadge()}</div>

                  <div className="px-1 sm:px-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-emerald-500">{live.userWinPct}%</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground text-[10px] uppercase tracking-wide cursor-help">Win Probability</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          Based on the current score plus projections for players who haven't scored yet, with each player's boom/bust spread.
                        </TooltipContent>
                      </Tooltip>
                      <span className="font-medium text-red-500">{live.oppWinPct}%</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden flex bg-muted" data-testid="win-probability-bar">
                      <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${live.userWinPct}%` }} data-testid="win-probability-user" />
                      <div className="bg-red-500 transition-all duration-500" style={{ width: `${live.oppWinPct}%` }} data-testid="win-probability-opponent" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                {/* Positional matchup */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-lg">Positional Matchup</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Solid bar is points scored (<span className="text-emerald-500">green</span> hit projection, <span className="text-amber-500">amber</span> within 30%, <span className="text-red-500">red</span> well under, grey not scored yet). Dashed outline is the projection. Under each name: projection · <span className="text-chart-2">boom</span>/<span className="text-destructive">bust</span>.
                    </p>
                  </CardHeader>
                  <CardContent>
                    {rosterSlots.map((slot, index) => {
                      const userPts = slot.userPlayer?.points ?? 0;
                      const oppPts = slot.opponentPlayer?.points ?? 0;
                      const badge = (
                        <Badge className={`text-[10px] px-1.5 h-5 w-12 justify-center shrink-0 ${positionColors[slot.position] || "bg-muted text-muted-foreground"}`}>
                          {slot.slotLabel}
                        </Badge>
                      );
                      const userSide = slot.userPlayer ? (
                        <div className="flex items-center justify-end gap-2.5 min-w-0 flex-row-reverse">
                          <PlayerPhoto player={slot.userPlayer} />
                          <div className="min-w-0 text-right">
                            <button
                              onClick={() => setSelectedPlayer({ id: slot.userPlayer!.id, name: slot.userPlayer!.name })}
                              className="text-sm font-medium truncate hover:text-primary hover:underline transition-colors max-w-full"
                              data-testid={`player-button-user-${slot.slotLabel}`}
                            >
                              {slot.userPlayer.name}
                              <StatusTag player={slot.userPlayer} />
                            </button>
                            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                              <ProjLine player={slot.userPlayer} />
                              <span>{slot.userPlayer.team}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-right">—</p>
                      );
                      const oppSide = slot.opponentPlayer ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PlayerPhoto player={slot.opponentPlayer} />
                          <div className="min-w-0 text-left">
                            <button
                              onClick={() => setSelectedPlayer({ id: slot.opponentPlayer!.id, name: slot.opponentPlayer!.name })}
                              className="text-sm font-medium truncate hover:text-primary hover:underline transition-colors max-w-full"
                              data-testid={`player-button-opp-${slot.slotLabel}`}
                            >
                              {slot.opponentPlayer.name}
                              <StatusTag player={slot.opponentPlayer} />
                            </button>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{slot.opponentPlayer.team}</span>
                              <ProjLine player={slot.opponentPlayer} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      );
                      return (
                        <div
                          key={`${slot.slotLabel}-${index}`}
                          className="py-2 border-b border-border last:border-0"
                          data-testid={`matchup-row-${slot.slotLabel}`}
                        >
                          {/* Desktop */}
                          <div className="hidden md:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_52px_minmax(0,1fr)_minmax(0,1.1fr)] gap-3 items-center">
                            {userSide}
                            <PointsBar
                              points={userPts}
                              projected={slot.userPlayer?.projectedPoints ?? 0}
                              max={maxPoints}
                              align="right"
                            />
                            <div className="flex justify-center">{badge}</div>
                            <PointsBar
                              points={oppPts}
                              projected={slot.opponentPlayer?.projectedPoints ?? 0}
                              max={maxPoints}
                              align="left"
                            />
                            {oppSide}
                          </div>
                          {/* Phone */}
                          <div className="md:hidden grid grid-cols-[minmax(0,1fr)_76px_minmax(0,1fr)] gap-2 items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              {slot.userPlayer && <PlayerPhoto player={slot.userPlayer} size={30} />}
                              <div className="min-w-0">
                                <button
                                  onClick={() => slot.userPlayer && setSelectedPlayer({ id: slot.userPlayer.id, name: slot.userPlayer.name })}
                                  className="block max-w-full truncate text-xs font-semibold text-left"
                                >
                                  {slot.userPlayer ? slot.userPlayer.name.split(" ").slice(-1)[0] : "—"}
                                </button>
                                <span className="text-[11px] text-muted-foreground">proj {slot.userPlayer?.projectedPoints ?? 0}</span>
                              </div>
                            </div>
                            <div className="text-center">
                              {badge}
                              <div className="mt-0.5 text-xs font-bold tabular-nums">
                                <span className={userPts > oppPts ? "text-primary" : ""}>{userPts.toFixed(1)}</span>
                                <span className="text-muted-foreground mx-1">-</span>
                                <span className={oppPts > userPts ? "text-primary" : ""}>{oppPts.toFixed(1)}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 min-w-0 flex-row-reverse">
                              {slot.opponentPlayer && <PlayerPhoto player={slot.opponentPlayer} size={30} />}
                              <div className="min-w-0 text-right">
                                <button
                                  onClick={() => slot.opponentPlayer && setSelectedPlayer({ id: slot.opponentPlayer.id, name: slot.opponentPlayer.name })}
                                  className="block max-w-full truncate text-xs font-semibold text-right"
                                >
                                  {slot.opponentPlayer ? slot.opponentPlayer.name.split(" ").slice(-1)[0] : "—"}
                                </button>
                                <span className="text-[11px] text-muted-foreground">proj {slot.opponentPlayer?.projectedPoints ?? 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Sidebar */}
                <div className="space-y-6">
                  {!isWeekCompleted && (
                    <Card data-testid="card-still-to-play">
                      <CardHeader className="pb-3">
                        <CardTitle className="font-heading text-lg">Still to Play</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{userTeam.name}</span>
                          <b className="tabular-nums whitespace-nowrap">
                            {live.remainingUser.count} starter{live.remainingUser.count === 1 ? "" : "s"} · proj {live.remainingUser.proj.toFixed(1)}
                          </b>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{opponentTeam.name}</span>
                          <b className="tabular-nums whitespace-nowrap">
                            {live.remainingOpp.count} starter{live.remainingOpp.count === 1 ? "" : "s"} · proj {live.remainingOpp.proj.toFixed(1)}
                          </b>
                        </div>
                        <p className="text-xs text-muted-foreground">Starters who haven't scored yet and aren't out or on bye.</p>
                      </CardContent>
                    </Card>
                  )}

                  <Card data-testid="card-position-edge">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-heading text-lg">Position Edge</CardTitle>
                      <p className="text-xs text-muted-foreground">Points scored by position group vs your opponent</p>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {live.edge.map((e) => (
                        <div key={e.pos} className="grid grid-cols-[34px_1fr_52px] items-center gap-2">
                          <b className="text-sm" style={{ color: posAccent[e.pos] }}>{e.pos}</b>
                          <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
                            <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${e.share}%` }} />
                          </div>
                          <span className={`text-right text-xs font-bold tabular-nums ${e.diff > 0 ? "text-emerald-500" : e.diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {e.diff > 0 ? "+" : ""}{e.diff.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-bench">
                    <CardHeader className="pb-3">
                      <CardTitle className="font-heading text-lg">Your Bench</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {userTeam.bench.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No bench players.</p>
                      ) : (
                        userTeam.bench.filter((p) => p != null).map((p, index) => (
                          <div
                            key={p.id}
                            className="grid grid-cols-[36px_1fr_auto] items-center gap-3 py-2 border-b border-border last:border-0"
                            data-testid={`bench-row-${index}`}
                          >
                            <PlayerPhoto player={p} />
                            <div className="min-w-0">
                              <button
                                onClick={() => setSelectedPlayer({ id: p.id, name: p.name })}
                                className="block max-w-full truncate text-sm font-medium text-left hover:text-primary hover:underline"
                                data-testid={`bench-player-user-${index}`}
                              >
                                {p.name}
                                <StatusTag player={p} />
                              </button>
                              <span className="text-xs text-muted-foreground">{p.position} · {p.team}</span>
                            </div>
                            <div className="text-right tabular-nums">
                              <div className="text-sm font-bold">{p.points.toFixed(1)}</div>
                              <div className="text-[11px] text-muted-foreground">proj {p.projectedPoints}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-heading text-lg font-bold mb-2">No Opponent This Week</h3>
                <p className="text-muted-foreground">
                  There's no matchup for week {selectedWeek}. Try another week.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-0">
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : userTeam && opponentTeam ? (
            <MatchupScoutingReport
              leagueId={league.leagueId}
              userId={user.userId}
              userRosterId={userTeam.rosterId}
              opponentRosterId={opponentTeam.rosterId}
              week={selectedWeek}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-heading text-lg font-bold mb-2">No Opponent This Week</h3>
                <p className="text-muted-foreground">
                  There's no opponent to preview for week {selectedWeek}. Try another week.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PlayerDetailModal
        playerId={selectedPlayer?.id || null}
        playerName={selectedPlayer?.name || ""}
        week={selectedWeek}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  );
}
