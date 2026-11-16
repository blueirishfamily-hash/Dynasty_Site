# Multi-League Plan

Copy of the claude.ai doc as of Nov 16, 2026. Source: https://claude.ai/artifact/Thj8HCoTNRSoV8AALdoxwg

## Summary

One site will host many leagues. You, as site admin, are the only person who can add a league. After that, the league's commissioner runs it.

**Decisions made**

- **Adding leagues:** only the site admin adds or archives leagues.
- **Running a league:** the commissioner controls everything inside it, including co-commissioners, voting windows, settings, the invite code and the league PIN.
- **Contracts:** each league turns contracts on or off, and sets its own contract rules in Settings. Rule changes take effect next season and apply only to the league that saved them. Only the site admin can push an emergency change into the current season.
- **Joining:** there is no public list of leagues. A league appears only after someone enters its invite code, which the commissioner sets. The commissioner can also require a league PIN.
- **PINs:** commissioner actions need a commissioner PIN. Each commissioner and co-commissioner sets their own, and changes record whose PIN was used. Site admin actions need an admin passcode that you set. The site admin can reset any PIN.
- **Addresses:** each league has its own address in links (`/l/atl-dynasty/standings`). A device can join several leagues and switch between them.

**What stays the same:** nearly every table already stores a Sleeper league ID, so ATL Dynasty's data is linked to the new league registry, never rewritten. ATL's current rules become its saved settings, so nothing changes for your league on day one.

## Roles and permissions

There are three roles: site admin (you), commissioner (per league) and member (per league). Today the commissioner check is your Sleeper user ID, hardcoded in about 32 places. It becomes a per-league list in the database.

| Action | Site admin (needs admin passcode) | Commissioner (needs commissioner PIN) | Member |
| --- | --- | --- | --- |
| Add, archive or delete a league | Yes | No | No |
| Reset any league's PINs | Yes | No | No |
| Set or change own commissioner PIN | Not applicable | Own league | No |
| Set the invite code and league PIN | Yes | Own league | No |
| Add or remove co-commissioners | Yes | Own league | No |
| Turn contracts on or off | Yes | Own league | No |
| Edit contract rules and league settings | Yes | Own league | No |
| Open or close rule and award voting | Yes | Own league | No |
| Approve contracts, edit rosters and dead cap | Yes | Own league | No |
| Roll the league to a new season | Yes | Own league | No |
| Database viewer and other admin tools | Yes | No | No |
| Vote, nominate, bid, propose trades | In leagues they belong to | Yes | Yes |

**Who counts as commissioner:** the Sleeper league owner by default, plus anyone the commissioner or site admin adds. The site admin is not a member of every league automatically. You can open any league as admin, but you only vote where you have a team.

**How the site knows you're the admin:** today anyone who picks your Sleeper username is treated as you. Admin-only league creation means little unless the admin pages need something only you know. The plan adds a site admin passcode that you set yourself and that every admin action asks for (see PINs and passcode below). Member sign-in stays as it is.

## PINs and passcode

Three secrets protect three kinds of action. Each is stored only as a slow hash, so nobody can read it back, including you.

| Secret | Set by | Asked for when | Reset by |
| --- | --- | --- | --- |
| League PIN (optional) | The commissioner, for their own league | A device joins the league for the first time | Commissioner or site admin |
| Commissioner PIN | Each commissioner, for their own league only | Any commissioner action in that league | Site admin |
| Admin passcode | The site admin | Any site admin action | Site admin, or the recovery key on the server |

- **One PIN per person:** each commissioner and co-commissioner sets their own commissioner PIN. Removing a co-commissioner removes their PIN, and nobody else's changes.
- **Who did it:** in leagues with co-commissioners, every commissioner action records whose PIN unlocked it. Rule changes, voting windows, contract approvals and roster edits show the commissioner's name in the audit log and on the change itself.
- **Scope:** a commissioner PIN works only in the league it was set for. The server checks the PIN against the league named in the request, so a league A PIN is refused in league B.
- **Unlock window:** after a correct PIN, the browser stays unlocked for that person's commissioner actions in that league until the browser is closed. The admin passcode works the same way.
- **Wrong tries:** 5 wrong tries pause that PIN for 15 minutes on that device.
- **Resets:** a reset clears the PIN, and that commissioner sets a new one at their next commissioner action. Every reset is written to the audit log with who did it and when.

