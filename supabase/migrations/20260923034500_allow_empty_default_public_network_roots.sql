-- Keep public Network root semantics aligned with My Network:
-- every valid wallet can render as an empty root, while actual connections
-- still come exclusively from verified qualified_referral_network_edges.
-- This avoids exposing pending invitation, mission, reward, or security state.

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
    count(ft.wallet) filter (
      where ft.depth = 2 and ft.parent_wallet = dr.wallet
    )::integer as direct_count,
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
    greatest(
      coalesce(max(ft.depth) filter (where ft.depth > 1), 1) - 1,
      0
    )::integer as network_depth
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
depth_cap as (
  select exists (
    select 1
    from focus_tree ft
    join public.qualified_referral_network_edges e
      on lower(e.sponsor_wallet) = ft.wallet
    where ft.depth = 100
      and not lower(e.child_wallet) = any(ft.path)
  ) as reached
)
select case
  when not coalesce((select allowed from runtime), false)
    then jsonb_build_object('error', 'PUBLIC_NETWORK_DISABLED')
  when not exists (
    select 1
    from params p
    where p.root_wallet ~ '^0x[0-9a-f]{40}$'
      and p.focus_wallet ~ '^0x[0-9a-f]{40}$'
  )
    then jsonb_build_object('error', 'INVALID_WALLET')
  when not exists (select 1 from focus_meta)
    then jsonb_build_object('error', 'FOCUS_NOT_FOUND')
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
            'depth', bm.network_depth
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

comment on function public.read_public_referral_network_focus_v1(
  text, text, bigint, timestamptz, timestamptz
) is
  'Default-public read-only VeInvite referral graph reader. Returns graph structure only; mission, reward, anti-Sybil, security, invitation-detail, and signing data are excluded.';
