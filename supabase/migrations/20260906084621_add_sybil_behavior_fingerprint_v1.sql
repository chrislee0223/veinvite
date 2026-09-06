begin;

-- Behavioral fingerprints are derived from immutable invite_impact_events.
-- They are operator observation data only: no row in these views is reward,
-- Sybil-status, mission, referral, or payout authority.
create or replace view public.operator_sybil_behavior_fingerprints
with (security_invoker = true)
as
with ranked_rewards as (
  select
    e.id,
    e.invite_code,
    e.network,
    e.wallet_address,
    e.app_id,
    e.block_number,
    e.block_timestamp,
    e.tx_index,
    e.clause_index,
    e.tx_id,
    row_number() over (
      partition by e.invite_code
      order by
        e.block_number,
        coalesce(e.tx_index, 2147483647),
        coalesce(e.clause_index, 2147483647),
        e.tx_id,
        e.id
    ) as reward_order,
    lag(e.block_timestamp) over (
      partition by e.invite_code
      order by
        e.block_number,
        coalesce(e.tx_index, 2147483647),
        coalesce(e.clause_index, 2147483647),
        e.tx_id,
        e.id
    ) as previous_reward_at
  from public.invite_impact_events e
  where e.event_type = 'DAPP_REWARD'
    and e.app_id is not null
), first_three as (
  select *
  from ranked_rewards
  where reward_order <= 3
), aggregated as (
  select
    r.invite_code,
    min(r.network) as network,
    min(r.wallet_address) as invitee_wallet,
    count(*)::integer as reward_event_count,
    array_agg(r.app_id order by r.reward_order) as app_sequence,
    array_agg(
      extract(epoch from (r.block_timestamp - r.previous_reward_at))::bigint
      order by r.reward_order
    ) filter (where r.previous_reward_at is not null) as reward_intervals_seconds,
    min(r.block_timestamp) as first_reward_at,
    max(r.block_timestamp) as third_reward_at,
    extract(epoch from (max(r.block_timestamp) - min(r.block_timestamp)))::bigint
      as reward_span_seconds
  from first_three r
  group by r.invite_code
  having count(*) = 3
), sequence_frequency as (
  select
    a.app_sequence,
    count(*)::integer as same_sequence_invite_count
  from aggregated a
  group by a.app_sequence
)
select
  a.invite_code,
  i.inviter_wallet,
  a.invitee_wallet,
  a.network,
  i.referral_link_id,
  i.activated_at,
  i.activation_block,
  a.reward_event_count,
  a.app_sequence,
  md5(array_to_string(a.app_sequence, '>')) as sequence_key,
  a.reward_intervals_seconds,
  a.first_reward_at,
  a.third_reward_at,
  extract(epoch from (a.first_reward_at - i.activated_at))::bigint
    as activation_to_first_reward_seconds,
  a.reward_span_seconds,
  f.same_sequence_invite_count,
  s.first_inbound_vet_sender,
  s.first_inbound_vtho_sender,
  0::integer as sequence_only_score,
  'behavior-v1'::text as fingerprint_version
from aggregated a
join public.invitations i
  on i.invite_code = a.invite_code
join sequence_frequency f
  on f.app_sequence = a.app_sequence
left join public.sybil_onchain_snapshots s
  on s.invite_code = a.invite_code
 and s.analyzer_version = 'onchain-funding-v1'
where i.activated_at is not null;

comment on view public.operator_sybil_behavior_fingerprints is
  'Observation-only behavioral fingerprints derived from the first three qualifying dApp reward events. Exact dApp sequence alone always has score 0 and cannot change Sybil or reward state.';

revoke all on public.operator_sybil_behavior_fingerprints
  from public, anon, authenticated;
grant select on public.operator_sybil_behavior_fingerprints
  to service_role;

