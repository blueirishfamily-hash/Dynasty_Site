import { useMemo } from "react";
import { Crown, Trophy, Shield } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { layoutBracket } from "@shared/playoffBracket";

export interface BracketTeam {
  rosterId: number;
  seed?: number;
  name: string;
  initials: string;
  avatar: string | null;
  division?: number;
  isDivisionWinner?: boolean;
}

export interface BracketMatchup {
  round: number;
  matchupId: number;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  winner: number | null;
  loser: number | null;
  team1From?: { w?: number; l?: number };
  team2From?: { w?: number; l?: number };
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

export interface ConsolationMatchup {
  gameType?: string;
  round: number;
  matchupId: number;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  winner: number | null;
  loser: number | null;
  placement?: number;
  team1Score?: number;
  team2Score?: number;
}

export interface SeedingEntry {
  rosterId: number;
  seed: number;
  name: string;
  initials: string;
  avatar: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  division?: number;
  isDivisionWinner: boolean;
  inPlayoffs: boolean;
}

export interface BracketSeeding {
  hasDivisions: boolean;
  playoffTeams: number;
  seeds: SeedingEntry[];
  divisions: Array<{ division: number; name: string; rosterIds: number[] }>;
}

export interface BracketData {
  matchups: BracketMatchup[];
  rounds: number;
  teams: Record<number, { name: string; initials: string; avatar: string | null }>;
  consolationMatchups?: ConsolationMatchup[];
  projected?: boolean;
  seeding?: BracketSeeding;
}

const COL_W = 224;
const GAP = 56;
const ROW_H = 34;
const CARD_H = ROW_H * 2;
const SLOT_H = CARD_H + 28;
const HEADER_H = 36;

function roundLabel(col: number, columns: number, hasByes: boolean): string {
  const fromEnd = columns - 1 - col;
  if (fromEnd === 0) return "Championship";
  if (fromEnd === 1) return "Semifinals";
  if (col === 0 && hasByes) return "Wild Card";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${col + 1}`;
}

export function DivisionBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-bold leading-none tracking-wide bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/40 ${className}`}
      title="Division winner (seeds 1-3)"
    >
      <Shield className="w-2.5 h-2.5" />
      DIV
    </span>
  );
}

function TeamRow({
  team,
  fromLabel,
  isWinner,
  isLoser,
  score,
  tag,
  height = ROW_H,
}: {
  team: BracketTeam | null;
  fromLabel: string;
  isWinner: boolean;
  isLoser: boolean;
  score?: number;
  tag?: string;
  height?: number;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-2 px-2.5 bg-muted/30" style={{ height }}>
        <div className="w-5 h-5 rounded-full bg-muted/60 flex items-center justify-center shrink-0">
          <span className="text-[9px] text-muted-foreground">?</span>
        </div>
        <span className="text-[11px] text-muted-foreground italic truncate">{fromLabel}</span>
      </div>
    );
  }

  const hasScore = score != null && score > 0;
  return (
    <div
      className={`flex items-center gap-2 px-2.5 relative ${
        isWinner ? "bg-primary/10" : isLoser ? "bg-muted/40 opacity-60" : "bg-card"
      }`}
      style={{ height }}
      data-testid={`bracket-team-${team.rosterId}`}
    >
      {team.isDivisionWinner && <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />}
      <span className="text-[10px] font-bold text-muted-foreground w-5 text-right shrink-0 tabular-nums">
        {team.seed ?? ""}
      </span>
      <Avatar className="w-5 h-5 shrink-0">
        {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
        <AvatarFallback className="text-[9px] bg-muted">{team.initials}</AvatarFallback>
      </Avatar>
      <span
        className={`text-xs truncate flex-1 ${
          isWinner ? "font-semibold" : isLoser ? "line-through text-muted-foreground" : "font-medium"
        }`}
      >
        {team.name}
      </span>
      {tag && <span className="text-[9px] font-bold tracking-widest text-muted-foreground shrink-0">{tag}</span>}
      {team.isDivisionWinner && <DivisionBadge />}
      {hasScore && (
        <span className={`text-[11px] tabular-nums shrink-0 ${isWinner ? "font-bold text-primary" : "text-muted-foreground"}`}>
          {score!.toFixed(1)}
        </span>
      )}
    </div>
  );
}

function fromText(from?: { w?: number; l?: number }): string {
  if (from?.w != null) return `Winner of game ${from.w}`;
  if (from?.l != null) return `Loser of game ${from.l}`;
  return "TBD";
}

