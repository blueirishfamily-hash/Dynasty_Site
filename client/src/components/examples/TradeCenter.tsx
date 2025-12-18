import TradeCenter from "../TradeCenter";

export default function TradeCenterExample() {
  // todo: remove mock functionality
  const mockUserTeam = {
    teamId: "user",
    teamName: "Gridiron Kings",
    teamInitials: "GK",
    players: [
      { id: "p1", name: "Josh Allen", position: "QB" as const, team: "BUF" },
      { id: "p2", name: "Saquon Barkley", position: "RB" as const, team: "PHI" },
      { id: "p3", name: "Ja'Marr Chase", position: "WR" as const, team: "CIN" },
      { id: "p4", name: "Travis Kelce", position: "TE" as const, team: "KC" },
      { id: "p5", name: "Bijan Robinson", position: "RB" as const, team: "ATL" },
    ],
    draftPicks: [
      { id: "d1", year: 2025, round: 1 },
      { id: "d2", year: 2025, round: 2 },
      { id: "d3", year: 2026, round: 1 },
    ],
  };

  const mockLeagueTeams = [
    {
      teamId: "team1",
      teamName: "TD Machines",
      teamInitials: "TD",
      players: [
        { id: "tp1", name: "Patrick Mahomes", position: "QB" as const, team: "KC" },
        { id: "tp2", name: "Derrick Henry", position: "RB" as const, team: "BAL" },
        { id: "tp3", name: "Justin Jefferson", position: "WR" as const, team: "MIN" },
        { id: "tp4", name: "George Kittle", position: "TE" as const, team: "SF" },
      ],
      draftPicks: [
        { id: "td1", year: 2025, round: 1 },
        { id: "td2", year: 2025, round: 3 },
        { id: "td3", year: 2026, round: 2 },
      ],
    },
    {
      teamId: "team2",
      teamName: "Fantasy Legends",
      teamInitials: "FL",
      players: [
        { id: "tp5", name: "Lamar Jackson", position: "QB" as const, team: "BAL" },
        { id: "tp6", name: "Christian McCaffrey", position: "RB" as const, team: "SF" },
        { id: "tp7", name: "Tyreek Hill", position: "WR" as const, team: "MIA" },
      ],
      draftPicks: [
        { id: "td4", year: 2025, round: 1, originalOwner: "Team C" },
        { id: "td5", year: 2026, round: 1 },
      ],
    },
  ];

  return (
    <TradeCenter
      userTeam={mockUserTeam}
      leagueTeams={mockLeagueTeams}
      onProposeTrade={(userAssets, theirAssets, targetTeamId) => {
        console.log("Trade proposed to", targetTeamId, userAssets, theirAssets);
      }}
    />
  );
}
