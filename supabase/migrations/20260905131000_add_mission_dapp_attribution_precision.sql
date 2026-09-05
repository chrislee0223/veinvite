-- Do not overstate the exact first/second/third order when two credited dApp
-- rewards share the same persisted chain position. This is reporting metadata
-- only; reward-authoritative evidence and mission eligibility remain unchanged.

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
    count(*) over (
      partition by
        e.invite_code,
        e.block_number,
        e.tx_index,
        e.clause_index
    )::integer as same_chain_position_count,
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
  r.detected_at,
  case
    when r.tx_index is null or r.clause_index is null
      then 'PARTIAL_CHAIN_POSITION'
    when r.same_chain_position_count > 1
      then 'SAME_CLAUSE_TIE'
    else 'EXACT_CHAIN_POSITION'
  end::text as step_order_precision
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

revoke all on table public.operator_mission_dapp_activities
  from public, anon, authenticated;
grant select on table public.operator_mission_dapp_activities to service_role;
