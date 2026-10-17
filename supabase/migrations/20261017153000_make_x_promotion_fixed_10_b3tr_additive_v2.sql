-- Correct X Promotion before the first LIVE split.
-- v1 carved the optional X amount out of the immutable referral reservation.
-- v2 preserves 100% of the referral reward and creates a separate fixed
-- 10 B3TR promotion liability, budget permitting.

select pg_advisory_xact_lock(
  hashtextextended('veinvite_reward_reservation_mainnet',0)
);
select pg_advisory_xact_lock(
  hashtextextended(
    'veinvite_predictive_reward_mainnet_' ||
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
    0
  )
);

do $$
declare
  v_ready boolean;
begin
  select reward_x_promotion_external_verification_ready
  into v_ready
  from public.reward_runtime_config
  where id=1;

  if coalesce(v_ready,true) then
    raise exception 'REWARD_X_PROMOTION_ADDITIVE_MIGRATION_REQUIRES_EXTERNAL_GATE_PAUSED';
  end if;

  if exists (select 1 from public.reward_x_promotion_splits)
     or exists (select 1 from public.reward_x_promotion_split_exemptions)
     or exists (select 1 from public.reward_x_promotion_obligations)
     or exists (select 1 from public.reward_x_promotion_opportunities) then
    raise exception 'REWARD_X_PROMOTION_ADDITIVE_MIGRATION_REQUIRES_EMPTY_PROMOTION_STATE';
  end if;
end $$;

alter table public.reward_x_promotion_splits
  drop constraint if exists reward_x_promotion_splits_conservation_check;

alter table public.reward_x_promotion_splits
  add constraint reward_x_promotion_splits_additive_base_check
    check (base_amount_wei=reservation_amount_wei),
  add constraint reward_x_promotion_splits_additive_v2_fixed_bonus_check
    check (
      policy_version<>'x-promotion-additive-v2'
      or (
        base_amount_wei=reservation_amount_wei
        and promotion_amount_wei=10000000000000000000::numeric
        and promotion_rate_bps=0
        and promotion_cap_wei=10000000000000000000::numeric
      )
    );

alter table public.reward_x_promotion_split_exemptions
  drop constraint if exists reward_x_promotion_split_exemptions_exemption_reason_check,
  add constraint reward_x_promotion_split_exemptions_exemption_reason_check
    check (
      exemption_reason in (
        'FEATURE_DISABLED_AFTER_LIVE_START',
        'LIVE_START_MISSING',
        'POLICY_UNSUPPORTED',
        'DEPENDENCY_GATE_NOT_READY',
        'EXTERNAL_READY_START_MISSING',
        'BEFORE_EXTERNAL_READY_START',
        'EXTERNAL_RUNTIME_NOT_READY',
        'ACTIVE_REFERRAL_LINK_MISSING',
        'PROMOTION_BUDGET_UNAVAILABLE',
        'SPLIT_CREATION_FAILED'
      )
    );

create or replace function public.calculate_reward_x_promotion_additive_v2(
  p_reservation_amount_wei numeric
)
returns table(
  base_amount_wei numeric,
  promotion_amount_wei numeric,
  promotion_rate_bps integer,
  promotion_cap_wei numeric
)
language plpgsql
immutable
strict
set search_path to 'pg_catalog','public'
as $function$
declare
  v_bonus_wei constant numeric(78,0) := 10000000000000000000;
  v_reservation numeric(78,0);
begin
  if p_reservation_amount_wei <= 0
     or p_reservation_amount_wei <> trunc(p_reservation_amount_wei) then
    raise exception 'REWARD_X_PROMOTION_INVALID_RESERVATION';
  end if;

  v_reservation := p_reservation_amount_wei::numeric(78,0);

  -- v2 is an additive campaign bonus. The immutable referral reservation is
  -- never reduced to fund the X promotion.
  return query
  select
    v_reservation,
    v_bonus_wei,
    0,
    v_bonus_wei;
end;
$function$;

revoke all on function public.calculate_reward_x_promotion_additive_v2(numeric)
  from public,anon,authenticated;
grant execute on function public.calculate_reward_x_promotion_additive_v2(numeric)
  to service_role;

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

    if new.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then
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

    if new.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then
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

