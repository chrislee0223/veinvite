-- DRAFT: original completion and reservation adapters. Never apply independently.
-- commit_reward_reservation 7491f82f45b99e55434c212c166328f1
-- guard_legacy_mission_auto_reset_promotion_v1 938b83d2fe6a7d1f106de6a6b235bc9b
-- issue_sybil_v2_reward_clearance 496636f55ba002886a23fa42cc2f4c0e
-- read_mission_effective_proof_events_v1 7c2da18fbe41a72457b939fe9cfceb22
-- read_reward_reservation_candidates_v2 a3a6d63eaa275f8342c8e5d092e169b3
-- read_reward_vote_round_candidates_v1 1e20aecc492b4431bb6dbad4964eca13
CREATE OR REPLACE FUNCTION public.original_two_round_resolution_exists_v1(p_code text,p_network text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $body$
 SELECT EXISTS(SELECT 1 FROM public.invitations i JOIN reward_admission_bridge.mission_two_round_resolution_v1 r
 ON r.invitation_id=i.id AND r.network=i.activation_network AND r.dapp_round_id=i.reward_cohort_round_id
 WHERE i.invite_code=p_code AND i.activation_network=p_network
 AND NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a WHERE a.invitation_id=i.id AND a.network=p_network));
$body$;
REVOKE ALL ON FUNCTION public.original_two_round_resolution_exists_v1(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.original_two_round_resolution_exists_v1(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.read_mission_effective_proof_events_v1(p_invite_code text, p_network text)
 RETURNS TABLE(invite_code text, network text, wallet_address text, event_type text, tx_id text, block_number bigint, block_timestamp timestamp with time zone, app_id text, vote_round_id bigint, amount_wei text, tx_index bigint, clause_index bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
 WITH latest AS (
   SELECT a.id,a.invitation_id,a.network,a.invite_code
   FROM reward_admission_bridge.mission_retry_attempts_v1 a
   WHERE a.invite_code=p_invite_code AND a.network=p_network
   ORDER BY a.attempt_no DESC LIMIT 1
 ), original AS (
   SELECT i.invite_code,i.activation_network,lower(i.invitee_wallet) wallet_address,r.events
   FROM public.invitations i JOIN reward_admission_bridge.mission_two_round_resolution_v1 r
     ON r.invitation_id=i.id AND r.network=i.activation_network AND r.dapp_round_id=i.reward_cohort_round_id
   WHERE i.invite_code=p_invite_code AND i.activation_network=p_network
     AND NOT EXISTS(SELECT 1 FROM latest)
 )
 SELECT e.invite_code,e.network,e.wallet_address,e.event_type,e.tx_id,
   e.block_number,e.block_timestamp,e.app_id,e.vote_round_id,e.amount_wei,
   e.tx_index,e.clause_index
 FROM public.invite_impact_events e
 WHERE e.invite_code=p_invite_code AND e.network=p_network
   AND NOT EXISTS(SELECT 1 FROM latest) AND NOT EXISTS(SELECT 1 FROM original)
 UNION ALL
 SELECT o.invite_code,o.activation_network,o.wallet_address,x.event_type,x.tx_id,
   x.block_number,x.block_timestamp,x.app_id,x.vote_round_id,x.amount_wei,x.tx_index,x.clause_index
 FROM original o CROSS JOIN LATERAL jsonb_to_recordset(o.events) AS x(event_type text,tx_id text,block_number bigint,
   block_timestamp timestamptz,app_id text,vote_round_id bigint,amount_wei text,tx_index bigint,clause_index bigint)
 UNION ALL
 SELECT a.invite_code,a.network,lower(i.invitee_wallet),e.event_type,e.tx_id,
   e.block_number,e.block_timestamp,e.app_id,e.vote_round_id,e.amount_wei,
   e.tx_index::bigint,e.clause_index::bigint
 FROM latest a
 JOIN public.invitations i ON i.id=a.invitation_id AND i.invite_code=a.invite_code
    AND i.activation_network=a.network
 JOIN reward_admission_bridge.mission_retry_settlement_bindings_v1 b
    ON b.attempt_id=a.id AND b.invitation_id=i.id AND b.network=a.network
 JOIN reward_admission_bridge.mission_retry_attempt_events_v1 e ON e.attempt_id=a.id
 WHERE e.block_number<=b.finalized_through_block;
$function$;


CREATE OR REPLACE FUNCTION public.guard_legacy_mission_auto_reset_promotion_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reward_admission_bridge'
AS $function$
DECLARE revision bigint;
BEGIN
 -- Original pending missions use only the verified N/N+1 receipt.
 IF ((new.status='COMPLETED' AND old.status IS DISTINCT FROM 'COMPLETED')
      OR (new.reward_status='ELIGIBLE' AND old.reward_status IS DISTINCT FROM 'ELIGIBLE'))
   AND new.reward_cohort_round_id IS NOT NULL AND new.eligibility_check_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND two_round_policy_enabled)
   AND NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
     WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
  IF NOT EXISTS (
   SELECT 1 FROM reward_admission_bridge.mission_two_round_resolution_v1 r
   WHERE r.invitation_id=new.id AND r.network=new.activation_network
    AND r.dapp_round_id=new.reward_cohort_round_id AND r.complete
    AND new.vote_round_id=r.dapp_round_id+1 AND new.vote_completed IS TRUE
    AND new.apps_completed=3 AND new.vot3_converted IS TRUE
    AND new.apps_completed_block=(SELECT max(x.block_number) FROM jsonb_to_recordset(r.events) AS x(event_type text,block_number bigint) WHERE x.event_type='DAPP_REWARD')
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset(r.events) AS x(event_type text,block_number bigint,block_timestamp timestamptz,tx_id text)
      WHERE x.event_type='ALLOCATION_VOTE' AND x.block_number=new.vote_completed_block AND x.block_timestamp=new.vote_completed_at)
    AND EXISTS(SELECT 1 FROM jsonb_to_recordset(r.events) AS x(event_type text,block_number bigint,tx_id text)
      WHERE x.event_type='VOT3_CONVERSION' AND x.block_number=new.vot3_converted_block AND x.tx_id=new.vot3_conversion_tx_id)
    AND new.sybil_checked_at>=greatest(new.vote_completed_at,new.apps_completed_at)
  ) THEN RAISE EXCEPTION 'ORIGINAL_MISSION_FINALIZED_PROOF_REQUIRED'; END IF;
 END IF;
 -- Only gate a NEW admission, not a later canonical PAID transition.
 IF ((new.status='COMPLETED' AND old.status IS DISTINCT FROM 'COMPLETED')
      OR (new.reward_status='ELIGIBLE' AND old.reward_status IS DISTINCT FROM 'ELIGIBLE'))
  AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
    WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
   SELECT s.revision INTO revision FROM public.sybil_v2_referral_assessments s
   WHERE s.invite_code=new.invite_code AND s.network=new.activation_network;
   IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1 WHERE id=1 AND enabled)
    OR NOT public.sybil_v2_enforcement_enabled()
    OR NOT public.mission_retry_assessment_is_current_v1(new.invite_code,new.activation_network,revision)
    OR new.status IS DISTINCT FROM 'COMPLETED' OR new.reward_status IS DISTINCT FROM 'ELIGIBLE'
    OR new.sybil_status IS DISTINCT FROM 'CLEAR'
    OR NOT coalesce(public.security_identity_v2_observation_complete(new.identity_link_status,
      new.identity_link_checked_at,new.vote_completed_at,new.identity_link_policy_version,
      new.identity_link_evidence),false)
   THEN RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_PAYOUT_NOT_ENABLED'; END IF;
 END IF;
 -- The immutable payout is already reserved and the slot released at this
 -- point. Require its finalized receipt rather than re-running admission.
 -- This remains enforced even if auto-reset is paused after reservation.
 IF new.reward_status='PAID' AND old.reward_status IS DISTINCT FROM 'PAID'
   AND EXISTS(SELECT 1 FROM reward_admission_bridge.mission_retry_attempts_v1 a
     WHERE a.invitation_id=new.id AND a.network=new.activation_network)
 THEN
   IF NOT EXISTS(
     SELECT 1 FROM public.reward_payouts p
     JOIN public.reward_receipts r ON r.payout_id=p.id AND r.invite_code=p.invite_code
      AND r.recipient_wallet=p.recipient_wallet AND r.tx_id=p.tx_id
      AND r.paid_at=p.paid_at AND r.amount_wei=p.amount_wei
     WHERE p.invite_code=new.invite_code AND p.status='PAID'
       AND p.paid_at IS NOT NULL AND p.tx_id IS NOT NULL
       AND r.network=new.activation_network AND p.recipient_wallet=lower(new.inviter_wallet)
   ) THEN RAISE EXCEPTION 'MISSION_RETRY_FINALIZED_PAID_RECEIPT_REQUIRED'; END IF;
 END IF;
 RETURN new;
