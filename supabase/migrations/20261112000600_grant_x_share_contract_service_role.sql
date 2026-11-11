-- The read-only canonical X share URL preflight runs as service_role.
-- Its nested SECURITY INVOKER URL matcher was intentionally left private but
-- had no service_role EXECUTE grant, so no real Posts could reach verification.
-- Minimal privilege-only repair: no table access, reward, Sybil or payout edit.
BEGIN;
REVOKE ALL ON FUNCTION public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_x_promotion_share_url_matches_v1(text,uuid,text,boolean)
  TO service_role;
COMMIT;
