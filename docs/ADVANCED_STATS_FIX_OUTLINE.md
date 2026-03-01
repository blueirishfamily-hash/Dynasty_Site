# Advanced Stats / Breakout Season Fix – Outline

## 1. Problem summary

- **Breakout season** is not being calculated for draft prospects.
- Breakout = first season with college dominator ≥ 20% (WR/RB) or ≥ 15% (TE).
- Likely cause: College Football Data API response shape doesn’t match what the code expects (e.g. team stats as one row per category instead of one wide row).

---

## 2. Verify API response shapes

Before changing code, confirm what the API actually returns.

### 2.1 Team stats – `GET /stats/season?year=2024&team=Ohio%20State`

- **Current assumption:** One object (or first element) with `net_pass_yds`, `pass_TDs`, `rush_yds`, `rush_TDs`, `pass_atts` (or camelCase).
- **Check:** Log the raw response in `getTeamStats` (or call the API manually).
- **If you see:** An array of objects, each with a `category` (e.g. `"passing"`, `"rushing"`) and one or two stats per row → response is **long format**. We must aggregate by team/year.

### 2.2 Player stats – `GET /stats/player/season?year=2024&team=Ohio%20State`

- **Current assumption:** Array of rows with `player` and wide stats: `receiving_yds`, `receiving_td`, `rushing_yds`, `rushing_td` (or camelCase); or long format with `category`, `statType`, `stat`.
- **Check:** Log raw response for one known player’s team/year.
- **Note:** Name matching uses `player` and `searchTerm`; confirm the API uses the same name format as `/player/search`.

---

## 3. Fixes by component

### 3.1 Team stats – `getTeamStats` (in `server/routes.ts`)

**If `/stats/season` returns one row per category:**

- Iterate over all elements of the response array.
- For each category (e.g. `"passing"`), sum or take the value for `net_pass_yds` / `pass_TDs` / `pass_atts` (or whatever keys the API uses).
- For `"rushing"`, get `rush_yds`, `rush_TDs`.
- Build a single object: `{ netPassingYds, passTDs, rushYds, rushTDs, passAttempts }` and return it.
- Keep the same return type and cache key so the rest of the route is unchanged.

**If the API uses different field names:**

- Add fallbacks in the `num()` helper or when mapping categories (e.g. `passing_yards`, `pass_attempts`).
- Document the source field names in a short comment.

### 3.2 Player stats – parsing in the advanced-stats loop

**If player stats are always in long format (category + statType + stat):**

- Don’t rely on a single “first” row for wide stats. Loop over all `rowsForPlayer` and aggregate by category/statType (e.g. receiving yards, receiving TD, rushing yards, rushing TD) then set `recYds`, `recTDs`, `rushYds`, `rushTDs`.
- Ensure the name-matching logic (e.g. `r.player` or `r.name`) matches what the API returns so `rowsForPlayer` is not empty.

**If the API returns different player name keys:**

- Use a fallback: e.g. `r.player ?? r.name ?? ""` when filtering rows for the current player.

### 3.3 School mapping

- If prospects use school names not in `SCHOOL_TO_CFBD_TEAM`, add those schools (and any aliases, e.g. `"ohio state"` → `"Ohio State"`) so `cfbdTeam` is non-null and the CFBD block runs.

### 3.4 Breakout threshold (no code change if data is correct)

- Breakout is set when `dominator >= breakoutThreshold` (0.2 or 0.15). If dominator is calculated correctly but no player ever crosses the threshold, consider lowering the threshold only after confirming the formula and data are correct.

---

## 4. Implementation order

1. Add temporary logging for `/stats/season` and `/stats/player/season` responses (or inspect via a small script).
2. Implement **team stats** aggregation (Section 3.1) if the response is per-category.
3. Adjust **player stats** parsing (Section 3.2) if the response is long or uses different keys.
4. Add or fix **school mapping** (Section 3.3) as needed.
5. Remove or reduce logging; run “Refresh advanced stats” and spot-check dominator and breakout for a few WR/TE/RB.

---

## 5. Files to touch

| File | Changes |
|------|--------|
| `server/routes.ts` | `getTeamStats`: handle per-category team response; optional: player stats aggregation and name key fallbacks; optional: add schools to `SCHOOL_TO_CFBD_TEAM`. |

---

## 6. Success criteria

- After refresh, prospects with valid school/position and CFBD data show **dominator by year** and **best dominator**.
- **Breakout season** is set when a prospect has at least one season with dominator ≥ 20% (WR/RB) or ≥ 15% (TE).
- **YPRR** (and speed score) continue to work; no regression for prospects that already had advanced stats.
