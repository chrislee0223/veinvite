-- Stage 1A: atomically include admission HELD liabilities in the already-
-- canonical base/X physical outstanding and cohort lifetime readers.
-- No admission writer, signer, Claim hook, public API, activation, or payout
-- amount change in this migration. Staged HELD remains empty because the
-- database admission feature stays CHECK(enabled=false), and service_role has
-- no INSERT privilege. This is a safety-only forward-compatible reader gate.
-- Corresponding exact Production reader replay is in
-- tests/sql/reward-admission-authoritative-reader-{upgrade,assert}.sql.
-- Future HELD writer/hand-off MUST be separately proven before enabling.
-- The three affected functions are replaced within ONE transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.read_outstanding_reward_liability(p_network text, p_app_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_app_id text := lower(btrim(coalesce(p_app_id,'')));
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_post_base_promotion numeric(78,0) := 0;
  v_early_held numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if v_app_id<>v_veinvite_app_id then
    raise exception 'reward liability can only target the VeInvite app';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code=q.invite_code
        and paid.status='PAID'
    );

  select coalesce(sum(rp.amount_wei),0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rr.network=v_network
    and rr.app_id=v_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code=rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_post_base_promotion :=
    public.read_reward_x_promotion_post_base_liability_wei(
      v_network,
      v_app_id
    );

  if v_post_base_promotion<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_POST_BASE_LIABILITY';
  end if;

  -- A future admission HELD liability is actual physical encumbrance.
  -- Include it in ALL existing base/X signer and reserve readers exactly once.
  select coalesce(sum(h.amount_wei),0) into v_early_held
  from reward_admission_bridge.holds h
  where h.network=v_network and h.app_id=v_app_id and h.status='HELD';
  if v_early_held<0 then raise exception 'ADMISSION_HOLD_CORRUPT'; end if;

  return (
    v_early_held +
    v_reserved_existing +
    v_legacy_reserved +
    v_post_base_promotion
  )::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_offset_committed numeric(78,0) := 0;
  v_x_promotion_committed numeric(78,0) := 0;
  v_early_held numeric(78,0) := 0;
begin
  p_network:=lower(btrim(p_network));
  p_app_id:=lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_reward_cohort_round_id is null or p_reward_cohort_round_id<1 then
    raise exception 'invalid reward cohort round';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id=p_allocation_receipt_id
    and a.network=p_network
    and a.app_id=p_app_id;

  if not found
     or v_receipt.vebetter_round_id+1<>p_reward_cohort_round_id then
    raise exception 'allocation receipt does not fund the requested reward cohort';
  end if;

  select coalesce(sum(q.reserved_amount_wei),0)
  into v_queue_committed
  from public.reward_queue_entries q
  join public.invitations i on i.invite_code=q.invite_code
  where q.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');

  select coalesce(sum(s.offset_amount_wei),0)
  into v_offset_committed
  from public.reward_recovery_settlements s
  join public.invitations i on i.invite_code=s.invite_code
  where s.network=p_network
    and i.reward_funding_allocation_receipt_id=v_receipt.id
    and i.reward_cohort_round_id=p_reward_cohort_round_id
    and not public.is_sybil_v2_referral_invalidated(
      s.invite_code,
      p_network
    )
    and not exists (
      select 1
      from public.reward_recovery_obligations o
      where o.source_settlement_id=s.id
        and o.status='ACTIVE'
    );

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_x_promotion_committed
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state in ('RESERVED','HELD','PAID');

  if v_x_promotion_committed<0 then
    raise exception 'REWARD_X_PROMOTION_NEGATIVE_COHORT_COMMITMENT';
  end if;

  -- Existing PAID and recovery offsets stay in lifetime spent, temporary
  -- HELD is added only until atomically converted to an immutable fixed entry.
  select coalesce(sum(h.amount_wei),0) into v_early_held
  from reward_admission_bridge.holds h
  where h.network=p_network and h.app_id=p_app_id and h.status='HELD'
    and h.reward_cohort_round_id=p_reward_cohort_round_id
    and h.funding_allocation_receipt_id=p_allocation_receipt_id;
  if v_early_held<0 then raise exception 'COHORT_ADMISSION_HOLD_CORRUPT'; end if;

  return
    v_early_held +
    v_queue_committed +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.read_reward_admission_bridge_status_v1(
  p_network text,
  p_app_id text,
  p_reward_cohort_round_id bigint,
  p_allocation_receipt_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_app text:=lower(btrim(coalesce(p_app_id,'')));
  v_app_const constant text:=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_receipt public.vebetter_round_allocations%rowtype;
  v_glob numeric(78,0):=0;
  v_cohort_hold numeric(78,0):=0;
  v_existing numeric(78,0):=0;
  v_existing_x numeric(78,0):=0;
  v_lifetime numeric(78,0):=0;
  v_budget numeric(78,0):=0;
  v_holds_count bigint:=0;
  v_disabled boolean;
BEGIN
  IF v_network NOT IN ('mainnet','testnet','testnet-staging') OR
     v_app<>v_app_const OR
     p_reward_cohort_round_id IS NULL OR p_reward_cohort_round_id<1 OR
     p_allocation_receipt_id IS NULL OR p_allocation_receipt_id<1 THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_INVALID_SCOPE';
  END IF;
  SELECT * INTO v_receipt FROM public.vebetter_round_allocations
  WHERE id=p_allocation_receipt_id AND network=v_network AND app_id=v_app
    AND veBetter_round_id+1=p_reward_cohort_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_ALLOCATION_MISMATCH';
  END IF;

  SELECT NOT enabled INTO v_disabled FROM reward_admission_bridge.settings WHERE id=1;
  IF NOT FOUND OR v_disabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_STAGING_GATE_VIOLATED';
  END IF;

  -- Physical base/X outstanding is ALREADY a single authoritative number.
  -- X RESERVED/HELD must NEVER be added to it a second time.
  v_existing:=public.read_outstanding_reward_liability(v_network,v_app)::numeric;
  v_existing_x:=public.read_reward_x_promotion_post_base_liability_wei(v_network,v_app);
  v_lifetime:=public.read_reward_cohort_committed_wei(
    v_network,v_app,p_reward_cohort_round_id,p_allocation_receipt_id);
  v_budget:=public.read_reward_cohort_effective_budget_wei(
    v_network,v_app,p_reward_cohort_round_id,p_allocation_receipt_id);

  SELECT coalesce(sum(amount_wei),0),count(*) INTO v_glob,v_holds_count
  FROM reward_admission_bridge.holds
  WHERE network=v_network AND app_id=v_app AND status='HELD';

  SELECT coalesce(sum(amount_wei),0) INTO v_cohort_hold
  FROM reward_admission_bridge.holds
  WHERE network=v_network AND app_id=v_app AND status='HELD'
    AND reward_cohort_round_id=p_reward_cohort_round_id
    AND funding_allocation_receipt_id=p_allocation_receipt_id;

  -- The authoritative reader now INCLUDES all HELD, while this legacy
  -- status schema reports its pre-HELD figures separately. Remove them for
  -- observation only, then re-add exactly once in the JSON total.
  v_existing:=v_existing-v_glob;
  v_lifetime:=v_lifetime-v_cohort_hold;

  IF v_existing<0 OR v_existing_x<0 OR v_existing_x>v_existing OR
     v_lifetime<0 OR v_budget<0 OR v_glob<0 OR v_cohort_hold<0 OR
     v_cohort_hold>v_glob THEN
    RAISE EXCEPTION 'REWARD_ADMISSION_BRIDGE_LEDGER_INVALID';
  END IF;

  RETURN jsonb_build_object(
    'model','staged-disabled-v1',
    'enabled',false,
    'canAdmit',false,
    'canGuarantee',false,
    'canSign',false,
    'authorizesWrite',false,
    'requiresAtomicHandoff',true,
    'requiresXAndRecoveryReconciliation',true,
    'requiresUncoveredLegacyStressProof',true,
    'network',v_network,
    'appId',v_app,
    'rewardCohortRoundId',p_reward_cohort_round_id::text,
    'allocationReceiptId',p_allocation_receipt_id::text,
    'physicalBaseAndXOutstandingWei',v_existing::text,
    'xLiveUnpaidAlreadyIncludedWei',v_existing_x::text,
    'unconvertedGlobalHoldsWei',v_glob::text,
    'unconvertedCohortHoldsWei',v_cohort_hold::text,
    'existingCohortLifetimeCommittedWei',v_lifetime::text,
    'cohortEffectiveBudgetWei',v_budget::text,
    'cohortLifetimePlusHoldsWei',(v_lifetime+v_cohort_hold)::text,
    'globalHoldsCount',v_holds_count,
    'globalLiabilityIncludingHoldsWei',(v_existing+v_glob)::text,
    'accountingConsistent',v_lifetime+v_cohort_hold<=v_budget
  );
END $fn$;;
COMMIT;
