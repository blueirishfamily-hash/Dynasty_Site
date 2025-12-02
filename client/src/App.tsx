import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SleeperProvider, useSleeper } from "@/lib/sleeper-context";
import AppSidebar from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import SetupModal from "@/components/SetupModal";
import Dashboard from "@/pages/Dashboard";
import Team from "@/pages/Team";
import Trades from "@/pages/Trades";
import Draft from "@/pages/Draft";
import Standings from "@/pages/Standings";
import Settings from "@/pages/Settings";
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
import { Search, Bell, ChevronDown, LogOut, Settings as SettingsIcon, User, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/team" component={Team} />
      <Route path="/trades" component={Trades} />
      <Route path="/draft" component={Draft} />
      <Route path="/standings" component={Standings} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { user, league, clearSession, season } = useSleeper();
  const [showSetup, setShowSetup] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user || !league) {
      setShowSetup(true);
    }
  }, [user, league]);

  const { data: draftPicks } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId,
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
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const userTeam = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeam?.rosterId;
  const currentYear = parseInt(season) + 1;

  const userDraftPicks = (draftPicks || [])
    .filter((p: any) => 
      p.currentOwnerId === userRosterId && 
      (p.season === currentYear.toString() || p.season === (currentYear + 1).toString())
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

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      <SetupModal open={showSetup} onComplete={() => setShowSetup(false)} />
      <SidebarProvider style={sidebarStyle as React.CSSProperties}>
        <div className="flex h-screen w-full overflow-hidden">
          <AppSidebar
            leagueName={league?.name || "Dynasty League"}
            draftPicks={userDraftPicks}
            faabBudget={league?.waiverBudget || 100}
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
                    <DropdownMenuItem onClick={() => setLocation("/settings")} data-testid="menu-item-settings">
                      <SettingsIcon className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowSetup(true)} data-testid="menu-item-switch-league">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Switch League
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
            <main className="flex-1 overflow-auto bg-background">
              <Router />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SleeperProvider>
          <AppContent />
        </SleeperProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
