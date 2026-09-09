alter table public.network_runtime_config
  add column if not exists my_mode text not null default 'off',
  add column if not exists public_mode text not null default 'off';

update public.network_runtime_config
set
  my_mode = case when enabled then 'on' else 'off' end,
  public_mode = coalesce(nullif(public_mode, ''), 'off'),
  updated_at = now()
where id = 1;

alter table public.network_runtime_config
  drop constraint if exists network_runtime_config_my_mode_check;
alter table public.network_runtime_config
  add constraint network_runtime_config_my_mode_check
  check (my_mode in ('off', 'canary', 'on'));

alter table public.network_runtime_config
  drop constraint if exists network_runtime_config_public_mode_check;
alter table public.network_runtime_config
  add constraint network_runtime_config_public_mode_check
  check (public_mode in ('off', 'canary', 'on'));

alter table public.network_runtime_config
  drop constraint if exists network_runtime_config_enabled_mirror_check;
alter table public.network_runtime_config
  add constraint network_runtime_config_enabled_mirror_check
  check (enabled = (my_mode <> 'off'));

create table if not exists public.network_runtime_canary_wallets (
  wallet_address text primary key,
  note text,
  created_at timestamptz not null default now(),
  constraint network_runtime_canary_wallet_format_check
    check (wallet_address = lower(wallet_address) and wallet_address ~ '^0x[0-9a-f]{40}$')
);

insert into public.network_runtime_canary_wallets (wallet_address, note)
select lower(wallet_address), 'Seeded from active operator analytics exclusions'
from public.analytics_excluded_wallets
where active is true
  and lower(wallet_address) ~ '^0x[0-9a-f]{40}$'
on conflict (wallet_address) do nothing;