**Hardcoded passcode or database?** Hardcoding it in the code is the least safe choice. Your repo is on GitHub, so anyone who can see the code can read it, and it stays in the commit history even after you change it. Changing it would also need a code change and a redeploy. Storing a hash in the database is safer: the passcode itself is never saved, you change it from the admin page, and a leaked database doesn't reveal it. The plan stores the hash in the database. A recovery key in the server's `.env` file, which is never committed, lets you reset the passcode if you forget it.

## First visit flow

A device joins a league by entering its invite code, and is remembered after that. The PIN step appears only when the commissioner has set one.

Flow (drawn as a diagram in the doc):

1. Open the site. If this device has a saved league, go straight to League home.
2. Otherwise, enter an invite code.
3. If the league has a PIN, enter it. A wrong PIN means try again (with the 15-minute pause after 5 tries).
4. Pick your team. The device saves the league and goes to League home.
5. From League home, "Join another league" goes back to step 2.

A saved device goes straight to its league. A device can join several leagues, and opens the last one used when the address names no league. The sidebar lists them, and "Join another league" goes back to the invite code step.

- **Invite code:** the commissioner sets it, for example `ATLDYNASTY`. There is no public list, so a league appears only after its code is entered. Codes ignore capital letters, must be unique across the site, and need at least 6 characters. Wrong codes are rate limited so nobody can guess through them.
- **League PIN:** optional, 4 to 8 digits, set by the commissioner (see PINs and passcode).
- **Remembered device:** after joining, the server issues a device token for that league. A device holds a separate token for each league it joined. Changing or resetting a league PIN signs out every device in that league.
- **League address in links:** every page lives under the league's address, for example `/l/atl-dynasty/standings`. A shared link opens that league. A device that hasn't joined it is asked for the invite code (and PIN, if set) first, then lands on the linked page. Today's addresses redirect to ATL Dynasty, so old bookmarks keep working.
- **Pick your team:** done once per league. A device can be a different team in each league.

## Data model

The plan adds eight new tables and changes no existing rows. The key idea is a league that lasts across seasons. Sleeper gives each season a new league ID, and today the app keys its data by that per-season ID. Settings, rules, PINs and commissioners must survive a new season, so they belong to the lasting league.

| New table | What it holds | Key columns |
| --- | --- | --- |
| `leagues` | One row per league on the site | id, name, address (slug), invite code (unique), contracts on/off, league PIN hash, status (active or archived), created by, created at |
| `league_season_history` | The progression of Sleeper league IDs for each league, one row per season | league id, season, Sleeper league ID (unique across the site), previous Sleeper league ID, status (current or past), rolled over at, rolled over by, migration id |
| `league_commissioners` | Commissioners and co-commissioners | league id, Sleeper user ID, role (owner or co), commissioner PIN hash, PIN set at, added by |
| `league_rules` | Contract rules, one row per league per season | league id, season, rules (JSON), updated by, updated at |
| `league_device_access` | Devices that joined a league | league id, device token hash, team picked, created at, last used, revoked |
| `site_admin` | The admin passcode | passcode hash, set at |
| `pin_attempts` | Wrong tries, for the 15-minute pause | what is being tried (league PIN, commissioner PIN, admin passcode, invite code), device, failures, paused until |
| `audit_log` | Sensitive actions | league id (blank for site actions), who (the commissioner or admin whose PIN or passcode was used), action (PIN reset, rule change, rollover, league added), details, when |

**Season history table:** `league_season_history` is the table you suggested for the progression of league IDs. Each league has exactly one current row. The database enforces that a Sleeper league ID belongs to only one league, so a season can never be attached to two leagues.

**How existing tables fit:** the roughly 28 tables that store a Sleeper league ID keep it. The server finds a row's league by looking up that ID in `league_season_history`. The two rule vote tables link through their rule. The existing `league_settings` key-value table keeps working, but its keys are read through the lasting league so they carry over each season.

