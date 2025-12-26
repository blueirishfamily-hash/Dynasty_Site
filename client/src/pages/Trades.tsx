import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import TradeCenter from "@/components/TradeCenter";
import TradeHistory from "@/components/TradeHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Trades() {
  const { user, league, season } = useSleeper();
  
  // Calculate the next 3 years of draft picks
  const nextDraftYear = parseInt(season || "2024") + 1;
  const maxDraftYear = nextDraftYear + 2; // Show 3 years total

  const { data: trades, isLoading: tradesLoading } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "trades"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/trades`);
      if (!res.ok) throw new Error("Failed to fetch trades");
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

  const { data: roster } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "roster", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/roster/${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const { data: draftPicks } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "draft-picks"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/draft-picks`);
      if (!res.ok) throw new Error("Failed to fetch draft picks");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: allRosters } = useQuery({
    queryKey: ["/api/sleeper/league", league?.leagueId, "all-rosters"],
    queryFn: async () => {
      const res = await fetch(`/api/sleeper/league/${league?.leagueId}/all-rosters`);
      if (!res.ok) throw new Error("Failed to fetch all rosters");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  const { data: contracts } = useQuery({
    queryKey: ["/api/league", league?.leagueId, "contracts"],
    queryFn: async () => {
      const res = await fetch(`/api/league/${league?.leagueId}/contracts`);
      if (!res.ok) throw new Error("Failed to fetch contracts");
      return res.json();
    },
    enabled: !!league?.leagueId,
  });

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to access the trade center.
          </p>
        </div>
      </div>
    );
  }

  const userTeamStanding = standings?.find((s: any) => s.isUser);
  const userRosterId = userTeamStanding?.rosterId;

  const userTeam = userTeamStanding && roster ? {
    teamId: user.userId,
    teamName: userTeamStanding.name,
    teamInitials: userTeamStanding.initials,
    teamAvatar: userTeamStanding.avatar,
    players: (roster || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      position: p.position as "QB" | "RB" | "WR" | "TE",
      team: p.team || "FA",
    })),
    draftPicks: (draftPicks || [])
      .filter((p: any) => {
        const pickYear = parseInt(p.season);
        return p.currentOwnerId === userRosterId && 
          pickYear >= nextDraftYear && 
          pickYear <= maxDraftYear &&
          p.round <= 3;
      })
      .map((p: any) => ({
        id: p.id,
        year: parseInt(p.season),
        round: p.round,
        originalOwner: p.originalOwnerId !== p.currentOwnerId ? p.originalOwnerName : undefined,
      })),
  } : null;

  const rosterMap = new Map<string, any>();
  (allRosters || []).forEach((r: any) => rosterMap.set(r.ownerId, r));

  const leagueTeams = standings
    ?.filter((s: any) => !s.isUser)
    .map((team: any) => {
      const rosterData = rosterMap.get(team.ownerId);
      return {
        teamId: team.ownerId,
        teamName: team.name,
        teamInitials: team.initials,
        teamAvatar: team.avatar,
        players: (rosterData?.players || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          position: p.position as "QB" | "RB" | "WR" | "TE",
          team: p.team || "FA",
        })),
        draftPicks: (draftPicks || [])
          .filter((p: any) => {
            const pickYear = parseInt(p.season);
            return p.currentOwnerId === team.rosterId && 
              pickYear >= nextDraftYear && 
              pickYear <= maxDraftYear &&
              p.round <= 3;
          })
          .map((p: any) => ({
            id: p.id,
            year: parseInt(p.season),
            round: p.round,
            originalOwner: p.originalOwnerId !== p.currentOwnerId ? p.originalOwnerName : undefined,
          })),
      };
    }) || [];

  const formattedTrades = (trades || []).map((trade: any) => ({
    id: trade.id,
    date: trade.date,
    teamA: trade.teamA,
    teamB: trade.teamB,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Trade Center</h1>
        <p className="text-muted-foreground">Build and propose trades with other managers</p>
      </div>

      {userTeam ? (
        <TradeCenter userTeam={userTeam} leagueTeams={leagueTeams} contracts={contracts || []} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading trade center...
          </CardContent>
        </Card>
      )}

      {tradesLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      ) : formattedTrades.length > 0 ? (
        <TradeHistory trades={formattedTrades} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No trades have been made in this league yet
          </CardContent>
        </Card>
      )}
    </div>
  );
}
