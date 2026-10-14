create or replace function public.create_reward_x_promotion_live_split_from_queue()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
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

  -- A LIVE split lowers the immediate referral transfer, so it must only be
  -- created while the entire follow-up promotion path is currently usable.
  -- The durable boolean gate alone is not enough: if the 15-minute maintenance
  -- cron stalls, a previously READY runtime check can become stale.
  if not v_cfg.reward_x_promotion_payout_enabled
     or not v_cfg.reward_x_promotion_external_verification_ready then
    return new;
  end if;

  if v_cfg.reward_x_promotion_external_verification_started_at is null then
    raise exception 'REWARD_X_PROMOTION_EXTERNAL_READY_START_MISSING';
  end if;

  if new.reserved_at<v_cfg.reward_x_promotion_external_verification_started_at then
    return new;
  end if;

  v_runtime :=
    public.read_reward_x_promotion_external_runtime_readiness_v1(
      new.network,
      1200
    );

  if not coalesce((v_runtime->>'ready')::boolean,false) then
    -- Fail soft before any split row exists: the referral keeps the legacy
    -- full reservation and therefore cannot lose value during an external
    -- dependency or cron outage.
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

create or replace function public.create_reward_x_promotion_opportunity_v1(
  p_invite_code text
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
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
     or v_split.policy_version<>'x-promotion-split-v1' then
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

comment on function public.create_reward_x_promotion_live_split_from_queue() is
  'Creates LIVE reward splits only while payout and external verification gates are enabled and the latest external runtime readiness check is fresh. Stale runtime keeps the full legacy referral reservation.';

comment on function public.create_reward_x_promotion_opportunity_v1(text) is
  'Starts the 24-hour X promotion offer only while LIVE, payout, external verification, and a fresh external runtime readiness check are all active. Existing HELD obligations remain preserved while offers are paused.';
