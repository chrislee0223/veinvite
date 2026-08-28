begin;

alter table public.operator_reporting_config
  add column if not exists opening_carryover_wei numeric(78,0) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operator_reporting_config_opening_carryover_check'
      and conrelid = 'public.operator_reporting_config'::regclass
  ) then
    alter table public.operator_reporting_config
      add constraint operator_reporting_config_opening_carryover_check
      check (opening_carryover_wei >= 0 and opening_carryover_wei = trunc(opening_carryover_wei));
  end if;
end;
$$;

create table if not exists public.reward_runtime_config (
  id smallint primary key,
  mainnet_funded_rewards_enabled boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  constraint reward_runtime_config_singleton_check check (id = 1)
);

insert into public.reward_runtime_config(
  id,
  mainnet_funded_rewards_enabled,
  note
) values (
  1,
  false,
  'Mainnet funded referral rewards are fail-closed until explicitly enabled by a reviewed database migration.'
)
on conflict (id) do nothing;

alter table public.reward_runtime_config enable row level security;
revoke all on table public.reward_runtime_config from public, anon, authenticated;
grant select on table public.reward_runtime_config to service_role;
revoke insert, update, delete on table public.reward_runtime_config from service_role;

create or replace function public.enforce_mainnet_funded_rewards_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
begin
  if lower(coalesce(new.network, '')) <> 'mainnet' then
    return new;
  end if;

  select c.mainnet_funded_rewards_enabled
  into v_enabled
  from public.reward_runtime_config c
  where c.id = 1;

  if coalesce(v_enabled, false) = false then
    raise exception 'Mainnet funded rewards are disabled by the VeInvite runtime safety gate';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_mainnet_funded_rewards_gate()
  from public, anon, authenticated, service_role;

drop trigger if exists reward_rounds_mainnet_funded_gate on public.reward_rounds;
create trigger reward_rounds_mainnet_funded_gate
before insert on public.reward_rounds
for each row execute function public.enforce_mainnet_funded_rewards_gate();

drop trigger if exists reward_payout_manifests_mainnet_funded_gate on public.reward_payout_manifests;
create trigger reward_payout_manifests_mainnet_funded_gate
before insert on public.reward_payout_manifests
for each row execute function public.enforce_mainnet_funded_rewards_gate();

drop trigger if exists reward_tx_submissions_mainnet_funded_gate on public.reward_payout_transaction_submissions;
create trigger reward_tx_submissions_mainnet_funded_gate
before insert on public.reward_payout_transaction_submissions
for each row execute function public.enforce_mainnet_funded_rewards_gate();

drop trigger if exists reward_tx_settlements_mainnet_funded_gate on public.reward_payout_transaction_settlements;
create trigger reward_tx_settlements_mainnet_funded_gate
before insert on public.reward_payout_transaction_settlements
for each row execute function public.enforce_mainnet_funded_rewards_gate();

create or replace function public.enforce_mainnet_reward_payout_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_network text;
  v_enabled boolean := false;
begin
  select rr.network
  into v_network
  from public.reward_rounds rr
  where rr.id = new.round_id;

  if not found then
    raise exception 'Reward payout references a missing reward round';
  end if;

  if v_network <> 'mainnet' then
    return new;
  end if;

  select c.mainnet_funded_rewards_enabled
  into v_enabled
  from public.reward_runtime_config c
  where c.id = 1;

  if coalesce(v_enabled, false) = false then
    raise exception 'Mainnet funded rewards are disabled by the VeInvite runtime safety gate';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_mainnet_reward_payout_gate()
  from public, anon, authenticated, service_role;

drop trigger if exists reward_payouts_mainnet_funded_gate on public.reward_payouts;
create trigger reward_payouts_mainnet_funded_gate
before insert on public.reward_payouts
for each row execute function public.enforce_mainnet_reward_payout_gate();