**No leakage between leagues:** every rule, setting, PIN and commissioner row carries its league's id. The server only reads them through the league named in the request. No rule values stay in code: today's constants become ATL Dynasty's first saved rules.

**What it replaces:** `active_leagues` currently marks one league for the whole site. It is kept only to move ATL Dynasty over, then retired.

**Moving ATL Dynasty over:** this inserts new rows only. ATL Dynasty gets one `leagues` row and season history rows for its 2023, 2024, 2025 and 2026 Sleeper IDs, each pointing to the one before. You become its commissioner, and today's rules become its 2026 rules. No existing data is changed. (The eight tables are approved.)

## Per-league settings

Contracts become a switch, and every contract rule that is hardcoded for ATL today becomes a setting the commissioner edits. A new league starts with contracts off. ATL Dynasty starts with contracts on and its current values.

**Contracts off means the whole feature is gone for that league:**

- **Pages:** the Contracts and Contracts Hub pages and their sidebar links are hidden.
- **Cap displays:** cap room on the Dashboard, the Contract column on My Team, and the cap checks in the Trade Center are hidden.
- **Contract features:** dead cap, extensions, tags, free agency bids, RFA and rookie contract sync are all hidden.
- **Server:** contract endpoints refuse requests, so turning the switch off can't be bypassed from the browser.

Turning contracts off hides that data but never deletes it.

**Contract rules the commissioner can edit:**

| Setting | ATL value today | Where it lives now |
| --- | --- | --- |
| Salary cap | $250M | `shared/contractRules.ts` plus 4 client files |
| Rookie pay scale by round and pick | Round 1: $12M down to $6M by pick; round 2: $4M; round 3: $2M | `server/rookieContracts.ts` |
| Tag, extension and trade deadline | After NFL Week 14 | `shared/contractRules.ts` |
| Restricted free agency | Off | `shared/contractRules.ts` |
| In-season pickup contract | 1 year at $1M | `shared/contractRules.ts` |
| Offseason phases | Rollover, two free agency rounds, rookie draft, regular season | `shared/contractRules.ts` |
| Max contract length, tag cost, extension rules | Spread through the contract code | Contracts pages and rules file; to be listed during the build |

**When rule changes take effect:** every change a commissioner saves applies from next season. The current season keeps the rules it started with, so signed contracts and cap math don't shift mid-year. The Settings page shows both the rules in effect now and the rules saved for next season. At rollover, next season's rules become current.

**Emergency changes:** only the site admin can push a rule change into the current season, behind the admin passcode. Each emergency change asks for a reason, which is recorded in the audit log and shown on the Settings page.

**Rules stay in their league:** rules are read by league and season, never from a global value. A change saved in one league can't reach another, and the cross-league tests in Risks and questions check this.

**Other per-league settings:** playoff teams and format come from Sleeper already. Award nomination limit (3 today), award result team count (hardcoded 12 today) and the All-League start year (2025 today) move into league settings too.

## Code changes by area

Most of the work is replacing the one-league assumptions, not building new pages. About 120 of the 140 API routes already take a league ID.

**Server**

- **League lookup:** one shared step on every league route turns the league address, or a Sleeper league ID, into its league. It refuses a Sleeper ID that belongs to a different league than the address. Routes stop reading global constants.
- **Commissioner check:** the user must be on that league's commissioner list and have unlocked that league's commissioner PIN on this device.
- **Admin check:** admin routes need an unlocked admin passcode session.
- **Membership check:** writes (votes, nominations, bids, trades) check that the device joined that league and that the roster belongs to it.
- **Joining:** a join route takes an invite code and returns the league only on an exact match. Wrong codes are rate limited.
- **Contracts switch:** contract routes return "contracts are off" when the league has them off.
- **Admin routes:** add, edit and archive leagues, and reset any league's PINs. Every reset and change goes to the audit log. The database viewer moves behind the passcode.
- **Background work:** the syncs, snapshots, weekly report, contract sync and season rollover loop over each active league instead of one.

**Client**

