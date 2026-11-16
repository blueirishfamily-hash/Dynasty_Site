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
- The user is the commissioner and site admin: Sleeper user ID `900186363130503168`, team "Rough Start", roster 1, league "ATL Dynasty". ATL's past Sleeper league IDs: 2023 `918240874625257472`, 2024 `1048746932522405888`, 2025 `1194798912048705536`.
- Scripts: `npm run dev`, `npm run check` (tsc), `npm test` (vitest), `npm run db:push`.
- Don't use `npm run db:push` for the new tables. It syncs the whole schema and could try to change other tables. Write a SQL file that only creates the 8 new tables, and have the user run it in the Supabase SQL editor, or run it yourself if the user agrees.
- GitHub repo: `blueirishfamily-hash/Dynasty_Site`, branch `main`. GitHub says it moved from `dynasty_site`, so update the remote URL if pushes warn about it.

## Where things stand

- Last push: commit `663800f` on `main`. It added awards voting on Rule Changes (`client/src/components/AwardsVoting.tsx`, plus award-voting routes in `server/routes.ts`), the new playoff bracket layout in `Standings.tsx`, and the rank race chart in `PointsRaceChart.tsx`.
- Multi-league work happens on the local branch `multi-league`, cut from `origin/main` at `663800f` (2026-11-16). Not committed or pushed yet.
- Phase 0 done (uncommitted, on `multi-league`): `server/routes.ts` was split as a pure move into `server/routes/*.ts`, one file per area. `server/routes/index.ts` keeps `registerRoutes` and registers the area files in order. Helpers used by more than one file are in `server/routes/shared.ts`, and `COMMISSIONER_USER_IDS` and `isCommissioner` are in `server/middleware/commissioner.ts`. The largest file is `contracts.ts` at about 1,340 lines.
  - How it was checked: the same 143 method and path pairs before and after. The 12 pairs that can match the same request keep their original order. Every original line is present. The same 166 routes register at runtime. `tsc` shows the same errors as before the split. `npm test` matches the baseline.
  - Already broken before the split, still to fix: `npm run check` fails with about 60 errors, mostly TS2802 because `tsconfig.json` has no `target`. The `contractRules.test.ts` test "phase dates > null dates do not crash" fails (expected 8 to be 9).
- Phases 1 to 6 not started.

## Decided with the user (2026-11-16)

1. Branch: build on `multi-league`, not `main`.
2. Test database: not set up yet. Ask again before writing the phase 1 mismatch tests. Tests must never point at the real database. The plan is a second free Supabase project, with its connection string in `.env.test`.
3. ATL Dynasty's address is `atl-dynasty`. The user picks the invite code when phase 1 inserts ATL's rows.

## Next steps

1. Phase 1: write the SQL for the 8 tables, then the ATL Dynasty insert, then the shared league lookup (in `server/middleware/`).
