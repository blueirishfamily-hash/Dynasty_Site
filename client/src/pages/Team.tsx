import { useState } from "react";
import PlayerTable from "@/components/PlayerTable";
import PositionDepthChart from "@/components/PositionDepthChart";
import PlayerModal from "@/components/PlayerModal";

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
type RosterStatus = "starter" | "bench" | "taxi" | "ir";

interface Player {
  id: string;
  name: string;
  position: Position;
  team: string;
  age: number;
  status: RosterStatus;
  seasonPoints: number;
  weeklyAvg: number;
  positionRank: number;
}

// todo: remove mock functionality
const mockPlayers: Player[] = [
  { id: "1", name: "Josh Allen", position: "QB", team: "BUF", age: 28, status: "starter", seasonPoints: 285.4, weeklyAvg: 25.9, positionRank: 2 },
  { id: "2", name: "Saquon Barkley", position: "RB", team: "PHI", age: 27, status: "starter", seasonPoints: 245.2, weeklyAvg: 22.3, positionRank: 3 },
  { id: "3", name: "Ja'Marr Chase", position: "WR", team: "CIN", age: 24, status: "starter", seasonPoints: 232.8, weeklyAvg: 21.2, positionRank: 1 },
  { id: "4", name: "Travis Kelce", position: "TE", team: "KC", age: 34, status: "starter", seasonPoints: 168.5, weeklyAvg: 15.3, positionRank: 2 },
  { id: "5", name: "Bijan Robinson", position: "RB", team: "ATL", age: 22, status: "starter", seasonPoints: 198.7, weeklyAvg: 18.1, positionRank: 8 },
  { id: "6", name: "Davante Adams", position: "WR", team: "NYJ", age: 31, status: "bench", seasonPoints: 145.3, weeklyAvg: 13.2, positionRank: 18 },
  { id: "7", name: "Marvin Harrison Jr", position: "WR", team: "ARI", age: 22, status: "taxi", seasonPoints: 112.4, weeklyAvg: 10.2, positionRank: 28 },
  { id: "8", name: "Tank Bigsby", position: "RB", team: "JAX", age: 23, status: "bench", seasonPoints: 89.6, weeklyAvg: 8.1, positionRank: 24 },
  { id: "9", name: "Tua Tagovailoa", position: "QB", team: "MIA", age: 26, status: "bench", seasonPoints: 180.2, weeklyAvg: 16.4, positionRank: 12 },
  { id: "10", name: "Cole Kmet", position: "TE", team: "CHI", age: 25, status: "bench", seasonPoints: 72.3, weeklyAvg: 6.6, positionRank: 15 },
];

const mockDepthData = {
  QB: {
    grade: "A",
    players: [
      { id: "1", name: "Josh Allen", team: "BUF", points: 285.4, medianPoints: 220, percentAboveMedian: 30 },
      { id: "9", name: "Tua Tagovailoa", team: "MIA", points: 180.2, medianPoints: 220, percentAboveMedian: -18 },
    ],
  },
  RB: {
    grade: "B+",
    players: [
      { id: "2", name: "Saquon Barkley", team: "PHI", points: 245.2, medianPoints: 150, percentAboveMedian: 63 },
      { id: "5", name: "Bijan Robinson", team: "ATL", points: 198.7, medianPoints: 150, percentAboveMedian: 32 },
      { id: "8", name: "Tank Bigsby", team: "JAX", points: 89.6, medianPoints: 150, percentAboveMedian: -40 },
    ],
  },
  WR: {
    grade: "A-",
    players: [
      { id: "3", name: "Ja'Marr Chase", team: "CIN", points: 232.8, medianPoints: 140, percentAboveMedian: 66 },
      { id: "6", name: "Davante Adams", team: "NYJ", points: 145.3, medianPoints: 140, percentAboveMedian: 4 },
      { id: "7", name: "Marvin Harrison Jr", team: "ARI", points: 112.4, medianPoints: 140, percentAboveMedian: -20 },
    ],
  },
  TE: {
    grade: "C+",
    players: [
      { id: "4", name: "Travis Kelce", team: "KC", points: 168.5, medianPoints: 100, percentAboveMedian: 68 },
      { id: "10", name: "Cole Kmet", team: "CHI", points: 72.3, medianPoints: 100, percentAboveMedian: -28 },
    ],
  },
};

type ModalPosition = "QB" | "RB" | "WR" | "TE";

const getPlayerDetails = (player: Player) => ({
  id: player.id,
  name: player.name,
  position: player.position as ModalPosition,
  team: player.team,
  age: player.age,
  seasonPoints: player.seasonPoints,
  weeklyAvg: player.weeklyAvg,
  positionRank: player.positionRank,
  weeklyStats: Array.from({ length: 11 }, (_, i) => ({
    week: i + 1,
    points: player.weeklyAvg + (Math.random() - 0.5) * 15,
  })),
  news: [
    `${player.name} had a strong performance in the recent game`,
    `${player.team} offense continues to feature ${player.name} heavily`,
  ],
  schedule: [
    { week: 12, opponent: "KC", isHome: true },
    { week: 13, opponent: "SF", isHome: false },
    { week: 14, opponent: "LAR", isHome: true },
    { week: 15, opponent: "DET", isHome: false },
  ],
});

export default function Team() {
  const [selectedPlayer, setSelectedPlayer] = useState<ReturnType<typeof getPlayerDetails> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handlePlayerClick = (player: Player) => {
    setSelectedPlayer(getPlayerDetails(player));
    setModalOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">My Team</h1>
        <p className="text-muted-foreground">Manage your roster and analyze position depth</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PlayerTable players={mockPlayers} onPlayerClick={handlePlayerClick} />
        </div>
        <div>
          <PositionDepthChart depthData={mockDepthData} />
        </div>
      </div>

      <PlayerModal player={selectedPlayer} open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
