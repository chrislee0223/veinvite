-- STAGED ONLY. Publish a fully verified retry's canonical completion
-- checkpoint so existing security machinery sees the NEW vote, not the
-- original invite's vote. No eligibility, reservation or payment approval.
-- Run in the same reviewed cutover transaction as the financial adapters.
BEGIN;
DO $source_guard$
BEGIN
  IF md5(pg_get_functiondef('public.enforce_invitation_execution_order()'::regprocedure)) IS DISTINCT FROM '852c2935791560441dae5d4e57f775e8' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CHECKPOINT_SOURCE_CHANGED: enforce_invitation_execution_order()';
  END IF;
  IF md5(pg_get_functiondef('public.sync_invitation_reward_eligibility()'::regprocedure)) IS DISTINCT FROM 'c7119e5b9be1bc29f56941a8222df34c' THEN
    RAISE EXCEPTION 'MISSION_RETRY_CHECKPOINT_SOURCE_CHANGED: sync_invitation_reward_eligibility()';
  END IF;
END;
$source_guard$;

-- Only the current bound attempt may provide completion proof to the
-- canonical eligibility validators. Historical events remain intact for
-- fraud/forensics. Non-retry invitations keep their original event behavior.
CREATE OR REPLACE FUNCTION public.read_mission_effective_proof_events_v1(
 p_invite_code text,p_network text
) RETURNS TABLE(invite_code text,network text,wallet_address text,event_type text,
 tx_id text,block_number bigint,block_timestamp timestamptz,app_id text,
 vote_round_id bigint,amount_wei text,tx_index bigint,clause_index bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $events$
 WITH latest AS (
   SELECT a.id,a.invitation_id,a.network,a.invite_code
   FROM reward_admission_bridge.mission_retry_attempts_v1 a
   WHERE a.invite_code=p_invite_code AND a.network=p_network
   ORDER BY a.attempt_no DESC LIMIT 1
 )
 SELECT e.invite_code,e.network,e.wallet_address,e.event_type,e.tx_id,
   e.block_number,e.block_timestamp,e.app_id,e.vote_round_id,e.amount_wei,
   e.tx_index,e.clause_index
 FROM public.invite_impact_events e
 WHERE e.invite_code=p_invite_code AND e.network=p_network
   AND NOT EXISTS(SELECT 1 FROM latest)
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
$events$;
REVOKE ALL ON FUNCTION public.read_mission_effective_proof_events_v1(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_mission_effective_proof_events_v1(text,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_invitation_execution_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_order_is_valid boolean := false;
begin
  if new.reward_status <> 'ELIGIBLE' then
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_network is null
     or new.activation_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_converted_block is null
     or new.vot3_converted_at is null
     or new.vot3_conversion_amount_wei is null
     or new.vote_completed_block is null
     or new.vote_completed_at is null
     or new.vote_round_id is null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
    return new;
  end if;

  select exists(
    select 1
    from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) c
    where c.invite_code = new.invite_code
      and c.network = new.activation_network
      and c.wallet_address = lower(new.invitee_wallet)
      and c.event_type = 'VOT3_CONVERSION'
      and c.tx_id = new.vot3_conversion_tx_id
      and c.block_number = new.vot3_converted_block
      and c.block_timestamp = new.vot3_converted_at
      and c.amount_wei = new.vot3_conversion_amount_wei
      and c.tx_index is not null
      and c.clause_index is not null
      and exists(
        select 1
        from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) r
        where r.invite_code = new.invite_code
          and r.network = new.activation_network
          and r.wallet_address = lower(new.invitee_wallet)
          and r.event_type = 'DAPP_REWARD'
          and r.block_number >= new.activation_block
          and r.tx_index is not null
          and r.clause_index is not null
          and (
            r.block_number < c.block_number
            or (
              r.block_number = c.block_number
              and (
                r.tx_index < c.tx_index
                or (
                  r.tx_index = c.tx_index
                  and r.clause_index < c.clause_index
                )
              )
            )
          )
      )
      and exists(
        select 1
        from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) v
        where v.invite_code = new.invite_code
          and v.network = new.activation_network
          and v.wallet_address = lower(new.invitee_wallet)
          and v.event_type = 'ALLOCATION_VOTE'
          and v.block_number = new.vote_completed_block
          and v.block_timestamp = new.vote_completed_at
          and v.vote_round_id = new.vote_round_id
          and v.tx_index is not null
          and v.clause_index is not null
          and (
            c.block_number < v.block_number
            or (
              c.block_number = v.block_number
              and (
                c.tx_index < v.tx_index
                or (
                  c.tx_index = v.tx_index
                  and c.clause_index < v.clause_index
                )
              )
            )
          )
      )
  ) into v_order_is_valid;

  if not v_order_is_valid then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_invitation_reward_eligibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_has_paid_payout boolean := false;
  v_has_eligible_entry_check boolean := false;
  v_has_three_reward_events boolean := false;
  v_has_third_app_checkpoint boolean := false;
  v_has_conversion_event boolean := false;
  v_has_vote_event boolean := false;
