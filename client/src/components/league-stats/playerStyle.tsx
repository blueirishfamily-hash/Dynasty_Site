import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Position colors and player pictures for League Stats. The colors match the rest of the app (Contracts Hub,
// Draft Board): QB rose, RB green, WR blue, TE orange, K purple, DEF slate.

const FILLED: Record<string, string> = {
  QB: "bg-rose-500 text-white",
  RB: "bg-emerald-500 text-white",
  WR: "bg-blue-500 text-white",
  TE: "bg-orange-500 text-white",
  K: "bg-purple-500 text-white",
  DEF: "bg-slate-500 text-white",
};

const BAR: Record<string, string> = {
  QB: "bg-rose-500",
  RB: "bg-emerald-500",
  WR: "bg-blue-500",
  TE: "bg-orange-500",
  K: "bg-purple-500",
  DEF: "bg-slate-500",
};

const RING: Record<string, string> = {
  QB: "ring-rose-500",
  RB: "ring-emerald-500",
  WR: "ring-blue-500",
  TE: "ring-orange-500",
  K: "ring-purple-500",
  DEF: "ring-slate-500",
};

const norm = (position: string | null | undefined) => (position ?? "").toUpperCase();

/** Solid badge classes for a position, with a neutral fallback. */
export const positionBadgeClass = (position: string | null | undefined) => FILLED[norm(position)] ?? "bg-muted text-muted-foreground";
/** A solid fill for bars and swatches. */
export const positionBarClass = (position: string | null | undefined) => BAR[norm(position)] ?? "bg-muted-foreground";

export function PositionBadge({ position }: { position: string | null | undefined }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${positionBadgeClass(position)}`}>
      {position || "?"}
    </span>
  );
}

/** Sleeper's player picture, in a ring of the position color. Team defenses and unknown ids fall back to the position. */
export function PlayerFace({
  playerId,
  name,
  position,
  size = 32,
}: {
  playerId?: string | null;
  name: string;
  position: string | null | undefined;
  size?: number;
}) {
  const isDefense = norm(position) === "DEF";
  const src = playerId && !isDefense ? `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg` : undefined;
  return (
    <Avatar className={`shrink-0 ring-2 ring-offset-1 ring-offset-background ${RING[norm(position)] ?? "ring-border"}`} style={{ width: size, height: size }}>
      {src && <AvatarImage src={src} alt={name} className="object-cover" loading="lazy" />}
      <AvatarFallback className={`text-[10px] font-semibold ${positionBadgeClass(position)}`}>{position || name.slice(0, 2)}</AvatarFallback>
    </Avatar>
  );
}
