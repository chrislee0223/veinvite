-- Synthetic PostgreSQL activation trigger: preserve the original
-- binding-source no-receipt branch for source-drift integration testing.
\set ON_ERROR_STOP on
ALTER TABLE public.invitations
 ADD COLUMN IF NOT EXISTS reward_cohort_binding_source text;
CREATE OR REPLACE FUNCTION public.set_reward_cohort_binding_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public
AS $fn$
BEGIN
  if new.reward_cohort_round_id is null
     or new.reward_funding_allocation_receipt_id is null then
    if new.reward_cohort_binding_source is not null then
      raise exception 'REWARD_COHORT_BINDING_SOURCE_WITHOUT_BINDING';
    end if;
    return new;
  end if;
  return new;
END $fn$;
CREATE TRIGGER zz_invitations_set_reward_cohort_binding_source
BEFORE INSERT OR UPDATE OF activated_at,activation_network,
 reward_cohort_round_id,reward_funding_allocation_receipt_id
ON public.invitations FOR EACH ROW
EXECUTE FUNCTION public.set_reward_cohort_binding_source();
