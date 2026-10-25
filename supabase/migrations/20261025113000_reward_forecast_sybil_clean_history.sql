begin;

create or replace function public.read_reward_forecast_history(
  p_network text,
  p_app_id text,
  p_allocation_limit integer default 8,
  p_recipient_limit integer default 8
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allocations jsonb := '[]'::jsonb;
  v_recipient_counts jsonb := '[]'::jsonb;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'invalid app id';
  end if;

  if p_allocation_limit is null or p_allocation_limit not between 1 and 20 then
    raise exception 'allocation limit out of range';
  end if;

  if p_recipient_limit is null or p_recipient_limit not between 1 and 20 then
    raise exception 'recipient limit out of range';
  end if;

  select coalesce(jsonb_agg(a.amount_text order by a.vebetter_round_id desc), '[]'::jsonb)
  into v_allocations
  from (
    select
      va.vebetter_round_id,
      va.rewards_allocation_amount_wei::text as amount_text
    from public.vebetter_round_allocations va
    where va.network = p_network
      and va.app_id = p_app_id
      and va.rewards_allocation_amount_wei > 0
    order by va.vebetter_round_id desc
    limit p_allocation_limit
  ) a;

  -- Forecast-only: receipts and previously paid transfers remain immutable.
  -- Fill zero-recipient completed funding rounds as genuine observed zeros.
  -- Exclude the latest funded allocation, whose participant cohort is still
  -- in progress and may legitimately have no payment yet.
  with completed_funding_rounds as (
    select a.vebetter_round_id
    from public.vebetter_round_allocations a
    where a.network = p_network
      and a.app_id = p_app_id
      and a.vebetter_round_id < (
        select max(latest.vebetter_round_id)
        from public.vebetter_round_allocations latest
        where latest.network = p_network
          and latest.app_id = p_app_id
      )
    group by a.vebetter_round_id
    order by a.vebetter_round_id desc
    limit p_recipient_limit
  ),
  valid_by_round as (
    select
      funding.vebetter_round_id,
      count(receipt.id) filter (
        where assessment.state = 'CLEAR'
          and invalidation.id is null
      )::integer as valid_recipients
    from completed_funding_rounds funding
    left join public.reward_receipts receipt
      on receipt.vebetter_round_id = funding.vebetter_round_id
     and receipt.network = p_network
     and exists (
       select 1 from public.reward_rounds payout_round
       where payout_round.id = receipt.round_id
         and payout_round.network = p_network
         and payout_round.app_id = p_app_id
     )
    left join public.sybil_v2_referral_assessments assessment
      on assessment.network = receipt.network
     and assessment.invite_code = receipt.invite_code
    left join public.sybil_v2_referral_invalidations invalidation
      on invalidation.network = receipt.network
     and invalidation.invite_code = receipt.invite_code
     and invalidation.status = 'ACTIVE'
    group by funding.vebetter_round_id
  )
  select coalesce(
    jsonb_agg(r.valid_recipients order by r.vebetter_round_id desc),
    '[]'::jsonb
  )
  into v_recipient_counts
  from valid_by_round r;

  return jsonb_build_object(
    'allocationWeiNewestFirst', v_allocations,
    'completedRecipientCountsNewestFirst', v_recipient_counts
  );
end;
$$;

revoke all on function public.read_reward_forecast_history(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.read_reward_forecast_history(text, text, integer, integer)
  to service_role;

commit;
