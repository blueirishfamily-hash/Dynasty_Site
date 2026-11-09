import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  computeFranchiseTotals,
  computeHeadToHead,
  filterGames,
  type FranchiseTotals,
} from "@shared/leagueHistory";
import {
  ResultBadge,
  TeamAvatar,
  TeamLink,
  YouBadge,
  formatPct,
  formatPoints,
  recordText,
  useHistoryContext,
  weekLabel,
} from "./common";

function TeamGrid() {
  const { history, myFranchiseId } = useHistoryContext();
  const totals = useMemo(() => {
    const map = new Map(computeFranchiseTotals(history).map((t) => [t.franchiseId, t]));
    return history.franchises
      .map((f) => ({ franchise: f, totals: map.get(f.id) as FranchiseTotals }))
      .sort((a, b) => b.totals.titles - a.totals.titles || b.totals.winPct - a.totals.winPct);
  }, [history]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="team-grid">
      {totals.map(({ franchise, totals: t }) => (
        <Link key={franchise.id} href={`/history/teams/${encodeURIComponent(franchise.id)}`} data-testid={`card-team-${franchise.id}`}>
          <Card className="h-full hover-elevate cursor-pointer">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <TeamAvatar franchise={franchise} size={40} />
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {franchise.name}
                    {myFranchiseId === franchise.id && <YouBadge />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{franchise.ownerName}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-bold flex items-center justify-center gap-1">
                    {t.titles > 0 && <Trophy className="w-3.5 h-3.5 text-yellow-500" />}
                    {t.titles}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Titles</div>
                </div>
                <div>
                  <div className="font-bold">{recordText(t.wins, t.losses, t.ties)}</div>
                  <div className="text-[11px] text-muted-foreground">Record</div>
                </div>
                <div>
                  <div className="font-bold">{formatPct(t.winPct)}</div>
                  <div className="text-[11px] text-muted-foreground">Win %</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-heading font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

const RESULT_COLOR: Record<string, string> = {
  champion: "#eab308",
  runner_up: "#94a3b8",
  third: "#b45309",
  fourth: "#64748b",
  playoffs: "hsl(var(--primary))",
  missed: "hsl(var(--muted-foreground))",
};

function TeamDetail({ id }: { id: string }) {
  const { history, franchiseById, myFranchiseId } = useHistoryContext();
  const franchise = franchiseById.get(id);
  const totals = useMemo(() => computeFranchiseTotals(history).find((t) => t.franchiseId === id), [history, id]);

  const seasons = useMemo(
    () =>
      history.seasons
        .map((season) => ({ season, team: season.teams.find((t) => t.franchiseId === id) }))
        .filter((x) => x.team)
        .map((x) => ({ season: x.season, team: x.team! })),
    [history, id],
  );

  const games = useMemo(() => filterGames(history, { kinds: ["regular", "playoff"] }), [history]);

  const opponents = useMemo(
    () =>
      history.franchises
        .filter((f) => f.id !== id)
        .map((f) => ({ franchise: f, h2h: computeHeadToHead(games, id, f.id) }))
        .sort((a, b) => b.h2h.aWins - b.h2h.bWins - (a.h2h.aWins - a.h2h.bWins)),
    [history, games, id],
  );

  const notable = useMemo(() => {
    const mine = games
      .filter((g) => g.a === id || g.b === id)
      .map((g) => {
        const isA = g.a === id;
        return { g, score: isA ? g.scoreA : g.scoreB, opp: isA ? g.scoreB : g.scoreA, oppId: isA ? g.b : g.a };
      })
      .filter((x) => x.score + x.opp > 0);
    if (mine.length === 0) return null;
    const best = [...mine].sort((a, b) => b.score - b.opp - (a.score - a.opp))[0];
    const worst = [...mine].sort((a, b) => a.score - a.opp - (b.score - b.opp))[0];
    const high = [...mine].sort((a, b) => b.score - a.score)[0];
    return { best, worst, high };
  }, [games, id]);

  if (!franchise || !totals) {
    return (
      <div className="space-y-3">
        <Link href="/history/teams" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All teams
        </Link>
        <p className="text-muted-foreground">That team isn't in the league history.</p>
      </div>
    );
  }

  const chartData = seasons.map(({ season, team }) => ({
    season: season.season,
    wins: team.wins,
    result: team.result ?? "playoffs",
    record: recordText(team.wins, team.losses, team.ties),
  }));

  const gameLine = (x: { g: (typeof games)[number]; score: number; opp: number; oppId: string }) => (
    <div className="text-sm">
      <div className="font-semibold tabular-nums">
        {formatPoints(x.score)} - {formatPoints(x.opp)}
      </div>
      <div className="text-xs text-muted-foreground">
        vs {franchiseById.get(x.oppId)?.name}, {weekLabel(x.g.season, x.g.week, x.g.label)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid={`team-detail-${id}`}>
      <Link href="/history/teams" className="text-sm text-primary inline-flex items-center gap-1" data-testid="link-all-teams">
        <ArrowLeft className="w-4 h-4" /> All teams
      </Link>
      <div className="flex items-center gap-4">
        <TeamAvatar franchise={franchise} size={64} />
        <div>
          <h2 className="text-2xl font-heading font-bold flex items-center gap-2">
            {franchise.name}
            {myFranchiseId === id && <YouBadge />}
          </h2>
          <p className="text-sm text-muted-foreground">
            {franchise.ownerName} - {totals.seasons} {totals.seasons === 1 ? "season" : "seasons"} tracked
          </p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        <Stat label="Titles" value={totals.titles} sub={`${totals.finals} finals`} />
        <Stat label="Playoffs" value={totals.playoffAppearances} sub={`${totals.playoffWins}-${totals.playoffLosses} in games`} />
        <Stat label="Record" value={recordText(totals.wins, totals.losses, totals.ties)} />
        <Stat label="Win %" value={formatPct(totals.winPct)} />
        <Stat label="PPG" value={formatPoints(totals.pointsPerGame, 1)} />
        <Stat label="Points for" value={Math.round(totals.pointsFor).toLocaleString()} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Season by season</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-team-seasons">
            <TableHeader>
              <TableRow>
                <TableHead>Season</TableHead>
                <TableHead>Team name</TableHead>
                <TableHead className="text-right">Record</TableHead>
                <TableHead className="text-right">Rank</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">PA</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...seasons].reverse().map(({ season, team }) => (
                <TableRow key={season.season}>
                  <TableCell>
                    <Link href={`/history/seasons/${season.season}`} className="text-primary hover:underline font-medium">
                      {season.season}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{team.name}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">{recordText(team.wins, team.losses, team.ties)}</TableCell>
                  <TableCell className="text-right">{team.rank}</TableCell>
                  <TableCell className="text-right">{formatPoints(team.pointsFor)}</TableCell>
                  <TableCell className="text-right">{formatPoints(team.pointsAgainst)}</TableCell>
                  <TableCell>
                    <ResultBadge result={team.result} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Wins by season</CardTitle>
            <CardDescription>Bar color shows how the playoffs went</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56" data-testid="chart-team-wins">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="season" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    formatter={(_: unknown, __: unknown, item: { payload?: { record: string } }) => [item.payload?.record, "Record"]}
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                  />
                  <Bar dataKey="wins" radius={[4, 4, 0, 0]}>
                    {chartData.map((d) => (
                      <Cell key={d.season} fill={RESULT_COLOR[d.result]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {notable && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Notable games</CardTitle>
              <CardDescription>Regular season and playoffs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Biggest win</div>
                {gameLine(notable.best)}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Worst loss</div>
                {gameLine(notable.worst)}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Highest score</div>
                {gameLine(notable.high)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Head-to-head</CardTitle>
          <CardDescription>Record against every other team, best matchups first</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-team-h2h">
            <TableHeader>
              <TableRow>
                <TableHead>Opponent</TableHead>
                <TableHead className="text-right">Record</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-right">Streak</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {opponents.map(({ franchise: opp, h2h }) => (
                <TableRow key={opp.id}>
                  <TableCell>
                    <TeamLink id={opp.id} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {recordText(h2h.aWins, h2h.bWins, h2h.ties)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                    {Math.round(h2h.aPoints).toLocaleString()} - {Math.round(h2h.bPoints).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {h2h.streak !== 0 && (
                      <Badge variant="outline" className={h2h.streak > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                        {h2h.streak > 0 ? `W${h2h.streak}` : `L${-h2h.streak}`}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/history/matchups/${encodeURIComponent(id)}/${encodeURIComponent(opp.id)}`} className="text-xs text-primary hover:underline" data-testid={`link-h2h-${opp.id}`}>
                      All games
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeamsView({ teamId }: { teamId?: string }) {
  if (teamId) return <TeamDetail id={decodeURIComponent(teamId)} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Select a team for its season-by-season history, notable games and head-to-head record.</p>
      <TeamGrid />
    </div>
  );
}