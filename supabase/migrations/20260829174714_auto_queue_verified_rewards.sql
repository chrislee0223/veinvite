-- Restore VeInvite's automatic inviter reward queue behavior.
--
-- Once a referral has completed every verified requirement and becomes reward
-- eligible, the inviter enters the next funded reward queue automatically. The
-- claim evidence columns are retained for backward-compatible immutable queue
-- evidence, but no user click is required for new eligible referrals.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
    raise exception 'reward queue evidence for % is immutable', old.invite_code;
  end if;

  if old.status = 'AWAITING_CLAIM' then
    if new.status not in ('AWAITING_CLAIM', 'QUEUED', 'CANCELLED') then
      raise exception 'invalid awaiting-queue transition for %', old.invite_code;
    end if;

    if new.status = 'QUEUED'
       and (
         new.claim_requested_at is null
         or new.claim_requested_by_wallet is null
         or new.claim_requested_by_wallet <> old.recipient_wallet
       ) then
      raise exception 'automatic queue evidence is required before queueing %', old.invite_code;
    end if;
  end if;

  if old.status = 'QUEUED'
     and new.status not in ('QUEUED', 'ASSIGNED', 'CANCELLED') then
    raise exception 'invalid reward queue transition for %', old.invite_code;
  end if;

  if old.status = 'CANCELLED'
     and new.status not in ('CANCELLED', 'AWAITING_CLAIM', 'QUEUED') then
    raise exception 'cancelled reward queue entry % can only return after fresh eligibility', old.invite_code;
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
      status,
      claim_requested_at,
      claim_requested_by_wallet
    ) values (
      new.invite_code,
      lower(new.inviter_wallet),
      new.eligibility_check_id,
      v_entry_class,
      new.activation_network,
      new.reward_eligible_at,
      'QUEUED',
      new.reward_eligible_at,
      lower(new.inviter_wallet)
    )
    on conflict (invite_code) do update
    set
      recipient_wallet = excluded.recipient_wallet,
      eligibility_check_id = excluded.eligibility_check_id,
      entry_class = excluded.entry_class,
      network = excluded.network,
      eligible_at = excluded.eligible_at,
      status = case
        when public.reward_queue_entries.status in ('AWAITING_CLAIM', 'CANCELLED')
          then 'QUEUED'
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
        when public.reward_queue_entries.status in ('AWAITING_CLAIM', 'CANCELLED')
          then coalesce(
            public.reward_queue_entries.claim_requested_at,
            excluded.claim_requested_at
          )
        else public.reward_queue_entries.claim_requested_at
      end,
      claim_requested_by_wallet = case
        when public.reward_queue_entries.status in ('AWAITING_CLAIM', 'CANCELLED')
          then coalesce(
            public.reward_queue_entries.claim_requested_by_wallet,
            excluded.claim_requested_by_wallet
          )
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

-- Advance any legacy verified entries that were waiting for a manual claim.
-- This was a no-op on Production when applied because the reward queue was
-- empty, but keeps migration replay behavior deterministic.
update public.reward_queue_entries q
set
  status = 'QUEUED',
  claim_requested_at = coalesce(q.claim_requested_at, q.eligible_at, q.queued_at, now()),
  claim_requested_by_wallet = coalesce(q.claim_requested_by_wallet, q.recipient_wallet),
  updated_at = now()
from public.invitations i
where q.invite_code = i.invite_code
  and q.status = 'AWAITING_CLAIM'
  and q.assigned_round_id is null
  and i.status = 'COMPLETED'
  and i.reward_status = 'ELIGIBLE'
  and i.reward_eligible_at is not null
  and i.sybil_status = 'CLEAR'
  and lower(i.inviter_wallet) = q.recipient_wallet;

commit;
