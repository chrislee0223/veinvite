-- Hotfix: policy gate operator must be separated from record field identifier.
-- Old and new policies both accepted, no changes to stored rewards.
CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_opportunity_v1(p_invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_existing public.reward_x_promotion_opportunities%rowtype;
  v_created public.reward_x_promotion_opportunities%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_runtime jsonb;
  v_opened_at timestamptz := clock_timestamp();
  v_window_seconds constant integer := 86400;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_x_promotion_' || v_code,0)
  );

  select * into v_existing
  from public.reward_x_promotion_opportunities o
  where o.invite_code=v_code;

  if found then
    return jsonb_build_object(
      'created',false,
      'reason','ALREADY_EXISTS',
      'inviteCode',v_code,
      'opportunityId',v_existing.id,
      'openedAt',v_existing.opened_at,
      'postDeadlineAt',v_existing.post_deadline_at
    );
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.invite_code=v_code
  for update;

  if not found then
    raise exception 'REWARD_X_PROMOTION_OBLIGATION_MISSING';
  end if;

  if v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_NOT_HELD';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  -- Existing obligations remain preserved while new offer opening is paused.
  -- This prevents the 24-hour user clock from starting when payout signing or
  -- X verification is disabled, paused, or stale.
  if not v_cfg.reward_x_promotion_enabled
     or v_cfg.reward_x_promotion_live_started_at is null
     or not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready
     or v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_NEW_OFFERS_PAUSED';
  end if;

  v_runtime :=
    public.read_reward_x_promotion_external_runtime_readiness_v1(
      v_obligation.network,
      1200
    );

  if not coalesce((v_runtime->>'ready')::boolean,false) then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_RUNTIME_STALE';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=v_obligation.split_id
    and s.invite_code=v_code
    and s.mode='LIVE';

  if not found
     or v_split.network<>v_obligation.network
     or v_split.recipient_wallet<>v_obligation.recipient_wallet
     or v_split.promotion_amount_wei<>v_obligation.promotion_amount_wei
     or v_split.policy_version<>v_obligation.policy_version
     or v_split.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=v_code
    and p.status='PAID';


  if not (
    (v_payout.id is not null
      and v_payout.amount_wei=v_split.base_amount_wei
      and v_payout.paid_at is not null
      and exists (
        select 1 from public.reward_receipts r
        where r.payout_id=v_payout.id
          and r.invite_code=v_code
          and r.network=v_obligation.network
          and r.recipient_wallet=v_obligation.recipient_wallet
          and r.amount_wei=v_split.base_amount_wei
          and r.paid_at is not null
      )
    )
    or public.reward_x_promotion_canonical_base_ready_v1(
    v_code,
    v_obligation.network,
    v_obligation.recipient_wallet,
    v_split.base_amount_wei
  )
  ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING';
  end if;

  insert into public.reward_x_promotion_opportunities(
    obligation_id,
    split_id,
    invite_code,
    network,
    recipient_wallet,
    promotion_amount_wei,
    policy_version,
    offer_window_seconds,
    opened_at,
    post_deadline_at
  ) values (
    v_obligation.id,
    v_split.id,
    v_code,
    v_obligation.network,
    v_obligation.recipient_wallet,
    v_obligation.promotion_amount_wei,
    v_obligation.policy_version,
    v_window_seconds,
    v_opened_at,
    v_opened_at + make_interval(secs => v_window_seconds)
  )
  returning * into v_created;

  return jsonb_build_object(
    'created',true,
    'reason','CREATED',
    'inviteCode',v_code,
    'opportunityId',v_created.id,
    'amountWei',v_created.promotion_amount_wei::text,
    'openedAt',v_created.opened_at,
    'postDeadlineAt',v_created.post_deadline_at,
    'offerWindowSeconds',v_created.offer_window_seconds
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_reward_x_promotion_external_verification_readiness_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_runtime jsonb;
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
begin
  if new.reward_x_promotion_external_verification_ready
       is not distinct from old.reward_x_promotion_external_verification_ready
     and new.reward_x_promotion_external_verification_started_at
       is not distinct from old.reward_x_promotion_external_verification_started_at then
    return new;
  end if;

  if old.reward_x_promotion_external_verification_ready=false
     and new.reward_x_promotion_external_verification_ready=true then
    perform pg_advisory_xact_lock(
      hashtextextended('veinvite_reward_reservation_mainnet',0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_predictive_reward_mainnet_' || v_veinvite_app_id,
        0
      )
    );

    if not new.reward_x_promotion_enabled
       or new.reward_x_promotion_live_started_at is null then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_LIVE';
    end if;

    if not new.reward_x_promotion_payout_enabled then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_REQUIRES_PAYOUT';
    end if;

    if new.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
      raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
    end if;

    if new.reward_x_promotion_external_verification_started_at is null then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
    end if;

    if new.reward_x_promotion_external_verification_started_at < v_now - interval '60 seconds'
       or new.reward_x_promotion_external_verification_started_at > v_now + interval '10 seconds' then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_NOT_FRESH';
    end if;

    v_runtime :=
      public.read_reward_x_promotion_external_runtime_readiness_v1(
        'mainnet',
        1200
      );

    if not coalesce((v_runtime->>'ready')::boolean,false) then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_RUNTIME_NOT_READY';
    end if;

    return new;
  end if;

  if old.reward_x_promotion_external_verification_ready=true
     and new.reward_x_promotion_external_verification_ready=false then
    if new.reward_x_promotion_external_verification_started_at
         is distinct from old.reward_x_promotion_external_verification_started_at then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_PAUSE_BOUNDARY_MUTATION';
    end if;
    return new;
  end if;

  raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_BOUNDARY_INVALID';
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_reward_x_promotion_live_activation_interlock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_ready jsonb;
  v_now timestamptz := clock_timestamp();
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
begin
  if old.reward_x_promotion_enabled=false
     and new.reward_x_promotion_enabled=true then
    -- Serialize the activation boundary with new reward reservations and
    -- cohort batch creation so no reservation can straddle the LIVE boundary.
    perform pg_advisory_xact_lock(
      hashtextextended('veinvite_reward_reservation_mainnet',0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(
        'veinvite_predictive_reward_mainnet_' || v_veinvite_app_id,
        0
      )
    );

    if new.reward_x_promotion_live_started_at is null then
      raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
    end if;

    if new.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
      raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
    end if;

    if not new.reward_x_promotion_shadow_enabled then
      raise exception 'REWARD_X_PROMOTION_SHADOW_REQUIRED';
    end if;

    -- The immutable boundary must be created at activation time, not backdated
    -- or predated. This keeps grandfathering deterministic.
    if new.reward_x_promotion_live_started_at < v_now - interval '60 seconds'
       or new.reward_x_promotion_live_started_at > v_now + interval '10 seconds' then
      raise exception 'REWARD_X_PROMOTION_LIVE_START_NOT_FRESH';
    end if;

    v_ready :=
      public.read_reward_x_promotion_offer_readiness_v2('mainnet',5);

    if not coalesce((v_ready->>'ready')::boolean,false) then
      raise exception 'REWARD_X_PROMOTION_LIVE_ACTIVATION_NOT_READY';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_offer_readiness_v1(p_network text, p_min_shadow_samples integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_min_samples integer := greatest(1,least(coalesce(p_min_shadow_samples,5),1000));
  v_cfg public.reward_runtime_config%rowtype;
  v_shadow jsonb;
  v_shadow_ok boolean := false;
  v_shadow_count integer := 0;
  v_live_split_count integer := 0;
  v_live_obligation_count integer := 0;
  v_live_opportunity_count integer := 0;
  v_payout_artifact_count integer := 0;
  v_active_core_round_count integer := 0;
  v_ready boolean := false;
  v_blockers jsonb := '[]'::jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  v_shadow := public.read_reward_x_promotion_shadow_audit(v_network);
  v_shadow_ok := coalesce((v_shadow->>'ok')::boolean,false);
  v_shadow_count := greatest(coalesce((v_shadow->>'shadowCount')::integer,0),0);

  select count(*)::integer
  into v_live_split_count
  from public.reward_x_promotion_splits s
  where s.network=v_network
    and s.mode='LIVE';

  select count(*)::integer
  into v_live_obligation_count
  from public.reward_x_promotion_obligations o
  where o.network=v_network;

  select count(*)::integer
  into v_live_opportunity_count
  from public.reward_x_promotion_opportunities x
  where x.network=v_network;

  select
      (select count(*) from public.reward_x_promotion_payout_intents i where i.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_manifests m where m.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_signed_transactions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_submissions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_settlements s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_receipts r where r.network=v_network)
  into v_payout_artifact_count;

  select count(*)::integer
  into v_active_core_round_count
  from public.reward_rounds rr
  where rr.network=v_network
    and rr.app_id=v_veinvite_app_id
    and rr.status in ('CREATED','PAYING');

  select coalesce(jsonb_agg(v.reason) filter (where v.reason is not null),'[]'::jsonb)
  into v_blockers
  from (
    values
      (case when v_cfg.reward_x_promotion_enabled then 'LIVE_ALREADY_ENABLED' end),
      (case when v_cfg.reward_x_promotion_payout_enabled then 'PAYOUT_ALREADY_ENABLED' end),
      (case when not v_cfg.reward_x_promotion_shadow_enabled then 'SHADOW_DISABLED' end),
      (case when v_cfg.reward_x_promotion_shadow_started_at is null then 'SHADOW_START_MISSING' end),
      (case when v_cfg.reward_x_promotion_live_started_at is not null then 'LIVE_BOUNDARY_ALREADY_SET' end),
      (case when v_cfg.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then 'POLICY_UNSUPPORTED' end),
      (case when not v_shadow_ok then 'SHADOW_AUDIT_FAILED' end),
      (case when v_shadow_count<v_min_samples then 'INSUFFICIENT_SHADOW_SAMPLES' end),
      (case when v_live_split_count<>0 then 'UNEXPECTED_LIVE_SPLITS' end),
      (case when v_live_obligation_count<>0 then 'UNEXPECTED_LIVE_OBLIGATIONS' end),
      (case when v_live_opportunity_count<>0 then 'UNEXPECTED_LIVE_OPPORTUNITIES' end),
      (case when v_payout_artifact_count<>0 then 'UNEXPECTED_PAYOUT_ARTIFACTS' end),
      (case when v_active_core_round_count<>0 then 'CORE_REWARD_ROUND_ACTIVE' end)
  ) as v(reason);

  v_ready := jsonb_array_length(v_blockers)=0;

  return jsonb_build_object(
    'ready',v_ready,
    'network',v_network,
    'minimumShadowSamples',v_min_samples,
    'shadowSamples',v_shadow_count,
    'shadowAuditOk',v_shadow_ok,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'payoutEnabled',v_cfg.reward_x_promotion_payout_enabled,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'unexpectedState',jsonb_build_object(
      'liveSplits',v_live_split_count,
      'liveObligations',v_live_obligation_count,
      'liveOpportunities',v_live_opportunity_count,
      'payoutArtifacts',v_payout_artifact_count,
      'activeCoreRewardRounds',v_active_core_round_count
    ),
    'blockers',v_blockers,
    'shadowAudit',v_shadow
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_offer_readiness_v2(p_network text, p_min_evidence_samples integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_min_samples integer := greatest(1,least(coalesce(p_min_evidence_samples,5),1000));
  v_cfg public.reward_runtime_config%rowtype;
  v_shadow jsonb;
  v_replay jsonb;
  v_shadow_ok boolean := false;
  v_shadow_count integer := 0;
  v_replay_ok boolean := false;
  v_replay_count integer := 0;
  v_replay_truncated boolean := true;
  v_evidence_mode text := 'NONE';
  v_evidence_count integer := 0;
  v_evidence_ok boolean := false;
  v_live_split_count integer := 0;
  v_live_obligation_count integer := 0;
  v_live_opportunity_count integer := 0;
  v_payout_artifact_count integer := 0;
  v_active_core_round_count integer := 0;
  v_ready boolean := false;
  v_blockers jsonb := '[]'::jsonb;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  v_shadow := public.read_reward_x_promotion_shadow_audit(v_network);
  v_shadow_ok := coalesce((v_shadow->>'ok')::boolean,false);
  v_shadow_count := greatest(coalesce((v_shadow->>'shadowCount')::integer,0),0);

  v_replay := public.read_reward_x_promotion_historical_replay_audit_v1(
    v_network,
    5000
  );
  v_replay_ok := coalesce((v_replay->>'ok')::boolean,false);
  v_replay_count := greatest(coalesce((v_replay->>'sampleCount')::integer,0),0);
  v_replay_truncated := coalesce((v_replay->>'truncated')::boolean,true);

  if v_shadow_ok and v_shadow_count>=v_min_samples then
    v_evidence_mode := 'SHADOW';
    v_evidence_count := v_shadow_count;
    v_evidence_ok := true;
  elsif v_shadow_ok
        and v_replay_ok
        and not v_replay_truncated
        and v_replay_count>=v_min_samples then
    v_evidence_mode := 'HISTORICAL_REPLAY';
    v_evidence_count := v_replay_count;
    v_evidence_ok := true;
  end if;

  select count(*)::integer
  into v_live_split_count
  from public.reward_x_promotion_splits s
  where s.network=v_network
    and s.mode='LIVE';

  select count(*)::integer
  into v_live_obligation_count
  from public.reward_x_promotion_obligations o
  where o.network=v_network;

  select count(*)::integer
  into v_live_opportunity_count
  from public.reward_x_promotion_opportunities x
  where x.network=v_network;

  select
      (select count(*) from public.reward_x_promotion_payout_intents i where i.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_manifests m where m.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_signed_transactions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_submissions s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_payout_settlements s where s.network=v_network)
    + (select count(*) from public.reward_x_promotion_receipts r where r.network=v_network)
  into v_payout_artifact_count;

  select count(*)::integer
  into v_active_core_round_count
  from public.reward_rounds rr
  where rr.network=v_network
    and rr.app_id=v_veinvite_app_id
    and rr.status in ('CREATED','PAYING');

  select coalesce(jsonb_agg(v.reason) filter (where v.reason is not null),'[]'::jsonb)
  into v_blockers
  from (
    values
      (case when v_cfg.reward_x_promotion_enabled then 'LIVE_ALREADY_ENABLED' end),
      (case when v_cfg.reward_x_promotion_payout_enabled then 'PAYOUT_ALREADY_ENABLED' end),
      (case when not v_cfg.reward_x_promotion_shadow_enabled then 'SHADOW_DISABLED' end),
      (case when v_cfg.reward_x_promotion_shadow_started_at is null then 'SHADOW_START_MISSING' end),
      (case when v_cfg.reward_x_promotion_live_started_at is not null then 'LIVE_BOUNDARY_ALREADY_SET' end),
      (case when v_cfg.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then 'POLICY_UNSUPPORTED' end),
      (case when not v_shadow_ok then 'SHADOW_AUDIT_FAILED' end),
      (case when not v_evidence_ok then 'INSUFFICIENT_VALIDATED_SPLIT_EVIDENCE' end),
      (case when v_live_split_count<>0 then 'UNEXPECTED_LIVE_SPLITS' end),
      (case when v_live_obligation_count<>0 then 'UNEXPECTED_LIVE_OBLIGATIONS' end),
      (case when v_live_opportunity_count<>0 then 'UNEXPECTED_LIVE_OPPORTUNITIES' end),
      (case when v_payout_artifact_count<>0 then 'UNEXPECTED_PAYOUT_ARTIFACTS' end),
      (case when v_active_core_round_count<>0 then 'CORE_REWARD_ROUND_ACTIVE' end)
  ) as v(reason);

  v_ready := jsonb_array_length(v_blockers)=0;

  return jsonb_build_object(
    'ready',v_ready,
    'network',v_network,
    'minimumEvidenceSamples',v_min_samples,
    'evidenceMode',v_evidence_mode,
    'evidenceSamples',v_evidence_count,
    'shadowSamples',v_shadow_count,
    'shadowAuditOk',v_shadow_ok,
    'historicalReplaySamples',v_replay_count,
    'historicalReplayOk',v_replay_ok,
    'historicalReplayTruncated',v_replay_truncated,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'payoutEnabled',v_cfg.reward_x_promotion_payout_enabled,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'unexpectedState',jsonb_build_object(
      'liveSplits',v_live_split_count,
      'liveObligations',v_live_obligation_count,
      'liveOpportunities',v_live_opportunity_count,
      'payoutArtifacts',v_payout_artifact_count,
      'activeCoreRewardRounds',v_active_core_round_count
    ),
    'blockers',v_blockers,
    'shadowAudit',v_shadow,
    'historicalReplay',v_replay
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_reward_x_promotion_shadow_splits(p_network text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1, least(coalesce(p_limit,50),250));
  v_cfg public.reward_runtime_config%rowtype;
  v_candidate record;
  v_calc record;
  v_inserted integer := 0;
  v_considered integer := 0;
  v_created integer := 0;
  v_total_reservation numeric(78,0) := 0;
  v_total_base numeric(78,0) := 0;
  v_total_promotion numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if not v_cfg.reward_x_promotion_shadow_enabled then
    return jsonb_build_object(
      'enabled',false,
      'network',v_network,
      'consideredCount',0,
      'createdCount',0,
      'reservationWei','0',
      'baseWei','0',
      'promotionWei','0',
      'policyVersion',v_cfg.reward_x_promotion_policy_version
    );
  end if;

  if v_cfg.reward_x_promotion_shadow_started_at is null then
    raise exception 'REWARD_X_PROMOTION_SHADOW_START_MISSING';
  end if;

  if v_cfg.reward_x_promotion_policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  for v_candidate in
    select
      q.id as queue_entry_id,
      q.invite_code,
      q.network,
      lower(q.recipient_wallet) as recipient_wallet,
      q.reserved_amount_wei,
      i.reward_cohort_round_id,
      i.reward_funding_allocation_receipt_id
    from public.reward_queue_entries q
    join public.invitations i
      on i.invite_code=q.invite_code
    where q.network=v_network
      and q.reserved_amount_wei is not null
      and q.reserved_amount_wei>0
      and q.reserved_at is not null
      and q.reserved_at>=v_cfg.reward_x_promotion_shadow_started_at
      and (
        v_cfg.reward_x_promotion_live_started_at is null
        or q.reserved_at<v_cfg.reward_x_promotion_live_started_at
      )
      and i.reward_cohort_round_id is not null
      and i.reward_funding_allocation_receipt_id is not null
      and not exists (
        select 1
        from public.reward_x_promotion_splits s
        where s.invite_code=q.invite_code
      )
    order by q.reserved_at,q.id
    limit v_limit
  loop
    v_considered := v_considered + 1;

    select * into v_calc
    from public.calculate_reward_x_promotion_additive_v2(
      v_candidate.reserved_amount_wei
    );

    insert into public.reward_x_promotion_splits(
      queue_entry_id,
      invite_code,
      network,
      recipient_wallet,
      reservation_amount_wei,
      base_amount_wei,
      promotion_amount_wei,
      source_reward_cohort_round_id,
      source_allocation_receipt_id,
      mode,
      policy_version,
      promotion_rate_bps,
      promotion_cap_wei
    ) values (
      v_candidate.queue_entry_id,
      v_candidate.invite_code,
      v_candidate.network,
      v_candidate.recipient_wallet,
      v_candidate.reserved_amount_wei,
      v_calc.base_amount_wei,
      v_calc.promotion_amount_wei,
      v_candidate.reward_cohort_round_id,
      v_candidate.reward_funding_allocation_receipt_id,
      'SHADOW',
      'x-promotion-additive-v2',
      v_calc.promotion_rate_bps,
      v_calc.promotion_cap_wei
    )
    on conflict (invite_code) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted=1 then
      v_created := v_created + 1;
      v_total_reservation := v_total_reservation + v_candidate.reserved_amount_wei;
      v_total_base := v_total_base + v_calc.base_amount_wei;
      v_total_promotion := v_total_promotion + v_calc.promotion_amount_wei;
    end if;
  end loop;

  return jsonb_build_object(
    'enabled',true,
    'network',v_network,
    'consideredCount',v_considered,
    'createdCount',v_created,
    'reservationWei',v_total_reservation::text,
    'baseWei',v_total_base::text,
    'promotionWei',v_total_promotion::text,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_opportunity_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_payout public.reward_payouts%rowtype;
  v_invitation public.invitations%rowtype;
begin
  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.promotion_amount_wei<>new.promotion_amount_wei
     or v_obligation.policy_version<>new.policy_version
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null
     or new.opened_at<v_obligation.held_at then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits x
  where x.id=new.split_id;

  if not found
     or v_split.id<>v_obligation.split_id
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.promotion_amount_wei<>new.promotion_amount_wei
     or v_split.policy_version<>new.policy_version
     or v_split.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3')
     or v_split.mode<>'LIVE' then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  if new.offer_window_seconds<>86400
     or new.post_deadline_at<>
        new.opened_at+make_interval(secs=>new.offer_window_seconds) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_WINDOW_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=new.invite_code
    and p.status='PAID';


  if not (
    (v_payout.id is not null
      and v_payout.amount_wei=v_split.base_amount_wei
      and v_payout.paid_at is not null
      and exists (
        select 1 from public.reward_receipts r
        where r.payout_id=v_payout.id
          and r.invite_code=new.invite_code
          and r.network=new.network
          and r.recipient_wallet=new.recipient_wallet
          and r.amount_wei=v_split.base_amount_wei
          and r.paid_at is not null
      )
    )
    or public.reward_x_promotion_canonical_base_ready_v1(
      new.invite_code,new.network,new.recipient_wallet,v_split.base_amount_wei
    )
  ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_BASE_PROOF_MISSING';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or public.is_sybil_v2_referral_invalidated(new.invite_code,new.network)
     or exists (
       select 1
       from public.sybil_v2_wallet_restrictions r
       where r.network=new.network
         and r.status='ACTIVE'
         and r.wallet_address in (
           lower(new.recipient_wallet),
           lower(v_invitation.invitee_wallet)
         )
     )
     or not public.reward_x_promotion_security_clear_v1(
       new.invite_code,
       new.network
     ) then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SECURITY_NOT_CLEAR';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_post_submission_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
begin
  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.id=new.opportunity_id;

  if not found
     or v_opportunity.obligation_id<>new.obligation_id
     or v_opportunity.split_id<>new.split_id
     or v_opportunity.invite_code<>new.invite_code
     or v_opportunity.network<>new.network
     or v_opportunity.recipient_wallet<>new.recipient_wallet
     or v_opportunity.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3')
     or v_opportunity.submission_grace_seconds<>900 then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_OPPORTUNITY_MISMATCH';
  end if;

  if new.submission_state<>'PENDING'
     or new.verified_at is not null
     or new.invalidated_at is not null
     or new.state_reason is not null then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_INITIAL_STATE_INVALID';
  end if;

  if new.submitted_at<v_opportunity.opened_at
     or new.submitted_at>
        v_opportunity.post_deadline_at+
        make_interval(secs=>v_opportunity.submission_grace_seconds) then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_WINDOW_MISMATCH';
  end if;

  if new.submitted_post_url !~
       ('/status/' || new.x_post_id || '([/?#]|$)') then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_POST_ID_MISMATCH';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.split_id<>new.split_id
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.financial_state<>'HELD' then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=new.split_id;

  if not found
     or v_split.mode<>'LIVE'
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_SUBMISSION_SPLIT_MISMATCH';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_post_verification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_submission public.reward_x_promotion_post_submissions%rowtype;
  v_opportunity public.reward_x_promotion_opportunities%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_identity public.reward_x_promotion_x_identities%rowtype;
begin
  select * into v_submission
  from public.reward_x_promotion_post_submissions s
  where s.id=new.submission_id;

  if not found
     or v_submission.opportunity_id<>new.opportunity_id
     or v_submission.obligation_id<>new.obligation_id
     or v_submission.split_id<>new.split_id
     or v_submission.invite_code<>new.invite_code
     or v_submission.network<>new.network
     or v_submission.recipient_wallet<>new.recipient_wallet
     or v_submission.x_post_id<>new.x_post_id
     or v_submission.submission_state<>'PENDING' then
    raise exception 'REWARD_X_PROMOTION_POST_SUBMISSION_MISMATCH';
  end if;

  select * into v_opportunity
  from public.reward_x_promotion_opportunities x
  where x.id=new.opportunity_id;

  if not found
     or v_opportunity.obligation_id<>new.obligation_id
     or v_opportunity.split_id<>new.split_id
     or v_opportunity.invite_code<>new.invite_code
     or v_opportunity.network<>new.network
     or v_opportunity.recipient_wallet<>new.recipient_wallet
     or v_opportunity.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3')
     or v_opportunity.submission_grace_seconds<>900 then
    raise exception 'REWARD_X_PROMOTION_POST_OPPORTUNITY_MISMATCH';
  end if;

  select * into v_obligation
  from public.reward_x_promotion_obligations o
  where o.id=new.obligation_id;

  if not found
     or v_obligation.split_id<>new.split_id
     or v_obligation.invite_code<>new.invite_code
     or v_obligation.network<>new.network
     or v_obligation.recipient_wallet<>new.recipient_wallet
     or v_obligation.financial_state<>'HELD'
     or v_obligation.held_at is null then
    raise exception 'REWARD_X_PROMOTION_POST_OBLIGATION_MISMATCH';
  end if;

  select * into v_split
  from public.reward_x_promotion_splits s
  where s.id=new.split_id;

  if not found
     or v_split.mode<>'LIVE'
     or v_split.invite_code<>new.invite_code
     or v_split.network<>new.network
     or v_split.recipient_wallet<>new.recipient_wallet
     or v_split.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_POST_SPLIT_MISMATCH';
  end if;

  select * into v_identity
  from public.reward_x_promotion_x_identities i
  where i.network=new.network
    and i.recipient_wallet=new.recipient_wallet;

  if not found
     or v_identity.x_author_id<>new.x_author_id
     or v_identity.policy_version not in ('x-promotion-additive-v2','x-promotion-withheld-10pct-v3') then
    raise exception 'REWARD_X_PROMOTION_POST_IDENTITY_MISMATCH';
  end if;

  if new.verification_state<>'INITIAL_VERIFIED'
     or new.final_verified_at is not null
     or new.invalidated_at is not null
     or new.state_reason is not null then
    raise exception 'REWARD_X_PROMOTION_POST_INITIAL_STATE_INVALID';
  end if;

  if new.x_post_created_at<v_opportunity.opened_at
     or new.x_post_created_at>v_opportunity.post_deadline_at
     or v_submission.submitted_at<v_opportunity.opened_at
     or v_submission.submitted_at>
        v_opportunity.post_deadline_at+
        make_interval(secs=>v_opportunity.submission_grace_seconds)
     or new.initial_verified_at<v_submission.submitted_at
     or new.initial_verified_at<new.x_post_created_at
     or new.retention_seconds<>86400
     or new.verify_after<>
        new.x_post_created_at+make_interval(secs=>new.retention_seconds) then
    raise exception 'REWARD_X_PROMOTION_POST_WINDOW_MISMATCH';
  end if;

  if position(v_opportunity.share_token::text in new.matched_expanded_url)=0 then
    raise exception 'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING';
  end if;

  return new;
end;
$function$;
