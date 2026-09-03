-- Freeze each inviter reward when a referral first becomes fully verified,
-- while keeping the actual token transfer behind an explicit user claim.
--
-- Design invariants:
-- 1. A completed referral and its reward reservation are identified by invite_code,
--    never by the reusable UI slot number.
-- 2. Once reserved_amount_wei is written it is immutable economic history.
-- 3. AWAITING_CLAIM is a real reservation and therefore reduces future pricing
--    capacity even if the inviter never opens VeInvite again.
-- 4. Claiming only changes transfer state; it never reprices the reward.
-- 5. Referrals that were already COMPLETED before this rollout are explicitly
--    snapshotted as legacy exclusions so this migration cannot create retroactive
--    reward liabilities for historical rows.

create table if not exists public.reward_reservation_legacy_exclusions (
  invite_code text primary key references public.invitations(invite_code)
    on update cascade on delete restrict,
  reason text not null,
  excluded_at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb,
  constraint reward_reservation_legacy_exclusions_reason_check
    check (nullif(btrim(reason), '') is not null)
);

insert into public.reward_reservation_legacy_exclusions(
  invite_code,
  reason,
  snapshot
)
select
  i.invite_code,
  'pre_reservation_rollout_completed',
  jsonb_build_object(
    'status', i.status,
    'reward_status', i.reward_status,
    'reward_eligible_at', i.reward_eligible_at,
    'completed_observed_at', i.updated_at
  )
from public.invitations i
where i.status = 'COMPLETED'
  and not exists (
    select 1
    from public.reward_queue_entries q
    where q.invite_code = i.invite_code
  )
on conflict (invite_code) do nothing;

alter table public.reward_queue_entries
  add column if not exists reserved_amount_wei numeric(78,0),
  add column if not exists reserved_at timestamptz,
  add column if not exists reservation_algorithm_version text,
  add column if not exists reservation_quote_snapshot_id bigint,
  add column if not exists reservation_completion_block bigint,
  add column if not exists reservation_completion_tx_index integer,
  add column if not exists reservation_completion_clause_index integer,
  add column if not exists reservation_basis jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_queue_entries_quote_snapshot_fk'
      and conrelid = 'public.reward_queue_entries'::regclass
  ) then
    alter table public.reward_queue_entries
      add constraint reward_queue_entries_quote_snapshot_fk
      foreign key (reservation_quote_snapshot_id)
      references public.reward_forecast_snapshots(id)
      on delete set null;
  end if;
end;
$$;

alter table public.reward_queue_entries
  drop constraint if exists reward_queue_entries_reserved_amount_check;
alter table public.reward_queue_entries
  add constraint reward_queue_entries_reserved_amount_check
  check (
    reserved_amount_wei is null
    or (
      reserved_amount_wei > 0
      and reserved_amount_wei = trunc(reserved_amount_wei)
    )
  );

alter table public.reward_queue_entries
  drop constraint if exists reward_queue_entries_reservation_shape_check;
alter table public.reward_queue_entries
  add constraint reward_queue_entries_reservation_shape_check
  check (
    (
      reserved_amount_wei is null
      and reserved_at is null
      and reservation_algorithm_version is null
      and reservation_completion_block is null
      and reservation_completion_tx_index is null
      and reservation_completion_clause_index is null
      and reservation_basis is null
    )
    or (
      reserved_amount_wei is not null
      and reserved_at is not null
      and nullif(btrim(reservation_algorithm_version), '') is not null
      and reservation_completion_block is not null
      and reservation_completion_block >= 0
      and reservation_completion_tx_index is not null
      and reservation_completion_tx_index >= 0
      and reservation_completion_clause_index is not null
      and reservation_completion_clause_index >= 0
      and reservation_basis is not null
      and jsonb_typeof(reservation_basis) = 'object'
    )
  );

-- Existing queue rows are intentionally tolerated as legacy rows. New claim and
-- payout paths below require a fixed reservation before they can move money.

