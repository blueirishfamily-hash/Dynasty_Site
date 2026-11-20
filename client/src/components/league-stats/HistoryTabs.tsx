import { Fragment, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeRecordsBook, sortChronological, type HistoryGame } from "@shared/leagueHistory";
import {
  AllTimeTable,
  ChampionsTimeline,
  RecordsBook,
  recordDetail,
  recordValue,
} from "@/components/history/LeagueView";
import { PlayoffGame } from "@/components/history/SeasonView";
import { ResultBadge, TeamLink, formatPoints, recordText, useHistoryContext, weekLabel } from "@/components/history/common";
import { ALL_TIME, statsHref } from "./statsRoute";
import { StatsEmpty } from "./StatsStates";

// The League Stats tabs that run on the league history payload: overview, standings and records.
// (Teams and matchups reuse the existing history views directly.)

/** The top entry in each of the first few record categories. */
function RecordPreview({ season }: { season: string }) {
  const { history } = useHistoryContext();
  const categories = useMemo(() => computeRecordsBook(history).filter((c) => c.entries.length > 0).slice(0, 6), [history]);
  return (
    <Card data-testid="record-preview">
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg">Record book</CardTitle>
        <CardDescription>The top mark in each category</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {categories.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}
        {categories.map((category) => {
          const entry = category.entries[0];
          return (
            <div key={category.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground">{category.title}</span>
                <span className="font-semibold tabular-nums">{recordValue(category, entry)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <TeamLink id={entry.franchiseId} size={18} />
                <span className="truncate text-[11px] text-muted-foreground">{recordDetail(category, entry)}</span>
              </div>
            </div>
          );
        })}
        <Link href={statsHref("records", { season })} className="inline-block text-sm text-primary hover:underline">
          All records
        </Link>
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ season }: { season: string }) {
  const { history } = useHistoryContext();
  const allTime = season === ALL_TIME;
  if (!allTime && history.seasons.length === 0) return <StatsEmpty />;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{allTime ? "Champions" : `${season} champion`}</h2>
        <ChampionsTimeline />
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AllTimeTable
          title={allTime ? "All-time standings" : `${season} standings`}
          description={
            allTime
              ? "Regular-season records and playoff results across every tracked season"
              : "Regular-season record and playoff result for this season"
          }
        />
        <RecordPreview season={season} />
      </div>
    </div>
  );
}

/** Top single-team scores of a season, regular season and playoffs. */
function topScores(games: HistoryGame[], limit = 5) {
  const entries = games.flatMap((g) => [
    { franchiseId: g.a, opponentId: g.b, score: g.scoreA, game: g },
    { franchiseId: g.b, opponentId: g.a, score: g.scoreB, game: g },
  ]);
  return entries.filter((e) => e.score > 0).sort((x, y) => y.score - x.score).slice(0, limit);
}

function SeasonStandings({ season }: { season: string }) {
  const { history } = useHistoryContext();
  const data = history.seasons.find((s) => s.season === season);
  const games = useMemo(() => history.games.filter((g) => g.season === season && g.kind !== "consolation"), [history, season]);
  const playoffWeeks = useMemo(() => {
    const map = new Map<number, HistoryGame[]>();
    sortChronological(games.filter((g) => g.kind === "playoff")).forEach((g) => map.set(g.week, [...(map.get(g.week) ?? []), g]));
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [games]);
  const scores = useMemo(() => topScores(games), [games]);
  if (!data) return <StatsEmpty />;

  return (
    <div className="space-y-4" data-testid={`season-standings-${season}`}>
      {!data.complete && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          This season is in progress. Standings are not final and there is no champion yet.
        </p>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">{season} standings</CardTitle>
            <CardDescription>Ranked by record, then points for. Top {data.playoffTeams} make the playoffs.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table data-testid="table-season-standings">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">PF</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">PA</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.teams.map((team, index) => (
                  <Fragment key={team.franchiseId}>
                    {index === data.playoffTeams && (
                      <TableRow key={`line-${team.franchiseId}`} className="hover:bg-transparent" data-testid="playoff-line">
                        <TableCell colSpan={6} className="border-t-2 border-primary/50 py-1 text-[11px] uppercase tracking-wide text-primary">
                          Playoff line
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow key={team.franchiseId}>
                      <TableCell className="text-muted-foreground">{team.rank}</TableCell>
                      <TableCell>
                        <TeamLink id={team.franchiseId} name={team.name} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{recordText(team.wins, team.losses, team.ties)}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{formatPoints(team.pointsFor)}</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{formatPoints(team.pointsAgainst)}</TableCell>
                      <TableCell>
                        <ResultBadge result={team.result} />
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Playoffs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4" data-testid="season-playoffs">
              {playoffWeeks.length === 0 && <p className="text-sm text-muted-foreground">No playoff games yet.</p>}
              {playoffWeeks.map(([week, weekGames]) => (
                <div key={week} className="space-y-2">
                  <div className="text-sm font-semibold">Week {week}</div>
                  {weekGames.map((game, i) => (
                    <PlayoffGame key={`${game.a}-${game.b}-${i}`} game={game} />
                  ))}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Top scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2" data-testid="season-top-scores">
              {scores.length === 0 && <p className="text-sm text-muted-foreground">No games yet.</p>}
              {scores.map((e, i) => (
                <div key={`${e.franchiseId}-${e.game.week}-${i}`} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <TeamLink id={e.franchiseId} size={20} />
                    <div className="truncate pl-7 text-[11px] text-muted-foreground">{weekLabel(e.game.season, e.game.week, e.game.label)}</div>
                  </div>
                  <span className="font-semibold tabular-nums">{formatPoints(e.score)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function StandingsTab({ season }: { season: string }) {
  if (season === ALL_TIME) return <AllTimeTable />;
  return <SeasonStandings season={season} />;
}

export function RecordsTab() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold">Records book</h2>
        <p className="text-sm text-muted-foreground">
          All-time records. Regular season and playoff games count; consolation games do not.
        </p>
      </div>
      <RecordsBook />
    </section>
  );
}
