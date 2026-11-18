import { Fragment, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import ClinchTracker from "@/components/ClinchTracker";
import PlayoffPredictor from "@/components/PlayoffPredictor";
import PointsRaceChart from "@/components/PointsRaceChart";
import PlayoffGameDialog, { type PlayoffGameRef } from "@/components/PlayoffGameDialog";
import ScheduleSimulator from "@/components/ScheduleSimulator";
import type { StandingsAnalysis } from "@shared/standingsAnalysis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ListOrdered, Target, Trophy, Crown, LineChart as LineChartIcon, Shuffle } from "lucide-react";

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

interface BracketMatchup {
  round: number;
  matchupId: number;
  team1: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  team2: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  winner: number | null;
  loser: number | null;
  team1From?: { w?: number; l?: number };
  team2From?: { w?: number; l?: number };
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

interface ConsolationMatchup {
  gameType?: string;
  round: number;
  matchupId: number;
  team1: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  team2: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  winner: number | null;
  loser: number | null;
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

interface BracketData {
  matchups: BracketMatchup[];
  rounds: number;
  teams: Record<number, { name: string; initials: string; avatar: string | null }>;
  consolationMatchups?: ConsolationMatchup[];
  playoffWeekStart?: number;
  currentWeek?: number;
}

export default function Standings() {
  const { user, league } = useSleeper();
  const [activeTab, setActiveTab] = useState<"standings" | "race" | "simulator" | "predictions" | "bracket">("standings");
  const [openGame, setOpenGame] = useState<PlayoffGameRef | null>(null);

  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  // Fetch playoff predictions for clinched status
  const { data: predictions } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "playoff-predictions", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/playoff-predictions?userId=${user?.userId ?? ""}`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch playoff bracket
  const { data: bracketData, isLoading: bracketLoading } = useQuery<BracketData>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "bracket"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/bracket`);
      if (!res.ok) throw new Error("Failed to fetch playoff bracket");
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });

  const analysisNeeded = activeTab === "race" || activeTab === "simulator";
  const { data: analysis, isLoading: analysisLoading, isError: analysisError } = useQuery<StandingsAnalysis>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings-analysis", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings-analysis?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings analysis");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId && analysisNeeded,
    staleTime: 5 * 60 * 1000,
  });

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view standings.
          </p>
        </div>
      </div>
    );
  }

  const formattedStandings = (standings || []).map((team: any, index: number) => ({
    rank: team.rank || index + 1,
    name: team.name,
    initials: team.initials,
    avatar: team.avatar,
    wins: team.wins,
    losses: team.losses,
    pointsFor: team.pointsFor,
    pointsAgainst: team.pointsAgainst,
    maxPointsFor: team.maxPointsFor,
    streak: team.streak || "—",
    trend: team.previousRank != null ? [team.previousRank, team.rank || index + 1] : [team.rank || index + 1, team.rank || index + 1],
    isUser: team.isUser,
    rosterId: team.rosterId,
  }));

  // Extract playoff probabilities from predictions
  const playoffProbabilities = predictions?.predictions?.map((p: any) => ({
    rosterId: p.rosterId,
    makePlayoffsPct: p.makePlayoffsPct,
  })) || [];

  const pointsData = formattedStandings
    .map((team: any) => ({
      name: team.initials,
      pf: team.pointsFor,
      pa: team.pointsAgainst,
      isUser: team.isUser,
    }))
    .sort((a: any, b: any) => b.pf - a.pf);

  const playoffTeams = league.playoffTeams || 6;
  const myRosterId: number | undefined = formattedStandings.find((t: any) => t.isUser)?.rosterId;

  // A game is "done" once it has a winner and both teams are set. Done games open the detail popup.
  const gameDone = (m: { team1: { rosterId: number } | null; team2: { rosterId: number } | null; winner: number | null }) =>
    !!m.team1 && !!m.team2 && m.winner != null;
  const gameProps = (
    m: { team1: { rosterId: number; seed?: number } | null; team2: { rosterId: number; seed?: number } | null; winner: number | null },
    label: string,
    week?: number,
  ) => {
    if (!gameDone(m)) return {};
    const open = () =>
      setOpenGame({ rosterA: m.team1!.rosterId, rosterB: m.team2!.rosterId, seedA: m.team1!.seed, seedB: m.team2!.seed, label, week });
    return {
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `Open game detail: ${label}`,
      onClick: open,
      onKeyDown: (e: ReactKeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      },
    };
  };

  const renderAnalysis = (render: (data: StandingsAnalysis) => JSX.Element) => {
    if (analysisLoading) {
      return (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      );
    }
    if (analysisError) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Unable to load season analysis right now. Please try again in a moment.
          </CardContent>
        </Card>
      );
    }
    if (!analysis || analysis.weeks.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="font-heading text-lg font-semibold mb-2">No Games Played Yet</h3>
            <p className="text-muted-foreground">
              This view will appear once at least one regular-season week has been completed.
            </p>
          </CardContent>
        </Card>
      );
    }
    return render(analysis);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">League Standings</h1>
        <p className="text-muted-foreground">
          Full standings and scoring analysis for {league.name}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "standings" | "race" | "simulator" | "predictions" | "bracket")}>
        <TabsList className="mb-4">
          <TabsTrigger value="standings" className="gap-2" data-testid="tab-standings">
            <ListOrdered className="w-4 h-4" />
            Standings
          </TabsTrigger>
          <TabsTrigger value="race" className="gap-2" data-testid="tab-race">
            <LineChartIcon className="w-4 h-4" />
            Points Race
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-2" data-testid="tab-simulator">
            <Shuffle className="w-4 h-4" />
            Schedule Simulator
          </TabsTrigger>
          <TabsTrigger value="predictions" className="gap-2" data-testid="tab-predictions">
            <Target className="w-4 h-4" />
            Playoff Predictor
          </TabsTrigger>
          <TabsTrigger value="bracket" className="gap-2" data-testid="tab-bracket">
            <Trophy className="w-4 h-4" />
            Playoff Bracket
          </TabsTrigger>
        </TabsList>

        <TabsContent value="standings" className="mt-0">
          {standingsLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full mb-2" />
                ))}
              </CardContent>
            </Card>
          ) : formattedStandings.length > 0 ? (
            <ClinchTracker
              standings={formattedStandings}
              predictions={predictions?.predictions || []}
              playoffTeams={playoffTeams}
              sidebarExtra={
                <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg">Top Scorers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {standingsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))
                ) : (
                  [...formattedStandings].sort((a, b) => b.pointsFor - a.pointsFor).slice(0, 5).map((team: any, i: number) => (
                    <div key={team.rank} className="flex items-center gap-3">
                      <Badge
                        variant={i === 0 ? "default" : "secondary"}
                        className="w-6 h-6 p-0 flex items-center justify-center rounded-full"
                      >
                        {i + 1}
                      </Badge>
                      <Avatar className="w-8 h-8">
                        <AvatarFallback
                          className={`text-xs ${
                            team.isUser ? "bg-primary text-primary-foreground" : "bg-muted"
                          }`}
                        >
                          {team.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`flex-1 text-sm font-medium ${team.isUser ? "text-primary" : ""}`}>
                        {team.name}
                      </span>
                      <span className="text-sm tabular-nums font-semibold">
                        {team.pointsFor.toFixed(1)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-lg">Points For vs Against</CardTitle>
              </CardHeader>
              <CardContent>
                {standingsLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pointsData} layout="horizontal">
                        <XAxis 
                          type="category" 
                          dataKey="name" 
                          tick={{ fontSize: 10 }} 
                          stroke="hsl(var(--muted-foreground))"
                          interval={0}
                        />
                        <YAxis 
                          type="number" 
                          tick={{ fontSize: 10 }} 
                          stroke="hsl(var(--muted-foreground))"
                          domain={[0, 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--popover))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "6px",
                          }}
                          formatter={(value: number, name: string) => [
                            value.toFixed(1),
                            name === "pf" ? "Points For" : "Points Against"
                          ]}
                        />
                        <Bar dataKey="pf" name="pf" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="pa" name="pa" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-chart-1" />
                        <span>Points For</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-sm bg-destructive" />
                        <span>Points Against</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
                </>
              }
            />
          ) : null}
        </TabsContent>

        <TabsContent value="race" className="mt-0">
          {renderAnalysis((data) => <PointsRaceChart analysis={data} playoffTeams={playoffTeams} />)}
        </TabsContent>

        <TabsContent value="simulator" className="mt-0">
          {renderAnalysis((data) => <ScheduleSimulator analysis={data} />)}
        </TabsContent>

        <TabsContent value="predictions" className="mt-0">
          <PlayoffPredictor userId={user.userId} />
        </TabsContent>

        <TabsContent value="bracket" className="mt-0">
          {bracketLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-64 w-full max-w-4xl mx-auto" />
              </div>
            </div>
          ) : !bracketData || bracketData.matchups.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-heading text-lg font-semibold mb-2">No Playoff Bracket Yet</h3>
                  <p className="text-muted-foreground">
                    The playoff bracket will appear once the regular season ends and playoffs begin.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-heading flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-primary" />
                    Winners Bracket
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Championship tournament - Reseeding format</p>
                  {(() => {
                    const winnersGames = bracketData.matchups.filter((m) => !m.placement || m.placement === 1);
                    const final = winnersGames.find((m) => m.round === bracketData.rounds);
                    const roundLabel = (r: number) =>
                      r === bracketData.rounds ? "Championship" : r === bracketData.rounds - 1 ? "Semifinals" : `Round ${r}`;
                    const scored = winnersGames.filter((m) => (m.team1Score ?? 0) > 0 || (m.team2Score ?? 0) > 0);
                    const liveRound = scored.filter((m) => m.winner == null).map((m) => m.round).sort((a, b) => a - b)[0];
                    const status = final?.winner != null
                      ? { text: "Champion crowned", tone: "bg-green-600 text-white" }
                      : liveRound != null
                        ? { text: `${roundLabel(liveRound)} in progress`, tone: "bg-red-600 text-white" }
                        : scored.length > 0
                          ? { text: "Between rounds", tone: "bg-secondary text-secondary-foreground" }
                          : { text: "Not started", tone: "bg-secondary text-secondary-foreground" };

                    // Your path: what your team's last bracket game says about where you stand.
                    const mine = myRosterId == null ? [] : winnersGames
                      .filter((m) => m.team1?.rosterId === myRosterId || m.team2?.rosterId === myRosterId)
                      .sort((a, b) => b.round - a.round);
                    const last = mine[0];
                    let path: string | null = null;
                    if (myRosterId != null) {
                      if (!last) path = "Your team isn't in the playoff bracket.";
                      else if (last.winner === myRosterId && last.round === bracketData.rounds) path = "You won the championship.";
                      else if (last.loser === myRosterId) path = `You were eliminated in the ${roundLabel(last.round)}.`;
                      else if (last.winner === myRosterId) path = `You won ${roundLabel(last.round)} and advance.`;
                      else {
                        const opp = last.team1?.rosterId === myRosterId ? last.team2 : last.team1;
                        path = `You are playing in the ${roundLabel(last.round)}${opp ? ` against ${opp.name}` : ""}.`;
                      }
                    }
                    return (
                      <div className="flex flex-wrap items-center gap-3 pt-2" data-testid="bracket-status">
                        <Badge className={status.tone}>{status.text}</Badge>
                        {path && <span className="text-sm text-muted-foreground" data-testid="bracket-your-path">{path}</span>}
                      </div>
                    );
                  })()}
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Winners bracket: compact cards in columns, byes called out, connectors into the final.
                    const roundNums = Array.from({ length: bracketData.rounds }, (_, i) => i + 1);
                    const isLosersOnly = (m: BracketMatchup) => !!m.team1From?.l && !!m.team2From?.l;
                    const gamesIn = (r: number) =>
                      bracketData.matchups
                        .filter((m) => m.round === r && (!m.placement || m.placement === 1) && !isLosersOnly(m))
                        .sort((a, b) => a.matchupId - b.matchupId);
                    const roundName = (r: number) =>
                      r === bracketData.rounds ? "Championship" : r === bracketData.rounds - 1 ? "Semifinals" : `Round ${r}`;
                    const roundState = (r: number) => {
                      const gs = gamesIn(r);
                      if (gs.length > 0 && gs.every((g) => g.winner != null)) return "done";
                      if (gs.some((g) => (g.team1Score ?? 0) > 0 || (g.team2Score ?? 0) > 0)) return "live";
                      return "upcoming";
                    };
                    const CARD_H = 92;
                    const GAP = 28;
                    const HEADER = 36;
                    const tallest = Math.max(1, ...roundNums.map((r) => gamesIn(r).length));
                    const H = tallest * (CARD_H + GAP) - GAP;

                    // Teams that skipped round 1 (they first appear in round 2).
                    const round1Ids = new Set<number>();
                    gamesIn(1).forEach((m) => {
                      if (m.team1) round1Ids.add(m.team1.rosterId);
                      if (m.team2) round1Ids.add(m.team2.rosterId);
                    });
                    const byeTeams: Array<{ rosterId: number; seed?: number; name: string }> = [];
                    if (bracketData.rounds >= 3) {
                      gamesIn(2).forEach((m) => {
                        [m.team1, m.team2].forEach((t) => {
                          if (t && !round1Ids.has(t.rosterId) && !byeTeams.some((b) => b.rosterId === t.rosterId)) byeTeams.push(t);
                        });
                      });
                    }
                    const semis = bracketData.rounds >= 2 ? gamesIn(bracketData.rounds - 1) : [];
                    const finals = gamesIn(bracketData.rounds);
                    const connectLast = semis.length === 2 && finals.length === 1;

                    return (
                      <div>
                        {byeTeams.length > 0 && (
                          <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3" data-testid="bracket-byes">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              First-round bye{byeTeams.length > 1 ? "s" : ""}
                            </p>
                            {byeTeams.map((t) => {
                              const info = bracketData.teams[t.rosterId];
                              return (
                                <div key={t.rosterId} className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6 shrink-0">
                                    {info?.avatar && <AvatarImage src={info.avatar} alt={t.name} />}
                                    <AvatarFallback className="text-[10px] bg-muted">{info?.initials ?? t.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-medium">
                                    <span className="text-muted-foreground font-semibold mr-1.5">#{t.seed}</span>
                                    {t.name}
                                    {t.rosterId === myRosterId && <span className="ml-1.5 text-[10px] font-bold text-primary">· YOU</span>}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="overflow-x-auto pb-4">
                        <div className="flex min-w-max items-stretch">
                          {roundNums.map((r) => {
                            const state = roundState(r);
                            const isFinalRound = r === bracketData.rounds;
                            return (
                              <Fragment key={r}>
                                <div className="flex flex-col" style={{ width: 270 }} data-testid={`bracket-round-${r}`}>
                                  <div className="flex items-center justify-between px-1 mb-3" style={{ height: HEADER - 12 }}>
                                    <span className="font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wider">{roundName(r)}</span>
                                    <span className={`text-[10px] font-semibold uppercase ${state === "live" ? "text-red-500" : state === "done" ? "text-emerald-500" : "text-muted-foreground"}`}>
                                      {state === "live" ? "● Live" : state === "done" ? "Done" : "Upcoming"}
                                    </span>
                                  </div>
                                  <div className="flex flex-col justify-around" style={{ height: H }}>
                                    {gamesIn(r).map((m) => {
                                      const mine = myRosterId != null && (m.team1?.rosterId === myRosterId || m.team2?.rosterId === myRosterId);
                                      const done = gameDone(m);
                                      const live = !done && ((m.team1Score ?? 0) > 0 || (m.team2Score ?? 0) > 0);
                                      return (
                                        <div key={m.matchupId} className="relative" style={{ height: CARD_H }} data-testid={`bracket-matchup-${r}-${m.matchupId}`}>
                                          <div
                                            className={`flex flex-col border rounded-lg overflow-hidden h-full ${isFinalRound ? "border-amber-500/70 border-2" : "border-border"} ${mine && !isFinalRound ? "ring-2 ring-primary" : ""} ${done ? "cursor-pointer hover:border-primary/60 transition-colors" : ""}`}
                                            {...gameProps(m, roundName(r), bracketData.playoffWeekStart != null ? bracketData.playoffWeekStart + r - 1 : undefined)}
                                          >
                                            <BracketTeamRow
                                              team={m.team1}
                                              seed={m.team1?.seed}
                                              isUser={m.team1?.rosterId === myRosterId}
                                              isWinner={m.winner === m.team1?.rosterId}
                                              isLoser={m.loser === m.team1?.rosterId}
                                              fromMatchup={m.team1From}
                                              isTop
                                              score={m.team1Score}
                                            />
                                            <div className="border-t border-border" />
                                            <BracketTeamRow
                                              team={m.team2}
                                              seed={m.team2?.seed}
                                              isUser={m.team2?.rosterId === myRosterId}
                                              isWinner={m.winner === m.team2?.rosterId}
                                              isLoser={m.loser === m.team2?.rosterId}
                                              fromMatchup={m.team2From}
                                              score={m.team2Score}
                                            />
                                          </div>
                                          {live && <span className="absolute -bottom-5 left-1 text-[10px] font-semibold text-red-500">● Live</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {r < bracketData.rounds && (
                                  <div style={{ width: 80, paddingTop: HEADER }} aria-hidden="true">
                                    <div className="relative" style={{ height: H }}>
                                      {r === bracketData.rounds - 1 && connectLast ? (
                                        <>
                                          <div className="absolute bg-border" style={{ left: 0, top: "25%", width: "50%", height: 2 }} />
                                          <div className="absolute bg-border" style={{ left: 0, top: "75%", width: "50%", height: 2 }} />
                                          <div className="absolute bg-border" style={{ left: "50%", top: "25%", width: 2, height: "50%" }} />
                                          <div className="absolute bg-border" style={{ left: "50%", top: "50%", width: "50%", height: 2 }} />
                                        </>
                                      ) : (
                                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                                          Reseed →
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </Fragment>
                            );
                          })}
                          {finals.length === 1 && (() => {
                            const fm = finals[0];
                            const champ = fm.winner != null ? bracketData.teams[fm.winner] : null;
                            return (
                              <>
                                <div style={{ width: 48, paddingTop: HEADER }} aria-hidden="true">
                                  <div className="relative" style={{ height: H }}>
                                    <div className="absolute bg-border" style={{ left: 0, top: "50%", width: "100%", height: 2 }} />
                                  </div>
                                </div>
                                <div className="flex flex-col" style={{ width: 210 }} data-testid="bracket-champion">
                                  <div style={{ height: HEADER }} />
                                  <div className="flex items-center" style={{ height: H }}>
                                    <div className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center ${champ ? "border-amber-500/70 bg-amber-500/5" : "border-amber-500/40"}`}>
                                      <Crown className="w-7 h-7 text-amber-500" />
                                      <span className="font-heading font-bold text-sm">{champ ? champ.name : "Champion"}</span>
                                      <span className="text-xs text-muted-foreground">{champ ? "League champion" : "Decided in the Championship"}</span>
                                    </div>
                                  </div>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                        </div>
                      </div>
                    );
                  })()}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Winners reseed after Round 1: the top seed plays the lowest remaining seed. Click a completed game for the starter-by-starter breakdown.
                  </p>
                </CardContent>
              </Card>

              {/* Consolation/Placement Games Section */}
              {bracketData.consolationMatchups && bracketData.consolationMatchups.length > 0 && (
                <>
                  {/* Consolation bracket card */}
                  <Card className="border-muted">
                    <CardHeader className="bg-muted/30">
                      <CardTitle className="font-heading flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-muted-foreground" />
                        Placement Games
                      </CardTitle>
                      <CardDescription>Games determine final standings and draft positions for eliminated teams</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {bracketData.consolationMatchups
                          .filter(matchup => matchup.placement === 7 || matchup.placement === 5 || matchup.placement === 3)
                          .sort((a, b) => {
                            // Sort by placement (3rd, 5th, 7th)
                            const order = [3, 5, 7];
                            const aIndex = order.indexOf(a.placement ?? 999);
                            const bIndex = order.indexOf(b.placement ?? 999);
                            return aIndex - bIndex;
                          })
                          .map((matchup) => (
                            <div key={`${matchup.placement || matchup.matchupId}-${matchup.matchupId}`}>
                              <div className="text-center mb-3">
                                <span className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                  {matchup.placement ? `${matchup.placement}${getOrdinalSuffix(matchup.placement)} Place Game` : "Consolation Game"}
                                </span>
                              </div>
                              <div
                                className={`flex flex-col border rounded-lg overflow-hidden border-border ${gameDone(matchup) ? "cursor-pointer hover:border-primary/60 transition-colors" : ""}`}
                                {...gameProps(matchup, matchup.placement ? `${matchup.placement}${getOrdinalSuffix(matchup.placement)} Place Game` : "Consolation Game")}
                              >
                                <BracketTeamRow
                                  team={matchup.team1}
                                          isUser={matchup.team1?.rosterId === myRosterId}
                                  seed={matchup.team1?.seed}
                                  isWinner={matchup.winner === matchup.team1?.rosterId}
                                  isLoser={matchup.loser === matchup.team1?.rosterId}
                                  isTop
                                  score={matchup.team1Score}
                                />
                                <div className="border-t border-border" />
                                <BracketTeamRow
                                  team={matchup.team2}
                                          isUser={matchup.team2?.rosterId === myRosterId}
                                  seed={matchup.team2?.seed}
                                  isWinner={matchup.winner === matchup.team2?.rosterId}
                                  isLoser={matchup.loser === matchup.team2?.rosterId}
                                  score={matchup.team2Score}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <PlayoffGameDialog leagueId={league.leagueId} game={openGame} onClose={() => setOpenGame(null)} />
    </div>
  );
}

function BracketTeamRow({
  team,
  seed,
  isWinner,
  isLoser,
  fromMatchup,
  isTop,
  draftPick,
  score,
  isUser,
}: {
  team: { rosterId: number; seed?: number; name: string; initials: string; avatar: string | null } | null;
  seed?: number;
  isWinner: boolean;
  isLoser: boolean;
  fromMatchup?: { w?: number; l?: number };
  isTop?: boolean;
  draftPick?: number;
  score?: number;
  isUser?: boolean;
}) {
  // Use seed from team object if available, otherwise use prop
  const displaySeed = team?.seed ?? seed;
  if (!team) {
    const fromText = fromMatchup?.w 
      ? `W${fromMatchup.w}` 
      : fromMatchup?.l 
        ? `L${fromMatchup.l}` 
        : "TBD";
    
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-muted/30 h-11 ${isTop ? "" : ""}`}>
        <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
          <span className="text-[10px] text-muted-foreground">?</span>
        </div>
        <span className="text-xs text-muted-foreground italic truncate">{fromText}</span>
      </div>
    );
  }

  const hasScore = score !== undefined && score !== null && score > 0;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 h-11 transition-colors ${
        isWinner
          ? "bg-primary/15"
          : isLoser
            ? "bg-destructive/10 opacity-50"
            : "bg-card"
      }`}
      data-testid={`bracket-team-${team.rosterId}`}
    >
      <Avatar className="w-6 h-6 shrink-0">
        {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
        <AvatarFallback className={`text-[10px] ${isWinner ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
          {team.initials}
        </AvatarFallback>
      </Avatar>
      <span className={`text-xs font-medium truncate flex-1 ${isWinner ? "text-primary font-semibold" : isLoser ? "text-muted-foreground line-through" : ""}`}>
        {displaySeed !== undefined && displaySeed !== null ? (
          <>
            <span className="text-muted-foreground font-semibold mr-1.5">#{displaySeed}</span>
            {team.name}
            {isUser && <span className="ml-1.5 text-[10px] font-bold text-primary">· YOU</span>}
          </>
        ) : (
          team.name
        )}
      </span>
      {hasScore && (
        <span className={`text-xs font-semibold tabular-nums shrink-0 ${isWinner ? "text-primary" : isLoser ? "text-muted-foreground" : "text-muted-foreground"}`}>
          {score.toFixed(2)}
        </span>
      )}
      {isWinner && (
        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary-foreground">W</span>
        </div>
      )}
    </div>
  );
}
