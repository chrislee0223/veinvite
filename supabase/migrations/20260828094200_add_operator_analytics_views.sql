begin;

-- These views are deliberately read-only and service-role-only. They provide
-- stable metric definitions for operator reports without exposing participant
-- data through the public Data API.

create index if not exists invitations_inviter_created_idx
  on public.invitations (inviter_wallet, created_at desc);

create index if not exists invite_impact_events_dapp_reward_wallet_idx
  on public.invite_impact_events (
    network,
    wallet_address,
    block_timestamp desc,
    id desc
  )
  include (invite_code, app_id, amount_wei)
  where event_type = 'DAPP_REWARD';

create index if not exists reward_receipts_invite_code_idx
  on public.reward_receipts (invite_code);

create index if not exists reward_receipts_round_id_idx
  on public.reward_receipts (round_id);

create index if not exists reward_receipts_settlement_id_idx
  on public.reward_receipts (settlement_id);

create view public.operator_reward_recipient_leaderboard
with (security_invoker = true)
as
select
  r.network,
  lower(btrim(r.recipient_wallet)) as wallet_address,
  count(*)::bigint as reward_receipt_count,
  count(distinct r.invite_code)::bigint as paid_referral_count,
  count(distinct r.round_id)::bigint as paid_round_count,
  sum(r.amount_wei) as total_reward_wei,
  min(r.paid_at) as first_paid_at,
  max(r.paid_at) as last_paid_at
from public.reward_receipts r
group by
  r.network,
  lower(btrim(r.recipient_wallet));

comment on view public.operator_reward_recipient_leaderboard is
  'Actual VeInvite referral rewards, aggregated only from immutable reward receipts.';

create view public.operator_qualifying_dapp_reward_leaderboard
with (security_invoker = true)
as
select
  e.network,
  lower(btrim(e.wallet_address)) as wallet_address,
  count(*)::bigint as qualifying_reward_event_count,
  count(distinct e.invite_code)::bigint as invite_count,
  count(distinct e.app_id)::bigint as distinct_dapp_count,
  sum(e.amount_wei::numeric) as total_qualifying_reward_wei,
  min(e.block_timestamp) as first_reward_at,
  max(e.block_timestamp) as last_reward_at
from public.invite_impact_events e
where e.event_type = 'DAPP_REWARD'
group by
  e.network,
  lower(btrim(e.wallet_address));

comment on view public.operator_qualifying_dapp_reward_leaderboard is
  'Only verified dApp reward events that qualify as VeInvite mission evidence; not a wallet-wide B3TR balance history.';

create view public.operator_inviter_analytics
with (security_invoker = true)
as
with invitation_stats as (
  select
    lower(btrim(i.inviter_wallet)) as wallet_address,
    count(*)::bigint as invitations_created,
    count(*) filter (
      where i.invitee_wallet is not null
        and i.activated_at is not null
    )::bigint as claimed_invitations,
    count(distinct lower(btrim(i.invitee_wallet))) filter (
      where i.invitee_wallet is not null
        and i.activated_at is not null
    )::bigint as unique_invitees,
    count(*) filter (
      where e.outcome = 'ELIGIBLE'
        and e.entry_class = 'NEW'
    )::bigint as verified_new_invitees,
    count(*) filter (
      where e.outcome = 'ELIGIBLE'
        and e.entry_class = 'RETURNING'
    )::bigint as verified_returning_invitees,
    count(*) filter (
      where i.status = 'COMPLETED'
    )::bigint as completed_referrals,
    count(*) filter (
      where i.reward_status = 'ELIGIBLE'
    )::bigint as currently_eligible_referrals,
    count(*) filter (
      where i.status = 'CANCELLED'
    )::bigint as cancelled_invitations,
    count(*) filter (
      where i.sybil_status in ('REVIEW', 'BLOCKED')
    )::bigint as flagged_referrals,
    min(i.created_at) as first_invite_at,
    max(i.updated_at) as last_activity_at
  from public.invitations i
  left join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
  where lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'
  group by lower(btrim(i.inviter_wallet))
), reward_stats as (
  select
    lower(btrim(r.recipient_wallet)) as wallet_address,
    count(*)::bigint as reward_receipt_count,
    count(distinct r.invite_code)::bigint as paid_referrals,
    sum(r.amount_wei) as total_veinvite_reward_wei,
    max(r.paid_at) as last_reward_paid_at
  from public.reward_receipts r
  group by lower(btrim(r.recipient_wallet))
)
select
  i.wallet_address,
  i.invitations_created,
  i.claimed_invitations,
  i.unique_invitees,
  i.verified_new_invitees,
  i.verified_returning_invitees,
  i.completed_referrals,
  i.currently_eligible_referrals,
  coalesce(r.paid_referrals, 0::bigint) as paid_referrals,
  coalesce(r.reward_receipt_count, 0::bigint) as reward_receipt_count,
  coalesce(r.total_veinvite_reward_wei, 0::numeric) as total_veinvite_reward_wei,
  i.cancelled_invitations,
  i.flagged_referrals,
  i.first_invite_at,
  i.last_activity_at,
  r.last_reward_paid_at
