import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, Medal, ArrowUpDown, Trophy } from "lucide-react";
import {
  computeFranchiseTotals,
  computeRecordsBook,
  type FranchiseTotals,
  type RecordCategory,
  type RecordEntry,
} from "@shared/leagueHistory";
import { TeamLink, formatPct, formatPoints, recordText, useHistoryContext, weekLabel } from "./common";

function ChampionsTimeline() {
  const { history, franchiseById } = useHistoryContext();
  const seasons = [...history.seasons].reverse();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="champions-timeline">
      {seasons.map((season) => {
        const leader = season.teams[0];
        return (
          <Link key={season.season} href={`/history/seasons/${season.season}`} data-testid={`card-season-${season.season}`}>
            <Card className="h-full hover-elevate cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl font-heading">{season.season}</CardTitle>
                  {season.complete ? (
                    <Crown className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <span className="text-xs text-muted-foreground">In progress</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {season.complete && season.championId ? (
                  <>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Champion</div>
                      <TeamLink id={season.championId} size={28} link={false} className="font-semibold" />
                    </div>
                    {season.runnerUpId && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Medal className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{franchiseById.get(season.runnerUpId)?.name}</span>
                      </div>
                    )}
                    {season.thirdId && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Medal className="w-3.5 h-3.5 text-amber-700" />
                        <span className="truncate">{franchiseById.get(season.thirdId)?.name}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Current leader</div>
                    {leader ? (
                      <div className="flex items-center justify-between gap-2">
                        <TeamLink id={leader.franchiseId} size={28} link={false} className="font-semibold" />
                        <span className="text-muted-foreground">{recordText(leader.wins, leader.losses, leader.ties)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No games yet</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

type SortKey = "titles" | "finals" | "playoffAppearances" | "winPct" | "pointsPerGame" | "wins";

function AllTimeTable() {
  const { history } = useHistoryContext();
  const [sortKey, setSortKey] = useState<SortKey>("titles");
  const rows = useMemo(() => {
    const totals = computeFranchiseTotals(history);
    return [...totals].sort((a, b) => b[sortKey] - a[sortKey] || b.winPct - a.winPct || b.pointsFor - a.pointsFor);
  }, [history, sortKey]);

  const header = (key: SortKey, label: string) => (
    <TableHead className="text-right whitespace-nowrap">
      <button
        className={`inline-flex items-center gap-1 hover:text-foreground ${sortKey === key ? "text-foreground font-semibold" : ""}`}
        onClick={() => setSortKey(key)}
        data-testid={`sort-${key}`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-60" />
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">All-time standings</CardTitle>
        <CardDescription>Regular-season records and playoff results across every tracked season</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table data-testid="table-all-time">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Team</TableHead>
              {header("titles", "Titles")}
              {header("finals", "Finals")}
              {header("playoffAppearances", "Playoffs")}
              {header("wins", "Record")}
              {header("winPct", "Win %")}
              {header("pointsPerGame", "PPG")}
              <TableHead className="text-right whitespace-nowrap">Best season</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row: FranchiseTotals, index) => (
              <TableRow key={row.franchiseId} data-testid={`row-all-time-${row.franchiseId}`}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <TeamLink id={row.franchiseId} />
                </TableCell>
                <TableCell className="text-right">
                  {row.titles > 0 ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                      {row.titles}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{row.finals}</TableCell>
                <TableCell className="text-right">{row.playoffAppearances}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{recordText(row.wins, row.losses, row.ties)}</TableCell>
                <TableCell className="text-right">{formatPct(row.winPct)}</TableCell>
                <TableCell className="text-right">{formatPoints(row.pointsPerGame, 1)}</TableCell>
                <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                  {row.bestSeason
                    ? `${row.bestSeason.season} (${recordText(row.bestSeason.wins, row.bestSeason.losses, row.bestSeason.ties)})`
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function recordValue(category: RecordCategory, entry: RecordEntry): string {
  if (category.unit === "record") return `${entry.value}-${entry.other ?? 0}`;
  if (category.unit === "games") return `${entry.value} games`;
  return formatPoints(entry.value);
}

function recordDetail(category: RecordCategory, entry: RecordEntry): string {
  if (entry.span) return entry.span;
  if (entry.week == null) return entry.season;
  const when = weekLabel(entry.season, entry.week, entry.label);
  return when;
}

function RecordCard({ category }: { category: RecordCategory }) {
  const { franchiseById } = useHistoryContext();
  return (
    <Card data-testid={`record-${category.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-heading">{category.title}</CardTitle>
        <CardDescription className="text-xs">{category.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {category.entries.map((entry, index) => (
          <div key={`${entry.franchiseId}-${entry.season}-${entry.week}-${index}`} className="flex items-center gap-3 text-sm">
            <span className={`w-4 text-xs ${index === 0 ? "text-yellow-500 font-bold" : "text-muted-foreground"}`}>{index + 1}</span>
            <div className="min-w-0 flex-1">
              <TeamLink id={entry.franchiseId} size={20} />
              <div className="text-[11px] text-muted-foreground truncate pl-7">
                {recordDetail(category, entry)}
                {entry.opponentId && category.id !== "shootout" ? ` vs ${franchiseById.get(entry.opponentId)?.name ?? ""}` : ""}
                {entry.opponentId && category.id === "shootout" ? ` over ${franchiseById.get(entry.opponentId)?.name ?? ""}` : ""}
              </div>
            </div>
            <span className={`tabular-nums ${index === 0 ? "font-bold" : "font-medium"}`}>{recordValue(category, entry)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecordsBook() {
  const { history } = useHistoryContext();
  const categories = useMemo(() => computeRecordsBook(history), [history]);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="records-book">
      {categories.map((category) => (
        <RecordCard key={category.id} category={category} />
      ))}
    </div>
  );
}

export default function LeagueView() {
  const { history } = useHistoryContext();
  const finished = history.seasons.filter((s) => s.complete).length;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Champions</h2>
          <p className="text-sm text-muted-foreground">
            {history.seasons.length} seasons tracked, {finished} finished. Select a season for its full standings and playoffs.
          </p>
        </div>
        <ChampionsTimeline />
      </section>
      <AllTimeTable />
      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Records book</h2>
          <p className="text-sm text-muted-foreground">Regular season and playoff games. Consolation games are not counted.</p>
        </div>
        <RecordsBook />
      </section>
    </div>
  );
}