create or replace function public.read_referral_network_focus(
  p_root_wallet text,
  p_focus_wallet text default null,
  p_search text default null
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
    lower(btrim(coalesce(nullif(p_focus_wallet, ''), p_root_wallet, ''))) as focus_wallet,
    lower(btrim(coalesce(p_search, ''))) as search_term
),
root_tree as (
  select
    p.root_wallet as wallet,
    null::text as parent_wallet,
    0::integer as depth,
    null::uuid as relationship_id,
    null::uuid as source_invitation_id,
    null::timestamptz as joined_at,
    array[p.root_wallet]::text[] as path
  from params p
  where p.root_wallet ~ '^0x[0-9a-f]{40}$'

  union all

  select
    lower(e.child_wallet),
    lower(e.sponsor_wallet),
    rt.depth + 1,
    e.relationship_id,
    e.source_invitation_id,
    e.relationship_effective_at,
    rt.path || lower(e.child_wallet)
  from root_tree rt
  join public.qualified_referral_network_edges e
    on lower(e.sponsor_wallet) = rt.wallet
  where rt.depth < 100
    and not lower(e.child_wallet) = any(rt.path)
),
focus_meta as (
  select rt.*
  from root_tree rt
  join params p on rt.wallet = p.focus_wallet
  order by rt.depth
  limit 1
),
focus_tree as (
  select
    f.wallet,
    f.parent_wallet,
    0::integer as depth,
    f.relationship_id,
    f.source_invitation_id,
    f.joined_at,
    array[f.wallet]::text[] as path
  from focus_meta f

  union all

  select
    lower(e.child_wallet),
    lower(e.sponsor_wallet),
    ft.depth + 1,
    e.relationship_id,
    e.source_invitation_id,
    e.relationship_effective_at,
    ft.path || lower(e.child_wallet)
  from focus_tree ft
  join public.qualified_referral_network_edges e
    on lower(e.sponsor_wallet) = ft.wallet
  where ft.depth < 100
    and not lower(e.child_wallet) = any(ft.path)
),
round_window as (
  select
    r.round_id,
    r.round_start_at,
    r.round_end_at
  from public.operator_latest_round_growth_report_snapshots r
  where r.network = 'mainnet'
  order by r.round_id desc, r.created_at desc
  limit 1
),
focus_nodes as (
  select
    ft.*,
    i.status as invitation_status,
    i.reward_status,
    i.apps_completed,
    i.vot3_converted,
    i.vote_completed,
    i.sybil_status,
    i.reward_paid_at,
    case
      when i.reward_status = 'PAID' then 'REWARDED'
      when i.status = 'COMPLETED'
        and i.ineligibility_check_id is null
        and coalesce(i.apps_completed, 0) >= 3
        and i.vot3_converted is true
        and i.vote_completed is true
        and i.sybil_status = 'CLEAR'
        then 'QUALIFIED'
      else 'IN_PROGRESS'
    end as member_status
  from focus_tree ft
  left join public.invitations i
    on i.id = ft.source_invitation_id
),
direct_roots as (
  select fn.*
  from focus_nodes fn
  where fn.depth = 1
),
branch_metrics as (
  select
    dr.wallet,
    dr.parent_wallet,
    dr.joined_at,
    dr.source_invitation_id,
    dr.member_status,
    count(fn.wallet) filter (where fn.depth > 1)::integer as network_count,
    count(fn.wallet) filter (
      where fn.depth > 1 and fn.member_status in ('QUALIFIED', 'REWARDED')
    )::integer as qualified_count,
    count(fn.wallet) filter (
      where fn.depth > 1
        and rw.round_start_at is not null
        and fn.joined_at >= rw.round_start_at
        and fn.joined_at < coalesce(rw.round_end_at, now())
    )::integer as round_growth,
    count(fn.wallet) filter (
      where fn.depth = 2 and fn.parent_wallet = dr.wallet
    )::integer as direct_count,
    greatest(coalesce(max(fn.depth) filter (where fn.depth > 1), 1) - 1, 0)::integer as network_depth
  from direct_roots dr
  left join focus_nodes fn
    on fn.depth > 1 and fn.path[2] = dr.wallet
  left join round_window rw on true
  group by
    dr.wallet,
    dr.parent_wallet,
    dr.joined_at,
    dr.source_invitation_id,
    dr.member_status
),
focus_summary as (
  select
    count(fn.wallet) filter (where fn.depth > 0)::integer as total_network,
    count(fn.wallet) filter (where fn.depth = 1)::integer as direct_count,
    count(fn.wallet) filter (
      where fn.depth > 0 and fn.member_status in ('QUALIFIED', 'REWARDED')
    )::integer as qualified_count,
    count(fn.wallet) filter (
      where fn.depth > 0
        and rw.round_start_at is not null
        and fn.joined_at >= rw.round_start_at
        and fn.joined_at < coalesce(rw.round_end_at, now())
    )::integer as round_growth,
    coalesce(max(fn.depth), 0)::integer as network_depth
  from focus_nodes fn
  left join round_window rw on true
),
focus_parent as (
  select
    lower(e.sponsor_wallet) as wallet,
    e.relationship_effective_at as joined_at
  from params p
  join public.qualified_referral_network_edges e
    on lower(e.child_wallet) = p.focus_wallet
  limit 1
),
search_matches as (
  select rt.wallet, rt.parent_wallet, rt.depth
  from root_tree rt
  join params p on true
  where rt.depth > 0
    and length(p.search_term) >= 3
    and position(p.search_term in rt.wallet) > 0
  order by rt.depth asc, rt.wallet asc
  limit 8
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
select
  case
    when not exists (
      select 1 from params p
      where p.root_wallet ~ '^0x[0-9a-f]{40}$'
        and p.focus_wallet ~ '^0x[0-9a-f]{40}$'
    ) then jsonb_build_object('error', 'INVALID_WALLET')
    when not exists (select 1 from focus_meta)
      then jsonb_build_object('error', 'FOCUS_NOT_IN_NETWORK')
    else jsonb_build_object(
      'rootWallet', (select root_wallet from params),
      'focusWallet', (select focus_wallet from params),
      'focusDepth', (select depth from focus_meta),
      'invitedBy', (select wallet from focus_parent),
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
          'qualified', fs.qualified_count,
          'thisRound', fs.round_growth,
          'depth', fs.network_depth
        )
        from focus_summary fs
      ),
      'round', coalesce(
        (
          select jsonb_build_object(
            'id', rw.round_id,
            'startAt', rw.round_start_at,
            'endAt', rw.round_end_at
          )
          from round_window rw
        ),
        'null'::jsonb
      ),
      'children', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'wallet', bm.wallet,
              'status', bm.member_status,
              'joinedAt', bm.joined_at,
              'network', bm.network_count,
              'direct', bm.direct_count,
              'qualified', bm.qualified_count,
              'thisRound', bm.round_growth,
              'depth', bm.network_depth
            )
            order by bm.joined_at asc nulls last, bm.wallet asc
          )
          from branch_metrics bm
        ),
        '[]'::jsonb
      ),
      'searchResults', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'wallet', sm.wallet,
              'parentWallet', sm.parent_wallet,
              'depth', sm.depth
            )
            order by sm.depth asc, sm.wallet asc
          )
          from search_matches sm
        ),
        '[]'::jsonb
      ),
      'depthLimitReached', (select reached from depth_cap)
    )
  end;
$$;

revoke all on function public.read_referral_network_focus(text, text, text)
  from public, anon, authenticated;
grant execute on function public.read_referral_network_focus(text, text, text)
  to service_role;

comment on function public.read_referral_network_focus(text, text, text) is
  'Service-role network read model for the VeInvite sponsor graph. Returns one focused multi-branch subtree, aggregate metrics, direct-member cards, breadcrumb, and scoped wallet search without using binary placement edges.';
