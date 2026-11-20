import { useState, useEffect } from "react";
import { Switch, Route, Redirect, useLocation, useSearch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SleeperProvider, useSleeper } from "@/lib/sleeper-context";
import { isValidLeagueSlug, legacyRedirectTarget, setLeagueSlug } from "@/lib/league-address";
import "@/lib/unlock";
import UnlockDialog from "@/components/UnlockDialog";
import JoinCard, { PICK_TEAM_AFTER_JOIN_KEY } from "@/components/JoinCard";
import JoinPage from "@/pages/Join";
import AdminPage from "@/pages/Admin";
import AppSidebar from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SetupModal from "@/components/SetupModal";
import Dashboard from "@/pages/Dashboard";
import Team from "@/pages/Team";
import Trades from "@/pages/Trades";
import Draft from "@/pages/Draft";
import Matchup from "@/pages/Matchup";
import Standings from "@/pages/Standings";
import Metrics from "@/pages/Metrics";
import TrophyRoom from "@/pages/TrophyRoom";
import Settings from "@/pages/Settings";
import ContractsHub from "@/pages/ContractsHub";
import RuleChanges from "@/pages/RuleChanges";
import Historical from "@/pages/Historical";
import LeagueHistory from "@/pages/LeagueHistory";
import YearRecap from "@/pages/YearRecap";
import Suggestions from "@/pages/Suggestions";
import LeagueSettings from "@/pages/LeagueSettings";
import NotFound from "@/pages/not-found";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Bell, ChevronDown, LogOut, Settings as SettingsIcon, User, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useIsCommissioner } from "@/lib/commissioner";
import { useContractsEnabled } from "@/lib/leagueRules";

