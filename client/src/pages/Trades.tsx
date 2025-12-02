import TradeCenter from "@/components/TradeCenter";
import TradeHistory from "@/components/TradeHistory";

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
    { id: "p6", name: "Davante Adams", position: "WR" as const, team: "NYJ" },
    { id: "p7", name: "Tank Bigsby", position: "RB" as const, team: "JAX" },
  ],
  draftPicks: [
    { id: "d1", year: 2025, round: 1 },
    { id: "d2", year: 2025, round: 2 },
    { id: "d3", year: 2025, round: 3 },
    { id: "d4", year: 2026, round: 1 },
    { id: "d5", year: 2026, round: 2 },
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
      { id: "tp5", name: "De'Von Achane", position: "RB" as const, team: "MIA" },
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
      { id: "tp6", name: "Lamar Jackson", position: "QB" as const, team: "BAL" },
      { id: "tp7", name: "Christian McCaffrey", position: "RB" as const, team: "SF" },
      { id: "tp8", name: "Tyreek Hill", position: "WR" as const, team: "MIA" },
      { id: "tp9", name: "Mark Andrews", position: "TE" as const, team: "BAL" },
    ],
    draftPicks: [
      { id: "td4", year: 2025, round: 1, originalOwner: "Champion Squad" },
      { id: "td5", year: 2026, round: 1 },
    ],
  },
  {
    teamId: "team3",
    teamName: "Champion Squad",
    teamInitials: "CS",
    players: [
      { id: "tp10", name: "Jalen Hurts", position: "QB" as const, team: "PHI" },
      { id: "tp11", name: "Jahmyr Gibbs", position: "RB" as const, team: "DET" },
      { id: "tp12", name: "Amon-Ra St. Brown", position: "WR" as const, team: "DET" },
      { id: "tp13", name: "Dallas Goedert", position: "TE" as const, team: "PHI" },
    ],
    draftPicks: [
      { id: "td6", year: 2025, round: 2 },
      { id: "td7", year: 2026, round: 1 },
      { id: "td8", year: 2026, round: 3 },
    ],
  },
];

const mockTrades = [
  {
    id: "1",
    date: "Nov 28, 2024",
    teamA: {
      name: "TD Machines",
      initials: "TD",
      assets: [
        { type: "player" as const, name: "CeeDee Lamb" },
      ],
    },
    teamB: {
      name: "Fantasy Legends",
      initials: "FL",
      assets: [
        { type: "player" as const, name: "Jaylen Waddle" },
        { type: "pick" as const, name: "2025 1st", details: "Early" },
      ],
    },
  },
  {
    id: "2",
    date: "Nov 15, 2024",
    teamA: {
      name: "Gridiron Kings",
      initials: "GK",
      assets: [
        { type: "player" as const, name: "Travis Kelce" },
        { type: "pick" as const, name: "2026 3rd" },
      ],
    },
    teamB: {
      name: "Champion Squad",
      initials: "CS",
      assets: [
        { type: "player" as const, name: "Sam LaPorta" },
        { type: "pick" as const, name: "2025 2nd" },
        { type: "pick" as const, name: "2026 2nd" },
      ],
    },
  },
  {
    id: "3",
    date: "Oct 30, 2024",
    teamA: {
      name: "Dynasty Builders",
      initials: "DB",
      assets: [
        { type: "pick" as const, name: "2025 1st" },
        { type: "pick" as const, name: "2025 2nd" },
      ],
    },
    teamB: {
      name: "Waiver Wire Warriors",
      initials: "WW",
      assets: [
        { type: "player" as const, name: "Breece Hall" },
      ],
    },
  },
];

export default function Trades() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Trade Center</h1>
        <p className="text-muted-foreground">Build and propose trades with other managers</p>
      </div>

      <TradeCenter userTeam={mockUserTeam} leagueTeams={mockLeagueTeams} />
      <TradeHistory trades={mockTrades} />
    </div>
  );
}