alter table public.network_runtime_canary_wallets enable row level security;
revoke all on table public.network_runtime_canary_wallets from public, anon, authenticated;
grant select, insert, update, delete on table public.network_runtime_canary_wallets to service_role;
drop policy if exists network_runtime_canary_service_role on public.network_runtime_canary_wallets;
create policy network_runtime_canary_service_role
  on public.network_runtime_canary_wallets
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.network_public_profiles (
  wallet_address text primary key,
  public_enabled boolean not null default false,
  discoverable boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint network_public_profiles_wallet_format_check
    check (wallet_address = lower(wallet_address) and wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint network_public_profiles_discoverable_requires_public_check
    check (not discoverable or public_enabled)
);

alter table public.network_public_profiles enable row level security;
revoke all on table public.network_public_profiles from public, anon, authenticated;
grant select, insert, update on table public.network_public_profiles to service_role;
drop policy if exists network_public_profiles_service_role on public.network_public_profiles;
create policy network_public_profiles_service_role
  on public.network_public_profiles
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists network_public_profiles_discoverable_idx
  on public.network_public_profiles (updated_at desc, wallet_address)
  where public_enabled is true and discoverable is true;

comment on table public.network_public_profiles is
  'Explicit wallet-level consent for VeInvite Public Network. public_enabled controls link/address access; discoverable additionally permits Explore discovery. Defaults are private.';

comment on table public.network_runtime_canary_wallets is
  'Service-role-only allowlist for staged My Network and Public Network canary rollouts.';

create or replace function public.read_public_referral_network_focus_v1(
  p_root_wallet text,
  p_focus_wallet text default null,
  p_round_id bigint default null,
  p_round_start_at timestamptz default null,
  p_round_end_at timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
with recursive
params as (
  select
    lower(btrim(coalesce(p_root_wallet, ''))) as root_wallet,
    lower(btrim(coalesce(nullif(p_focus_wallet, ''), p_root_wallet, ''))) as focus_wallet
),
runtime as (
  select
    case
      when c.public_mode = 'on' then true
      when c.public_mode = 'canary' then exists (
        select 1
        from public.network_runtime_canary_wallets cw
        join params p on cw.wallet_address = p.root_wallet
      )
      else false
    end as allowed
  from public.network_runtime_config c
  where c.id = 1
),
root_consent as (
  select exists (
    select 1
    from public.network_public_profiles np
    join params p on np.wallet_address = p.root_wallet
    where np.public_enabled is true
  ) as allowed
),
visible_tree as (
  select
    p.root_wallet as wallet,
    null::text as parent_wallet,
    0::integer as depth,
    null::uuid as relationship_id,
    null::timestamptz as joined_at,
    array[p.root_wallet]::text[] as path
  from params p
  where p.root_wallet ~ '^0x[0-9a-f]{40}$'
    and (select allowed from root_consent)

  union all

  select
    lower(e.child_wallet),
    lower(e.sponsor_wallet),
    vt.depth + 1,
    e.relationship_id,
    e.relationship_effective_at,
    vt.path || lower(e.child_wallet)
  from visible_tree vt
  join public.qualified_referral_network_edges e
    on lower(e.sponsor_wallet) = vt.wallet
  join public.network_public_profiles np
    on np.wallet_address = lower(e.child_wallet)
   and np.public_enabled is true
  where vt.depth < 100
    and not lower(e.child_wallet) = any(vt.path)
),
focus_meta as (
  select vt.*
  from visible_tree vt
  join params p on vt.wallet = p.focus_wallet
  order by vt.depth
  limit 1
),
focus_tree as (
  select
    f.wallet,
    f.parent_wallet,
    0::integer as depth,
    f.relationship_id,
    f.joined_at,
    array[f.wallet]::text[] as path
  from focus_meta f

  union all

  select
    lower(e.child_wallet),
    lower(e.sponsor_wallet),
    ft.depth + 1,
    e.relationship_id,
    e.relationship_effective_at,
    ft.path || lower(e.child_wallet)
  from focus_tree ft
  join public.qualified_referral_network_edges e
    on lower(e.sponsor_wallet) = ft.wallet
  join public.network_public_profiles np
    on np.wallet_address = lower(e.child_wallet)
   and np.public_enabled is true
  where ft.depth < 100
    and not lower(e.child_wallet) = any(ft.path)
),
direct_roots as (
  select ft.*
  from focus_tree ft
  where ft.depth = 1
),
branch_metrics as (
  select
    dr.wallet,
    dr.joined_at,
    count(ft.wallet) filter (where ft.depth > 1)::integer as network_count,
    count(ft.wallet) filter (where ft.depth = 2 and ft.parent_wallet = dr.wallet)::integer as direct_count,
    case
      when p_round_id is null or p_round_start_at is null then null::integer
      else (
        count(ft.wallet) filter (
          where ft.depth > 1
            and ft.joined_at >= p_round_start_at
            and ft.joined_at < coalesce(least(p_round_end_at, now()), now())
        )
        + case
            when dr.joined_at is not null
              and dr.joined_at >= p_round_start_at
              and dr.joined_at < coalesce(least(p_round_end_at, now()), now())
              then 1
            else 0
          end
      )::integer
    end as round_growth,
    greatest(coalesce(max(ft.depth) filter (where ft.depth > 1), 1) - 1, 0)::integer as network_depth,
    exists (
      select 1
      from public.qualified_referral_network_edges hidden
      left join public.network_public_profiles hidden_profile
        on hidden_profile.wallet_address = lower(hidden.child_wallet)
      where lower(hidden.sponsor_wallet) = dr.wallet
        and coalesce(hidden_profile.public_enabled, false) is false
    ) as has_private_branches
  from direct_roots dr
  left join focus_tree ft
    on ft.depth > 1 and ft.path[2] = dr.wallet
  group by dr.wallet, dr.joined_at
),
focus_summary as (
  select
    count(ft.wallet) filter (where ft.depth > 0)::integer as total_network,
    count(ft.wallet) filter (where ft.depth = 1)::integer as direct_count,
    case
      when p_round_id is null or p_round_start_at is null then null::integer
      else count(ft.wallet) filter (
        where ft.depth > 0
          and ft.joined_at is not null
          and ft.joined_at >= p_round_start_at
          and ft.joined_at < coalesce(least(p_round_end_at, now()), now())
      )::integer
    end as round_growth,
    coalesce(max(ft.depth), 0)::integer as network_depth
  from focus_tree ft
),
focus_private as (
  select exists (
    select 1
    from focus_meta f
    join public.qualified_referral_network_edges hidden
      on lower(hidden.sponsor_wallet) = f.wallet
    left join public.network_public_profiles hidden_profile
      on hidden_profile.wallet_address = lower(hidden.child_wallet)
    where coalesce(hidden_profile.public_enabled, false) is false
  ) as has_private_branches
),
depth_cap as (
  select exists (
    select 1
    from focus_tree ft
    join public.qualified_referral_network_edges e
      on lower(e.sponsor_wallet) = ft.wallet
    join public.network_public_profiles np
      on np.wallet_address = lower(e.child_wallet)
     and np.public_enabled is true
    where ft.depth = 100
      and not lower(e.child_wallet) = any(ft.path)
  ) as reached
)
select case
  when not coalesce((select allowed from runtime), false)
    then jsonb_build_object('error', 'PUBLIC_NETWORK_DISABLED')
  when not exists (
    select 1 from params p
    where p.root_wallet ~ '^0x[0-9a-f]{40}$'
      and p.focus_wallet ~ '^0x[0-9a-f]{40}$'
  ) then jsonb_build_object('error', 'INVALID_WALLET')
  when not (select allowed from root_consent)
    then jsonb_build_object('error', 'NETWORK_PRIVATE')
  when not exists (select 1 from focus_meta)
    then jsonb_build_object('error', 'FOCUS_NOT_PUBLIC')
  else jsonb_build_object(
    'rootWallet', (select root_wallet from params),
    'focusWallet', (select focus_wallet from params),
    'focusDepth', (select depth from focus_meta),
    'breadcrumb', coalesce(
      (
        select jsonb_agg(value order by ordinality)
        from focus_meta f,
        unnest(f.path) with ordinality as p(value, ordinality)
      ),
      '[]'::jsonb
    ),
    'summary', (
      select jsonb_build_object(
        'network', fs.total_network,
        'direct', fs.direct_count,
        'thisRound', fs.round_growth,
        'depth', fs.network_depth
      )
      from focus_summary fs
    ),
    'hasPrivateBranches', (select has_private_branches from focus_private),
    'round', case
      when p_round_id is null or p_round_start_at is null then 'null'::jsonb
      else jsonb_build_object(
        'id', p_round_id,
        'startAt', p_round_start_at,
        'endAt', p_round_end_at
      )
    end,
    'children', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'wallet', bm.wallet,
            'network', bm.network_count,
            'direct', bm.direct_count,
            'thisRound', bm.round_growth,
            'depth', bm.network_depth,
            'hasPrivateBranches', bm.has_private_branches
          )
          order by bm.wallet asc
        )
        from branch_metrics bm
      ),
      '[]'::jsonb
    ),
    'depthLimitReached', (select reached from depth_cap)
  )
