-- Keep mission attribution analytics separate from reward-authoritative evidence.
-- invite_impact_events remains the immutable source for credited DAPP_REWARD events.

create table public.veinvite_mission_rule_versions (
  version_key text primary key,
  effective_from timestamptz not null,
  effective_until timestamptz,
  description text not null,
  created_at timestamptz not null default now(),
  constraint veinvite_mission_rule_versions_key_check
    check (version_key ~ '^[a-z0-9_]{1,80}$'),
  constraint veinvite_mission_rule_versions_description_check
    check (length(btrim(description)) between 1 and 500),
  constraint veinvite_mission_rule_versions_window_check
    check (effective_until is null or effective_until > effective_from)
);

create unique index veinvite_mission_rule_versions_one_open_idx
  on public.veinvite_mission_rule_versions ((1))
  where effective_until is null;

alter table public.veinvite_mission_rule_versions enable row level security;
revoke all on table public.veinvite_mission_rule_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.veinvite_mission_rule_versions to service_role;

-- Existing invitations deliberately remain legacy_unversioned. The current rule
-- becomes explicit only for invitations activated after this migration, so no
-- historical semantics are invented retroactively.
insert into public.veinvite_mission_rule_versions (
  version_key,
  effective_from,
  description
) values (
  'onboarding_3dapp_b3tr_vot3_vote_v1',
  transaction_timestamp(),
  'First positive B3TR reward from each of three distinct VeBetterDAO dApps, followed by VOT3 conversion and Allocation Voting.'
);

create table public.vebetter_dapp_registry (
  app_id text primary key,
  display_name text,
  category text,
  metadata_source text not null default 'UNRESOLVED',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vebetter_dapp_registry_app_id_check
    check (app_id ~ '^0x[0-9a-f]{64}$'),
  constraint vebetter_dapp_registry_display_name_check
    check (
      display_name is null
      or length(btrim(display_name)) between 1 and 120
    ),
  constraint vebetter_dapp_registry_category_check
    check (
      category is null
      or length(btrim(category)) between 1 and 80
    ),
  constraint vebetter_dapp_registry_source_check
    check (
      metadata_source in (
        'UNRESOLVED',
        'VEBETTER_OFFICIAL',
        'DAPP_OFFICIAL',
        'OPERATOR_VERIFIED'
      )
    ),
  constraint vebetter_dapp_registry_verified_metadata_check
    check (
      (
        metadata_source = 'UNRESOLVED'
        and display_name is null
        and verified_at is null
      )
      or (
        metadata_source <> 'UNRESOLVED'
        and display_name is not null
        and verified_at is not null
      )
    )
);

alter table public.vebetter_dapp_registry enable row level security;
revoke all on table public.vebetter_dapp_registry from public, anon, authenticated;
grant select, insert, update, delete on table public.vebetter_dapp_registry to service_role;

-- Seed only durable app identities already evidenced on-chain. Human-readable
-- names stay unresolved until a trusted metadata source is verified.
insert into public.vebetter_dapp_registry (app_id)
select distinct lower(e.app_id)
from public.invite_impact_events e
where e.event_type = 'DAPP_REWARD'
  and e.app_id is not null
on conflict (app_id) do nothing;

