import StandingsTable from "../StandingsTable";

export default function StandingsTableExample() {
  // todo: remove mock functionality
  const mockStandings = [
    { rank: 1, name: "Gridiron Kings", initials: "GK", wins: 9, losses: 2, pointsFor: 1542.3, pointsAgainst: 1298.7, streak: "W4", trend: [120, 145, 132, 158, 142], isUser: true },
    { rank: 2, name: "TD Machines", initials: "TD", wins: 8, losses: 3, pointsFor: 1498.1, pointsAgainst: 1345.2, streak: "W2", trend: [135, 128, 142, 138, 155] },
    { rank: 3, name: "Fantasy Legends", initials: "FL", wins: 7, losses: 4, pointsFor: 1456.8, pointsAgainst: 1389.4, streak: "L1", trend: [142, 151, 138, 145, 128] },
    { rank: 4, name: "Champion Squad", initials: "CS", wins: 6, losses: 5, pointsFor: 1412.5, pointsAgainst: 1401.3, streak: "W1", trend: [128, 135, 142, 125, 148] },
    { rank: 5, name: "Dynasty Builders", initials: "DB", wins: 5, losses: 6, pointsFor: 1378.2, pointsAgainst: 1425.8, streak: "L3", trend: [145, 138, 125, 118, 112] },
    { rank: 6, name: "Waiver Wire Warriors", initials: "WW", wins: 4, losses: 7, pointsFor: 1345.9, pointsAgainst: 1456.1, streak: "L2", trend: [132, 125, 138, 122, 115] },
  ];

  return <StandingsTable standings={mockStandings} />;
}