end;
$$;

revoke all on function public.read_public_referral_network_focus_v1(
  text, text, bigint, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.read_public_referral_network_focus_v1(
  text, text, bigint, timestamptz, timestamptz
) to service_role;

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
roots as (
  select np.wallet_address, np.updated_at
  from public.network_public_profiles np
  where np.public_enabled is true
    and np.discoverable is true
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
  order by np.updated_at desc, np.wallet_address asc
  limit greatest(1, least(coalesce(p_limit, 12), 24))
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'wallet', roots.wallet_address,
      'updatedAt', roots.updated_at
    )
    order by roots.updated_at desc, roots.wallet_address asc
  ),
  '[]'::jsonb
)
from roots;
$$;

revoke all on function public.read_public_network_discovery_v1(integer)
  from public, anon, authenticated;
grant execute on function public.read_public_network_discovery_v1(integer)
  to service_role;

comment on function public.read_public_referral_network_focus_v1(
  text, text, bigint, timestamptz, timestamptz
) is
  'Privacy-filtered Public Network reader. Only explicitly public wallets traverse the graph; private wallets, mission status, invite details, anti-Sybil evidence, and reward state are never returned.';

comment on function public.read_public_network_discovery_v1(integer) is
  'Returns only explicitly public + discoverable Network roots allowed by the Public Network rollout mode.';

update public.network_runtime_config
set
  enabled = false,
  my_mode = 'off',
  public_mode = 'off',
  note = 'Network Explore v1 staged OFF for post-deploy validation',
  updated_at = now()
where id = 1;
