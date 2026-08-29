-- Public-facing lifetime leaderboard, calculated only from immutable,
-- on-chain-verified VeInvite reward receipts. The function remains private to
-- service_role; the application API exposes only the safe subset used by the
-- public leaderboard.

begin;

create or replace function public.get_public_lifetime_leaderboard(
  p_network text,
  p_wallet text default null,
  p_limit integer default 5
)
returns table (
  rank_position bigint,
  wallet_address text,
  completed_referrals bigint,
  total_reward_wei text,
  is_current_wallet boolean
)
language sql
stable
security invoker
set search_path = public
as $function$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      lower(nullif(btrim(coalesce(p_wallet, '')), '')) as current_wallet,
      greatest(1, least(coalesce(p_limit, 5), 100)) as entry_limit
  ),
  reward_totals as (
    select
      lower(btrim(r.recipient_wallet)) as wallet_address,
      count(distinct r.invite_code)::bigint as completed_referrals,
      sum(r.amount_wei)::numeric as total_reward_wei
    from public.reward_receipts r
    cross join parameters p
    where lower(btrim(r.network)) = p.network
    group by lower(btrim(r.recipient_wallet))
  ),
  ranked as (
    select
      row_number() over (
        order by
          t.completed_referrals desc,
          t.total_reward_wei desc,
          t.wallet_address
      )::bigint as rank_position,
      t.wallet_address,
      t.completed_referrals,
      t.total_reward_wei
    from reward_totals t
  )
  select
    r.rank_position,
    r.wallet_address,
    r.completed_referrals,
    r.total_reward_wei::text,
    r.wallet_address = p.current_wallet as is_current_wallet
  from ranked r
  cross join parameters p
  where
    r.rank_position <= p.entry_limit
    or r.wallet_address = p.current_wallet
  order by r.rank_position;
$function$;

comment on function public.get_public_lifetime_leaderboard(
  text,
  text,
  integer
) is 'Lifetime inviter ranking from immutable verified reward receipts. Ranked by paid referral count, then actual B3TR paid. Service-role only.';

revoke all on function public.get_public_lifetime_leaderboard(
  text,
  text,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_public_lifetime_leaderboard(
  text,
  text,
  integer
) to service_role;

commit;
