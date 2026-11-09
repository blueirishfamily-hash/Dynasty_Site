import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Crown, Medal } from "lucide-react";
import { sortChronological, winnerOf, type HistoryGame } from "@shared/leagueHistory";
import { ResultBadge, TeamLink, formatPoints, recordText, useHistoryContext } from "./common";

function PlayoffGame({ game }: { game: HistoryGame }) {
  const winner = winnerOf(game);
  const row = (id: string, score: number) => (
    <div className={`flex items-center justify-between gap-3 ${winner === id ? "font-semibold" : "text-muted-foreground"}`}>
      <TeamLink id={id} size={20} />
      <span className="tabular-nums">{formatPoints(score)}</span>
    </div>
  );
  return (
    <div className="rounded-md border p-2.5 space-y-1 text-sm" data-testid="playoff-game">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{game.label ?? `Week ${game.week}`}</div>
      {row(game.a, game.scoreA)}
      {row(game.b, game.scoreB)}
    </div>
  );
}

export default function SeasonView({ season: seasonId }: { season: string }) {
  const { history } = useHistoryContext();
  const season = history.seasons.find((s) => s.season === seasonId);

  const playoffGames = useMemo(
    () => sortChronological(history.games.filter((g) => g.season === seasonId && g.kind === "playoff")),
    [history, seasonId],
  );

  const weeks = useMemo(() => {
    const map = new Map<number, HistoryGame[]>();
    playoffGames.forEach((g) => map.set(g.week, [...(map.get(g.week) ?? []), g]));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [playoffGames]);

  if (!season) {
    return (
      <div className="space-y-3">
        <Link href="/history" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> League history
        </Link>
        <p className="text-muted-foreground">That season isn't in the league history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid={`season-detail-${season.season}`}>
      <Link href="/history" className="text-sm text-primary inline-flex items-center gap-1" data-testid="link-back-league">
        <ArrowLeft className="w-4 h-4" /> League history
      </Link>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h2 className="text-3xl font-heading font-bold">{season.season} season</h2>
        {season.complete && season.championId ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-yellow-500" />
              <TeamLink id={season.championId} className="font-semibold" />
            </span>
            {season.runnerUpId && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Medal className="w-4 h-4 text-slate-400" />
                <TeamLink id={season.runnerUpId} />
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">In progress</span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Regular season standings</CardTitle>
          <CardDescription>Ranked by record, then points for. Top {season.playoffTeams} make the playoffs.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-season-standings">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Record</TableHead>
                <TableHead className="text-right">PF</TableHead>
                <TableHead className="text-right">PA</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {season.teams.map((team) => (
                <TableRow key={team.franchiseId}>
                  <TableCell className="text-muted-foreground">{team.rank}</TableCell>
                  <TableCell>
                    <TeamLink id={team.franchiseId} name={team.name} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">{recordText(team.wins, team.losses, team.ties)}</TableCell>
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

      {weeks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">Playoffs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3" data-testid="season-playoffs">
            {weeks.map(([week, games]) => (
              <div key={week} className="space-y-2">
                <div className="text-sm font-semibold">Week {week}</div>
                {games.map((game, index) => (
                  <PlayoffGame key={`${game.a}-${game.b}-${index}`} game={game} />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}