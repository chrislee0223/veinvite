-- Policy-aware accounting: verified against production schema with rollback and CI.
-- Preserve immutable reservations/receipts, X lifecycle, and existing window quotes.
-- New quotes reserve the legacy additive bonus ONLY for legacy invitations.
-- V3 X is inside the gross reservation, and returned V3 value reduces cohort commitment once.
-- Source function digests (production at review):
-- commit_reward_elastic_closed_cohort_v1: dd31d47bc09a464d9909e6c0542d8039
-- commit_reward_shared_pool_v1: 265ddc4cea148d5442586b1d68ac202e
-- commit_reward_vote_round_close_batch_v1: 9065f2b3ca189bc5ce21db516a999a7b
-- commit_reward_vote_window_immediate_v1: 6e035be35ff73d645ec1f4501cc59af9
-- read_reward_cohort_committed_wei: 8f3ae1b80eff00fd5c716c405851669d
-- read_reward_elastic_public_scenarios_v1: d70e19c8e4d1fd562d7837770d69c2ca
-- read_reward_shared_pool_capacity_shadow_v1: 11e6af2b823052ef7447f265bd15439d

CREATE OR REPLACE FUNCTION public.calculate_reward_policy_aware_quote_v1(
  p_capacity_wei numeric, p_recipient_count bigint,
  p_legacy_count bigint, p_legacy_reserve_wei numeric
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF p_capacity_wei<0 OR p_capacity_wei<>trunc(p_capacity_wei)
    OR p_recipient_count<1 OR p_recipient_count>5000
    OR p_legacy_count<0 OR p_legacy_count>p_recipient_count
    OR p_legacy_reserve_wei<0 OR p_legacy_reserve_wei<>trunc(p_legacy_reserve_wei)
  THEN RAISE EXCEPTION 'REWARD_POLICY_AWARE_QUOTE_INVALID_INPUT'; END IF;
  RETURN div(greatest(p_capacity_wei-p_legacy_count*p_legacy_reserve_wei,0),p_recipient_count::numeric);
END;
$function$;
REVOKE ALL ON FUNCTION public.calculate_reward_policy_aware_quote_v1(numeric,bigint,bigint,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_reward_policy_aware_quote_v1(numeric,bigint,bigint,numeric) TO service_role;


ALTER TABLE reward_admission_bridge.vote_window_fixed_quotes
  ADD COLUMN IF NOT EXISTS legacy_participant_count bigint
  CHECK (legacy_participant_count IS NULL OR legacy_participant_count BETWEEN 0 AND participant_count);
COMMENT ON COLUMN reward_admission_bridge.vote_window_fixed_quotes.legacy_participant_count IS
  'Null for immutable pre-policy-aware quotes. Otherwise number of legacy additive-X participants in the original fixed cohort.';

CREATE OR REPLACE FUNCTION public.read_reward_cohort_committed_wei(p_network text, p_app_id text, p_reward_cohort_round_id bigint, p_allocation_receipt_id bigint)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_receipt public.vebetter_round_allocations%rowtype;
  v_queue_committed numeric(78,0) := 0;
  v_withheld_released numeric(78,0) := 0;
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

  -- Only v3 withholding is already included in the gross queue commitment.
  -- Returning it reduces lifetime commitment exactly once; a cancelled queue
  -- was excluded above, so it must never be subtracted again.
  select coalesce(sum(o.promotion_amount_wei),0)
  into v_withheld_released
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s on s.id=o.split_id
    and s.mode='LIVE' and s.policy_version='x-promotion-withheld-10pct-v3'
  join public.reward_queue_entries q on q.id=s.queue_entry_id
    and q.invite_code=o.invite_code and q.network=o.network
  where o.network=p_network
    and o.source_reward_cohort_round_id=p_reward_cohort_round_id
    and o.source_allocation_receipt_id=p_allocation_receipt_id
    and o.financial_state='RELEASED'
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED');
  if v_withheld_released>v_queue_committed then
    raise exception 'REWARD_X_V3_RELEASE_EXCEEDS_COHORT_COMMITMENT';
  end if;

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
   and s.policy_version='x-promotion-additive-v2'
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
    (v_queue_committed-v_withheld_released) +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_shared_pool_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_inv public.invitations%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_candidates bigint;
 v_legacy_candidates bigint;
 v_candidate_present boolean;
 v_reserved numeric(78,0);
 v_headroom numeric(78,0);
 v_x_budget numeric(78,0);
 v_quote numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_result jsonb;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1
 THEN RAISE EXCEPTION 'SHARED_POOL_INPUT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
    WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','HELD_ADMISSION_CONFLICT');
 END IF;

 SELECT * INTO v_inv FROM public.invitations i
   WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','INVITE_NOT_FOUND'); END IF;

 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
   WHERE a.id=v_inv.reward_funding_allocation_receipt_id
     AND a.network=p_network AND a.app_id=v_app
     AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','FUNDING_BINDING_MISSING'); END IF;

 -- The exact canonical candidate query already requires completed missions,
 -- live Sybil CLEAR + security-client checks, blockchain proof and no prior
 -- queue, payout or recovery. Count ONLY finalized eligible entries. Never
 -- dilute/escrow against unfinished participants or unaccepted invitations.
 SELECT count(*),coalesce(bool_or(c.invite_code=v_code),false),
   count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(c.invite_code)='x-promotion-additive-v2')
 INTO v_candidates,v_candidate_present,v_legacy_candidates
 FROM public.read_reward_reservation_candidates_v2(p_network,100) c
 WHERE c.completion_block<=p_finalized_block;
 IF NOT v_candidate_present THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','NOT_FINAL_ELIGIBLE');
 END IF;
 IF v_candidates=0 OR v_candidates>=100 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','UNBOUNDED_CANDIDATE_COUNT');
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_cfg.x_option_reserve_wei IS NULL OR v_cfg.x_option_reserve_wei<0
 THEN RAISE EXCEPTION 'SHARED_POOL_X_POLICY_UNAVAILABLE'; END IF;

 v_reserved:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 IF v_reserved<0 OR v_reserved>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reserved',false,'reason','OUTSTANDING_EXCEEDS_POOL');
 END IF;
 v_headroom:=p_observed_pool_balance_wei-v_reserved;
 v_x_budget:=v_legacy_candidates*v_cfg.x_option_reserve_wei;
 IF v_headroom<=v_x_budget THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','POOL_INSUFFICIENT_FOR_CURRENT_COMPLETIONS');
 END IF;
 v_quote:=public.calculate_reward_policy_aware_quote_v1(
   v_headroom,v_candidates,v_legacy_candidates,v_cfg.x_option_reserve_wei);
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reserved',false,'reason','REWARD_FUNDING_UNAVAILABLE');
 END IF;

 v_cohort_reserved:=public.read_reward_cohort_committed_wei(
    p_network,v_app,v_inv.reward_cohort_round_id,v_inv.reward_funding_allocation_receipt_id);
 v_basis:=jsonb_build_object(
    'quoteKind','shared_pool_completion_v1',
    'poolPolicy','shared-pool-v1',
    'fundingAllocationReceiptId',v_alloc.id::text,
    'rewardCohortRoundId',v_inv.reward_cohort_round_id::text,
    'cohortReservedWei',v_cohort_reserved::text,
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'eligibleReadyCount',v_candidates,
    'xOptionReservedPerEligibleWei',v_cfg.x_option_reserve_wei::text,
    'legacyXEligibleCount',v_legacy_candidates,
    'legacyXReserveTotalWei',v_x_budget::text,
    'quoteWei',v_quote::text,
    'observationAt',p_observed_at);
 v_result:=public.commit_reward_reservation(
    v_code,p_network,p_observed_pool_balance_wei,v_reserved,v_quote,
    'shared-pool-v1',null,p_finalized_block,v_basis);

 RETURN v_result||jsonb_build_object(
    'mode',case when coalesce((v_result->>'reserved')::boolean,false)
      then 'SHARED_RESERVED' else 'SHARED_REJECTED' end,
    'policy','shared-pool-v1');
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_vote_round_close_batch_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_code text:=upper(btrim(coalesce(p_invite_code,'')));
 v_cfg reward_admission_bridge.vote_round_close_settings%rowtype;
 v_xcfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_inv public.invitations%rowtype;
 v_vote_round bigint;
 v_allocation_close timestamptz;
 v_round_close_block bigint;
 v_vote_scan_checkpoint bigint;
 v_completed bigint;
 v_verified bigint;
 v_legacy_verified bigint;
 v_vote_proofs bigint;
 v_prior bigint;
 v_prior_own bigint;
 v_held_count bigint;
 v_fixed numeric(78,0);
 v_provisional numeric(78,0);
 v_available numeric(78,0);
 v_quote numeric(78,0);
 v_before numeric(78,0);
 v_cohort_reserved numeric(78,0);
 v_basis jsonb;
 v_out jsonb;
 v_count bigint:=0;
 v_row record;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
    OR v_code !~ '^[A-HJ-NP-Z2-9]{7}$'
    OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
    OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
    OR p_observed_at IS NULL
    OR p_observed_at<clock_timestamp()-interval '120 seconds'
    OR p_observed_at>clock_timestamp()+interval '10 seconds'
    OR p_finalized_block IS NULL OR p_finalized_block<1 THEN
   RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INVALID_INPUT';
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
     WHERE s.id=1 AND s.enabled) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','SHARED_POOL_NOT_ACTIVE','reserved',false);
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 -- Read the pause flag under the same locks as the single-recipient writer.
 -- A pause request serializes with any in-flight batch instead of racing.
 SELECT * INTO v_cfg FROM reward_admission_bridge.vote_round_close_settings
 WHERE id=1 FOR SHARE;
 IF NOT FOUND OR NOT v_cfg.enabled OR v_cfg.paused THEN
   RETURN jsonb_build_object('mode','PAUSED','reason','ROUND_CLOSE_PAUSED',
     'reserved',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_runtime_config r WHERE r.id=1
    AND (r.emergency_rewards_paused OR (p_network='mainnet' AND NOT r.mainnet_funded_rewards_enabled)))
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_PAUSED','reserved',false); END IF;

 SELECT * INTO v_inv FROM public.invitations i
  WHERE i.invite_code=v_code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reason','INVITE_MISSING','reserved',false); END IF;
 v_vote_round:=v_inv.vote_round_id;
 IF v_vote_round IS NULL OR v_vote_round<v_cfg.first_vote_round_id THEN
   RETURN jsonb_build_object('mode','LEGACY','reserved',false);
 END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=v_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT','reserved',false);
 END IF;
 IF v_inv.vote_completed IS NOT TRUE THEN
   RETURN jsonb_build_object('mode','DEFER','reason','MISSION_NOT_FINISHED','reserved',false);
 END IF;

 -- An official allocation receipt for THIS COMPLETION round marks its end.
 -- No unobserved elapsed week is inferred from a wall-clock assumption.
 SELECT max(a.observed_at),max(a.claim_block_number)
 INTO v_allocation_close,v_round_close_block
 FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=v_vote_round;
 IF v_allocation_close IS NULL OR
    clock_timestamp()<v_allocation_close+make_interval(hours=>v_cfg.grace_hours) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_OFFICIAL_ROUND_CLOSE',
     'voteRoundId',v_vote_round,'reserved',false);
 END IF;
 -- A receipt alone cannot prove that all finalized vote events were indexed.
 -- Otherwise an indexer delay can permanently exclude a later-synced winner
 -- after earlier entitlements have become immutable.
 IF v_round_close_block IS NULL OR
    p_finalized_block<v_round_close_block THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_ROUND_CLOSE_FINALITY',
     'voteRoundId',v_vote_round,'reserved',false);
 END IF;
 SELECT c.last_scanned_block INTO v_vote_scan_checkpoint
 FROM public.vote_reconcile_scan_checkpoints c WHERE c.network=p_network;
 IF v_vote_scan_checkpoint IS NULL OR
    v_vote_scan_checkpoint<v_round_close_block THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_VOTE_SCAN_CATCHUP',
     'voteRoundId',v_vote_round,'requiredBlock',v_round_close_block,
     'scannedBlock',v_vote_scan_checkpoint,'reserved',false);
 END IF;
 SELECT * INTO v_xcfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR v_xcfg.x_option_reserve_wei IS NULL
   OR v_xcfg.x_option_reserve_wei<0 THEN
   RAISE EXCEPTION 'VOTE_ROUND_X_RESERVE_UNAVAILABLE';
 END IF;

 -- Any existing reservation in this vote round must retain its original
 -- immutable amount: never mingle this new policy with legacy guarantees.
 SELECT count(*),count(*) FILTER (WHERE q.invite_code=v_code)
 INTO v_prior,v_prior_own
 FROM public.reward_queue_entries q
 JOIN public.invitations i ON i.invite_code=q.invite_code
 WHERE q.network=p_network AND i.vote_round_id=v_vote_round
   AND q.reserved_amount_wei IS NOT NULL AND q.status<>'CANCELLED';
 IF v_prior>0 THEN
   IF v_prior_own>0 THEN
     RETURN jsonb_build_object('mode','ALREADY_RESERVED','reason','IMMUTABLE_EXISTING',
       'reserved',true);
   END IF;
   RETURN jsonb_build_object('mode','BLOCKED','reason','MIXED_IMMUTABLE_ROUND',
     'reserved',false);
 END IF;

 -- Pending verified completions must never lose their equal share because
 -- Sybil/chain evidence sync lagged behind the first completed user.
 SELECT count(*) INTO v_completed FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED'
   AND i.reward_status NOT IN ('FORFEITED','PAID')
   AND i.ineligible_at IS NULL;
 IF v_completed=0 OR v_completed>5000 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','EMPTY_OR_UNBOUNDED_COMPLETIONS',
     'reserved',false);
 END IF;

 -- Vote completion must be proven on-chain IN the claimed final vote round,
 -- not only inferred from an app-side timestamp or original invite cohort.
 SELECT count(*) INTO v_vote_proofs FROM public.invitations i
 WHERE i.activation_network=p_network AND i.vote_round_id=v_vote_round
   AND i.vote_completed=true AND i.status<>'CANCELLED'
   AND i.sybil_status<>'BLOCKED'
   AND i.reward_status NOT IN ('FORFEITED','PAID')
   AND i.ineligible_at IS NULL
   AND EXISTS (
      SELECT 1 FROM public.invite_impact_events e
      WHERE e.invite_code=i.invite_code AND e.network=p_network
        AND e.event_type='ALLOCATION_VOTE' AND e.vote_round_id=v_vote_round
        AND e.block_number<=p_finalized_block);
 IF v_vote_proofs<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_FINAL_VOTE_PROOFS',
     'completed',v_completed,'proved',v_vote_proofs,'reserved',false);
 END IF;

 SELECT count(*),
   count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(c.invite_code)='x-promotion-additive-v2')
 INTO v_verified,v_legacy_verified
 FROM public.read_reward_vote_round_candidates_v1(p_network,v_vote_round) c
 JOIN public.invitations i ON i.invite_code=c.invite_code
 WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block;
 -- All entrants must have an unambiguous completion-round provenance.
 -- A pending Sybil or chain verification never gets silently priced as zero.
 IF v_verified<>v_completed THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_VERIFIED_COMPLETIONS',
     'completed',v_completed,'verified',v_verified,'reserved',false);
 END IF;

 v_fixed:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 v_provisional:=public.read_reward_elastic_contingent_liability_wei_v1(
   p_network,v_app);
 -- Shared-pool mode explicitly makes unfinished cohort budgets provisional
 -- (zero physical liability). The existing canonical reservation writer
 -- already accounts for real base/X/HELD obligations in v_fixed.
 -- Do not replace or weaken that writer. Fail closed if the config changes.
 IF v_provisional IS NULL OR v_provisional<>0 THEN
   RETURN jsonb_build_object('mode','BLOCKED',
     'reason','SHARED_POOL_UNEXPECTED_PROVISIONAL_LIABILITY','reserved',false);
 END IF;
 IF v_fixed<0 OR v_fixed>p_observed_pool_balance_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','FIXED_LIABILITY_UNDERFUNDED',
     'reserved',false);
 END IF;
 v_available:=p_observed_pool_balance_wei-v_fixed
   -v_legacy_verified*v_xcfg.x_option_reserve_wei;
 IF v_available<=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_SPENDABLE_POOL','reserved',false);
 END IF;
 v_quote:=public.calculate_reward_policy_aware_quote_v1(
   p_observed_pool_balance_wei-v_fixed,v_verified,v_legacy_verified,v_xcfg.x_option_reserve_wei);
 IF v_quote<v_xcfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','DEFER','reason','REWARD_UNDER_MINIMUM','reserved',false);
 END IF;

 FOR v_row IN
   SELECT c.invite_code,i.reward_cohort_round_id,
          i.reward_funding_allocation_receipt_id
   FROM public.read_reward_vote_round_candidates_v1(p_network,v_vote_round) c
   JOIN public.invitations i ON i.invite_code=c.invite_code
   WHERE i.vote_round_id=v_vote_round AND c.completion_block<=p_finalized_block
   ORDER BY c.completion_block,c.completion_tx_index,c.completion_clause_index,c.invite_code
 LOOP
   IF v_row.reward_cohort_round_id IS NULL OR
      v_row.reward_funding_allocation_receipt_id IS NULL THEN
     RAISE EXCEPTION 'VOTE_ROUND_COHORT_BINDING_MISSING';
   END IF;
   SELECT count(*) INTO v_held_count FROM reward_admission_bridge.holds h
   WHERE h.network=p_network AND h.invite_code=v_row.invite_code AND h.status='HELD';
   IF v_held_count>0 THEN RAISE EXCEPTION 'VOTE_ROUND_HELD_ENTRY_CONFLICT'; END IF;
   v_before:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
   v_cohort_reserved:=public.read_reward_cohort_committed_wei(p_network,v_app,
      v_row.reward_cohort_round_id,v_row.reward_funding_allocation_receipt_id);
   v_basis:=jsonb_build_object(
      'quoteKind','vote_round_close_equal_v1',
      'poolPolicy','shared-pool-v1',
      'roundClosePolicy','vote-round-close-equal-v1',
      'voteRoundId',v_vote_round::text,
      'batchVerifiedCount',v_verified,
      'quoteWei',v_quote::text,
      'cohortReservedWei',v_cohort_reserved::text,
      'fundingAllocationReceiptId',v_row.reward_funding_allocation_receipt_id::text,
      'rewardCohortRoundId',v_row.reward_cohort_round_id::text,
      'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
      'reservedBeforeWei',v_before::text,
      'xOptionReservedPerEligibleWei',v_xcfg.x_option_reserve_wei::text,
      'legacyXEligibleCount',v_legacy_verified,
      'legacyXReserveTotalWei',(v_legacy_verified*v_xcfg.x_option_reserve_wei)::text,
      'officialCloseObservedAt',v_allocation_close,
      'observationAt',p_observed_at);
   v_out:=public.commit_reward_reservation(
      v_row.invite_code,p_network,p_observed_pool_balance_wei,
      v_before,v_quote,'shared-pool-v1',null,p_finalized_block,v_basis);
   IF v_out IS NULL OR coalesce((v_out->>'reserved')::boolean,false) IS NOT TRUE THEN
     -- Transaction abort means no participant receives a partial quote.
     RAISE EXCEPTION 'VOTE_ROUND_CLOSE_ATOMIC_RESERVATION_FAILED:%',
       coalesce(v_out->>'reason','UNKNOWN');
   END IF;
   v_count:=v_count+1;
 END LOOP;
 IF v_count<>v_verified THEN RAISE EXCEPTION 'VOTE_ROUND_CLOSE_INCOMPLETE_BATCH'; END IF;
 RETURN jsonb_build_object('mode','ROUND_BATCH_RESERVED','reserved',true,
   'count',v_count,'voteRoundId',v_vote_round,'amountWei',v_quote::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_reward_vote_window_immediate_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
  app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  code text:=upper(btrim(coalesce(p_invite_code,'')));
  cfg reward_admission_bridge.vote_round_close_settings%rowtype;
  mode reward_admission_bridge.vote_window_immediate_settings%rowtype;
  q reward_admission_bridge.vote_window_fixed_quotes%rowtype;
  xcfg reward_admission_bridge.elastic_settlement_settings%rowtype;
  inv public.invitations%rowtype;
  eligible_potential bigint;
  legacy_potential bigint;
  existing_legacy bigint;
  fixed numeric(78,0);
  amount numeric(78,0);
  before_wei numeric(78,0);
  cohort_reserved numeric(78,0);
  basis jsonb;
  result jsonb;
BEGIN
 IF p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR code !~ '^[A-HJ-NP-Z2-9]{7}$'
   OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
   OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
   OR p_observed_at IS NULL OR
      p_observed_at<clock_timestamp()-interval '120 seconds' OR
      p_observed_at>clock_timestamp()+interval '10 seconds'
   OR p_finalized_block IS NULL OR p_finalized_block<1
 THEN RAISE EXCEPTION 'IMMEDIATE_WINDOW_INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 SELECT * INTO cfg FROM reward_admission_bridge.vote_round_close_settings WHERE id=1 FOR SHARE;
 SELECT * INTO mode FROM reward_admission_bridge.vote_window_immediate_settings WHERE id=1 FOR SHARE;
 IF cfg.id IS NULL OR mode.id IS NULL OR NOT cfg.enabled OR cfg.paused OR NOT mode.enabled THEN
   RETURN jsonb_build_object('mode','DISABLED','reserved',false);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
   WHERE s.id=1 AND s.enabled)
   OR EXISTS(SELECT 1 FROM public.reward_runtime_config r WHERE r.id=1
    AND (r.emergency_rewards_paused OR (p_network='mainnet' AND NOT r.mainnet_funded_rewards_enabled)))
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_CLOSED','reserved',false); END IF;

 SELECT * INTO inv FROM public.invitations i
   WHERE i.invite_code=code AND i.activation_network=p_network FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','BLOCKED','reason','INVITATION_MISSING','reserved',false); END IF;
 IF inv.vote_round_id IS NULL OR inv.vote_round_id<mode.first_vote_round_id
   OR inv.vote_round_id>mode.last_vote_round_id
   OR inv.reward_cohort_round_id IS NULL
   OR inv.reward_cohort_round_id<>inv.vote_round_id-1
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','OUTSIDE_CLOSED_ENTRY_COHORT','reserved',false); END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries qe
    WHERE qe.network=p_network AND qe.invite_code=code
      AND qe.reserved_amount_wei IS NOT NULL)
 THEN RETURN jsonb_build_object('mode','ALREADY_RESERVED','count',0,'reserved',true); END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.read_reward_vote_round_candidates_v1(p_network,inv.vote_round_id) c
  WHERE c.invite_code=code AND c.completion_block<=p_finalized_block)
 THEN RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_CANONICAL_FINAL_EVIDENCE','reserved',false); END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
   WHERE h.network=p_network AND h.invite_code=code AND h.status='HELD')
 THEN RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT','reserved',false); END IF;

 -- The complete *previous* invite cohort is known when the next vote
 -- round starts. Do not count older idle missions, unopened slots or
 -- future participants; include eligible, not-yet-finished participants.
 SELECT count(*),count(*) FILTER (WHERE public.reward_x_promotion_policy_for_invitation_v3(i.invite_code)='x-promotion-additive-v2')
 INTO eligible_potential,legacy_potential FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=inv.vote_round_id-1
   AND i.invitee_wallet IS NOT NULL AND i.eligibility_check_id IS NOT NULL
   AND i.status IN ('ACTIVATING','UNDER_REVIEW','COMPLETED')
   AND i.reward_status IN ('PENDING','ELIGIBLE')
   AND i.sybil_status<>'BLOCKED' AND i.ineligible_at IS NULL;
 IF eligible_potential<1 OR eligible_potential>5000 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','UNBOUNDED_ACTIVE_COHORT','reserved',false);
 END IF;
 SELECT count(*) INTO existing_legacy
 FROM public.reward_queue_entries qe
 JOIN public.invitations i ON i.invite_code=qe.invite_code
 WHERE qe.network=p_network AND i.vote_round_id=inv.vote_round_id
   AND qe.reserved_amount_wei IS NOT NULL AND qe.status<>'CANCELLED'
   AND coalesce(qe.reservation_basis->>'quoteKind','')<>'vote_window_immediate_v1';
 IF existing_legacy>0 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','MIXED_IMMUTABLE_QUOTE','reserved',false);
 END IF;
 SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
  WHERE x.network=p_network AND x.vote_round_id=inv.vote_round_id FOR UPDATE;
 IF NOT FOUND THEN
   SELECT * INTO xcfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
   IF xcfg.id IS NULL OR xcfg.x_option_reserve_wei IS NULL
      OR xcfg.x_option_reserve_wei<0 OR xcfg.min_real_reward_wei IS NULL
   THEN RAISE EXCEPTION 'IMMEDIATE_WINDOW_X_POLICY_MISSING'; END IF;
   fixed:=public.read_outstanding_reward_liability(p_network,app)::numeric;
   IF fixed<0 OR fixed>p_observed_pool_balance_wei THEN
     RETURN jsonb_build_object('mode','DEFER','reason','POOL_UNDERFUNDED','reserved',false);
   END IF;
   amount:=public.calculate_reward_policy_aware_quote_v1(
     p_observed_pool_balance_wei-fixed,eligible_potential,legacy_potential,xcfg.x_option_reserve_wei);
   IF amount<xcfg.min_real_reward_wei THEN
     RETURN jsonb_build_object('mode','DEFER','reason','POOL_INSUFFICIENT','reserved',false);
   END IF;
   INSERT INTO reward_admission_bridge.vote_window_fixed_quotes(
     network,vote_round_id,source_cohort_round_id,participant_count,quote_wei,
     x_reserve_per_participant_wei,observed_pool_wei,fixed_outstanding_wei,legacy_participant_count
   ) VALUES(p_network,inv.vote_round_id,inv.reward_cohort_round_id,
     eligible_potential,amount,xcfg.x_option_reserve_wei,
     p_observed_pool_balance_wei,fixed,legacy_potential);
   SELECT * INTO q FROM reward_admission_bridge.vote_window_fixed_quotes x
     WHERE x.network=p_network AND x.vote_round_id=inv.vote_round_id FOR UPDATE;
 END IF;
 IF q.source_cohort_round_id<>inv.reward_cohort_round_id
   OR eligible_potential>q.participant_count
   OR (q.legacy_participant_count is not null AND legacy_potential>q.legacy_participant_count) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','COHORT_MEMBER_COUNT_CHANGED','reserved',false);
 END IF;

 before_wei:=public.read_outstanding_reward_liability(p_network,app)::numeric;
 cohort_reserved:=public.read_reward_cohort_committed_wei(p_network,app,
   inv.reward_cohort_round_id,inv.reward_funding_allocation_receipt_id);
 basis:=jsonb_build_object(
   'quoteKind','vote_window_immediate_v1',
   'poolPolicy','shared-pool-v1',
   'voteRoundId',inv.vote_round_id::text,
   'participantCount',q.participant_count::text,
   'rewardCohortRoundId',inv.reward_cohort_round_id::text,
   'fundingAllocationReceiptId',inv.reward_funding_allocation_receipt_id::text,
   'cohortReservedWei',cohort_reserved::text,
   'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
   'reservedBeforeWei',before_wei::text,
   'xOptionReservedPerEligibleWei',q.x_reserve_per_participant_wei::text,
   'legacyXEligibleCount',coalesce(q.legacy_participant_count,q.participant_count),
   'legacyXReserveTotalWei',(coalesce(q.legacy_participant_count,q.participant_count)*q.x_reserve_per_participant_wei)::text,
   'quoteWei',q.quote_wei::text,
   'observationAt',p_observed_at);
 result:=public.commit_reward_reservation(code,p_network,p_observed_pool_balance_wei,
   before_wei,q.quote_wei,'shared-pool-v1',null,p_finalized_block,basis);
 IF result IS NULL OR coalesce((result->>'reserved')::boolean,false) IS NOT TRUE THEN
   RAISE EXCEPTION 'IMMEDIATE_WINDOW_ATOMIC_COMMIT_FAILED:%',
     coalesce(result->>'reason','UNKNOWN');
 END IF;
 RETURN jsonb_build_object('mode','IMMEDIATE_RESERVED','reserved',true,
   'count',1,'voteRoundId',inv.vote_round_id,'amountWei',q.quote_wei::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_shared_pool_capacity_shadow_v1(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
  v_app CONSTANT text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_forecast public.reward_pool_observations%rowtype;
  v_settings reward_admission_bridge.elastic_settlement_settings%rowtype;
  v_total_outstanding numeric(78,0);
  v_uncommitted_provisional numeric(78,0);
  v_fixed_outstanding numeric(78,0);
  v_pool numeric(78,0);
  v_capacity numeric(78,0);
  v_x_per_winner numeric(78,0);
  v_promotion_config public.reward_runtime_config%rowtype;
  v_prospective_x_reserve numeric(78,0);
  v_one numeric(78,0);
  v_two numeric(78,0);
  v_three numeric(78,0);
BEGIN
  p_network := lower(btrim(coalesce(p_network,'')));
  p_app_id := lower(btrim(coalesce(p_app_id,'')));
  IF p_network NOT IN ('mainnet','testnet','testnet-staging')
     OR p_app_id<>v_app THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_INVALID_SCOPE';
  END IF;

  SELECT * INTO v_forecast
  FROM public.reward_pool_observations f
  WHERE f.network=p_network AND f.app_id=v_app
  ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;

  IF NOT FOUND OR v_forecast.generated_at IS NULL
     OR v_forecast.generated_at < clock_timestamp()-interval '75 minutes'
     OR v_forecast.generated_at > clock_timestamp()+interval '2 minutes' THEN
    RETURN jsonb_build_object(
      'mode','PENDING','reason','FRESH_ONCHAIN_SNAPSHOT_REQUIRED',
      'writesPerformed',false);
  END IF;

  SELECT * INTO v_settings
  FROM reward_admission_bridge.elastic_settlement_settings
  WHERE id=1;
  IF NOT FOUND OR v_settings.x_option_reserve_wei IS NULL
     OR v_settings.x_option_reserve_wei<0 THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_X_POLICY_MISSING';
  END IF;

  v_pool := v_forecast.observed_pool_balance_wei;
  v_total_outstanding :=
    public.read_outstanding_reward_liability(p_network,v_app)::numeric;
  v_uncommitted_provisional :=
    public.read_reward_elastic_contingent_liability_wei_v1(p_network,v_app);
  IF v_pool < 0 OR v_total_outstanding < 0
     OR v_uncommitted_provisional < 0
     OR v_uncommitted_provisional > v_total_outstanding THEN
    RAISE EXCEPTION 'SHARED_POOL_SHADOW_ACCOUNTING_INCONSISTENT';
  END IF;

  -- Only existing confirmed unpaid reservations and LIVE X obligations
  -- remain unavailable. An uncompleted user's provisional cohort budget is
  -- NOT a payment obligation. Older source stress and virtual reserve-bank
  -- balances are NOT separately deducted; they remain historical audit data.
  -- This subtraction is done ONCE: a provisional cohort amount may also
  -- occur inside v_total_outstanding, so subtract it from that reader first.
  v_fixed_outstanding :=
    v_total_outstanding-v_uncommitted_provisional;
  v_capacity := greatest(v_pool-v_fixed_outstanding,0);
  select * into v_promotion_config from public.reward_runtime_config where id=1;
  if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
  -- These scenarios describe a prospective new invitation; actual active
  -- legacy participants are counted separately by the server forecast.
  -- Preserve the old RPC scenario fields for already-deployed clients.
  -- The new server uses explicit capacity + legacy enrollment count.
  v_x_per_winner := v_settings.x_option_reserve_wei;
  v_prospective_x_reserve := case when v_promotion_config.reward_x_promotion_v3_cutover_at is not null
    and now()>=v_promotion_config.reward_x_promotion_v3_cutover_at
    and (v_promotion_config.reward_x_promotion_v3_sunset_at is null or now()<v_promotion_config.reward_x_promotion_v3_sunset_at)
    then 0 else v_settings.x_option_reserve_wei end;

  v_one := greatest(v_capacity-v_x_per_winner,0);
  v_two := floor(greatest(v_capacity-2*v_x_per_winner,0)/2);
  v_three := floor(greatest(v_capacity-3*v_x_per_winner,0)/3);

  RETURN jsonb_build_object(
    'mode','SHADOW_ONLY','writesPerformed',false,
    'observedAt',v_forecast.generated_at,
    'poolWei',v_pool::text,
    'fixedOutstandingWei',v_fixed_outstanding::text,
    'discardedProvisionalCohortWei',v_uncommitted_provisional::text,
    'capacityBeforeNewXWei',v_capacity::text,
    'xOptionReservePerWinnerWei',v_x_per_winner::text,
    'legacyXReservePerWinnerWei',v_settings.x_option_reserve_wei::text,
    'prospectiveXReservePerWinnerWei',v_prospective_x_reserve::text,
    'promotionPolicyCutoverAt',v_promotion_config.reward_x_promotion_v3_cutover_at,
    'promotionPolicySunsetAt',v_promotion_config.reward_x_promotion_v3_sunset_at,
    'oneWinnerWei',v_one::text,
    'twoWinnersWei',v_two::text,
    'threeWinnersWei',v_three::text,
    'isPayoutQuote',false,
    'requiresAtomicWriterCutover',true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_elastic_public_scenarios_v1(p_network text, p_app_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_alloc public.vebetter_round_allocations%rowtype;
 v_forecast public.reward_pool_observations%rowtype;
 v_cohort bigint;
 v_committed numeric(78,0);
 v_budget numeric(78,0);
 v_outstanding numeric(78,0);
 v_confirmed_unsettled numeric(78,0) := 0;
 v_first_confirmed_at timestamptz;
 v_pre_broadcast_pool numeric(78,0);
 v_old numeric(78,0);
 v_recent numeric(78,0);
 v_bank numeric(78,0);
 v_pool numeric(78,0);
 v_accepted bigint;
 v_one numeric(78,0);
 v_two numeric(78,0);
 v_three numeric(78,0);
 v_physical numeric(78,0);
 v_uncommitted numeric(78,0);
 v_shared jsonb;
 v_promotion_config public.reward_runtime_config%rowtype;
 v_prospective_x_reserve numeric(78,0);
BEGIN
 p_network:=lower(btrim(coalesce(p_network,'')));
 p_app_id:=lower(btrim(coalesce(p_app_id,'')));
 IF p_network NOT IN ('mainnet','testnet','testnet-staging') OR p_app_id<>v_app
 THEN RAISE EXCEPTION 'ELASTIC_PUBLIC_ESTIMATE_SCOPE_INVALID'; END IF;
 -- The new payment writer and public estimator use the same shared pool
 -- physical-capacity inputs. Keep the historical response shape/UI unchanged.
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.shared_pool_settings s
           WHERE s.id=1 AND s.enabled) THEN
   v_shared := public.read_reward_shared_pool_capacity_shadow_v1(p_network,p_app_id);
   IF v_shared->>'mode'<>'SHADOW_ONLY' THEN
     RETURN jsonb_build_object('mode','PENDING','reason',
       coalesce(v_shared->>'reason','SHARED_POOL_UNAVAILABLE'));
   END IF;
   SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
    WHERE a.network=p_network AND a.app_id=v_app
    ORDER BY a.vebetter_round_id DESC,a.id DESC LIMIT 1;
   IF NOT FOUND THEN RETURN jsonb_build_object('mode','PENDING','reason','ALLOCATION_MISSING'); END IF;
   v_cohort:=v_alloc.vebetter_round_id+1;
   SELECT count(*) INTO v_accepted FROM public.invitations i
    WHERE i.activation_network=p_network AND i.reward_cohort_round_id=v_cohort
      AND i.reward_funding_allocation_receipt_id=v_alloc.id AND i.status<>'CANCELLED';
   RETURN jsonb_build_object(
      'mode','ELASTIC_SCENARIOS','rewardCohortRoundId',v_cohort,
      'acceptedParticipants',v_accepted,'observedAt',v_shared->>'observedAt',
      'oneWinnerWei',v_shared->>'oneWinnerWei',
      'twoWinnersWei',v_shared->>'twoWinnersWei',
      'threeWinnersWei',v_shared->>'threeWinnersWei',
      'xOptionReservePerWinnerWei',v_shared->>'xOptionReservePerWinnerWei',
      'capacityBeforeNewXWei',v_shared->>'capacityBeforeNewXWei',
      'legacyXReservePerWinnerWei',v_shared->>'legacyXReservePerWinnerWei',
      'prospectiveXReservePerWinnerWei',v_shared->>'prospectiveXReservePerWinnerWei',
      'promotionPolicyCutoverAt',v_shared->'promotionPolicyCutoverAt',
      'promotionPolicySunsetAt',v_shared->'promotionPolicySunsetAt',
      'finalPayoutNotGuaranteed',true,'writesPerformed',false);
 END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN RETURN jsonb_build_object('mode','LEGACY'); END IF;
 SELECT * INTO v_alloc FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
 ORDER BY a.vebetter_round_id DESC,a.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('mode','PENDING','reason','ALLOCATION_MISSING'); END IF;
 v_cohort:=v_alloc.vebetter_round_id+1;
 -- Old accepted, noncancelled participants get legacy pricing, never an
 -- inflated hypothetical elastic quote.
 IF EXISTS (SELECT 1 FROM public.invitations i
  WHERE i.activation_network=p_network
    AND i.reward_cohort_round_id=v_cohort
    AND i.reward_funding_allocation_receipt_id=v_alloc.id
    AND i.status<>'CANCELLED'
    AND (i.activated_at IS NULL OR i.activated_at<v_cfg.rollout_not_before))
 THEN RETURN jsonb_build_object('mode','LEGACY','reason','MIXED_HISTORICAL_COHORT'); END IF;
 SELECT * INTO v_forecast FROM public.reward_pool_observations f
 WHERE f.network=p_network AND f.app_id=v_app
 ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
 IF NOT FOUND OR v_forecast.generated_at<clock_timestamp()-interval '75 minutes'
   OR v_forecast.generated_at>clock_timestamp()+interval '2 minutes'
   OR v_forecast.projected_funding_round_id<>v_cohort THEN
   RETURN jsonb_build_object('mode','PENDING','reason','FRESH_CHAIN_OBSERVATION_REQUIRED');
 END IF;
 v_pool:=v_forecast.observed_pool_balance_wei;
 v_committed:=public.read_reward_cohort_committed_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(p_network,v_app,v_cohort,v_alloc.id);
 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 -- Display-only correction. Canonical-successful, still-unfinalized B3TR
 -- transfers already reduce the observed on-chain pool, but their immutable
 -- reserved base amount stays in outstanding liabilities until full finality.
 -- Never change the payout/liability authority; eliminate the duplicate
 -- subtraction ONLY after an independent earlier pool snapshot proves that
 -- at least the same amount actually left the physical pool.
 SELECT coalesce(sum(q.reserved_amount_wei),0),min(rr.broadcast_confirmed_at)
 INTO v_confirmed_unsettled,v_first_confirmed_at
 FROM public.reward_queue_entries q
 JOIN public.reward_payouts rp ON rp.invite_code=q.invite_code
   AND rp.round_id=q.assigned_round_id
 JOIN public.reward_rounds rr ON rr.id=rp.round_id
 WHERE q.network=p_network AND q.status='ASSIGNED'
   AND q.reserved_amount_wei IS NOT NULL
   AND rr.network=p_network AND rr.app_id=v_app
   AND rr.broadcast_confirmed_at IS NOT NULL
   AND rr.broadcast_confirmed_at<=v_forecast.generated_at
   AND rp.status IN ('PENDING','SENDING')
   AND rp.amount_wei=q.reserved_amount_wei;
 IF v_confirmed_unsettled>0 THEN
   SELECT f.observed_pool_balance_wei INTO v_pre_broadcast_pool
   FROM public.reward_pool_observations f
   WHERE f.network=p_network AND f.app_id=v_app
     AND f.generated_at<v_first_confirmed_at
   ORDER BY f.generated_at DESC,f.id DESC LIMIT 1;
   IF v_pre_broadcast_pool IS NOT NULL
      AND v_pre_broadcast_pool>=v_pool+v_confirmed_unsettled
      AND v_outstanding>=v_confirmed_unsettled THEN
      v_outstanding:=v_outstanding-v_confirmed_unsettled;
   END IF;
 END IF;
 v_recent:=public.read_reward_boost_reserve_recent_protected_wei(p_network,v_app,v_cohort);
 v_bank:=public.read_reward_boost_reserve_bank_stress_reserve_wei(p_network,v_app);
 v_old:=reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
    p_network,v_app,v_cohort);
 SELECT count(*) INTO v_accepted
 FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=v_cohort
   AND i.reward_funding_allocation_receipt_id=v_alloc.id
   AND i.status<>'CANCELLED';
 IF v_committed<>0 OR v_budget<=0 OR v_pool<=0 OR v_outstanding<0
   OR v_recent<0 OR v_bank<0 OR v_old<0 THEN
   RETURN jsonb_build_object('mode','PENDING','reason','CURRENT_COHORT_ACCOUNTING_NOT_PREVIEWABLE');
 END IF;
 -- Financial capacity already reduced by exact unpaid base/X, unweighted
 -- historical worst-case payouts, recent protected and bank-stress balance.
 v_uncommitted:=greatest(v_budget-v_committed,0);
 v_physical:=greatest(v_pool-v_outstanding-v_old-v_recent-v_bank,0);
 select * into v_promotion_config from public.reward_runtime_config where id=1;
 if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
 v_prospective_x_reserve:=case when v_promotion_config.reward_x_promotion_v3_cutover_at is not null
   and now()>=v_promotion_config.reward_x_promotion_v3_cutover_at
   and (v_promotion_config.reward_x_promotion_v3_sunset_at is null or now()<v_promotion_config.reward_x_promotion_v3_sunset_at)
   then 0 else v_cfg.x_option_reserve_wei end;
 -- Keep old response fields intact across the DB-first deployment.
 v_one:=greatest(least(v_uncommitted,v_physical)-v_cfg.x_option_reserve_wei,0);
 v_two:=div(greatest(least(v_uncommitted,v_physical)-2*v_cfg.x_option_reserve_wei,0),2);
 v_three:=div(greatest(least(v_uncommitted,v_physical)-3*v_cfg.x_option_reserve_wei,0),3);
 IF v_one<=0 AND least(v_uncommitted,v_physical)<=v_prospective_x_reserve THEN RETURN jsonb_build_object('mode','PENDING','reason','NO_SAFE_ESTIMATED_PAYOUT'); END IF;
 RETURN jsonb_build_object(
  'mode','ELASTIC_SCENARIOS',
  'rewardCohortRoundId',v_cohort,
  'observedAt',v_forecast.generated_at,
  'acceptedParticipants',v_accepted,
  'oneWinnerWei',v_one::text,'twoWinnersWei',v_two::text,'threeWinnersWei',v_three::text,
  'xOptionReservePerWinnerWei',v_cfg.x_option_reserve_wei::text,
  'prospectiveXReservePerWinnerWei',v_prospective_x_reserve::text,
  'capacityBeforeNewXWei',least(v_uncommitted,v_physical)::text,
  'legacyXReservePerWinnerWei',v_cfg.x_option_reserve_wei::text,
  'promotionPolicyCutoverAt',v_promotion_config.reward_x_promotion_v3_cutover_at,
  'promotionPolicySunsetAt',v_promotion_config.reward_x_promotion_v3_sunset_at,
  'settlementEarliestHoursAfterOfficialClose',v_cfg.close_grace_hours,
  'finalPayoutNotGuaranteed',true,'writesPerformed',false
 );
END $function$;

CREATE OR REPLACE FUNCTION public.commit_reward_elastic_closed_cohort_v1(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_observed_at timestamp with time zone, p_finalized_block bigint, p_legacy_amount_wei numeric, p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE
 v_app constant text:='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
 v_cfg reward_admission_bridge.elastic_settlement_settings%rowtype;
 v_runtime public.reward_runtime_config%rowtype;
 v_inv public.invitations%rowtype;
 v_closed_at timestamptz;
 v_unresolved bigint;
 v_valid bigint;
 v_unfixed bigint;
 v_legacy_unfixed_or_unresolved bigint;
 v_committed numeric(78,0);
 v_budget numeric(78,0);
 v_outstanding numeric(78,0);
 v_own_contingent numeric(78,0);
 v_source_stress numeric(78,0);
 v_recent_stress numeric(78,0);
 v_bank_stress numeric(78,0);
 v_total_stress numeric(78,0);
 v_x_reserve numeric(78,0);
 v_budget_headroom numeric(78,0);
 v_physical_headroom numeric(78,0);
 v_quote numeric(78,0);
 v_basis jsonb;
 v_output jsonb;
BEGIN
 IF p_invite_code IS NULL OR p_invite_code !~ '^[A-Z0-9-]{6,48}$'
   OR p_network NOT IN ('mainnet','testnet','testnet-staging')
   OR p_basis IS NULL OR jsonb_typeof(p_basis)<>'object'
   OR p_legacy_amount_wei IS NULL OR p_legacy_amount_wei<=0
   OR p_legacy_amount_wei<>trunc(p_legacy_amount_wei)
   OR p_observed_pool_balance_wei IS NULL OR p_observed_pool_balance_wei<0
   OR p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei)
   OR p_finalized_block IS NULL OR p_finalized_block<1
   OR p_observed_at IS NULL
   OR p_observed_at<clock_timestamp()-interval '120 seconds'
   OR p_observed_at>clock_timestamp()+interval '10 seconds'
 THEN RAISE EXCEPTION 'ELASTIC_CLOSURE_INPUT_INVALID'; END IF;
 SELECT * INTO v_cfg FROM reward_admission_bridge.elastic_settlement_settings WHERE id=1;
 IF NOT FOUND OR NOT v_cfg.enabled THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','ELASTIC_DISABLED');
 END IF;
 -- No parallel early guaranteed HELD and final elastic closure in first rollout.
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.settings WHERE id=1 AND enabled=true) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','PARALLEL_ADMISSION_AUTHORITY');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('veinvite_reward_reservation_'||p_network,0));
 SELECT * INTO v_runtime FROM public.reward_runtime_config WHERE id=1;
 IF NOT FOUND OR v_runtime.emergency_rewards_paused
   OR (p_network='mainnet' AND NOT v_runtime.mainnet_funded_rewards_enabled) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','RUNTIME_PAUSED');
 END IF;
 SELECT * INTO v_inv FROM public.invitations
 WHERE invite_code=p_invite_code AND activation_network=p_network
 FOR UPDATE;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','INVITE_NOT_FOUND');
 END IF;
 IF v_inv.activated_at IS NULL OR
    v_inv.activated_at<v_cfg.rollout_not_before THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','PRE_ROLLOUT');
 END IF;
 IF v_inv.status<>'COMPLETED' OR v_inv.sybil_status<>'CLEAR'
   OR v_inv.reward_status<>'ELIGIBLE'
   OR v_inv.reward_eligible_at IS NULL
   OR NOT v_inv.vote_completed
   OR v_inv.reward_cohort_round_id IS NULL
   OR v_inv.reward_funding_allocation_receipt_id IS NULL THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','MISSING_VERIFIED_COMPLETION');
 END IF;
 IF EXISTS(SELECT 1 FROM reward_admission_bridge.holds h
    WHERE h.network=p_network AND h.invite_code=p_invite_code AND h.status='HELD') THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','HELD_ADMISSION_CONFLICT');
 END IF;
 IF EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=p_invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=p_invite_code)
   OR EXISTS(SELECT 1 FROM public.reward_recovery_settlements r WHERE r.invite_code=p_invite_code)
 THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','ALREADY_FIXED');
 END IF;
 -- Never mix a new pricing scheme with older participants in the same
 -- funding cohort. Existing accepted users keep their original quote.
 IF EXISTS(SELECT 1 FROM public.invitations old
    WHERE old.activation_network=p_network
      AND old.reward_cohort_round_id=v_inv.reward_cohort_round_id
      AND old.reward_funding_allocation_receipt_id=v_inv.reward_funding_allocation_receipt_id
      AND old.status<>'CANCELLED'
      AND (old.activated_at IS NULL OR old.activated_at<v_cfg.rollout_not_before)) THEN
   RETURN jsonb_build_object('mode','LEGACY','reason','MIXED_HISTORICAL_COHORT');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.vebetter_round_allocations a
    WHERE a.network=p_network AND a.app_id=v_app
      AND a.id=v_inv.reward_funding_allocation_receipt_id
      AND a.vebetter_round_id+1=v_inv.reward_cohort_round_id) THEN
   RETURN jsonb_build_object('mode','BLOCKED','reason','INVALID_FUNDING_RECEIPT');
 END IF;
 -- The official allocation receipt for this cohort's END round, observed
 -- for 24-168h, is necessary before closing eligibility.
 SELECT max(a.observed_at) INTO v_closed_at
 FROM public.vebetter_round_allocations a
 WHERE a.network=p_network AND a.app_id=v_app
   AND a.vebetter_round_id=v_inv.reward_cohort_round_id;
 IF v_closed_at IS NULL OR
   clock_timestamp()<v_closed_at+make_interval(hours=>v_cfg.close_grace_hours) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','WAIT_FOR_OFFICIAL_COHORT_CLOSE');
 END IF;
 -- Every known participant must be terminal or fully, independently clear.
 -- Never transfer unfinished/under-review recipients' share to early winners.
 SELECT
 count(*) FILTER (WHERE i.status <> 'CANCELLED' AND i.sybil_status <> 'BLOCKED' AND NOT
   (i.status='COMPLETED' AND i.sybil_status='CLEAR' AND i.vote_completed
     AND i.reward_eligible_at IS NOT NULL)),
 count(*) FILTER (WHERE i.status='COMPLETED' AND i.sybil_status='CLEAR'
   AND i.vote_completed AND i.reward_eligible_at IS NOT NULL),
 count(*) FILTER (WHERE i.status='COMPLETED' AND i.sybil_status='CLEAR'
   AND i.vote_completed AND i.reward_eligible_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q
     WHERE q.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p
     WHERE p.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_recovery_settlements r
     WHERE r.invite_code=i.invite_code))
