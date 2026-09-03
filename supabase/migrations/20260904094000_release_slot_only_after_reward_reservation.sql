-- Keep a completed invitation's concurrency slot occupied until its fixed
-- reward reservation is durably written. This closes the small race between
-- status=COMPLETED and reward reservation creation.

alter table public.invitations
  add column if not exists slot_released_at timestamptz;

-- Historical terminal rows predate this invariant and must not suddenly occupy
-- reusable slots when the new partial unique index is installed.
update public.invitations
set slot_released_at = coalesce(slot_released_at, updated_at, now())
where status in ('COMPLETED','CANCELLED')
   or sybil_status = 'BLOCKED';

create or replace function public.release_invitation_slot_after_reward_reservation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
begin
  if new.reserved_amount_wei is not null
     and new.reserved_at is not null
     and (
       tg_op = 'INSERT'
       or old.reserved_amount_wei is null
       or old.reserved_at is null
     ) then
    update public.invitations i
    set slot_released_at = coalesce(i.slot_released_at, new.reserved_at)
    where i.invite_code = new.invite_code
      and i.status = 'COMPLETED';
  end if;

  return new;
end;
$$;

drop trigger if exists reward_queue_release_slot_after_reservation
  on public.reward_queue_entries;
create trigger reward_queue_release_slot_after_reservation
after insert or update of reserved_amount_wei, reserved_at
on public.reward_queue_entries
for each row
execute function public.release_invitation_slot_after_reward_reservation();

drop index if exists public.invitations_one_active_per_inviter_slot;
create unique index invitations_one_active_per_inviter_slot
on public.invitations(lower(inviter_wallet), invite_slot)
where (
  status = 'PENDING_ACCEPTANCE'
  or (
    status in ('ACTIVATING','UNDER_REVIEW')
    and eligibility_check_id is not null
    and activation_network is not null
    and sybil_status <> 'BLOCKED'
  )
  or (
    status = 'COMPLETED'
    and eligibility_check_id is not null
    and activation_network is not null
    and sybil_status <> 'BLOCKED'
    and slot_released_at is null
  )
);