- **Join page:** shown on a device's first visit and from "Join another league." It asks for the invite code, then the league PIN if one is set.
- **League addresses:** every page moves under `/l/<league>/`. `sleeper-context` reads the league from the address and keeps a per-device list of joined leagues, with a switcher in the sidebar.
- **PIN prompts:** a small prompt appears before the first commissioner or admin action, then stays unlocked for the unlock window.
- **Contracts switch:** the sidebar, Dashboard, My Team and Trade Center hide contract pieces when the league has contracts off.
- **League Settings page:** commissioners edit the contract rules (current and next season), the contracts switch, the invite code, the league PIN, their own commissioner PIN and co-commissioners.
- **Admin page:** you add a league by entering its Sleeper league ID. The app follows the previous-season chain to fill its season history, then you set its address, invite code and commissioner. The page also resets PINs and shows the audit log and Sleeper load.

**Hardcoded values to remove**

| What | Where |
| --- | --- |
| Your user ID as commissioner (about 32 places) | `COMMISSIONER_USER_IDS` in routes.ts, App, AppSidebar, Contracts, ContractsHub, RuleChanges, Settings, Draft Prospects, League Hub, League History, Database Viewer, Suggestions |
| ATL's 2023, 2024 and 2025 Sleeper IDs | Settings.tsx, Draft.tsx, Historical.tsx, server scripts |
| $250M cap | contractRules.ts, Contracts, ContractsHub, TradeCenter, PlayerDetailSheet |
| Rookie pay scale | rookieContracts.ts |
| 12 teams in award results, All-League start year 2025 | routes.ts |

**New league setup:** Sleeper has no contracts. A league that turns contracts on starts with none, so the commissioner either enters starting contracts or uploads a CSV. A CSV import is a later phase.

**routes.ts (my call):** split it before any multi-league work, as a pure move with no behavior change. Each area gets its own file under `server/routes/`: leagues and admin, standings and matchups, contracts, awards and rule changes, history and snapshots, players and the Sleeper proxy, and settings. The shared league lookup and the checks live in `server/middleware/`, so every file uses the same ones. To prove nothing changed, compare the full list of methods and paths before and after the split. The goal is no file over about 2,000 lines.

