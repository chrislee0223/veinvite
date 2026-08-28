begin;

-- Freeze each funded cohort at the latest recorded VeBetterDAO allocation
-- claim. Referrals that become eligible after that claim remain queued for the
-- next allocation instead of being retroactively paid from an earlier round.
create or replace function public.prepare_reward_round(
  p_network text,
  p_app_id text,
  p_pool_balance_wei numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_veinvite_app_id constant text :=
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e';
  v_candidate_codes text[] := array[]::text[];
  v_eligible_count integer := 0;
  v_reserved_existing numeric(78,0) := 0;
  v_available_to_reserve numeric(78,0) := 0;
  v_per_reward numeric(78,0) := 0;
  v_remainder numeric(78,0) := 0;
  v_round_id bigint;
  v_payout_count integer := 0;
  v_assigned_count integer := 0;
  v_now timestamptz := now();
  v_allocation_cutoff timestamptz;
begin
  p_network := lower(btrim(p_network));
  p_app_id := lower(btrim(p_app_id));

  if p_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;

  if p_app_id is null or p_app_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'app_id must be a 32-byte hex value';
  end if;

  if p_app_id <> v_veinvite_app_id then
    raise exception 'reward queue can only prepare the VeInvite app allocation';
  end if;

  select max(a.claim_block_timestamp)
  into v_allocation_cutoff
  from public.vebetter_round_allocations a
  where a.network = p_network
    and a.app_id = p_app_id;

  if v_allocation_cutoff is null then
    raise exception 'Reward round preparation requires recorded VeBetter allocation evidence';
  end if;

  if p_pool_balance_wei is null
     or p_pool_balance_wei <= 0
     or p_pool_balance_wei <> trunc(p_pool_balance_wei) then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_reward_round_' || p_network || '_' || p_app_id,
      0
    )
  );

  select coalesce(sum(rp.amount_wei), 0)
  into v_reserved_existing
  from public.reward_payouts rp
  join public.reward_rounds rr
    on rr.id = rp.round_id
  where rp.status in ('PENDING','SENDING','FAILED')
    and rr.network = p_network
    and rr.app_id = p_app_id;

  v_available_to_reserve := greatest(
    p_pool_balance_wei - v_reserved_existing,
    0
  );

  if v_available_to_reserve <= 0 then
    return null;
  end if;

  select coalesce(
    array_agg(c.invite_code order by c.eligible_at, c.invite_code),
    array[]::text[]
  )
  into v_candidate_codes
  from (
    select
      q.invite_code,
      q.eligible_at
    from public.reward_queue_entries q
    join public.invitations i
      on i.invite_code = q.invite_code
    join public.eligibility_check_events e
      on e.id = q.eligibility_check_id
     and e.id = i.eligibility_check_id
     and e.invite_code = i.invite_code
    where q.network = p_network
      and q.status = 'QUEUED'
      and q.assigned_round_id is null
      and q.eligible_at < v_allocation_cutoff
      and i.status = 'COMPLETED'
      and i.reward_status = 'ELIGIBLE'
      and i.reward_eligible_at is not null
      and q.eligible_at = i.reward_eligible_at
      and i.sybil_status = 'CLEAR'
      and i.sybil_checked_at is not null
      and i.activation_network = p_network
      and i.activation_block is not null
      and i.invitee_wallet is not null
      and i.inviter_wallet is not null
      and q.recipient_wallet = lower(i.inviter_wallet)
      and e.wallet_address = lower(i.invitee_wallet)
      and e.network = p_network
      and e.outcome = 'ELIGIBLE'
      and e.entry_class in ('NEW','RETURNING')
      and e.entry_class = q.entry_class
      and e.checked_block <= i.activation_block
      and i.impact_sync_complete_at is not null
      and i.apps_completed >= 3
      and i.apps_completed_at is not null
      and i.apps_completed_block is not null
      and i.vot3_converted = true
      and i.vot3_converted_at is not null
      and i.vot3_converted_block is not null
      and i.vot3_conversion_tx_id is not null
      and i.vot3_conversion_amount_wei is not null
      and i.vote_completed = true
      and i.vote_completed_at is not null
      and i.vote_completed_block is not null
      and i.vote_round_id is not null
      and i.sybil_checked_at >= i.vote_completed_at
      and (
        select count(distinct d.app_id)
        from public.invite_impact_events d
        where d.invite_code = i.invite_code
          and d.network = p_network
          and d.wallet_address = lower(i.invitee_wallet)
          and d.event_type = 'DAPP_REWARD'
          and d.block_number >= i.activation_block
          and d.block_number <= i.apps_completed_block
      ) >= 3
      and exists (
        select 1
        from public.invite_impact_events c
        where c.invite_code = i.invite_code
          and c.network = p_network
          and c.wallet_address = lower(i.invitee_wallet)
          and c.event_type = 'VOT3_CONVERSION'
          and c.tx_id = i.vot3_conversion_tx_id
          and c.block_number = i.vot3_converted_block
          and c.block_timestamp = i.vot3_converted_at
          and c.amount_wei = i.vot3_conversion_amount_wei
          and c.amount_wei ~ '^[0-9]+$'
          and c.amount_wei::numeric >= 1000000000000000000
          and c.tx_index is not null
          and c.clause_index is not null
          and exists (
            select 1
            from public.invite_impact_events d
            where d.invite_code = i.invite_code
              and d.network = p_network
              and d.wallet_address = lower(i.invitee_wallet)
              and d.event_type = 'DAPP_REWARD'
              and d.block_number >= i.activation_block
              and d.tx_index is not null
              and d.clause_index is not null
              and (
                d.block_number < c.block_number
                or (
                  d.block_number = c.block_number
                  and (
                    d.tx_index < c.tx_index
                    or (
                      d.tx_index = c.tx_index
                      and d.clause_index < c.clause_index
                    )
                  )
                )
              )
          )
          and exists (
            select 1
            from public.invite_impact_events v
            where v.invite_code = i.invite_code
              and v.network = p_network
              and v.wallet_address = lower(i.invitee_wallet)
              and v.event_type = 'ALLOCATION_VOTE'
              and v.block_number = i.vote_completed_block
              and v.block_timestamp = i.vote_completed_at
              and v.vote_round_id = i.vote_round_id
              and v.tx_index is not null
              and v.clause_index is not null
              and (
                c.block_number < v.block_number
                or (
                  c.block_number = v.block_number
                  and (
                    c.tx_index < v.tx_index
                    or (
                      c.tx_index = v.tx_index
                      and c.clause_index < v.clause_index
                    )
                  )
                )
              )
          )
      )
      and not exists (
        select 1
        from public.reward_payouts rp
        where rp.invite_code = q.invite_code
      )
    order by q.eligible_at, q.invite_code
    for update of q, i
  ) c;

  v_eligible_count := coalesce(cardinality(v_candidate_codes), 0);

  if v_eligible_count = 0 then
    return null;
  end if;

  v_per_reward := floor(
    v_available_to_reserve / v_eligible_count
  );

  if v_per_reward < 1 then
    return null;
  end if;

  v_remainder :=
    v_available_to_reserve -
    (v_per_reward * v_eligible_count);

  insert into public.reward_rounds(
    network,
    app_id,
    status,
    observed_pool_balance_wei,
    reserved_before_round_wei,
    distributable_wei,
    eligible_count,
    per_reward_wei,
    remainder_wei
  ) values (
    p_network,
    p_app_id,
    'CREATED',
    p_pool_balance_wei,
    v_reserved_existing,
    v_per_reward * v_eligible_count,
    v_eligible_count,
    v_per_reward,
    v_remainder
  )
  returning id into v_round_id;

  insert into public.reward_payouts(
    round_id,
    invite_code,
    recipient_wallet,
    amount_wei,
    status
  )
  select
    v_round_id,
    q.invite_code,
    q.recipient_wallet,
    v_per_reward,
    'PENDING'
  from public.reward_queue_entries q
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
  order by q.eligible_at, q.invite_code;

  get diagnostics v_payout_count = row_count;

  if v_payout_count <> v_eligible_count then
    raise exception
      'reward payout reservation count % does not match candidate count %',
      v_payout_count,
      v_eligible_count;
  end if;

  update public.reward_queue_entries q
  set
    status = 'ASSIGNED',
    assigned_round_id = v_round_id,
    assigned_at = v_now
  where q.invite_code = any(v_candidate_codes)
    and q.status = 'QUEUED'
    and q.assigned_round_id is null;

  get diagnostics v_assigned_count = row_count;

  if v_assigned_count <> v_eligible_count then
    raise exception
      'reward queue assignment count % does not match candidate count %',
      v_assigned_count,
      v_eligible_count;
  end if;

  return v_round_id;
