import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSleeper } from "@/lib/sleeper-context";
import PlayerTable from "@/components/PlayerTable";
import PositionDepthChart from "@/components/PositionDepthChart";
import PlayerModal from "@/components/PlayerModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type RosterStatus = "starter" | "bench" | "taxi" | "ir";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string | null;
  age?: number;
  status: RosterStatus;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
}

interface DepthPlayer {
  id: string;
  name: string;
  team: string | null;
  points: number;
  medianPoints: number;
  percentAboveMedian: number;
}

interface DepthData {
  grade: string;
  players: DepthPlayer[];
}

type ModalPosition = "QB" | "RB" | "WR" | "TE";

const getPlayerDetails = (player: Player) => ({
  id: player.id,
  name: player.name,
  position: player.position as ModalPosition,
  team: player.team || "FA",
  age: player.age || 0,
  seasonPoints: player.seasonPoints,
  weeklyAvg: player.weeklyAvg,
  positionRank: player.positionRank,
  weeklyStats: Array.from({ length: 11 }, (_, i) => ({
    week: i + 1,
    points: player.weeklyAvg + (Math.random() - 0.5) * 15,
  })),
  news: [
    `${player.name} had a strong performance in the recent game`,
    `${player.team || "The"} offense continues to feature ${player.name} heavily`,
  ],
  schedule: [
    { week: 12, opponent: "KC", isHome: true },
    { week: 13, opponent: "SF", isHome: false },
    { week: 14, opponent: "LAR", isHome: true },
    { week: 15, opponent: "DET", isHome: false },
  ],
});

export default function Team() {
  const { user, league } = useSleeper();
  const [selectedPlayer, setSelectedPlayer] = useState<ReturnType<typeof getPlayerDetails> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: roster, isLoading: rosterLoading } = useQuery<Player[]>({
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

  const { data: depthData, isLoading: depthLoading } = useQuery<Record<string, DepthData>>({
    queryKey: ["/api/sleeper/league", league?.leagueId, "depth", user?.userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/sleeper/league/${league?.leagueId}/depth/${user?.userId}`
      );
      if (!res.ok) throw new Error("Failed to fetch depth analysis");
      return res.json();
    },
    enabled: !!league?.leagueId && !!user?.userId,
  });

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(getPlayerDetails(player));
    setModalOpen(true);
  };

  if (!league || !user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <h2 className="font-heading text-2xl font-bold mb-2">Connect Your League</h2>
          <p className="text-muted-foreground">
            Connect your Sleeper account to view your team.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">My Team</h1>
        <p className="text-muted-foreground">Manage your roster and analyze position depth</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {rosterLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full mb-2" />
                ))}
              </CardContent>
            </Card>
          ) : roster && roster.length > 0 ? (
            <PlayerTable players={roster} onPlayerClick={handlePlayerClick} />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No roster data available
              </CardContent>
            </Card>
          )}
        </div>
        <div>
          {depthLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
              </CardHeader>
              <CardContent>
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full mb-3" />
                ))}
              </CardContent>
            </Card>
          ) : depthData ? (
            <PositionDepthChart depthData={depthData} />
          ) : null}
        </div>
      </div>

      <PlayerModal player={selectedPlayer} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
