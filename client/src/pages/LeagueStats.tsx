import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ChartLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSleeper } from "@/lib/sleeper-context";
import { HistoryProvider, useLeagueHistory } from "@/components/history/common";
import TeamsView from "@/components/history/TeamsView";
import MatchupsView from "@/components/history/MatchupsView";
import { OverviewTab, RecordsTab, StandingsTab } from "@/components/league-stats/HistoryTabs";
import StatsSearch from "@/components/league-stats/StatsSearch";
import { DraftsTab, PlayersTab, TransactionsTab } from "@/components/league-stats/SleeperTabs";
import { StatsEmpty, StatsError, StatsLoading } from "@/components/league-stats/StatsStates";
import {
  ALL_TIME,
  STATS_TABS,
  parseStatsLocation,
  resolveSeason,
  scopeHistory,
  seasonsBadge,
  statsHref,
  statsHrefs,
  type StatsTab,
} from "@/components/league-stats/statsRoute";

/** Tabs that have no season filter of their own: records are all-time marks. */
const ALL_TIME_ONLY: StatsTab[] = ["records"];

export default function LeagueStats() {
  const { league } = useSleeper();
  const [pathname] = useLocation();
  const search = useSearch();
  const loc = useMemo(() => parseStatsLocation(pathname, search), [pathname, search]);
  const { data: history, isLoading, error, refetch } = useLeagueHistory();

  const seasonIds = useMemo(() => (history ? history.seasons.map((s) => s.season) : []), [history]);
  // The season carried in links, and the one this tab actually shows.
  const linkSeason = resolveSeason(loc.season, seasonIds);
  const shownSeason = ALL_TIME_ONLY.includes(loc.tab) ? ALL_TIME : linkSeason;
  const scoped = useMemo(() => (history ? scopeHistory(history, shownSeason) : null), [history, shownSeason]);
  const hrefs = useMemo(() => statsHrefs(linkSeason), [linkSeason]);

  const body = () => {
    if (isLoading) return <StatsLoading message="Gathering every season. The first load can take a moment." />;
    if (error || !history || !scoped) {
      return <StatsError message="Could not load the league history." onRetry={() => refetch()} />;
    }
    if (history.seasons.length === 0) return <StatsEmpty>No seasons are tracked for this league yet.</StatsEmpty>;
    return (
      <HistoryProvider history={scoped} hrefs={hrefs}>
        {loc.tab === "overview" && <OverviewTab season={shownSeason} />}
        {loc.tab === "standings" && <StandingsTab season={shownSeason} />}
        {loc.tab === "teams" && <TeamsView teamId={loc.teamId} />}
        {loc.tab === "matchups" && <MatchupsView aId={loc.a} bId={loc.b} />}
        {loc.tab === "records" && <RecordsTab />}
        {loc.tab === "players" && <PlayersTab season={shownSeason} playerId={loc.playerId} />}
        {loc.tab === "drafts" && <DraftsTab season={shownSeason} />}
        {loc.tab === "transactions" && <TransactionsTab season={shownSeason} />}
      </HistoryProvider>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" data-testid="page-league-stats">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ChartLine className="h-7 w-7 text-primary" aria-hidden="true" />
          <div>
            <h1 className="font-heading text-2xl font-bold">League Stats</h1>
            <p className="text-sm text-muted-foreground">
              {league?.name ? `${league.name}: ` : ""}standings, teams, players, drafts and records for every season
            </p>
          </div>
        </div>
        {history && history.seasons.length > 0 && (
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <Badge variant="outline" data-testid="badge-seasons">
              {seasonsBadge(seasonIds)}
            </Badge>
            <StatsSearch history={history} />
          </div>
        )}
      </div>

      {history && history.seasons.length > 0 && (
        <div className="space-y-1.5">
          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="Season filter"
            data-testid="season-filter"
          >
            {[ALL_TIME, ...[...seasonIds].reverse()].map((s) => {
              const active = shownSeason === s;
              const disabled = ALL_TIME_ONLY.includes(loc.tab) && s !== ALL_TIME;
              const label = s === ALL_TIME ? "All time" : s;
              const cls = `shrink-0 rounded-full border px-3 py-1 text-sm ${
                active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              } ${disabled ? "pointer-events-none opacity-50" : ""}`;
              return disabled ? (
                <span key={s} className={cls} aria-disabled="true">
                  {label}
                </span>
              ) : (
                <Link
                  key={s}
                  href={statsHref(loc.tab, { season: s, teamId: loc.teamId, a: loc.a, b: loc.b, playerId: loc.playerId })}
                  className={cls}
                  aria-current={active ? "true" : undefined}
                  data-testid={`season-chip-${s}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          {ALL_TIME_ONLY.includes(loc.tab) && (
            <p className="text-xs text-muted-foreground">Records are all-time, so the season filter is off on this tab.</p>
          )}
        </div>
      )}

      <nav className="-mx-1 flex gap-1 overflow-x-auto rounded-md bg-muted p-1" aria-label="League stats sections">
        {STATS_TABS.map((t) => {
          const active = loc.tab === t.id;
          return (
            <Link
              key={t.id}
              href={statsHref(t.id, { season: linkSeason })}
              aria-current={active ? "page" : undefined}
              data-testid={`tab-stats-${t.id}`}
              className={`shrink-0 whitespace-nowrap rounded-sm px-3.5 py-1.5 text-sm font-medium ${
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {body()}
    </div>
  );
}