create or replace view public.operator_mission_dapp_activities
with (security_invoker = true)
as
with ranked_rewards as (
  select
    e.id as impact_event_id,
    e.invite_code,
    e.network,
    lower(e.wallet_address) as wallet_address,
    lower(e.app_id) as app_id,
    e.amount_wei,
    e.tx_id,
    e.block_number,
    e.block_timestamp,
    e.tx_index,
    e.clause_index,
    e.detected_at,
    row_number() over (
      partition by e.invite_code
      order by
        e.block_number,
        coalesce(e.tx_index, 2147483647),
        coalesce(e.clause_index, 2147483647),
        e.id
    )::integer as mission_step
  from public.invite_impact_events e
  join public.invitations i
    on i.invite_code = e.invite_code
   and i.activation_network = e.network
   and i.invitee_wallet is not null
   and lower(i.invitee_wallet) = lower(e.wallet_address)
   and i.activation_block is not null
   and e.block_number >= i.activation_block
  where e.event_type = 'DAPP_REWARD'
    and e.app_id is not null
    and not public.is_analytics_excluded_wallet(e.wallet_address)
    and not public.is_analytics_excluded_invite_code(e.invite_code)
)
select
  r.impact_event_id,
  r.invite_code,
  r.network,
  r.wallet_address,
  case
    when ec.outcome = 'ELIGIBLE'
      and ec.entry_class in ('NEW', 'RETURNING')
      then ec.entry_class
    else null
  end as entry_class,
  coalesce(rule.version_key, 'legacy_unversioned') as mission_rule_version,
  r.mission_step,
  r.app_id,
  registry.display_name as dapp_name,
  registry.category as dapp_category,
  coalesce(registry.metadata_source, 'UNRESOLVED') as metadata_source,
  'B3TR_REWARD_DISTRIBUTED'::text as activity_evidence_type,
  r.amount_wei,
  r.tx_id,
  r.block_number,
  r.block_timestamp,
  r.tx_index,
  r.clause_index,
  (r.tx_index is not null and r.clause_index is not null) as chain_position_complete,
  r.detected_at
from ranked_rewards r
join public.invitations i
  on i.invite_code = r.invite_code
left join public.eligibility_check_events ec
  on ec.id = i.eligibility_check_id
 and ec.invite_code = i.invite_code
 and ec.wallet_address = lower(i.invitee_wallet)
 and ec.network = r.network
left join lateral (
  select versions.version_key
  from public.veinvite_mission_rule_versions versions
  where coalesce(i.activated_at, i.created_at) >= versions.effective_from
    and (
      versions.effective_until is null
      or coalesce(i.activated_at, i.created_at) < versions.effective_until
    )
  order by versions.effective_from desc
  limit 1
) rule on true
left join public.vebetter_dapp_registry registry
  on registry.app_id = r.app_id
where r.mission_step between 1 and 3;

revoke all on table public.operator_mission_dapp_activities from public, anon, authenticated;
grant select on table public.operator_mission_dapp_activities to service_role;

create or replace function public.get_operator_mission_dapp_usage(
  p_network text,
  p_limit integer default 100
)
returns table (
  app_id text,
  dapp_name text,
  dapp_category text,
  metadata_source text,
  participant_count bigint,
  credited_event_count bigint,
  first_step_count bigint,
  second_step_count bigint,
  third_step_count bigint,
  new_participant_count bigint,
  returning_participant_count bigint,
  total_reward_wei numeric,
  first_reward_at timestamptz,
  last_reward_at timestamptz
)
language sql
stable
set search_path to 'pg_catalog', 'public'
as $function$
  select
    a.app_id,
    max(a.dapp_name) as dapp_name,
    max(a.dapp_category) as dapp_category,
    max(a.metadata_source) as metadata_source,
    count(distinct a.wallet_address)::bigint as participant_count,
    count(*)::bigint as credited_event_count,
    count(*) filter (where a.mission_step = 1)::bigint as first_step_count,
    count(*) filter (where a.mission_step = 2)::bigint as second_step_count,
    count(*) filter (where a.mission_step = 3)::bigint as third_step_count,
    count(distinct a.wallet_address) filter (where a.entry_class = 'NEW')::bigint
      as new_participant_count,
    count(distinct a.wallet_address) filter (where a.entry_class = 'RETURNING')::bigint
      as returning_participant_count,
    sum(a.amount_wei::numeric) as total_reward_wei,
    min(a.block_timestamp) as first_reward_at,
    max(a.block_timestamp) as last_reward_at
  from public.operator_mission_dapp_activities a
  where a.network = lower(btrim(p_network))
    and lower(btrim(p_network)) in ('mainnet', 'testnet', 'testnet-staging')
  group by a.app_id
  order by
    count(distinct a.wallet_address) desc,
    count(*) desc,
    a.app_id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

revoke all on function public.get_operator_mission_dapp_usage(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_operator_mission_dapp_usage(text, integer)
  to service_role;
