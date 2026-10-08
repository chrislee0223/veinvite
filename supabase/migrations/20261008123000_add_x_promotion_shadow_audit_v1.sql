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

  return jsonb_build_object(
    'ok',
      v_conservation_mismatch=0
      and v_calculation_mismatch=0
      and v_queue_mismatch=0
      and v_source_mismatch=0
      and v_window_mismatch=0
      and v_policy_mismatch=0,
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
      'policyVersion',v_policy_mismatch
    )
  );
end;
$function$;

revoke all on function public.read_reward_x_promotion_shadow_audit(text)
  from public,anon,authenticated;
grant execute on function public.read_reward_x_promotion_shadow_audit(text)
  to service_role;

comment on function public.read_reward_x_promotion_shadow_audit(text) is
  'Read-only invariant audit for X promotion split projections. It never mutates reward, payout, liability, cohort, or transfer state.';
