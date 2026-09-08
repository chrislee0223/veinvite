-- The public leaderboard now has one authoritative read path:
-- get_public_lifetime_leaderboard_v2. The legacy wrapper no longer has any
-- application or database dependents and was service-role only, so remove it
-- instead of keeping a silent compatibility fallback that can resurface later.
drop function if exists public.get_public_lifetime_leaderboard(text, text, integer);
