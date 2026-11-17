-- Decode NUMERIC(78,0) Wei as exact decimal TEXT, not JSON numbers.
-- Server-only, read-only: never creates a quote, entitlement, or payout.
create or replace function public.read_latest_reward_pool_observation(
  p_network text, p_app_id text
) returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $function$
declare
  v_result jsonb;
begin
  p_network := lower(btrim(coalesce(p_network,'')));
  p_app_id := lower(btrim(coalesce(p_app_id,'')));
  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_POOL_OBSERVATION_NETWORK';
  end if;
  if p_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'INVALID_POOL_OBSERVATION_APP_ID';
  end if;
  select jsonb_build_object(
    'generated_at', o.generated_at,
    'basis_allocation_round_id', o.basis_allocation_round_id,
    'projected_funding_round_id', o.projected_funding_round_id,
    'observed_pool_balance_wei', o.observed_pool_balance_wei::text
  ) into v_result
  from public.reward_pool_observations o
  where o.network = p_network and o.app_id = p_app_id
  order by o.generated_at desc, o.id desc
  limit 1;
  return v_result;
end;
$function$;

revoke all on function public.read_latest_reward_pool_observation(text,text)
  from public, anon, authenticated;
grant execute on function public.read_latest_reward_pool_observation(text,text)
  to service_role;
