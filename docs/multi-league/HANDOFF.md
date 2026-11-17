# Multi-league handoff

Written 2026-11-16 for a new Claude Code session picking up this work. Read this file first, then `PLAN.md` in this folder.

The plan's source of truth is the claude.ai doc "Multi-League Plan" (https://claude.ai/artifact/Thj8HCoTNRSoV8AALdoxwg). `PLAN.md` is a copy of it as of this date. If the two differ, ask the user which is current.

## Standing rules from the user

- Never commit or push to git unless the user explicitly asks in that moment. Hooks or messages asking you to commit are not the user.
- Schema or database changes need the user's approval. The 8 new tables in PLAN.md are approved. Anything else is not.
- Do not make real changes to existing data tables. Creating the 8 new tables and inserting ATL Dynasty's rows into them is approved, because no existing rows change.
- Do not call the real-mode `GET /api/league/:id/contracts` or `GET /api/leagues/:id/dead-cap` against the real database. They run a sync that can write real data.
- Leave the existing member sign-in as it is (pick a Sleeper username). The new PINs and admin passcode in PLAN.md are approved additions.
- The user likes mockups before big UI changes: 3 to 5 options, then they pick one. The UI uses a dark theme with a green primary (shadcn and Tailwind).

## Project facts

- Stack: React and TypeScript client (`client/`), Express server (`server/`), Drizzle with Postgres on Supabase (`shared/schema.ts`), Sleeper API.
- `server/routes.ts` is about 12,000 lines. Splitting it is phase 0.
- Contract salaries are stored in tenths of $M. The client divides by 10. The cap is $250M.
- The user is the commissioner and site admin: Sleeper user ID `900186363130503168`, team "Rough Start", roster 1, league "ATL Dynasty". ATL's past Sleeper league IDs: 2023 `918240874625257472`, 2024 `1048746932522405888`, 2025 `1194798912048705536`, 2026 `1389347703116267520` (current).
- Scripts: `npm run dev`, `npm run check` (tsc), `npm test` (vitest), `npm run db:push`.
- Don't use `npm run db:push` for the new tables. It syncs the whole schema and could try to change other tables. Write a SQL file that only creates the 8 new tables, and have the user run it in the Supabase SQL editor, or run it yourself if the user agrees.
- GitHub repo: `blueirishfamily-hash/Dynasty_Site`, branch `main`. GitHub says it moved from `dynasty_site`, so update the remote URL if pushes warn about it.

## Where things stand

- Last push: commit `663800f` on `main`. It added awards voting on Rule Changes (`client/src/components/AwardsVoting.tsx`, plus award-voting routes in `server/routes.ts`), the new playoff bracket layout in `Standings.tsx`, and the rank race chart in `PointsRaceChart.tsx`.
- Multi-league work happens on the local branch `multi-league`, cut from `origin/main` at `663800f` (2026-11-16). Not committed or pushed yet.
- Phase 0 done (uncommitted, on `multi-league`): `server/routes.ts` was split as a pure move into `server/routes/*.ts`, one file per area. `server/routes/index.ts` keeps `registerRoutes` and registers the area files in order. Helpers used by more than one file are in `server/routes/shared.ts`, and `COMMISSIONER_USER_IDS` and `isCommissioner` are in `server/middleware/commissioner.ts`. The largest file is `contracts.ts` at about 1,340 lines.
  - How it was checked: the same 143 method and path pairs before and after. The 12 pairs that can match the same request keep their original order. Every original line is present. The same 166 routes register at runtime. `tsc` shows the same errors as before the split. `npm test` matches the baseline.
  - Already broken before the split, still to fix: `npm run check` fails with about 60 errors, mostly TS2802 because `tsconfig.json` has no `target`. The `contractRules.test.ts` test "phase dates > null dates do not crash" fails (expected 8 to be 9).
