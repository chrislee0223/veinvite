-- VeInvite audit hardening for operator/public reporting.
--
-- Goals:
-- 1. Separate networks in every aggregate.
-- 2. Use UTC Monday week boundaries explicitly.
-- 3. Count only invitations backed by an ELIGIBLE entry-proof ledger row.
-- 4. Count a successful completion only after CLEAR Sybil status and complete
--    raw impact reconciliation.
-- 5. Keep the public reporting baseline network-specific and exclude all
--    pre-baseline events, including a partial first week.
-- 6. Add an operator data-quality surface before any public number is quoted.
--
-- Applied and tested on Preview first. This migration does not transfer B3TR.

begin;

create index if not exists invitations_eligibility_check_id_idx
  on public.invitations (eligibility_check_id)
  where eligibility_check_id is not null;

alter table public.operator_reporting_config
  add column if not exists reporting_network text not null default 'mainnet';

alter table public.operator_reporting_config
  drop constraint if exists operator_reporting_config_reporting_network_check;
alter table public.operator_reporting_config
  add constraint operator_reporting_config_reporting_network_check
  check (reporting_network in ('mainnet','testnet','testnet-staging'));

create or replace function public.veinvite_utc_week_start(p_ts timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select date_trunc('week', p_ts at time zone 'UTC') at time zone 'UTC'
$$;

revoke all on function public.veinvite_utc_week_start(timestamptz)
  from public, anon, authenticated;
grant execute on function public.veinvite_utc_week_start(timestamptz)
  to service_role;

-- Column shape changes require clean view recreation.
drop view if exists public.operator_public_weekly_impact;
drop view if exists public.operator_weekly_impact;
drop view if exists public.operator_impact_totals;

create view public.operator_weekly_impact as
with valid_invites as (
  select i.*
  from public.invitations i
  join public.eligibility_check_events e
    on e.id = i.eligibility_check_id
   and e.invite_code = i.invite_code
   and e.wallet_address = i.invitee_wallet
   and e.network = i.activation_network
   and e.outcome = 'ELIGIBLE'
   and e.checked_block <= i.activation_block
  where i.invitee_wallet is not null
    and i.activation_network is not null
    and i.activated_at is not null
),
week_keys as (
  select activation_network as network,
         public.veinvite_utc_week_start(activated_at) as week_start
  from valid_invites
  union
  select activation_network,
         public.veinvite_utc_week_start(vote_completed_at)
  from valid_invites
  where status = 'COMPLETED'
    and sybil_status = 'CLEAR'
    and vote_completed = true
    and vote_completed_at is not null
    and impact_sync_complete_at is not null
  union
  select ev.network,
         public.veinvite_utc_week_start(ev.block_timestamp)
  from public.invite_impact_events ev
  join valid_invites i
    on i.invite_code = ev.invite_code
   and i.activation_network = ev.network
  union
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at)
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rp.status = 'PAID'
    and rp.paid_at is not null
),
wallets as (
  select activation_network as network,
         public.veinvite_utc_week_start(activated_at) as week_start,
         count(distinct invitee_wallet) as new_wallets_onboarded
  from valid_invites
  group by activation_network, public.veinvite_utc_week_start(activated_at)
),
completions as (
  select activation_network as network,
         public.veinvite_utc_week_start(vote_completed_at) as week_start,
         count(*) as successful_referrals_completed
  from valid_invites
  where status = 'COMPLETED'
    and sybil_status = 'CLEAR'
    and vote_completed = true
    and vote_completed_at is not null
    and impact_sync_complete_at is not null
  group by activation_network, public.veinvite_utc_week_start(vote_completed_at)
),
impact as (
  select ev.network,
         public.veinvite_utc_week_start(ev.block_timestamp) as week_start,
         count(distinct ev.tx_id) as verified_onboarding_transactions,
         count(distinct ev.tx_id) filter (where ev.event_type='DAPP_REWARD') as verified_dapp_reward_transactions,
         count(*) filter (where ev.event_type='DAPP_REWARD') as verified_dapp_reward_events,
         count(distinct ev.tx_id) filter (where ev.event_type='ALLOCATION_VOTE') as governance_vote_transactions,
         count(distinct ev.wallet_address) as active_onboarded_wallets
  from public.invite_impact_events ev
  join valid_invites i
    on i.invite_code=ev.invite_code
   and i.activation_network=ev.network
  group by ev.network, public.veinvite_utc_week_start(ev.block_timestamp)
),
payouts as (
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at) as week_start,
         count(*) as paid_referral_rewards,
         count(distinct rp.recipient_wallet) as rewarded_wallets,
         coalesce(sum(rp.amount_wei),0::numeric) as b3tr_distributed_wei
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rp.status='PAID'
    and rp.paid_at is not null
  group by rr.network, public.veinvite_utc_week_start(rp.paid_at)
)
select wk.network,
       wk.week_start,
       wk.week_start + interval '7 days' as week_end,
       coalesce(w.new_wallets_onboarded,0::bigint) as new_wallets_onboarded,
       coalesce(c.successful_referrals_completed,0::bigint) as successful_referrals_completed,
       coalesce(im.active_onboarded_wallets,0::bigint) as active_onboarded_wallets,
       coalesce(im.verified_onboarding_transactions,0::bigint) as verified_onboarding_transactions,
       coalesce(im.verified_dapp_reward_transactions,0::bigint) as verified_dapp_reward_transactions,
       coalesce(im.verified_dapp_reward_events,0::bigint) as verified_dapp_reward_events,
       coalesce(im.governance_vote_transactions,0::bigint) as governance_vote_transactions,
       coalesce(p.paid_referral_rewards,0::bigint) as paid_referral_rewards,
       coalesce(p.rewarded_wallets,0::bigint) as rewarded_wallets,
       coalesce(p.b3tr_distributed_wei,0::numeric) as b3tr_distributed_wei,
       coalesce(p.b3tr_distributed_wei,0::numeric) / 1000000000000000000::numeric as b3tr_distributed
