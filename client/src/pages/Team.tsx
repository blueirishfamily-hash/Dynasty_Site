import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import PositionDepthChart from "@/components/PositionDepthChart";
import { PlayerDetailModal } from "@/components/PlayerDetailModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Users, Swords, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { useContractsEnabled, useLeagueRules } from "@/lib/leagueRules";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type RosterStatus = "starter" | "bench" | "taxi" | "ir";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age?: number;
  status: RosterStatus;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
}

interface DepthPlayer {
  id: string;
  name: string;
  team: string | null;
  points: number;
  medianPoints: number;
  percentAboveMedian: number;
}

interface DepthData {
  grade: string;
  players: DepthPlayer[];
}

interface DepthApiResponse extends Record<string, DepthData> {
  positionRanks?: Record<string, { rank: number; totalTeams: number; totalPpg: number }>;
}

interface RivalryMatchup {
  season: string;
  week: number;
  userPoints: number;
  oppPoints: number;
  won: boolean;
}

interface Rivalry {
  ownerId: string;
  name: string;
  initials: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  matchups: RivalryMatchup[];
}

interface RivalryResponse {
  rivalries: Rivalry[];
  seasons: string[];
  totalSeasons: number;
}

interface DbContractLite {
  rosterId: number;
  playerId: string;
  salaries: string;
}

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];
const POS_COLOR: Record<string, string> = {
  QB: "#F472B6",
  RB: "#34D399",
  WR: "#60A5FA",
  TE: "#FBBF24",
  K: "#A78BFA",
  DEF: "#94A3B8",
};
const STATUS_LABEL: Record<RosterStatus, string> = { starter: "Starter", bench: "Bench", taxi: "Taxi", ir: "IR" };
const STATUS_COLOR: Record<RosterStatus, string> = {
  starter: "text-emerald-400",
  bench: "text-muted-foreground",
  taxi: "text-blue-400",
  ir: "text-red-400",
};
const STATUS_ORDER: Record<RosterStatus, number> = { starter: 0, bench: 1, taxi: 2, ir: 3 };
const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

function gradeRank(grade: string | undefined): number {
  const i = GRADE_ORDER.indexOf(grade ?? "");
  return i < 0 ? 99 : i;
}

function gradeClass(grade: string): string {
  const c = grade[0];
  return c === "A" ? "bg-emerald-500/20 text-emerald-400" : c === "B" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400";
}

