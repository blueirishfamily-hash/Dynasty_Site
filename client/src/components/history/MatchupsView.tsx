import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft } from "lucide-react";
import {
  computeGameLists,
  computeHeadToHead,
  computeHeadToHeadMatrix,
  filterGames,
  matrixKey,
  winnerOf,
  type GameKind,
  type GameListEntry,
  type HistoryGame,
} from "@shared/leagueHistory";
import { TeamAvatar, TeamLink, formatPoints, recordText, useHistoryContext, weekLabel } from "./common";

type KindFilter = "all" | "regular" | "playoff";

const kindsFor = (filter: KindFilter): GameKind[] => (filter === "all" ? ["regular", "playoff"] : [filter]);

function cellTone(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return "";
  const pct = wins / total;
  if (pct > 0.6) return "bg-green-500/20 text-green-700 dark:text-green-300";
  if (pct < 0.4) return "bg-red-500/20 text-red-700 dark:text-red-300";
  return "bg-muted/60";
}

function MatrixGrid({ games }: { games: HistoryGame[] }) {
  const { history, myFranchiseId } = useHistoryContext();
  const [, navigate] = useLocation();
  const ids = useMemo(() => history.franchises.map((f) => f.id), [history]);
  const cells = useMemo(() => computeHeadToHeadMatrix(games, ids), [games, ids]);

  return (
    <div className="overflow-x-auto rounded-md border" data-testid="h2h-grid">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background p-2 text-left font-normal text-muted-foreground">Row vs column</th>
            {history.franchises.map((f) => (
              <th key={f.id} className="p-1.5 font-normal" title={f.name}>
                <div className="flex flex-col items-center gap-1 w-14">
                  <TeamAvatar franchise={f} size={24} />
                  <span className={`truncate w-full text-[10px] ${myFranchiseId === f.id ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    {f.name}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.franchises.map((row) => (
            <tr key={row.id} className="border-t">
              <th className="sticky left-0 z-10 bg-background p-2 text-left font-normal whitespace-nowrap">
                <TeamLink id={row.id} size={20} className="max-w-[10rem]" />
              </th>
              {history.franchises.map((col) => {
                if (row.id === col.id) return <td key={col.id} className="bg-muted/30" />;
                const cell = cells.get(matrixKey(row.id, col.id));
                const empty = !cell || cell.wins + cell.losses + cell.ties === 0;
                return (
                  <td key={col.id} className="p-0 text-center">
                    <button
                      className={`w-full h-9 tabular-nums hover:ring-2 hover:ring-primary/60 hover:ring-inset ${cell ? cellTone(cell.wins, cell.losses) : ""}`}
                      onClick={() => navigate(`/history/matchups/${encodeURIComponent(row.id)}/${encodeURIComponent(col.id)}`)}
                      data-testid={`cell-${row.id}-${col.id}`}
                      title={`${row.name} vs ${col.name}`}
                    >
                      {empty ? "-" : recordText(cell!.wins, cell!.losses, cell!.ties)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameList({ title, entries, mode }: { title: string; entries: GameListEntry[]; mode: "margin" | "combined" }) {
  const { franchiseById } = useHistoryContext();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-heading">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map(({ game, margin, combined }, index) => {
          const winner = winnerOf(game);
          const [w, l] = winner === game.a ? [game.a, game.b] : [game.b, game.a];
          const [ws, ls] = winner === game.a ? [game.scoreA, game.scoreB] : [game.scoreB, game.scoreA];
          return (
            <Link
              key={`${game.season}-${game.week}-${game.a}-${index}`}
              href={`/history/matchups/${encodeURIComponent(w)}/${encodeURIComponent(l)}`}
              className="block text-sm hover:bg-muted/50 rounded-md -mx-1.5 px-1.5 py-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <span className="font-medium">{franchiseById.get(w)?.name}</span>
                  <span className="text-muted-foreground"> over {franchiseById.get(l)?.name}</span>
                </span>
                <span className="font-semibold tabular-nums shrink-0">
                  {mode === "margin" ? formatPoints(margin) : formatPoints(combined)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums">
                {weekLabel(game.season, game.week, game.label)} - {formatPoints(ws)} to {formatPoints(ls)}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MatchupOverview() {
  const { history } = useHistoryContext();
  const [season, setSeason] = useState("all");
  const [kind, setKind] = useState<KindFilter>("all");

  const games = useMemo(
    () => filterGames(history, { kinds: kindsFor(kind), seasons: season === "all" ? undefined : [season] }),
    [history, season, kind],
  );
  const lists = useMemo(() => computeGameLists(games, 5), [games]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={season} onValueChange={setSeason}>
          <SelectTrigger className="w-40" data-testid="select-h2h-season">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All seasons</SelectItem>
            {[...history.seasons].reverse().map((s) => (
              <SelectItem key={s.season} value={s.season}>
                {s.season}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as KindFilter)} variant="outline" size="sm">
          <ToggleGroupItem value="all" data-testid="toggle-kind-all">
            All games
          </ToggleGroupItem>
          <ToggleGroupItem value="regular" data-testid="toggle-kind-regular">
            Regular season
          </ToggleGroupItem>
          <ToggleGroupItem value="playoff" data-testid="toggle-kind-playoff">
            Playoffs
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">{games.length} games</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg">Head-to-head grid</CardTitle>
          <CardDescription>Each cell is the row team's record against the column team. Select a cell for every meeting.</CardDescription>
        </CardHeader>
        <CardContent>
          <MatrixGrid games={games} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <GameList title="Closest games" entries={lists.closest} mode="margin" />
        <GameList title="Biggest blowouts" entries={lists.blowouts} mode="margin" />
        <GameList title="Highest-scoring games" entries={lists.highestScoring} mode="combined" />
      </div>
    </div>
  );
}

function RivalryDetail({ aId, bId }: { aId: string; bId: string }) {
  const { history, franchiseById } = useHistoryContext();
  const [kind, setKind] = useState<KindFilter>("all");
  const a = franchiseById.get(aId);
  const b = franchiseById.get(bId);

  const games = useMemo(() => filterGames(history, { kinds: kindsFor(kind) }), [history, kind]);
  const h2h = useMemo(() => computeHeadToHead(games, aId, bId), [games, aId, bId]);

  if (!a || !b || aId === bId) {
    return (
      <div className="space-y-3">
        <Link href="/history/matchups" className="text-sm text-primary inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> All matchups
        </Link>
        <p className="text-muted-foreground">That matchup isn't in the league history.</p>
      </div>
    );
  }

  const meetings = [...h2h.games].reverse();
  const scoreFor = (g: HistoryGame, id: string) => (g.a === id ? g.scoreA : g.scoreB);
  const margin = (g: HistoryGame | null) => (g ? Math.abs(g.scoreA - g.scoreB) : 0);

  return (
    <div className="space-y-6" data-testid="rivalry-detail">
      <Link href="/history/matchups" className="text-sm text-primary inline-flex items-center gap-1" data-testid="link-all-matchups">
        <ArrowLeft className="w-4 h-4" /> All matchups
      </Link>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <TeamAvatar franchise={a} size={56} />
              <TeamLink id={aId} showAvatar={false} className="font-semibold" />
              <div className="text-4xl font-heading font-bold" data-testid="h2h-a-wins">{h2h.aWins}</div>
            </div>
            <div className="text-center text-muted-foreground text-sm">
              <div>vs</div>
              {h2h.ties > 0 && <div className="text-xs">{h2h.ties} tied</div>}
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <TeamAvatar franchise={b} size={56} />
              <TeamLink id={bId} showAvatar={false} className="font-semibold" />
              <div className="text-4xl font-heading font-bold" data-testid="h2h-b-wins">{h2h.bWins}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 text-center text-sm text-muted-foreground">
            <div>{formatPoints(h2h.aPoints, 1)} pts</div>
            <div>
              {h2h.streak !== 0 && (
                <span>
                  {h2h.streak > 0 ? a.name : b.name} on a {Math.abs(h2h.streak)}-game streak
                </span>
              )}
            </div>
            <div>{formatPoints(h2h.bPoints, 1)} pts</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v as KindFilter)} variant="outline" size="sm">
          <ToggleGroupItem value="all">All games</ToggleGroupItem>
          <ToggleGroupItem value="regular">Regular season</ToggleGroupItem>
          <ToggleGroupItem value="playoff">Playoffs</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-xs text-muted-foreground">{h2h.games.length} meetings</span>
      </div>

      {(h2h.biggestWinA || h2h.biggestWinB) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { team: a, game: h2h.biggestWinA },
            { team: b, game: h2h.biggestWinB },
          ].map(({ team, game }) => (
            <Card key={team.id}>
              <CardContent className="p-4 text-sm">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{team.name}'s biggest win</div>
                {game ? (
                  <>
                    <div className="font-semibold tabular-nums">
                      {formatPoints(scoreFor(game, team.id))} - {formatPoints(scoreFor(game, team.id === aId ? bId : aId))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by {formatPoints(margin(game))}, {weekLabel(game.season, game.week, game.label)}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No wins yet</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Game log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-rivalry-games">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead className="text-right">{a.name}</TableHead>
                <TableHead className="text-right">{b.name}</TableHead>
                <TableHead>Winner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((g, index) => {
                const winner = winnerOf(g);
                return (
                  <TableRow key={`${g.season}-${g.week}-${index}`}>
                    <TableCell className="whitespace-nowrap">
                      {weekLabel(g.season, g.week, g.label)}
                      {g.kind === "playoff" && <span className="ml-2 text-[10px] uppercase text-primary">Playoffs</span>}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${winner === aId ? "font-semibold" : "text-muted-foreground"}`}>
                      {formatPoints(scoreFor(g, aId))}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${winner === bId ? "font-semibold" : "text-muted-foreground"}`}>
                      {formatPoints(scoreFor(g, bId))}
                    </TableCell>
                    <TableCell>{winner ? franchiseById.get(winner)?.name : "Tie"}</TableCell>
                  </TableRow>
                );
              })}
              {meetings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No meetings for this filter
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MatchupsView({ aId, bId }: { aId?: string; bId?: string }) {
  if (aId && bId) return <RivalryDetail aId={decodeURIComponent(aId)} bId={decodeURIComponent(bId)} />;
  return <MatchupOverview />;
}