- Phase 0 is committed as `ced5fe0e` on `multi-league`.
- Phase 1 in progress (uncommitted):
  - The 8 tables are in `shared/schema.ts`, with checks, uniques, the one-current-season index and foreign keys. `docs/multi-league/sql/001_create_league_registry.sql` creates them in one transaction, and also turns on row level security so Supabase's public Data API can't read PIN hashes. The DDL was generated from the schema by `drizzle-kit generate` offline, so the two match. The user ran it on 2026-11-16.
  - `docs/multi-league/sql/002_insert_atl_dynasty.sql` inserts ATL Dynasty: address `atl-dynasty`, contracts on, no invite code, the 2023 to 2026 season chain (2023 to 2025 checked against Sleeper), the user as owner, and 2026 rules. The 2026 Sleeper ID is read from `active_leagues`, because Claude was not allowed to query the real database. The user ran it on 2026-11-16. The 2026 ID came out as `1389347703116267520`, and Sleeper confirms its previous league is 2025.
  - `shared/leagueRules.ts` holds the `LeagueRules` type and `atlDynastyRules()`, built from today's constants. A test checks that the SQL's JSON equals it.
  - The league lookup is in `server/middleware/league.ts` (logic, testable without a database) and `server/leagueRegistry.ts` (database reads and the shared `leagueResolver`). `registerRoutes` adds it with `app.param("leagueId")`, so every `:leagueId` route sets `req.league`. It is lenient until phase 4: unregistered IDs pass through, and if the tables are missing it logs once and passes through, retrying every 60 s. An `X-League: <slug>` header that names a different league than the Sleeper ID's is refused with 409. 16 tests in `server/middleware/league.test.ts` (vitest now also runs `server/**/*.test.ts`).
  - League addresses (uncommitted):
    - `App.tsx` wraps the app in wouter's `<Route path="/l/:slug" nest>`, so links and `setLocation` stay relative and no page had to change. Old addresses redirect to `/l/<last used league, else atl-dynasty>/<same page>?<same query>`. A malformed address shows the 404 page.
    - `client/src/lib/league-address.ts` keeps the current address and wraps `fetch` to add `X-League` to same-origin `/api/` calls. It never replaces an `X-League` the caller set.
    - `SleeperProvider` takes `leagueSlug`. It asks `GET /api/registry/leagues/:slug` (`server/routes/leagues.ts`, public details only) and shows "League not found" on a 404. Its cached league is stored per address (`sleeper_league:<slug>`), and ATL falls back to the old `sleeper_league` key.
    - **For ATL, `active_leagues` still decides which Sleeper league loads**, because Settings' league switch and Advance League Year write there. Phase 5 must make rollover update `league_season_history` and then drop this exception. Until then, a new season's Sleeper ID is unregistered and passes the lenient lookup.
    - Lookup rule changed: an unregistered Sleeper ID under a real address passes in lenient mode (strict refuses it). Only an ID that belongs to another league is refused (409).
    - Checked with Vite alone (`.claude/launch.json`, "client-only"), with no API and no database. Redirects keep the page and query, sidebar links stay under the address, history deep links work, a bad slug shows 404, and there are no console errors. 8 tests in `client/src/lib/league-address.test.ts` cover the header and redirects. Not yet checked against the real API.
  - Still to do in phase 1: the mismatch tests against two test leagues (needs the test database).
  - Known gap for phase 4: the signed-in user (`sleeper_user`) is still one per device, not one per league.
- Phase 1 committed as `86e03adb` (all but the mismatch tests).
- Phase 2 built (uncommitted). Decisions made with the user:
  - New commissioners, and commissioners after a PIN reset, set their own PIN (type it, then confirm it) at their first commissioner action. There is no setup code any more: `pin_hash` is null until they do, and the first person to set it wins (`POST .../commissioner/set-pin`, audited as `commissioner_pin_set`). **Known limit:** whoever picks that commissioner's Sleeper username first can set the PIN, so a commissioner should set theirs right after being added. An old unused `setup:` value counts as no PIN. The site admin can reset a PIN (back to unset) and sees the audit log.
  - Unlocks last **until the browser closes, with no time limit**. They are HMAC-signed session cookies, signed with `UNLOCK_SECRET`. Each token carries a fingerprint of the PIN or passcode hash, so a change or reset ends old unlocks.
  - Wrong tries: 5 per device, then a 15-minute pause (device = `did` cookie). Added beyond the plan: 20 across all devices pause that secret for everyone, so clearing cookies doesn't buy more guesses.
  - The admin passcode is set the first time, or reset, with `ADMIN_RECOVERY_KEY` from `.env`. An admin unlock counts as commissioner in every league.
  - UI: PIN prompt mockup A (centered dialog with digit boxes; `inputMode="numeric"` opens the phone number pad) and admin page mockup C (tabs).
