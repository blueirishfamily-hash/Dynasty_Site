import { Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DivisionBadge, type BracketSeeding, type SeedingEntry } from "@/components/PlayoffBracketTree";

interface PlayoffSeedingPanelProps {
  seeding: BracketSeeding;
  projected: boolean;
  divisionWinnerPct?: Record<number, number>;
  userRosterId?: number;
}

function record(s: SeedingEntry): string {
  return `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ""}`;
}

function TeamLine({
  team,
  pct,
  isUser,
}: {
  team: SeedingEntry;
  pct?: number;
  isUser: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 relative ${
        team.isDivisionWinner ? "bg-amber-500/10" : ""
      } ${isUser ? "ring-1 ring-inset ring-primary/50" : ""}`}
      data-testid={`seeding-team-${team.rosterId}`}
    >
      {team.isDivisionWinner && <span className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />}
      <span
        className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
          team.inPlayoffs ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
        title={team.inPlayoffs ? `Seed ${team.seed}` : "Outside playoff field"}
      >
        {team.seed}
      </span>
      <Avatar className="w-6 h-6 shrink-0">
        {team.avatar && <AvatarImage src={team.avatar} alt={team.name} />}
        <AvatarFallback className="text-[10px]">{team.initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{team.name}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {record(team)} · {team.pointsFor.toFixed(1)} PF
        </div>
      </div>
      {pct != null && !team.isDivisionWinner && pct > 0 && (
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{pct.toFixed(0)}% div</span>
      )}
      {team.isDivisionWinner && <DivisionBadge />}
    </div>
  );
}

export default function PlayoffSeedingPanel({
  seeding,
  projected,
  divisionWinnerPct,
  userRosterId,
}: PlayoffSeedingPanelProps) {
  const seedById = new Map(seeding.seeds.map((s) => [s.rosterId, s]));
  const divisionWinners = seeding.seeds.filter((s) => s.isDivisionWinner);
  const wildCards = seeding.seeds.filter((s) => !s.isDivisionWinner && s.inPlayoffs);
  const firstOut = seeding.seeds.find((s) => !s.inPlayoffs);

  return (
    <Card data-testid="playoff-seeding-panel">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading flex items-center gap-2">
          <Crown className="w-5 h-5 text-amber-500" />
          {projected ? "Projected Playoff Seeding" : "Playoff Seeding"}
        </CardTitle>
        <CardDescription>
          {seeding.hasDivisions
            ? `Division winners ${projected ? "(current leaders) " : ""}are guaranteed seeds 1-${divisionWinners.length}, ordered by record then points. Remaining spots go to the best records.`
            : "Seeds are ordered by record, then points scored."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {seeding.hasDivisions && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {seeding.divisions.map((division) => (
              <div key={division.division} className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                  <span className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {division.name}
                  </span>
                  {(() => {
                    const leader = seedById.get(division.rosterIds[0]);
                    return leader ? (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Seed {leader.seed}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="divide-y">
                  {division.rosterIds.map((rosterId) => {
                    const team = seedById.get(rosterId);
                    if (!team) return null;
                    return (
                      <TeamLine
                        key={rosterId}
                        team={team}
                        pct={divisionWinnerPct?.[rosterId]}
                        isUser={rosterId === userRosterId}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {seeding.hasDivisions ? "Wild Cards" : "Playoff Field"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
            {(seeding.hasDivisions ? wildCards : seeding.seeds.filter((s) => s.inPlayoffs)).map((team) => (
              <div key={team.rosterId} className="border rounded-lg overflow-hidden">
                <TeamLine team={team} isUser={team.rosterId === userRosterId} />
              </div>
            ))}
          </div>
          {firstOut && (
            <p className="text-xs text-muted-foreground mt-2">
              First team out: <span className="font-medium text-foreground">{firstOut.name}</span> ({record(firstOut)})
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
