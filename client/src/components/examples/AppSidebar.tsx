import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "../AppSidebar";

export default function AppSidebarExample() {
  // todo: remove mock functionality
  const mockDraftPicks = [
    { year: 2025, round: 1 },
    { year: 2025, round: 2 },
    { year: 2025, round: 3 },
    { year: 2026, round: 1 },
    { year: 2026, round: 1, originalOwner: "Team B" },
    { year: 2026, round: 2 },
  ];

  return (
    <SidebarProvider>
      <AppSidebar 
        leagueName="Champions Dynasty" 
        draftPicks={mockDraftPicks}
        faabBudget={87}
      />
    </SidebarProvider>
  );
}
