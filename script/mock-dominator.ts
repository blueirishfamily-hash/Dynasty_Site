/**
 * Mock dominator calculation — runs the same logic as the advanced-stats route
 * with sample data to verify the formula and key parsing. Run: npx tsx script/mock-dominator.ts
 */

// --- 1. Team stats parsing (same keys as server/routes.ts getTeamStats) ---
function num(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function parseTeamStats(data: Array<Record<string, unknown>>): { netPassingYds: number; passTDs: number; rushYds: number; rushTDs: number; passAttempts: number } | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  let netPassingYds = 0,
    passTDs = 0,
    rushYds = 0,
    rushTDs = 0,
    passAttempts = 0;
  for (const row of data) {
    netPassingYds += num(row, ["net_pass_yds", "netPassingYds", "net_pass_yards"]);
    passTDs += num(row, ["pass_TDs", "passTDs", "passing_td", "passing_tds"]);
    rushYds += num(row, ["rush_yds", "rushYds", "rush_yards", "rushing_yds"]);
    rushTDs += num(row, ["rush_TDs", "rushTDs", "rushing_td", "rushing_tds"]);
    passAttempts += num(row, ["pass_atts", "passAtts", "pass_attempts", "passing_att"]);
  }
  return { netPassingYds, passTDs, rushYds, rushTDs, passAttempts };
}

