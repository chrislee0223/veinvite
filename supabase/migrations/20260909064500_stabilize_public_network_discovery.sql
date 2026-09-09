create or replace function public.read_public_network_discovery_v1(
  p_limit integer default 12
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
with runtime as (
  select c.public_mode
  from public.network_runtime_config c
  where c.id = 1
),
eligible_roots as (
  select
    np.wallet_address,
    np.updated_at,
    md5(
      np.wallet_address || ':' ||
      to_char(now() at time zone 'UTC', 'IYYY-IW')
    ) as rotation_key
  from public.network_public_profiles np
  where np.public_enabled is true
    and np.discoverable is true
    and exists (
      select 1
      from public.qualified_referral_network_edges e
      join public.network_public_profiles child_profile
        on child_profile.wallet_address = lower(e.child_wallet)
       and child_profile.public_enabled is true
      where lower(e.sponsor_wallet) = np.wallet_address
    )
    and (
      (select public_mode from runtime) = 'on'
      or (
        (select public_mode from runtime) = 'canary'
        and exists (
          select 1
          from public.network_runtime_canary_wallets cw
          where cw.wallet_address = np.wallet_address
        )
      )
    )
),
roots as (
  select wallet_address, updated_at, rotation_key
  from eligible_roots
  order by rotation_key asc, wallet_address asc
  limit greatest(1, least(coalesce(p_limit, 12), 24))
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'wallet', roots.wallet_address,
      'updatedAt', roots.updated_at
    )
    order by roots.rotation_key asc, roots.wallet_address asc
  ),
  '[]'::jsonb
)
from roots;
$$;

revoke all on function public.read_public_network_discovery_v1(integer)
  from public, anon, authenticated;
grant execute on function public.read_public_network_discovery_v1(integer)
  to service_role;

comment on function public.read_public_network_discovery_v1(integer) is
  'Returns explicitly public + discoverable roots that have at least one visible direct member. Ordering rotates deterministically by ISO week instead of preference update time, preventing toggle-based discovery bumping.';
