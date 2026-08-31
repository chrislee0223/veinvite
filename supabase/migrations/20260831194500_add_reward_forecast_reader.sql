begin;

create or replace function public.read_latest_reward_forecast_snapshot(
  p_network text,
  p_app_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'invalid app id';
  end if;

  select jsonb_build_object(
    'generated_at', s.generated_at,
    'basis_allocation_round_id', s.basis_allocation_round_id,
    'projected_funding_round_id', s.projected_funding_round_id,
    'earliest_completion_round_id', s.earliest_completion_round_id,
    'allocation_sample_count', s.allocation_sample_count,
    'recipient_history_round_count', s.recipient_history_round_count,
    'projected_allocation_wei', s.projected_allocation_wei::text,
    'projected_allocation_low_wei', s.projected_allocation_low_wei::text,
    'projected_allocation_high_wei', s.projected_allocation_high_wei::text,
    'observed_pool_balance_wei', s.observed_pool_balance_wei::text,
    'reserved_existing_wei', s.reserved_existing_wei::text,
    'expected_recipients', s.expected_recipients,
    'recipient_low', s.recipient_low,
    'recipient_high', s.recipient_high,
    'estimated_reward_wei', s.estimated_reward_wei::text,
    'estimated_reward_low_wei', s.estimated_reward_low_wei::text,
    'estimated_reward_high_wei', s.estimated_reward_high_wei::text,
    'model_version', s.model_version
  )
  into v_result
  from public.reward_forecast_snapshots s
  where s.network = p_network
    and s.app_id = p_app_id
  order by s.generated_at desc, s.id desc
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.read_latest_reward_forecast_snapshot(text, text)
  from public, anon, authenticated;
grant execute on function public.read_latest_reward_forecast_snapshot(text, text)
  to service_role;

commit;