CREATE OR REPLACE FUNCTION public.record_reward_x_promotion_split_exemption_v1(p_queue_entry_id bigint, p_invite_code text, p_reason text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_reason text := upper(btrim(coalesce(p_reason,'')));
  v_details jsonb := coalesce(p_details,'{}'::jsonb);
begin
  if p_queue_entry_id is null or p_queue_entry_id<=0 then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_REQUIRED';
  end if;

  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  if v_reason not in (
    'FEATURE_DISABLED_AFTER_LIVE_START',
    'LIVE_START_MISSING',
    'POLICY_UNSUPPORTED',
    'DEPENDENCY_GATE_NOT_READY',
    'EXTERNAL_READY_START_MISSING',
    'BEFORE_EXTERNAL_READY_START',
    'EXTERNAL_RUNTIME_NOT_READY',
    'ACTIVE_REFERRAL_LINK_MISSING',
    'SPLIT_CREATION_FAILED'
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_REASON_INVALID';
  end if;

  if jsonb_typeof(v_details)<>'object' then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_DETAILS_INVALID';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=p_queue_entry_id
    and q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null
     or v_queue.recipient_wallet is null
     or v_queue.network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_QUEUE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_splits s
    where s.queue_entry_id=v_queue.id
       or s.invite_code=v_queue.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_SPLIT_EXISTS';
  end if;

  insert into public.reward_x_promotion_split_exemptions(
    queue_entry_id,
    invite_code,
    network,
    recipient_wallet,
    reservation_amount_wei,
    exemption_reason,
    policy_version,
    details
  ) values (
    v_queue.id,
    v_queue.invite_code,
    v_queue.network,
    lower(v_queue.recipient_wallet),
    v_queue.reserved_amount_wei,
    v_reason,
    'x-promotion-additive-v2',
    v_details
  )
  on conflict (queue_entry_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_split_exemption_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
begin
  select * into v_queue
  from public.reward_queue_entries q
  where q.id=new.queue_entry_id
    and q.invite_code=new.invite_code;

  if not found
     or v_queue.network<>new.network
     or lower(v_queue.recipient_wallet)<>new.recipient_wallet
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<>new.reservation_amount_wei
     or v_queue.reserved_at is null
     or v_queue.status<>'AWAITING_CLAIM'
     or v_queue.assigned_round_id is not null
     or v_queue.claim_requested_at is not null
     or new.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_SPLIT_EXEMPTION_QUEUE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_splits s
    where s.queue_entry_id=new.queue_entry_id
       or s.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_SPLIT_EXISTS';
  end if;

  if exists (
    select 1
    from public.reward_payouts p
    where p.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_EXEMPTION_TOO_LATE';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_reward_x_promotion_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_expected record;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_budget numeric(78,0) := 0;
  v_committed numeric(78,0) := 0;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if btrim(new.policy_version)<>btrim(v_cfg.reward_x_promotion_policy_version) then
    raise exception 'REWARD_X_PROMOTION_POLICY_MISMATCH';
  end if;

  if new.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  if new.mode='LIVE' and not v_cfg.reward_x_promotion_enabled then
    raise exception 'REWARD_X_PROMOTION_LIVE_DISABLED';
  end if;

  if new.mode='SHADOW' and not v_cfg.reward_x_promotion_shadow_enabled then
    raise exception 'REWARD_X_PROMOTION_SHADOW_DISABLED';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.id=new.queue_entry_id;

  if not found
     or v_queue.invite_code<>new.invite_code
     or v_queue.network<>new.network
     or lower(v_queue.recipient_wallet)<>new.recipient_wallet
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<>new.reservation_amount_wei
     or v_queue.reserved_at is null then
    raise exception 'REWARD_X_PROMOTION_QUEUE_MISMATCH';
  end if;

  if new.mode='SHADOW' and (
    v_cfg.reward_x_promotion_shadow_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_shadow_started_at
    or (
      v_cfg.reward_x_promotion_live_started_at is not null
      and v_queue.reserved_at >= v_cfg.reward_x_promotion_live_started_at
    )
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_SHADOW_WINDOW';
  end if;

  if new.mode='LIVE' and (
    v_cfg.reward_x_promotion_live_started_at is null
    or v_queue.reserved_at < v_cfg.reward_x_promotion_live_started_at
  ) then
    raise exception 'REWARD_X_PROMOTION_OUTSIDE_LIVE_WINDOW';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.invite_code=new.invite_code;

  if not found
     or lower(v_invitation.inviter_wallet)<>new.recipient_wallet
     or v_invitation.activation_network<>new.network
     or v_invitation.reward_cohort_round_id<>new.source_reward_cohort_round_id
     or v_invitation.reward_funding_allocation_receipt_id<>new.source_allocation_receipt_id then
    raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
  end if;

  select * into v_expected
  from public.calculate_reward_x_promotion_additive_v2(
    new.reservation_amount_wei
  );

  if new.base_amount_wei<>v_expected.base_amount_wei
     or new.promotion_amount_wei<>v_expected.promotion_amount_wei
     or new.promotion_rate_bps<>v_expected.promotion_rate_bps
     or new.promotion_cap_wei<>v_expected.promotion_cap_wei then
    raise exception 'REWARD_X_PROMOTION_CALCULATION_MISMATCH';
  end if;

  if new.mode='LIVE' then
    select * into v_receipt
    from public.vebetter_round_allocations a
    where a.id=new.source_allocation_receipt_id;

    if not found
       or v_receipt.network<>new.network
       or v_receipt.vebetter_round_id+1<>new.source_reward_cohort_round_id then
      raise exception 'REWARD_X_PROMOTION_SOURCE_MISMATCH';
    end if;

    -- The queue row already exists and is included in committed value. The
    -- additive X bonus is not, so reserve it explicitly before promising it.
    v_budget:=public.read_reward_cohort_effective_budget_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );
    v_committed:=public.read_reward_cohort_committed_wei(
      new.network,
      v_receipt.app_id,
      new.source_reward_cohort_round_id,
      new.source_allocation_receipt_id
    );

    if v_committed+new.promotion_amount_wei>v_budget then
      raise exception 'REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED';
    end if;
  end if;

  if new.mode='LIVE' and exists (
    select 1
    from public.reward_payouts rp
    where rp.invite_code=new.invite_code
  ) then
    raise exception 'REWARD_X_PROMOTION_SPLIT_TOO_LATE';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_reward_x_promotion_live_split_from_queue()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_invitation public.invitations%rowtype;
  v_calc record;
  v_runtime jsonb;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if new.reserved_amount_wei is null
     or new.reserved_amount_wei<=0
     or new.reserved_at is null then
    return new;
  end if;

  if not v_cfg.reward_x_promotion_enabled then
    if v_cfg.reward_x_promotion_live_started_at is not null
       and new.reserved_at>=v_cfg.reward_x_promotion_live_started_at then
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'FEATURE_DISABLED_AFTER_LIVE_START',
        '{}'::jsonb
      );
    end if;
    return new;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'LIVE_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return new;
  end if;

  if v_cfg.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'POLICY_UNSUPPORTED',
      jsonb_build_object(
        'policyVersion',
        coalesce(v_cfg.reward_x_promotion_policy_version,'')
      )
    );
    return new;
  end if;

  if not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'DEPENDENCY_GATE_NOT_READY',
      jsonb_build_object(
        'payoutEnabled',
        v_cfg.reward_x_promotion_payout_enabled,
        'externalVerificationReady',
        v_cfg.reward_x_promotion_external_verification_ready
      )
    );
    return new;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'EXTERNAL_READY_START_MISSING',
      '{}'::jsonb
    );
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      'BEFORE_EXTERNAL_READY_START',
      '{}'::jsonb
    );
    return new;
  end if;

  begin
    v_runtime :=
      public.read_reward_x_promotion_external_runtime_readiness_v1(
        new.network,
        1200
      );

    if not coalesce((v_runtime->>'ready')::boolean,false) then
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'EXTERNAL_RUNTIME_NOT_READY',
        jsonb_build_object(
          'runtimeReason',
          coalesce(v_runtime->>'reason','UNKNOWN')
        )
      );
      return new;
    end if;

    if not exists (
      select 1
      from public.referral_links r
      where lower(r.inviter_wallet)=lower(new.recipient_wallet)
        and r.status='ACTIVE'
        and r.referral_key ~ '^(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$'
    ) then
      perform public.record_reward_x_promotion_split_exemption_v1(
        new.id,
        new.invite_code,
        'ACTIVE_REFERRAL_LINK_MISSING',
        '{}'::jsonb
      );
      return new;
    end if;

    select * into v_invitation
    from public.invitations i
    where i.invite_code=new.invite_code;

    if not found
       or v_invitation.reward_cohort_round_id is null
       or v_invitation.reward_funding_allocation_receipt_id is null
       or lower(v_invitation.inviter_wallet)<>lower(new.recipient_wallet)
       or v_invitation.activation_network<>new.network then
      raise exception 'REWARD_X_PROMOTION_LIVE_SOURCE_MISSING';
    end if;

    select * into v_calc
    from public.calculate_reward_x_promotion_additive_v2(
      new.reserved_amount_wei
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
      new.id,
      new.invite_code,
      new.network,
      lower(new.recipient_wallet),
      new.reserved_amount_wei,
      v_calc.base_amount_wei,
      v_calc.promotion_amount_wei,
      v_invitation.reward_cohort_round_id,
      v_invitation.reward_funding_allocation_receipt_id,
      'LIVE',
      v_cfg.reward_x_promotion_policy_version,
      v_calc.promotion_rate_bps,
      v_calc.promotion_cap_wei
    );
  exception when others then
    perform public.record_reward_x_promotion_split_exemption_v1(
      new.id,
      new.invite_code,
      case
        when sqlerrm like '%REWARD_X_PROMOTION_BONUS_BUDGET_EXCEEDED%'
          then 'PROMOTION_BUDGET_UNAVAILABLE'
        else 'SPLIT_CREATION_FAILED'
      end,
      jsonb_build_object('sqlstate',sqlstate)
    );
    return new;
  end;

  return new;
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

  if v_cfg.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then
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
      v_cfg.reward_x_promotion_policy_version,
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

