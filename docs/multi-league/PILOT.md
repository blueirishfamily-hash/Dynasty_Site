# Multi-league pilot (phase 6)

Order matters. Each stage has a check; don't move on until it passes. "You" is the site admin and ATL commissioner. "Claude" is a Claude Code session working from `HANDOFF.md`.

## 0. Before anything: get the branch running

1. Add `UNLOCK_SECRET` and `ADMIN_RECOVERY_KEY` to the server's `.env` (see `.env.example`), then run the `multi-league` branch the way you run `main`.
2. Open `/l/atl-dynasty/`. **Check:** ATL looks and behaves as before. Nothing asks for an invite code (ATL has none yet).
3. Open `/admin`. Set the admin passcode with the recovery key. Go to Commissioners and PINs, click New setup code for yourself in ATL, then do any commissioner action (for example open League Settings and save a harmless change) and choose your commissioner PIN with that code. **Check:** the PIN prompt opens by itself and the action then goes through.

## 1. The separate test database and the mismatch tests (done once, rerun before each release)

1. Create a second free Supabase project, only for tests.
2. Copy `.env.test.example` to `.env.test` and paste that project's **Session pooler** connection string (host ends in `pooler.supabase.com`, user is `postgres.<ref>`). The direct `db.<ref>.supabase.co` string doesn't work on many networks. `.env.test` is git-ignored.
3. Run `npm run db:push:test` (on Windows PowerShell, `npm.cmd run db:push:test` if scripts are blocked). It refuses to run if `.env.test` points at the real database.
4. Run `npm run test:db`. It starts the app, writes fake leagues to the test database, checks that nothing crosses between leagues (writes, PINs, device tokens, rules, season history) and that the season rollover works on real rows including a failure and a resume, then removes everything it created. All 20 tests passed on 2026-11-16.

**Gate: a second league goes live only after these pass.** Left out: a rollover on a copy of ATL's own 2024 to 2025 data.

## 2. The contracts-off test league

Use a league you control in Sleeper, a throwaway is fine.

1. `/admin` -> Leagues -> Add league. Enter its Sleeper league ID, check the seasons found, pick an address (for example `test-league`), an invite code, and yourself as commissioner. Leave Contracts off (new leagues start off). Save the setup code you're shown.
2. Open `/l/test-league/`. **Check:** it shows the join card (it has an invite code). Enter the code. After joining you land in the league and pick your team.
3. **No ATL data shows.** Visit each page and look for anything from ATL (team names, owners, players on ATL rosters, ATL history):
   - Dashboard, My Team, Matchup, Trade Center, Standings, Draft Board, Trophy Room, League History, Metrics, Year Recap
   - Rule Changes and Suggestions: both should be empty
   - Awards voting: empty
   - The sidebar shows no Contracts or Contracts Hub, and the Dashboard has no cap card; My Team has no contract column or cap room
   - `/l/test-league/contracts-hub` shows "Contracts are off for this league"
4. Console checks (browser DevTools, Console, while on `/l/test-league/`). Replace `TEST_ID` with the test league's current Sleeper ID. ATL's current Sleeper ID is `1389347703116267520`.
   ```js
   // Contracts off: the server refuses contract routes. Expect 403.
   await fetch('/api/league/TEST_ID/contracts').then(r => r.status)

   // ATL's league ID under the test league's address. Expect 409 (nothing is written).
   await fetch('/api/league/1389347703116267520/suggestions', { method: 'POST',
     headers: { 'Content-Type': 'application/json', 'X-League': 'test-league' }, body: '{}' }).then(r => r.status)

   // A team that isn't in the test league. Expect 403.
   await fetch('/api/league/TEST_ID/suggestions', { method: 'POST',
     headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterId: 99 }) }).then(r => r.status)
   ```
5. League Settings in the test league: turn the invite code and league PIN on and off, restart the grace period, add a co-commissioner (use the setup code), then turn Contracts on and off. **Check:** ATL's settings don't change (open ATL's League Settings and confirm).
6. In ATL, confirm nothing changed: standings, contracts, the cap, and the rules on League Settings are the same as before.

## 3. A friend's league (contracts on)

Only after stage 1's tests pass and stage 2's checks are clean.

1. `/admin` -> Add league with their Sleeper league ID. Contracts off, an invite code, their Sleeper user as commissioner. Send them: the address (`/l/<address>/`), the invite code, and their one-time setup code (valid 7 days).
2. They open the link, enter the invite code, pick their team. At their first commissioner action (League Settings is a good one) they enter the setup code and choose their PIN.
3. In League Settings -> League access they can set a league PIN. Setting it signs everyone out of the league; members join again with the code and the PIN.
4. When they turn Contracts on, the new tab **Import contracts** appears in League Settings:
   - Download the template, fill it in (one row per contract, one column per season, $M; teams by team name, owner name or roster number; players by name on that team's Sleeper roster)
   - Choose the file: it shows every row as Ready, Skipped or Problem, and cap warnings. Nothing is imported until every row is fine
   - Or enter contracts by hand with the Contracts Hub's commissioner editor
5. Their rules start as ATL's current values. They can change them in League Settings; changes apply from next season, and only the site admin can change the season in progress.

## Rolling back

- A league you added can be archived from `/admin` (Edit -> Archived). Its data is kept and its pages stop opening.
- To go back to `main`, deploy `main`. The registry tables are new, so `main` ignores them. ATL's own data was never changed.

## Known limits to remember

- Reads are open: only writes are checked for membership. The client asks for the invite code before showing a league's pages, but the API doesn't refuse reads.
- A joined device isn't tied to the team it picked (anyone who joined can act as any team for votes and bids), as the plan accepts.
- ATL's season still loads from `active_leagues`; rollover moves it together with the registry.
- The grace period (30 days after a league first gets an invite code) lets devices that haven't joined keep saving and joins them automatically. Anyone who calls the save endpoints during it is joined too.
