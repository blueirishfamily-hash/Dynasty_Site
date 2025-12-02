import MatchupPreview from "../MatchupPreview";

export default function MatchupPreviewExample() {
  // todo: remove mock functionality
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

  return <MatchupPreview week={12} userTeam={mockUserTeam} opponent={mockOpponent} />;
}
