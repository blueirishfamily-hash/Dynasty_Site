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

## Decided with the user (2026-11-16)

1. Branch: build on `multi-league`, not `main`.
2. Test database: not set up yet. Ask again before writing the phase 1 mismatch tests. Tests must never point at the real database. The plan is a second free Supabase project, with its connection string in `.env.test`.
3. ATL Dynasty's address is `atl-dynasty`. The user picks the invite code when phase 1 inserts ATL's rows.

## Next steps

1. Phase 1: write the SQL for the 8 tables, then the ATL Dynasty insert, then the shared league lookup (in `server/middleware/`).
