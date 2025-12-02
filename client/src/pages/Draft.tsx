import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import DraftBoard from "@/components/DraftBoard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Draft() {
  const { user, league, season } = useSleeper();

  const { data: draftPicks, isLoading: picksLoading } = useQuery({
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

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view draft capital.
          </p>
        </div>
      </div>
    );
  }

  const userTeamStanding = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeamStanding?.rosterId;

  const currentYear = parseInt(season) + 1;

  const rosterNameMap = new Map<number, { name: string; initials: string }>();
  standings?.forEach((s: any) => {
    rosterNameMap.set(s.rosterId, { name: s.name, initials: s.initials });
  });

  const formattedPicks = (draftPicks || [])
    .filter((p: any) => p.season === currentYear.toString())
    .map((pick: any) => {
      const originalOwner = rosterNameMap.get(pick.originalOwnerId) || { name: `Team ${pick.originalOwnerId}`, initials: "??" };
      const currentOwner = rosterNameMap.get(pick.currentOwnerId) || { name: `Team ${pick.currentOwnerId}`, initials: "??" };
      
      return {
        round: pick.round,
        pick: pick.rosterId,
        originalOwner: { name: originalOwner.name, initials: originalOwner.initials },
        currentOwner: { name: currentOwner.name, initials: currentOwner.initials },
        isUserPick: pick.currentOwnerId === userRosterId,
        player: undefined,
      };
    })
    .sort((a: any, b: any) => {
      if (a.round !== b.round) return a.round - b.round;
      return a.pick - b.pick;
    });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Draft Board</h1>
        <p className="text-muted-foreground">View draft capital and track pick ownership</p>
      </div>

      {picksLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      ) : formattedPicks.length > 0 ? (
        <DraftBoard
          year={currentYear}
          picks={formattedPicks}
          totalRounds={4}
          teamsCount={league.totalRosters}
          viewMode="current"
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No draft pick data available
          </CardContent>
        </Card>
      )}
    </div>
  );
}
