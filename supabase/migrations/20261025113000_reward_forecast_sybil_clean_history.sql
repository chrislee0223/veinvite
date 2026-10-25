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

  -- Forecast-only: leave on-chain payouts and historical receipts untouched.
  -- Learn from validated referrals grouped by VeBetter funding round,
  -- rather than treating each reward-round settlement as a one-person week.
  select coalesce(jsonb_agg(r.valid_recipients order by r.vebetter_round_id desc), '[]'::jsonb)
  into v_recipient_counts
  from (
    select
      receipt.vebetter_round_id,
      count(*)::integer as valid_recipients
    from public.reward_receipts receipt
    where receipt.network = p_network
      and receipt.vebetter_round_id is not null
      and exists (
        select 1
        from public.vebetter_round_allocations allocation
        where allocation.network = receipt.network
          and allocation.vebetter_round_id = receipt.vebetter_round_id
          and allocation.app_id = p_app_id
      )
      and exists (
        select 1
        from public.sybil_v2_referral_assessments assessment
        where assessment.network = receipt.network
          and assessment.invite_code = receipt.invite_code
          and assessment.state = 'CLEAR'
      )
      and not exists (
        select 1
        from public.sybil_v2_referral_invalidations invalidation
        where invalidation.network = receipt.network
          and invalidation.invite_code = receipt.invite_code
          and invalidation.status = 'ACTIVE'
      )
    group by receipt.vebetter_round_id
    order by receipt.vebetter_round_id desc
    limit p_recipient_limit
  ) r;

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
