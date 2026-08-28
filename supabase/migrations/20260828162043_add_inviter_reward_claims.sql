-- Add an explicit inviter claim step between verified mission completion and
-- reward-round assignment. The existing allocation-bound payout, Sybil checks,
-- immutable manifest and on-chain settlement flow remain unchanged.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.reward_queue_entries
  add column if not exists claim_requested_at timestamptz,
  add column if not exists claim_requested_by_wallet text;

alter table public.reward_queue_entries
  drop constraint if exists reward_queue_entries_status_check,
  drop constraint if exists reward_queue_entries_shape_check;

alter table public.reward_queue_entries
  disable trigger reward_queue_entries_transition_guard;

-- Require an explicit claim for any legacy unassigned entry as well. Production
-- had no queued entries when this migration was reviewed; this keeps preview
-- fixtures and any concurrent safe state consistent with the new policy.
update public.reward_queue_entries
set
  status = 'AWAITING_CLAIM',
  claim_requested_at = null,
  claim_requested_by_wallet = null
where status = 'QUEUED'
  and assigned_round_id is null;

alter table public.reward_queue_entries
  add constraint reward_queue_entries_status_check
  check (
    status in (
      'AWAITING_CLAIM',
      'QUEUED',
      'ASSIGNED',
      'CANCELLED'
    )
  ),
  add constraint reward_queue_entries_claim_pair_check
  check (
    (
      claim_requested_at is null
      and claim_requested_by_wallet is null
    )
    or (
      claim_requested_at is not null
      and claim_requested_by_wallet is not null
      and claim_requested_by_wallet ~ '^0x[0-9a-f]{40}$'
      and claim_requested_by_wallet = recipient_wallet
    )
  ),
  add constraint reward_queue_entries_shape_check
  check (
    (
      status = 'AWAITING_CLAIM'
      and assigned_round_id is null
      and assigned_at is null
      and cancelled_at is null
      and cancel_reason is null
      and claim_requested_at is null
      and claim_requested_by_wallet is null
    )
    or (
      status = 'QUEUED'
      and assigned_round_id is null
      and assigned_at is null
      and cancelled_at is null
      and cancel_reason is null
      and claim_requested_at is not null
      and claim_requested_by_wallet = recipient_wallet
    )
    or (
      status = 'ASSIGNED'
      and assigned_round_id is not null
      and assigned_at is not null
      and cancelled_at is null
      and cancel_reason is null
      and claim_requested_at is not null
      and claim_requested_by_wallet = recipient_wallet
    )
    or (
      status = 'CANCELLED'
      and assigned_round_id is null
      and assigned_at is null
      and cancelled_at is not null
      and nullif(btrim(cancel_reason), '') is not null
    )
  );

create or replace function public.enforce_reward_queue_transition()
returns trigger
language plpgsql
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
       or new.cancel_reason is distinct from old.cancel_reason
       or new.claim_requested_at is distinct from old.claim_requested_at
       or new.claim_requested_by_wallet is distinct from old.claim_requested_by_wallet then
      raise exception 'assigned reward queue entry % is immutable', old.invite_code;
    end if;

    return new;
  end if;

  if old.claim_requested_at is not null
     and (
       new.claim_requested_at is distinct from old.claim_requested_at
       or new.claim_requested_by_wallet is distinct from old.claim_requested_by_wallet
     )
     and not (
       old.status = 'CANCELLED'
       and new.status = 'AWAITING_CLAIM'
       and new.claim_requested_at is null
       and new.claim_requested_by_wallet is null
     ) then
    raise exception 'reward claim request for % is immutable', old.invite_code;
  end if;

  if old.status = 'AWAITING_CLAIM' then
    if new.status not in ('AWAITING_CLAIM', 'QUEUED', 'CANCELLED') then
      raise exception 'invalid awaiting-claim transition for %', old.invite_code;
    end if;

    if new.status = 'QUEUED'
       and (
         new.claim_requested_at is null
         or new.claim_requested_by_wallet is null
         or new.claim_requested_by_wallet <> old.recipient_wallet
       ) then
      raise exception 'reward claim proof is required before queueing %', old.invite_code;
    end if;
  end if;

  if old.status = 'QUEUED'
     and new.status not in ('QUEUED', 'ASSIGNED', 'CANCELLED') then
    raise exception 'invalid reward queue transition for %', old.invite_code;
  end if;

  if old.status = 'CANCELLED'
     and new.status not in ('CANCELLED', 'AWAITING_CLAIM') then
    raise exception 'cancelled reward queue entry % can only await a fresh claim', old.invite_code;
  end if;

  return new;
end;
$$;

alter table public.reward_queue_entries
  enable trigger reward_queue_entries_transition_guard;

create or replace function public.validate_reward_queue_entry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_inviter_wallet text;
  v_invitee_wallet text;
  v_activation_network text;
  v_activation_block bigint;
  v_reward_status text;
  v_check_invite_code text;
  v_check_wallet text;
  v_check_network text;
  v_check_block bigint;
  v_check_outcome text;
  v_check_entry_class text;
