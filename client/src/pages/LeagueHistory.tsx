import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { History, Search } from "lucide-react";
import { HistoryProvider, TeamAvatar, useHistoryContext, useLeagueHistory } from "@/components/history/common";
import LeagueView from "@/components/history/LeagueView";
import TeamsView from "@/components/history/TeamsView";
import MatchupsView from "@/components/history/MatchupsView";
import SeasonView from "@/components/history/SeasonView";

const COMMISSIONER_USER_IDS = ["900186363130503168"];

type Tab = "league" | "teams" | "matchups";

const TABS: { id: Tab; label: string; href: string }[] = [
  { id: "league", label: "League", href: "/history" },
  { id: "teams", label: "Teams", href: "/history/teams" },
  { id: "matchups", label: "Matchups", href: "/history/matchups" },
];

function JumpTo() {
  const { history } = useHistoryContext();
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 text-muted-foreground w-56 justify-start" data-testid="button-history-jump">
          <Search className="w-4 h-4" />
          Jump to team or season
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search teams and seasons" data-testid="input-history-jump" />
          <CommandList>
            <CommandEmpty>No matches</CommandEmpty>
            <CommandGroup heading="Seasons">
              {[...history.seasons].reverse().map((s) => (
                <CommandItem key={s.season} value={`season ${s.season}`} onSelect={() => go(`/history/seasons/${s.season}`)}>
                  {s.season} season
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Teams">
              {history.franchises.map((f) => (
                <CommandItem
                  key={f.id}
                  value={`team ${f.name} ${f.ownerName ?? ""}`}
                  onSelect={() => go(`/history/teams/${encodeURIComponent(f.id)}`)}
                  data-testid={`jump-team-${f.id}`}
                >
                  <TeamAvatar franchise={f} size={20} />
                  <span className="ml-2 truncate">{f.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function HistoryBody() {
  const [, seasonParams] = useRoute("/history/seasons/:season");
  const [, teamParams] = useRoute("/history/teams/:id");
  const [matchesTeams] = useRoute("/history/teams");
  const [, pairParams] = useRoute("/history/matchups/:a/:b");
  const [matchesMatchups] = useRoute("/history/matchups");

  let tab: Tab = "league";
  if (teamParams || matchesTeams) tab = "teams";
  else if (pairParams || matchesMatchups) tab = "matchups";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex rounded-md bg-muted p-1" aria-label="League history sections">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={t.href}
              data-testid={`tab-history-${t.id}`}
              className={`px-4 py-1.5 text-sm rounded-sm font-medium ${
                tab === t.id && !seasonParams ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <JumpTo />
      </div>

      {seasonParams ? (
        <SeasonView season={seasonParams.season} />
      ) : tab === "teams" ? (
        <TeamsView teamId={teamParams?.id} />
      ) : tab === "matchups" ? (
        <MatchupsView aId={pairParams?.a} bId={pairParams?.b} />
      ) : (
        <LeagueView />
      )}
    </div>
  );
}

export default function LeagueHistory() {
  const { user, league } = useSleeper();
  const [, setLocation] = useLocation();
  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  useEffect(() => {
    if (user && league && !isCommissioner) setLocation("/");
  }, [user, league, isCommissioner, setLocation]);

  const { data, isLoading, error } = useLeagueHistory({ enabled: isCommissioner });

  if (user && league && !isCommissioner) return null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="page-league-history">
      <div className="flex items-center gap-3">
        <History className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-heading font-bold">League History</h1>
          <p className="text-sm text-muted-foreground">{league?.name ?? "Every season, team and matchup in one place"}</p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4" data-testid="history-loading">
          <p className="text-sm text-muted-foreground">Gathering every season. The first load can take a moment.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      )}

      {error && <p className="text-destructive" data-testid="history-error">Couldn't load league history. Try again in a moment.</p>}

      {data && (
        <HistoryProvider history={data}>
          <HistoryBody />
        </HistoryProvider>
      )}
    </div>
  );
}