create or replace function public.sync_reward_queue_from_invitation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_should_cancel boolean := false;
begin
  -- Reservation is deliberately NOT created by this trigger. The server first
  -- reads the live VeBetterDAO pool, then commits the quote through the serialized
  -- commit_reward_reservation RPC below. This prevents a cached public forecast
  -- from becoming payout authority.
  if tg_op = 'UPDATE'
     and old.reward_status = 'ELIGIBLE'
     and new.reward_status <> 'ELIGIBLE' then
    v_should_cancel := true;
  end if;

  if v_should_cancel then
    update public.reward_queue_entries
    set
      status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = case
        when new.status = 'CANCELLED' then 'invitation_cancelled'
        when new.sybil_status = 'BLOCKED' then 'sybil_blocked'
        when new.reward_status = 'FORFEITED' then 'reward_forfeited'
        else 'eligibility_revoked'
      end
    where invite_code = new.invite_code
      and status in ('AWAITING_CLAIM', 'QUEUED');
  end if;

  return new;
end;
$$;

create or replace function public.read_reward_reservation_candidates(
  p_network text,
  p_limit integer default 25
)
returns table(
  invite_code text,
  completion_block bigint,
  completion_tx_index integer,
  completion_clause_index integer
)
language sql
stable
set search_path to 'public'
as $$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      greatest(1, least(coalesce(p_limit, 25), 100)) as row_limit
  )
  select
    i.invite_code,
    completion.block_number::bigint,
    completion.tx_index::integer,
    completion.clause_index::integer
  from public.invitations i
  cross join parameters p
  cross join lateral (
    select
      e.block_number,
      e.tx_index,
      e.clause_index
    from public.invite_impact_events e
    where e.invite_code = i.invite_code
      and e.network = p.network
      and e.event_type in ('DAPP_REWARD', 'VOT3_CONVERSION', 'ALLOCATION_VOTE')
      and e.block_number is not null
      and e.tx_index is not null
      and e.clause_index is not null
    order by e.block_number desc, e.tx_index desc, e.clause_index desc
    limit 1
  ) completion
  where i.activation_network = p.network
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and i.sybil_status = 'CLEAR'
    and i.sybil_checked_at is not null
    and i.impact_sync_complete_at is not null
    and i.inviter_wallet is not null
    and i.invitee_wallet is not null
    and i.eligibility_check_id is not null
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = i.invite_code
    )
    and not exists (
      select 1
      from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    )
  order by
    completion.block_number,
    completion.tx_index,
    completion.clause_index,
    i.invite_code
  limit (select row_limit from parameters);
$$;

