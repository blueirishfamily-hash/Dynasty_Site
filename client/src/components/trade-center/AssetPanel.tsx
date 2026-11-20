import { Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  pickLabel,
  pickTradeValue,
  type DraftPick,
  type Player,
  type Position,
} from "./tradeMath";

export const positionColors: Record<Position, string> = {
  QB: "bg-chart-5 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-chart-2 text-white",
  TE: "bg-chart-4 text-white",
};

export const POSITION_TABS = ["all", "QB", "RB", "WR", "TE", "picks"] as const;

export interface TeamNeed {
  pos: Position;
  strength: number;
  color: string;
}

export function TeamNeeds({ needs }: { needs: TeamNeed[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {needs.map(({ pos, strength, color }) => (
        <span
          key={pos}
          className="flex items-center gap-0.5"
          title={`${pos}: ${
            strength === 4 ? "Strong" : strength === 3 ? "Average" : strength === 2 ? "Below avg" : "Need"
          } vs league`}
        >
          {pos}
          <span className="flex">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full mx-0.5 ${i <= strength ? color : "bg-muted"}`}
              />
            ))}
          </span>
        </span>
      ))}
    </div>
  );
}

function injuryColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("ir") || s.includes("pup")) return "text-red-400";
  if (s.includes("doubtful")) return "text-orange-400";
  return "text-yellow-400";
}

const rowBase =
  "flex items-center gap-2.5 px-2.5 min-h-[44px] py-1.5 rounded-md cursor-pointer transition-colors border";
const rowState = (selected: boolean) =>
  selected
    ? "bg-primary/15 border-primary/50"
    : "bg-muted/30 border-transparent hover:bg-muted/50";

export function PlayerRow({
  player,
  selected,
  onToggle,
  onOpen,
  testId,
}: {
  player: Player;
  selected: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  testId: string;
}) {
  const details = [
    player.team,
    player.positionRank != null ? `${player.position}${player.positionRank}` : null,
    player.age != null ? `age ${player.age}` : null,
  ].filter(Boolean);
  return (
    <label className={`${rowBase} ${rowState(selected)}`} data-testid={testId}>
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${player.name}`} />
      <Badge className={`text-[10px] px-1.5 shrink-0 ${positionColors[player.position]}`}>
        {player.position}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {onOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen();
              }}
              className="hover:underline hover:text-primary text-left"
              aria-label={`View ${player.name} details`}
            >
              {player.name}
            </button>
          ) : (
            player.name
          )}
          {player.injuryStatus && (
            <span className={`ml-1.5 text-[11px] font-normal ${injuryColor(player.injuryStatus)}`}>
              {player.injuryStatus}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground truncate">{details.join(" · ")}</p>
      </div>
      <div className="flex flex-col items-end shrink-0 leading-tight">
        {player.tradeValue != null && (
          <span className="text-sm font-mono font-medium">{Math.round(player.tradeValue)}</span>
        )}
        {player.weeklyAvg != null && (
          <span className="text-[11px] text-muted-foreground">{player.weeklyAvg}/wk</span>
        )}
      </div>
    </label>
  );
}

export function PickRow({
  pick,
  selected,
  onToggle,
  testId,
}: {
  pick: DraftPick;
  selected: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <label className={`${rowBase} ${rowState(selected)}`} data-testid={testId}>
      <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${pickLabel(pick)} pick`} />
      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
        PK
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{pickLabel(pick)}</p>
        <p className="text-xs text-muted-foreground truncate">
          {pick.originalOwner ? `from ${pick.originalOwner}` : "Own pick"}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {pick.grade && (
          <Badge variant="outline" className="text-xs border-primary/50 text-primary">
            {pick.grade}
          </Badge>
        )}
        <span className="text-sm font-mono text-muted-foreground">~{pickTradeValue(pick)}</span>
      </div>
    </label>
  );
}

interface AssetPanelProps {
  side: "user" | "opponent";
  title: string;
  team?: { teamName: string; teamInitials: string; teamAvatar?: string | null };
  needs?: TeamNeed[];
  players: Player[];
  picks: DraftPick[];
  selectedPlayers: Set<string>;
  selectedPicks: Set<string>;
  onTogglePlayer: (id: string) => void;
  onTogglePick: (id: string) => void;
  onOpenPlayer?: (player: Player) => void;
  positionFilter: string;
  onPositionFilterChange: (tab: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  emptyMessage?: string;
  className?: string;
}

export function AssetPanel({
  side,
  title,
  team,
  needs,
  players,
  picks,
  selectedPlayers,
  selectedPicks,
  onTogglePlayer,
  onTogglePick,
  onOpenPlayer,
  positionFilter,
  onPositionFilterChange,
  search,
  onSearchChange,
  emptyMessage,
  className = "",
}: AssetPanelProps) {
  const showPlayers = positionFilter !== "picks";
  const showPicks = positionFilter === "all" || positionFilter === "picks";
  const nothingToShow = (showPlayers ? players.length : 0) + (showPicks ? picks.length : 0) === 0;

  return (
    <section
      className={`min-w-0 border border-border rounded-lg overflow-hidden bg-card ${className}`}
      aria-label={title}
    >
      <div className="p-3 border-b border-border bg-muted/30">
        {team ? (
          <div className="flex items-center gap-2.5">
            <Avatar className="w-9 h-9 shrink-0">
              {team.teamAvatar && <AvatarImage src={team.teamAvatar} alt={team.teamName} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {team.teamInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-semibold text-sm truncate">{title}</p>
              <p className="text-xs text-muted-foreground truncate mb-1">{team.teamName}</p>
              {needs && <TeamNeeds needs={needs} />}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-9 h-9 rounded-full" />
            <div>
              <p className="font-heading font-semibold text-sm">{title}</p>
              <p className="text-xs text-muted-foreground">No team selected</p>
            </div>
          </div>
        )}
      </div>

      {!team ? (
        <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
          {emptyMessage ?? "Choose a trade partner"}
        </div>
      ) : (
        <>
          <div className="p-2 space-y-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search players..."
                aria-label={`Search ${title}`}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Position filter">
              {POSITION_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={positionFilter === tab}
                  onClick={() => onPositionFilterChange(tab)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                    positionFilter === tab ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="h-[420px] md:h-[560px]">
            <div className="space-y-1 p-2">
              {showPlayers &&
                players.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    selected={selectedPlayers.has(player.id)}
                    onToggle={() => onTogglePlayer(player.id)}
                    onOpen={onOpenPlayer ? () => onOpenPlayer(player) : undefined}
                    testId={`${side}-player-${player.id}`}
                  />
                ))}
              {showPicks &&
                picks.map((pick) => (
                  <PickRow
                    key={pick.id}
                    pick={pick}
                    selected={selectedPicks.has(pick.id)}
                    onToggle={() => onTogglePick(pick.id)}
                    testId={`${side}-pick-${pick.id}`}
                  />
                ))}
              {nothingToShow && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {players.length + picks.length === 0 && !search
                    ? "No assets available"
                    : "No matches"}
                </p>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </section>
  );
}
