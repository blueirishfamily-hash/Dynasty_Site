# Restricted Free Agency (RFA): paused

RFA is switched off for now. Nothing was deleted: the rules, server routes, screens and database tables are all still
in the code. The switch is `RFA_ENABLED` in `shared/contractRules.ts`. Set it to `true` to bring the whole process back.

## What is turned off while `RFA_ENABLED` is `false`
- The two RFA match phases (`rfa_match_1`, `rfa_match_2`) are skipped. The offseason runs: League Year Rollover,
  Tag & Extension, Free Agency Round 1, Round 1 Results, Free Agency Round 2, Round 2 Results, Regular Season.
- Nobody can be designated an RFA, and the "can be your 1 RFA" labels are hidden.
- Every free agent in the bidding pool is a plain free agent, and bids are always plain free agent bids.
- Kept round wins never create RFA offers.
- The RFA routes (`/rfa`, `/rfa/designate`, `/rfa/:offerId/match`, `/rfa/:offerId/walk`) refuse requests, and the
  `/rfa` data route returns empty lists.

## The process as designed (what comes back when it is turned on)
1. **Designation (Tag & Extension phase).** Each team may designate up to 1 RFA, and only from its own players whose rookie
   contracts are ending (`designateRFA` in `shared/contractRules.ts`). One designation per team per season.
2. **Bidding.** Designated RFAs show in the free agency pool as "RFA, [team] can match". Other teams bid on them in the
   same blind rounds as free agents. A team cannot bid on its own designated RFA.
3. **Round results.** If a team keeps a win on an RFA, it becomes an RFA offer for that round's match window (round 1 wins go
   to window 1, round 2 wins to window 2). The offer counts against the bidding team's cap until the window closes.
4. **Match window (`rfa_match_1`, `rfa_match_2`).** The original team can match the exact years and yearly salary, if
   it has cap room (`canMatchRFA`), or let the player walk. A window that closes with no decision counts as a walk.
5. **Outcome.** Matched: the player stays with the original team on the matched contract. Walked: the player goes to the
   bidding team.

## Where it lives
- Rules: `shared/contractRules.ts` (`designateRFA`, `canMatchRFA`, the two RFA phases in `LEAGUE_PHASES`).
- Server: `server/contractHubRoutes.ts` (designate, list, match, walk, and the offer created in `round-confirm`).
- Screens: `client/src/components/contracts-hub/RfaMatchTab.tsx`, the RFA labels in `ContractsHub.tsx`, the RFA status in
  `FreeAgencyBiddingTab.tsx`, and the calendar copy in `SeasonCalendarTab.tsx`.
- Tables: `rfa_designations`, `rfa_offers`, and the `is_rfa` and `original_roster_id` columns on `player_bids`.