,
 count(*) FILTER (WHERE i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
   AND public.reward_x_promotion_policy_for_invitation_v3(i.invite_code)='x-promotion-additive-v2'
   AND NOT EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
   AND NOT EXISTS(SELECT 1 FROM public.reward_recovery_settlements r WHERE r.invite_code=i.invite_code))
 INTO v_unresolved,v_valid,v_unfixed,v_legacy_unfixed_or_unresolved
 FROM public.invitations i
 WHERE i.activation_network=p_network
   AND i.reward_cohort_round_id=v_inv.reward_cohort_round_id
   AND i.reward_funding_allocation_receipt_id=v_inv.reward_funding_allocation_receipt_id;
 IF v_valid=0 OR v_unfixed=0 THEN
   RETURN jsonb_build_object('mode','DEFER','reason','NO_UNFIXED_VERIFIED_WINNER');
 END IF;
 -- Default OFF until every external fund mover respects contingent slots.
 IF v_unresolved>0 AND NOT v_cfg.allow_protected_partial_settlement THEN
   RETURN jsonb_build_object('mode','DEFER','reason','UNRESOLVED_OR_EMPTY_RECIPIENT_SET',
     'unresolved',v_unresolved);
 END IF;
 v_committed:=public.read_reward_cohort_committed_wei(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 v_budget:=public.read_reward_cohort_effective_budget_wei(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);

 v_outstanding:=public.read_outstanding_reward_liability(p_network,v_app)::numeric;
 v_own_contingent:=public.read_reward_elastic_contingent_scope_liability_wei_v1(
   p_network,v_app,v_inv.reward_cohort_round_id,
   v_inv.reward_funding_allocation_receipt_id);
 IF v_own_contingent>v_outstanding THEN
   RAISE EXCEPTION 'ELASTIC_SELF_CONTINGENT_EXCEEDS_GLOBAL';
 END IF;
 -- Protect every CURRENT nonterminal unpaid older cohort recipient. Terminal
  -- canceled, blocked or paid users no longer keep phantom collateral.
  v_source_stress:=reward_admission_bridge.read_legacy_live_unpaid_stress_wei_v1(
    p_network,v_app,v_inv.reward_cohort_round_id);
 v_recent_stress:=public.read_reward_boost_reserve_recent_protected_wei(
   p_network,v_app,v_inv.reward_cohort_round_id);
 v_bank_stress:=public.read_reward_boost_reserve_bank_stress_reserve_wei(
   p_network,v_app);
 v_total_stress:=v_source_stress+v_recent_stress+v_bank_stress;
 v_x_reserve:=v_legacy_unfixed_or_unresolved*v_cfg.x_option_reserve_wei;
 v_budget_headroom:=greatest(v_budget-v_committed-v_x_reserve,0);
 -- The global physical reader already protects the entire current cohort.
 -- Release that same cohort's contingent amount ONCE for pricing; the
 -- original canonical signer still sees the full global outstanding.
 v_physical_headroom:=greatest(
   p_observed_pool_balance_wei-v_outstanding+v_own_contingent
   -v_total_stress-v_x_reserve,0);
 v_quote:=floor(least(v_budget_headroom,v_physical_headroom)/(v_unfixed+v_unresolved));
 -- A verified, closed cohort must not fall back to legacy forecast spending
 -- after X-option collateral has been budgeted. Even with many participants
 -- it must reserve all remaining recipients' gross and future X options.
 IF v_quote<v_cfg.min_real_reward_wei THEN
   RETURN jsonb_build_object('mode','BLOCKED',
     'reason','COHORT_X_AND_OLDER_PROTECTION_UNDERFUNDED');
 END IF;
 v_basis:=p_basis || jsonb_build_object(
   'cohortReservedWei',v_committed::text,
   'elasticClosure',jsonb_build_object(
     'policy','elastic-closed-cohort-v1',
     'officialClosureAt',v_closed_at,
     'verifiedRecipients',v_valid,
     'unfixedRecipients',v_unfixed,
     'contingentUnresolvedRecipients',v_unresolved,
     'remainingProtectedSlots',v_unfixed+v_unresolved,
     'ownContingentAlreadyReservedWei',v_own_contingent::text,
     'xOptionProtectedWei',v_x_reserve::text,
     'olderWorstCaseWei',v_total_stress::text,
     'grossQuoteWei',v_quote::text));
 v_output:=public.commit_reward_reservation_with_late_reserve(
   p_invite_code,p_network,p_observed_pool_balance_wei,
   v_outstanding,v_quote,'elastic-closed-cohort-v1',null,
   p_finalized_block,v_basis);
 IF v_output IS NULL OR jsonb_typeof(v_output)<>'object' THEN
   RAISE EXCEPTION 'ELASTIC_CANONICAL_WRITER_MALFORMED';
 END IF;
 RETURN v_output || jsonb_build_object('mode','ELASTIC',
   'elasticGrossWei',v_quote::text,'officialCohort',v_inv.reward_cohort_round_id::text);
END $function$;
