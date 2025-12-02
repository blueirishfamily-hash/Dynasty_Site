import ActivityFeed from "@/components/ActivityFeed";
import MatchupPreview from "@/components/MatchupPreview";
import StandingsTable from "@/components/StandingsTable";

// todo: remove mock functionality
const mockTransactions = [
  {
    id: "1",
    type: "trade" as const,
    teamName: "TD Machines",
    teamInitials: "TD",
    description: "Traded CeeDee Lamb for 2025 1st + Jaylen Waddle",
    timestamp: "2h ago",
    players: [
      { name: "CeeDee Lamb", action: "dropped" as const },
      { name: "Jaylen Waddle", action: "added" as const },
    ],
  },
  {
    id: "2",
    type: "waiver" as const,
    teamName: "Fantasy Legends",
    teamInitials: "FL",
    description: "Won waiver claim for $12 FAAB",
    timestamp: "5h ago",
    players: [{ name: "Tank Bigsby", action: "added" as const }],
  },
  {
    id: "3",
    type: "add" as const,
    teamName: "Champion Squad",
    teamInitials: "CS",
    description: "Added from free agency",
    timestamp: "1d ago",
    players: [{ name: "Marvin Harrison Jr", action: "added" as const }],
  },
  {
    id: "4",
    type: "drop" as const,
    teamName: "Dynasty Builders",
    teamInitials: "DB",
    description: "Released to waivers",
    timestamp: "2d ago",
    players: [{ name: "Zay Flowers", action: "dropped" as const }],
  },
];

const mockUserTeam = {
  name: "Gridiron Kings",
  initials: "GK",
  projectedScore: 142.5,
  record: "8-3",
  starters: ["Josh Allen", "Saquon Barkley", "Ja'Marr Chase", "Davante Adams", "Travis Kelce"],
};

const mockOpponent = {
  name: "TD Machines",
  initials: "TD",
  projectedScore: 128.3,
  record: "6-5",
  starters: ["Patrick Mahomes", "Derrick Henry", "Justin Jefferson", "Tyreek Hill", "George Kittle"],
};

const mockStandings = [
  { rank: 1, name: "Gridiron Kings", initials: "GK", wins: 9, losses: 2, pointsFor: 1542.3, pointsAgainst: 1298.7, streak: "W4", trend: [120, 145, 132, 158, 142], isUser: true },
  { rank: 2, name: "TD Machines", initials: "TD", wins: 8, losses: 3, pointsFor: 1498.1, pointsAgainst: 1345.2, streak: "W2", trend: [135, 128, 142, 138, 155] },
  { rank: 3, name: "Fantasy Legends", initials: "FL", wins: 7, losses: 4, pointsFor: 1456.8, pointsAgainst: 1389.4, streak: "L1", trend: [142, 151, 138, 145, 128] },
  { rank: 4, name: "Champion Squad", initials: "CS", wins: 6, losses: 5, pointsFor: 1412.5, pointsAgainst: 1401.3, streak: "W1", trend: [128, 135, 142, 125, 148] },
  { rank: 5, name: "Dynasty Builders", initials: "DB", wins: 5, losses: 6, pointsFor: 1378.2, pointsAgainst: 1425.8, streak: "L3", trend: [145, 138, 125, 118, 112] },
  { rank: 6, name: "Waiver Wire Warriors", initials: "WW", wins: 4, losses: 7, pointsFor: 1345.9, pointsAgainst: 1456.1, streak: "L2", trend: [132, 125, 138, 122, 115] },
];

export default function Dashboard() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, here's what's happening in your league</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <MatchupPreview week={12} userTeam={mockUserTeam} opponent={mockOpponent} />
          <StandingsTable standings={mockStandings} />
        </div>
        <div>
          <ActivityFeed transactions={mockTransactions} />
        </div>
      </div>
    </div>
  );
}
