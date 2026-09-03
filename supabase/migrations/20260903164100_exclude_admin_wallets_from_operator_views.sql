begin;

create or replace function public.is_analytics_excluded_invite_code(p_invite_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.invitations i
    where i.invite_code = p_invite_code
      and (
        public.is_analytics_excluded_wallet(i.inviter_wallet)
        or public.is_analytics_excluded_wallet(i.invitee_wallet)
      )
  );
$$;
revoke all on function public.is_analytics_excluded_invite_code(text) from public, anon, authenticated, service_role;
grant execute on function public.is_analytics_excluded_invite_code(text) to service_role;

create or replace view public.operator_invitation_funnel as
with latest_legacy as (
  select distinct on (b.invitation_id)
    b.invitation_id, b.entry_class, b.outcome, b.recorded_at
  from public.legacy_entry_classification_backfill b
  where b.classification_status = 'VERIFIED'
  order by b.invitation_id, b.recorded_at desc, b.id desc
), classified as (
  select i.id, i.invite_code, i.status, i.invitee_wallet,
    i.eligibility_check_id, i.ineligibility_check_id,
    e.outcome as eligibility_outcome, e.entry_class as modern_entry_class,
    l.outcome as legacy_outcome, l.entry_class as legacy_entry_class,
    case
      when i.ineligibility_check_id is not null then 'INELIGIBLE_LIVE'
      when i.eligibility_check_id is null and l.outcome = 'EXISTING_VEBETTER_USER' and l.entry_class = 'ACTIVE_EXISTING' then 'INELIGIBLE_LEGACY'
      when i.eligibility_check_id is not null and e.outcome = 'ELIGIBLE' and e.entry_class in ('NEW','RETURNING') then 'ACCEPTED_MODERN'
      when i.eligibility_check_id is null and i.invitee_wallet is not null and l.outcome = 'ELIGIBLE' and l.entry_class in ('NEW','RETURNING') then 'ACCEPTED_LEGACY'
      when i.status = 'PENDING_ACCEPTANCE' then 'PENDING_ACCEPTANCE'
      when i.status = 'CANCELLED' then 'CANCELLED_BY_INVITER'
      when i.invitee_wallet is not null and i.eligibility_check_id is null then 'LEGACY_UNCLASSIFIED'
      else 'OTHER'
    end as funnel_bucket
  from public.invitations i
  left join public.eligibility_check_events e on e.id = i.eligibility_check_id
  left join latest_legacy l on l.invitation_id = i.id
  where not public.is_analytics_excluded_wallet(i.inviter_wallet)
    and not public.is_analytics_excluded_wallet(i.invitee_wallet)
)
select now() as generated_at,
  count(*) as invitations_generated,
  count(*) filter (where funnel_bucket = 'PENDING_ACCEPTANCE') as pending_acceptance,
  count(*) filter (where funnel_bucket in ('INELIGIBLE_LIVE','INELIGIBLE_LEGACY')) as ineligible_rejections,
  count(*) filter (where funnel_bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY')) as accepted_total,
  count(*) filter (where funnel_bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(modern_entry_class, legacy_entry_class) = 'NEW') as accepted_new,
  count(*) filter (where funnel_bucket in ('ACCEPTED_MODERN','ACCEPTED_LEGACY') and coalesce(modern_entry_class, legacy_entry_class) = 'RETURNING') as accepted_returning,
  count(*) filter (where funnel_bucket = 'CANCELLED_BY_INVITER') as cancelled_by_inviter,
  count(*) filter (where funnel_bucket = 'LEGACY_UNCLASSIFIED') as legacy_excluded,
  count(*) filter (where funnel_bucket = 'OTHER') as other_rows,
  count(*) filter (where funnel_bucket = 'INELIGIBLE_LIVE') as ineligible_live_rejections,
  count(*) filter (where funnel_bucket = 'INELIGIBLE_LEGACY') as ineligible_legacy_reclassifications,
  count(*) filter (where funnel_bucket = 'ACCEPTED_MODERN') as accepted_modern,
  count(*) filter (where funnel_bucket = 'ACCEPTED_LEGACY') as accepted_legacy
from classified;

create or replace view public.operator_inviter_analytics as
with invitation_stats as (
  select lower(btrim(i.inviter_wallet)) as wallet_address,
    count(*) as invitations_created,
    count(*) filter (where i.eligibility_check_id is not null and i.invitee_wallet is not null and i.activated_at is not null) as claimed_invitations,
    count(distinct lower(btrim(i.invitee_wallet))) filter (where i.eligibility_check_id is not null and i.invitee_wallet is not null and i.activated_at is not null) as unique_invitees,
    count(*) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'NEW') as verified_new_invitees,
    count(*) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'RETURNING') as verified_returning_invitees,
    count(*) filter (where i.eligibility_check_id is not null and i.status = 'COMPLETED' and i.apps_completed >= 3 and i.apps_completed_block is not null and i.vot3_converted is true and i.vot3_converted_block is not null and i.vote_completed is true and i.vote_completed_block is not null) as completed_referrals,
    count(*) filter (where i.eligibility_check_id is not null and i.reward_status = 'ELIGIBLE') as currently_eligible_referrals,
    count(*) filter (where i.status = 'CANCELLED') as cancelled_invitations,
    count(*) filter (where i.eligibility_check_id is not null and i.sybil_status in ('REVIEW','BLOCKED')) as flagged_referrals,
    min(i.created_at) as first_invite_at,
    max(i.updated_at) as last_activity_at
  from public.invitations i
  left join public.eligibility_check_events e on e.id = i.eligibility_check_id
  where lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$'
    and not public.is_analytics_excluded_wallet(i.inviter_wallet)
    and not public.is_analytics_excluded_wallet(i.invitee_wallet)
  group by lower(btrim(i.inviter_wallet))
), reward_stats as (
  select lower(btrim(r.recipient_wallet)) as wallet_address,
    count(*) as reward_receipt_count,
    count(distinct r.invite_code) as paid_referrals,
    sum(r.amount_wei) as total_veinvite_reward_wei,
    max(r.paid_at) as last_reward_paid_at
  from public.reward_receipts r
  where not public.is_analytics_excluded_wallet(r.recipient_wallet)
    and not public.is_analytics_excluded_invite_code(r.invite_code)
  group by lower(btrim(r.recipient_wallet))
)
select i.wallet_address, i.invitations_created, i.claimed_invitations,
  i.unique_invitees, i.verified_new_invitees, i.verified_returning_invitees,
  i.completed_referrals, i.currently_eligible_referrals,
  coalesce(r.paid_referrals,0::bigint) as paid_referrals,
  coalesce(r.reward_receipt_count,0::bigint) as reward_receipt_count,
  coalesce(r.total_veinvite_reward_wei,0::numeric) as total_veinvite_reward_wei,
  i.cancelled_invitations, i.flagged_referrals, i.first_invite_at,
  i.last_activity_at, r.last_reward_paid_at
