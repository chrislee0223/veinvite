alter table public.reward_runtime_config
  add column if not exists reward_x_promotion_external_verification_ready boolean not null default false,
  add column if not exists reward_x_promotion_external_verification_started_at timestamptz;

alter table public.reward_x_promotion_runtime_events
  add column if not exists previous_external_verification_ready boolean,
  add column if not exists external_verification_ready boolean,
  add column if not exists previous_external_verification_started_at timestamptz,
  add column if not exists external_verification_started_at timestamptz;

comment on column public.reward_runtime_config.reward_x_promotion_external_verification_ready is
  'Operator-controlled gate for creating new X promotion splits only after the external X verification dependency is ready. Existing LIVE splits remain authoritative.';
comment on column public.reward_runtime_config.reward_x_promotion_external_verification_started_at is
  'Fresh boundary for the current external-verification-ready window. Reservations before this boundary remain full legacy payouts when no LIVE split exists.';

create or replace function public.guard_reward_x_promotion_external_verification_readiness_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_now timestamptz := clock_timestamp();
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

    if new.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
      raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
    end if;

    if new.reward_x_promotion_external_verification_started_at is null then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
    end if;

    if new.reward_x_promotion_external_verification_started_at < v_now - interval '60 seconds'
       or new.reward_x_promotion_external_verification_started_at > v_now + interval '10 seconds' then
      raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_NOT_FRESH';
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

drop trigger if exists guard_reward_x_promotion_external_verification_readiness_v1
  on public.reward_runtime_config;
create trigger guard_reward_x_promotion_external_verification_readiness_v1
before update of
  reward_x_promotion_external_verification_ready,
  reward_x_promotion_external_verification_started_at
on public.reward_runtime_config
for each row
execute function public.guard_reward_x_promotion_external_verification_readiness_v1();

revoke all on function public.guard_reward_x_promotion_external_verification_readiness_v1()
  from public,anon,authenticated;

create or replace function public.log_reward_x_promotion_runtime_event()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.reward_x_promotion_shadow_enabled
       is distinct from old.reward_x_promotion_shadow_enabled
     or new.reward_x_promotion_enabled
       is distinct from old.reward_x_promotion_enabled
     or new.reward_x_promotion_payout_enabled
       is distinct from old.reward_x_promotion_payout_enabled
     or new.reward_x_promotion_policy_version
       is distinct from old.reward_x_promotion_policy_version
     or new.reward_x_promotion_shadow_started_at
       is distinct from old.reward_x_promotion_shadow_started_at
     or new.reward_x_promotion_live_started_at
       is distinct from old.reward_x_promotion_live_started_at
     or new.reward_x_promotion_external_verification_ready
       is distinct from old.reward_x_promotion_external_verification_ready
     or new.reward_x_promotion_external_verification_started_at
       is distinct from old.reward_x_promotion_external_verification_started_at
  then
    insert into public.reward_x_promotion_runtime_events(
      config_id,
      previous_shadow_enabled,
      shadow_enabled,
      previous_live_enabled,
      live_enabled,
      previous_payout_enabled,
      payout_enabled,
      previous_policy_version,
      policy_version,
      previous_shadow_started_at,
      shadow_started_at,
      previous_live_started_at,
      live_started_at,
      previous_external_verification_ready,
      external_verification_ready,
      previous_external_verification_started_at,
      external_verification_started_at,
      database_actor
    ) values (
      new.id,
      old.reward_x_promotion_shadow_enabled,
      new.reward_x_promotion_shadow_enabled,
      old.reward_x_promotion_enabled,
      new.reward_x_promotion_enabled,
      old.reward_x_promotion_payout_enabled,
      new.reward_x_promotion_payout_enabled,
      old.reward_x_promotion_policy_version,
      new.reward_x_promotion_policy_version,
      old.reward_x_promotion_shadow_started_at,
      new.reward_x_promotion_shadow_started_at,
      old.reward_x_promotion_live_started_at,
      new.reward_x_promotion_live_started_at,
      old.reward_x_promotion_external_verification_ready,
      new.reward_x_promotion_external_verification_ready,
      old.reward_x_promotion_external_verification_started_at,
      new.reward_x_promotion_external_verification_started_at,
      current_user
    );
  end if;

  return new;
end;
$function$;

create or replace function public.create_reward_x_promotion_live_split_from_queue()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_cfg public.reward_runtime_config%rowtype;
  v_invitation public.invitations%rowtype;
  v_calc record;
begin
  select * into v_cfg
  from public.reward_runtime_config
  where id=1;

  if not found then
    raise exception 'REWARD_RUNTIME_CONFIG_MISSING';
  end if;

  if not v_cfg.reward_x_promotion_enabled then
    return new;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_cfg.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
    raise exception 'REWARD_X_PROMOTION_POLICY_UNSUPPORTED';
  end if;

  if new.reserved_amount_wei is null
     or new.reserved_amount_wei<=0
     or new.reserved_at is null then
    return new;
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return new;
  end if;

  -- External verification is a separate operational dependency. Until it is
  -- explicitly ready, new reservations remain full legacy payouts rather than
  -- entering a split that the user cannot actually complete.
  if not v_cfg.reward_x_promotion_external_verification_ready then
    return new;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
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
  from public.calculate_reward_x_promotion_split_v1(
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

  return new;
end;
$function$;

create or replace function public.read_reward_batch_transfer_amount_wei_v1(p_invite_code text)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_invite_code,'')));
  v_cfg public.reward_runtime_config%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_split public.reward_x_promotion_splits%rowtype;
  v_obligation public.reward_x_promotion_obligations%rowtype;
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

  -- Existing LIVE promises always win, even if new offers are paused later.
  select * into v_split
  from public.reward_x_promotion_splits s
  where s.invite_code=v_code
    and s.mode='LIVE';

  if found then
    if v_split.queue_entry_id<>v_queue.id
       or v_split.network<>v_queue.network
       or v_split.recipient_wallet<>lower(v_queue.recipient_wallet)
       or v_split.reservation_amount_wei<>v_queue.reserved_amount_wei
       or v_split.policy_version<>'x-promotion-split-v1'
       or v_split.base_amount_wei<=0
       or v_split.base_amount_wei+v_split.promotion_amount_wei<>v_queue.reserved_amount_wei then
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

  if not v_cfg.reward_x_promotion_enabled then
    return v_queue.reserved_amount_wei;
  end if;

  if v_cfg.reward_x_promotion_live_started_at is null then
    raise exception 'REWARD_X_PROMOTION_LIVE_START_MISSING';
  end if;

  if v_queue.reserved_at<v_cfg.reward_x_promotion_live_started_at then
    return v_queue.reserved_amount_wei;
  end if;

  -- While external verification is not ready, unsplit reservations are
  -- deliberately grandfathered to the original full payout.
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

revoke all on function public.guard_reward_x_promotion_external_verification_readiness_v1()
  from public,anon,authenticated;
revoke all on function public.read_reward_batch_transfer_amount_wei_v1(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_batch_transfer_amount_wei_v1(text)
  to service_role;