from week_keys wk
left join wallets w using(network,week_start)
left join completions c using(network,week_start)
left join impact im using(network,week_start)
left join payouts p using(network,week_start)
order by wk.week_start desc, wk.network;

create view public.operator_impact_totals as
with networks(network) as (
  values ('mainnet'::text),('testnet'::text),('testnet-staging'::text)
),
valid_invites as (
  select i.*
  from public.invitations i
  join public.eligibility_check_events e
    on e.id=i.eligibility_check_id
   and e.invite_code=i.invite_code
   and e.wallet_address=i.invitee_wallet
   and e.network=i.activation_network
   and e.outcome='ELIGIBLE'
   and e.checked_block <= i.activation_block
  where i.invitee_wallet is not null
    and i.activation_network is not null
),
inv as (
  select activation_network as network,
         count(distinct invitee_wallet) as total_wallets_onboarded,
         count(*) filter (
           where status='COMPLETED'
             and sybil_status='CLEAR'
             and vote_completed=true
             and vote_completed_at is not null
             and impact_sync_complete_at is not null
         ) as total_successful_referrals_completed
  from valid_invites
  group by activation_network
),
imp as (
  select ev.network,
         count(distinct ev.wallet_address) as total_wallets_with_verified_impact,
         count(distinct ev.tx_id) as total_verified_onboarding_transactions,
         count(distinct ev.tx_id) filter(where ev.event_type='DAPP_REWARD') as total_verified_dapp_reward_transactions,
         count(*) filter(where ev.event_type='DAPP_REWARD') as total_verified_dapp_reward_events,
         count(distinct ev.tx_id) filter(where ev.event_type='ALLOCATION_VOTE') as total_governance_vote_transactions
  from public.invite_impact_events ev
  join valid_invites i
    on i.invite_code=ev.invite_code
   and i.activation_network=ev.network
  group by ev.network
),
pay as (
  select rr.network,
         count(*) as total_paid_referral_rewards,
         count(distinct rp.recipient_wallet) as total_rewarded_wallets,
         coalesce(sum(rp.amount_wei),0::numeric) as total_b3tr_distributed_wei
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rp.status='PAID'
    and rp.paid_at is not null
  group by rr.network
)
select n.network,
       coalesce(inv.total_wallets_onboarded,0::bigint) as total_wallets_onboarded,
       coalesce(inv.total_successful_referrals_completed,0::bigint) as total_successful_referrals_completed,
       coalesce(imp.total_wallets_with_verified_impact,0::bigint) as total_wallets_with_verified_impact,
       coalesce(imp.total_verified_onboarding_transactions,0::bigint) as total_verified_onboarding_transactions,
       coalesce(imp.total_verified_dapp_reward_transactions,0::bigint) as total_verified_dapp_reward_transactions,
       coalesce(imp.total_verified_dapp_reward_events,0::bigint) as total_verified_dapp_reward_events,
       coalesce(imp.total_governance_vote_transactions,0::bigint) as total_governance_vote_transactions,
       coalesce(pay.total_paid_referral_rewards,0::bigint) as total_paid_referral_rewards,
       coalesce(pay.total_rewarded_wallets,0::bigint) as total_rewarded_wallets,
       coalesce(pay.total_b3tr_distributed_wei,0::numeric) as total_b3tr_distributed_wei,
       coalesce(pay.total_b3tr_distributed_wei,0::numeric) / 1000000000000000000::numeric as total_b3tr_distributed