function parseSalaries(raw: string): Record<number, number> {
  try {
    const obj = JSON.parse(raw || "{}");
    const out: Record<number, number> = {};
    for (const [year, val] of Object.entries(obj)) {
      const y = Number(year);
      if (!isNaN(y)) out[y] = (Number(val) || 0) / 10;
    }
    return out;
  } catch {
    return {};
  }
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function PlayerPhoto({ player }: { player: Player }) {
  const [failed, setFailed] = useState(false);
  const isDef = player.position === "DEF";
  const src = isDef
    ? `https://sleepercdn.com/images/team_logos/nfl/${(player.team || player.id).toLowerCase()}.png`
    : `https://sleepercdn.com/content/nfl/players/${player.id}.jpg`;
  return (
    <span
      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-slate-900"
      style={{ background: POS_COLOR[player.position] }}
    >
      {failed ? (
        initialsOf(player.name)
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

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-[96px]">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-heading text-xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function chipClass(on: boolean, color?: string) {
  return `shrink-0 min-h-[40px] rounded-full border px-3.5 text-xs font-bold transition-colors ${
    on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
  }${color ? "" : ""}`;
}

function RivalryCard({
  rivalry,
  expanded,
  onToggle,
}: {
  rivalry: Rivalry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = rivalry.wins + rivalry.losses + rivalry.ties;
  const winRate = total > 0 ? (rivalry.wins / total) * 100 : 0;
  const pointDiff = rivalry.pointsFor - rivalry.pointsAgainst;
  const level =
    winRate >= 70 ? "Dominant" : winRate >= 55 ? "Winning" : winRate >= 45 ? "Even" : winRate >= 30 ? "Losing" : "Dominated";
  const levelColor =
    winRate >= 70 ? "text-emerald-500" : winRate >= 55 ? "text-emerald-400" : winRate >= 45 ? "text-muted-foreground" : winRate >= 30 ? "text-red-400" : "text-red-500";
  const barColor = winRate >= 55 ? "bg-emerald-500" : winRate >= 45 ? "bg-slate-500" : "bg-red-500";
  const recent = rivalry.matchups.slice(-10);
  return (
    <Card className={expanded ? "border-primary" : ""} data-testid={`card-rivalry-${rivalry.ownerId}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left p-4 space-y-3 hover-elevate rounded-lg"
        data-testid={`row-rivalry-${rivalry.ownerId}`}
      >
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10">
            {rivalry.avatar && <AvatarImage src={rivalry.avatar} alt={rivalry.name} />}
            <AvatarFallback className="text-xs bg-muted">{rivalry.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{rivalry.name}</p>
            <p className="text-xs text-muted-foreground">
              {total} game{total !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="font-heading text-xl font-bold tabular-nums">
            {rivalry.wins}-{rivalry.losses}
            {rivalry.ties > 0 ? `-${rivalry.ties}` : ""}
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-muted">
            <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${winRate}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className={`font-bold ${levelColor}`}>
              {winRate.toFixed(0)}% · {level}
            </span>
            <span className={`font-bold tabular-nums ${pointDiff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {pointDiff >= 0 ? "+" : ""}
              {pointDiff.toFixed(1)} pts
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {recent.map((m, idx) => (
            <span
              key={idx}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                m.won ? "bg-emerald-500/20 text-emerald-400" : m.userPoints === m.oppPoints ? "bg-muted text-muted-foreground" : "bg-red-500/20 text-red-400"
              }`}
            >
              {m.won ? "W" : m.userPoints === m.oppPoints ? "T" : "L"}
            </span>
          ))}
        </div>
      </button>
      {expanded && (
        <CardContent className="border-t pt-4 space-y-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Avg PF:</span>{" "}
              <span className="font-medium">{(total > 0 ? rivalry.pointsFor / total : 0).toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Avg PA:</span>{" "}
              <span className="font-medium">{(total > 0 ? rivalry.pointsAgainst / total : 0).toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total PF:</span>{" "}
              <span className="font-medium">{rivalry.pointsFor.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total PA:</span>{" "}
              <span className="font-medium">{rivalry.pointsAgainst.toFixed(1)}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Match History</p>
            <div className="flex flex-wrap gap-1.5">
              {rivalry.matchups.map((m, idx) => (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-7 h-7 rounded-sm flex items-center justify-center text-xs font-medium cursor-help ${
                        m.won
                          ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                          : m.userPoints === m.oppPoints
                            ? "bg-muted text-muted-foreground border border-border"
                            : "bg-red-500/20 text-red-500 border border-red-500/30"
                      }`}
                      data-testid={`matchup-${m.season}-${m.week}`}
                    >
                      {m.won ? "W" : m.userPoints === m.oppPoints ? "T" : "L"}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">
                      {m.season} Week {m.week}
                    </p>
                    <p className="text-xs">
                      {m.userPoints.toFixed(1)} - {m.oppPoints.toFixed(1)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Team() {
  const contractsOn = useContractsEnabled();
  const TOTAL_CAP = useLeagueRules().salaryCap;
  const { user, league, currentWeek, isOffseason, season } = useSleeper();
  const leagueId = league?.leagueId;
  const currentYear = parseInt(season) || new Date().getFullYear();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>("");
  const [expandedRivalry, setExpandedRivalry] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | RosterStatus>("all");
  const [posFilter, setPosFilter] = useState<"ALL" | Position>("ALL");
  const [rivalrySort, setRivalrySort] = useState<"games" | "winRate" | "pointDiff">("games");

  const { data: roster, isLoading: rosterLoading } = useQuery<Player[]>({
    queryKey: ["/api/sleeper/league", leagueId, "roster", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/roster/${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  const { data: depthData, isLoading: depthLoading } = useQuery<DepthApiResponse>({
    queryKey: ["/api/sleeper/league", leagueId, "depth", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/depth/${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch depth analysis");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  const { data: rivalryData, isLoading: rivalryLoading } = useQuery<RivalryResponse>({
    queryKey: ["/api/sleeper/league", leagueId, "rivalry", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/rivalry/${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch rivalry data");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });

  // Team header and contract column use the same queries (and cache keys) as the Dashboard and Contracts Hub.
  const { data: standings } = useQuery<any[]>({
    queryKey: ["/api/sleeper/league", leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/standings?userId=${user?.userId}`);
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!leagueId && !!user?.userId,
  });
  const { data: playoffData } = useQuery<{ predictions: { rosterId: number; makePlayoffsPct: number }[] }>({
    queryKey: ["/api/sleeper/league", leagueId, "playoff-predictions"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${leagueId}/playoff-predictions`);
      if (!res.ok) throw new Error("Failed to fetch playoff predictions");
      return res.json();
    },
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: dbContracts = [] } = useQuery<DbContractLite[]>({
    queryKey: ["/api/league", leagueId, "contracts"],
    enabled: !!leagueId,
  });
  const { data: deadCapEntries = [] } = useQuery<{ rosterId: number; deadCapSalaries: string }[]>({
    queryKey: ["/api/leagues", leagueId, "dead-cap"],
    enabled: !!leagueId,
  });

  const userStanding = (standings || []).find((s: any) => s.isUser);
  const myRosterId: number | undefined = userStanding?.rosterId;

  const contractByPlayer = useMemo(() => {
    const m = new Map<string, { salary: number; through: number }>();
    if (!myRosterId) return m;
    for (const c of dbContracts) {
      if (c.rosterId !== myRosterId) continue;
      const sal = parseSalaries(c.salaries);
      const years = Object.entries(sal).filter(([, v]) => v > 0).map(([y]) => Number(y));
      if (years.length === 0) continue;
      m.set(String(c.playerId), { salary: sal[currentYear] || 0, through: Math.max(...years) });
    }
    return m;
  }, [dbContracts, myRosterId, currentYear]);

  const capSpace = useMemo(() => {
    if (!myRosterId || !roster) return null;
    const mine = new Set(roster.map((p) => String(p.id)));
    let used = 0;
    for (const c of dbContracts) {
      if (c.rosterId !== myRosterId || !mine.has(String(c.playerId))) continue;
      used += parseSalaries(c.salaries)[currentYear] || 0;
    }
    for (const d of deadCapEntries) {
      if (d.rosterId !== myRosterId) continue;
      try {
        used += (Number(JSON.parse(d.deadCapSalaries || "{}")[String(currentYear)]) || 0) / 10;
      } catch {
        /* ignore bad row */
      }
    }
    return Math.max(0, TOTAL_CAP - used);
  }, [myRosterId, roster, dbContracts, deadCapEntries, currentYear]);

  const expiringStarters = useMemo(
    () =>
      (roster || []).filter((p) => p.status === "starter" && contractByPlayer.get(String(p.id))?.through === currentYear),
    [roster, contractByPlayer, currentYear]
  );
  const expiringCount = useMemo(
    () => (roster || []).filter((p) => contractByPlayer.get(String(p.id))?.through === currentYear).length,
    [roster, contractByPlayer, currentYear]
  );

  const visibleRoster = useMemo(
    () =>
      (roster || [])
        .filter((p) => (statusFilter === "all" || p.status === statusFilter) && (posFilter === "ALL" || p.position === posFilter))
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.weeklyAvg - a.weeklyAvg),
    [roster, statusFilter, posFilter]
  );
  const countFor = (s: "all" | RosterStatus) => (roster || []).filter((p) => s === "all" || p.status === s).length;

  const sortedRivalries = useMemo(() => {
    const list = [...(rivalryData?.rivalries ?? [])];
    const games = (r: Rivalry) => r.wins + r.losses + r.ties;
    const rate = (r: Rivalry) => (games(r) > 0 ? r.wins / games(r) : 0);
    if (rivalrySort === "winRate") list.sort((a, b) => rate(b) - rate(a));
    else if (rivalrySort === "pointDiff") list.sort((a, b) => b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst));
    else list.sort((a, b) => games(b) - games(a));
    return list;
  }, [rivalryData, rivalrySort]);

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayerId(player.id);
    setSelectedPlayerName(player.name);
  };

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">Connect your Sleeper account to view your team.</p>
        </div>
      </div>
    );
  }

  // ----- header numbers -----
  const standingRows = (standings || []) as any[];
  const pfRank = userStanding ? [...standingRows].sort((a, b) => (b.pointsFor ?? 0) - (a.pointsFor ?? 0)).findIndex((t) => t.isUser) + 1 : 0;
  const gamesPlayed = userStanding ? (userStanding.wins ?? 0) + (userStanding.losses ?? 0) + (userStanding.ties ?? 0) : 0;
  const myOdds = myRosterId != null ? playoffData?.predictions?.find((p) => p.rosterId === myRosterId)?.makePlayoffsPct : undefined;
  const ages = (roster || []).map((p) => p.age).filter((a): a is number => typeof a === "number");
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;
  const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4] ?? "th"}`;

  // ----- position grades and insights -----
  const grades = POSITIONS.map((pos) => ({
    pos,
    grade: depthData?.[pos]?.grade as string | undefined,
    rank: depthData?.positionRanks?.[pos],
  })).filter((g) => g.grade);
  const graded = [...grades].sort((a, b) => gradeRank(b.grade) - gradeRank(a.grade));
  const weakest = graded[0];
  const strongest = graded.length > 0 ? graded[graded.length - 1] : undefined;

  // ----- rivalry summary -----
  const rivalries = rivalryData?.rivalries ?? [];
  const totalGames = rivalries.reduce((acc, r) => acc + r.wins + r.losses + r.ties, 0);
  const totalWins = rivalries.reduce((acc, r) => acc + r.wins, 0);
  const totalLosses = rivalries.reduce((acc, r) => acc + r.losses, 0);
  const overallWinRate = totalGames > 0 ? (totalWins / totalGames) * 100 : 0;
  const rateOf = (r: Rivalry) => r.wins / (r.wins + r.losses + r.ties);
  const eligible = rivalries.filter((r) => r.wins + r.losses >= 2);
  const bestRivalry = [...eligible].sort((a, b) => rateOf(b) - rateOf(a))[0];
  const worstRivalry = [...eligible].sort((a, b) => rateOf(a) - rateOf(b))[0];

  // The 120px column is the contract; it's left out when the league has contracts off.
  const rosterCols = contractsOn
    ? "grid-cols-[minmax(0,1fr)_52px_84px_120px_70px_56px_64px]"
    : "grid-cols-[minmax(0,1fr)_52px_84px_70px_56px_64px]";

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold" data-testid="text-team-title">
          My Team
        </h1>
        <p className="text-muted-foreground">Manage your roster and analyze your performance</p>
      </div>

      <Tabs defaultValue="roster" className="space-y-6">
        <TabsList data-testid="tabs-team">
          <TabsTrigger value="roster" data-testid="tab-roster">
            <Users className="w-4 h-4 mr-2" />
            Roster
          </TabsTrigger>
          <TabsTrigger value="rivalry" data-testid="tab-rivalry">
            <Swords className="w-4 h-4 mr-2" />
            Rivalry
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-6">
          {userStanding && (
            <Card data-testid="card-team-header">
              <CardContent className="p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
                <div className="flex items-center gap-3 min-w-[220px]">
                  <Avatar className="w-14 h-14 ring-2 ring-primary">
                    {userStanding.avatar && <AvatarImage src={userStanding.avatar} alt={userStanding.name} />}
                    <AvatarFallback className="bg-primary text-primary-foreground font-bold">{userStanding.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-heading text-xl font-bold">{userStanding.name}</div>
                    <div className="text-sm text-muted-foreground">{league.name}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-9 gap-y-4 md:ml-auto">
                  <Kpi label="Record" value={`${userStanding.wins}-${userStanding.losses}`} sub={`#${userStanding.rank} seed`} />
                  {myOdds != null && <Kpi label="Playoff odds" value={`${Math.round(myOdds)}%`} sub={`Top ${league.playoffTeams || 6} make it`} accent />}
                  <Kpi label="Points for" value={Math.round(userStanding.pointsFor ?? 0).toLocaleString()} sub={pfRank ? `${ordinal(pfRank)} in league` : undefined} />
                  {gamesPlayed > 0 && <Kpi label="Avg per week" value={((userStanding.pointsFor ?? 0) / gamesPlayed).toFixed(1)} />}
                  {contractsOn && capSpace != null && <Kpi label="Cap room" value={`$${capSpace.toFixed(1)}M`} sub={`${expiringCount} expiring`} accent />}
                  {avgAge != null && <Kpi label="Roster age" value={avgAge.toFixed(1)} />}
                </div>
              </CardContent>
            </Card>
          )}

          {grades.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1 md:grid md:grid-cols-6" data-testid="position-grades">
              {grades.map((g) => {
                const pct = g.rank ? Math.max(5, (1 - (g.rank.rank - 1) / Math.max(1, g.rank.totalTeams)) * 100) : 50;
                return (
                  <Card key={g.pos} className="w-[128px] shrink-0 md:w-auto">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <b style={{ color: POS_COLOR[g.pos] }}>{g.pos}</b>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${gradeClass(g.grade!)}`}>{g.grade}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: POS_COLOR[g.pos] }} />
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {g.rank ? `Rank ${g.rank.rank} of ${g.rank.totalTeams}` : "No rank yet"}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 min-w-0">
              {rosterLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                  </CardHeader>
                  <CardContent>
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full mb-2" />
                    ))}
                  </CardContent>
                </Card>
              ) : roster && roster.length > 0 ? (
                <Card data-testid="card-roster">
                  <CardHeader className="pb-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="font-heading text-lg">Roster</CardTitle>
                      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Status">
                        {(["all", "starter", "bench", "taxi", "ir"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={statusFilter === s}
                            onClick={() => setStatusFilter(s)}
                            className={chipClass(statusFilter === s)}
                            data-testid={`filter-status-${s}`}
                          >
                            {s === "all" ? "All" : s === "ir" ? "IR" : s === "starter" ? "Starters" : STATUS_LABEL[s]} {countFor(s)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Position">
                      {(["ALL", ...POSITIONS] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          aria-pressed={posFilter === p}
                          onClick={() => setPosFilter(p)}
                          className={chipClass(posFilter === p)}
                          style={posFilter === p && p !== "ALL" ? { borderColor: POS_COLOR[p], color: POS_COLOR[p] } : undefined}
                          data-testid={`filter-pos-${p}`}
                        >
                          {p === "ALL" ? "All positions" : p}
                        </button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {visibleRoster.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">No players match these filters.</p>
                    ) : (
                      <>
                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <div className="min-w-[700px]">
                            <div className={`grid ${rosterCols} gap-2.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}>
                              <span>Player</span>
                              <span>Pos</span>
                              <span>Status</span>
                              {contractsOn && <span>Contract</span>}
                              <span className="text-right">Season</span>
                              <span className="text-right">PPG</span>
                              <span className="text-right">Rank</span>
                            </div>
                            {visibleRoster.map((p) => {
                              const c = contractByPlayer.get(String(p.id));
                              const expiring = c?.through === currentYear;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => handlePlayerClick(p)}
                                  className={`grid ${rosterCols} w-full items-center gap-2.5 border-t px-2.5 min-h-[56px] py-1.5 text-left hover-elevate`}
                                  data-testid={`row-player-${p.id}`}
                                >
                                  <span className="flex items-center gap-2.5 min-w-0">
                                    <PlayerPhoto player={p} />
                                    <span className="min-w-0">
                                      <span className="block truncate font-semibold">{p.name}</span>
                                      <span className="block text-[11px] text-muted-foreground">
                                        {p.team ?? "FA"}
                                        {p.age != null ? ` · age ${p.age}` : ""}
                                      </span>
                                    </span>
                                  </span>
                                  <span>
                                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold" style={{ color: POS_COLOR[p.position] }}>
                                      {p.position}
                                    </span>
                                  </span>
                                  <span className={`text-xs font-bold ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                                  {contractsOn && <span>
                                    {c ? (
                                      <>
                                        <span className="block font-semibold tabular-nums">${c.salary.toFixed(1)}M</span>
                                        <span className={`block text-[11px] ${expiring ? "font-bold text-amber-500" : "text-muted-foreground"}`}>
                                          {expiring ? `Expiring ${c.through}` : `thru ${c.through}`}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </span>}
                                  <span className="text-right tabular-nums">{p.seasonPoints ? p.seasonPoints.toFixed(1) : "–"}</span>
                                  <span className="text-right font-bold tabular-nums">{p.weeklyAvg ? p.weeklyAvg.toFixed(1) : "–"}</span>
                                  <span className="text-right text-xs text-muted-foreground">{p.positionRank ? `${p.position}${p.positionRank}` : "–"}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Phone cards */}
                        <div className="md:hidden space-y-2">
                          {visibleRoster.map((p) => {
                            const c = contractByPlayer.get(String(p.id));
                            const expiring = c?.through === currentYear;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handlePlayerClick(p)}
                                className="w-full rounded-xl border bg-muted/30 p-3 text-left space-y-2.5"
                                data-testid={`card-player-${p.id}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <PlayerPhoto player={p} />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold">{p.name}</span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {p.team ?? "FA"}
                                      {p.age != null ? ` · age ${p.age}` : ""}
                                    </span>
                                  </span>
                                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold" style={{ color: POS_COLOR[p.position] }}>
                                    {p.position}
                                  </span>
                                </div>
                                <div className={`grid ${contractsOn ? "grid-cols-4" : "grid-cols-3"} gap-2`}>
                                  <div>
                                    <div className="font-bold tabular-nums">{p.weeklyAvg ? p.weeklyAvg.toFixed(1) : "–"}</div>
                                    <div className="text-[10px] text-muted-foreground">PPG</div>
                                  </div>
                                  <div>
                                    <div className="tabular-nums">{p.seasonPoints ? p.seasonPoints.toFixed(1) : "–"}</div>
                                    <div className="text-[10px] text-muted-foreground">Season</div>
                                  </div>
                                  <div>
                                    <div className="text-sm">{p.positionRank ? `${p.position}${p.positionRank}` : "–"}</div>
                                    <div className="text-[10px] text-muted-foreground">Rank</div>
                                  </div>
                                  {contractsOn && <div>
                                    <div className="font-semibold tabular-nums">{c ? `$${c.salary.toFixed(1)}M` : "—"}</div>
                                    <div className={`text-[10px] ${expiring ? "font-bold text-amber-500" : "text-muted-foreground"}`}>
                                      {c ? (expiring ? `Expiring ${c.through}` : `thru ${c.through}`) : ""}
                                    </div>
                                  </div>}
                                </div>
                                <div className={`text-xs font-bold ${STATUS_COLOR[p.status]}`}>{STATUS_LABEL[p.status]}</div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">Select a player for the full card.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">No roster data available</CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              {roster && roster.length > 0 && (weakest || expiringStarters.length > 0) && (
                <Card data-testid="card-roster-insights">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-heading text-lg">Roster insights</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {weakest && gradeRank(weakest.grade) >= gradeRank("B-") && (
                      <div className="rounded-lg bg-red-500/10 px-3 py-2.5">
                        <b className="text-red-400">{weakest.pos} is your weakest room.</b> Graded {weakest.grade}
                        {weakest.rank ? `, ranked ${weakest.rank.rank} of ${weakest.rank.totalTeams} in the league` : ""}.
                      </div>
                    )}
                    {expiringStarters.length > 0 && (
                      <div className="rounded-lg bg-amber-500/10 px-3 py-2.5">
                        <b className="text-amber-500">
                          {expiringStarters.length} starter{expiringStarters.length === 1 ? "" : "s"} on expiring contracts:
                        </b>{" "}
                        {expiringStarters.map((p) => p.name).join(", ")}.
                      </div>
                    )}
                    {strongest && strongest !== weakest && gradeRank(strongest.grade) <= gradeRank("B+") && (
                      <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5">
                        <b className="text-emerald-400">Strength: {strongest.pos}.</b> Graded {strongest.grade}
                        {strongest.rank ? `, ranked ${strongest.rank.rank} of ${strongest.rank.totalTeams}` : ""}.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {depthLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-40" />
                  </CardHeader>
                  <CardContent>
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full mb-3" />
                    ))}
                  </CardContent>
                </Card>
              ) : depthData ? (
                <PositionDepthChart depthData={depthData} />
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rivalry" className="space-y-6">
          {rivalryLoading ? (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                    All-Time Record
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-xl font-bold">
                    <span className="text-emerald-500">{totalWins}</span>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-red-500">{totalLosses}</span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid="text-all-time-record">
                    {overallWinRate.toFixed(1)}% win rate
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <Swords className="w-3.5 h-3.5 text-muted-foreground" />
                    Seasons Tracked
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold" data-testid="text-seasons-tracked">
                    {rivalryData?.totalSeasons || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">{rivalryData?.seasons.join(", ") || "No data"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    Best Matchup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {bestRivalry ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        {bestRivalry.avatar && <AvatarImage src={bestRivalry.avatar} alt={bestRivalry.name} />}
                        <AvatarFallback className="text-xs bg-emerald-500 text-white">{bestRivalry.initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm truncate" data-testid="text-best-rivalry">
                          {bestRivalry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {bestRivalry.wins}-{bestRivalry.losses}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not enough data</span>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                    Toughest Matchup
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {worstRivalry ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        {worstRivalry.avatar && <AvatarImage src={worstRivalry.avatar} alt={worstRivalry.name} />}
                        <AvatarFallback className="text-xs bg-red-500 text-white">{worstRivalry.initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm truncate" data-testid="text-worst-rivalry">
                          {worstRivalry.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {worstRivalry.wins}-{worstRivalry.losses}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Not enough data</span>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" />
                Head-to-Head Records
              </h2>
              <p className="text-sm text-muted-foreground">Historical matchup results against each team in your league</p>
            </div>
            <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Sort rivalries">
              {([["games", "Most games"], ["winRate", "Win rate"], ["pointDiff", "Point differential"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={rivalrySort === key}
                  onClick={() => setRivalrySort(key)}
                  className={chipClass(rivalrySort === key)}
                  data-testid={`sort-rivalry-${key}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rivalryLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : sortedRivalries.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-start">
              {sortedRivalries.map((rivalry) => (
                <RivalryCard
                  key={rivalry.ownerId}
                  rivalry={rivalry}
                  expanded={expandedRivalry === rivalry.ownerId}
                  onToggle={() => setExpandedRivalry(expandedRivalry === rivalry.ownerId ? null : rivalry.ownerId)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                <Swords className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No rivalry data available yet.</p>
                <p className="text-sm">Check back after playing some matchups.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <PlayerDetailModal
        playerId={selectedPlayerId}
        playerName={selectedPlayerName}
        week={currentWeek}
        leagueId={league?.leagueId}
        isOffseason={isOffseason}
        season={season}
        onClose={() => setSelectedPlayerId(null)}
      />
    </div>
  );
}
