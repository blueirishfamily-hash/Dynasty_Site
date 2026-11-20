import { Link, useLocation } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  Trophy,
  BarChart3,
  ChartLine,
  Settings,
  Zap,
  Swords,
  Sparkles,
  Medal,
  Scale,
  CalendarCheck,
  MessageSquare,
  Building2,
  SlidersHorizontal,
  Plus,
} from "lucide-react";
import { useIsCommissioner, useMyLeagues } from "@/lib/commissioner";
import { useContractsEnabled } from "@/lib/leagueRules";

const baseNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Team", url: "/team", icon: Users },
  { title: "Matchup", url: "/matchup", icon: Swords },
  { title: "Trade Center", url: "/trades", icon: ArrowLeftRight },
  { title: "Draft Board", url: "/draft", icon: Trophy },
  { title: "Trophy Room", url: "/trophies", icon: Medal },
  { title: "Rule Changes", url: "/rule-changes", icon: Scale },
  { title: "Standings", url: "/standings", icon: BarChart3 },
  { title: "League Stats", url: "/stats", icon: ChartLine },
  { title: "Contracts Hub", url: "/contracts-hub", icon: Building2 },
  { title: "Metrics", url: "/metrics", icon: Sparkles },
  { title: "Year Recap", url: "/year-recap", icon: CalendarCheck },
  { title: "Suggestions", url: "/suggestions", icon: MessageSquare },
  { title: "League Settings", url: "/league-settings", icon: SlidersHorizontal },
  { title: "Settings", url: "/settings", icon: Settings },
];

const CONTRACT_PAGE_URLS = new Set(["/contracts-hub"]);

// Pages only the commissioner sees in the menu.
const COMMISSIONER_ONLY_TITLES = new Set(["Settings", "League Settings"]);

interface DraftPick {
  year: number;
  round: number;
  originalOwner?: string;
}

interface AppSidebarProps {
  leagueName?: string;
  draftPicks?: DraftPick[];
}

export default function AppSidebar({
  leagueName = "Dynasty League",
  draftPicks = [],
}: AppSidebarProps) {
  const contractsOn = useContractsEnabled();
  const [location] = useLocation();
  const { user, league, leagueSlug } = useSleeper();
  const { data: joinedLeagues } = useMyLeagues();

  const isCommissioner = useIsCommissioner();

  const navItems = (isCommissioner ? baseNavItems : baseNavItems.filter((item) => !COMMISSIONER_ONLY_TITLES.has(item.title)))
    // Contracts off: the contract pages are hidden for this league.
    .filter((item) => contractsOn || !CONTRACT_PAGE_URLS.has(item.url));

  const getRoundColor = (round: number) => {
    if (round === 1) return "bg-primary text-primary-foreground";
    if (round === 2) return "bg-chart-2 text-white";
    return "bg-muted text-muted-foreground";
  };

  // Your leagues: the ones this device joined, plus the open one even if it doesn't ask for a code.
  const myLeagues = [
    ...(joinedLeagues ?? []).map((l) => ({ slug: l.slug, name: l.name })),
    ...((joinedLeagues ?? []).some((l) => l.slug === leagueSlug) ? [] : [{ slug: leagueSlug, name: leagueName }]),
  ].sort((a, b) => (a.slug === leagueSlug ? -1 : b.slug === leagueSlug ? 1 : a.name.localeCompare(b.name)));
  const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading font-semibold text-sidebar-foreground">
              Dynasty Command
            </h1>
            <p className="text-xs text-muted-foreground">{leagueName}</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup className="pb-0">
          <SidebarGroupLabel>Your leagues</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu data-testid="list-your-leagues">
              {myLeagues.map((l) => (
                <SidebarMenuItem key={l.slug}>
                  <SidebarMenuButton asChild className={l.slug === leagueSlug ? "bg-sidebar-accent" : ""}>
                    <Link href={`~/l/${l.slug}`} data-testid={`league-link-${l.slug}`}>
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/15 text-[10px] font-medium text-primary">{initialsOf(l.name)}</span>
                      <span className="truncate">{l.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link href="~/join" data-testid="link-join-another">
                    <Plus className="h-4 w-4" />
                    <span>Join another league</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.url === "/" ? location === "/" : location === item.url || location.startsWith(`${item.url}/`);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={isActive ? "bg-sidebar-accent" : ""}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(" ", "-")}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Draft Capital
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {draftPicks.length > 0 ? (
              draftPicks.map((pick, i) => (
                <Badge
                  key={i}
                  className={`text-xs ${getRoundColor(pick.round)}`}
                  data-testid={`badge-pick-${pick.year}-${pick.round}`}
                >
                  {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`}
                  {pick.originalOwner && ` (via ${pick.originalOwner})`}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No picks available</span>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
