import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { CURRENT_SEASON_CAP } from "@shared/contractRules";
import { CapBar, Legend, PlayerAvatar, PositionBadge, money } from "./FreeAgencyBiddingTab";
import type { ParsedContract } from "./types";

interface Signing {
  id: string;
  rosterId: number;
  playerId: string;
  playerName: string;
  playerPosition: string;
  playerTeam: string | null;
  bidAmount: number;
  contractYears: number;
  round: number;
}

export interface DraftBoardSlot {
  round: number;
  slot: number;
  ownerRosterId: number;
  originalRosterId: number;
  salary: number;
  playerId: string | null;
  playerName: string | null;
  playerPosition: string | null;
}

export interface DraftCapitalData {
  season: number;
  draftComplete: boolean;
  source: "sleeper" | "projected" | "complete";
  byRoster: Record<string, { total: number; picks: Array<{ round: number; slot: number; salary: number }> }>;
  board?: DraftBoardSlot[];
}

const ROOKIE_YEARS = 3;
const slotLabel = (round: number, slot: number) => `${round}.${String(slot).padStart(2, "0")}`;

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub: ReactNode; tone?: "draft" }) {
  return (
    <Card className={tone === "draft" ? "border-purple-500/40" : undefined}>
      <CardContent className="space-y-1 p-4">
        <p className={`text-[11px] uppercase tracking-wide ${tone === "draft" ? "text-purple-300" : "text-muted-foreground"}`}>{label}</p>
        <p className={`text-2xl font-bold ${tone === "draft" ? "text-purple-300" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

/** Between Round 2 results and the regular season: what everyone signed in free agency, and the rookie draft. */
export function FreeAgencyRecapTab({
  leagueId,
  rosterId,
  teamName,
  currentYear,
  allRosters,
  parsedContracts,
  deadCapByRosterYear,
  draftCapital,
  onOpenPlayer,
}: {
  leagueId: string;
  rosterId: number;
  teamName: string;
  currentYear: number;
  allRosters: Array<{ rosterId: number; teamName: string }>;
  parsedContracts: ParsedContract[];
  /** Dead cap by roster and season ($M). */
  deadCapByRosterYear: Record<number, Record<number, number>>;
  draftCapital: DraftCapitalData | undefined;
  onOpenPlayer?: (playerId: string, rosterId: number, contract: ParsedContract | null) => void;
}) {
  const { data, isLoading, error } = useQuery<{ signings: Signing[] }>({
    queryKey: ["/api/league", leagueId, "fa-recap", currentYear],
    queryFn: async () => {
      const res = await fetch(`/api/league/${leagueId}/fa-recap?season=${currentYear}`);
      if (!res.ok) throw new Error("Could not load the free agency recap");
      return res.json();
    },
    enabled: !!leagueId,
  });

  const signings = Array.isArray(data?.signings) ? data!.signings : [];
  const teamNameOf = (rid: number) => allRosters.find(r => r.rosterId === rid)?.teamName ?? `Team ${rid}`;
  const draftDone = !!draftCapital?.draftComplete;
  const seasons = [currentYear, currentYear + 1, currentYear + 2];

  // This league year's rookie contracts: the players taken in this year's rookie draft.
  const draftedIds = useMemo(
    () => new Set((draftCapital?.board ?? []).map(b => b.playerId).filter((id): id is string => !!id)),
    [draftCapital],
  );
  const isNewRookie = (c: ParsedContract) => draftDone && draftedIds.has(c.playerId);

  const mine = signings
    .filter(s => s.rosterId === rosterId)
    .sort((a, b) => b.bidAmount - a.bidAmount || a.round - b.round);
  const mineAav = mine.reduce((sum, s) => sum + s.bidAmount, 0);
  const mineTotal = mine.reduce((sum, s) => sum + s.bidAmount * s.contractYears, 0);
  const signingIds = useMemo(() => new Set(signings.map(s => s.playerId)), [signings]);

  // My picks in this year's rookie draft (estimated slots before the draft, the actual picks after).
  const myBoard = (draftCapital?.board ?? []).filter(b => b.ownerRosterId === rosterId && b.salary > 0);
  const myRookieContracts = parsedContracts.filter(c => c.rosterId === rosterId && isNewRookie(c));
  const rookieAav = draftDone
    ? myRookieContracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0)
    : draftCapital?.byRoster[String(rosterId)]?.total ?? 0;

  const teamContracts = parsedContracts.filter(c => c.rosterId === rosterId);
  const deadIn = (y: number) => deadCapByRosterYear[rosterId]?.[y] || 0;
  const outlook = seasons.map(y => {
    const dead = deadIn(y);
    let committed = dead;
    let fa = 0;
    let rookies = 0;
    for (const c of teamContracts) {
      const v = c.parsedSalaries[y] || 0;
      if (!v) continue;
      if (signingIds.has(c.playerId)) fa += v;
      else if (isNewRookie(c)) rookies += v;
      else committed += v;
    }
    if (!draftDone) rookies = y - currentYear < ROOKIE_YEARS ? rookieAav : 0;
    const counted = committed + fa + (draftDone ? rookies : 0);
    return { y, committed, dead, fa, rookies, room: CURRENT_SEASON_CAP - counted };
  });
  const spaceNow = outlook[0]?.room ?? 0;
  const spaceAfterRookies = draftDone ? spaceNow : spaceNow - rookieAav;

  const round1 = (draftCapital?.board ?? []).filter(b => b.round === 1);
  const laterRounds = Array.from(new Set((draftCapital?.board ?? []).filter(b => b.round > 1 && b.salary > 0).map(b => `Round ${b.round} picks ${money(b.salary)}/yr`)));

  // Around the league, sorted by AAV added in free agency.
  const league = useMemo(() => {
    return allRosters
      .map(r => {
        const theirs = signings.filter(s => s.rosterId === r.rosterId);
        const aav = theirs.reduce((sum, s) => sum + s.bidAmount, 0);
        const biggest = [...theirs].sort((a, b) => b.bidAmount - a.bidAmount)[0];
        const contracts = parsedContracts.filter(c => c.rosterId === r.rosterId);
        const used = contracts.reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0) + (deadCapByRosterYear[r.rosterId]?.[currentYear] || 0);
        const rookies = draftDone
          ? contracts.filter(isNewRookie).reduce((sum, c) => sum + (c.parsedSalaries[currentYear] || 0), 0)
          : draftCapital?.byRoster[String(r.rosterId)]?.total ?? 0;
        return { rosterId: r.rosterId, teamName: r.teamName, signed: theirs.length, aav, biggest, rookies, space: CURRENT_SEASON_CAP - used };
      })
      .sort((a, b) => b.aav - a.aav || a.teamName.localeCompare(b.teamName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRosters, signings, parsedContracts, deadCapByRosterYear, currentYear, draftDone, draftCapital, draftedIds]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-red-500">{(error as Error).message}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{currentYear} league year</p>
          <h2 className="text-2xl font-bold leading-tight">Free Agency Recap &amp; Rookie Draft</h2>
          <p className="text-xs text-muted-foreground">
            {draftDone
              ? "Free agency and the rookie draft are done. Rookies have their contracts; the regular season is next."
              : "Free agency is done. The rookie draft is next — drafted players get rookie contracts automatically when it completes."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Free agency complete
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              draftDone ? "border border-purple-400/60 bg-purple-500/15 text-purple-200" : "bg-amber-500 text-amber-950"
            }`}
          >
            {draftDone ? "Rookie draft complete" : "Rookie draft next"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={`${teamName} signed`}
          value={`${mine.length} player${mine.length === 1 ? "" : "s"}`}
          sub={
            mine.length > 0 ? (
              <>
                <span className="font-semibold text-emerald-400">{money(mineAav)}/yr</span> of AAV added · {money(mineTotal)} total
              </>
            ) : (
              "No free agents signed"
            )
          }
        />
        <Tile
          label={`${currentYear} space after free agency`}
          value={money(draftDone ? spaceNow + rookieAav : spaceNow)}
          sub={`${money(CURRENT_SEASON_CAP - (draftDone ? spaceNow + rookieAav : spaceNow))} committed of ${money(CURRENT_SEASON_CAP)}`}
        />
        <Tile
          tone="draft"
          label={draftDone ? "Rookie contracts" : "Rookie picks (est.)"}
          value={
            <>
              {money(rookieAav)}
              <span className="text-sm font-semibold"> /yr</span>
            </>
          }
          sub={
            draftDone
              ? `${myRookieContracts.length} rookie${myRookieContracts.length === 1 ? "" : "s"} signed · counted toward the cap`
              : myBoard.length > 0
                ? `${myBoard.map(b => slotLabel(b.round, b.slot)).join(" · ")} · not counted until drafted`
                : "No picks in this draft"
          }
        />
        <Tile
          label={draftDone ? `${currentYear} cap space` : "Space after rookie deals"}
          value={money(spaceAfterRookies)}
          sub="Heading into Week 1"
        />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Card className="min-w-0 flex-[999_1_560px]">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Your free agency</h3>
              <span className="text-xs text-muted-foreground">Signed, ready to move onto your Sleeper roster</span>
            </div>
            {mine.length === 0 && <p className="text-sm text-muted-foreground">{teamName} did not sign any free agents.</p>}
            {mine.map(s => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={() => onOpenPlayer?.(s.playerId, s.rosterId, parsedContracts.find(c => c.playerId === s.playerId && c.rosterId === s.rosterId) ?? null)}
                  className="flex min-w-0 items-center gap-3 text-left hover:underline"
                  aria-label={`Open ${s.playerName}'s player card`}
                >
                  <PlayerAvatar playerId={s.playerId} name={s.playerName} className="h-10 w-10" />
                  <span className="space-y-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{s.playerName}</span>
                      <PositionBadge position={s.playerPosition} />
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Round {s.round}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {s.contractYears}-year deal · {s.contractYears <= 1 ? currentYear : `${currentYear}–${currentYear + s.contractYears - 1}`}
                    </span>
                  </span>
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-xl font-bold tabular-nums text-emerald-400">
                    {money(s.bidAmount)}
                    <span className="text-xs font-semibold text-emerald-300"> /yr</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{money(s.bidAmount * s.contractYears)} total</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="flex-[1_1_400px] border-purple-500/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Your rookie draft</h3>
              <span className="text-xs text-purple-300">
                {draftDone ? "Drafted" : draftCapital?.source === "sleeper" ? "Official draft slots" : "Slots from the draft odds until Sleeper sets the order"}
              </span>
            </div>
            {myBoard.length === 0 && <p className="text-sm text-muted-foreground">No picks in this year's rookie draft.</p>}
            {myBoard.map(b => {
              const contract = draftDone && b.playerId ? myRookieContracts.find(c => c.playerId === b.playerId) : undefined;
              const aav = contract ? contract.parsedSalaries[currentYear] || b.salary : b.salary;
              return (
                <div key={`${b.round}-${b.slot}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-[52px] rounded-md bg-purple-500/15 px-2 py-1.5 text-center font-bold tabular-nums text-purple-200">
                      {slotLabel(b.round, b.slot)}
                    </span>
                    <div>
                      <p className="font-semibold">
                        {draftDone && b.playerName ? `${b.playerName}${b.playerPosition ? ` · ${b.playerPosition}` : ""}` : `Pick ${slotLabel(b.round, b.slot)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {draftDone ? "Rookie contract signed" : "Rookie pay scale for this slot"} · {currentYear}–{currentYear + ROOKIE_YEARS - 1}
                        {b.originalRosterId !== b.ownerRosterId ? ` · via ${teamNameOf(b.originalRosterId)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-lg font-bold tabular-nums text-purple-300">
                      {money(aav)}
                      <span className="text-xs font-semibold"> /yr</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ROOKIE_YEARS} yr · {money(aav * ROOKIE_YEARS)} total
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              {draftDone
                ? "Each rookie got a 3-year contract at his slot's pay scale. Rookie extensions open in their final season."
                : "Values are the rookie pay scale for each slot. They show here for planning and count toward your cap once the player is drafted."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Cap outlook</h3>
            <span className="text-xs text-muted-foreground">Line = {money(CURRENT_SEASON_CAP)} cap</span>
          </div>
          {outlook.map(o => (
            <div key={o.y} className="grid grid-cols-[48px_minmax(0,1fr)_minmax(110px,auto)] items-center gap-3">
              <span className="font-semibold tabular-nums">{o.y}</span>
              <CapBar
                height="h-4"
                segments={[
                  { value: o.committed - o.dead, className: "bg-emerald-500" },
                  { value: o.dead, className: "bg-red-500" },
                  { value: o.fa, className: "bg-amber-400" },
                  { value: o.rookies, className: draftDone ? "bg-purple-400" : "bg-purple-400/50" },
                ]}
              />
              <span className={`text-right text-xs font-semibold tabular-nums ${o.room < 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                {money(o.room)} space{!draftDone && o.rookies > 0 ? ` · ${money(o.room - o.rookies)} after rookies` : ""}
              </span>
            </div>
          ))}
          <Legend
            items={[
              { label: "Already committed", className: "bg-emerald-500" },
              ...(outlook.some(o => o.dead > 0) ? [{ label: "Dead cap", className: "bg-red-500" }] : []),
              { label: "Free agency signings", className: "bg-amber-400" },
              { label: draftDone ? "Rookie contracts" : "Rookie picks (est., not counted yet)", className: draftDone ? "bg-purple-400" : "bg-purple-400/50" },
            ]}
          />
        </CardContent>
      </Card>

      {round1.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">Rookie draft board · Round 1</h3>
              <span className="text-xs text-muted-foreground">
                Rookie AAV by slot{laterRounds.length > 0 ? ` · ${laterRounds.join(" · ")}` : ""} · all 3-year deals
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
              {round1.map(b => {
                const isMine = b.ownerRosterId === rosterId;
                return (
                  <div
                    key={b.slot}
                    className={`space-y-1 rounded-lg border px-3 py-2.5 ${isMine ? "border-purple-400 bg-purple-500/15" : "border-border bg-background"}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold tabular-nums text-purple-200">{slotLabel(b.round, b.slot)}</span>
                      <span className="font-bold tabular-nums text-purple-300">
                        {money(b.salary)}
                        <span className="text-[11px] font-semibold"> /yr</span>
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{isMine ? `${teamNameOf(b.ownerRosterId)} (you)` : teamNameOf(b.ownerRosterId)}</p>
                    <p className={`text-xs ${draftDone ? "text-foreground" : "text-muted-foreground"}`}>
                      {draftDone
                        ? b.playerName
                          ? `${b.playerName}${b.playerPosition ? ` · ${b.playerPosition}` : ""}`
                          : "—"
                        : b.originalRosterId !== b.ownerRosterId
                          ? `via ${teamNameOf(b.originalRosterId)}`
                          : "Not picked yet"}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Around the league</h3>
            <span className="text-xs text-muted-foreground">Sorted by AAV added in free agency</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Team</th>
                  <th className="px-2 py-2 text-right font-medium">Signed</th>
                  <th className="px-2 py-2 text-right font-medium">AAV added</th>
                  <th className="px-2 py-2 font-medium">Biggest signing</th>
                  <th className="px-2 py-2 text-right font-medium">{draftDone ? "Rookie deals" : "Rookie picks"}</th>
                  <th className="px-2 py-2 text-right font-medium">{currentYear} space</th>
                </tr>
              </thead>
              <tbody>
                {league.map(t => (
                  <tr key={t.rosterId} className={`border-t border-border ${t.rosterId === rosterId ? "bg-emerald-500/10" : ""}`}>
                    <td className="px-2 py-2.5 font-semibold">{t.teamName}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{t.signed}</td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums text-emerald-400">{t.aav > 0 ? `${money(t.aav)}/yr` : "—"}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {t.biggest ? `${t.biggest.playerName} · ${t.biggest.playerPosition} · ${money(t.biggest.bidAmount)}/yr` : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-purple-300">{t.rookies > 0 ? `${money(t.rookies)}/yr` : "—"}</td>
                    <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${t.space < 20 ? "text-amber-400" : ""}`}>{money(t.space)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