create or replace function public.commit_reward_reservation(
  p_invite_code text,
  p_network text,
  p_observed_pool_balance_wei numeric,
  p_expected_reserved_before_wei numeric,
  p_amount_wei numeric,
  p_algorithm_version text,
  p_quote_snapshot_id bigint,
  p_finalized_block bigint,
  p_basis jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_network text := lower(btrim(p_network));
  v_invitation public.invitations%rowtype;
  v_queue public.reward_queue_entries%rowtype;
  v_entry_class text;
  v_reserved numeric(78,0) := 0;
  v_legacy_payout_reserved numeric(78,0) := 0;
  v_completion_block bigint;
  v_completion_tx_index integer;
  v_completion_clause_index integer;
  v_now timestamptz := now();
begin
  if v_code is null or v_code = '' then
    raise exception 'INVITE_CODE_REQUIRED';
  end if;

  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'UNSUPPORTED_NETWORK';
  end if;

  if p_observed_pool_balance_wei is null
     or p_observed_pool_balance_wei < 0
     or p_observed_pool_balance_wei <> trunc(p_observed_pool_balance_wei) then
    raise exception 'INVALID_OBSERVED_POOL_BALANCE';
  end if;

  if p_expected_reserved_before_wei is null
     or p_expected_reserved_before_wei < 0
     or p_expected_reserved_before_wei <> trunc(p_expected_reserved_before_wei) then
    raise exception 'INVALID_EXPECTED_RESERVED';
  end if;

  if p_amount_wei is null
     or p_amount_wei <= 0
     or p_amount_wei <> trunc(p_amount_wei) then
    raise exception 'INVALID_REWARD_AMOUNT';
  end if;

  if p_finalized_block is null or p_finalized_block < 0 then
    raise exception 'INVALID_FINALIZED_BLOCK';
  end if;

  if p_algorithm_version is null
     or length(btrim(p_algorithm_version)) not between 1 and 80 then
    raise exception 'INVALID_ALGORITHM_VERSION';
  end if;

  if p_basis is null or jsonb_typeof(p_basis) <> 'object' then
    raise exception 'INVALID_RESERVATION_BASIS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_reservation_' || v_network,
      0
    )
  );

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found
     or v_invitation.activation_network <> v_network
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status <> 'ELIGIBLE'
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or v_invitation.impact_sync_complete_at is null
     or v_invitation.inviter_wallet is null
     or v_invitation.invitee_wallet is null
     or v_invitation.eligibility_check_id is null then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'NOT_ELIGIBLE'
    );
  end if;

  if exists (
    select 1
    from public.reward_reservation_legacy_exclusions x
    where x.invite_code = v_code
  ) then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'LEGACY_EXCLUDED'
    );
  end if;

  select *
  into v_queue
  from public.reward_queue_entries q
  where q.invite_code = v_code
  for update;

  if found then
    if v_queue.reserved_amount_wei is not null then
      return jsonb_build_object(
        'reserved', true,
        'reason', 'ALREADY_RESERVED',
        'inviteCode', v_queue.invite_code,
        'amountWei', v_queue.reserved_amount_wei::text,
        'reservedAt', v_queue.reserved_at,
        'status', v_queue.status
      );
    end if;

    return jsonb_build_object(
      'reserved', false,
      'reason', 'LEGACY_QUEUE_ENTRY'
    );
  end if;

  select
    e.block_number::bigint,
    e.tx_index::integer,
    e.clause_index::integer
  into
    v_completion_block,
    v_completion_tx_index,
    v_completion_clause_index
  from public.invite_impact_events e
  where e.invite_code = v_code
    and e.network = v_network
    and e.event_type in ('DAPP_REWARD', 'VOT3_CONVERSION', 'ALLOCATION_VOTE')
    and e.block_number is not null
    and e.tx_index is not null
    and e.clause_index is not null
  order by e.block_number desc, e.tx_index desc, e.clause_index desc
  limit 1;

  if v_completion_block is null
     or v_completion_tx_index is null
     or v_completion_clause_index is null then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'COMPLETION_POSITION_MISSING'
    );
  end if;

  if v_completion_block > p_finalized_block then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'AWAITING_FINALITY',
      'completionBlock', v_completion_block,
      'finalizedBlock', p_finalized_block
    );
  end if;

  select e.entry_class
  into v_entry_class
  from public.eligibility_check_events e
  where e.id = v_invitation.eligibility_check_id
    and e.invite_code = v_code
    and e.wallet_address = lower(v_invitation.invitee_wallet)
    and e.network = v_network
    and e.outcome = 'ELIGIBLE'
    and e.entry_class in ('NEW','RETURNING');

  if v_entry_class not in ('NEW','RETURNING') then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'ENTRY_PROOF_MISSING'
    );
  end if;

  -- New reservations are the single source of truth for outstanding liability.
  select coalesce(sum(q.reserved_amount_wei), 0)
  into v_reserved
  from public.reward_queue_entries q
  where q.network = v_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code = q.invite_code
        and paid.status = 'PAID'
    );

  -- Preserve accounting for any pre-rollout payout that has no fixed queue
  -- reservation. This prevents migration timing from hiding existing liability.
  select coalesce(sum(rp.amount_wei), 0)
  into v_legacy_payout_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rr.network = v_network
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_reserved := v_reserved + v_legacy_payout_reserved;

  -- The caller computed the quote from a planning snapshot immediately before
  -- entering this transaction. If another completion reserved first, force the
  -- caller to recalculate instead of silently using a stale quote.
  if v_reserved <> p_expected_reserved_before_wei then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'RECALCULATE',
      'reservedExistingWei', v_reserved::text
    );
  end if;

  if p_amount_wei > greatest(p_observed_pool_balance_wei - v_reserved, 0) then
    return jsonb_build_object(
      'reserved', false,
      'reason', 'RECALCULATE',
      'reservedExistingWei', v_reserved::text,
      'availableWei', greatest(p_observed_pool_balance_wei - v_reserved, 0)::text
    );
  end if;

  insert into public.reward_queue_entries(
    invite_code,
    recipient_wallet,
    eligibility_check_id,
    entry_class,
    network,
    eligible_at,
    status,
    claim_requested_at,
    claim_requested_by_wallet,
    reserved_amount_wei,
    reserved_at,
    reservation_algorithm_version,
    reservation_quote_snapshot_id,
    reservation_completion_block,
    reservation_completion_tx_index,
    reservation_completion_clause_index,
    reservation_basis
  ) values (
    v_code,
    lower(v_invitation.inviter_wallet),
    v_invitation.eligibility_check_id,
    v_entry_class,
    v_network,
    v_invitation.reward_eligible_at,
    'AWAITING_CLAIM',
    null,
    null,
    p_amount_wei,
    v_now,
    btrim(p_algorithm_version),
    p_quote_snapshot_id,
    v_completion_block,
    v_completion_tx_index,
    v_completion_clause_index,
    p_basis || jsonb_build_object(
      'observedPoolBalanceWei', p_observed_pool_balance_wei::text,
      'reservedBeforeWei', v_reserved::text,
      'finalizedBlock', p_finalized_block
    )
  )
  returning * into v_queue;

  return jsonb_build_object(
    'reserved', true,
    'reason', 'RESERVED',
    'inviteCode', v_queue.invite_code,
    'amountWei', v_queue.reserved_amount_wei::text,
    'reservedAt', v_queue.reserved_at,
    'status', v_queue.status,
    'completionBlock', v_queue.reservation_completion_block,
    'completionTxIndex', v_queue.reservation_completion_tx_index,
    'completionClauseIndex', v_queue.reservation_completion_clause_index
  );
