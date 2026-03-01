/**
 * Sample CFBD API response to see how /stats/player/season returns player names.
 * Run: npx tsx script/cfbd-name-sample.ts
 * Requires: COLLEGE_FOOTBALL_DATA_API_KEY in env (or .env)
 */
import "dotenv/config";

const CFBD_BASE = "https://api.collegefootballdata.com";
const apiKey = process.env.COLLEGE_FOOTBALL_DATA_API_KEY;

async function main() {
  if (!apiKey) {
    console.log("No COLLEGE_FOOTBALL_DATA_API_KEY set. Set it in .env to run this script.");
    console.log("Alternatively, run 'Refresh advanced stats' in the app and grep server logs for [CFBD name debug].");
    process.exit(1);
  }
  for (const team of ["LSU", "Ohio State"]) {
    const url = `${CFBD_BASE}/stats/player/season?year=2024&team=${encodeURIComponent(team)}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!r.ok) {
      console.error("CFBD request failed:", r.status, await r.text());
      process.exit(1);
    }
    const data = (await r.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data)) {
      console.error("Unexpected response type");
      process.exit(1);
    }
    const byPlayer = new Map<string, unknown>();
    for (const row of data) {
      const p = (row as Record<string, unknown>).player;
      if (p != null && typeof p === "string") byPlayer.set(p, row);
    }
    console.log(`[CFBD name sample] year=2024 team=${team} (${data.length} rows, ${byPlayer.size} unique player names)`);
    const names = Array.from(byPlayer.keys()).slice(0, 15);
    for (let i = 0; i < names.length; i++) {
      console.log(`  ${i + 1}. player: ${JSON.stringify(names[i])}`);
    }
    console.log("");
  }
  console.log("Conclusion: stats API uses 'player' field; format is 'First Last' or 'First Last Jr./III'.\n");

  // Player search - what name format does it return?
  const searchUrl = `${CFBD_BASE}/player/search?searchTerm=Malik%20Nabers&team=LSU&year=2025`;
  const sr = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (sr.ok) {
    const searchData = (await sr.json()) as Array<Record<string, unknown>>;
    console.log("[CFBD name sample] GET /player/search (Malik Nabers, LSU, 2025) - first 5 results:");
    for (let i = 0; i < Math.min(5, searchData.length); i++) {
      const row = searchData[i] as Record<string, unknown>;
      console.log(`  ${i + 1}. name: ${JSON.stringify(row.name)}  first_name: ${JSON.stringify(row.first_name ?? row.firstName)}  last_name: ${JSON.stringify(row.last_name ?? row.lastName)}`);
    }
  }
}

main();
