create or replace view public.operator_weekly_impact
with (security_invoker = true)
as
with week_keys as (
  select date_trunc('week', activated_at) as week_start
  from public.invitations
  where activated_at is not null
  union
  select date_trunc('week', vote_completed_at)
  from public.invitations
  where vote_completed_at is not null and vote_completed = true
  union
  select date_trunc('week', block_timestamp)
  from public.invite_impact_events
  union
  select date_trunc('week', paid_at)
  from public.reward_payouts
  where paid_at is not null and status = 'PAID'
),
wallets as (
  select
    date_trunc('week', activated_at) as week_start,
    count(distinct invitee_wallet) as new_wallets_onboarded
  from public.invitations
  where activated_at is not null and invitee_wallet is not null
  group by 1
),
completions as (
  select
    date_trunc('week', vote_completed_at) as week_start,
    count(*) as successful_referrals_completed
  from public.invitations
  where vote_completed_at is not null
    and vote_completed = true
  group by 1
),
impact as (
  select
    date_trunc('week', block_timestamp) as week_start,
    count(distinct tx_id) as verified_onboarding_transactions,
    count(distinct tx_id) filter (where event_type = 'DAPP_REWARD') as verified_dapp_reward_transactions,
    count(*) filter (where event_type = 'DAPP_REWARD') as verified_dapp_reward_events,
    count(distinct tx_id) filter (where event_type = 'ALLOCATION_VOTE') as governance_vote_transactions,
    count(distinct wallet_address) as active_onboarded_wallets
  from public.invite_impact_events
  group by 1
),
payouts as (
  select
    date_trunc('week', paid_at) as week_start,
    count(*) as paid_referral_rewards,
    count(distinct recipient_wallet) as rewarded_wallets,
    coalesce(sum(amount_wei), 0::numeric) as b3tr_distributed_wei
  from public.reward_payouts
  where status = 'PAID' and paid_at is not null
  group by 1
)
select
  wk.week_start,
  wk.week_start + interval '7 days' as week_end,
  coalesce(w.new_wallets_onboarded, 0)::bigint as new_wallets_onboarded,
  coalesce(c.successful_referrals_completed, 0)::bigint as successful_referrals_completed,
  coalesce(i.active_onboarded_wallets, 0)::bigint as active_onboarded_wallets,
  coalesce(i.verified_onboarding_transactions, 0)::bigint as verified_onboarding_transactions,
  coalesce(i.verified_dapp_reward_transactions, 0)::bigint as verified_dapp_reward_transactions,
  coalesce(i.verified_dapp_reward_events, 0)::bigint as verified_dapp_reward_events,
  coalesce(i.governance_vote_transactions, 0)::bigint as governance_vote_transactions,
  coalesce(p.paid_referral_rewards, 0)::bigint as paid_referral_rewards,
  coalesce(p.rewarded_wallets, 0)::bigint as rewarded_wallets,
  coalesce(p.b3tr_distributed_wei, 0::numeric) as b3tr_distributed_wei,
  coalesce(p.b3tr_distributed_wei, 0::numeric) / 1000000000000000000::numeric as b3tr_distributed
from week_keys wk
left join wallets w using (week_start)
left join completions c using (week_start)
left join impact i using (week_start)
left join payouts p using (week_start)
order by wk.week_start desc;

revoke all on table public.operator_weekly_impact from public, anon, authenticated;
grant select on table public.operator_weekly_impact to service_role;

create or replace view public.operator_impact_totals
with (security_invoker = true)
as
select
  (select count(distinct invitee_wallet) from public.invitations where invitee_wallet is not null and activated_at is not null)::bigint as total_wallets_onboarded,
  (select count(*) from public.invitations where vote_completed = true and vote_completed_at is not null)::bigint as total_successful_referrals_completed,
  (select count(distinct wallet_address) from public.invite_impact_events)::bigint as total_wallets_with_verified_impact,
  (select count(distinct tx_id) from public.invite_impact_events)::bigint as total_verified_onboarding_transactions,
  (select count(distinct tx_id) from public.invite_impact_events where event_type = 'DAPP_REWARD')::bigint as total_verified_dapp_reward_transactions,
  (select count(*) from public.invite_impact_events where event_type = 'DAPP_REWARD')::bigint as total_verified_dapp_reward_events,
  (select count(distinct tx_id) from public.invite_impact_events where event_type = 'ALLOCATION_VOTE')::bigint as total_governance_vote_transactions,
  (select count(*) from public.reward_payouts where status = 'PAID' and paid_at is not null)::bigint as total_paid_referral_rewards,
  (select count(distinct recipient_wallet) from public.reward_payouts where status = 'PAID' and paid_at is not null)::bigint as total_rewarded_wallets,
  coalesce((select sum(amount_wei) from public.reward_payouts where status = 'PAID' and paid_at is not null), 0::numeric) as total_b3tr_distributed_wei,
  coalesce((select sum(amount_wei) from public.reward_payouts where status = 'PAID' and paid_at is not null), 0::numeric) / 1000000000000000000::numeric as total_b3tr_distributed;

revoke all on table public.operator_impact_totals from public, anon, authenticated;
grant select on table public.operator_impact_totals to service_role;