end;
$$;

revoke all on function public.commit_reward_reservation(
  text,text,numeric,numeric,numeric,text,bigint,bigint,jsonb
) from public;

create or replace function public.request_reward_claim(
  p_invite_code text,
  p_recipient_wallet text
)
returns table(
  invite_code text,
  status text,
  claim_requested_at timestamptz,
  claim_requested_by_wallet text
)
language plpgsql
set search_path to 'public'
as $$
declare
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_recipient_wallet));
  v_queue public.reward_queue_entries%rowtype;
  v_invitation public.invitations%rowtype;
begin
  if v_code is null or v_code = '' then
    raise exception 'INVITE_CODE_REQUIRED';
  end if;

  if v_wallet is null or v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_RECIPIENT_WALLET';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_claim_' || v_code, 0)
  );

  select *
  into v_queue
  from public.reward_queue_entries q
  where q.invite_code = v_code
  for update;

  if not found
     or v_queue.reserved_amount_wei is null
     or v_queue.reserved_amount_wei <= 0
     or v_queue.reserved_at is null then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.recipient_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_WALLET_MISMATCH';
  end if;

  select *
  into v_invitation
  from public.invitations i
  where i.invite_code = v_code
  for update;

  if not found
     or v_invitation.status <> 'COMPLETED'
     or v_invitation.reward_status not in ('ELIGIBLE','PAID')
     or v_invitation.reward_eligible_at is null
     or v_invitation.sybil_status <> 'CLEAR'
     or v_invitation.sybil_checked_at is null
     or lower(v_invitation.inviter_wallet) <> v_wallet
     or v_queue.eligible_at <> v_invitation.reward_eligible_at then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.status = 'CANCELLED' then
    raise exception 'REWARD_CLAIM_CANCELLED';
  end if;

  if v_queue.status = 'AWAITING_CLAIM' then
    update public.reward_queue_entries q
    set
      status = 'QUEUED',
      queued_at = coalesce(q.queued_at, now()),
      claim_requested_at = now(),
      claim_requested_by_wallet = v_wallet
    where q.id = v_queue.id
    returning q.* into v_queue;
  elsif v_queue.status not in ('QUEUED', 'ASSIGNED') then
    raise exception 'REWARD_CLAIM_NOT_AVAILABLE';
  end if;

  if v_queue.claim_requested_at is null
     or v_queue.claim_requested_by_wallet <> v_wallet then
    raise exception 'REWARD_CLAIM_STATE_INVALID';
  end if;

  return query
  select
    v_queue.invite_code,
    v_queue.status,
    v_queue.claim_requested_at,
    v_queue.claim_requested_by_wallet;
