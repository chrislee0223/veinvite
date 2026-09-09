-- Keep new 16-character referral keys compatible with every server-side guard
-- while preserving all legacy 22-64 character keys. This migration changes
-- validation only; it does not rewrite, rotate, or delete any referral row.

alter table public.referral_links
  drop constraint if exists referral_links_key_check;

alter table public.referral_links
  add constraint referral_links_key_check
  check (referral_key ~ '^([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$');

create or replace function public.ensure_active_referral_link(
  p_inviter_wallet text,
  p_referral_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_key text := btrim(p_referral_key);
  v_existing public.referral_links%rowtype;
  v_inserted public.referral_links%rowtype;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_INVITER_WALLET';
  end if;

  if v_key !~ '^([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$' then
    raise exception 'INVALID_REFERRAL_KEY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_referral_link_ensure_' || v_wallet,
      0
    )
  );

  select *
  into v_existing
  from public.referral_links r
  where lower(r.inviter_wallet) = v_wallet
    and r.status = 'ACTIVE'
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'referralKey', v_existing.referral_key,
      'createdAt', v_existing.created_at,
      'reason', 'ACTIVE_EXISTING'
    );
  end if;

  insert into public.referral_links(
    inviter_wallet,
    referral_key,
    status
  ) values (
    v_wallet,
    v_key,
    'ACTIVE'
  )
  on conflict do nothing
  returning * into v_inserted;

  if found then
    return jsonb_build_object(
      'created', true,
      'referralKey', v_inserted.referral_key,
      'createdAt', v_inserted.created_at,
      'reason', 'CREATED'
    );
  end if;

  select *
  into v_existing
  from public.referral_links r
  where lower(r.inviter_wallet) = v_wallet
    and r.status = 'ACTIVE'
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'referralKey', v_existing.referral_key,
      'createdAt', v_existing.created_at,
      'reason', 'ACTIVE_EXISTING'
    );
  end if;

  return jsonb_build_object(
    'created', false,
    'reason', 'KEY_COLLISION'
  );
end;
$$;

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
set search_path to 'pg_catalog', 'public'
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
  if v_key !~ '^([A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})$' then
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
