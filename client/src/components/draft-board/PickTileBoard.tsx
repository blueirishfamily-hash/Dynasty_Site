import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { lastName, type BoardTile } from "./draftBoardData";

/** Rounds shown before the "Show later rounds" control on phones. */
const PHONE_ROUNDS_SHOWN = 2;

const POSITION_BAR: Record<string, string> = {
  QB: "bg-red-500",
  RB: "bg-primary",
  WR: "bg-blue-500",
  TE: "bg-orange-500",
  K: "bg-purple-500",
  DEF: "bg-gray-500",
};

function BoardRounds({
  rounds,
  renderTile,
}: {
  rounds: BoardTile[][];
  renderTile: (tile: BoardTile) => React.ReactNode;
}) {
  const [showLater, setShowLater] = useState(false);
  const hiddenCount = Math.max(0, rounds.length - PHONE_ROUNDS_SHOWN);

  return (
    <div className="space-y-4">
      {rounds.map((tiles, i) => (
        <section
          key={i}
          aria-label={`Round ${i + 1}`}
          className={i >= PHONE_ROUNDS_SHOWN && !showLater ? "hidden md:block" : ""}
        >
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Round {i + 1}
          </h3>
          <div
            role="list"
            className="grid grid-cols-4 gap-1.5 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
            style={{ "--cols": tiles.length } as React.CSSProperties}
          >
            {tiles.map((t) => (
              <div role="listitem" key={t.key} className="min-w-0">
                {renderTile(t)}
              </div>
            ))}
          </div>
        </section>
      ))}
      {hiddenCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="md:hidden w-full"
          onClick={() => setShowLater((v) => !v)}
          aria-expanded={showLater}
        >
          {showLater ? "Hide later rounds" : "Show later rounds"}
        </Button>
      )}
    </div>
  );
}

export function FutureTileBoard({ rounds }: { rounds: BoardTile[][] }) {
  return (
    <BoardRounds
      rounds={rounds}
      renderTile={(t) => {
        const owner = t.pick?.currentOwner;
        const mine = t.pick?.isUserPick;
        return (
          <div
            data-testid={`pick-${t.round}-${t.slot}`}
            title={owner ? `${t.label}: ${owner.name}${t.viaInitials ? ` (via ${t.viaInitials})` : ""}` : t.label}
            className={`rounded-md border px-1 py-1.5 flex flex-col items-center gap-1 min-h-[76px] ${
              mine ? "bg-primary/10 border-primary/50" : "bg-card border-border"
            }`}
          >
            <span className="font-mono text-[11px] text-muted-foreground">{t.label}</span>
            {owner ? (
              <>
                <Avatar className="w-7 h-7">
                  {owner.avatar && <AvatarImage src={owner.avatar} alt="" />}
                  <AvatarFallback
                    className={`text-[10px] ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {owner.initials}
                  </AvatarFallback>
                </Avatar>
                <span className="sr-only">{owner.name}</span>
                {t.viaInitials ? (
                  <span className="text-[10px] text-muted-foreground leading-none">via {t.viaInitials}</span>
                ) : (
                  <span className="text-[10px] leading-none invisible" aria-hidden="true">
                    -
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground mt-2">No data</span>
            )}
          </div>
        );
      }}
    />
  );
}

export function HistoricalTileBoard({
  rounds,
  onSelectPlayer,
}: {
  rounds: BoardTile[][];
  /** Called with the player when a tile is clicked; tiles are plain boxes without it. */
  onSelectPlayer?: (player: { id: string; name: string }) => void;
}) {
  return (
    <BoardRounds
      rounds={rounds}
      renderTile={(t) => {
        const p = t.pick;
        const player = p?.player;
        const pos = (player?.position || "").toUpperCase();
        const mine = p?.isUserPick;
        const clickable = !!(onSelectPlayer && player && player.id);
        const tileClass = `rounded-md border overflow-hidden min-h-[76px] flex flex-col w-full text-left ${
          mine ? "bg-primary/10 border-primary/50" : "bg-card border-border"
        } ${clickable ? "cursor-pointer hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : ""}`;
        const tileTitle = player
          ? `${t.label}: ${player.name}, ${pos} ${player.team}${p?.fantasyTeam ? ` (${p.fantasyTeam})` : ""}`
          : t.label;
        const body = (
          <>
            <div className={`h-1 ${POSITION_BAR[pos] ?? "bg-muted"}`} aria-hidden="true" />
            <div className="px-1.5 py-1 min-w-0">
              <span className="font-mono text-[11px] text-muted-foreground block">{t.label}</span>
              {player ? (
                <>
                  <span className="text-xs font-medium block truncate">{lastName(player.name)}</span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {[pos, player.team].filter(Boolean).join(" · ")}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">No pick</span>
              )}
            </div>
          </>
        );
        if (clickable) {
          return (
            <button
              type="button"
              data-testid={`pick-${t.round}-${t.slot}`}
              title={tileTitle}
              aria-label={`${t.label}: ${player!.name}. View details`}
              onClick={() => onSelectPlayer!({ id: player!.id, name: player!.name })}
              className={tileClass}
            >
              {body}
            </button>
          );
        }
        return (
          <div data-testid={`pick-${t.round}-${t.slot}`} title={tileTitle} className={tileClass}>
            {body}
          </div>
        );
      }}
    />
  );
}