from invitation_stats i
left join reward_stats r using (wallet_address);

create or replace view public.operator_qualifying_dapp_reward_leaderboard as
select e.network, lower(btrim(e.wallet_address)) as wallet_address,
  count(*) as qualifying_reward_event_count,
  count(distinct e.invite_code) as invite_count,
  count(distinct e.app_id) as distinct_dapp_count,
  sum(e.amount_wei::numeric) as total_qualifying_reward_wei,
  min(e.block_timestamp) as first_reward_at,
  max(e.block_timestamp) as last_reward_at
from public.invite_impact_events e
where e.event_type = 'DAPP_REWARD'
  and not public.is_analytics_excluded_wallet(e.wallet_address)
  and not public.is_analytics_excluded_invite_code(e.invite_code)
group by e.network, lower(btrim(e.wallet_address));

create or replace view public.operator_reward_recipient_leaderboard as
select r.network, lower(btrim(r.recipient_wallet)) as wallet_address,
  count(*) as reward_receipt_count,
  count(distinct r.invite_code) as paid_referral_count,
  count(distinct r.vebetter_round_id) as paid_round_count,
  sum(r.amount_wei) as total_reward_wei,
  min(r.paid_at) as first_paid_at,
  max(r.paid_at) as last_paid_at
from public.reward_receipts r
where not public.is_analytics_excluded_wallet(r.recipient_wallet)
  and not public.is_analytics_excluded_invite_code(r.invite_code)
