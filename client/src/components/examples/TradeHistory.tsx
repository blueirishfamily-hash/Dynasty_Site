import TradeHistory from "../TradeHistory";

export default function TradeHistoryExample() {
  // todo: remove mock functionality
  const mockTrades = [
    {
      id: "1",
      date: "Nov 28, 2024",
      teamA: {
        name: "Gridiron Kings",
        initials: "GK",
        assets: [
          { type: "player" as const, name: "CeeDee Lamb" },
        ],
      },
      teamB: {
        name: "TD Machines",
        initials: "TD",
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
        name: "Fantasy Legends",
        initials: "FL",
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

  return <TradeHistory trades={mockTrades} />;
}