end;
$$;

create or replace function public.read_predictive_reward_planning_snapshot(
  p_network text,
  p_app_id text
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_latest public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_reserved numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_queued integer := 0;
  v_vote_ready integer := 0;
  v_vot3_ready integer := 0;
  v_apps_two integer := 0;
  v_apps_one integer := 0;
  v_activated_zero integer := 0;
  v_pending_acceptance integer := 0;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_app_id <> v_veinvite_app_id then
    raise exception 'predictive reward planning only supports the VeInvite app';
  end if;

  select coalesce(sum(q.reserved_amount_wei), 0)
  into v_reserved
  from public.reward_queue_entries q
  where q.network = p_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1
      from public.reward_payouts paid
      where paid.invite_code = q.invite_code
        and paid.status = 'PAID'
    );

  select coalesce(sum(rp.amount_wei), 0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rr.network = p_network
    and rr.app_id = p_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1
      from public.reward_queue_entries q
      where q.invite_code = rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_reserved := v_reserved + v_legacy_reserved;

  -- Fully verified but not yet reserved completions belong in the prediction
  -- denominator. Once reserved they leave the pipeline and become committed
  -- liability through v_reserved instead.
  select count(*)
  into v_queued
  from public.invitations i
  where i.activation_network = p_network
    and i.status = 'COMPLETED'
    and i.reward_status = 'ELIGIBLE'
    and i.reward_eligible_at is not null
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code = i.invite_code
        and q.reserved_amount_wei is not null
    )
    and not exists (
      select 1 from public.reward_reservation_legacy_exclusions x
      where x.invite_code = i.invite_code
    );

  select count(*) into v_vote_ready
  from public.invitations i
  where i.activation_network = p_network
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null
    and i.activated_at is not null
    and i.apps_completed >= 3
    and coalesce(i.vot3_converted, false) = true
    and coalesce(i.vote_completed, false) = false;

  select count(*) into v_vot3_ready
  from public.invitations i
  where i.activation_network = p_network
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null
    and i.activated_at is not null
    and i.apps_completed >= 3
    and coalesce(i.vot3_converted, false) = false;

  select count(*) into v_apps_two
  from public.invitations i
  where i.activation_network = p_network
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null
    and i.activated_at is not null
    and i.apps_completed = 2;

  select count(*) into v_apps_one
  from public.invitations i
  where i.activation_network = p_network
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null
    and i.activated_at is not null
    and i.apps_completed = 1;

  select count(*) into v_activated_zero
  from public.invitations i
  where i.activation_network = p_network
    and i.status in ('ACTIVATING','UNDER_REVIEW')
    and i.reward_eligible_at is null
    and i.activated_at is not null
    and i.apps_completed <= 0;

  select count(*) into v_pending_acceptance
  from public.invitations i
  where i.status = 'PENDING_ACCEPTANCE'
    and i.reward_eligible_at is null;

  select * into v_latest
  from public.vebetter_round_allocations a
  where a.network = p_network
    and a.app_id = p_app_id
  order by a.vebetter_round_id desc
  limit 1;

  if found then
    select * into v_epoch
    from public.reward_budget_epochs e
    where e.allocation_receipt_id = v_latest.id;
  end if;

  return jsonb_build_object(
    'reservedExistingWei', v_reserved::text,
    'pipeline', jsonb_build_object(
      'queuedEligibleCount', v_queued,
      'voteReadyCount', v_vote_ready,
      'vot3ReadyCount', v_vot3_ready,
      'appsTwoCount', v_apps_two,
      'appsOneCount', v_apps_one,
      'activatedZeroCount', v_activated_zero,
      'pendingAcceptanceCount', v_pending_acceptance
    ),
    'latestAllocation', case
      when v_latest.id is null then null
      else jsonb_build_object(
        'id', v_latest.id,
        'veBetterRoundId', v_latest.vebetter_round_id,
        'rewardsAllocationWei', v_latest.rewards_allocation_amount_wei::text,
        'claimBlockTimestamp', v_latest.claim_block_timestamp
      )
    end,
    'activeEpoch', case
      when v_epoch.id is null then null
      else jsonb_build_object(
        'id', v_epoch.id,
        'veBetterRoundId', v_epoch.vebetter_round_id,
        'allocationRewardsWei', v_epoch.allocation_rewards_wei::text,
        'openingPoolBalanceWei', v_epoch.opening_pool_balance_wei::text,
        'openingReservedWei', v_epoch.opening_reserved_wei::text,
        'expectedCompletions', v_epoch.expected_completions,
        'stressCompletions', v_epoch.stress_completions,
        'rewardPerInviteWei', v_epoch.reward_per_invite_wei::text,
        'algorithmVersion', v_epoch.algorithm_version,
        'pipelineSnapshot', v_epoch.pipeline_snapshot,
        'createdAt', v_epoch.created_at
      )
    end
  );