END;
$function$;


CREATE OR REPLACE FUNCTION public.commit_reward_reservation(p_invite_code text, p_network text, p_observed_pool_balance_wei numeric, p_expected_reserved_before_wei numeric, p_amount_wei numeric, p_algorithm_version text, p_quote_snapshot_id bigint, p_finalized_block bigint, p_basis jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
  v_existing_settlement public.reward_recovery_settlements%rowtype;
  v_settlement public.reward_recovery_settlements%rowtype;
  v_allocation_receipt public.vebetter_round_allocations%rowtype;
  v_obligation record;
  v_entry_class text;

  v_reserved numeric(78,0) := 0;
  v_elastic_self_escrow numeric(78,0) := 0;
  v_spendable_wei numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_recovery_balance numeric(78,0) := 0;
  v_offset numeric(78,0) := 0;
  v_net numeric(78,0) := 0;
  v_remaining_offset numeric(78,0) := 0;
  v_take numeric(78,0) := 0;
  v_cohort_committed numeric(78,0) := 0;
  v_expected_cohort_committed numeric(78,0) := 0;
  v_adjustment numeric(78,0) := 0;
  v_budget numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_completion_tx_id text;
  v_mainnet_enabled boolean;
  v_emergency_paused boolean;
  v_sybil_v2_enforced boolean := false;
  v_recovery_enabled boolean := false;
  v_now timestamptz := clock_timestamp();
  v_shared_pool_active boolean := false;
  v_basis jsonb;
begin
  if v_code is null or v_code='' then raise exception 'INVITE_CODE_REQUIRED'; end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then raise exception 'UNSUPPORTED_NETWORK'; end if;
  if p_observed_pool_balance_wei is null or p_observed_pool_balance_wei<0 or p_observed_pool_balance_wei<>trunc(p_observed_pool_balance_wei) then raise exception 'INVALID_OBSERVED_POOL_BALANCE'; end if;
  if p_expected_reserved_before_wei is null or p_expected_reserved_before_wei<0 or p_expected_reserved_before_wei<>trunc(p_expected_reserved_before_wei) then raise exception 'INVALID_EXPECTED_RESERVED'; end if;
  if p_amount_wei is null or p_amount_wei<=0 or p_amount_wei<>trunc(p_amount_wei) then raise exception 'INVALID_REWARD_AMOUNT'; end if;
  if p_finalized_block is null or p_finalized_block<0 then raise exception 'INVALID_FINALIZED_BLOCK'; end if;
  if p_algorithm_version is null or length(btrim(p_algorithm_version)) not between 1 and 80 then raise exception 'INVALID_ALGORITHM_VERSION'; end if;
  if p_basis is null or jsonb_typeof(p_basis)<>'object' then raise exception 'INVALID_RESERVATION_BASIS'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_emergency_reward_pause',0));

  select
    mainnet_funded_rewards_enabled,
    emergency_rewards_paused,
    sybil_v2_enforcement_enabled,
    reward_recovery_enabled
  into
    v_mainnet_enabled,
    v_emergency_paused,
    v_sybil_v2_enforced,
    v_recovery_enabled
  from public.reward_runtime_config
  where id=1;

  if not found then raise exception 'REWARD_RUNTIME_CONFIG_MISSING'; end if;
  select coalesce((select s.enabled from reward_admission_bridge.shared_pool_settings s where s.id=1),false)
    into v_shared_pool_active;
  if p_algorithm_version='shared-pool-v1' and not v_shared_pool_active then
    raise exception 'SHARED_POOL_ALGORITHM_NOT_ENABLED';
  end if;
  if v_emergency_paused then raise exception 'REWARD_RESERVATION_PAUSED'; end if;
  if v_network='mainnet' and not v_mainnet_enabled then raise exception 'REWARD_RESERVATION_DISABLED'; end if;

  -- Preserve the existing global network reservation lock. Recovery also uses
  -- a wallet lock below, always after this lock, so lock ordering is stable.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_' || v_network,0)
  );

  select * into v_invitation
  from public.invitations i
  where i.invite_code=v_code
  for update;

  if not found
     or v_invitation.activation_network<>v_network
     or v_invitation.status<>'COMPLETED'
     or v_invitation.reward_status<>'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status<>'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.impact_sync_complete_at is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_invitation.eligibility_check_id is null then
    return jsonb_build_object('reserved',false,'reason','NOT_ELIGIBLE');
  end if;

  -- Keep the existing eligibility, emergency-pause, queue, recovery and
  -- security gates. Only the funding context is adapted.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    -- No retired pricing algorithm may reserve a retry against an old cohort.
    if p_algorithm_version IS DISTINCT FROM 'shared-pool-v1' then
      return jsonb_build_object('reserved',false,'reason','RETRY_REQUIRES_SHARED_POOL');
    end if;
    select f.reward_cohort_round_id,f.reward_funding_allocation_receipt_id
    into v_invitation.reward_cohort_round_id,v_invitation.reward_funding_allocation_receipt_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    if v_invitation.reward_cohort_round_id is null
      or v_invitation.reward_funding_allocation_receipt_id is null then
      return jsonb_build_object('reserved',false,'reason','FUNDING_BINDING_MISSING');
    end if;
  end if;

  select c.* into v_clearance
  from public.sybil_v2_reward_clearances c
  join public.sybil_v2_referral_assessments a
    on a.invite_code=c.invite_code
   and a.revision=c.assessment_revision
   and a.state=c.verdict
  where c.invite_code=v_code
    and c.network=v_network
    and c.verdict='CLEAR';

  if v_sybil_v2_enforced and not found then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_CLEARANCE_MISSING');
  end if;

  if v_sybil_v2_enforced and exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network=v_network
      and r.status='ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('reserved',false,'reason','SYBIL_V2_RESTRICTED');
  end if;

  if exists (
    select 1
    from public.reward_reservation_legacy_exclusions x
    where x.invite_code=v_code
  ) then
    return jsonb_build_object('reserved',false,'reason','LEGACY_EXCLUDED');
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code
  for update;

  if found then
    if v_queue.reserved_amount_wei is not null then
      return jsonb_build_object(
        'reserved',true,
        'reason','ALREADY_RESERVED',
        'inviteCode',v_queue.invite_code,
        'amountWei',v_queue.reserved_amount_wei::text,
        'reservedAt',v_queue.reserved_at,
        'status',v_queue.status
      );
    end if;
    return jsonb_build_object('reserved',false,'reason','LEGACY_QUEUE_ENTRY');
  end if;

  select * into v_existing_settlement
  from public.reward_recovery_settlements s
  where s.invite_code=v_code
  for update;

  if found then
    return jsonb_build_object(
      'reserved',true,
      'reason','ALREADY_RECOVERY_SETTLED',
      'inviteCode',v_existing_settlement.invite_code,
      'amountWei',v_existing_settlement.net_amount_wei::text,
      'reservedAt',v_existing_settlement.settled_at,
      'status',case
        when v_existing_settlement.net_amount_wei=0 then 'RECOVERY_SETTLED'
        else 'AWAITING_CLAIM'
      end
    );
  end if;

  -- For a retry, the immutable vote transaction determines completion
  -- order. Never select an event from the original mission.
  if exists(select 1 from public.read_effective_mission_reward_funding_v1(v_code,v_network) f
    where f.attempt_id is not null) then
    select f.completion_block,f.completion_tx_index,f.completion_clause_index,f.completion_tx_id
    into v_completion_block,v_completion_tx_index,v_completion_clause_index,v_completion_tx_id
    from public.read_effective_mission_reward_funding_v1(v_code,v_network) f;
    -- A clearance for the original attempt must not authorize a later vote.
    if v_clearance.id is null or v_clearance.evidence_cutoff_block is null
      or v_clearance.evidence_cutoff_block<v_completion_block
      or not public.mission_retry_assessment_is_current_v1(v_code,v_network,v_clearance.assessment_revision) then
      return jsonb_build_object('reserved',false,'reason','RETRY_CLEARANCE_NOT_CURRENT');
    end if;
  else
    select
      e.block_number::bigint,
      e.tx_index::integer,
      e.clause_index::integer,
      lower(e.tx_id)
    into
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_completion_tx_id
    from public.read_mission_effective_proof_events_v1(v_code,v_network) e
    where e.invite_code=v_code
      and e.network=v_network
      and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc,e.tx_index desc,e.clause_index desc
    limit 1;
  end if;

  if public.original_two_round_resolution_exists_v1(v_code,v_network) AND
     (v_clearance.id IS NULL OR v_clearance.evidence_cutoff_block IS NULL OR v_clearance.evidence_cutoff_block<v_completion_block) then
    return jsonb_build_object('reserved',false,'reason','ORIGINAL_MISSION_CLEARANCE_NOT_CURRENT');
  end if;

  if v_completion_block is null
     or v_completion_tx_index is null
     or v_completion_clause_index is null then
    return jsonb_build_object('reserved',false,'reason','COMPLETION_POSITION_MISSING');
  end if;

  if v_completion_block>p_finalized_block then
    return jsonb_build_object(
      'reserved',false,
      'reason','AWAITING_FINALITY',
      'completionBlock',v_completion_block,
      'finalizedBlock',p_finalized_block
    );
  end if;

  select e.entry_class into v_entry_class
  from public.eligibility_check_events e
  where e.id=v_invitation.eligibility_check_id
    and e.invite_code=v_code
    and e.wallet_address=lower(v_invitation.invitee_wallet)
    and e.network=v_network
    and e.outcome='ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING');

  if v_entry_class not in ('NEW','RETURNING') then
    return jsonb_build_object('reserved',false,'reason','ENTRY_PROOF_MISSING');
  end if;

  -- Use the single authoritative liability reader so reservation-time pool
  -- protection includes any post-base LIVE X promotion obligation exactly
  -- once. With LIVE disabled this is numerically identical to the legacy
  -- queue + legacy-payout calculation.
  v_reserved := public.read_outstanding_reward_liability(
    v_network,
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
  )::numeric;

  if v_reserved<>p_expected_reserved_before_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text
    );
  end if;

  v_net:=p_amount_wei;

  if v_recovery_enabled then
    if not (p_basis ? 'cohortReservedWei')
       or coalesce(p_basis->>'cohortReservedWei','') !~ '^[0-9]+$' then
      raise exception 'INVALID_EXPECTED_COHORT_COMMITTED';
    end if;

    v_expected_cohort_committed :=
      (p_basis->>'cohortReservedWei')::numeric;

    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if v_cohort_committed<>v_expected_cohort_committed then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text
      );
    end if;


    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_reward_recovery_' || v_network || '_' ||
        lower(v_invitation.inviter_wallet),
        0
      )
    );

    v_recovery_balance:=public.read_reward_recovery_balance_wei(
      v_network,
      lower(v_invitation.inviter_wallet)
    );
    v_offset:=least(p_amount_wei,v_recovery_balance);
    v_net:=p_amount_wei-v_offset;
  end if;

  -- Preserve the original pool guard for normal users. Recovery users reserve
  -- only the amount that will actually be transferred on-chain.
  -- A future cohort's still-unspent allocation is included in the global
  -- reserved amount. The existing canonical signer must release that SAME
  -- cohort's own escrow for the exact reservation being converted.
  -- All other payouts and older cohorts still use the original guard.
  IF p_algorithm_version='elastic-closed-cohort-v1' THEN
    IF coalesce(p_basis->'elasticClosure'->>'policy','')<>'elastic-closed-cohort-v1'
       OR v_invitation.reward_cohort_round_id IS NULL
       OR v_invitation.reward_funding_allocation_receipt_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM reward_admission_bridge.elastic_settlement_settings e
         WHERE e.id=1 AND e.enabled AND e.allow_protected_partial_settlement
           AND v_invitation.activated_at>=e.rollout_not_before
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.vebetter_round_allocations a
         JOIN reward_admission_bridge.elastic_settlement_settings e ON e.id=1
         WHERE a.network=v_network
           AND a.app_id='0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e'
           AND a.vebetter_round_id=v_invitation.reward_cohort_round_id
           AND a.observed_at+make_interval(hours=>e.close_grace_hours)
               <=clock_timestamp()
       )
    THEN RAISE EXCEPTION 'ELASTIC_CANONICAL_SELF_ESCROW_AUTHORITY_MISSING';
    END IF;
    v_elastic_self_escrow :=
      public.read_reward_elastic_contingent_scope_liability_wei_v1(
        v_network,
        '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
        v_invitation.reward_cohort_round_id,
        v_invitation.reward_funding_allocation_receipt_id
      );
    IF v_elastic_self_escrow<p_amount_wei THEN
      RETURN jsonb_build_object(
        'reserved',false,'reason','RECALCULATE',
        'remainingOwnEscrowWei',v_elastic_self_escrow::text);
    END IF;
  END IF;
  -- GLOBAL insolvency is never bypassed, even for a future elastic cohort.
  v_spendable_wei:=greatest(
    p_observed_pool_balance_wei-v_reserved+v_elastic_self_escrow,0);
  if p_observed_pool_balance_wei<v_reserved OR v_net>v_spendable_wei then
    return jsonb_build_object(
      'reserved',false,
      'reason','RECALCULATE',
      'reservedExistingWei',v_reserved::text,
      'availableWei',v_spendable_wei::text
    );
  end if;

  v_basis:=p_basis || jsonb_build_object(
    'observedPoolBalanceWei',p_observed_pool_balance_wei::text,
    'reservedBeforeWei',v_reserved::text,
    'finalizedBlock',p_finalized_block,
    'sybilV2Enforced',v_sybil_v2_enforced,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id::text else null end,
    'sybilVerdict',case when v_sybil_v2_enforced then v_clearance.verdict else null end,
    'sybilAssessmentRevision',case when v_sybil_v2_enforced then v_clearance.assessment_revision else null end
  );

  if v_offset>0 then
    if v_completion_tx_id is null
       or v_completion_tx_id !~ '^0x[0-9a-f]{64}$' then
      return jsonb_build_object(
        'reserved',false,
        'reason','COMPLETION_TX_ID_MISSING'
      );
    end if;

    -- Gross remains the cohort pricing commitment. Net remains the actual
    -- transfer liability. This keeps same-cohort pricing deterministic while
    -- ensuring withheld value does not occupy the on-chain payout pool.
    select * into v_allocation_receipt
    from public.vebetter_round_allocations a
    where a.id=v_invitation.reward_funding_allocation_receipt_id;

    if not found
       or v_allocation_receipt.network<>v_network
       or v_allocation_receipt.vebetter_round_id+1<>
          v_invitation.reward_cohort_round_id then
      raise exception 'REWARD_COHORT_FUNDING_MISMATCH';
    end if;

    select coalesce(sum(a.amount_wei),0)
    into v_adjustment
    from public.reward_cohort_funding_adjustments a
    where a.network=v_allocation_receipt.network
      and a.app_id=v_allocation_receipt.app_id
      and a.reward_cohort_round_id=v_invitation.reward_cohort_round_id
      and a.allocation_receipt_id=v_allocation_receipt.id;

    v_budget:=public.read_reward_cohort_effective_budget_wei(v_network,v_allocation_receipt.app_id,v_invitation.reward_cohort_round_id,v_allocation_receipt.id);
    v_cohort_committed:=public.read_reward_cohort_committed_wei(
      v_network,
      v_allocation_receipt.app_id,
      v_invitation.reward_cohort_round_id,
      v_allocation_receipt.id
    );

    if p_algorithm_version<>'shared-pool-v1' and v_cohort_committed+p_amount_wei>v_budget then
      return jsonb_build_object(
        'reserved',false,
        'reason','RECALCULATE',
        'cohortCommittedWei',v_cohort_committed::text,
        'cohortBudgetWei',v_budget::text
      );
    end if;

    insert into public.reward_recovery_settlements(
      network,invite_code,recipient_wallet,settlement_kind,state,
      gross_amount_wei,offset_amount_wei,net_amount_wei,sybil_clearance_id,
      completion_block,completion_tx_index,completion_clause_index,completion_tx_id,
      settled_at,updated_at
    ) values (
      v_network,
      v_code,
      lower(v_invitation.inviter_wallet),
      case when v_net=0 then 'FULL_OFFSET' else 'PARTIAL_OFFSET' end,
      'ACTIVE',
      p_amount_wei,
      v_offset,
      v_net,
      case when v_sybil_v2_enforced then v_clearance.id else null end,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_completion_tx_id,
      v_now,
      v_now
    )
    returning * into v_settlement;

    v_remaining_offset:=v_offset;

    for v_obligation in
      with consumed as (
        select
          a.obligation_id,
          coalesce(sum(a.amount_wei),0)::numeric as consumed_wei
        from public.reward_recovery_allocations a
        group by a.obligation_id
      )
      select
        o.id,
        greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)::numeric
          as remaining_wei
      from public.reward_recovery_obligations o
      left join consumed c on c.obligation_id=o.id
      where o.network=v_network
        and o.recipient_wallet=lower(v_invitation.inviter_wallet)
        and o.status='ACTIVE'
        and greatest(o.amount_wei-coalesce(c.consumed_wei,0),0)>0
      order by o.created_at,o.id
    loop
      exit when v_remaining_offset<=0;
      v_take:=least(v_remaining_offset,v_obligation.remaining_wei);

      insert into public.reward_recovery_allocations(
        settlement_id,obligation_id,amount_wei
      ) values (
        v_settlement.id,v_obligation.id,v_take
      );

      v_remaining_offset:=v_remaining_offset-v_take;
    end loop;

    if v_remaining_offset<>0 then
      raise exception 'REWARD_RECOVERY_ALLOCATION_MISMATCH';
    end if;

    v_basis:=v_basis || jsonb_build_object(
      'recoverySettlementId',v_settlement.id::text,
      'grossRewardWei',p_amount_wei::text,
      'recoveryOffsetWei',v_offset::text,
      'netPayableWei',v_net::text
    );
  end if;

  if v_net>0 then
    insert into public.reward_queue_entries(
      invite_code,recipient_wallet,eligibility_check_id,entry_class,network,eligible_at,status,
      reserved_amount_wei,reserved_at,reservation_algorithm_version,reservation_quote_snapshot_id,
      reservation_completion_block,reservation_completion_tx_index,reservation_completion_clause_index,
      reservation_basis,sybil_clearance_id
    ) values (
      v_code,
      lower(v_invitation.inviter_wallet),
      v_invitation.eligibility_check_id,
      v_entry_class,
      v_network,
      v_invitation.reward_eligible_at,
      'AWAITING_CLAIM',
      v_net,
      v_now,
      btrim(p_algorithm_version),
      p_quote_snapshot_id,
      v_completion_block,
      v_completion_tx_index,
      v_completion_clause_index,
      v_basis,
      case when v_sybil_v2_enforced then v_clearance.id else null end
    )
    returning * into v_queue;

    return jsonb_build_object(
      'reserved',true,
      'reason',case when v_offset>0 then 'RECOVERY_PARTIAL_RESERVED' else 'RESERVED' end,
      'inviteCode',v_queue.invite_code,
      'amountWei',v_queue.reserved_amount_wei::text,
      'reservedAt',v_queue.reserved_at,
      'status',v_queue.status,
      'completionBlock',v_queue.reservation_completion_block,
      'completionTxIndex',v_queue.reservation_completion_tx_index,
      'completionClauseIndex',v_queue.reservation_completion_clause_index,
      'sybilClearanceId',v_queue.sybil_clearance_id
    );
  end if;

  if v_offset<=0 or v_settlement.id is null then
    raise exception 'REWARD_RECOVERY_FULL_OFFSET_STATE_INVALID';
  end if;

  -- Full offset has no token transfer, queue row, payout or receipt. It still
  -- settles the valid referral, releases the slot and records one bell-only
  -- policy notice.
  update public.invitations i
  set slot_released_at=coalesce(i.slot_released_at,v_now)
  where i.invite_code=v_code
    and i.status='COMPLETED';

  insert into public.invite_notification_history(
    inviter_wallet,recipient_wallet,invite_code,kind,stage,event_at,
    reward_amount_wei,dapp_progress,collapsed_progress,friend_wallet,dedupe_key
  ) values (
    lower(v_invitation.inviter_wallet),
    lower(v_invitation.inviter_wallet),
    v_code,
    'REWARD_ADJUSTED',
    4,
    v_now,
    null,
    null,
    false,
    lower(v_invitation.invitee_wallet),
    'reward-recovery-adjusted:' || v_settlement.id::text
  )
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'reserved',true,
    'reason','RECOVERY_FULLY_SETTLED',
    'inviteCode',v_code,
    'amountWei','0',
    'reservedAt',v_now,
    'status','RECOVERY_SETTLED',
    'completionBlock',v_completion_block,
    'completionTxIndex',v_completion_tx_index,
    'completionClauseIndex',v_completion_clause_index,
    'sybilClearanceId',case when v_sybil_v2_enforced then v_clearance.id else null end
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.read_reward_reservation_candidates_v2(p_network text, p_limit integer DEFAULT 25)
 RETURNS TABLE(invite_code text, completion_block bigint, completion_tx_index integer, completion_clause_index integer, reward_cohort_round_id bigint, reward_funding_allocation_receipt_id bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with parameters as (
    select lower(btrim(p_network)) as network,
           greatest(1,least(coalesce(p_limit,25),100)) as row_limit
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
    select event.block_number,event.tx_index,event.clause_index
    from (
      select e.block_number,e.tx_index,e.clause_index
      from public.read_mission_effective_proof_events_v1(i.invite_code,p.network) e
      where funding.attempt_id is null
        and e.invite_code=i.invite_code
        and e.network=p.network
        and e.event_type in ('DAPP_REWARD','VOT3_CONVERSION','ALLOCATION_VOTE')
        and e.block_number is not null
        and e.tx_index is not null
        and e.clause_index is not null
      union all
      select funding.completion_block,funding.completion_tx_index,funding.completion_clause_index
      where funding.attempt_id is not null and funding.completion_block is not null
    ) event
    order by event.block_number desc,event.tx_index desc,event.clause_index desc
    limit 1
  ) completion
  where i.activation_network=p.network
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
      (c.id is not null and c.evidence_cutoff_block>=funding.completion_block
        and public.mission_retry_assessment_is_current_v1(i.invite_code,p.network,c.assessment_revision)))
    and (not public.original_two_round_resolution_exists_v1(i.invite_code,p.network)
      or (c.id is not null and c.evidence_cutoff_block>=completion.block_number))
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
  limit (select row_limit from parameters);
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
    and (not public.original_two_round_resolution_exists_v1(i.invite_code,p.network)
      or (c.id is not null and c.evidence_cutoff_block>=completion.block_number))
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