do $$
begin
  if to_regprocedure('public.enforce_invitation_execution_order()') is not null then
    execute 'revoke execute on function public.enforce_invitation_execution_order() from public, anon, authenticated, service_role';
  end if;
  if to_regprocedure('public.set_updated_at()') is not null then
    execute 'revoke execute on function public.set_updated_at() from public, anon, authenticated, service_role';
  end if;
  if to_regprocedure('public.set_invitations_updated_at()') is not null then
    execute 'revoke execute on function public.set_invitations_updated_at() from public, anon, authenticated, service_role';
  end if;
end;
$$;

create or replace function public.cleanup_wallet_auth_artifacts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wallet_auth_challenges
  where id in (
    select c.id
    from public.wallet_auth_challenges c
    where (
      c.used_at is not null
      and c.used_at < now() - interval '7 days'
    ) or (
      c.expires_at < now() - interval '7 days'
    )
    order by c.id
    limit 500
  );

  delete from public.wallet_auth_sessions
  where id in (
    select s.id
    from public.wallet_auth_sessions s
    where (
      s.revoked_at is not null
      and s.revoked_at < now() - interval '7 days'
    ) or (
      s.expires_at < now() - interval '7 days'
    )
    order by s.id
    limit 500
  );

  return new;
end;
$$;

revoke all on function public.cleanup_wallet_auth_artifacts()
  from public, anon, authenticated, service_role;

drop trigger if exists wallet_auth_challenges_housekeeping on public.wallet_auth_challenges;
create trigger wallet_auth_challenges_housekeeping
before insert on public.wallet_auth_challenges
for each statement execute function public.cleanup_wallet_auth_artifacts();

