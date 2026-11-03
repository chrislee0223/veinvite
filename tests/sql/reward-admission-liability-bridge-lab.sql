-- Future-only ledger compatibility simulation. ISOLATED POSTGRES QA; NOT a migration.
\set ON_ERROR_STOP on
CREATE FUNCTION reward_admission_lab.read_full_liability_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $fn$
  SELECT jsonb_build_object(
    'physicalWei',physical_wei::text,
    'admissionHeldWei',held_wei::text,
    'fixedUnpaidWei',unpaid_fixed_wei::text,
    'externalLegacyAndXWei',external_holds_wei::text,
    'totalOutstandingWei',(held_wei+unpaid_fixed_wei+external_holds_wei)::text,
    'unallocatedPhysicalWei',greatest(physical_wei-held_wei-unpaid_fixed_wei-external_holds_wei,0)::text,
    'poolUnderfunded',(physical_wei<held_wei+unpaid_fixed_wei+external_holds_wei)
  )
  FROM reward_admission_lab.pool WHERE id=true;
$fn$;

CREATE FUNCTION reward_admission_lab.read_cohort_lifetime_plus_guarantees(p_cohort bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $fn$
  SELECT jsonb_build_object(
    'budgetWei',budget_wei::text,
    'lifetimeFixedWei',committed_wei::text,
    'unconvertedAdmissionWei',held_wei::text,
    'totalCohortEncumberedWei',(committed_wei+held_wei)::text,
    'cohortOversubscribed',(budget_wei<committed_wei+held_wei)
  )
  FROM reward_admission_lab.cohorts WHERE id=p_cohort;
$fn$;

CREATE FUNCTION reward_admission_lab.check_fixed_manifest_signable(
  p_code text, p_amount_wei numeric
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO pg_catalog,reward_admission_lab
AS $fn$
DECLARE
  p reward_admission_lab.pool%rowtype;
  f reward_admission_lab.fixed_rewards%rowtype;
BEGIN
  SELECT * INTO p FROM reward_admission_lab.pool WHERE id=true;
  IF NOT FOUND OR p.paused OR NOT p.evidence_verified THEN RETURN 'UNVERIFIED_POOL'; END IF;
  IF p.observed_at>clock_timestamp()+interval '1 minute'
     OR clock_timestamp()-p.observed_at>interval '5 minutes' THEN RETURN 'STALE_POOL'; END IF;
  IF p.external_holds_wei+p.held_wei+p.unpaid_fixed_wei>p.physical_wei
     OR p.unresolved_old_wei>0 THEN RETURN 'LIABILITY_UNDERFUNDED'; END IF;
  SELECT * INTO f FROM reward_admission_lab.fixed_rewards WHERE code=p_code;
  IF NOT FOUND THEN RETURN 'NOT_FIXED'; END IF;
  IF f.state='PAID' THEN RETURN 'ALREADY_PAID'; END IF;
  IF p_amount_wei IS NULL OR p_amount_wei<>f.quote_wei THEN RETURN 'MANIFEST_MISMATCH'; END IF;
  IF p.unpaid_fixed_wei < f.quote_wei THEN RETURN 'INCONSISTENT_FIXED_LIABILITY'; END IF;
  -- The manifest must correspond to an actual fixed unpaid reward. Its value
  -- is already INCLUDED in outstanding; never subtract it twice. The total
  -- outstanding pool must be funded before any signing.
  RETURN 'SIGNABLE_SHADOW';
END $fn$;

REVOKE ALL ON FUNCTION reward_admission_lab.read_full_liability_snapshot() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.read_cohort_lifetime_plus_guarantees(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.check_fixed_manifest_signable(text,numeric) FROM PUBLIC,anon,authenticated;

COMMENT ON FUNCTION reward_admission_lab.check_fixed_manifest_signable(text,numeric)
IS 'Isolated QA only: does not authorize actual blockchain signatures; a finalized manifest and all real chain checks are additional mandatory conditions.';