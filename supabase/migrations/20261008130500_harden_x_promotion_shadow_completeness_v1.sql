create or replace function public.validate_reward_x_promotion_split()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
declare
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
  v_cfg public.reward_runtime_config%rowtype;
  v_expected record;
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

  if new.policy_version<>'x-promotion-split-v1' then
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
  from public.calculate_reward_x_promotion_split_v1(
    new.reservation_amount_wei
  );

  if new.base_amount_wei<>v_expected.base_amount_wei
     or new.promotion_amount_wei<>v_expected.promotion_amount_wei
     or new.promotion_rate_bps<>v_expected.promotion_rate_bps
     or new.promotion_cap_wei<>v_expected.promotion_cap_wei then
    raise exception 'REWARD_X_PROMOTION_CALCULATION_MISMATCH';
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


revoke all on function public.validate_reward_x_promotion_split()
  from public,anon,authenticated;

create or replace function public.sync_reward_x_promotion_shadow_splits(
  p_network text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
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

  if v_cfg.reward_x_promotion_policy_version<>'x-promotion-split-v1' then
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
    from public.calculate_reward_x_promotion_split_v1(
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


revoke all on function public.sync_reward_x_promotion_shadow_splits(text,integer)
  from public,anon,authenticated;
grant execute on function public.sync_reward_x_promotion_shadow_splits(text,integer)
  to service_role;

create or replace function public.read_reward_x_promotion_shadow_audit(
  p_network text
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
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
    cross join lateral public.calculate_reward_x_promotion_split_v1(
      s.reservation_amount_wei
    ) c
    where s.network=v_network
  )
  select
    count(*)::integer,
    count(*) filter (where mode='SHADOW')::integer,
    count(*) filter (where mode='LIVE')::integer,
    count(*) filter (
      where reservation_amount_wei<>base_amount_wei+promotion_amount_wei
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


revoke all on function public.read_reward_x_promotion_shadow_audit(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_shadow_audit(text)
  to service_role;

comment on function public.read_reward_x_promotion_shadow_audit(text) is
  'Read-only invariant and completeness audit for X promotion shadow projections. It never mutates reward, payout, liability, cohort, or transfer state.';