end;
$$;

-- The allocation-bound wrapper is the only callable round-preparation entry
-- point. Keep the lower-level helper inaccessible even to the service role.
revoke all on function public.prepare_reward_round(text, text, numeric)
  from public, anon, authenticated, service_role;

-- A finalized settlement must correspond to the exact transaction ID that the
-- operator previously registered for this immutable manifest. This enforces
-- the audit sequence: manifest -> checkpoint -> tx registration -> finalized
-- chain verification -> settlement.
create or replace function public.require_registered_reward_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.reward_payout_transaction_submissions s
    join public.reward_payout_manifests m
      on m.id = s.manifest_id
    where s.manifest_id = new.manifest_id
      and s.round_id = new.round_id
      and s.network = new.network
      and s.manifest_hash = new.manifest_hash
      and s.tx_id = new.tx_id
      and s.operator_wallet = new.tx_origin
      and m.id = new.manifest_id
      and m.round_id = new.round_id
      and m.network = new.network
      and m.manifest_hash = new.manifest_hash
      and m.operator_wallet = new.tx_origin
  ) then
    raise exception 'Registered payout transaction submission is required before finalization';
  end if;

  return new;
end;
$$;

revoke all on function public.require_registered_reward_submission()
  from public, anon, authenticated, service_role;