CREATE OR REPLACE FUNCTION public.read_reward_batch_transfer_amount_wei_v1(p_invite_code text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_cfg public.reward_runtime_config%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
  v_exemption public.reward_x_promotion_split_exemptions%rowtype;
begin
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  select * into v_queue
  from public.reward_queue_entries q
  where q.invite_code=v_code;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei<=0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_BATCH_RESERVATION_MISSING';
  end if;

  -- Existing LIVE promises remain authoritative regardless of later runtime
  -- changes.
  select * into v_split
  from public.reward_x_promotion_splits s
  where s.invite_code=v_code
    and s.mode='LIVE';

  if found then
    if v_split.queue_entry_id<>v_queue.id
       or v_split.network<>v_queue.network
       or v_split.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_split.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_split.policy_version<>'x-promotion-additive-v2'
       or v_split.base_amount_wei<=0
       or v_split.base_amount_wei<>v_queue.reserved_amount_wei then
      raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISMATCH';
    end if;

    if v_split.promotion_amount_wei>0 then
      select * into v_obligation
      from public.reward_x_promotion_obligations o
      where o.split_id=v_split.id
        and o.invite_code=v_code;

      if not found
         or v_obligation.network<>v_split.network
         or v_obligation.recipient_wallet<>v_split.recipient_wallet
         or v_obligation.promotion_amount_wei<>v_split.promotion_amount_wei
         or v_obligation.policy_version<>v_split.policy_version
         or v_obligation.financial_state<>'RESERVED' then
        raise exception 'REWARD_X_PROMOTION_OBLIGATION_NOT_RESERVED';
      end if;
    end if;

    return v_split.base_amount_wei;
  end if;

  -- A durable exemption records that this exact reservation intentionally
  -- stayed on the legacy full-payout path. Runtime changes after reservation
  -- cannot retroactively turn it into a missing-split failure.
  select * into v_exemption
  from public.reward_x_promotion_split_exemptions e
  where e.queue_entry_id=v_queue.id
    and e.invite_code=v_code;

  if found then
    if v_exemption.network<>v_queue.network
       or v_exemption.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_exemption.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_exemption.policy_version<>'x-promotion-additive-v2' then
      raise exception 'REWARD_X_PROMOTION_SPLIT_EXEMPTION_MISMATCH';
    end if;

    return v_queue.reserved_amount_wei;
  end if;

  if not v_cfg.reward_x_promotion_enabled then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  -- Preserve pre-exemption grandfathering for reservations created while the
  -- external verification gate was unavailable.
  if not v_cfg.reward_x_promotion_external_verification_ready then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  raise exception 'REWARD_X_PROMOTION_LIVE_SPLIT_MISSING';
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_post_base_liability_wei(p_network text, p_app_id text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_amount numeric(78,0) := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;
  if v_app_id<>v_veinvite_app_id then
    raise exception 'REWARD_X_PROMOTION_APP_MISMATCH';
  end if;

  select coalesce(sum(o.promotion_amount_wei),0)
  into v_amount
  from public.reward_x_promotion_obligations o
  join public.reward_x_promotion_splits s
    on s.id=o.split_id
   and s.mode='LIVE'
  where o.network=v_network
    and o.financial_state in ('RESERVED','HELD');

  return v_amount;
end;
$function$;

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

  return
    v_queue_committed +
    v_x_promotion_committed +
    v_offset_committed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_shadow_audit(p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_cfg public.reward_runtime_config%rowtype;
  v_total_count integer := 0;
  v_shadow_count integer := 0;
  v_live_count integer := 0;
  v_conservation_mismatch integer := 0;
  v_calculation_mismatch integer := 0;
  v_queue_mismatch integer := 0;
  v_source_mismatch integer := 0;
  v_window_mismatch integer := 0;
  v_policy_mismatch integer := 0;
  v_missing_projection integer := 0;
  v_reservation numeric(78,0) := 0;
  v_base numeric(78,0) := 0;
  v_promotion numeric(78,0) := 0;
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

  with audited as (
    select
      s.*,
      q.id as queue_found_id,
      q.invite_code as queue_invite_code,
      q.network as queue_network,
      lower(q.recipient_wallet) as queue_recipient_wallet,
      q.reserved_amount_wei as queue_reserved_amount_wei,
      q.reserved_at as queue_reserved_at,
      i.invite_code as invitation_found_code,
      lower(i.inviter_wallet) as invitation_inviter_wallet,
      i.activation_network as invitation_network,
      i.reward_cohort_round_id as invitation_cohort_round_id,
      i.reward_funding_allocation_receipt_id as invitation_allocation_receipt_id,
      c.base_amount_wei as expected_base_amount_wei,
      c.promotion_amount_wei as expected_promotion_amount_wei,
      c.promotion_rate_bps as expected_promotion_rate_bps,
      c.promotion_cap_wei as expected_promotion_cap_wei
    from public.reward_x_promotion_splits s
    left join public.reward_queue_entries q
      on q.id=s.queue_entry_id
    left join public.invitations i
      on i.invite_code=s.invite_code
    cross join lateral public.calculate_reward_x_promotion_additive_v2(
      s.reservation_amount_wei
    ) c
    where s.network=v_network
  )
  select
    count(*)::integer,
    count(*) filter (where mode='SHADOW')::integer,
    count(*) filter (where mode='LIVE')::integer,
    count(*) filter (
      where base_amount_wei<>reservation_amount_wei
    )::integer,
    count(*) filter (
      where base_amount_wei<>expected_base_amount_wei
         or promotion_amount_wei<>expected_promotion_amount_wei
         or promotion_rate_bps<>expected_promotion_rate_bps
         or promotion_cap_wei<>expected_promotion_cap_wei
    )::integer,
    count(*) filter (
      where queue_found_id is null
         or queue_invite_code<>invite_code
         or queue_network<>network
         or queue_recipient_wallet<>recipient_wallet
         or queue_reserved_amount_wei<>reservation_amount_wei
         or queue_reserved_at is null
    )::integer,
    count(*) filter (
      where invitation_found_code is null
         or invitation_inviter_wallet<>recipient_wallet
         or invitation_network<>network
         or invitation_cohort_round_id<>source_reward_cohort_round_id
         or invitation_allocation_receipt_id<>source_allocation_receipt_id
    )::integer,
    count(*) filter (
      where (
        mode='SHADOW'
        and (
          v_cfg.reward_x_promotion_shadow_started_at is null
          or queue_reserved_at is null
          or queue_reserved_at<v_cfg.reward_x_promotion_shadow_started_at
          or (
            v_cfg.reward_x_promotion_live_started_at is not null
            and queue_reserved_at>=v_cfg.reward_x_promotion_live_started_at
          )
        )
      )
      or (
        mode='LIVE'
        and (
          v_cfg.reward_x_promotion_live_started_at is null
          or queue_reserved_at is null
          or queue_reserved_at<v_cfg.reward_x_promotion_live_started_at
        )
      )
    )::integer,
    count(*) filter (
      where btrim(policy_version)<>btrim(v_cfg.reward_x_promotion_policy_version)
    )::integer,
    coalesce(sum(reservation_amount_wei),0),
    coalesce(sum(base_amount_wei),0),
    coalesce(sum(promotion_amount_wei),0)
  into
    v_total_count,
    v_shadow_count,
    v_live_count,
    v_conservation_mismatch,
    v_calculation_mismatch,
    v_queue_mismatch,
    v_source_mismatch,
    v_window_mismatch,
    v_policy_mismatch,
    v_reservation,
    v_base,
    v_promotion
  from audited;

  select count(*)::integer
  into v_missing_projection
  from public.reward_queue_entries q
  join public.invitations i
    on i.invite_code=q.invite_code
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.reserved_amount_wei>0
    and q.reserved_at is not null
    and v_cfg.reward_x_promotion_shadow_started_at is not null
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
    );

  return jsonb_build_object(
    'ok',
      v_conservation_mismatch=0
      and v_calculation_mismatch=0
      and v_queue_mismatch=0
      and v_source_mismatch=0
      and v_window_mismatch=0
      and v_policy_mismatch=0
      and v_missing_projection=0,
    'network',v_network,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'shadowStartedAt',v_cfg.reward_x_promotion_shadow_started_at,
    'liveStartedAt',v_cfg.reward_x_promotion_live_started_at,
    'totalCount',v_total_count,
    'shadowCount',v_shadow_count,
    'liveCount',v_live_count,
    'reservationWei',v_reservation::text,
    'baseWei',v_base::text,
    'promotionWei',v_promotion::text,
    'violations',jsonb_build_object(
      'conservation',v_conservation_mismatch,
      'calculation',v_calculation_mismatch,
      'queueBinding',v_queue_mismatch,
      'sourceBinding',v_source_mismatch,
      'activationWindow',v_window_mismatch,
      'policyVersion',v_policy_mismatch,
      'missingProjection',v_missing_projection
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_historical_replay_audit_v1(p_network text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(p_network));
  v_limit integer := greatest(1,least(coalesce(p_limit,500),5000));
  v_cfg public.reward_runtime_config%rowtype;
  v_cutoff timestamptz;
  v_eligible_count bigint := 0;
  v_sample_count bigint := 0;
  v_reservation numeric(78,0) := 0;
  v_base numeric(78,0) := 0;
  v_promotion numeric(78,0) := 0;
  v_conservation_delta numeric(78,0) := 0;
  v_nonpositive_base bigint := 0;
  v_negative_promotion bigint := 0;
  v_cap_violations bigint := 0;
  v_binding_violations bigint := 0;
  v_rate_violations bigint := 0;
  v_min_promotion numeric(78,0);
  v_max_promotion numeric(78,0);
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

  v_cutoff := coalesce(v_cfg.reward_x_promotion_shadow_started_at,now());

  select count(*)::bigint
  into v_eligible_count
  from public.reward_queue_entries q
  where q.network=v_network
    and q.reserved_amount_wei is not null
    and q.reserved_amount_wei>0
    and q.reserved_at is not null
    and q.reserved_at<v_cutoff;

  with source as (
    select
      q.id,
      q.invite_code,
      q.network,
      q.recipient_wallet,
      q.reserved_amount_wei,
      q.reserved_at,
      i.invite_code as invitation_code,
      i.inviter_wallet,
      i.activation_network,
      i.reward_cohort_round_id,
      i.reward_funding_allocation_receipt_id
    from public.reward_queue_entries q
    left join public.invitations i
      on i.invite_code=q.invite_code
    where q.network=v_network
      and q.reserved_amount_wei is not null
      and q.reserved_amount_wei>0
      and q.reserved_at is not null
      and q.reserved_at<v_cutoff
    order by q.reserved_at,q.id
    limit v_limit
  ),
  replay as (
    select
      s.*,
      c.base_amount_wei,
      c.promotion_amount_wei,
      c.promotion_rate_bps,
      c.promotion_cap_wei
    from source s
    cross join lateral public.calculate_reward_x_promotion_additive_v2(
      s.reserved_amount_wei
    ) c
  )
  select
    count(*)::bigint,
    coalesce(sum(reserved_amount_wei),0)::numeric(78,0),
    coalesce(sum(base_amount_wei),0)::numeric(78,0),
    coalesce(sum(promotion_amount_wei),0)::numeric(78,0),
    coalesce(sum(
      base_amount_wei-reserved_amount_wei
    ),0)::numeric(78,0),
    count(*) filter (where base_amount_wei<=0)::bigint,
    count(*) filter (where promotion_amount_wei<0)::bigint,
    count(*) filter (where promotion_amount_wei>promotion_cap_wei)::bigint,
    count(*) filter (
      where invitation_code is null
         or lower(coalesce(inviter_wallet,''))<>lower(recipient_wallet)
         or activation_network is distinct from network
         or reward_cohort_round_id is null
         or reward_funding_allocation_receipt_id is null
    )::bigint,
    count(*) filter (
      where promotion_rate_bps<>0
         or promotion_cap_wei<>10000000000000000000::numeric
    )::bigint,
    min(promotion_amount_wei)::numeric(78,0),
    max(promotion_amount_wei)::numeric(78,0)
  into
    v_sample_count,
    v_reservation,
    v_base,
    v_promotion,
    v_conservation_delta,
    v_nonpositive_base,
    v_negative_promotion,
    v_cap_violations,
    v_binding_violations,
    v_rate_violations,
    v_min_promotion,
    v_max_promotion
  from replay;

  return jsonb_build_object(
    'ok',
      v_sample_count>0
      and v_conservation_delta=0
      and v_nonpositive_base=0
      and v_negative_promotion=0
      and v_cap_violations=0
      and v_binding_violations=0
      and v_rate_violations=0,
    'network',v_network,
    'cutoffAt',v_cutoff,
    'eligibleHistoricalRows',v_eligible_count,
    'sampleCount',v_sample_count,
    'sampleLimit',v_limit,
    'truncated',v_eligible_count>v_sample_count,
    'reservationWei',v_reservation::text,
    'baseWei',v_base::text,
    'promotionWei',v_promotion::text,
    'conservationDeltaWei',v_conservation_delta::text,
    'minPromotionWei',case when v_min_promotion is null then null else v_min_promotion::text end,
    'maxPromotionWei',case when v_max_promotion is null then null else v_max_promotion::text end,
    'violations',jsonb_build_object(
      'nonPositiveBase',v_nonpositive_base,
      'negativePromotion',v_negative_promotion,
      'cap',v_cap_violations,
      'queueBinding',v_binding_violations,
      'policyConstants',v_rate_violations
    ),
    'policyVersion',v_cfg.reward_x_promotion_policy_version,
    'liveEnabled',v_cfg.reward_x_promotion_enabled,
    'shadowEnabled',v_cfg.reward_x_promotion_shadow_enabled,
    'payoutEnabled',v_cfg.reward_x_promotion_payout_enabled
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.read_reward_x_promotion_financial_integrity_audit_v1(p_network text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_live_splits integer := 0;
  v_split_calculation integer := 0;
  v_queue_binding integer := 0;
  v_source_binding integer := 0;
  v_obligation_binding integer := 0;
  v_core_payout_amount integer := 0;
  v_core_paid_without_receipt integer := 0;
  v_signed_without_submission integer := 0;
  v_submission_without_signed integer := 0;
  v_released_with_signed_commit integer := 0;
  v_intent_verification integer := 0;
  v_settlement_without_receipt integer := 0;
  v_receipt_without_paid_obligation integer := 0;
  v_paid_obligation_without_receipt integer := 0;
  v_receipt_binding integer := 0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where s.base_amount_wei<>s.reservation_amount_wei
         or s.base_amount_wei<>c.base_amount_wei
         or s.promotion_amount_wei<>c.promotion_amount_wei
         or s.promotion_rate_bps<>c.promotion_rate_bps
         or s.promotion_cap_wei<>c.promotion_cap_wei
    )::integer,
    count(*) filter (
      where q.id is null
         or q.id is distinct from s.queue_entry_id
         or q.invite_code is distinct from s.invite_code
         or q.network is distinct from s.network
         or lower(q.recipient_wallet) is distinct from s.recipient_wallet
         or q.reserved_amount_wei is distinct from s.reservation_amount_wei
         or q.reserved_at is null
    )::integer,
    count(*) filter (
      where i.invite_code is null
         or i.activation_network is distinct from s.network
         or lower(i.inviter_wallet) is distinct from s.recipient_wallet
         or i.reward_cohort_round_id is distinct from s.source_reward_cohort_round_id
         or i.reward_funding_allocation_receipt_id is distinct from s.source_allocation_receipt_id
    )::integer
  into
    v_live_splits,
    v_split_calculation,
    v_queue_binding,
    v_source_binding
  from public.reward_x_promotion_splits s
  left join public.reward_queue_entries q
    on q.id=s.queue_entry_id
  left join public.invitations i
    on i.invite_code=s.invite_code
  left join lateral public.calculate_reward_x_promotion_additive_v2(
    s.reservation_amount_wei
  ) c on true
  where s.network=v_network
    and s.mode='LIVE';

  select count(*)::integer
  into v_obligation_binding
  from public.reward_x_promotion_splits s
  left join public.reward_x_promotion_obligations o
    on o.split_id=s.id
  where s.network=v_network
    and s.mode='LIVE'
    and (
      (
        s.promotion_amount_wei>0
        and (
          o.id is null
          or o.invite_code is distinct from s.invite_code
          or o.network is distinct from s.network
          or o.recipient_wallet is distinct from s.recipient_wallet
          or o.promotion_amount_wei is distinct from s.promotion_amount_wei
          or o.source_reward_cohort_round_id is distinct from s.source_reward_cohort_round_id
          or o.source_allocation_receipt_id is distinct from s.source_allocation_receipt_id
          or o.policy_version is distinct from s.policy_version
        )
      )
      or (
        s.promotion_amount_wei=0
        and o.id is not null
      )
    );

  select count(*)::integer
  into v_core_payout_amount
  from public.reward_x_promotion_splits s
  join public.reward_payouts p
    on p.invite_code=s.invite_code
  where s.network=v_network
    and s.mode='LIVE'
    and (
      lower(p.recipient_wallet) is distinct from s.recipient_wallet
      or p.amount_wei is distinct from s.base_amount_wei
    );

  select count(*)::integer
  into v_core_paid_without_receipt
  from public.reward_x_promotion_splits s
  join public.reward_payouts p
    on p.invite_code=s.invite_code
   and p.status='PAID'
  where s.network=v_network
    and s.mode='LIVE'
    and not exists (
      select 1
      from public.reward_receipts r
      where r.payout_id=p.id
        and r.invite_code=s.invite_code
        and r.network=s.network
        and r.recipient_wallet=s.recipient_wallet
        and r.amount_wei=s.base_amount_wei
        and r.tx_id=p.tx_id
        and r.paid_at is not null
    );

  select count(*)::integer
  into v_signed_without_submission
  from public.reward_x_promotion_payout_signed_transactions st
  join public.reward_x_promotion_payout_intents pi
    on pi.id=st.intent_id
  where st.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_payout_submissions ps
      where ps.signed_transaction_id=st.id
        and ps.intent_id=st.intent_id
        and ps.manifest_id=st.manifest_id
        and ps.manifest_hash=st.manifest_hash
        and ps.tx_id=st.tx_id
        and ps.operator_wallet=st.operator_wallet
        and ps.network=st.network
    );

  select count(*)::integer
  into v_submission_without_signed
  from public.reward_x_promotion_payout_submissions ps
  where ps.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_payout_signed_transactions st
      where st.id=ps.signed_transaction_id
        and st.intent_id=ps.intent_id
        and st.manifest_id=ps.manifest_id
        and st.manifest_hash=ps.manifest_hash
        and st.tx_id=ps.tx_id
        and st.operator_wallet=ps.operator_wallet
        and st.network=ps.network
    );

  select count(*)::integer
  into v_released_with_signed_commit
  from public.reward_x_promotion_obligations o
  where o.network=v_network
    and o.financial_state='RELEASED'
    and exists (
      select 1
      from public.reward_x_promotion_payout_intents pi
      join public.reward_x_promotion_payout_signed_transactions st
        on st.intent_id=pi.id
      where pi.obligation_id=o.id
        and pi.network=o.network
    );

  select count(*)::integer
  into v_intent_verification
  from public.reward_x_promotion_payout_intents pi
  left join public.reward_x_promotion_post_verifications pv
    on pv.id=pi.verification_id
  left join public.reward_x_promotion_obligations o
    on o.id=pi.obligation_id
  left join public.reward_x_promotion_splits s
    on s.id=pi.split_id
  where pi.network=v_network
    and (
      pv.id is null
      or pv.verification_state<>'FINAL_VERIFIED'
      or pv.invalidated_at is not null
      or pv.obligation_id<>pi.obligation_id
      or pv.split_id<>pi.split_id
      or pv.invite_code<>pi.invite_code
      or pv.network<>pi.network
      or pv.recipient_wallet<>pi.recipient_wallet
      or pv.x_post_id<>pi.x_post_id
      or pv.x_author_id<>pi.x_author_id
      or o.id is null
      or s.id is null
      or o.split_id<>s.id
      or o.invite_code<>pi.invite_code
      or o.network<>pi.network
      or o.recipient_wallet<>pi.recipient_wallet
      or o.promotion_amount_wei<>pi.amount_wei
      or s.promotion_amount_wei<>pi.amount_wei
      or pi.source_reward_cohort_round_id<>s.source_reward_cohort_round_id
      or pi.source_allocation_receipt_id<>s.source_allocation_receipt_id
      or pi.policy_version<>s.policy_version
    );

  select count(*)::integer
  into v_settlement_without_receipt
  from public.reward_x_promotion_payout_settlements ps
  join public.reward_x_promotion_payout_intents pi
    on pi.id=ps.intent_id
  where ps.network=v_network
    and not exists (
      select 1
      from public.reward_x_promotion_receipts r
      where r.settlement_id=ps.id
        and r.intent_id=ps.intent_id
        and r.network=ps.network
        and r.tx_id=ps.tx_id
        and r.invite_code=pi.invite_code
        and r.recipient_wallet=pi.recipient_wallet
        and r.amount_wei=pi.amount_wei
        and r.public_proof_id=pi.public_proof_id
        and r.paid_at=ps.paid_at
    );

  select count(*)::integer
  into v_receipt_without_paid_obligation
  from public.reward_x_promotion_receipts r
  left join public.reward_x_promotion_obligations o
    on o.id=r.obligation_id
  where r.network=v_network
    and (
      o.id is null
      or o.financial_state<>'PAID'
      or o.paid_at is null
    );

  select count(*)::integer
  into v_paid_obligation_without_receipt
  from public.reward_x_promotion_obligations o
  where o.network=v_network
    and o.financial_state='PAID'
    and not exists (
      select 1
      from public.reward_x_promotion_receipts r
      where r.obligation_id=o.id
        and r.invite_code=o.invite_code
        and r.network=o.network
        and r.recipient_wallet=o.recipient_wallet
        and r.amount_wei=o.promotion_amount_wei
        and r.paid_at=o.paid_at
    );

  select count(*)::integer
  into v_receipt_binding
  from public.reward_x_promotion_receipts r
  left join public.reward_x_promotion_payout_intents pi
    on pi.id=r.intent_id
  left join public.reward_x_promotion_payout_settlements ps
    on ps.id=r.settlement_id
  left join public.reward_x_promotion_obligations o
    on o.id=r.obligation_id
  left join public.reward_x_promotion_splits s
    on s.id=r.split_id
  where r.network=v_network
    and (
      pi.id is null
      or ps.id is null
      or o.id is null
      or s.id is null
      or pi.obligation_id<>r.obligation_id
      or pi.split_id<>r.split_id
      or pi.invite_code<>r.invite_code
      or pi.network<>r.network
      or pi.recipient_wallet<>r.recipient_wallet
      or pi.amount_wei<>r.amount_wei
      or pi.public_proof_id<>r.public_proof_id
      or pi.x_post_id<>r.x_post_id
      or pi.x_author_id<>r.x_author_id
      or ps.intent_id<>r.intent_id
      or ps.tx_id<>r.tx_id
      or ps.network<>r.network
      or ps.paid_at<>r.paid_at
      or o.split_id<>r.split_id
      or o.invite_code<>r.invite_code
      or o.network<>r.network
      or o.recipient_wallet<>r.recipient_wallet
      or o.promotion_amount_wei<>r.amount_wei
      or o.source_reward_cohort_round_id<>r.source_reward_cohort_round_id
      or o.source_allocation_receipt_id<>r.source_allocation_receipt_id
      or s.invite_code<>r.invite_code
      or s.network<>r.network
      or s.recipient_wallet<>r.recipient_wallet
      or s.promotion_amount_wei<>r.amount_wei
      or s.source_reward_cohort_round_id<>r.source_reward_cohort_round_id
      or s.source_allocation_receipt_id<>r.source_allocation_receipt_id
    );

  return jsonb_build_object(
    'ok',
      v_split_calculation=0
      and v_queue_binding=0
      and v_source_binding=0
      and v_obligation_binding=0
      and v_core_payout_amount=0
      and v_core_paid_without_receipt=0
      and v_signed_without_submission=0
      and v_submission_without_signed=0
      and v_released_with_signed_commit=0
      and v_intent_verification=0
      and v_settlement_without_receipt=0
      and v_receipt_without_paid_obligation=0
      and v_paid_obligation_without_receipt=0
      and v_receipt_binding=0,
    'network',v_network,
    'liveSplitCount',v_live_splits,
    'violations',jsonb_build_object(
      'splitCalculation',v_split_calculation,
      'queueBinding',v_queue_binding,
      'sourceBinding',v_source_binding,
      'obligationBinding',v_obligation_binding,
      'corePayoutAmount',v_core_payout_amount,
      'corePaidWithoutReceipt',v_core_paid_without_receipt,
      'signedWithoutSubmission',v_signed_without_submission,
      'submissionWithoutSigned',v_submission_without_signed,
      'releasedWithSignedCommit',v_released_with_signed_commit,
      'intentVerification',v_intent_verification,
      'settlementWithoutReceipt',v_settlement_without_receipt,
      'receiptWithoutPaidObligation',v_receipt_without_paid_obligation,
      'paidObligationWithoutReceipt',v_paid_obligation_without_receipt,
      'receiptBinding',v_receipt_binding
    )
  );
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
      (case when v_cfg.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then 'POLICY_UNSUPPORTED' end),
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
      (case when v_cfg.reward_x_promotion_policy_version<>'x-promotion-additive-v2' then 'POLICY_UNSUPPORTED' end),
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
     or v_split.policy_version<>'x-promotion-additive-v2'
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

  if not found
     or v_payout.amount_wei<>v_split.base_amount_wei
     or v_payout.paid_at is null
     or not exists (
       select 1
       from public.reward_receipts r
       where r.payout_id=v_payout.id
         and r.invite_code=new.invite_code
         and r.network=new.network
         and r.recipient_wallet=new.recipient_wallet
         and r.amount_wei=v_split.base_amount_wei
         and r.paid_at is not null
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
     or v_split.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_OPPORTUNITY_SPLIT_MISMATCH';
  end if;

  select * into v_payout
  from public.reward_payouts p
  where p.invite_code=v_code
    and p.status='PAID';

  if not found
     or v_payout.amount_wei<>v_split.base_amount_wei
     or v_payout.paid_at is null
     or not exists (
       select 1
       from public.reward_receipts r
       where r.payout_id=v_payout.id
         and r.invite_code=v_code
         and r.network=v_obligation.network
         and r.recipient_wallet=v_obligation.recipient_wallet
         and r.amount_wei=v_split.base_amount_wei
         and r.paid_at is not null
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
     or v_opportunity.policy_version<>'x-promotion-additive-v2'
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
     or v_split.policy_version<>'x-promotion-additive-v2' then
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
     or v_opportunity.policy_version<>'x-promotion-additive-v2'
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
     or v_split.policy_version<>'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_POST_SPLIT_MISMATCH';
  end if;

  select * into v_identity
  from public.reward_x_promotion_x_identities i
  where i.network=new.network
    and i.recipient_wallet=new.recipient_wallet;

  if not found
     or v_identity.x_author_id<>new.x_author_id
     or v_identity.policy_version<>'x-promotion-additive-v2' then
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
        new.initial_verified_at+make_interval(secs=>new.retention_seconds) then
    raise exception 'REWARD_X_PROMOTION_POST_WINDOW_MISMATCH';
  end if;

  if position(v_opportunity.share_token::text in new.matched_expanded_url)=0 then
    raise exception 'REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING';
  end if;

  return new;
end;
$function$;


update public.reward_runtime_config
set reward_x_promotion_policy_version='x-promotion-additive-v2'
where id=1;

comment on function public.calculate_reward_x_promotion_additive_v2(numeric) is
  'X promotion v2: preserve the full fixed referral reservation and add a separate fixed 10 B3TR bonus, subject to cohort budget safety.';

comment on table public.reward_x_promotion_splits is
  'Immutable X promotion accounting records. Under x-promotion-additive-v2, base_amount_wei equals the full referral reservation and promotion_amount_wei is an additional fixed 10 B3TR liability.';

do $$
begin
  if (select reward_x_promotion_policy_version
      from public.reward_runtime_config where id=1)
       <> 'x-promotion-additive-v2' then
    raise exception 'REWARD_X_PROMOTION_ADDITIVE_POLICY_ACTIVATION_FAILED';
  end if;

  if exists (
    select 1
    from public.reward_x_promotion_splits s
    where s.policy_version='x-promotion-additive-v2'
      and (
        s.base_amount_wei<>s.reservation_amount_wei
        or s.promotion_amount_wei<>10000000000000000000::numeric
        or s.promotion_rate_bps<>0
        or s.promotion_cap_wei<>10000000000000000000::numeric
      )
  ) then
    raise exception 'REWARD_X_PROMOTION_ADDITIVE_POSTCHECK_FAILED';
  end if;
end $$;
