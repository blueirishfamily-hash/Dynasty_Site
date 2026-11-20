import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSleeper } from "@/lib/sleeper-context";
import { TeamLink, formatPoints } from "@/components/history/common";
import { ALL_TIME, statsHref } from "./statsRoute";
import { PlayerFace, PositionBadge, positionBarClass } from "./playerStyle";
import { StatsEmpty, StatsError, StatsLoading } from "./StatsStates";

// The League Stats tabs that read from the stats endpoints: players, drafts and transactions.

function useStatsQuery<T>(kind: "players" | "drafts" | "transactions", season: string) {
  const { league } = useSleeper();
  return useQuery<T>({
    queryKey: ["/api/league", league?.leagueId, "stats", kind, season],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/stats/${kind}?season=${encodeURIComponent(season === ALL_TIME ? "all" : season)}`);
      if (!res.ok) throw new Error(`Failed to load ${kind}`);
      return res.json();
    },
    enabled: !!league?.leagueId,
    staleTime: 5 * 60 * 1000,
  });
}

function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`rounded-full border px-3 py-1 text-sm ${
            value === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── Players ─────────────────────────

interface PlayerSeasonLine {
  season: string;
  points: number;
  started: number;
  games: number;
  teams: Array<{ franchiseId: string; teamName: string; points: number; games: number }>;
}
interface PlayerLeader {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  points: number;
  started: number;
  games: number;
  best: { season: string; points: number };
  currentTeam?: { franchiseId: string; teamName: string } | null;
  seasons: PlayerSeasonLine[];
}

const POSITION_FILTERS = ["ALL", "QB", "RB", "WR", "TE"];
type SortKey = "points" | "ppg" | "games" | "best";
const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "points", label: "Total points" },
  { id: "ppg", label: "Points per game" },
  { id: "games", label: "Games" },
  { id: "best", label: "Best season" },
];
const ppg = (points: number, games: number) => (games > 0 ? points / games : 0);
const sortValue = (p: PlayerLeader, key: SortKey) =>
  key === "points" ? p.points : key === "ppg" ? ppg(p.points, p.games) : key === "games" ? p.games : p.best.points;

const PosBadge = PositionBadge;

function PlayerProfile({ player }: { player: PlayerLeader }) {
  const maxSeason = Math.max(...player.seasons.map((s) => s.points), 1);
  const first = player.seasons[0]?.season;
  const last = player.seasons[player.seasons.length - 1]?.season;
  const tiles = [
    { label: "Total points", value: formatPoints(player.points), accent: true, sub: undefined as string | undefined },
    { label: "Points per game", value: formatPoints(ppg(player.points, player.games)), sub: `${player.games} games` },
    { label: "Best season", value: formatPoints(player.best.points), sub: player.best.season },
    { label: "Seasons", value: first === last ? first : `${first} to ${last}`, sub: `${player.seasons.length} played` },
  ];
  return (
    <Card data-testid="player-profile">
      <CardHeader>
        <div className="flex items-center gap-3">
          <PlayerFace playerId={player.playerId} name={player.name} position={player.position} size={56} />
          <div className="flex items-center gap-2">
            <CardTitle className="font-heading text-xl">{player.name}</CardTitle>
            <PosBadge position={player.position} />
          </div>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-x-2">
          <span>{player.team ?? "Free agent"}</span>
          {player.currentTeam && (
            <span className="flex items-center gap-1">
              now on <TeamLink id={player.currentTeam.franchiseId} name={player.currentTeam.teamName} size={16} />
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
              <div className={`text-xl font-semibold tabular-nums ${t.accent ? "text-primary" : ""}`}>{t.value}</div>
              {t.sub && <div className="text-xs text-muted-foreground">{t.sub}</div>}
            </div>
          ))}
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">Points by season</div>
          <div className="flex h-28 items-end gap-2" data-testid="player-season-chart">
            {player.seasons.map((s) => (
              <div key={s.season} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground">{formatPoints(s.points)}</span>
                <div
                  className={`w-full rounded-t ${s.season === player.best.season ? "bg-primary" : "bg-muted-foreground/40"}`}
                  style={{ height: `${Math.max(4, (s.points / maxSeason) * 72)}px` }}
                />
                <span className="text-[10px] text-muted-foreground">{s.season}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">Season log</div>
          <Table data-testid="table-player-log">
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">GP</TableHead>
                <TableHead className="hidden text-right sm:table-cell">PPG</TableHead>
                <TableHead className="text-right">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...player.seasons].reverse().map((s) => (
                <TableRow key={s.season}>
                  <TableCell>{s.season}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {s.teams.map((t) => (
                        <TeamLink key={t.franchiseId} id={t.franchiseId} name={t.teamName} size={16} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.games}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPoints(ppg(s.points, s.games))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPoints(s.points)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlayersTab({ season, playerId }: { season: string; playerId?: string }) {
  const { user } = useSleeper();
  const [, navigate] = useLocation();
  const { data, isLoading, error, refetch } = useStatsQuery<{ leaders: PlayerLeader[] }>("players", season);
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<SortKey>("points");
  const [limit, setLimit] = useState(50);
  const profileRef = useRef<HTMLDivElement>(null);

  const myId = user?.userId ?? null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.leaders ?? [])
      .filter((p) => position === "ALL" || p.position === position)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .filter((p) => !mine || p.seasons.some((s) => s.teams.some((t) => t.franchiseId === myId)))
      .sort((a, b) => sortValue(b, sort) - sortValue(a, sort) || a.name.localeCompare(b.name));
  }, [data, position, query, mine, sort, myId]);

  if (isLoading) {
    return <StatsLoading message={season === ALL_TIME ? "Adding up every season. The first load can take about half a minute." : "Adding up the season."} />;
  }
  if (error || !data) return <StatsError message="Could not load player stats." onRetry={() => refetch()} />;
  if (data.leaders.length === 0) return <StatsEmpty />;

  // The profile follows the URL; with no player in the URL it shows the top row.
  const selected = data.leaders.find((p) => p.playerId === playerId) ?? rows[0] ?? null;
  const leaderValue = rows[0] ? rows.reduce((m, p) => Math.max(m, p.points), 1) : 1;
  const select = (id: string) => {
    navigate(statsHref("players", { season, playerId: id }), { replace: true });
    // on a phone the profile sits below the list
    if (window.matchMedia("(max-width: 1023px)").matches) setTimeout(() => profileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const scopeLabel = `${season === ALL_TIME ? "All time" : season} · ${mine ? "my team" : "all teams"}`;

  return (
    <div className="space-y-4" data-testid="players-tab">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
            placeholder="Search players"
            aria-label="Search players"
            className="h-8 w-full sm:w-52"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort players"
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sort: {s.label}
              </option>
            ))}
          </select>
          <Chips
            label="Position"
            value={position}
            onChange={(v) => {
              setPosition(v);
              setLimit(50);
            }}
            options={POSITION_FILTERS.map((p) => ({ id: p, label: p === "ALL" ? "All" : p }))}
          />
          {myId && (
            <Chips
              label="Team scope"
              value={mine ? "mine" : "any"}
              onChange={(v) => setMine(v === "mine")}
              options={[
                { id: "any", label: "Any team" },
                { id: "mine", label: "My team" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card data-testid="players-leaders">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Leaders</CardTitle>
            <CardDescription>{scopeLabel}. Fantasy points scored while on a team in this league (regular season).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 p-3 pt-0">
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No players match.</p>}
            {rows.slice(0, limit).map((p, i) => {
              const active = selected?.playerId === p.playerId;
              return (
                <button
                  key={p.playerId}
                  type="button"
                  onClick={() => select(p.playerId)}
                  aria-pressed={active}
                  data-testid={`player-row-${p.playerId}`}
                  className={`w-full rounded-md border px-3 py-2 text-left ${active ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <PlayerFace playerId={p.playerId} name={p.name} position={p.position} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <PosBadge position={p.position} />
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[p.team, p.currentTeam?.teamName].filter(Boolean).join(" · ")}
                        {p.team || p.currentTeam ? " · " : ""}
                        {p.seasons.length} {p.seasons.length === 1 ? "season" : "seasons"}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                      <div>{p.games} GP</div>
                      <div>{formatPoints(ppg(p.points, p.games))} PPG</div>
                    </div>
                    <div className="w-24 text-right">
                      <div className="font-semibold tabular-nums">{formatPoints(p.points)}</div>
                      <div className="mt-1 h-1 rounded bg-muted">
                        <div className={`h-1 rounded ${positionBarClass(p.position)}`} style={{ width: `${Math.min(100, (p.points / leaderValue) * 100)}%` }} />
                      </div>
                      <div className="mt-0.5 hidden text-[10px] text-muted-foreground sm:block">
                        best {formatPoints(p.best.points)} ({p.best.season})
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {rows.length > limit && (
              <div className="pt-2 text-center">
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setLimit(limit + 50)}>
                  Show more ({rows.length - limit} left)
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <div ref={profileRef} className="scroll-mt-4">
          {selected ? <PlayerProfile player={selected} /> : <StatsEmpty>No player selected.</StatsEmpty>}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Drafts ─────────────────────────

interface DraftPick {
  round: number;
  pickNo: number;
  franchiseId: string;
  teamName: string;
  via: { franchiseId: string; teamName: string } | null;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
}
interface DraftData {
  draftId: string;
  season: string;
  status: string;
  kind: "startup" | "rookie";
  rounds: number;
  picks: DraftPick[];
}

export function DraftsTab({ season }: { season: string }) {
  const { data, isLoading, error, refetch } = useStatsQuery<{ drafts: DraftData[] }>("drafts", season);
  const [kind, setKind] = useState<"rookie" | "startup">("rookie");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const drafts = useMemo(() => (data?.drafts ?? []).filter((d) => d.kind === kind).sort((a, b) => b.season.localeCompare(a.season)), [data, kind]);
  const draft = drafts.find((d) => d.draftId === draftId) ?? drafts[0];
  const picks = useMemo(() => (draft ? draft.picks.filter((p) => round === 0 || p.round === round) : []), [draft, round]);
  const byRound = useMemo(() => {
    const map = new Map<number, DraftPick[]>();
    picks.forEach((p) => map.set(p.round, [...(map.get(p.round) ?? []), p]));
    return Array.from(map.entries());
  }, [picks]);
  const classByPosition = useMemo(() => {
    const counts = new Map<string, number>();
    (draft?.picks ?? []).forEach((p) => counts.set(p.position || "?", (counts.get(p.position || "?") ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [draft]);

  if (isLoading) return <StatsLoading message="Loading drafts." />;
  if (error || !data) return <StatsError message="Could not load drafts." onRetry={() => refetch()} />;
  const anyOfKind = (k: string) => data.drafts.some((d) => d.kind === k);

  return (
    <div className="space-y-4" data-testid="drafts-tab">
      <div className="flex flex-wrap items-center gap-3">
        <Chips
          label="Draft type"
          value={kind}
          onChange={(v) => {
            setKind(v);
            setDraftId(null);
            setRound(0);
          }}
          options={[
            { id: "rookie" as const, label: "Rookie drafts" },
            { id: "startup" as const, label: "Startup draft" },
          ].filter((o) => anyOfKind(o.id) || o.id === kind)}
        />
        {drafts.length > 1 && (
          <Chips
            label="Draft"
            value={draft?.draftId ?? ""}
            onChange={(v) => {
              setDraftId(v);
              setRound(0);
            }}
            options={drafts.map((d) => ({ id: d.draftId, label: d.season }))}
          />
        )}
      </div>

      {!draft ? (
        <StatsEmpty>{season === ALL_TIME ? "No drafts found." : "No draft was held this season."}</StatsEmpty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {draft.season} {draft.kind === "startup" ? "startup" : "rookie"} draft
                {draft.status !== "complete" && <Badge className="ml-2" variant="outline">In progress</Badge>}
              </CardTitle>
              <div className="pt-2">
                <Chips
                  label="Round"
                  value={String(round)}
                  onChange={(v) => setRound(Number(v))}
                  options={[{ id: "0", label: "All rounds" }, ...Array.from({ length: draft.rounds }, (_, i) => ({ id: String(i + 1), label: `Round ${i + 1}` }))]}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {draft.picks.length === 0 && <p className="text-sm text-muted-foreground">No picks have been made.</p>}
              {byRound.map(([r, list]) => (
                <div key={r} className="space-y-1.5">
                  <div className="text-sm font-semibold">Round {r}</div>
                  <div className="grid gap-1.5 lg:grid-cols-2">
                    {list.map((p) => (
                      <div key={p.pickNo} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm" data-testid={`draft-pick-${p.pickNo}`}>
                        <span className="w-7 text-xs tabular-nums text-muted-foreground">{p.pickNo}</span>
                        <PlayerFace playerId={p.playerId} name={p.playerName} position={p.position} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{p.playerName}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <PositionBadge position={p.position} />
                            <span className="truncate">{p.nflTeam}</span>
                          </div>
                        </div>
                        <div className="min-w-0 text-right text-[11px]">
                          <TeamLink id={p.franchiseId} name={p.teamName} size={16} />
                          {p.via && <div className="text-amber-600 dark:text-amber-400">via {p.via.teamName}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-heading text-lg">The class</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {classByPosition.map(([pos, n]) => (
                  <div key={pos} className="flex items-center gap-2">
                    <PositionBadge position={pos} />
                    <div className="h-2 flex-1 rounded bg-muted">
                      <div className={`h-2 rounded ${positionBarClass(pos)}`} style={{ width: `${(n / classByPosition[0][1]) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right tabular-nums">{n}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1 text-muted-foreground">
                  <span>Traded picks</span>
                  <span className="tabular-nums">{draft.picks.filter((p) => p.via).length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Transactions ─────────────────────────

interface FeedAsset {
  kind: "player" | "pick";
  playerId?: string;
  name: string;
  position?: string | null;
  team?: string | null;
}
interface FeedItem {
  id: string;
  type: "trade" | "waiver" | "free_agent" | "commissioner";
  season: string;
  week: number;
  at: number;
  waiverBid: number | null;
  sides: Array<{ rosterId: number; franchiseId: string; teamName: string; received: FeedAsset[]; gave: FeedAsset[] }>;
}

const TYPE_LABEL: Record<string, string> = { trade: "Trade", waiver: "Waiver", free_agent: "Free agent", commissioner: "Commissioner" };
/** A moved player or draft pick, for the feed. Plain text: no colors or pictures here. */
function Asset({ asset, sign }: { asset: FeedAsset; sign: "+" | "-" }) {
  const tone = sign === "+" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <span className="inline-flex items-center gap-1.5 pr-2">
      <span className={`font-semibold ${tone}`}>{sign}</span>
      <span>{asset.name}</span>
      {asset.kind === "player" && asset.position && <span className="text-[11px] text-muted-foreground">({asset.position})</span>}
    </span>
  );
}

export function TransactionsTab({ season }: { season: string }) {
  const { data, isLoading, error, refetch } = useStatsQuery<{ items: FeedItem[] }>("transactions", season);
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? []).filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (!q) return true;
      return t.sides.some((s) => s.teamName.toLowerCase().includes(q) || [...s.received, ...s.gave].some((a) => a.name.toLowerCase().includes(q)));
    });
  }, [data, type, query]);

  if (isLoading) return <StatsLoading message="Loading transactions." />;
  if (error || !data) return <StatsError message="Could not load transactions." onRetry={() => refetch()} />;
  if (data.items.length === 0) return <StatsEmpty />;

  return (
    <Card data-testid="transactions-tab">
      <CardHeader>
        <CardTitle className="font-heading text-lg">{season === ALL_TIME ? "All transactions" : `${season} transactions`}</CardTitle>
        <CardDescription>Newest first. Completed trades, waiver claims and free-agent moves.</CardDescription>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Chips
            label="Move type"
            value={type}
            onChange={(v) => {
              setType(v);
              setLimit(50);
            }}
            options={[{ id: "all", label: "All" }, ...Object.entries(TYPE_LABEL).map(([id, label]) => ({ id, label }))]}
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(50);
            }}
            placeholder="Search team or player"
            aria-label="Search transactions"
            className="h-8 w-56"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No transactions match.</p>}
        {rows.slice(0, limit).map((t) => (
          <div key={t.id} className="rounded-md border p-3 text-sm" data-testid={`transaction-${t.id}`}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{TYPE_LABEL[t.type] ?? t.type}</Badge>
              <span>
                {t.season} week {t.week}
              </span>
              {t.waiverBid != null && <span>bid ${t.waiverBid}</span>}
            </div>
            <div className={`grid gap-2 ${t.sides.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {t.sides.map((s) => (
                <div key={s.rosterId} className="space-y-0.5">
                  <TeamLink id={s.franchiseId} name={s.teamName} size={18} />
                  {s.received.length > 0 && (
                    <div className="flex flex-wrap gap-y-1 pl-7">
                      {s.received.map((a, i) => <Asset key={`r${i}`} asset={a} sign="+" />)}
                    </div>
                  )}
                  {s.gave.length > 0 && (
                    <div className="flex flex-wrap gap-y-1 pl-7">
                      {s.gave.map((a, i) => <Asset key={`g${i}`} asset={a} sign="-" />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {rows.length > limit && (
          <div className="pt-2 text-center">
            <button type="button" className="text-sm text-primary hover:underline" onClick={() => setLimit(limit + 50)}>
              Show more ({rows.length - limit} left)
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
