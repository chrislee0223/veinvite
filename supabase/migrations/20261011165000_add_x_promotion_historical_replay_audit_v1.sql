create or replace function public.read_reward_x_promotion_historical_replay_audit_v1(
  p_network text,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
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
    cross join lateral public.calculate_reward_x_promotion_split_v1(
      s.reserved_amount_wei
    ) c
  )
  select
    count(*)::bigint,
    coalesce(sum(reserved_amount_wei),0)::numeric(78,0),
    coalesce(sum(base_amount_wei),0)::numeric(78,0),
    coalesce(sum(promotion_amount_wei),0)::numeric(78,0),
    coalesce(sum(
      base_amount_wei+promotion_amount_wei-reserved_amount_wei
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
      where promotion_rate_bps<>1000
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

revoke all on function public.read_reward_x_promotion_historical_replay_audit_v1(text,integer)
from public,anon,authenticated;

grant execute on function public.read_reward_x_promotion_historical_replay_audit_v1(text,integer)
to service_role;

comment on function public.read_reward_x_promotion_historical_replay_audit_v1(text,integer)
is 'Read-only historical replay audit for X promotion split-v1. It never creates splits, obligations, opportunities, payouts, or changes LIVE readiness.';