begin
  select
    inviter_wallet,
    invitee_wallet,
    activation_network,
    activation_block,
    reward_status
  into
    v_inviter_wallet,
    v_invitee_wallet,
    v_activation_network,
    v_activation_block,
    v_reward_status
  from public.invitations
  where invite_code = new.invite_code;

  if not found then
    raise exception 'Reward queue invitation % does not exist', new.invite_code;
  end if;

  if lower(v_inviter_wallet) <> lower(new.recipient_wallet) then
    raise exception 'Reward queue recipient does not match inviter for %', new.invite_code;
  end if;

  if v_activation_network is null
     or new.network <> v_activation_network then
    raise exception 'Reward queue network does not match invitation %', new.invite_code;
  end if;

  select
    invite_code,
    wallet_address,
    network,
    checked_block,
    outcome,
    entry_class
  into
    v_check_invite_code,
    v_check_wallet,
    v_check_network,
    v_check_block,
    v_check_outcome,
    v_check_entry_class
  from public.eligibility_check_events
  where id = new.eligibility_check_id;

  if not found then
    raise exception 'Reward queue eligibility check % does not exist', new.eligibility_check_id;
  end if;

  if v_check_invite_code <> new.invite_code
     or v_invitee_wallet is null
     or lower(v_check_wallet) <> lower(v_invitee_wallet)
     or v_check_network <> new.network
     or v_activation_block is null
     or v_check_block > v_activation_block
     or v_check_outcome <> 'ELIGIBLE'
     or v_check_entry_class not in ('NEW', 'RETURNING')
     or v_check_entry_class <> new.entry_class then
    raise exception 'Reward queue eligibility proof does not match invitation %', new.invite_code;
  end if;

  if new.status in ('AWAITING_CLAIM', 'QUEUED')
     and v_reward_status <> 'ELIGIBLE' then
    raise exception 'Only reward-eligible invitations can await or enter the queue: %', new.invite_code;
  end if;

  return new;
end;
$$;

create or replace function public.sync_reward_queue_from_invitation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entry_class text;
  v_should_enqueue boolean := false;
  v_should_cancel boolean := false;
begin
  if new.reward_status = 'ELIGIBLE'
     and new.status = 'COMPLETED'
     and new.reward_eligible_at is not null
     and new.eligibility_check_id is not null
     and new.inviter_wallet is not null
     and new.activation_network is not null then
    if tg_op = 'INSERT' then
      v_should_enqueue := true;
    else
      v_should_enqueue :=
        old.reward_status is distinct from new.reward_status
        or old.status is distinct from new.status
        or old.reward_eligible_at is distinct from new.reward_eligible_at
        or old.eligibility_check_id is distinct from new.eligibility_check_id
        or old.inviter_wallet is distinct from new.inviter_wallet
        or old.activation_network is distinct from new.activation_network;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.reward_status = 'ELIGIBLE'
     and new.reward_status <> 'ELIGIBLE' then
    v_should_cancel := true;
  end if;

  if v_should_enqueue then
    select entry_class
    into v_entry_class
    from public.eligibility_check_events
    where id = new.eligibility_check_id
      and invite_code = new.invite_code
      and outcome = 'ELIGIBLE'
      and network = new.activation_network;

    if v_entry_class not in ('NEW', 'RETURNING') then
      raise exception 'Eligible invitation % is missing NEW/RETURNING entry proof', new.invite_code;
    end if;

    insert into public.reward_queue_entries(
      invite_code,
      recipient_wallet,
      eligibility_check_id,
      entry_class,
      network,
      eligible_at,
      status
    ) values (
      new.invite_code,
      lower(new.inviter_wallet),
      new.eligibility_check_id,
      v_entry_class,
      new.activation_network,
      new.reward_eligible_at,
      'AWAITING_CLAIM'
    )
    on conflict (invite_code) do update
    set
      recipient_wallet = excluded.recipient_wallet,
      eligibility_check_id = excluded.eligibility_check_id,
      entry_class = excluded.entry_class,
      network = excluded.network,
      eligible_at = excluded.eligible_at,
      status = case
        when public.reward_queue_entries.status = 'CANCELLED'
          then 'AWAITING_CLAIM'
        else public.reward_queue_entries.status
      end,
      queued_at = case
        when public.reward_queue_entries.status = 'CANCELLED'
          then now()
        else public.reward_queue_entries.queued_at
      end,
      cancelled_at = null,
      cancel_reason = null,
      claim_requested_at = case
        when public.reward_queue_entries.status = 'CANCELLED'
          then null
        else public.reward_queue_entries.claim_requested_at
      end,
      claim_requested_by_wallet = case
        when public.reward_queue_entries.status = 'CANCELLED'
          then null
        else public.reward_queue_entries.claim_requested_by_wallet
      end
    where public.reward_queue_entries.status in (
      'AWAITING_CLAIM',
      'QUEUED',
      'CANCELLED'
    )
      and public.reward_queue_entries.assigned_round_id is null;
  elsif v_should_cancel then
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

create or replace function public.request_reward_claim(
  p_invite_code text,
  p_recipient_wallet text
)
returns table (
  invite_code text,
  status text,
  claim_requested_at timestamptz,
  claim_requested_by_wallet text
)
language plpgsql
security invoker
set search_path = public
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

  if not found then
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
     or v_invitation.reward_status <> 'ELIGIBLE'
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

revoke all on function public.request_reward_claim(text, text)
from public, anon, authenticated;

grant execute on function public.request_reward_claim(text, text)
to service_role;

create index if not exists reward_queue_entries_claim_notice_idx
on public.reward_queue_entries (
  recipient_wallet,
  status,
  eligible_at,
  invite_code
)
where status in ('AWAITING_CLAIM', 'QUEUED', 'ASSIGNED');

commit;