export default function PlayoffBracketTree({
  data,
  userRosterId,
}: {
  data: BracketData;
  userRosterId?: number;
}) {
  const mainMatches = useMemo(
    () => data.matchups.filter((m) => !m.placement || m.placement === 1),
    [data.matchups],
  );

  const layout = useMemo(
    () =>
      layoutBracket(
        mainMatches.map((m) => ({
          matchupId: m.matchupId,
          round: m.round,
          team1Id: m.team1?.rosterId ?? null,
          team2Id: m.team2?.rosterId ?? null,
          team1From: m.team1From,
          team2From: m.team2From,
          winner: m.winner,
          placement: m.placement,
        })),
      ),
    [mainMatches],
  );

  const matchById = useMemo(() => new Map(mainMatches.map((m) => [m.matchupId, m])), [mainMatches]);
  const teamById = useMemo(() => {
    const map = new Map<number, BracketTeam>();
    mainMatches.forEach((m) => {
      if (m.team1) map.set(m.team1.rosterId, m.team1);
      if (m.team2) map.set(m.team2.rosterId, m.team2);
    });
    return map;
  }, [mainMatches]);

  if (layout.nodes.length === 0) return null;

  const hasByes = layout.nodes.some((n) => n.kind === "bye");
  const championCol = layout.columns;
  const totalCols = layout.columns + 1;
  const width = totalCols * COL_W + (totalCols - 1) * GAP;
  const height = HEADER_H + layout.height * SLOT_H;
  const colX = (col: number) => col * (COL_W + GAP);
  const nodeY = (y: number) => HEADER_H + y * SLOT_H;

  const nodeByKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const finalNode = layout.nodes.find((n) => n.kind === "match" && n.col === layout.columns - 1);
  const finalMatch = finalNode && finalNode.kind === "match" ? matchById.get(finalNode.matchupId) : undefined;
  const champion = finalMatch?.winner != null ? teamById.get(finalMatch.winner) ?? null : null;

  const connectors: Array<{ d: string; active: boolean }> = [];
  layout.nodes.forEach((node) => {
    if (node.kind !== "match") return;
    node.childKeys.forEach((childKey) => {
      const child = nodeByKey.get(childKey);
      if (!child) return;
      const x1 = colX(child.col) + COL_W;
      const x2 = colX(node.col);
      const mid = x2 - GAP / 2;
      const y1 = nodeY(child.y);
      const y2 = nodeY(node.y);
      const decided = child.kind === "bye" || matchById.get(child.matchupId)?.winner != null;
      connectors.push({ d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`, active: decided });
    });
  });
  if (finalNode) {
    const y = nodeY(finalNode.y);
    connectors.push({
      d: `M ${colX(finalNode.col) + COL_W} ${y} H ${colX(championCol)}`,
      active: !!champion,
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative" style={{ width, height }} data-testid="playoff-bracket-tree">
        {Array.from({ length: layout.columns }, (_, col) => (
          <div
            key={`head-${col}`}
            className="absolute text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ left: colX(col), width: COL_W, top: 0 }}
          >
            {roundLabel(col, layout.columns, hasByes)}
          </div>
        ))}
        <div
          className="absolute text-center font-heading text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ left: colX(championCol), width: COL_W, top: 0 }}
        >
          Champion
        </div>

        <svg className="absolute inset-0 pointer-events-none" width={width} height={height} fill="none">
          {connectors.map((c, i) => (
            <path
              key={i}
              d={c.d}
              strokeWidth={c.active ? 2 : 1.5}
              stroke={c.active ? "hsl(var(--primary))" : "hsl(var(--border))"}
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {layout.nodes.map((node) => {
          if (node.kind === "bye") {
            const team = node.teamId != null ? teamById.get(node.teamId) ?? null : null;
            return (
              <div
                key={node.key}
                className="absolute rounded-lg border border-dashed border-border overflow-hidden bg-card"
                style={{ left: colX(node.col), width: COL_W, top: nodeY(node.y) - ROW_H / 2, height: ROW_H }}
                data-testid={`bracket-bye-${node.teamId ?? "tbd"}`}
              >
                <TeamRow team={team} fromLabel="TBD" isWinner={false} isLoser={false} tag="BYE" />
              </div>
            );
          }

          const match = matchById.get(node.matchupId);
          if (!match) return null;
          const isFinal = node.col === layout.columns - 1;
          const involvesUser =
            userRosterId != null &&
            (match.team1?.rosterId === userRosterId || match.team2?.rosterId === userRosterId);
          return (
            <div
              key={node.key}
              className={`absolute rounded-lg overflow-hidden border shadow-sm ${
                isFinal ? "border-primary border-2 ring-2 ring-primary/15" : involvesUser ? "border-primary/60" : "border-border"
              }`}
              style={{ left: colX(node.col), width: COL_W, top: nodeY(node.y) - CARD_H / 2, height: CARD_H }}
              data-testid={`bracket-matchup-${match.round}-${match.matchupId}`}
            >
              <TeamRow
                team={match.team1}
                fromLabel={fromText(match.team1From)}
                isWinner={match.winner != null && match.winner === match.team1?.rosterId}
                isLoser={match.loser != null && match.loser === match.team1?.rosterId}
                score={match.team1Score}
              />
              <div className="border-t border-border" />
              <TeamRow
                team={match.team2}
                fromLabel={fromText(match.team2From)}
                isWinner={match.winner != null && match.winner === match.team2?.rosterId}
                isLoser={match.loser != null && match.loser === match.team2?.rosterId}
                score={match.team2Score}
              />
            </div>
          );
        })}

        {finalNode && (
          <div
            className={`absolute rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-center px-3 ${
              champion ? "border-amber-500 bg-amber-500/10" : "border-dashed border-border bg-muted/20"
            }`}
            style={{ left: colX(championCol), width: COL_W, top: nodeY(finalNode.y) - 52, height: 104 }}
            data-testid="bracket-champion"
          >
            {champion ? (
              <>
                <Crown className="w-5 h-5 text-amber-500" />
                <Avatar className="w-8 h-8">
                  {champion.avatar && <AvatarImage src={champion.avatar} alt={champion.name} />}
                  <AvatarFallback className="text-xs">{champion.initials}</AvatarFallback>
                </Avatar>
                <span className="font-heading text-sm font-bold truncate max-w-full">{champion.name}</span>
              </>
            ) : (
              <>
                <Trophy className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Champion TBD</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