CREATE OR REPLACE FUNCTION public.issue_sybil_v2_reward_clearance(p_invite_code text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(p_invite_code));
  v_assessment public.sybil_v2_referral_assessments%rowtype;
  v_invitation public.invitations%rowtype;
  v_existing public.sybil_v2_reward_clearances%rowtype;
  v_clearance public.sybil_v2_reward_clearances%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then raise exception 'INVALID_INVITE_CODE'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'INVALID_ASSESSMENT_REVISION'; end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_sybil_v2_' || v_code,0));

  select * into v_existing
  from public.sybil_v2_reward_clearances c
  where c.invite_code = v_code
    and c.assessment_revision = p_expected_revision;

  if found then
    return jsonb_build_object(
      'issued', true,
      'reason', 'ALREADY_ISSUED',
      'reused', true,
      'clearanceId', v_existing.id,
      'verdict', v_existing.verdict,
      'assessmentRevision', v_existing.assessment_revision
    );
  end if;

  select * into v_assessment
  from public.sybil_v2_referral_assessments a
  where a.invite_code = v_code
  for update;

  if not found then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_MISSING');
  end if;

  if v_assessment.revision <> p_expected_revision then
    return jsonb_build_object(
      'issued', false,
      'reason', 'STALE_REVISION',
      'assessmentRevision', v_assessment.revision
    );
  end if;

  if v_assessment.state not in ('CLEAR','WATCH') then
    return jsonb_build_object('issued',false,'reason','ASSESSMENT_NOT_CLEAR','state',v_assessment.state);
  end if;

  if not (v_assessment.required_checks <@ v_assessment.completed_checks) then
    return jsonb_build_object('issued',false,'reason','REQUIRED_CHECKS_INCOMPLETE');
  end if;

  if v_assessment.evidence_cutoff_block is null then
    return jsonb_build_object('issued',false,'reason','EVIDENCE_CUTOFF_MISSING');
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status <> 'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.vote_completed is not true
     or v_invitation.vote_completed_block is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_assessment.evidence_cutoff_block < v_invitation.vote_completed_block
     or (public.original_two_round_resolution_exists_v1(v_code,v_assessment.network)
        and (v_invitation.apps_completed_block is null OR v_assessment.evidence_cutoff_block < v_invitation.apps_completed_block))
     or not public.security_identity_v2_observation_complete(
       v_invitation.identity_link_status,
       v_invitation.identity_link_checked_at,
       v_invitation.vote_completed_at,
       v_invitation.identity_link_policy_version,
       v_invitation.identity_link_evidence
     )
  then
    return jsonb_build_object('issued',false,'reason','INVITATION_NOT_READY');
  end if;

  if exists (
    select 1
    from public.sybil_v2_wallet_restrictions r
    where r.network = v_assessment.network
      and r.status = 'ACTIVE'
      and r.wallet_address in (
        lower(v_invitation.inviter_wallet),
        lower(v_invitation.invitee_wallet)
      )
  ) then
    return jsonb_build_object('issued',false,'reason','ACTIVE_WALLET_RESTRICTION');
  end if;

  insert into public.sybil_v2_reward_clearances(
    invite_code, network, verdict, policy_version, analyzer_version,
    assessment_revision, evidence_cutoff_block, risk_score, reason_codes,
    evidence_digest, issued_at
  ) values (
    v_code, v_assessment.network, v_assessment.state, v_assessment.policy_version,
    v_assessment.analyzer_version, v_assessment.revision,
    v_assessment.evidence_cutoff_block, v_assessment.risk_score,
    v_assessment.reason_codes,
    md5(v_assessment.evidence_summary::text),
    clock_timestamp()
  )
  returning * into v_clearance;

  return jsonb_build_object(
    'issued', true,
    'reason', 'ISSUED',
    'clearanceId', v_clearance.id,
    'verdict', v_clearance.verdict,
    'assessmentRevision', v_clearance.assessment_revision
  );
end;
$function$;
