import PlayerTable from "../PlayerTable";

export default function PlayerTableExample() {
  // todo: remove mock functionality
  const mockPlayers = [
    { id: "1", name: "Josh Allen", position: "QB" as const, team: "BUF", age: 28, status: "starter" as const, seasonPoints: 285.4, weeklyAvg: 25.9, positionRank: 2 },
    { id: "2", name: "Saquon Barkley", position: "RB" as const, team: "PHI", age: 27, status: "starter" as const, seasonPoints: 245.2, weeklyAvg: 22.3, positionRank: 3 },
    { id: "3", name: "Ja'Marr Chase", position: "WR" as const, team: "CIN", age: 24, status: "starter" as const, seasonPoints: 232.8, weeklyAvg: 21.2, positionRank: 1 },
    { id: "4", name: "Travis Kelce", position: "TE" as const, team: "KC", age: 34, status: "starter" as const, seasonPoints: 168.5, weeklyAvg: 15.3, positionRank: 2 },
    { id: "5", name: "Bijan Robinson", position: "RB" as const, team: "ATL", age: 22, status: "starter" as const, seasonPoints: 198.7, weeklyAvg: 18.1, positionRank: 8 },
    { id: "6", name: "Davante Adams", position: "WR" as const, team: "NYJ", age: 31, status: "bench" as const, seasonPoints: 145.3, weeklyAvg: 13.2, positionRank: 18 },
    { id: "7", name: "Marvin Harrison Jr", position: "WR" as const, team: "ARI", age: 22, status: "taxi" as const, seasonPoints: 112.4, weeklyAvg: 10.2, positionRank: 28 },
    { id: "8", name: "Tank Bigsby", position: "RB" as const, team: "JAX", age: 23, status: "bench" as const, seasonPoints: 89.6, weeklyAvg: 8.1, positionRank: 24 },
  ];

  return (
    <PlayerTable
      players={mockPlayers}
      onPlayerClick={(player) => console.log("Player clicked:", player.name)}
    />
  );
}