from invitation_stats i
left join reward_stats r
  on r.wallet_address = i.wallet_address;

comment on view public.operator_inviter_analytics is
  'Inviter activity funnel with verified entry classes and immutable VeInvite reward totals.';

create view public.operator_analytics_overview
with (security_invoker = true)
as
select
  (select count(*)::bigint from public.invitations) as total_invitations,
  (
    select count(distinct lower(btrim(i.inviter_wallet)))::bigint
    from public.invitations i
    where lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'
  ) as unique_inviters,
  (
    select count(*)::bigint
    from public.invitations i
    where i.invitee_wallet is not null
      and i.activated_at is not null
  ) as claimed_invitations,
  (
    select count(*)::bigint
    from public.invitations i
    where i.status = 'COMPLETED'
  ) as completed_referrals,
  (
    select count(*)::bigint
    from public.invitations i
    where i.reward_status = 'ELIGIBLE'
  ) as currently_eligible_referrals,
  (
    select count(distinct r.invite_code)::bigint
    from public.reward_receipts r
  ) as paid_referrals,
  (
    select coalesce(sum(r.amount_wei), 0::numeric)
    from public.reward_receipts r
  ) as total_veinvite_reward_wei,
  (
    select count(*)::bigint
    from public.invite_impact_events e
    where e.event_type = 'DAPP_REWARD'
  ) as qualifying_dapp_reward_events,
  (
    select coalesce(sum(e.amount_wei::numeric), 0::numeric)
    from public.invite_impact_events e
    where e.event_type = 'DAPP_REWARD'
  ) as total_qualifying_dapp_reward_wei,
  (
    select count(*)::bigint
    from public.invitations i
    where i.sybil_status in ('REVIEW', 'BLOCKED')
  ) as flagged_referrals,
  greatest(
    (select max(i.updated_at) from public.invitations i),
    (select max(e.detected_at) from public.invite_impact_events e),
    (select max(r.created_at) from public.reward_receipts r)
  ) as latest_recorded_activity_at;

comment on view public.operator_analytics_overview is
  'Global operator summary. Reward totals use immutable receipts; dApp totals use qualifying mission evidence only.';

revoke all on table public.operator_reward_recipient_leaderboard
  from public, anon, authenticated, service_role;
revoke all on table public.operator_qualifying_dapp_reward_leaderboard
  from public, anon, authenticated, service_role;
revoke all on table public.operator_inviter_analytics
  from public, anon, authenticated, service_role;
revoke all on table public.operator_analytics_overview
  from public, anon, authenticated, service_role;

grant select on table public.operator_reward_recipient_leaderboard
  to service_role;
grant select on table public.operator_qualifying_dapp_reward_leaderboard
  to service_role;
grant select on table public.operator_inviter_analytics
  to service_role;
grant select on table public.operator_analytics_overview
  to service_role;

commit;
