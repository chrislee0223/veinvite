-- STAGED ONLY. The actual production vote-round-close policy remains the
-- sole authority for post-125 batch pricing. No alternative single-recipient
-- payout, changed policy, early withdrawal or reduced Sybil gate.
BEGIN;
DO $snapshot$
BEGIN
 IF md5(pg_get_functiondef('public.commit_reward_vote_round_close_batch_v1(text,text,numeric,timestamp with time zone,bigint)'::regprocedure)) IS DISTINCT FROM '5f655d15c7600117037e8eacb6d44f74' THEN RAISE EXCEPTION 'MISSION_RETRY_ROUND_CLOSE_SOURCE_CHANGED:commit_reward_vote_round_close_batch_v1'; END IF;
 IF md5(pg_get_functiondef('public.read_reward_vote_round_candidates_v1(text,bigint)'::regprocedure)) IS DISTINCT FROM '0ef5491881f705c23cbc569767038a01' THEN RAISE EXCEPTION 'MISSION_RETRY_ROUND_CLOSE_SOURCE_CHANGED:read_reward_vote_round_candidates_v1'; END IF;
END;
$snapshot$;

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

 -- Retry vote evidence is stored separately from the original invite.
 -- Before fixing amounts for this round, every durable retry in the window
 -- must have either a published verified vote or a finalized full-window scan.
 -- Otherwise the batch could omit an eligible late-indexed retry.
 IF EXISTS (
   SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
   JOIN public.invitations i ON i.id=a.invitation_id AND i.activation_network=a.network
   WHERE a.network=p_network AND a.vote_round_id=v_vote_round
     AND i.status<>'CANCELLED' AND i.sybil_status<>'BLOCKED'
     AND i.reward_status NOT IN('FORFEITED','PAID') AND i.ineligible_at IS NULL
     AND (
       (EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
         WHERE e.attempt_id=a.id AND e.event_type='ALLOCATION_VOTE')
        AND NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_settlement_bindings_v1 b
         WHERE b.attempt_id=a.id AND b.invitation_id=i.id
           AND b.completion_round_id=v_vote_round
           AND i.vote_completed IS TRUE AND i.vote_round_id=v_vote_round
           AND i.vote_completed_block=b.completion_block))
       OR
       (NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempt_events_v1 e
         WHERE e.attempt_id=a.id AND e.event_type='ALLOCATION_VOTE')
        AND (a.vote_window_end_block IS NULL OR a.proof_finalized_through_block IS NULL
          OR a.proof_finalized_through_block<a.vote_window_end_block))
     )
 ) THEN
   RETURN jsonb_build_object('mode','DEFER','reason','AWAIT_RETRY_VOTE_SCAN','reserved',false);
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
      SELECT 1 FROM public.read_mission_effective_proof_events_v1(i.invite_code,p_network) e
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
   SELECT c.invite_code,c.reward_cohort_round_id,
          c.reward_funding_allocation_receipt_id
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

CREATE OR REPLACE FUNCTION public.read_reward_vote_round_candidates_v1(p_network text, p_vote_round_id bigint)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer, reward_cohort_round_id bigint, reward_funding_allocation_receipt_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network,
           p_vote_round_id AS target_round_id
  )
  select
    i.invite_code,
    completion.block_number::bigint,
    completion.tx_index::integer,
    completion.clause_index::integer,
    funding.reward_cohort_round_id,
    funding.reward_funding_allocation_receipt_id
  from public.invitations i
  cross join parameters p
  cross join lateral public.read_effective_mission_reward_funding_v1(i.invite_code,p.network) funding
  left join public.sybil_v2_referral_assessments a
    on a.invite_code=i.invite_code
  left join public.sybil_v2_reward_clearances c
    on c.invite_code=i.invite_code
   and c.network=p.network
   and c.verdict='CLEAR'
   and c.verdict=a.state
   and c.assessment_revision=a.revision
  cross join lateral (
    select e.block_number,e.tx_index,e.clause_index
    from public.read_mission_effective_proof_events_v1(i.invite_code,p.network) e
    where e.invite_code=i.invite_code
      and e.network=p.network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1
  ) completion
  where i.activation_network=p.network
    and i.vote_round_id=p.target_round_id
    and i.vote_completed=true
    and p.target_round_id>0
    and i.status='COMPLETED'
    and i.reward_status='ELIGIBLE'
    and i.reward_eligible_at is not null
    and i.sybil_status='CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null
    and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and funding.reward_cohort_round_id is not null
    and funding.reward_funding_allocation_receipt_id is not null
    and (funding.attempt_id is null or
      (funding.reward_cohort_round_id=p.target_round_id
       and c.id is not null and c.evidence_cutoff_block>=funding.completion_block
       and public.mission_retry_assessment_is_current_v1(i.invite_code,p.network,c.assessment_revision)))
    and (
      not public.sybil_v2_enforcement_enabled()
      or (a.state='CLEAR' and c.id is not null)
    )
    and (
      not public.sybil_v2_enforcement_enabled()
      or not exists (
        select 1
        from public.sybil_v2_wallet_restrictions r
        where r.network=p.network
          and r.status='ACTIVE'
          and r.wallet_address in (
            lower(i.inviter_wallet),
            lower(i.invitee_wallet)
          )
      )
    )
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_recovery_settlements s
      where s.invite_code=i.invite_code
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code=i.invite_code
    )
  order by completion.block_number,completion.tx_index,completion.clause_index,i.invite_code
  ;
$function$;

COMMIT;