drop trigger if exists reward_settlements_require_submission
  on public.reward_payout_transaction_settlements;
create trigger reward_settlements_require_submission
before insert on public.reward_payout_transaction_settlements
for each row execute function public.require_registered_reward_submission();

-- Remove an earlier duplicate implementation if present. The stronger guard
-- above also validates the immutable manifest identity.
drop trigger if exists reward_payout_settlement_requires_registered_submission
  on public.reward_payout_transaction_settlements;
drop function if exists public.require_registered_reward_submission_before_settlement();

-- Manifest v2 commits a deterministic, privacy-preserving referral-onboarding
-- reason into each distributeReward proof. Existing v1 financial plans must
-- never be silently reinterpreted as v2.
do $$
begin
  if exists (
    select 1
    from public.reward_payout_manifests m
    where m.manifest_version <> 'veinvite-payout-manifest-v2'
  ) then
    raise exception 'MANIFEST_V2_MIGRATION_REQUIRES_EMPTY_OR_V2_ONLY_TABLE';
  end if;
end;
$$;

alter table public.reward_payout_manifests
  alter column manifest_version
  set default 'veinvite-payout-manifest-v2';

alter table public.reward_payout_manifests
  drop constraint if exists reward_payout_manifests_version_check;
alter table public.reward_payout_manifests
  add constraint reward_payout_manifests_version_check
  check (manifest_version = 'veinvite-payout-manifest-v2');

-- Preserve the original report implementation as an inaccessible internal
-- helper, then layer stricter completion and current Sybil semantics on top.
do $$
begin
  if to_regprocedure(
    'public.get_veinvite_vebetter_round_report_v1_internal(text,text,bigint)'
  ) is null then
    alter function public.get_veinvite_vebetter_round_report(text, text, bigint)
      rename to get_veinvite_vebetter_round_report_v1_internal;
  end if;
end;
$$;

revoke all on function public.get_veinvite_vebetter_round_report_v1_internal(text, text, bigint)
  from public, anon, authenticated, service_role;

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
  v_report jsonb;
  v_allocation public.vebetter_round_allocations%rowtype;
  v_cfg public.operator_reporting_config%rowtype;
  v_period_start timestamptz;
  v_queued_candidates bigint := 0;
  v_sybil_blocked bigint := 0;
  v_round_status text := null;
  v_round_exists boolean := false;
  v_report_complete boolean := false;
begin
  v_report := public.get_veinvite_vebetter_round_report_v1_internal(
    v_network,
    v_app_id,
    p_vebetter_round_id
  );

  select * into v_allocation
  from public.vebetter_round_allocations a
  where a.network = v_network
    and a.app_id = v_app_id
    and a.vebetter_round_id = p_vebetter_round_id;

  if not found then
    raise exception 'VEBETTER_ALLOCATION_NOT_FOUND';
  end if;

  select * into v_cfg
  from public.operator_reporting_config c
  where c.id = 1;

  if not found
     or v_cfg.reporting_start_at is null
     or v_cfg.reporting_network <> v_network then
    raise exception 'REPORTING_BASELINE_REQUIRED';
  end if;

  v_period_start := (v_report->>'periodStart')::timestamptz;

  select count(*)
  into v_queued_candidates
  from public.reward_queue_entries q
  where q.network = v_network
    and q.status = 'QUEUED'
    and q.assigned_round_id is null
    and q.eligible_at >= v_cfg.reporting_start_at
    and q.eligible_at < v_allocation.claim_block_timestamp;

  -- Count only wallets whose final/current decision remains BLOCKED. A prior
  -- BLOCKED review later cleared by the operator must not inflate public data.
  select count(distinct i.invite_code)
  into v_sybil_blocked
  from public.invitations i
  where i.activation_network = v_network
    and i.sybil_status = 'BLOCKED'
    and i.sybil_checked_at is not null
    and i.sybil_checked_at >= v_period_start
    and i.sybil_checked_at < v_allocation.claim_block_timestamp;

  select rr.status
  into v_round_status
  from public.reward_rounds rr
  where rr.network = v_network
    and rr.app_id = v_app_id
    and rr.vebetter_round_id = p_vebetter_round_id
  order by rr.id desc
  limit 1;

  v_round_exists := found;

  if v_allocation.rewards_allocation_amount_wei = 0 then
    v_report_complete := true;
  elsif v_round_exists then
    v_report_complete := v_round_status = 'COMPLETED';
  else
    v_report_complete := v_queued_candidates = 0;
  end if;

  v_report := jsonb_set(
    v_report,
    '{participation,sybilBlocked}',
    to_jsonb(v_sybil_blocked),
    false
  );
  v_report := jsonb_set(
    v_report,
    '{reportComplete}',
    to_jsonb(v_report_complete),
    false
  );

  return v_report || jsonb_build_object(
    'reportVersion', 'veinvite-vebetter-round-report-v2',
    'queuedCandidatesAwaitingReward', v_queued_candidates
  );
end;
$$;

revoke all on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.get_veinvite_vebetter_round_report(text, text, bigint)
  to service_role;

commit;
