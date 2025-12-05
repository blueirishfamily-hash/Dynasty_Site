import { Link, useLocation } from "wouter";
import { useSleeper } from "@/lib/sleeper-context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
  Settings,
  Zap,
  MessageSquare,
  Swords,
  Sparkles,
  Medal,
  FileText,
  ClipboardCheck,
} from "lucide-react";

const COMMISSIONER_USER_IDS = [
  "900186363130503168",
];

const baseNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Team", url: "/team", icon: Users },
  { title: "Matchup", url: "/matchup", icon: Swords },
  { title: "Trade Center", url: "/trades", icon: ArrowLeftRight },
  { title: "Draft Board", url: "/draft", icon: Trophy },
  { title: "Trophy Room", url: "/trophies", icon: Medal },
  { title: "League Hub", url: "/hub", icon: MessageSquare },
  { title: "Standings", url: "/standings", icon: BarChart3 },
  { title: "Metrics", url: "/metrics", icon: Sparkles },
  { title: "Settings", url: "/settings", icon: Settings },
];

const commissionerNavItems = [
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Contract Approvals", url: "/contract-approvals", icon: ClipboardCheck },
];

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
  const [location] = useLocation();
  const { user, league } = useSleeper();

  const isCommissioner = !!(user?.userId && league && (
    (league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  ));

  const navItems = isCommissioner 
    ? [...baseNavItems, ...commissionerNavItems]
    : baseNavItems;

  const getRoundColor = (round: number) => {
    if (round === 1) return "bg-primary text-primary-foreground";
    if (round === 2) return "bg-chart-2 text-white";
    return "bg-muted text-muted-foreground";
  };

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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url;
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
                  {pick.year} {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : `${pick.round}rd`}
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