- Phase 2 code:
  - Server: `server/security/` (secrets, unlock tokens and cookies, attempts, store, guards) and `server/routes/security.ts` (unlock, set PIN, change PIN, admin unlock and passcode). `server/routes/adminLeagues.ts` adds, edits and archives leagues, manages commissioners and PIN resets, clears league PINs, and serves the audit log. `server/leagueChain.ts` walks Sleeper's previous-season links.
  - All `isCommissioner(userId)` checks are now `requireCommissioner` (or `requireCommissionerFor` when the league ID is in the body). About 15 commissioner-only routes that had no check are guarded too: generic settings POST, contract phase, FA round resolve, bidding status, assign-by-quartile, cut/trade, dead-cap writes, contract delete, set-active, roster mapping, extension undo and delete, toggle voting. The database viewer needs `requireAdmin`. `server/middleware/commissioner.ts` is deleted.
  - Advance League Year now also appends the new season to `league_season_history` and writes an audit entry, as a stopgap until phase 5.
  - Commissioner contract edits write the audit log, and the change log has a `by` field.
  - Client: `lib/unlock.ts` (fetch wrapper: on a 401 `commissioner_unlock_required` or `admin_unlock_required`, it opens the prompt and retries once; members are never prompted), `components/UnlockDialog.tsx`, `lib/commissioner.ts` (`useIsCommissioner` from the registry; falls back to the Sleeper owner if the registry can't be reached) replacing the hardcoded ID in 12 places, and `pages/Admin.tsx` at `/admin` (outside league addresses; "Site admin" in the user menu for commissioners).
  - Tests: `server/security/security.test.ts` and `guards.test.ts` (league A's unlock refused in B, resets end unlocks, admin vs commissioner). Total 60 passing; the "phase dates" failure is unchanged.
  - Checked in the browser against a throwaway mock API (now deleted): auto-prompt and retry, wrong PIN with tries left, the set-PIN flow at phone width (originally with a setup code, since replaced), and the admin page tabs. **Not yet run against the real server.**
- To go live with phase 2, the user must add `UNLOCK_SECRET` and `ADMIN_RECOVERY_KEY` to `.env` (see `.env.example`). Then: open `/admin` → set the passcode with the recovery key → Commissioners and PINs → then do any commissioner action and set their PIN at the prompt.

## Decided with the user (2026-11-16)

1. Branch: build on `multi-league`, not `main`.
2. Test database: not set up yet. Ask again before writing the phase 1 mismatch tests. Tests must never point at the real database. The plan is a second free Supabase project, with its connection string in `.env.test`.
3. ATL Dynasty's address is `atl-dynasty`. The user picks the invite code when phase 1 inserts ATL's rows.

## Next steps

1. Phase 1: write the SQL for the 8 tables, then the ATL Dynasty insert, then the shared league lookup (in `server/middleware/`).

## Phase 3 built (uncommitted, 2026-11-16)

Decisions with the user:
- All of these become editable per league and season: max contract length (5), rookie deal length (3), tag price top-N (5) and tags per team (1), extension multipliers (80/90/100/110%), extension minimum ($5M), extension limits (3 rookie with one 4-yr, 2 non-rookie), contract-length limits (2yr 5 / 3yr 4 / 4+yr 3), dead cap shares by years left, ballot points (3/2/1) and All-League teams (3). The cap, rookie scale, deadline week, RFA, pickup contract and award limits were already planned.
- Dead cap: the Contracts Hub rule (100% this season, then 0/25/50/75/100% by years left). The cut/trade route now uses it.
- Tag price: the server version (skip rookie deals, round up to $0.1M). The client copy in Contracts.tsx (`top5SalariesByPosition`) must change to match.
- Contract-length limits: bids may go over them but must be flagged in the bid form. They're enforced at round confirmation (done on the server).
- League Settings page: mockup B (tabs by topic, editing next season, with the current value under each field).

Done (server and shared, tests pass, tsc unchanged):
- `shared/leagueRules.ts` v2: the full `LeagueRules` type, ATL defaults, `validateRules`, helpers. `mergeRules` fills fields missing from older rows. `rulesForSeason` picks the latest row at or before a season.
- `shared/contractRules.ts`: optional cap, phases, pickup and dead cap share parameters, plus `checkContractLengthLimits`. `validateRoundResolution` takes length limits.
- `server/leagueRules.ts` (`rulesForSleeperLeague`) and `server/routes/leagueSettings.ts`: rules GET, PUT next, DELETE next, PUT current (admin emergency with a reason); settings GET and PATCH (contracts switch, invite code, league PIN); add or remove co-commissioners.
- `server/middleware/contractsGate.ts`: contract routes refuse when contracts are off.
- Switched to league rules: contractHubRoutes (deadline, phases, RFA, bid max years, round confirm with length limits, trades, pickup), deadCap.ts (shares, pickup), rookieContracts.ts and draft.ts (scale, rookie length), commissionerEdits (cap), routes/contracts.ts (extension price, multipliers, limits, length limits, max year, tag top-N and count, deadline messages), freeAgency cut/trade (dead cap rule).

Also done after the first pass:
- Awards on the server read the league rules: nomination limit, ballot points, result team count, All-League start year and team count (max 3; validation limits it to 1-3). The award lock date was not one of the chosen rules, so it stays hardcoded.
- Client: `client/src/lib/leagueRules.ts` provides `useLeagueRules()` (current season, falls back to ATL rules) and `useContractsEnabled()`. The rules replace all 7 `TOTAL_CAP = 250` copies and the shared `CURRENT_SEASON_CAP` imports, the rookie scale (`utils/rookiePayScale.ts` takes a scale), the dead cap copies (Contracts, TradeCenter, CommissionerEdit), the extension multipliers, limits and help text (Contracts, PlayerDetailSheet, TeamAllowances), the tag price (Contracts.tsx now matches the server: skips rookies, rounds to $0.1M, top-N), the contract-length limits, "Week 14" text, RFA and the phase list (SeasonCalendarTab, TestModeBar, ContractsHub), FA bid years, and the award constants (AwardsVoting, Awards, LeagueHub).
- Label fixes: Awards.tsx said 1st = 5 points and 2nd = 3 points; the server always scored 3/2/1. Labels now come from the rules.
- The bid form flags bids that would put the team over a contract-length limit (if this bid and the other bids all win, and if every bid wins). RoundWinsTab checks the cap and length limits the same way the server does on confirm.
- Contracts switch in the client: the sidebar hides Contracts and Contracts Hub, those pages show a notice, and the Dashboard cap card and expiring reminder, the My Team cap KPI and contract column, and the Trade Center cap impact are hidden.
- League Settings page (`/league-settings`, sidebar link for commissioners), mockup B: tabs Contracts, Extensions and tags, Dead cap and limits, Awards, League access. It edits next season by default; "this season (site admin)" mode needs a reason. League access covers the contracts switch, invite code, league PIN, co-commissioners (they set their own PIN at first use) and changing your own PIN.
- Tests: `shared/contractRulesLeague.test.ts` (length limits, round confirm, dead cap shares, pickup, trades at a league cap), `shared/leagueRules.test.ts`, `server/middleware/contractsGate.test.ts`. 81 pass; "phase dates" still fails as before. tsc is unchanged (58 errors, all pre-existing).
- Checked in the browser against a throwaway mock API (deleted): editing and saving 2027 rules asks for the PIN, then saves; unsaved changes are counted and highlighted; League access renders; contracts off hides the links and shows the notice. **Not run against the real server.**

Still open after phase 3:
- The settings routes in `server/routes/leagueSettings.ts` have no automated tests (they need the test database).
- Phase 1 mismatch tests still need the test database.

## Phase 4 built (uncommitted, 2026-11-16)

Decisions with the user: join page = mockup A (one card, steps in place); sidebar switcher = mockup B ("Your leagues" list above the pages); existing ATL devices are **grandfathered**.

How grandfathering works (a limit the user has not seen yet): the server can't tell an existing device from a stranger, so grandfathering is a **time-boxed grace period per league**, not permanent. ATL has no invite code, and a league without one isn't asked to join, so nothing changes for ATL until the commissioner sets a code. Setting the first invite code starts a 30-day grace period (`league_settings` key `join_grace_until`, under the registry league's own id). During it, a write from a device that hasn't joined joins it quietly and sets its cookie, so it is remembered when the grace period ends. The commissioner can restart or end it in League Settings → League access ("Existing devices"). After it ends, un-joined devices get `join_required` on writes and the client shows the join card. The hole during the grace period is that anyone hitting a write route with the league's Sleeper ID gets enrolled; it closes when the period ends.

Server:
- `server/sleeperGate.ts`: one queue for every Sleeper call (max 300 a minute, 8 at once), a shared cache with a lifetime by data type, dedupe of identical simultaneous calls, copies handed out, and stats. `server/sleeper.ts` goes through it (`fetchFromSleeper` is now exported, and the two direct `fetch` calls in freeAgency.ts and rosters.ts use it). Admin page, Leagues tab: "Sleeper load" card from `GET /api/admin/sleeper-stats`. Stat and projection payloads are shared as-is rather than copied, for speed.
- Devices: `server/security/membership.ts` (cookie `ld_<league id>`, only a SHA-256 of the token is stored in `league_device_access`, one token per league), `membershipStore.ts` (database deps and the grace setting), store functions in `security/store.ts`.
- `server/routes/join.ts`: `POST /api/registry/join/check` and `/join` (invite code, then league PIN if set; both rate limited, 5 wrong tries per device then a 15-minute pause), `GET /api/registry/my-leagues`, `POST /api/registry/leagues/:slug/device/team` (not called by the client yet). `GET /api/registry/leagues/:slug` now also returns `joinRequired`, `joined`, `graceActive`.
- `server/middleware/memberGate.ts`: on every write under `/api/league(s)/:id/...` and rule votes, the device must have joined (unlocked commissioner or admin counts), archived leagues refuse, and any roster the request names (body, path or query) must belong to that league (Sleeper rosters, cached; fails closed with 503 if they can't be read). Reads stay open. Unregistered leagues and an unreachable registry stay lenient. Slug-versus-Sleeper-ID mismatch is refused (409) here too.
- Changing, setting or clearing the league PIN signs out every device in the league (`revokeAllDevices`), from League Settings and the admin reset.

Client:
- `components/JoinCard.tsx` (the card; digit boxes for the league PIN open the phone number pad), `pages/Join.tsx` at `/join` (outside league addresses). A league that needs joining shows the card in place of its pages (`needsJoin` from the registry). After joining, the page reloads into the league and opens the team picker if no team is saved.
- The picked team is now stored per league (`sleeper_user:<slug>`, ATL falls back to the old `sleeper_user` key). Logging out of ATL also clears the legacy keys, which fixes the old key coming back after log out.
- `AppSidebar` has the "Your leagues" list (joined leagues plus the open one) and "Join another league".

Tests: `server/middleware/memberGate.test.ts` (19: a source scan that every write route is covered, rosters named in a request, a joined device, league A's device refused in league B, league B's Sleeper ID under league A's address, a roster from another league, rule votes, grace period enrolling, signed-out devices, archived leagues, unregistered leagues, roster lookup failing) and `server/sleeperGate.test.ts` (9). 109 tests pass; "phase dates" still fails as before. tsc unchanged (58 errors, all pre-existing). Checked in the browser against a throwaway mock API (deleted): the join card from a league link, wrong code and wrong PIN messages, a lower-case code accepted, the PIN step, joining and reload, the sidebar list. **Not run against the real server.**

Still open:
- The mismatch tests that need real data (rule, nomination and contract IDs from another league, and the PIN and rules cases against two test leagues) still need the test database. The gate's own cross-league cases are covered with fakes.
- A joined device is not bound to the team it picked, as the plan accepts ("anyone who joined can still pick any team"). The server records `roster_id` only through the unused device/team endpoint.
- The grace period start has no UI at league creation; leagues created by the admin with an invite code start with no grace period, which is right for a new league.

## Phase 5 built (uncommitted, 2026-11-16)

The season rollover (`/api/league/advance-year`) is rebuilt around the registry. The old route body is gone; `server/rollover.ts` holds the checks, the order of steps and the failure handling (database work is behind `RolloverDeps`, implemented in `server/rolloverStore.ts`).

What changed against the problems the plan listed:
- **Old league:** the league being rolled, from its address (`X-League`), using its own current row in `league_season_history`. Without the header it falls back to the site's active league, if that is registered. Commissioner PIN (or admin) required (`requireCommissioner`).
- **Previous-ID check:** the new Sleeper league's `previous_league_id` must equal the current Sleeper ID (a missing link is refused), the season must be old + 1, and the new ID must not already be in any league's season history (another league: 409 `belongs_to_other_league`; this league: `already_attached`). Team mappings are validated (known rosters, no two teams mapped to one).
- **Dry run:** `POST /api/league/advance-year/preview` runs every check and returns the plan (mappings, counts of contracts, dead cap entries, extensions and bids, the rules note) and writes nothing. Settings → League Year Advancement has a "Check first" button.
- **Atomic switch, rerunnable steps:** everything before the switch writes only the NEW league's keys or replaces the old season's own history snapshots, and each step is safe to run again: migration record (an unfinished one for the same pair is reused and its team mappings rewritten), snapshots (cleared and rewritten), contracts, dead cap and extensions (the existing clean-slate copies), Contracts Hub settings, pinned rules. The switch is ONE database transaction: season history (old to past, new current), `active_leagues` (only when the old Sleeper ID is the site-wide active league, so a second league rolling over never moves it) and the migration record to completed. A failure before it leaves the old season current, marks the migration `failed` with the step, and running it again resumes. The old season's bids and rule suggestions are only touched AFTER a successful switch, as best-effort cleanup with warnings.
- **Next season's rules:** `freezeRulesForSeason` writes a `league_rules` row for the new season (the saved 2027 rules, or the current rules carried forward), so a season never picks up later edits to an earlier one.
- Audit: `season_rolled_over` (from, to, Sleeper IDs, migration, resumed, what moved, rules saved or carried, warnings).
- `appendCurrentSeason` (the phase 2 stopgap) is removed.

Tests: `server/rollover.test.ts` (16, against an in-memory fake world): dry run writes nothing; refused when the link is wrong or missing, the ID belongs to another league, the season is wrong, or teams are unmatched or badly mapped; step order with the switch last; failure while snapshotting, copying or switching, then a resume of the same migration with nothing doubled; two leagues in the same week each moving only their own data, one failing without affecting the other, and a league unable to attach the other's new season. 125 tests pass; "phase dates" still fails as before. tsc unchanged (58 errors, all pre-existing). **Not run against the real server, and the Settings "Check first" UI was only type-checked, not opened in a browser.**

Still open:
- ATL's 2024 to 2025 rollover on a copy of the data needs the test database.
- The client still loads ATL's season from `active_leagues` (not the registry). Rollover now moves both in one transaction, so they agree, but the exception can only be dropped once Settings' "switch active league" tool (which writes `active_leagues` to view an old season) is removed or redefined.
- The year recap and metrics snapshots are fetched over HTTP from the app itself, as before; a failure there is non-fatal.

## Phase 6 in progress (uncommitted, 2026-11-16)

Decisions with the user: new leagues start with contracts OFF (already the case); when a league turns contracts on, the commissioner can enter contracts by hand or upload a CSV; the CSV has **one column per season**; the separate test database comes **first** (the user creates it, then the mismatch tests are written and run before any friend's league is added); the user will supply a Sleeper ID for the contracts-off test league.

Built:
- **Starting-contracts CSV import.** `server/contractImport.ts` (pure: parse, match, validate; 12 tests) and `POST /api/league/:leagueId/contracts/import` in `server/routes/contracts.ts` (commissioner PIN; `dryRun` is the default; real import only when every row is fine; upserts, so a rerun finishes a partial import; audit entry `contracts_imported`). League Settings has an **Import contracts** tab (only when contracts are on) with a template download, a preview of every row (Ready, Skipped, Problem) with messages, cap warnings (not a block), and skip or replace for players who already have a contract. Teams match by team name, owner name or roster number; players by name on that team's Sleeper roster, or by a `player_id` column; the seasons allowed are the current season through the league's max contract length. The route is under `/contracts/`, so the contracts switch and the route-coverage tests cover it. **Only type-checked and unit-tested; the tab was not opened in a browser and the route was not run against the real server.**
- **Test database setup, guarded.** `server/testDb.ts` (`resolveTestDatabaseUrl`, 7 tests) refuses a test URL that matches the real one in `.env` or the shell (same host, database and user). `npm run db:push:test` (`script/test-db.ts`) pushes the full schema, including the registry tables, to the database in `.env.test` and passes drizzle only that URL. `.env.test` is now in `.gitignore` (it wasn't), and `.env.test.example` explains it. Verified it refuses without a `.env.test`.
- **`docs/multi-league/PILOT.md`**: the ordered runbook (get the branch running and set the passcode and PIN, the test database and what the mismatch tests must cover, the contracts-off test league with a page-by-page "no ATL data" checklist and three console checks that are safe to run, the friend's league, rolling back, known limits).

Database tests (done 2026-11-16). The user created the test Supabase project and ran `npm run db:push:test` with the Session pooler string (the direct `db.<ref>.supabase.co` host is IPv6-only and failed with ENOTFOUND). On Windows PowerShell use `npm.cmd` if scripts are blocked.
- `npm run test:db` (`vitest.integration.config.ts`, `server/integration/harness.ts`, `server/integration/multiLeague.itest.ts`, 20 tests). It starts the real Express app on a free port with every route, uses the test database from `.env.test` (refuses the real one), fakes Sleeper by replacing the global fetch (the Sleeper gate calls it at call time), gives each simulated device its own cookie jar, seeds fake leagues, and removes everything it created (it checks the leftovers itself). It skips itself without `.env.test`. `*.itest.ts` files are excluded from `tsc` and from `npm test`.
- Covers: every league write route called with league A's address and league B's Sleeper ID (all 409), and with A's device and unlocked commissioner but no address (all 403 join_required); rule votes checked against the rule's own league; a team from another league refused; ballots can't use another league's nominations (with a control that works); A's commissioner can't delete B's contract; A's commissioner unlock and device token refused in B (under either cookie name); wrong PINs counted and paused per device; invite codes only open their own league; rules saved in A leave B and A's current season unchanged; the contracts switch is per league; the database refuses a Sleeper ID owned by another league and a second current season; the admin can't add a league whose seasons exist; a rollover can't attach another league's season, including a valid renewed one.
- The rollover on real rows: a dry run writes nothing; a failure while saving history switches nothing and marks the migration failed; running again resumes the same migration; contracts move to the swapped rosters; dead cap is copied; history is saved once, not doubled; the new season's rules are pinned; active_leagues is untouched; the audit entry is written; running it again is refused. Two leagues rolling over at once each move only their own data.
- They found no app bugs. The data is fake and Sleeper is faked, so they don't prove anything about real Sleeper responses.

Not done, and why:
- A rollover run on a copy of ATL's real 2024 to 2025 data: needs ATL's rows exported into the test database (the user would have to do that; don't read the real database yourself).
- Test league and friend's league: need the user (admin page, real database).
- Do not run anything against the real database yourself; the permission system denied that earlier in this project.

Tests: 144 pass; "phase dates" still fails as before. tsc unchanged (58 errors, all pre-existing).