create or replace view public.operator_sybil_behavior_similarity_candidates
with (security_invoker = true)
as
with pairs as (
  select
    a.network,
    a.invite_code as invite_a,
    b.invite_code as invite_b,
    a.invitee_wallet as wallet_a,
    b.invitee_wallet as wallet_b,
    a.inviter_wallet as inviter_a,
    b.inviter_wallet as inviter_b,
    a.sequence_key,
    a.same_sequence_invite_count,
    a.app_sequence,
    a.reward_intervals_seconds as intervals_a,
    b.reward_intervals_seconds as intervals_b,
    abs(extract(epoch from (a.activated_at - b.activated_at)))::bigint
      as activation_delta_seconds,
    a.first_inbound_vet_sender as vet_funder_a,
    b.first_inbound_vet_sender as vet_funder_b,
    a.first_inbound_vtho_sender as vtho_funder_a,
    b.first_inbound_vtho_sender as vtho_funder_b
  from public.operator_sybil_behavior_fingerprints a
  join public.operator_sybil_behavior_fingerprints b
    on a.network = b.network
   and a.invite_code < b.invite_code
   and a.invitee_wallet <> b.invitee_wallet
   and a.app_sequence = b.app_sequence
   and abs(extract(epoch from (a.activated_at - b.activated_at))) <= 604800
), deltas as (
  select
    p.*,
    d.max_absolute_delta_seconds,
    d.max_relative_delta,
    (
      d.max_relative_delta <= 0.20
      and d.max_absolute_delta_seconds <= 300
    ) as similar_timing,
    (p.activation_delta_seconds <= 3600) as clustered_activation,
    (
      p.vet_funder_a is not null
      and p.vet_funder_a = p.vet_funder_b
    ) as shared_vet_funder,
    (
      p.vtho_funder_a is not null
      and p.vtho_funder_a = p.vtho_funder_b
    ) as shared_vtho_funder
  from pairs p
  cross join lateral (
    select
      max(abs(p.intervals_a[g.i] - p.intervals_b[g.i]))::bigint
        as max_absolute_delta_seconds,
      max(
        abs(p.intervals_a[g.i] - p.intervals_b[g.i])::numeric
        / greatest(p.intervals_a[g.i], p.intervals_b[g.i], 60)
      ) as max_relative_delta
    from generate_subscripts(p.intervals_a, 1) g(i)
  ) d
), scored as (
  select
    d.*,
    (d.shared_vet_funder or d.shared_vtho_funder) as shared_funder,
    (
      (case when d.similar_timing then 20 else 0 end)
      + (case when d.clustered_activation then 5 else 0 end)
      + (case when d.shared_vet_funder then 10 else 0 end)
      + (case when d.shared_vtho_funder then 3 else 0 end)
    )::integer as observation_score
  from deltas d
)
select
  s.network,
  s.invite_a,
  s.invite_b,
  s.wallet_a,
  s.wallet_b,
  s.inviter_a,
  s.inviter_b,
  s.sequence_key,
  s.same_sequence_invite_count,
  s.app_sequence,
  s.intervals_a,
  s.intervals_b,
  s.max_absolute_delta_seconds,
  s.max_relative_delta,
  s.activation_delta_seconds,
  s.similar_timing,
  s.clustered_activation,
  s.shared_vet_funder,
  s.shared_vtho_funder,
  s.shared_funder,
  0::integer as sequence_only_score,
  s.observation_score,
  case
    when s.similar_timing
     and s.clustered_activation
     and s.shared_funder
      then 'WATCH'
    else 'INFO'
  end::text as attention_level,
  'behavior-v1'::text as fingerprint_version
from scored s;

comment on view public.operator_sybil_behavior_similarity_candidates is
  'Observation-only pairwise similarity. A matching dApp sequence contributes zero points; WATCH requires similar timing, clustered activation, and a shared VET or VTHO funder. WATCH never mutates Sybil or reward state.';

revoke all on public.operator_sybil_behavior_similarity_candidates
  from public, anon, authenticated;
grant select on public.operator_sybil_behavior_similarity_candidates
  to service_role;

commit;