end;
$$;

-- Prepare only rewards that the inviter explicitly claimed. Each payout copies
-- the immutable amount from its reservation instead of applying a round-wide
-- price. The old predictive arguments remain in the function signature so the
-- existing worker/API stays backward compatible and the epoch still records the
-- pricing model used for forecasting.
create or replace function public.prepare_predictive_reward_batch(
  p_network text,
  p_app_id text,
  p_pool_balance_wei numeric,
  p_allocation_receipt_id bigint,
  p_expected_completions integer,
  p_stress_completions integer,
  p_reward_per_invite_wei numeric,
  p_algorithm_version text,
  p_pipeline_snapshot jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_batch_limit constant integer := 25;
  v_receipt public.vebetter_round_allocations%rowtype;
  v_epoch public.reward_budget_epochs%rowtype;
  v_reserved_existing numeric(78,0) := 0;
  v_legacy_reserved numeric(78,0) := 0;
  v_candidate_codes text[] := array[]::text[];
  v_eligible_count integer := 0;
  v_round_id bigint;
  v_distributable numeric(78,0) := 0;
  v_remainder numeric(78,0) := 0;
  v_payout_count integer := 0;
  v_assigned_count integer := 0;
  v_epoch_created boolean := false;
  v_now timestamptz := now();
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));
  p_algorithm_version := btrim(p_algorithm_version);

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_app_id <> v_veinvite_app_id then
    raise exception 'predictive rewards can only target the VeInvite app';
  end if;

  if p_pool_balance_wei is null
     or p_pool_balance_wei < 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei) then
    raise exception 'pool balance must be a non-negative integer';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_predictive_reward_' || p_network || '_' || p_app_id,
      0
    )
  );

  if exists (
    select 1 from public.reward_rounds rr
    where rr.network = p_network
      and rr.app_id = p_app_id
      and rr.status in ('CREATED','PAYING')
  ) then
    raise exception 'Finish the current reward round before preparing another one';
  end if;

  select * into v_receipt
  from public.vebetter_round_allocations a
  where a.id = p_allocation_receipt_id
  for share;

  if not found
     or v_receipt.network <> p_network
     or v_receipt.app_id <> p_app_id then
    raise exception 'VeBetter allocation receipt does not match the active reward pool';
  end if;

  select coalesce(sum(q.reserved_amount_wei), 0)
  into v_reserved_existing
  from public.reward_queue_entries q
  where q.network = p_network
    and q.reserved_amount_wei is not null
    and q.status in ('AWAITING_CLAIM','QUEUED','ASSIGNED')
    and not exists (
      select 1 from public.reward_payouts paid
      where paid.invite_code = q.invite_code
        and paid.status = 'PAID'
    );

  select coalesce(sum(rp.amount_wei), 0)
  into v_legacy_reserved
  from public.reward_payouts rp
  join public.reward_rounds rr on rr.id = rp.round_id
  where rr.network = p_network
    and rr.app_id = p_app_id
    and rp.status in ('PENDING','SENDING','FAILED')
    and not exists (
      select 1 from public.reward_queue_entries q
      where q.invite_code = rp.invite_code
        and q.reserved_amount_wei is not null
    );

  v_reserved_existing := v_reserved_existing + v_legacy_reserved;

  if v_reserved_existing > p_pool_balance_wei then
    raise exception 'reserved reward liability exceeds the observed reward pool';
  end if;

  select * into v_epoch
  from public.reward_budget_epochs e
  where e.allocation_receipt_id = v_receipt.id;

  if not found then
    insert into public.reward_budget_epochs(
      network, app_id, allocation_receipt_id, vebetter_round_id,
      allocation_rewards_wei, opening_pool_balance_wei, opening_reserved_wei,
      expected_completions, stress_completions, reward_per_invite_wei,
      algorithm_version, pipeline_snapshot
    ) values (
      p_network, p_app_id, v_receipt.id, v_receipt.vebetter_round_id,
      v_receipt.rewards_allocation_amount_wei, p_pool_balance_wei,
      v_reserved_existing, greatest(p_expected_completions, 0),
      greatest(p_stress_completions, 0), greatest(p_reward_per_invite_wei, 0),
      p_algorithm_version, coalesce(p_pipeline_snapshot, '{}'::jsonb)
    ) returning * into v_epoch;
    v_epoch_created := true;
  end if;

  select coalesce(
    array_agg(c.invite_code order by c.claim_requested_at, c.invite_code),
    array[]::text[]
  )
  into v_candidate_codes
  from (
    select q.invite_code, q.claim_requested_at
    from public.reward_queue_entries q
    join public.invitations i on i.invite_code = q.invite_code
    where q.network = p_network
      and q.status = 'QUEUED'
      and q.assigned_round_id is null
      and q.claim_requested_at is not null
      and q.claim_requested_by_wallet = q.recipient_wallet
      and q.reserved_amount_wei is not null
      and q.reserved_amount_wei > 0
      and q.reserved_at is not null
      and i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and i.sybil_status = 'CLEAR'
      and lower(i.inviter_wallet) = q.recipient_wallet
      and not exists (
        select 1 from public.reward_payouts rp
        where rp.invite_code = q.invite_code
      )
    order by q.claim_requested_at, q.invite_code
    limit v_batch_limit
    for update of q, i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes), 0);

  if v_eligible_count = 0 then
    return jsonb_build_object(
      'epochId', v_epoch.id,
      'roundId', null,
      'epochCreated', v_epoch_created,
      'reason', 'NO_CLAIMED_REWARDS'
    );
  end if;

  select coalesce(sum(q.reserved_amount_wei), 0)
  into v_distributable
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes);

  if v_distributable <= 0 or v_distributable > p_pool_balance_wei then
    raise exception 'claimed reward batch exceeds the observed reward pool';
  end if;

  v_remainder := p_pool_balance_wei - v_distributable;

  insert into public.reward_rounds(
    network, app_id, status, observed_pool_balance_wei,
    reserved_before_round_wei, distributable_wei, eligible_count,
    per_reward_wei, remainder_wei, reward_budget_epoch_id
  ) values (
    p_network, p_app_id, 'CREATED', p_pool_balance_wei,
    v_reserved_existing, v_distributable, v_eligible_count,
    0, v_remainder, v_epoch.id
  ) returning id into v_round_id;

  insert into public.reward_payouts(
    round_id, invite_code, recipient_wallet, amount_wei, status
  )
  select
    v_round_id,
    q.invite_code,
    q.recipient_wallet,
    q.reserved_amount_wei,
    'PENDING'
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
  order by q.claim_requested_at, q.invite_code;

  get diagnostics v_payout_count = row_count;
  if v_payout_count <> v_eligible_count then
    raise exception 'reward payout count does not match claimed reservation count';
  end if;

  update public.reward_queue_entries q
  set status = 'ASSIGNED', assigned_round_id = v_round_id, assigned_at = v_now
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED'
    and q.assigned_round_id is null;

  get diagnostics v_assigned_count = row_count;
  if v_assigned_count <> v_eligible_count then
    raise exception 'reward queue assignment count does not match claimed reservation count';
  end if;

  return jsonb_build_object(
    'epochId', v_epoch.id,
    'roundId', v_round_id,
    'epochCreated', v_epoch_created,
    'reason', 'BATCH_PREPARED',
    'recipientCount', v_eligible_count,
    'distributableWei', v_distributable::text,
    'remainingPoolWei', v_remainder::text,
    'amountMode', 'PER_INVITATION_FIXED_RESERVATION'
  );
