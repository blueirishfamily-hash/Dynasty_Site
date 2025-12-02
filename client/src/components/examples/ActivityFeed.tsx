import ActivityFeed from "../ActivityFeed";

export default function ActivityFeedExample() {
  // todo: remove mock functionality
  const mockTransactions = [
    {
      id: "1",
      type: "trade" as const,
      teamName: "Gridiron Kings",
      teamInitials: "GK",
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
      teamName: "TD Machines",
      teamInitials: "TD",
      description: "Won waiver claim for $12 FAAB",
      timestamp: "5h ago",
      players: [{ name: "Tank Bigsby", action: "added" as const }],
    },
    {
      id: "3",
      type: "add" as const,
      teamName: "Fantasy Legends",
      teamInitials: "FL",
      description: "Added from free agency",
      timestamp: "1d ago",
      players: [{ name: "Marvin Harrison Jr", action: "added" as const }],
    },
    {
      id: "4",
      type: "drop" as const,
      teamName: "Champion Squad",
      teamInitials: "CS",
      description: "Released to waivers",
      timestamp: "2d ago",
      players: [{ name: "Zay Flowers", action: "dropped" as const }],
    },
  ];

  return <ActivityFeed transactions={mockTransactions} />;
}
