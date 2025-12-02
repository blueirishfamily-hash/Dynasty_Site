import DraftBoard from "@/components/DraftBoard";

// todo: remove mock functionality
const teams = [
  { name: "Gridiron Kings", initials: "GK" },
  { name: "TD Machines", initials: "TD" },
  { name: "Fantasy Legends", initials: "FL" },
  { name: "Champion Squad", initials: "CS" },
  { name: "Dynasty Builders", initials: "DB" },
  { name: "Waiver Wire Warriors", initials: "WW" },
  { name: "Playoff Bound", initials: "PB" },
  { name: "Tank Commander", initials: "TC" },
  { name: "Trade Master", initials: "TM" },
  { name: "Rookie Hunters", initials: "RH" },
  { name: "Sleeper Elite", initials: "SE" },
  { name: "Dynasty Dominators", initials: "DD" },
];

const generateMockPicks = () => {
  const picks = [];
  const positions = ["QB", "RB", "WR", "TE"];
  const names = [
    "Caleb Williams", "Marvin Harrison", "Malik Nabers", "Rome Odunze",
    "Brock Bowers", "Xavier Worthy", "Brian Thomas", "Keon Coleman",
    "Bo Nix", "Jonathon Brooks", "Blake Corum", "Troy Franklin",
    "Ladd McConkey", "Jayden Daniels", "Drake Maye", "Michael Penix",
    "Trey Benson", "Ray Davis", "Ja'Lynn Polk", "Jalen McMillan",
    "Roman Wilson", "Xavier Legette", "Adonai Mitchell", "Brian Thomas Jr",
    "Ricky Pearsall", "Luke McCaffrey", "MarShawn Lloyd", "Bucky Irving",
    "Cade Otton", "Dalton Kincaid", "Will Levis", "JJ McCarthy",
    "Jaylen Wright", "Tyjae Spears", "Tyler Allgeier", "Rashod Bateman",
    "Quentin Johnston", "Jordan Addison", "Zay Flowers", "Michael Wilson",
    "Dontayvion Wicks", "Tank Dell", "Josh Downs", "Rashee Rice",
    "Jaxon Smith-Njigba", "Jayden Reed", "Romeo Doubs", "Wan'Dale Robinson",
  ];

  for (let round = 1; round <= 4; round++) {
    for (let pick = 1; pick <= 12; pick++) {
      const originalTeam = teams[(pick - 1) % teams.length];
      const isTraded = Math.random() > 0.75;
      const currentTeam = isTraded
        ? teams[Math.floor(Math.random() * teams.length)]
        : originalTeam;

      const hasPlayer = round <= 2;
      const nameIndex = (round - 1) * 12 + pick - 1;

      picks.push({
        round,
        pick,
        originalOwner: originalTeam,
        currentOwner: currentTeam,
        isUserPick: currentTeam.initials === "GK",
        player: hasPlayer && names[nameIndex]
          ? {
              name: names[nameIndex],
              position: positions[Math.floor(Math.random() * positions.length)],
            }
          : undefined,
      });
    }
  }
  return picks;
};

export default function Draft() {
  const mockPicks = generateMockPicks();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold">Draft Board</h1>
        <p className="text-muted-foreground">View draft capital and track pick ownership</p>
      </div>

      <DraftBoard
        year={2025}
        picks={mockPicks}
        totalRounds={4}
        teamsCount={12}
        viewMode="current"
      />
    </div>
  );
}