begin
  select exists(
    select 1
    from public.reward_payouts rp
    where rp.invite_code = new.invite_code
      and rp.status = 'PAID'
      and rp.tx_id is not null
      and rp.paid_at is not null
  ) into v_has_paid_payout;

  if v_has_paid_payout then
    new.reward_status := 'PAID';
    if new.reward_paid_at is null then
      select rp.paid_at
      into new.reward_paid_at
      from public.reward_payouts rp
      where rp.invite_code = new.invite_code
        and rp.status = 'PAID'
      order by rp.paid_at desc
      limit 1;
    end if;
    return new;
  end if;

  new.reward_paid_at := null;

  if new.status = 'CANCELLED' or new.sybil_status = 'BLOCKED' then
    new.reward_status := 'FORFEITED';
    new.reward_eligible_at := null;
    return new;
  end if;

  if new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or coalesce(new.apps_completed, 0) < 3
     or new.apps_completed_at is null
     or new.apps_completed_block is null
     or new.apps_completed_block < new.activation_block then
    new.apps_completed_at := null;
    new.apps_completed_block := null;
  end if;

  if coalesce(new.vot3_converted, false) = false
     or new.invitee_wallet is null
     or new.activation_block is null
     or new.activation_network is null
     or new.vot3_converted_at is null
     or new.vot3_converted_block is null
     or new.vot3_conversion_tx_id is null
     or new.vot3_conversion_amount_wei is null
     or new.vot3_converted_block < new.activation_block
     or new.vot3_conversion_tx_id !~ '^0x[0-9a-f]{64}$'
     or new.vot3_conversion_amount_wei !~ '^[0-9]+$'
     or new.vot3_conversion_amount_wei::numeric <= 0 then
    new.vot3_converted := false;
    new.vot3_converted_at := null;
    new.vot3_converted_block := null;
    new.vot3_conversion_tx_id := null;
    new.vot3_conversion_amount_wei := null;
    new.vote_completed := false;
    new.vote_completed_at := null;
    new.vote_completed_block := null;
    new.vote_round_id := null;
  else
    if coalesce(new.vote_completed, false) = false
       or new.vote_completed_at is null
       or new.vote_completed_block is null
       or new.vote_round_id is null
       or new.vote_completed_block < new.vot3_converted_block then
      new.vote_completed := false;
      new.vote_completed_at := null;
      new.vote_completed_block := null;
      new.vote_round_id := null;
    end if;
  end if;

  if new.eligibility_check_id is not null
     and new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null then
    select exists(
      select 1
      from public.eligibility_check_events e
      where e.id = new.eligibility_check_id
        and e.invite_code = new.invite_code
        and e.wallet_address = lower(new.invitee_wallet)
        and e.network = new.activation_network
        and e.outcome = 'ELIGIBLE'
        and e.entry_class in ('NEW', 'RETURNING')
        and e.checked_block <= new.activation_block
    ) into v_has_eligible_entry_check;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null then
    select count(distinct e.app_id) >= 3
    into v_has_three_reward_events
    from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
    where e.invite_code = new.invite_code
      and e.network = new.activation_network
      and e.wallet_address = lower(new.invitee_wallet)
      and e.event_type = 'DAPP_REWARD'
      and e.block_number >= new.activation_block
      and e.block_number <= new.apps_completed_block;

    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'DAPP_REWARD'
        and e.block_number = new.apps_completed_block
        and e.block_timestamp = new.apps_completed_at
    ) into v_has_third_app_checkpoint;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.activation_block is not null
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null then
    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) c
      where c.invite_code = new.invite_code
        and c.network = new.activation_network
        and c.wallet_address = lower(new.invitee_wallet)
        and c.event_type = 'VOT3_CONVERSION'
        and c.tx_id = new.vot3_conversion_tx_id
        and c.block_number = new.vot3_converted_block
        and c.block_timestamp = new.vot3_converted_at
        and c.amount_wei = new.vot3_conversion_amount_wei
        and c.amount_wei ~ '^[0-9]+$'
        and c.amount_wei::numeric > 0
        and exists(
          select 1
          from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) r
          where r.invite_code = new.invite_code
            and r.network = new.activation_network
            and r.wallet_address = lower(new.invitee_wallet)
            and r.event_type = 'DAPP_REWARD'
            and r.block_number >= new.activation_block
            and r.block_number <= c.block_number
        )
    ) into v_has_conversion_event;
  end if;

  if new.invitee_wallet is not null
     and new.activation_network is not null
     and new.vot3_converted_block is not null
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null then
    select exists(
      select 1
      from public.read_mission_effective_proof_events_v1(new.invite_code,new.activation_network) e
      where e.invite_code = new.invite_code
        and e.network = new.activation_network
        and e.wallet_address = lower(new.invitee_wallet)
        and e.event_type = 'ALLOCATION_VOTE'
        and e.block_number = new.vote_completed_block
        and e.block_timestamp = new.vote_completed_at
        and e.vote_round_id = new.vote_round_id
        and e.block_number >= new.vot3_converted_block
    ) into v_has_vote_event;
  end if;

  if new.status = 'COMPLETED'
     and v_has_eligible_entry_check
     and v_has_three_reward_events
     and v_has_third_app_checkpoint
     and v_has_conversion_event
     and v_has_vote_event
     and new.impact_sync_complete_at is not null
     and new.invitee_wallet is not null
     and new.activation_block is not null
     and new.activation_network is not null
     and coalesce(new.apps_completed, 0) >= 3
     and new.apps_completed_at is not null
     and new.apps_completed_block is not null
     and new.apps_completed_block >= new.activation_block
     and new.vot3_converted = true
     and new.vot3_converted_at is not null
     and new.vot3_converted_block is not null
     and new.vot3_converted_block >= new.activation_block
     and new.vot3_conversion_tx_id is not null
     and new.vot3_conversion_amount_wei is not null
     and new.vot3_conversion_amount_wei::numeric > 0
     and coalesce(new.vote_completed, false) = true
     and new.vote_completed_at is not null
     and new.vote_completed_block is not null
     and new.vote_round_id is not null
     and new.vote_completed_block >= new.vot3_converted_block
     and new.sybil_status = 'CLEAR'
     and new.sybil_checked_at is not null
     and new.sybil_checked_at >= new.vote_completed_at then
    new.reward_status := 'ELIGIBLE';
    new.reward_eligible_at := coalesce(
      new.reward_eligible_at,
      new.impact_sync_complete_at,
      new.sybil_checked_at,
      new.vote_completed_at,
      now()
    );
  elsif new.invitee_wallet is not null then
    new.reward_status := 'PENDING';
    new.reward_eligible_at := null;
  else
    new.reward_status := 'NONE';
    new.reward_eligible_at := null;
  end if;

  return new;
