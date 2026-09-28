-- Production migration marker.
--
-- The managed Production database received the unpaid Sybil reassessment
-- hardening atomically in this migration version. The canonical replayable
-- definitions are restated in the immediately following migrations:
--   allow_unpaid_sybil_reassessment_views_v2
--   sync_unpaid_rewards_with_sybil_v2_state
--   require_current_sybil_v2_for_claim
--
-- Keeping this marker preserves exact Production migration-version parity
-- without duplicating the same function/view bodies twice on fresh installs.

do $$
begin
  null;
end
$$;