end;
$$;

create or replace function public.get_public_lifetime_leaderboard(
  p_network text,
  p_wallet text default null,
  p_limit integer default 5
)
returns table(
  rank_position bigint,
  wallet_address text,
  completed_referrals bigint,
  total_reward_wei text,
  is_current_wallet boolean
)
language sql
stable
set search_path to 'public'
as $$
  with parameters as (
    select
      lower(btrim(p_network)) as network,
      lower(nullif(btrim(coalesce(p_wallet,'')),'')) as current_wallet,
      greatest(1,least(coalesce(p_limit,5),100)) as entry_limit
  ), fixed_rewards as (
    select
      lower(btrim(q.recipient_wallet)) as wallet_address,
      q.invite_code,
      q.reserved_amount_wei as amount_wei
    from public.reward_queue_entries q
    cross join parameters p
    join public.invitations i on i.invite_code = q.invite_code
    where q.network = p.network
      and q.reserved_amount_wei is not null
      and q.reserved_amount_wei > 0
      and q.status <> 'CANCELLED'
      and i.status = 'COMPLETED'
      and i.reward_status in ('ELIGIBLE','PAID')
      and not public.is_analytics_excluded_wallet(q.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(q.invite_code)
  ), legacy_paid as (
    select
      lower(btrim(r.recipient_wallet)) as wallet_address,
      r.invite_code,
      r.amount_wei::numeric as amount_wei
    from public.reward_receipts r
    cross join parameters p
    where lower(btrim(r.network)) = p.network
      and not public.is_analytics_excluded_wallet(r.recipient_wallet)
      and not public.is_analytics_excluded_invite_code(r.invite_code)
      and not exists (
        select 1
        from public.reward_queue_entries q
        where q.invite_code = r.invite_code
          and q.reserved_amount_wei is not null
      )
  ), all_rewards as (
    select * from fixed_rewards
    union all
    select * from legacy_paid
  ), reward_totals as (
    select
      wallet_address,
      count(distinct invite_code)::bigint as completed_referrals,
      sum(amount_wei)::numeric as total_reward_wei
    from all_rewards
    group by wallet_address
  ), ranked as (
    select
      row_number() over(
        order by completed_referrals desc, total_reward_wei desc, wallet_address
      )::bigint as rank_position,
      wallet_address,
      completed_referrals,
      total_reward_wei
    from reward_totals
  )
  select
    r.rank_position,
    r.wallet_address,
    r.completed_referrals,
    r.total_reward_wei::text,
    r.wallet_address = p.current_wallet as is_current_wallet
  from ranked r
  cross join parameters p
  where r.rank_position <= p.entry_limit
     or r.wallet_address = p.current_wallet
  order by r.rank_position;
$$;

comment on column public.reward_queue_entries.reserved_amount_wei is
  'Immutable B3TR reward amount fixed after final referral verification. Claiming and payout must never reprice it.';
comment on column public.reward_queue_entries.reservation_basis is
  'Audit snapshot describing pool, reserve, pipeline/forecast and finalized-chain inputs used when the reward was fixed.';
comment on table public.reward_reservation_legacy_exclusions is
  'Auditable rollout guard preventing historical pre-reservation completions from receiving retroactive automatic reservations.';
