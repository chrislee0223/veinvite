-- Make the durable reward queue the single source for reward-round preparation.
-- This migration only reserves accounting records. It does not transfer B3TR.

begin;

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

revoke all on function public.prepare_reward_round(text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.prepare_reward_round(text, text, numeric)
  to service_role;

create or replace function public.enforce_reward_queue_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'ASSIGNED' then
    if new.status is distinct from old.status
       or new.assigned_round_id is distinct from old.assigned_round_id
       or new.assigned_at is distinct from old.assigned_at
       or new.invite_code is distinct from old.invite_code
       or new.recipient_wallet is distinct from old.recipient_wallet
       or new.eligibility_check_id is distinct from old.eligibility_check_id
       or new.entry_class is distinct from old.entry_class
       or new.network is distinct from old.network
       or new.eligible_at is distinct from old.eligible_at
       or new.queued_at is distinct from old.queued_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.cancel_reason is distinct from old.cancel_reason then
      raise exception 'assigned reward queue entry % is immutable', old.invite_code;
    end if;

    return new;
  end if;

  if old.status = 'QUEUED'
     and new.status not in ('QUEUED','ASSIGNED','CANCELLED') then
    raise exception 'invalid reward queue transition for %', old.invite_code;
  end if;

  if old.status = 'CANCELLED'
     and new.status not in ('CANCELLED','QUEUED') then
    raise exception 'cancelled reward queue entry % can only be re-queued', old.invite_code;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_reward_queue_transition()
  from public, anon, authenticated;

drop trigger if exists reward_queue_entries_transition_guard
  on public.reward_queue_entries;
create trigger reward_queue_entries_transition_guard
before update on public.reward_queue_entries
for each row execute function public.enforce_reward_queue_transition();

create or replace function public.enforce_reward_payout_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.round_id is distinct from old.round_id
     or new.invite_code is distinct from old.invite_code
     or new.recipient_wallet is distinct from old.recipient_wallet
     or new.amount_wei is distinct from old.amount_wei
     or new.created_at is distinct from old.created_at then
    raise exception 'reward payout financial identity is immutable for invite %', old.invite_code;
  end if;

  if old.status = 'PAID' then
    if new.status is distinct from old.status
       or new.tx_id is distinct from old.tx_id
       or new.paid_at is distinct from old.paid_at
       or new.attempt_count is distinct from old.attempt_count
       or new.error_message is distinct from old.error_message then
      raise exception 'paid reward payout is immutable for invite %', old.invite_code;
    end if;

    return new;
  end if;

  if old.status = 'PENDING'
     and new.status not in ('PENDING','SENDING','FAILED') then
    raise exception 'invalid payout transition from PENDING for invite %', old.invite_code;
  end if;

  if old.status = 'SENDING'
     and new.status not in ('SENDING','PAID','FAILED') then
    raise exception 'invalid payout transition from SENDING for invite %', old.invite_code;
  end if;

  if old.status = 'FAILED'
     and new.status not in ('FAILED','SENDING') then
    raise exception 'invalid payout transition from FAILED for invite %', old.invite_code;
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'reward payout attempt_count cannot decrease for invite %', old.invite_code;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_reward_payout_immutability()
  from public, anon, authenticated;

drop trigger if exists reward_payouts_immutability_guard
  on public.reward_payouts;
create trigger reward_payouts_immutability_guard
before update on public.reward_payouts
for each row execute function public.enforce_reward_payout_immutability();

alter table public.reward_payouts
  drop constraint if exists reward_payouts_attempt_count_check,
  add constraint reward_payouts_attempt_count_check
    check (attempt_count >= 0);

commit;