group by r.network, lower(btrim(r.recipient_wallet));

create or replace view public.operator_referral_leaderboard as
select i.inviter_wallet as wallet_address,
  count(*) as invitations_created,
  count(*) filter (where i.status = 'COMPLETED' and i.ineligibility_check_id is null and coalesce(e.outcome, legacy.outcome) = 'ELIGIBLE' and coalesce(e.entry_class, legacy.entry_class) in ('NEW','RETURNING') and i.apps_completed >= 3 and i.vot3_converted is true and i.vote_completed is true and i.sybil_status = 'CLEAR') as completed_referrals,
  count(*) filter (where i.reward_status = 'PAID') as paid_referrals,
  count(*) filter (where i.sybil_status in ('REVIEW','BLOCKED')) as flagged_referrals,
  min(i.created_at) as first_invite_at,
  max(i.updated_at) as last_activity_at
from public.invitations i
left join public.eligibility_check_events e on e.id = i.eligibility_check_id
left join lateral (
  select lb.* from public.legacy_entry_classification_backfill lb
  where lb.invitation_id = i.id and lb.classification_status = 'VERIFIED'
  order by lb.recorded_at desc, lb.id desc limit 1
) legacy on true
where not public.is_analytics_excluded_wallet(i.inviter_wallet)
  and not public.is_analytics_excluded_wallet(i.invitee_wallet)
group by i.inviter_wallet;

