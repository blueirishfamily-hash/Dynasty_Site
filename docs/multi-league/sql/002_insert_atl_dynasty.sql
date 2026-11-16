-- Multi-league phase 1: register ATL Dynasty in the new tables.
-- Inserts new rows into the 8 new tables only. No existing table or row changes. Run after 001.
--
-- What it adds:
--   leagues                1 row   ATL Dynasty, address atl-dynasty, contracts on, no invite code yet
--   league_season_history  4 rows  2023 -> 2024 -> 2025 -> 2026, each pointing to the one before; 2026 is current
--   league_commissioners   1 row   Sleeper user 900186363130503168 as owner (PIN set in phase 2)
--   league_rules           1 row   2026 rules = today's hardcoded values (shared/leagueRules.ts atlDynastyRules)
--   audit_log              1 row   "league_added"
--
-- The 2026 Sleeper league ID is read from active_leagues (season 2026). It stops with an error, and adds
-- nothing, unless exactly one such row exists. The 2023 to 2025 chain was checked against Sleeper on 2026-11-16.
-- The invite code is left empty on purpose; set it later in League Settings or with:
--   UPDATE leagues SET invite_code = upper('<code>') WHERE slug = 'atl-dynasty';

BEGIN;

DO $$
DECLARE
  v_league_id   varchar(36) := gen_random_uuid()::text;
  v_admin       varchar(64) := '900186363130503168';
  v_now         bigint      := (extract(epoch from now()) * 1000)::bigint;
  v_2026        varchar(64);
  v_count       int;
BEGIN
  SELECT count(*) INTO v_count FROM active_leagues WHERE season = '2026';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active_leagues row for season 2026, found %', v_count;
  END IF;
  SELECT league_id INTO v_2026 FROM active_leagues WHERE season = '2026';
  IF v_2026 IN ('918240874625257472', '1048746932522405888', '1194798912048705536') THEN
    RAISE EXCEPTION 'The 2026 league ID % is one of the earlier seasons', v_2026;
  END IF;

  INSERT INTO leagues (id, name, slug, invite_code, contracts_enabled, status, created_by, created_at)
  VALUES (v_league_id, 'ATL Dynasty', 'atl-dynasty', NULL, 1, 'active', v_admin, v_now);

  INSERT INTO league_season_history (id, league_id, season, sleeper_league_id, previous_sleeper_league_id, status)
  VALUES
    (gen_random_uuid()::text, v_league_id, '2023', '918240874625257472',  NULL,                  'past'),
    (gen_random_uuid()::text, v_league_id, '2024', '1048746932522405888', '918240874625257472',  'past'),
    (gen_random_uuid()::text, v_league_id, '2025', '1194798912048705536', '1048746932522405888', 'past'),
    (gen_random_uuid()::text, v_league_id, '2026', v_2026,                '1194798912048705536', 'current');

  INSERT INTO league_commissioners (id, league_id, sleeper_user_id, role, added_by, added_at)
  VALUES (gen_random_uuid()::text, v_league_id, v_admin, 'owner', v_admin, v_now);

  INSERT INTO league_rules (id, league_id, season, rules, updated_by, updated_at)
  VALUES (gen_random_uuid()::text, v_league_id, '2026',
    '{"version":1,"salaryCap":250,"rookieScale":{"round1BySlot":{"1":12,"2":11,"3":11,"4":9,"5":9,"6":9,"7":7,"8":7,"9":7,"10":6,"11":6,"12":6},"round1Default":4,"round2":4,"round3":2},"contractDeadlineWeek":14,"rfaEnabled":false,"inSeasonPickup":{"years":1,"salary":1},"phases":["league_year_rollover","fa_round_1","round_1_results","fa_round_2","round_2_results","fa_recap","regular_season","deadline_passed"],"awards":{"nominationLimit":3,"resultTeamCount":12,"allLeagueStartYear":2025}}'::jsonb,
    v_admin, v_now);

  INSERT INTO audit_log (id, league_id, actor_sleeper_user_id, actor_role, action, details, created_at)
  VALUES (gen_random_uuid()::text, v_league_id, v_admin, 'admin', 'league_added',
    jsonb_build_object('source', 'docs/multi-league/sql/002_insert_atl_dynasty.sql', 'seasons', jsonb_build_array('2023', '2024', '2025', '2026')),
    v_now);
END $$;

COMMIT;

-- Check the result:
-- SELECT l.slug, h.season, h.sleeper_league_id, h.previous_sleeper_league_id, h.status
--   FROM leagues l JOIN league_season_history h ON h.league_id = l.id ORDER BY h.season;