// --- 2. Player stat parsing (same as server, including parseStatNumber) ---
function parseStatNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(String(value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function n(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const parsed = parseStatNumber(row[k]);
    if (parsed !== 0) return parsed;
  }
  return 0;
}

// --- 3. Dominator formula (WR/TE and RB) ---
function calcDominatorWR(
  recYds: number,
  recTDs: number,
  netPassingYds: number,
  passTDs: number
): number {
  if (netPassingYds <= 0 && passTDs <= 0) return 0;
  return (
    0.5 *
    ((netPassingYds ? recYds / netPassingYds : 0) + (passTDs ? recTDs / passTDs : 0))
  );
}

function calcDominatorRB(
  rushYds: number,
  recYds: number,
  rushTDs: number,
  recTDs: number,
  netPassingYds: number,
  rushYdsTeam: number,
  passTDs: number,
  rushTDsTeam: number
): number {
  const playerTotalYds = rushYds + recYds;
  const playerTotalTDs = rushTDs + recTDs;
  const teamTotalYds = netPassingYds + rushYdsTeam;
  const teamTotalTDs = passTDs + rushTDsTeam;
  if (teamTotalYds <= 0 && teamTotalTDs <= 0) return 0;
  return (
    0.5 *
    ((teamTotalYds ? playerTotalYds / teamTotalYds : 0) +
      (teamTotalTDs ? playerTotalTDs / teamTotalTDs : 0))
  );
}

// --- Mock data: CFBD-style one row per team (snake_case) ---
const MOCK_TEAM_STATS_ONE_ROW = [
  {
    season: 2024,
    team: "LSU",
    net_pass_yds: 4200,
    pass_TDs: 38,
    rush_yds: 2100,
    rush_TDs: 28,
    pass_atts: 520,
  },
];

// Alternative: API returns one row per category (long format) — still summed correctly?
const MOCK_TEAM_STATS_TWO_ROWS = [
  { category: "passing", net_pass_yds: 4200, pass_TDs: 38, pass_atts: 520 },
  { category: "rushing", rush_yds: 2100, rush_TDs: 28 },
];

// Player row: snake_case as in CFBD docs
const MOCK_PLAYER_WR = {
  player: "Malik Nabers",
  team: "LSU",
  position: "WR",
  receiving_yds: 1569,
  receiving_td: 14,
  rushing_yds: 0,
  rushing_td: 0,
};

const MOCK_PLAYER_WR_CAMEL = {
  player: "Malik Nabers",
  receivingYds: 1569,
  receivingTd: 14,
  rushingYds: 0,
  rushingTd: 0,
};

// Wrong keys (hypothetical API variant) — would produce 0
const MOCK_PLAYER_WR_WRONG_KEYS = {
  player: "Malik Nabers",
  receiving_yards: 1569,
  receiving_tds: 14,
};

function main() {
  console.log("=== Mock dominator calculation ===\n");

  // --- Team stats ---
  console.log("1. Team stats parsing");
  const ts1 = parseTeamStats(MOCK_TEAM_STATS_ONE_ROW as Array<Record<string, unknown>>);
  const ts2 = parseTeamStats(MOCK_TEAM_STATS_TWO_ROWS as Array<Record<string, unknown>>);
  console.log("   One row (snake_case):", ts1);
  console.log("   Two rows (passing + rushing):", ts2);
  if (!ts1 || ts1.netPassingYds === 0) {
    console.log("   FAIL: Team stats would be null or all zeros — dominator would never be set.\n");
  } else {
    console.log("   OK: Team stats parsed.\n");
  }

  // --- Player stats ---
  console.log("2. Player stats parsing (WR)");
  const row = MOCK_PLAYER_WR as Record<string, unknown>;
  const recYds = n(row, ["receiving_yds", "receivingYds", "receiving_Yds"]);
  const recTDs = n(row, ["receiving_td", "receivingTD", "receiving_TD", "receiving_Tds"]);
  const rushYds = n(row, ["rushing_yds", "rushingYds", "rushing_Yds"]);
  const rushTDs = n(row, ["rushing_td", "rushingTD", "rushing_TD", "rushing_Tds"]);
  console.log("   Snake_case row:", { recYds, recTDs, rushYds, rushTDs });

  const rowCamel = MOCK_PLAYER_WR_CAMEL as Record<string, unknown>;
  const recYdsC = n(rowCamel, ["receiving_yds", "receivingYds", "receiving_Yds"]);
  const recTDsC = n(rowCamel, ["receiving_td", "receivingTD", "receivingTd", "receiving_TD", "receiving_Tds"]);
  console.log("   CamelCase row (receivingTd):", { recYds: recYdsC, recTDs: recTDsC });
  if (recYdsC > 0 && recTDsC === 0 && (rowCamel.receivingTd ?? rowCamel.receivingTD)) {
    console.log("   -> receivingTd vs receivingTD: API may use receivingTd (lowercase d); add to key list.");
  }

  const rowWrong = MOCK_PLAYER_WR_WRONG_KEYS as Record<string, unknown>;
  const recYdsW = n(rowWrong, ["receiving_yds", "receivingYds", "receiving_Yds"]);
  const recTDsW = n(rowWrong, ["receiving_td", "receivingTD", "receiving_TD", "receiving_Tds"]);
  console.log("   Wrong keys (receiving_yards, receiving_tds):", { recYds: recYdsW, recTDs: recTDsW });
  if (recYdsW === 0 && recTDsW === 0) {
    console.log("   -> If API returns these key names, player stats would be 0 and dominator would be 0.\n");
  } else {
    console.log("");
  }

  // --- Dominator formula ---
  console.log("3. Dominator formula (WR)");
  if (ts1) {
    const dom = calcDominatorWR(recYds, recTDs, ts1.netPassingYds, ts1.passTDs);
    console.log("   WR dominator = 0.5 * (recYds/netPass + recTDs/passTDs)");
    console.log(`   = 0.5 * (${recYds}/${ts1.netPassingYds} + ${recTDs}/${ts1.passTDs})`);
    console.log(`   = 0.5 * (${(recYds / ts1.netPassingYds).toFixed(4)} + ${(recTDs / ts1.passTDs).toFixed(4)}) = ${dom.toFixed(4)}`);
    if (dom > 0) {
      console.log("   OK: dominator > 0 would be pushed to dominatorByYear.\n");
    } else {
      console.log("   FAIL: dominator is 0 so it would not be added.\n");
    }
  }

  // --- RB example ---
  console.log("4. RB dominator (mock)");
  const ts = ts1!;
  const rbRecYds = 200;
  const rbRushYds = 1100;
  const rbRecTDs = 1;
  const rbRushTDs = 12;
  const domRB = calcDominatorRB(
    rbRushYds,
    rbRecYds,
    rbRushTDs,
    rbRecTDs,
    ts.netPassingYds,
    ts.rushYds,
    ts.passTDs,
    ts.rushTDs
  );
  console.log(`   Player: rush ${rbRushYds} + rec ${rbRecYds} yds, rush ${rbRushTDs} + rec ${rbRecTDs} TDs`);
  console.log(`   Team: pass ${ts.netPassingYds} + rush ${ts.rushYds} yds, pass ${ts.passTDs} + rush ${ts.rushTDs} TDs`);
  console.log(`   Dominator = ${domRB.toFixed(4)}`);
  console.log("");

  // --- Summary ---
  console.log("=== Summary ===");
  console.log("- If team API returns different keys (e.g. no net_pass_yds), getTeamStats returns zeros or null.");
  console.log("- If player API returns different keys (e.g. receiving_yards not receiving_yds), player stats are 0.");
  console.log("- If both are correct (snake_case), formula produces dominator > 0.");
  console.log("Run the real refresh and check server logs for [AdvancedStats] Dominator missing reason diagnostics.");
}

main();
