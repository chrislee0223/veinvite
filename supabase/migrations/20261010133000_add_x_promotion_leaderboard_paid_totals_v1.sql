create or replace function public.get_paid_reward_x_promotion_totals_v1(
  p_network text,
  p_wallets text[]
)
returns table(
  wallet_address text,
  total_promotion_reward_wei numeric
)
language plpgsql
stable
set search_path to 'pg_catalog','public'
as $function$
declare
  v_network text := lower(btrim(coalesce(p_network,'')));
  v_wallet_count integer := coalesce(cardinality(p_wallets),0);
begin
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'INVALID_REWARD_X_PROMOTION_TOTALS_NETWORK';
  end if;

  if v_wallet_count=0 then
    return;
  end if;

  if v_wallet_count>250 then
    raise exception 'REWARD_X_PROMOTION_TOTALS_WALLET_LIMIT_EXCEEDED';
  end if;

  if exists (
    select 1
    from unnest(p_wallets) as requested(wallet)
    where lower(btrim(coalesce(requested.wallet,'')))
      !~ '^0x[0-9a-f]{40}$'
  ) then
    raise exception 'INVALID_REWARD_X_PROMOTION_TOTALS_WALLET';
  end if;

  return query
  with requested_wallets as (
    select distinct lower(btrim(requested.wallet)) as wallet_address
    from unnest(p_wallets) as requested(wallet)
  )
  select
    lower(btrim(r.recipient_wallet)) as wallet_address,
    coalesce(sum(r.amount_wei),0)::numeric as total_promotion_reward_wei
  from public.reward_x_promotion_receipts r
  join requested_wallets w
    on w.wallet_address=lower(btrim(r.recipient_wallet))
  where r.network=v_network
    and r.amount_wei>0
    and not public.is_analytics_excluded_wallet(r.recipient_wallet)
    and not public.is_analytics_excluded_invite_code(r.invite_code)
    and not public.is_sybil_v2_referral_invalidated(
      r.invite_code,
      v_network
    )
  group by lower(btrim(r.recipient_wallet));
end;
$function$;

revoke all on function public.get_paid_reward_x_promotion_totals_v1(text,text[])
  from public,anon,authenticated;
grant execute on function public.get_paid_reward_x_promotion_totals_v1(text,text[])
  to service_role;

comment on function public.get_paid_reward_x_promotion_totals_v1(text,text[])
is 'Returns finalized paid X Promotion amounts for requested leaderboard wallets only. Does not change referral counts or ranking order.';
