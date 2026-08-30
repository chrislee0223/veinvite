-- VeInvite operator data-quality hardening.
-- Applied and tested on Preview first. This migration does not transfer B3TR.

begin;

drop view if exists public.operator_weekly_data_quality;
drop view if exists public.operator_global_data_quality;
drop view if exists public.operator_data_quality;

create view public.operator_global_data_quality as
select
  count(*) filter (
    where invitee_wallet is not null
      and status <> 'CANCELLED'
      and activation_network is null
  ) as active_or_completed_invites_without_network,
  count(*) filter (
    where invitee_wallet is not null
      and status <> 'CANCELLED'
      and eligibility_check_id is null
  ) as active_or_completed_invites_without_entry_check,
  count(*) filter (
    where reward_status='PAID'
      and reward_paid_at is null
  ) as paid_invites_without_paid_at,
  (
    count(*) filter (
      where invitee_wallet is not null
        and status <> 'CANCELLED'
        and activation_network is null
    ) = 0
    and count(*) filter (
      where invitee_wallet is not null
        and status <> 'CANCELLED'
        and eligibility_check_id is null
    ) = 0
    and count(*) filter (
      where reward_status='PAID'
        and reward_paid_at is null
    ) = 0
  ) as is_clean
from public.invitations;

create view public.operator_data_quality as
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
        and i.status='COMPLETED'
        and (
          select count(distinct ev.app_id)
          from public.invite_impact_events ev
          where ev.invite_code=i.invite_code
            and ev.network=n.network
            and ev.wallet_address=i.invitee_wallet
            and ev.event_type='DAPP_REWARD'
        ) < 3
    ) as completed_missing_raw_reward_events,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.status='COMPLETED'
        and not exists (
          select 1
          from public.invite_impact_events ev
          where ev.invite_code=i.invite_code
            and ev.network=n.network
            and ev.wallet_address=i.invitee_wallet
            and ev.event_type='ALLOCATION_VOTE'
            and ev.block_number=i.vote_completed_block
            and ev.block_timestamp=i.vote_completed_at
            and ev.vote_round_id=i.vote_round_id
        )
    ) as completed_missing_raw_vote_event,
    count(i.invite_code) filter (
      where i.activation_network=n.network
        and i.reward_status='ELIGIBLE'
        and (
          i.impact_sync_complete_at is null
          or (
            select count(distinct ev.app_id)
            from public.invite_impact_events ev
            where ev.invite_code=i.invite_code
              and ev.network=n.network
              and ev.wallet_address=i.invitee_wallet
              and ev.event_type='DAPP_REWARD'
          ) < 3
          or not exists (
            select 1
            from public.invite_impact_events ev
            where ev.invite_code=i.invite_code
              and ev.network=n.network
              and ev.wallet_address=i.invitee_wallet
              and ev.event_type='ALLOCATION_VOTE'
              and ev.block_number=i.vote_completed_block
              and ev.block_timestamp=i.vote_completed_at
              and ev.vote_round_id=i.vote_round_id
          )
        )
    ) as eligible_missing_raw_evidence,
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
       b.completed_missing_raw_reward_events,
       b.completed_missing_raw_vote_event,
       b.eligible_missing_raw_evidence,
       b.stale_incomplete_reconciliation,
       p.payout_state_mismatches,
       (b.accepted_missing_entry_proof=0
        and b.unresolved_sybil_after_vote=0
        and b.completed_missing_impact_evidence=0
        and b.completed_missing_raw_reward_events=0
        and b.completed_missing_raw_vote_event=0
        and b.eligible_missing_raw_evidence=0
        and b.stale_incomplete_reconciliation=0
        and p.payout_state_mismatches=0) as is_clean
from base b
join payout_mismatch p using(network)
order by b.network;

