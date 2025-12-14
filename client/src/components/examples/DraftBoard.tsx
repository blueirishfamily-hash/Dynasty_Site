import DraftBoard from "../DraftBoard";

export default function DraftBoardExample() {
  // todo: remove mock functionality
  const teams = [
    { name: "Gridiron Kings", initials: "GK" },
    { name: "TD Machines", initials: "TD" },
    { name: "Fantasy Legends", initials: "FL" },
    { name: "Champion Squad", initials: "CS" },
    { name: "Dynasty Builders", initials: "DB" },
    { name: "Waiver Wire Warriors", initials: "WW" },
  ];

  const mockPicks = [];

  for (let round = 1; round <= 4; round++) {
    for (let pick = 1; pick <= 6; pick++) {
      const originalTeam = teams[(pick - 1) % teams.length];
      const isTraded = Math.random() > 0.7;
      const currentTeam = isTraded
        ? teams[Math.floor(Math.random() * teams.length)]
        : originalTeam;

      const hasPlayer = round <= 2;
      const positions = ["QB", "RB", "WR", "TE"];
      const names = [
        "Caleb Williams", "Marvin Harrison", "Malik Nabers", "Rome Odunze",
        "Brock Bowers", "Xavier Worthy", "Brian Thomas", "Keon Coleman",
        "Bo Nix", "Jonathon Brooks", "Blake Corum", "Troy Franklin",
        "Ladd McConkey", "Jayden Daniels", "Drake Maye", "Michael Penix",
        "Trey Benson", "Ray Davis", "Ja'Lynn Polk", "Jalen McMillan",
        "Roman Wilson", "Xavier Legette", "Adonai Mitchell", "Brian Thomas Jr",
      ];

      mockPicks.push({
        round,
        pick,
        originalOwner: originalTeam,
        currentOwner: currentTeam,
        isUserPick: currentTeam.initials === "GK",
        player: hasPlayer
          ? { 
              name: names[(round - 1) * 6 + pick - 1] || "TBD",
              position: positions[Math.floor(Math.random() * positions.length)],
            }
          : undefined,
      });
    }
  }

  return (
    <DraftBoard
      year={2025}
      picks={mockPicks}
      totalRounds={4}
      teamsCount={6}
      viewMode="current"
    />
  );
}