// Contract pages show a short notice instead when the league has contracts turned off.
function ContractsOnly({ children }: { children: React.ReactNode }) {
  if (useContractsEnabled()) return <>{children}</>;
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Contracts are off for this league</h1>
        <p className="mt-1 text-sm text-muted-foreground">The commissioner can turn them on in League Settings.</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/team" component={Team} />
      <Route path="/matchup" component={Matchup} />
      <Route path="/trades" component={Trades} />
      <Route path="/draft" component={Draft} />
      <Route path="/rule-changes" component={RuleChanges} />
      <Route path="/standings" component={Standings} />
      <Route path="/metrics" component={Metrics} />
      <Route path="/trophies" component={TrophyRoom} />
      <Route path="/settings" component={Settings} />
      <Route path="/league-settings" component={LeagueSettings} />
      {/* The old Contracts page was retired; the Hub replaces it. Keep old links and bookmarks working. */}
      <Route path="/contracts">{() => <Redirect to="/contracts-hub" replace />}</Route>
      <Route path="/contracts-hub">{() => <ContractsOnly><ContractsHub /></ContractsOnly>}</Route>
      <Route path="/historical" component={Historical} />
      <Route path="/history/*" component={LeagueHistory} />
      <Route path="/history" component={LeagueHistory} />
      <Route path="/year-recap" component={YearRecap} />
      <Route path="/suggestions" component={Suggestions} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, league, clearSession, season, isLoading, error, leagueNotFound, needsJoin, leagueSlug, registryLeague } = useSleeper();
  const [showSetup, setShowSetup] = useState(false);
  const [, setLocation] = useLocation();

  const isCommissioner = useIsCommissioner();

  const { data: draftPicks } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId && !isLoading,
  });

  const { data: standings } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "standings", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/standings?userId=${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch standings");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId && !isLoading,
  });

  const userTeam = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeam?.rosterId;
  const currentYear = parseInt(season) + 1;

  const userDraftPicks = (draftPicks || [])
    .filter((p: any) => 
      p.currentOwnerId === userRosterId && 
      (p.season === currentYear.toString() || p.season === (currentYear + 1).toString()) &&
      p.round <= 3 // Only show rounds 1-3 (draft is only 3 rounds)
    )
    .slice(0, 8)
    .map((p: any) => ({
      year: parseInt(p.season),
      round: p.round,
      originalOwner: p.originalOwnerId !== p.currentOwnerId 
        ? standings?.find((s: any) => s.rosterId === p.originalOwnerId)?.initials 
        : undefined,
    }));

  const handleLogout = () => {
    clearSession();
    setShowSetup(true);
    setLocation("/");
  };

  // Just joined this league: open the team picker (the last step of joining).
  useEffect(() => {
    if (isLoading || !league || user) return;
    try {
      if (sessionStorage.getItem(PICK_TEAM_AFTER_JOIN_KEY) === leagueSlug) {
        sessionStorage.removeItem(PICK_TEAM_AFTER_JOIN_KEY);
        setShowSetup(true);
      }
    } catch {
      /* storage unavailable: the Connect your league prompts still work */
    }
  }, [isLoading, league, user, leagueSlug]);

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  // Show loading state while league is being fetched (inline styles so it's visible even if CSS fails)
  // The league asks for its invite code and this device hasn't joined: show the join card instead of the pages.
  if (!isLoading && needsJoin) {
    return (
      <div className="min-h-screen w-full bg-background">
        <JoinCard expectedSlug={leagueSlug} expectedName={registryLeague?.name} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-screen bg-background"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(215 25% 95%)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"
            style={{
              width: 32,
              height: 32,
              border: "4px solid hsl(160 84% 39%)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              margin: "0 auto 1rem",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ color: "hsl(215 15% 45%)", margin: 0 }}>Connecting to league...</p>
        </div>
      </div>
    );
  }

  // Don't block the app completely - allow navigation even without league
  // Users can still access Settings to configure a league
  // Only show a warning banner if there's an error and no league
  const showLeagueWarning = error && !league && (error.includes("No league configured") || error.includes("Failed to connect"));

  return (
    <>
      <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
      <UnlockDialog
        commissioner={isCommissioner && user?.userId ? { sleeperUserId: user.userId, label: userTeam?.name } : null}
      />
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar
            leagueName={league?.name || "Dynasty League"}
            draftPicks={userDraftPicks}
          />
          <div className="flex flex-col flex-1 min-w-0">
            <header className="h-16 flex items-center justify-between gap-4 px-4 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-4">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="relative hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search players..."
                    className="pl-9 w-64 lg:w-80"
                    data-testid="input-search-global"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                  <Bell className="w-4 h-4" />
                </Button>
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {user?.displayName?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="hidden lg:inline text-sm font-medium">
                        {user?.username || "Guest"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem data-testid="menu-item-profile">
                      <User className="w-4 h-4 mr-2" />
                      Profile
                    </DropdownMenuItem>
                    {isCommissioner && (
                      <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-item-settings">
                        <SettingsIcon className="w-4 h-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                    )}
                    {isCommissioner && (
                      <DropdownMenuItem onClick={() => setLocation("~/admin")} data-testid="menu-item-site-admin">
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Site admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setShowSetup(true)} data-testid="menu-item-select-team">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Select Your Team
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={handleLogout} data-testid="menu-item-logout">
                      <LogOut className="w-4 h-4 mr-2" />
                      Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            {showLeagueWarning && (
              <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    <strong>No league configured.</strong>{" "}
                    {isCommissioner
                      ? "Please go to Settings to set up a league ID."
                      : "Contact your commissioner to set up the league."}
                  </p>
                  {isCommissioner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/settings")}
                    >
                      Go to Settings
                    </Button>
                  )}
                </div>
              </div>
            )}
            <main className="flex-1 overflow-auto bg-background">
              {leagueNotFound ? <NotFound /> : <Router />}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

// Every page lives under its league's address, /l/<slug>/. Inside the nested route, links and
// setLocation stay relative ("/team" goes to /l/<slug>/team), so pages don't need to know the address.
// An open league (no invite code) remembers each device that opens it as joined, so it shows under "Your leagues"
// and stays a member if a code is added later.
function VisitBeacon({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    fetch(`/api/registry/leagues/${encodeURIComponent(slug)}/device/visit`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (body?.enrolled) queryClient.invalidateQueries({ queryKey: ["/api/registry/my-leagues"] }); })
      .catch(() => {});
  }, [slug, queryClient]);
  return null;
}

function LeagueApp({ slug }: { slug: string }) {
  if (!isValidLeagueSlug(slug)) return <NotFound />;
  setLeagueSlug(slug); // before any child fetches, so they carry the X-League header
  return (
    <SleeperProvider key={slug} leagueSlug={slug}>
      <VisitBeacon slug={slug} />
      <AppContent />
    </SleeperProvider>
  );
}

// Addresses from before league addresses (/team, /standings?x=1, ...) open the same page in the
// device's last used league, or ATL Dynasty.
function LegacyRedirect() {
  const [location] = useLocation();
  const search = useSearch();
  return <Redirect to={legacyRedirectTarget(location, search)} replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          <Route path="/admin" component={AdminPage} />
          <Route path="/join" component={JoinPage} />
          <Route path="/l/:slug" nest>
            {(params) => <LeagueApp slug={params.slug} />}
          </Route>
          <Route>
            <LegacyRedirect />
          </Route>
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