create or replace function public.get_veinvite_vebetter_round_report(
  p_network text,
  p_app_id text,
  p_vebetter_round_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_network text := lower(btrim(p_network));
  v_app_id text := lower(btrim(p_app_id));
  v_cfg public.operator_reporting_config%rowtype;
  v_allocation public.vebetter_round_allocations%rowtype;
  v_reward_round public.reward_rounds%rowtype;
  v_period_start timestamptz;
  v_period_source text;
  v_eligibility_checks bigint := 0;
  v_checked_wallets bigint := 0;
  v_new_users bigint := 0;
  v_returning_users bigint := 0;
  v_active_existing bigint := 0;
  v_completed_onboardings bigint := 0;
  v_sybil_blocked bigint := 0;
  v_paid_referrals bigint := 0;
  v_rewarded_inviters bigint := 0;
  v_new_paid bigint := 0;
  v_returning_paid bigint := 0;
  v_distributed numeric(78,0) := 0;
  v_cum_new bigint := 0;
  v_cum_returning bigint := 0;
  v_cum_completed bigint := 0;
  v_cum_paid bigint := 0;
  v_cum_rewarded bigint := 0;
  v_cum_distributed numeric(78,0) := 0;
  v_prior_allocations numeric(78,0) := 0;
  v_prior_paid numeric(78,0) := 0;
  v_ledger_opening numeric(78,0) := 0;
  v_opening numeric(78,0) := 0;
  v_closing numeric(78,0) := 0;
  v_carryover_source text := 'LEDGER';
  v_report_complete boolean := false;
  v_reward_round_id bigint := null;
  v_reward_round_status text := null;
begin
  if v_network not in ('mainnet', 'testnet', 'testnet-staging') then
    raise exception 'Invalid VeInvite reporting network';
  end if;

  if v_app_id is null or v_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'Invalid VeInvite app id';
  end if;

  if p_vebetter_round_id is null or p_vebetter_round_id < 1 then
    raise exception 'VeBetter round id must be positive';
  end if;

  select * into v_cfg
  from public.operator_reporting_config c
  where c.id = 1;

  if not found
     or v_cfg.reporting_start_at is null
     or v_cfg.reporting_network <> v_network then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  select * into v_allocation
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.vebetter_round_id = p_vebetter_round_id;

  if not found then
    raise exception 'VEBETTER_ALLOCATION_NOT_FOUND';
  end if;

  if v_allocation.claim_block_timestamp < v_cfg.reporting_start_at then
    raise exception 'ROUND_PREDATES_REPORTING_BASELINE';
  end if;

  select max(a.claim_block_timestamp)
  into v_period_start
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.vebetter_round_id < p_vebetter_round_id
    and a.claim_block_timestamp >= v_cfg.reporting_start_at
    and a.claim_block_timestamp < v_allocation.claim_block_timestamp;

  if v_period_start is null then
    v_period_start := v_cfg.reporting_start_at;
    v_period_source := 'LAUNCH_BASELINE';
  else
    v_period_source := 'PREVIOUS_ALLOCATION';
  end if;

  select
    count(*),
    count(distinct e.wallet_address),
    count(distinct e.wallet_address) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'NEW'),
    count(distinct e.wallet_address) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'RETURNING'),
    count(distinct e.wallet_address) filter (where e.entry_class = 'ACTIVE_EXISTING' or e.outcome = 'EXISTING_VEBETTER_USER')
  into v_eligibility_checks, v_checked_wallets, v_new_users, v_returning_users, v_active_existing
  from public.eligibility_check_events e
  where e.network = v_network
    and e.created_at >= v_period_start
    and e.created_at < v_allocation.claim_block_timestamp;

  select count(distinct q.invite_code)
  into v_completed_onboardings
  from public.reward_queue_entries q
  where q.network = v_network
    and q.eligible_at >= v_period_start
    and q.eligible_at < v_allocation.claim_block_timestamp;

  select count(distinct s.invite_code)
  into v_sybil_blocked
  from public.sybil_review_events s
  join public.invitations i on i.invite_code = s.invite_code
  where s.resulting_status = 'BLOCKED'
    and i.activation_network = v_network
    and s.created_at >= v_period_start
    and s.created_at < v_allocation.claim_block_timestamp;

  select * into v_reward_round
  from public.reward_rounds rr
  where rr.network = v_network
    and rr.app_id = v_app_id
    and rr.vebetter_round_id = p_vebetter_round_id
  order by rr.id desc
  limit 1;

  if found then
    v_reward_round_id := v_reward_round.id;
    v_reward_round_status := v_reward_round.status;

    select
      count(*) filter (where rp.status = 'PAID'),
      count(distinct rp.recipient_wallet) filter (where rp.status = 'PAID'),
      count(*) filter (where rp.status = 'PAID' and q.entry_class = 'NEW'),
      count(*) filter (where rp.status = 'PAID' and q.entry_class = 'RETURNING'),
      coalesce(sum(rp.amount_wei) filter (where rp.status = 'PAID'), 0)
    into v_paid_referrals, v_rewarded_inviters, v_new_paid, v_returning_paid, v_distributed
    from public.reward_payouts rp
    left join public.reward_queue_entries q on q.invite_code = rp.invite_code
    where rp.round_id = v_reward_round.id;
  end if;

  select
    count(distinct e.wallet_address) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'NEW'),
    count(distinct e.wallet_address) filter (where e.outcome = 'ELIGIBLE' and e.entry_class = 'RETURNING')
  into v_cum_new, v_cum_returning
  from public.eligibility_check_events e
  where e.network = v_network
    and e.created_at >= v_cfg.reporting_start_at
    and e.created_at < v_allocation.claim_block_timestamp;

  select count(distinct q.invite_code)
  into v_cum_completed
  from public.reward_queue_entries q
  where q.network = v_network
    and q.eligible_at >= v_cfg.reporting_start_at
    and q.eligible_at < v_allocation.claim_block_timestamp;

  select
    count(*) filter (where rp.status = 'PAID'),
    count(distinct rp.recipient_wallet) filter (where rp.status = 'PAID'),
    coalesce(sum(rp.amount_wei) filter (where rp.status = 'PAID'), 0)
  into v_cum_paid, v_cum_rewarded, v_cum_distributed
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  join public.vebetter_round_allocations a on a.id = rr.allocation_receipt_id
  where rr.network = v_network
    and rr.app_id = v_app_id
    and a.claim_block_timestamp >= v_cfg.reporting_start_at
    and a.vebetter_round_id <= p_vebetter_round_id;

  select coalesce(sum(a.rewards_allocation_amount_wei), 0)
  into v_prior_allocations
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.claim_block_timestamp >= v_cfg.reporting_start_at
    and a.claim_block_timestamp < v_allocation.claim_block_timestamp;

  select coalesce(sum(rp.amount_wei), 0)
  into v_prior_paid
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  join public.vebetter_round_allocations a on a.id = rr.allocation_receipt_id
  where rp.status = 'PAID'
    and rr.network = v_network
    and rr.app_id = v_app_id
    and a.claim_block_timestamp >= v_cfg.reporting_start_at
    and a.claim_block_timestamp < v_allocation.claim_block_timestamp;

  v_ledger_opening := v_cfg.opening_carryover_wei + v_prior_allocations - v_prior_paid;

  if v_ledger_opening < 0 then
    raise exception 'ROUND_REPORT_CARRYOVER_LEDGER_NEGATIVE';
  end if;

  if v_reward_round_id is not null and v_reward_round.opening_carryover_wei is not null then
    v_opening := v_reward_round.opening_carryover_wei;
    v_carryover_source := 'ONCHAIN_ROUND_SNAPSHOT';
  else
    v_opening := v_ledger_opening;
    v_carryover_source := 'RECORDED_ALLOCATION_LEDGER';
  end if;

  v_closing := v_opening + v_allocation.rewards_allocation_amount_wei - v_distributed;

  if v_closing < 0 then
    raise exception 'ROUND_REPORT_CLOSING_CARRYOVER_NEGATIVE';
  end if;

  v_report_complete :=
    coalesce(v_reward_round_status = 'COMPLETED', false)
    or v_allocation.rewards_allocation_amount_wei = 0
    or v_completed_onboardings = 0;

  return jsonb_build_object(
    'reportVersion', 'veinvite-vebetter-round-report-v1',
    'reportComplete', v_report_complete,
    'network', v_network,
    'appId', v_app_id,
    'veBetterRoundId', p_vebetter_round_id,
    'allocationReceiptId', v_allocation.id,
    'allocationClaimTxId', v_allocation.claim_tx_id,
    'allocationClaimedAt', v_allocation.claim_block_timestamp,
    'periodStart', v_period_start,
    'periodEnd', v_allocation.claim_block_timestamp,
    'periodSource', v_period_source,
    'funding', jsonb_build_object(
      'totalAppAllocationWei', v_allocation.total_amount_wei::text,
      'teamAllocationWei', v_allocation.team_allocation_amount_wei::text,
      'rewardPoolAllocationWei', v_allocation.rewards_allocation_amount_wei::text,
      'openingCarryoverWei', v_opening::text,
      'closingCarryoverWei', v_closing::text,
      'carryoverSource', v_carryover_source,
      'ledgerOpeningCarryoverWei', v_ledger_opening::text
    ),
    'participation', jsonb_build_object(
      'eligibilityChecks', v_eligibility_checks,
      'checkedWallets', v_checked_wallets,
      'newUsers', v_new_users,
      'returningUsers', v_returning_users,
      'eligibleUsers', v_new_users + v_returning_users,
      'activeExistingUsers', v_active_existing,
      'completedOnboardings', v_completed_onboardings,
      'sybilBlocked', v_sybil_blocked
    ),
    'rewards', jsonb_build_object(
      'rewardRoundId', v_reward_round_id,
      'rewardRoundStatus', v_reward_round_status,
      'successfulReferralsPaid', v_paid_referrals,
      'rewardedInviters', v_rewarded_inviters,
      'newUserReferralsPaid', v_new_paid,
      'returningUserReferralsPaid', v_returning_paid,
      'distributedWei', v_distributed::text
    ),
    'cumulative', jsonb_build_object(
      'newUsers', v_cum_new,
      'returningUsers', v_cum_returning,
      'eligibleUsers', v_cum_new + v_cum_returning,
      'completedOnboardings', v_cum_completed,
      'paidReferralRewards', v_cum_paid,
      'rewardedInviters', v_cum_rewarded,
      'distributedWei', v_cum_distributed::text
    )
  );
end;
$$;

revoke all on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  to service_role;

commit;
