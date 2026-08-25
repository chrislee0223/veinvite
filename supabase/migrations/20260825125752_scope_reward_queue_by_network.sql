-- Keep reward candidates strictly scoped to the VeBetterDAO network where
-- their invitation and eligibility proof were verified.

begin;

alter table public.reward_queue_entries
  add column if not exists network text;

update public.reward_queue_entries q
set network = i.activation_network
from public.invitations i
where i.invite_code = q.invite_code
  and q.network is null;

alter table public.reward_queue_entries
  alter column network set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reward_queue_entries_network_check'
      and conrelid = 'public.reward_queue_entries'::regclass
  ) then
    alter table public.reward_queue_entries
      add constraint reward_queue_entries_network_check
      check (network in ('mainnet','testnet','testnet-staging'));
  end if;
end
$$;

create index if not exists reward_queue_entries_network_status_eligible_idx
  on public.reward_queue_entries(network, status, eligible_at, invite_code);

create or replace function public.validate_reward_queue_entry()
returns trigger
language plpgsql
security invoker
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
     or v_check_entry_class not in ('NEW','RETURNING')
     or v_check_entry_class <> new.entry_class then
    raise exception 'Reward queue eligibility proof does not match invitation %', new.invite_code;
  end if;

  if new.status = 'QUEUED'
     and v_reward_status <> 'ELIGIBLE' then
    raise exception 'Only reward-eligible invitations can remain queued: %', new.invite_code;
  end if;

  return new;
end;
$$;

create or replace function public.sync_reward_queue_from_invitation()
returns trigger
language plpgsql
security invoker
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

    if v_entry_class not in ('NEW','RETURNING') then
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
      'QUEUED'
    )
    on conflict (invite_code) do update
    set
      recipient_wallet = excluded.recipient_wallet,
      eligibility_check_id = excluded.eligibility_check_id,
      entry_class = excluded.entry_class,
      network = excluded.network,
      eligible_at = excluded.eligible_at,
      status = 'QUEUED',
      queued_at = case
        when public.reward_queue_entries.status = 'CANCELLED'
          then now()
        else public.reward_queue_entries.queued_at
      end,
      cancelled_at = null,
      cancel_reason = null
    where public.reward_queue_entries.status in ('QUEUED','CANCELLED')
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
      and status = 'QUEUED';
  end if;

  return new;
end;
$$;

commit;
