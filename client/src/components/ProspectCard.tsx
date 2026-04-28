import { Award, Activity, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type ProspectEnriched,
  parseCombineData,
  parseCollegeAwards,
  parseAdvancedStats,
  buildCombineRankData,
  getSpeedScoreTier,
  getDominatorTier,
  getYprrTier,
  STAT_TIER_CLASS,
  getNflTeamLogoUrl,
  applyNflTeamLogoFallback,
} from "@/lib/draftProspectMetrics";

const POSITION_COLORS: Record<string, string> = {
  QB: "bg-red-500/90 text-white",
  RB: "bg-primary text-primary-foreground",
  WR: "bg-blue-500/90 text-white",
  TE: "bg-orange-500/90 text-white",
};


function rasDisplayClass(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function speedBarFillClass(score: number): string {
  const t = getSpeedScoreTier(score);
  if (t === "elite") return "bg-emerald-500";
  if (t === "mediocre") return "bg-amber-500";
  return "bg-red-500";
}

function approxRound12Team(adp: number | null | undefined): number | null {
  if (adp == null || !Number.isFinite(Number(adp))) return null;
  return Math.max(1, Math.ceil(Number(adp) / 12));
}

/** Map tier text color to a solid bar color (simplified). */
function dominatorBarColor(dominator: number): string {
  const t = getDominatorTier(dominator);
  if (t === "elite") return "bg-emerald-500";
  if (t === "mediocre") return "bg-amber-500";
  return "bg-red-500";
}

function DominatorYearBars({ rows }: { rows: { year: number; dominator: number }[] }) {
  const maxD = Math.max(...rows.map((r) => r.dominator), 0.01);
  return (
    <div className="space-y-2">
      {rows.map(({ year, dominator }) => (
        <div key={year} className="flex items-center gap-2 text-sm">
          <span className="w-10 shrink-0 font-mono tabular-nums text-muted-foreground">{year}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/50">
            <div
              className={`h-full rounded-full ${dominatorBarColor(dominator)}`}
              style={{ width: `${Math.min(100, (dominator / maxD) * 100)}%` }}
            />
          </div>
          <span className={STAT_TIER_CLASS[getDominatorTier(dominator)]}>
            {(dominator * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export type ProspectCardProps = {
  prospect: ProspectEnriched;
  allProspects: ProspectEnriched[];
};

function ordinalSuffix(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function rankBadgeClass(rank: number, outOf: number): string {
  const pct = rank / outOf;
  if (pct <= 0.25) return "text-emerald-600 dark:text-emerald-400";
  if (pct <= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export function ProspectCard({ prospect: d, allProspects }: ProspectCardProps) {
  const teamAbbr = (d.sleeperTeam ?? "").trim();
  const combineEntries = parseCombineData(d.combineData);
  const forty = combineEntries["40Yd"] ?? "";
  const combineRanks = buildCombineRankData(d, allProspects);
  const awardsList = parseCollegeAwards(d.collegeAwards);
  const adv = parseAdvancedStats(d.advancedStats ?? null);
  const advHasAny =
    adv &&
    (adv.speedScore != null ||
      adv.bestDominator != null ||
      adv.dominatorByYear.length > 0 ||
      adv.breakoutSeason != null ||
      adv.bestYprr != null ||
      adv.yprrByYear.length > 0);
  const approxRound = approxRound12Team(d.adp);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Left hero */}
      <div className="relative shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-b from-zinc-900 to-zinc-950 px-6 py-8 text-center before:pointer-events-none before:absolute before:inset-0 before:bg-primary/5 before:content-[''] lg:w-[280px] lg:border-b-0 lg:border-r">
        <div className="relative z-[1] flex flex-col items-center gap-4">
          <Avatar className="h-28 w-28 border-2 border-primary/60 shadow-lg ring-2 ring-primary/20">
            {d.photoUrl ? <AvatarImage src={d.photoUrl} alt={d.displayName} /> : null}
            <AvatarFallback className="bg-zinc-800 text-2xl font-bold text-zinc-100">
              {d.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-white">{d.displayName}</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {d.position ? (
                <Badge
                  className={POSITION_COLORS[d.position] || "bg-zinc-700 text-zinc-100"}
                >
                  {d.position}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-zinc-400">{d.school ?? d.sleeperCollege ?? "—"}</p>
          </div>
          {teamAbbr ? (
            <div className="flex flex-col items-center gap-1.5">
              <img
                src={getNflTeamLogoUrl(teamAbbr)}
                alt=""
                className="h-14 w-14 object-contain"
                onError={(e) => applyNflTeamLogoFallback(e.currentTarget, teamAbbr)}
              />
              <span className="text-xs font-mono font-medium uppercase tracking-wide text-zinc-300">
                {teamAbbr}
              </span>
            </div>
          ) : null}
          <div className="h-px w-full max-w-[200px] bg-zinc-700" />
          <div className="grid w-full max-w-[240px] grid-cols-3 gap-2 text-left">
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/60 px-2 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">ADP</p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                {d.adp != null ? Number(d.adp).toFixed(1) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/60 px-2 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Age</p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
                {d.age ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700/80 bg-zinc-800/60 px-2 py-2">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">RAS</p>
                {d.ras != null && d.rasLink ? (
                  <a
                    href={d.rasLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-primary"
                    title="Open ras.football"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <p
                className={`mt-0.5 font-mono text-sm font-semibold tabular-nums ${
                  d.ras != null ? rasDisplayClass(Number(d.ras)) : "text-zinc-500"
                }`}
              >
                {d.ras != null ? Number(d.ras).toFixed(2) : "—"}
              </p>
            </div>
          </div>
          {forty ? (
            <div className="w-full max-w-[240px] rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">40-yard</p>
              <p className="font-mono text-lg font-bold tabular-nums text-primary">{forty}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Right: tabs */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 py-4 sm:px-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="combine">Combine</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-5 focus-visible:outline-none">
            {d.overview ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Scouting notes
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                  {d.overview}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No overview text yet. Commissioners can add notes when editing a prospect.</p>
            )}
            {awardsList.length > 0 ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Award className="h-3.5 w-3.5" />
                  College awards
                </h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {awardsList.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
              {approxRound != null ? (
                <p>
                  <span className="font-medium text-foreground">Draft context:</span> ADP{" "}
                  <span className="font-mono tabular-nums">{d.adp != null ? Number(d.adp).toFixed(1) : "—"}</span>{" "}
                  maps to about <span className="font-mono text-foreground">round {approxRound}</span> in a
                  12-team league (format-dependent).
                </p>
              ) : (
                <p>Add ADP to see a simple round estimate for 12-team formats.</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="combine" className="mt-0 space-y-5 focus-visible:outline-none">
            <div>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3.5 w-3.5" />
                Testing
              </h3>
              <p className="text-xs text-muted-foreground">
                Ranking among {d.position ?? "same-position"} prospects on this board who recorded each drill.
              </p>
            </div>
            {combineRanks.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {combineRanks.map(({ key, label, value, rank, outOf }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-muted/25 px-3 py-2 text-sm"
                  >
                    <span className="capitalize text-muted-foreground">{label}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono font-semibold tabular-nums">{value}</span>
                      {rank != null && outOf != null ? (
                        <span className={`text-xs tabular-nums ${rankBadgeClass(rank, outOf)}`}>
                          {ordinalSuffix(rank)} of {outOf}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No combine data on file.</p>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0 space-y-4 focus-visible:outline-none">
            {!adv ? (
              <p className="text-sm text-muted-foreground">
                No advanced stats. Ask your commissioner to run &quot;Refresh advanced stats&quot; when the
                college data API is configured.
              </p>
            ) : (
              <>
                {adv.speedScore != null && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Speed score
                    </p>
                    <p className="mt-1">
                      <span className={STAT_TIER_CLASS[getSpeedScoreTier(adv.speedScore)]}>
                        {adv.speedScore}
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                      <div
                        className={`h-full rounded-full transition-all ${speedBarFillClass(adv.speedScore)}`}
                        style={{ width: `${Math.min(100, (adv.speedScore / 140) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Scale 0–140 (100 = NFL avg, 110+ elite)</p>
                  </div>
                )}
                {(adv.bestDominator != null || adv.dominatorByYear.length > 0) && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      College dominator
                    </p>
                    {adv.bestDominator != null && (
                      <p className="mt-1 text-sm">
                        Best:{" "}
                        <span className={STAT_TIER_CLASS[getDominatorTier(adv.bestDominator)]}>
                          {(adv.bestDominator * 100).toFixed(1)}%
                        </span>
                      </p>
                    )}
                    {adv.dominatorByYear.length > 0 ? (
                      <div className="mt-3">
                        <DominatorYearBars rows={adv.dominatorByYear} />
                      </div>
                    ) : null}
                  </div>
                )}
                {adv.bestDominator == null &&
                  adv.dominatorByYear.length === 0 &&
                  adv.dominatorUnavailableReason && (
                    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
                      {adv.dominatorUnavailableReason}
                    </div>
                  )}
                {adv.breakoutSeason != null && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Breakout season
                    </p>
                    <p className="mt-1 font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                      {adv.breakoutSeason}
                    </p>
                  </div>
                )}
                {(adv.bestYprr != null || adv.yprrByYear.length > 0) && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">YPRR</p>
                    {adv.bestYprr != null && (
                      <p className="mt-1">
                        <span className={STAT_TIER_CLASS[getYprrTier(adv.bestYprr)]}>{adv.bestYprr}</span>
                        {adv.yprrByYear.length > 0 ? " (best)" : null}
                      </p>
                    )}
                    {adv.yprrByYear.length > 0 && (
                      <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                        {adv.yprrByYear.map(({ year, yprr }) => (
                          <li key={year}>
                            {year}:{" "}
                            <span className={STAT_TIER_CLASS[getYprrTier(yprr)]}>{yprr}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {!advHasAny && (
                  <p className="text-sm text-muted-foreground">No analytics rows for this prospect.</p>
                )}
                <details className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground/80">Metric definitions</summary>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <strong className="text-foreground/90">Speed score</strong> — 40 time and weight vs NFL
                      average (from combine).
                    </li>
                    <li>
                      <strong className="text-foreground/90">Dominator</strong> — share of team yards and TDs
                      (receiving for WR/TE; rush + rec for RB).
                    </li>
                    <li>
                      <strong className="text-foreground/90">Breakout</strong> — first season above the
                      dominator threshold.
                    </li>
                    <li>
                      <strong className="text-foreground/90">YPRR</strong> — receiving yards per team pass
                      attempt (WR/TE).
                    </li>
                  </ul>
                </details>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