from networks n
left join inv using(network)
left join imp using(network)
left join pay using(network)
order by n.network;

-- Public view intentionally re-aggregates from event-level data after the
-- launch baseline. This prevents pre-launch rows from leaking into a partial
-- first reporting week.
create view public.operator_public_weekly_impact as
with cfg as (
  select reporting_start_at, reporting_network
  from public.operator_reporting_config
  where id=1 and reporting_start_at is not null
),
valid_invites as (
  select i.*
  from public.invitations i
  join public.eligibility_check_events e
    on e.id=i.eligibility_check_id
   and e.invite_code=i.invite_code
   and e.wallet_address=i.invitee_wallet
   and e.network=i.activation_network
   and e.outcome='ELIGIBLE'
   and e.checked_block <= i.activation_block
  join cfg c on c.reporting_network=i.activation_network
  where i.invitee_wallet is not null
),
week_keys as (
  select i.activation_network as network,
         public.veinvite_utc_week_start(i.activated_at) as week_start
  from valid_invites i cross join cfg c
  where i.activated_at >= c.reporting_start_at
  union
  select i.activation_network,
         public.veinvite_utc_week_start(i.vote_completed_at)
  from valid_invites i cross join cfg c
  where i.status='COMPLETED'
    and i.sybil_status='CLEAR'
    and i.vote_completed=true
    and i.vote_completed_at is not null
    and i.vote_completed_at >= c.reporting_start_at
    and i.impact_sync_complete_at is not null
  union
  select ev.network,
         public.veinvite_utc_week_start(ev.block_timestamp)
  from public.invite_impact_events ev
  join valid_invites i
    on i.invite_code=ev.invite_code
   and i.activation_network=ev.network
  cross join cfg c
  where ev.block_timestamp >= c.reporting_start_at
  union
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at)
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  cross join cfg c
  where rr.network=c.reporting_network
    and rp.status='PAID'
    and rp.paid_at is not null
    and rp.paid_at >= c.reporting_start_at
),
wallets as (
  select i.activation_network as network,
         public.veinvite_utc_week_start(i.activated_at) as week_start,
         count(distinct i.invitee_wallet) as new_wallets_onboarded
  from valid_invites i cross join cfg c
  where i.activated_at >= c.reporting_start_at
  group by i.activation_network, public.veinvite_utc_week_start(i.activated_at)
),
completions as (
  select i.activation_network as network,
         public.veinvite_utc_week_start(i.vote_completed_at) as week_start,
         count(*) as successful_referrals_completed
  from valid_invites i cross join cfg c
  where i.status='COMPLETED'
    and i.sybil_status='CLEAR'
    and i.vote_completed=true
    and i.vote_completed_at is not null
    and i.vote_completed_at >= c.reporting_start_at
    and i.impact_sync_complete_at is not null
  group by i.activation_network, public.veinvite_utc_week_start(i.vote_completed_at)
),
impact as (
  select ev.network,
         public.veinvite_utc_week_start(ev.block_timestamp) as week_start,
         count(distinct ev.tx_id) as verified_onboarding_transactions,
         count(distinct ev.tx_id) filter(where ev.event_type='DAPP_REWARD') as verified_dapp_reward_transactions,
         count(*) filter(where ev.event_type='DAPP_REWARD') as verified_dapp_reward_events,
         count(distinct ev.tx_id) filter(where ev.event_type='ALLOCATION_VOTE') as governance_vote_transactions,
         count(distinct ev.wallet_address) as active_onboarded_wallets
  from public.invite_impact_events ev
  join valid_invites i
    on i.invite_code=ev.invite_code
   and i.activation_network=ev.network
  cross join cfg c
  where ev.block_timestamp >= c.reporting_start_at
  group by ev.network, public.veinvite_utc_week_start(ev.block_timestamp)
),
payouts as (
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at) as week_start,
         count(*) as paid_referral_rewards,
         count(distinct rp.recipient_wallet) as rewarded_wallets,
         coalesce(sum(rp.amount_wei),0::numeric) as b3tr_distributed_wei
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  cross join cfg c
  where rr.network=c.reporting_network
    and rp.status='PAID'
    and rp.paid_at is not null
    and rp.paid_at >= c.reporting_start_at
  group by rr.network, public.veinvite_utc_week_start(rp.paid_at)
)
select wk.network,
       wk.week_start,
       wk.week_start+interval '7 days' as week_end,
       coalesce(w.new_wallets_onboarded,0::bigint) as new_wallets_onboarded,
       coalesce(cp.successful_referrals_completed,0::bigint) as successful_referrals_completed,
       coalesce(im.active_onboarded_wallets,0::bigint) as active_onboarded_wallets,
       coalesce(im.verified_onboarding_transactions,0::bigint) as verified_onboarding_transactions,
       coalesce(im.verified_dapp_reward_transactions,0::bigint) as verified_dapp_reward_transactions,
       coalesce(im.verified_dapp_reward_events,0::bigint) as verified_dapp_reward_events,
       coalesce(im.governance_vote_transactions,0::bigint) as governance_vote_transactions,
       coalesce(p.paid_referral_rewards,0::bigint) as paid_referral_rewards,
       coalesce(p.rewarded_wallets,0::bigint) as rewarded_wallets,
       coalesce(p.b3tr_distributed_wei,0::numeric) as b3tr_distributed_wei,
       coalesce(p.b3tr_distributed_wei,0::numeric)/1000000000000000000::numeric as b3tr_distributed