create or replace view public.operator_analytics_overview as
select
  (select count(*) from public.invitations i where not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as total_invitations,
  (select count(distinct lower(btrim(i.inviter_wallet))) from public.invitations i where lower(btrim(i.inviter_wallet)) ~ '^0x[0-9a-f]{40}$' and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as unique_inviters,
  (select count(*) from public.invitations i where i.eligibility_check_id is not null and i.invitee_wallet is not null and i.activated_at is not null and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as claimed_invitations,
  (select count(*) from public.invitations i where i.eligibility_check_id is not null and i.status='COMPLETED' and i.apps_completed>=3 and i.apps_completed_block is not null and i.vot3_converted is true and i.vot3_converted_block is not null and i.vote_completed is true and i.vote_completed_block is not null and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as completed_referrals,
  (select count(*) from public.invitations i where i.eligibility_check_id is not null and i.reward_status='ELIGIBLE' and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as currently_eligible_referrals,
  (select count(distinct r.invite_code) from public.reward_receipts r where not public.is_analytics_excluded_wallet(r.recipient_wallet) and not public.is_analytics_excluded_invite_code(r.invite_code)) as paid_referrals,
  (select coalesce(sum(r.amount_wei),0::numeric) from public.reward_receipts r where not public.is_analytics_excluded_wallet(r.recipient_wallet) and not public.is_analytics_excluded_invite_code(r.invite_code)) as total_veinvite_reward_wei,
  (select count(*) from public.invite_impact_events e where e.event_type='DAPP_REWARD' and not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)) as qualifying_dapp_reward_events,
  (select coalesce(sum(e.amount_wei::numeric),0::numeric) from public.invite_impact_events e where e.event_type='DAPP_REWARD' and not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)) as total_qualifying_dapp_reward_wei,
  (select count(*) from public.invitations i where i.eligibility_check_id is not null and i.sybil_status in ('REVIEW','BLOCKED') and not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)) as flagged_referrals,
  greatest(
    (select max(i.updated_at) from public.invitations i where not public.is_analytics_excluded_wallet(i.inviter_wallet) and not public.is_analytics_excluded_wallet(i.invitee_wallet)),
    (select max(e.detected_at) from public.invite_impact_events e where not public.is_analytics_excluded_wallet(e.wallet_address) and not public.is_analytics_excluded_invite_code(e.invite_code)),
    (select max(r.created_at) from public.reward_receipts r where not public.is_analytics_excluded_wallet(r.recipient_wallet) and not public.is_analytics_excluded_invite_code(r.invite_code))
  ) as latest_recorded_activity_at;

create or replace view public.operator_impact_totals as
with networks(network) as (
  values ('mainnet'::text), ('testnet'::text), ('testnet-staging'::text)
), valid_invites as (
  select i.* from public.invitations i
  join public.eligibility_check_events e
    on e.id=i.eligibility_check_id and e.invite_code=i.invite_code
   and e.wallet_address=i.invitee_wallet and e.network=i.activation_network
   and e.outcome='ELIGIBLE' and e.checked_block<=i.activation_block
  where i.invitee_wallet is not null and i.activation_network is not null
    and not public.is_analytics_excluded_wallet(i.inviter_wallet)
    and not public.is_analytics_excluded_wallet(i.invitee_wallet)
), inv as (
  select activation_network as network,
    count(distinct invitee_wallet) as total_wallets_onboarded,
    count(*) filter (where status='COMPLETED' and sybil_status='CLEAR' and vote_completed=true and vote_completed_at is not null and impact_sync_complete_at is not null) as total_successful_referrals_completed
  from valid_invites group by activation_network
), imp as (
  select e.network,
    count(distinct e.wallet_address) as total_wallets_with_verified_impact,
    count(distinct e.tx_id) as total_verified_onboarding_transactions,
    count(distinct e.tx_id) filter (where e.event_type='DAPP_REWARD') as total_verified_dapp_reward_transactions,
    count(*) filter (where e.event_type='DAPP_REWARD') as total_verified_dapp_reward_events,
    count(distinct e.tx_id) filter (where e.event_type='ALLOCATION_VOTE') as total_governance_vote_transactions
  from public.invite_impact_events e
  join valid_invites i on i.invite_code=e.invite_code and i.activation_network=e.network
  where not public.is_analytics_excluded_wallet(e.wallet_address)
  group by e.network
), pay as (
  select rr.network, count(*) as total_paid_referral_rewards,
    count(distinct rp.recipient_wallet) as total_rewarded_wallets,
    coalesce(sum(rp.amount_wei),0::numeric) as total_b3tr_distributed_wei
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id=rp.round_id
  where rp.status='PAID' and rp.paid_at is not null
    and not public.is_analytics_excluded_wallet(rp.recipient_wallet)
    and not public.is_analytics_excluded_invite_code(rp.invite_code)
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
from networks n left join inv using(network) left join imp using(network) left join pay using(network)
order by n.network;

create or replace function public.get_public_lifetime_leaderboard(
  p_network text, p_wallet text default null, p_limit integer default 5
)
returns table(rank_position bigint, wallet_address text, completed_referrals bigint, total_reward_wei text, is_current_wallet boolean)
language sql stable security invoker set search_path = public
as $$
  with parameters as (
    select lower(btrim(p_network)) as network,
      lower(nullif(btrim(coalesce(p_wallet,'')),'')) as current_wallet,
      greatest(1,least(coalesce(p_limit,5),100)) as entry_limit
  ), reward_totals as (
    select lower(btrim(r.recipient_wallet)) as wallet_address,
      count(distinct r.invite_code)::bigint as completed_referrals,
      sum(r.amount_wei)::numeric as total_reward_wei
    from public.reward_receipts r cross join parameters p
    where lower(btrim(r.network))=p.network
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
    group by lower(btrim(r.recipient_wallet))
  ), ranked as (
    select row_number() over(order by t.completed_referrals desc,t.total_reward_wei desc,t.wallet_address)::bigint as rank_position,
      t.wallet_address,t.completed_referrals,t.total_reward_wei from reward_totals t
  )
  select r.rank_position,r.wallet_address,r.completed_referrals,r.total_reward_wei::text,
    r.wallet_address=p.current_wallet as is_current_wallet
  from ranked r cross join parameters p
  where r.rank_position<=p.entry_limit or r.wallet_address=p.current_wallet
  order by r.rank_position;
$$;
revoke all on function public.get_public_lifetime_leaderboard(text,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.get_public_lifetime_leaderboard(text,text,integer) to service_role;

commit;
