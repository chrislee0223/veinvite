-- Production grant repair for four observed X OAuth 42501 errors.
-- Applied to production Supabase via migration
-- fix_x_oauth_service_identity_write_preflight_20261111.
-- No changes to X qualification, eligibility, financial/claim logic, or
-- Sybil protections. Access remains strictly server-only.
BEGIN;
GRANT INSERT ON TABLE public.reward_x_promotion_x_identities TO service_role;

CREATE OR REPLACE FUNCTION public.reward_x_promotion_oauth_write_ready_v1()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $$
  SELECT
    pg_catalog.has_table_privilege(
      current_user::text,
      'public.reward_x_promotion_x_identities',
      'INSERT'
    )
    AND pg_catalog.has_table_privilege(
      current_user::text,
      'public.reward_x_promotion_oauth_proofs',
      'INSERT'
    );
$$;
REVOKE ALL ON FUNCTION public.reward_x_promotion_oauth_write_ready_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_x_promotion_oauth_write_ready_v1()
  TO service_role;
COMMIT;
