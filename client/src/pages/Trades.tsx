import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import TradeCenter from "@/components/TradeCenter";
import TradeHistory from "@/components/TradeHistory";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart2, History } from "lucide-react";

export default function Trades() {
  const { user, league } = useSleeper();

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

  const rosterByOwner = new Map<string, any>();
  (allRosters || []).forEach((r: any) => rosterByOwner.set(r.ownerId, r));

  const userTeam = userTeamStanding
    ? (() => {
        const ownerId = userTeamStanding.ownerId ?? user?.userId;
        const r = rosterByOwner.get(ownerId);
        const basePlayers = r?.players ?? (Array.isArray(roster) ? roster : []);
        const players = basePlayers.map((p: any) => ({
          id: p.id,
          name: p.name,
          position: (p.position || "FLEX") as "QB" | "RB" | "WR" | "TE",
          team: p.team || "FA",
          seasonPoints: p.seasonPoints ?? null,
          weeklyAvg: p.weeklyAvg ?? null,
          positionRank: p.positionRank ?? null,
          positionRankTotal: p.positionRankTotal ?? null,
          age: p.age ?? null,
          yearsExp: p.yearsExp ?? null,
          injuryStatus: p.injuryStatus ?? null,
          tradeValue: p.tradeValue ?? null,
          gamesStarted: p.gamesStarted ?? null,
        }));
        return {
          teamId: user.userId,
          teamName: userTeamStanding.name,
          teamInitials: userTeamStanding.initials,
          teamAvatar: userTeamStanding.avatar ?? r?.teamAvatar,
          players,
          draftPicks: (draftPicks || [])
            .filter((p: any) => p.currentOwnerId === userRosterId)
            .map((p: any) => ({
              id: p.id,
              year: parseInt(p.season),
              round: p.round,
              originalOwner: p.originalOwnerId !== p.currentOwnerId ? p.originalOwnerName : undefined,
              grade: p.grade,
              draftSlot: p.draftSlot,
            })),
        };
      })()
    : null;

  const leagueTeams = standings
    ?.filter((s: any) => !s.isUser)
    .map((team: any) => {
      const r = rosterByOwner.get(team.ownerId);
      return {
        teamId: team.ownerId,
        teamName: team.name,
        teamInitials: team.initials,
        teamAvatar: team.avatar ?? r?.teamAvatar,
        players: (r?.players || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          position: (p.position || "FLEX") as "QB" | "RB" | "WR" | "TE",
          team: p.team || "FA",
          seasonPoints: p.seasonPoints ?? null,
          weeklyAvg: p.weeklyAvg ?? null,
          positionRank: p.positionRank ?? null,
          positionRankTotal: p.positionRankTotal ?? null,
          age: p.age ?? null,
          yearsExp: p.yearsExp ?? null,
          injuryStatus: p.injuryStatus ?? null,
          tradeValue: p.tradeValue ?? null,
          gamesStarted: p.gamesStarted ?? null,
        })),
        draftPicks: (draftPicks || [])
          .filter((p: any) => p.currentOwnerId === team.rosterId)
          .map((p: any) => ({
            id: p.id,
            year: parseInt(p.season),
            round: p.round,
            originalOwner: p.originalOwnerId !== p.currentOwnerId ? p.originalOwnerName : undefined,
            grade: p.grade,
            draftSlot: p.draftSlot,
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

      <Tabs defaultValue="builder" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="builder" className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            Trade Builder
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Trade History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="space-y-4">
          {userTeam ? (
            <TradeCenter
              userTeam={userTeam}
              leagueTeams={leagueTeams}
              leagueId={league?.leagueId}
              userRosterId={userRosterId}
              getRosterId={(teamId: string) => {
                const team = standings?.find((s: any) => s.ownerId === teamId);
                return team?.rosterId;
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading trade center...
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {tradesLoading ? (
            <Card>
              <CardContent className="py-8">
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
