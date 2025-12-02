import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import ThemeToggle from "@/components/ThemeToggle";
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
import { Search, Bell, ChevronDown, LogOut, Settings as SettingsIcon, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// todo: remove mock functionality
const mockDraftPicks = [
  { year: 2025, round: 1 },
  { year: 2025, round: 2 },
  { year: 2025, round: 3 },
  { year: 2026, round: 1 },
  { year: 2026, round: 1, originalOwner: "TD" },
  { year: 2026, round: 2 },
];

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

function App() {
  const [location] = useLocation();
  
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full overflow-hidden">
            <AppSidebar
              leagueName="Champions Dynasty"
              draftPicks={mockDraftPicks}
              faabBudget={87}
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
                    <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                      3
                    </Badge>
                  </Button>
                  <ThemeToggle />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            DC
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden lg:inline text-sm font-medium">dynasty_champion</span>
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
                      <DropdownMenuItem data-testid="menu-item-settings">
                        <SettingsIcon className="w-4 h-4 mr-2" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" data-testid="menu-item-logout">
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