create or replace function public.claim_permanent_referral_with_entry_proof(
  p_referral_key text,
  p_invite_code text,
  p_invitee_wallet text,
  p_network text,
  p_checked_block bigint,
  p_prior_reward_tx_id text default null,
  p_prior_vote_tx_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_key text := btrim(p_referral_key);
  v_code text := upper(btrim(p_invite_code));
  v_wallet text := lower(btrim(p_invitee_wallet));
  v_network text := lower(btrim(p_network));
  v_entry_class text;
  v_link public.referral_links%rowtype;
  v_slot smallint;
  v_claim jsonb;
  v_invitation_id uuid;
begin
  if v_key !~ '^[A-Za-z0-9_-]{22,64}$' then
    raise exception 'invalid referral key';
  end if;
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' then
    raise exception 'invalid invite code';
  end if;
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid invitee wallet';
  end if;
  if v_network not in ('mainnet','testnet','testnet-staging') then
    raise exception 'unsupported network';
  end if;
  if p_checked_block is null or p_checked_block < 0 then
    raise exception 'invalid checked block';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'details must be a JSON object';
  end if;

  v_entry_class := upper(coalesce(nullif(btrim(p_details ->> 'entryClass'), ''), 'NEW'));
  if v_entry_class not in ('NEW','RETURNING') then
    raise exception 'eligible permanent referral must be NEW or RETURNING';
  end if;

  select * into v_link
  from public.referral_links
  where referral_key = v_key
    and status = 'ACTIVE'
  for update;

  if not found then
    return jsonb_build_object('result','NOT_FOUND');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('veinvite_referral_invitee_' || v_wallet, 0));
  perform pg_advisory_xact_lock(hashtextextended('veinvite_referral_inviter_' || lower(v_link.inviter_wallet), 0));

  if lower(v_link.inviter_wallet) = v_wallet then
    insert into public.referral_link_attempts(referral_link_id,wallet_address,outcome,details)
    values (v_link.id,v_wallet,'SELF_REFERRAL',p_details);
    return jsonb_build_object('result','SELF_REFERRAL');
  end if;

  if exists (
    select 1 from public.invitations i
    where lower(i.invitee_wallet) = v_wallet
  ) then
    insert into public.referral_link_attempts(referral_link_id,wallet_address,outcome,details)
    values (v_link.id,v_wallet,'ALREADY_REFERRED',p_details);
    return jsonb_build_object('result','ALREADY_REFERRED');
  end if;

  if exists (
    with recursive descendants(wallet) as (
      select lower(r.child_wallet)
      from public.referral_relationships r
      where lower(r.parent_wallet) = v_wallet
      union
      select lower(r.child_wallet)
      from public.referral_relationships r
      join descendants d on lower(r.parent_wallet) = d.wallet
    )
    select 1 from descendants
    where wallet = lower(v_link.inviter_wallet)
  ) then
    insert into public.referral_link_attempts(referral_link_id,wallet_address,outcome,details)
    values (v_link.id,v_wallet,'RELATIONSHIP_CYCLE',p_details);
    return jsonb_build_object('result','RELATIONSHIP_CYCLE');
  end if;

  select s.slot::smallint into v_slot
  from (values (1),(2)) as s(slot)
  where not exists (
    select 1
    from public.invitations i
    where lower(i.inviter_wallet) = lower(v_link.inviter_wallet)
      and i.invite_slot = s.slot
      and (
        i.status = 'PENDING_ACCEPTANCE'
        or (
          i.status in ('ACTIVATING','UNDER_REVIEW')
          and i.eligibility_check_id is not null
          and i.activation_network is not null
          and i.sybil_status <> 'BLOCKED'
        )
        or (
          i.status = 'COMPLETED'
          and i.eligibility_check_id is not null
          and i.activation_network is not null
          and i.sybil_status <> 'BLOCKED'
          and i.slot_released_at is null
        )
      )
  )
  order by s.slot
  limit 1;

  if v_slot is null then
    insert into public.referral_link_attempts(
      referral_link_id,wallet_address,outcome,entry_class,network,checked_block,
      prior_reward_tx_id,prior_vote_tx_id,details
    ) values (
      v_link.id,v_wallet,'SLOTS_FULL',v_entry_class,v_network,p_checked_block,
      p_prior_reward_tx_id,p_prior_vote_tx_id,p_details
    );
    return jsonb_build_object('result','SLOTS_FULL');
  end if;

  insert into public.invitations(
    invite_code, inviter_wallet, status, invite_slot, referral_link_id
  ) values (
    v_code, lower(v_link.inviter_wallet), 'PENDING_ACCEPTANCE', v_slot, v_link.id
  );

  v_claim := public.claim_invitation_with_entry_proof(
    v_code,
    v_wallet,
    v_network,
    p_checked_block,
    p_prior_reward_tx_id,
    p_prior_vote_tx_id,
    p_details
  );

  if coalesce(v_claim ->> 'result','') <> 'CLAIMED' then
    raise exception 'permanent referral claim failed after slot reservation: %', v_claim ->> 'result';
  end if;

  select id into v_invitation_id
  from public.invitations
  where invite_code = v_code;

  insert into public.referral_link_attempts(
    referral_link_id,wallet_address,outcome,entry_class,network,checked_block,
    prior_reward_tx_id,prior_vote_tx_id,invitation_id,invite_code,details
  ) values (
    v_link.id,v_wallet,'ACTIVATED',v_entry_class,v_network,p_checked_block,
    p_prior_reward_tx_id,p_prior_vote_tx_id,v_invitation_id,v_code,p_details
  );

  return v_claim || jsonb_build_object(
    'invite_slot', v_slot,
    'referral_link_id', v_link.id
  );
end;
$$;

comment on column public.invitations.slot_released_at is
  'Concurrency slot release timestamp. For successful referrals this is set only after the inviter reward has been durably reserved.';