**Managing Sleeper load:** Sleeper asks apps to stay under 1,000 calls a minute or risk an IP block. It also asks apps to pull the 5 MB player list at most once a day and keep it on their own server ([Sleeper API docs](https://docs.sleeper.com/)).

- **Shared data, fetched once:** the player list (daily), NFL state (every few minutes), and weekly stats and projections are the same for every league, so all leagues share one cache.
- **League data, cached by how fast it changes:** league settings and users (hours), rosters and transactions (a few minutes), live matchups (about 1 minute during games, hours otherwise).
- **Finished data from the database:** completed weeks and seasons come from the snapshot tables, never from Sleeper again.
- **One request queue:** every Sleeper call goes through one queue, capped well under the limit (for example 300 a minute). Identical requests made at the same time share one call.
- **Background syncs:** only active leagues are synced, and their syncs are spread across the hour instead of running at once.
- **Visibility:** the admin page shows Sleeper calls per minute, so you can see the load as leagues are added.

## Risks and questions

The two biggest risks are data leaking between leagues and a broken season rollover. Both get their own tests, and a second league goes live only after those tests pass.

**Mismatch tests:** these can't run yet, because the app has one league and no league lookup. They're written in phase 1 against two test leagues and must pass before launch.

- **Writes:** every write route is called with league A's address and a league B Sleeper ID, roster, rule, nomination or contract ID, and each call must be refused.
- **PINs:** a league A commissioner PIN or device token is used in league B, and it must be refused.
- **Rules:** a rule change saved in league A must leave league B's rules and league A's current season unchanged.
- **Season history:** attaching a Sleeper ID that already belongs to another league must be refused.

**Season rollover:** today's rollover code (`/api/league/advance-year`) has these issues:

- **Old league comes from the site-wide active league.** It must come from the league's own current row in the season history table.
- **No check that the new season belongs to this league.** It checks that the season number goes up by one, not that the new Sleeper league's previous ID points back to the old one. A wrong ID could pull another league's season in. The fix requires that link and refuses an ID already owned by another league.
- **No all-or-nothing.** It copies contracts, dead cap and extensions, deletes old bids, then switches the active league, one step at a time. A failure partway leaves the migration marked in progress with some steps done. The fix runs it in one database transaction, or makes each step safe to rerun.
- **Commissioner check.** It uses the old Sleeper league owner and should use the commissioner PIN.

Rollover tests: a dry run that reports what would move without writing anything. Then a run on a copy of ATL's 2024 to 2025 data in a test database, two leagues rolling over in the same week, and a failure halfway followed by a resume.

**Other risks**

- **Acting as someone else:** inside a league, anyone who joined can still pick any team for member actions like votes and bids. Commissioner and admin actions are now covered by PINs.
- **Short PINs:** a 4-digit PIN is guessable if the database leaks. Slow hashing and the 15-minute pause keep this low.
- **Lost admin passcode:** the recovery key on the server resets it. If that key is also lost, resetting needs direct database access.
- **Invite code guessing:** a minimum of 6 characters plus rate limiting.
- **Shared links:** a link reveals the league's address, not access. It still asks for the invite code.
- **Sleeper limits:** covered by the queue and caches in Code changes.

**Decided**

- **Commissioner PINs:** one per commissioner and co-commissioner. Changes record whose PIN was used.
- **Unlock window:** until the browser closes.
- **Emergency rule changes:** the site admin can push one into the current season, with a reason.
- **Address and invite code:** separate. The address shows in links, and the code lets people in.
- **Default league:** a device in several leagues opens the last one used when the address names no league.

## Build plan

There are seven phases, and ATL Dynasty keeps working after each one. A second league goes live only after phase 5, once the mismatch and rollover tests pass.

**Phase 0: decide and prepare**

- [x] Answer the five questions above
- [x] Approve the eight new tables
- [x] Split routes.ts into area files, and compare the route list before and after

**Phase 1: registry and season history**

- [x] Create the eight tables
- [x] Insert ATL Dynasty's rows: its league, its 2023 to 2026 season history linked in order, you as commissioner, its 2026 rules
- [x] Add the shared league lookup to every league route (lenient until phase 4)
- [x] Move pages under `/l/<league>/`, with today's addresses redirecting to ATL Dynasty
- [ ] Write the mismatch tests against two test leagues

**Phase 2: PINs, commissioners and admin**

- [x] Admin passcode, with the recovery key in `.env`
- [x] A commissioner PIN for each commissioner and co-commissioner, each change recording whose PIN was used, unlocked until the browser closes, and the 15-minute pause
- [x] Replace the 32 hardcoded commissioner checks with the per-league list plus PIN
- [x] Admin page: add a league, fill its season history, set its address, invite code and commissioner
- [x] PIN resets by the site admin, and the audit log
- [x] Database viewer behind the admin passcode

**Phase 3: rules and contracts switch**

- [ ] Move the cap, rookie scale, deadline week, RFA, pickup contract and award constants into `league_rules` and league settings
- [ ] Read rules by league and season, with saved changes going to next season, plus the site admin's emergency change with a reason
- [ ] League Settings page with current and next-season rules
- [ ] Contracts switch: hide pages and widgets, and have contract routes refuse when it's off

**Phase 4: joining and separation**

- [ ] Join page with invite code and league PIN, and remembered devices
- [ ] Several leagues per device, with the sidebar switcher
- [ ] Membership checks on every write route
- [ ] Sleeper request queue, shared caches and staggered background jobs per league
- [ ] All mismatch tests pass

**Phase 5: season rollover**

- [ ] Rebuild rollover on the season history table, with the previous-ID check
- [ ] One transaction, or steps that are safe to rerun, plus a dry run
- [ ] Next season's rules become current at rollover
- [ ] Rollover tests: ATL's 2024 to 2025 copy, two leagues in the same week, and a failure halfway followed by a resume

**Phase 6: pilot**

- [ ] Add a test league with contracts off, and check that no ATL data shows
- [ ] Add a friend's league with contracts on, an invite code and both PINs
- [ ] Add a CSV import for starting contracts if a contracts league needs it
