import LeagueConnect from "../LeagueConnect";

export default function LeagueConnectExample() {
  return (
    <LeagueConnect
      onConnect={(leagueId, username) => {
        console.log("Connected:", { leagueId, username });
      }}
    />
  );
}