from week_keys wk
left join wallets w using(network,week_start)
left join completions cp using(network,week_start)
left join impact im using(network,week_start)
left join payouts p using(network,week_start)
order by wk.week_start desc;

create or replace view public.operator_data_quality as
with networks(network) as (
  values ('mainnet'::text),('testnet'::text),('testnet-staging'::text)
),
base as (
  select n.network,
    count(i.invite_code) filter (
      where i.invitee_wallet is not null
        and i.activation_network=n.network
        and (i.eligibility_check_id is null or not exists (
          select 1
          from public.eligibility_check_events e
          where e.id=i.eligibility_check_id
            and e.invite_code=i.invite_code
            and e.wallet_address=i.invitee_wallet
            and e.network=i.activation_network
            and e.outcome='ELIGIBLE'
            and e.checked_block <= i.activation_block
        ))
    ) as accepted_missing_entry_proof,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.vote_completed=true
        and i.sybil_status in ('NOT_CHECKED','REVIEW')
    ) as unresolved_sybil_after_vote,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.status='COMPLETED'
        and i.impact_sync_complete_at is null
    ) as completed_missing_impact_evidence,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.reward_status='ELIGIBLE'
        and i.impact_sync_complete_at is null
    ) as eligible_missing_impact_evidence,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.invitee_wallet is not null
        and i.status <> 'CANCELLED'
        and i.impact_sync_complete_at is null
        and coalesce(i.impact_last_synced_at,i.activated_at,i.created_at) < now()-interval '1 hour'
    ) as stale_incomplete_reconciliation
  from networks n
  left join public.invitations i on true
  group by n.network
),
payout_mismatch as (
  select n.network,
    (select count(*)
       from public.reward_payouts rp
       join public.reward_rounds rr on rr.id=rp.round_id
       join public.invitations i on i.invite_code=rp.invite_code
      where rr.network=n.network
        and rp.status='PAID'
        and i.reward_status <> 'PAID')
    +
    (select count(*)
       from public.invitations i
      where i.activation_network=n.network
        and i.reward_status='PAID'
        and not exists (
          select 1
          from public.reward_payouts rp
          join public.reward_rounds rr on rr.id=rp.round_id
          where rp.invite_code=i.invite_code
            and rp.status='PAID'
            and rr.network=n.network
        )) as payout_state_mismatches
  from networks n
)
select b.network,
       b.accepted_missing_entry_proof,
       b.unresolved_sybil_after_vote,
       b.completed_missing_impact_evidence,
       b.eligible_missing_impact_evidence,
       b.stale_incomplete_reconciliation,
       p.payout_state_mismatches,
       (b.accepted_missing_entry_proof=0
        and b.unresolved_sybil_after_vote=0
        and b.completed_missing_impact_evidence=0
        and b.eligible_missing_impact_evidence=0
        and b.stale_incomplete_reconciliation=0
        and p.payout_state_mismatches=0) as is_clean
from base b
join payout_mismatch p using(network)
order by b.network;

revoke all on public.operator_weekly_impact from public, anon, authenticated;
revoke all on public.operator_impact_totals from public, anon, authenticated;
revoke all on public.operator_public_weekly_impact from public, anon, authenticated;
revoke all on public.operator_data_quality from public, anon, authenticated;

grant select on public.operator_weekly_impact to service_role;
grant select on public.operator_impact_totals to service_role;
grant select on public.operator_public_weekly_impact to service_role;
grant select on public.operator_data_quality to service_role;

commit;
