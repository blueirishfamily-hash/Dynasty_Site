import { useState } from "react";
import PlayerModal from "../PlayerModal";
import { Button } from "@/components/ui/button";

export default function PlayerModalExample() {
  const [open, setOpen] = useState(true);

  // todo: remove mock functionality
  const mockPlayer = {
    id: "1",
    name: "Josh Allen",
    position: "QB" as const,
    team: "BUF",
    age: 28,
    seasonPoints: 285.4,
    weeklyAvg: 25.9,
    positionRank: 2,
    weeklyStats: [
      { week: 1, points: 28.5 },
      { week: 2, points: 22.3 },
      { week: 3, points: 31.2 },
      { week: 4, points: 18.7 },
      { week: 5, points: 26.4 },
      { week: 6, points: 24.8 },
      { week: 7, points: 29.1 },
      { week: 8, points: 21.5 },
      { week: 9, points: 27.8 },
      { week: 10, points: 32.4 },
      { week: 11, points: 22.7 },
    ],
    news: [
      "Josh Allen completed 28 of 34 passes for 312 yards and 3 touchdowns in Week 11 victory",
      "Allen is on pace for his best fantasy season, averaging nearly 26 fantasy points per game",
      "The Bills offense continues to dominate, with Allen as the centerpiece of their attack",
    ],
    schedule: [
      { week: 12, opponent: "KC", isHome: true },
      { week: 13, opponent: "SF", isHome: false },
      { week: 14, opponent: "LAR", isHome: true },
      { week: 15, opponent: "DET", isHome: false },
      { week: 16, opponent: "NE", isHome: true },
      { week: 17, opponent: "NYJ", isHome: false },
      { week: 18, opponent: "MIA", isHome: true },
    ],
  };

  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)} data-testid="button-open-modal">
        Open Player Modal
      </Button>
      <PlayerModal player={mockPlayer} open={open} onOpenChange={setOpen} />
    </div>
  );
}