create view public.operator_weekly_data_quality as
with week_keys as (
  select activation_network as network,
         public.veinvite_utc_week_start(activated_at) as week_start
  from public.invitations
  where activation_network is not null and activated_at is not null
  union
  select activation_network,
         public.veinvite_utc_week_start(vote_completed_at)
  from public.invitations
  where activation_network is not null and vote_completed_at is not null
  union
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at)
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rp.paid_at is not null
),
activation_quality as (
  select i.activation_network as network,
         public.veinvite_utc_week_start(i.activated_at) as week_start,
         count(*) as activated_rows,
         count(*) filter (
           where i.eligibility_check_id is null
              or not exists (
                select 1
                from public.eligibility_check_events e
                where e.id=i.eligibility_check_id
                  and e.invite_code=i.invite_code
                  and e.wallet_address=i.invitee_wallet
                  and e.network=i.activation_network
                  and e.outcome='ELIGIBLE'
                  and e.checked_block <= i.activation_block
              )
         ) as activations_missing_entry_proof
  from public.invitations i
  where i.activation_network is not null
    and i.activated_at is not null
    and i.invitee_wallet is not null
  group by i.activation_network, public.veinvite_utc_week_start(i.activated_at)
),
completion_quality as (
  select i.activation_network as network,
         public.veinvite_utc_week_start(i.vote_completed_at) as week_start,
         count(*) as vote_completed_rows,
         count(*) filter (
           where i.sybil_status in ('NOT_CHECKED','REVIEW')
         ) as unresolved_sybil_after_vote,
         count(*) filter (
           where i.status='COMPLETED' and i.impact_sync_complete_at is null
         ) as completed_missing_impact_evidence,
         count(*) filter (
           where i.status='COMPLETED' and (
             select count(distinct ev.app_id)
             from public.invite_impact_events ev
             where ev.invite_code=i.invite_code
               and ev.network=i.activation_network
               and ev.wallet_address=i.invitee_wallet
               and ev.event_type='DAPP_REWARD'
           ) < 3
         ) as completed_missing_raw_reward_events,
         count(*) filter (
           where i.status='COMPLETED' and not exists (
             select 1
             from public.invite_impact_events ev
             where ev.invite_code=i.invite_code
               and ev.network=i.activation_network
               and ev.wallet_address=i.invitee_wallet
               and ev.event_type='ALLOCATION_VOTE'
               and ev.block_number=i.vote_completed_block
               and ev.block_timestamp=i.vote_completed_at
               and ev.vote_round_id=i.vote_round_id
           )
         ) as completed_missing_raw_vote_event
  from public.invitations i
  where i.activation_network is not null
    and i.vote_completed=true
    and i.vote_completed_at is not null
  group by i.activation_network, public.veinvite_utc_week_start(i.vote_completed_at)
),
payout_quality as (
  select rr.network,
         public.veinvite_utc_week_start(rp.paid_at) as week_start,
         count(*) filter (where i.reward_status <> 'PAID') as payout_state_mismatches
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  join public.invitations i on i.invite_code=rp.invite_code
  where rp.status='PAID' and rp.paid_at is not null
  group by rr.network, public.veinvite_utc_week_start(rp.paid_at)
)
select wk.network,
       wk.week_start,
       wk.week_start + interval '7 days' as week_end,
       coalesce(a.activated_rows,0::bigint) as activated_rows,
       coalesce(a.activations_missing_entry_proof,0::bigint) as activations_missing_entry_proof,
       coalesce(c.vote_completed_rows,0::bigint) as vote_completed_rows,
       coalesce(c.unresolved_sybil_after_vote,0::bigint) as unresolved_sybil_after_vote,
       coalesce(c.completed_missing_impact_evidence,0::bigint) as completed_missing_impact_evidence,
       coalesce(c.completed_missing_raw_reward_events,0::bigint) as completed_missing_raw_reward_events,
       coalesce(c.completed_missing_raw_vote_event,0::bigint) as completed_missing_raw_vote_event,
       coalesce(p.payout_state_mismatches,0::bigint) as payout_state_mismatches,
       (coalesce(a.activations_missing_entry_proof,0)=0
        and coalesce(c.unresolved_sybil_after_vote,0)=0
        and coalesce(c.completed_missing_impact_evidence,0)=0
        and coalesce(c.completed_missing_raw_reward_events,0)=0
        and coalesce(c.completed_missing_raw_vote_event,0)=0
        and coalesce(p.payout_state_mismatches,0)=0) as is_clean
from week_keys wk
left join activation_quality a using(network,week_start)
left join completion_quality c using(network,week_start)
left join payout_quality p using(network,week_start)
order by wk.week_start desc, wk.network;

revoke all on public.operator_global_data_quality from public,anon,authenticated;
revoke all on public.operator_data_quality from public,anon,authenticated;
revoke all on public.operator_weekly_data_quality from public,anon,authenticated;
grant select on public.operator_global_data_quality to service_role;
grant select on public.operator_data_quality to service_role;
grant select on public.operator_weekly_data_quality to service_role;

commit;