end;
$function$;

-- This is a canonical CHECKPOINT only. It deliberately leaves the
-- invitation in ACTIVATING/UNDER_REVIEW with PENDING rewards.
CREATE OR REPLACE FUNCTION public.publish_mission_retry_completion_checkpoint_v1(
 p_network text,p_invite_code text,p_attempt_no integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog,public,reward_admission_bridge
AS $publish$
DECLARE
 i public.invitations%rowtype;
 a reward_admission_bridge.mission_retry_attempts_v1%rowtype;
 b reward_admission_bridge.mission_retry_settlement_bindings_v1%rowtype;
 d reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 c reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
 v reward_admission_bridge.mission_retry_attempt_events_v1%rowtype;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reward_admission_bridge.mission_auto_reset_settings_v1
   WHERE id=1 AND enabled) THEN
   RETURN jsonb_build_object('published',false,'reason','FEATURE_DISABLED');
 END IF;
 SELECT * INTO i FROM public.invitations WHERE invite_code=p_invite_code
   AND activation_network=p_network FOR UPDATE;
 IF NOT FOUND OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
    OR i.reward_status<>'PENDING' OR i.sybil_status='BLOCKED'
    OR i.ineligible_at IS NOT NULL OR i.slot_released_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.reward_queue_entries q WHERE q.invite_code=i.invite_code)
    OR EXISTS(SELECT 1 FROM public.reward_payouts p WHERE p.invite_code=i.invite_code)
    OR EXISTS(SELECT 1 FROM reward_admission_bridge.holds h WHERE h.invite_code=i.invite_code
        AND h.network=p_network AND h.status='HELD')
 THEN RETURN jsonb_build_object('published',false,'reason','INVITATION_PROTECTED'); END IF;

 SELECT * INTO a FROM reward_admission_bridge.mission_retry_attempts_v1
   WHERE invitation_id=i.id AND network=p_network AND state='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR a.attempt_no IS DISTINCT FROM p_attempt_no THEN
   RETURN jsonb_build_object('published',false,'reason','STALE_ATTEMPT');
 END IF;
 SELECT * INTO b FROM reward_admission_bridge.mission_retry_settlement_bindings_v1
   WHERE attempt_id=a.id AND invitation_id=i.id AND network=p_network;
 IF NOT FOUND OR b.completion_round_id<>a.vote_round_id THEN
   RETURN jsonb_build_object('published',false,'reason','FUNDING_BINDING_MISSING');
 END IF;
 SELECT * INTO d FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type='DAPP_REWARD'
   ORDER BY block_number DESC,tx_index DESC,clause_index DESC LIMIT 1;
 SELECT * INTO c FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE attempt_id=a.id AND event_type='VOT3_CONVERSION';
 SELECT * INTO v FROM reward_admission_bridge.mission_retry_attempt_events_v1
   WHERE id=b.completion_event_id AND attempt_id=a.id AND event_type='ALLOCATION_VOTE';
 IF d.id IS NULL OR c.id IS NULL OR v.id IS NULL
   OR (SELECT count(*) FROM reward_admission_bridge.mission_retry_attempt_events_v1
      WHERE attempt_id=a.id AND event_type='DAPP_REWARD')<>3
   OR v.block_number<>b.completion_block
   OR v.vote_round_id IS DISTINCT FROM b.completion_round_id
   OR v.block_number>b.finalized_through_block
   OR d.block_number NOT BETWEEN a.attempt_start_block AND a.round_end_block
   OR (v.block_number,v.tx_index,v.clause_index)<=(c.block_number,c.tx_index,c.clause_index)
   OR (v.block_number,v.tx_index,v.clause_index)<=(d.block_number,d.tx_index,d.clause_index)
 THEN RAISE EXCEPTION 'MISSION_RETRY_COMPLETION_CHECKPOINT_INVALID'; END IF;

 -- Never change the original activation/entry/funding binding. The effective
 -- funding accessor already selects the immutable completion-round receipt.
 IF i.apps_completed=3 AND i.apps_completed_block=d.block_number
    AND i.apps_completed_at=d.block_timestamp AND i.vot3_converted
    AND i.vot3_conversion_tx_id=c.tx_id AND i.vot3_converted_block=c.block_number
    AND i.vot3_converted_at=c.block_timestamp AND i.vot3_conversion_amount_wei=c.amount_wei
    AND i.vote_completed AND i.vote_round_id=v.vote_round_id
    AND i.vote_completed_block=v.block_number AND i.vote_completed_at=v.block_timestamp
    AND i.impact_sync_complete_at IS NOT NULL THEN
   RETURN jsonb_build_object('published',true,'reused',true,'completionRoundId',v.vote_round_id);
 END IF;
 UPDATE public.invitations
 SET apps_completed=3,rewards_received=greatest(coalesce(i.rewards_received,0),3),
   apps_completed_at=d.block_timestamp,apps_completed_block=d.block_number,
   vot3_converted=true,vot3_converted_at=c.block_timestamp,
   vot3_converted_block=c.block_number,vot3_conversion_tx_id=c.tx_id,
   vot3_conversion_amount_wei=c.amount_wei,
   vote_completed=true,vote_completed_at=v.block_timestamp,
   vote_completed_block=v.block_number,vote_round_id=v.vote_round_id,
   impact_last_synced_block=greatest(coalesce(i.impact_last_synced_block,0),b.finalized_through_block),
   impact_last_synced_at=clock_timestamp(),impact_sync_complete_at=clock_timestamp()
 WHERE id=i.id RETURNING * INTO i;
 IF i.reward_status IS DISTINCT FROM 'PENDING'
    OR i.status NOT IN('ACTIVATING','UNDER_REVIEW')
    OR i.vote_completed IS DISTINCT FROM true
    OR i.vote_round_id IS DISTINCT FROM v.vote_round_id
    OR i.vote_completed_block IS DISTINCT FROM v.block_number
    OR i.vot3_converted IS DISTINCT FROM true
    OR i.apps_completed IS DISTINCT FROM 3 THEN
   RAISE EXCEPTION 'MISSION_RETRY_CANONICAL_CHECKPOINT_REJECTED';
 END IF;
 RETURN jsonb_build_object('published',true,'reused',false,'completionRoundId',v.vote_round_id);
END;
$publish$;
REVOKE ALL ON FUNCTION public.publish_mission_retry_completion_checkpoint_v1(text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_mission_retry_completion_checkpoint_v1(text,text,integer)
 TO service_role;
COMMIT;
