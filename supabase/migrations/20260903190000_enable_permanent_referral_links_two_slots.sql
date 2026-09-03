-- Enable VeInvite v2 permanent referral links and two simultaneous invite slots.
-- Existing /i/<code> invitations remain fully supported. A permanent /r/<key>
-- link does not create or consume an invitation until an authenticated wallet
-- passes entry eligibility and atomically claims one of the two free slots.

create table public.referral_links (
  id uuid primary key default gen_random_uuid(),
  inviter_wallet text not null,
  referral_key text not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint referral_links_inviter_wallet_check
    check (inviter_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint referral_links_key_check
    check (referral_key ~ '^[A-Za-z0-9_-]{22,64}$'),
  constraint referral_links_status_check
    check (status in ('ACTIVE','ROTATED','REVOKED'))
);

create unique index referral_links_key_unique
  on public.referral_links (referral_key);

create unique index referral_links_one_active_per_inviter
  on public.referral_links (lower(inviter_wallet))
  where status = 'ACTIVE';

create index referral_links_inviter_history_idx
  on public.referral_links (lower(inviter_wallet), created_at desc);

comment on table public.referral_links is
'Permanent shareable referral-link identities. Opening a link never consumes an invite slot; a slot is reserved only after an eligible wallet is atomically activated.';

alter table public.invitations
  add column referral_link_id uuid references public.referral_links(id);

create index invitations_referral_link_idx
  on public.invitations (referral_link_id, created_at desc)
  where referral_link_id is not null;

comment on column public.invitations.referral_link_id is
'Permanent referral link that originated this invitation. Null means a legacy one-time /i/<code> invitation.';

create table public.referral_link_attempts (
  id uuid primary key default gen_random_uuid(),
  referral_link_id uuid not null references public.referral_links(id),
  wallet_address text,
  outcome text not null,
  entry_class text,
  network text,
  checked_block bigint,
  prior_reward_tx_id text,
  prior_vote_tx_id text,
  invitation_id uuid references public.invitations(id),
  invite_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint referral_link_attempts_wallet_check
    check (wallet_address is null or wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint referral_link_attempts_outcome_check
    check (outcome in (
      'ACTIVATED',
      'ACTIVE_EXISTING',
      'ALREADY_REFERRED',
      'SELF_REFERRAL',
      'RELATIONSHIP_CYCLE',
      'SLOTS_FULL',
      'CHECK_FAILED'
    )),
  constraint referral_link_attempts_entry_class_check
    check (entry_class is null or entry_class in ('NEW','RETURNING','ACTIVE_EXISTING')),
  constraint referral_link_attempts_network_check
    check (network is null or network in ('mainnet','testnet','testnet-staging')),
  constraint referral_link_attempts_checked_block_check
    check (checked_block is null or checked_block >= 0),
  constraint referral_link_attempts_details_check
    check (jsonb_typeof(details) = 'object')
);

create index referral_link_attempts_link_created_idx
  on public.referral_link_attempts (referral_link_id, created_at desc);

create index referral_link_attempts_wallet_created_idx
  on public.referral_link_attempts (lower(wallet_address), created_at desc)
  where wallet_address is not null;

comment on table public.referral_link_attempts is
'Audit-only permanent-link attempt ledger. Ineligible or full-slot attempts never create invitations and never consume a slot.';

revoke all on table public.referral_links from public, anon, authenticated;
revoke all on table public.referral_link_attempts from public, anon, authenticated;
grant select, insert, update on table public.referral_links to service_role;
grant select, insert on table public.referral_link_attempts to service_role;

-- Turn on the already-prepared second slot. The per-slot unique index remains
-- the database race guard. BLOCKED Sybil rows keep their audit history but no
-- longer occupy a reusable concurrency slot.
drop index if exists public.invitations_one_active_per_inviter;
drop index if exists public.invitations_one_active_per_inviter_slot;

create unique index invitations_one_active_per_inviter_slot
  on public.invitations (lower(inviter_wallet), invite_slot)
  where status = 'PENDING_ACCEPTANCE'
     or (
       status in ('ACTIVATING', 'UNDER_REVIEW')
       and eligibility_check_id is not null
       and activation_network is not null
       and sybil_status <> 'BLOCKED'
     );

comment on index public.invitations_one_active_per_inviter_slot is
'Atomic two-slot concurrency guard. A blocked Sybil referral retains evidence but releases its reusable invitation slot.';

-- referral_link_id is immutable provenance just like invite_code/inviter/slot.
create or replace function public.prevent_invitation_referral_identity_mutation()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if lower(btrim(new.inviter_wallet)) is distinct from lower(btrim(old.inviter_wallet)) then
    raise exception 'inviter_wallet is immutable after invitation creation';
  end if;
  if new.invite_code is distinct from old.invite_code then
    raise exception 'invite_code is immutable after invitation creation';
  end if;
  if new.invite_slot is distinct from old.invite_slot then
    raise exception 'invite_slot is immutable after invitation creation';
  end if;
  if new.referral_link_id is distinct from old.referral_link_id then
    raise exception 'referral_link_id is immutable after invitation creation';
  end if;
  if old.invitee_wallet is not null and lower(btrim(new.invitee_wallet)) is distinct from lower(btrim(old.invitee_wallet)) then
    raise exception 'invitee_wallet is immutable after acceptance';
  end if;
  if old.activated_at is not null and new.activated_at is distinct from old.activated_at then
    raise exception 'activated_at is immutable once set';
  end if;
  if old.activation_block is not null and new.activation_block is distinct from old.activation_block then
    raise exception 'activation_block is immutable once set';
  end if;
  if old.activation_network is not null and new.activation_network is distinct from old.activation_network then
    raise exception 'activation_network is immutable once set';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_invitation_referral_identity_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists invitations_lock_referral_identity on public.invitations;
create trigger invitations_lock_referral_identity
before update of inviter_wallet, invitee_wallet, invite_code, invite_slot,
                 referral_link_id, activated_at, activation_block, activation_network
on public.invitations
for each row execute function public.prevent_invitation_referral_identity_mutation();

-- Preserve sponsor provenance for Infinity Canvas while identifying v2 links.
create or replace function public.sync_referral_relationship_from_invitation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_entry_class text;
    v_network text;
    v_rule_version text;
    v_source_kind text;
begin
    if new.invitee_wallet is null
       or new.activated_at is null
       or new.status not in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED') then
        return new;
    end if;

    select e.entry_class, e.network
      into v_entry_class, v_network
    from public.eligibility_check_events e
    where (new.eligibility_check_id is not null and e.id = new.eligibility_check_id)
       or (new.eligibility_check_id is null and e.invite_code = new.invite_code)
    order by case when new.eligibility_check_id is not null and e.id = new.eligibility_check_id then 0 else 1 end,
             e.created_at desc,
             e.id desc
    limit 1;

    v_rule_version := case
      when new.referral_link_id is not null then 'v2_permanent_referral'
      else 'v1_single_invite'
    end;
    v_source_kind := case
      when new.referral_link_id is not null then 'live_v2_permanent_link'
      else 'live_v1'
    end;

    insert into public.referral_relationships (
        parent_wallet,
        child_wallet,
        source_invitation_id,
        source_invite_code,
        relationship_effective_at,
        relationship_effective_block,
        network,
        rule_version,
        source_kind,
        slot,
        entry_class_at_activation,
        invitation_created_at,
        source_snapshot
    ) values (
        lower(btrim(new.inviter_wallet)),
        lower(btrim(new.invitee_wallet)),
        new.id,
        new.invite_code,
        new.activated_at,
        new.activation_block,
        coalesce(new.activation_network, v_network),
        v_rule_version,
        v_source_kind,
        null,
        v_entry_class,
        new.created_at,
        jsonb_build_object(
            'status_at_recording', new.status,
            'invitation_updated_at', new.updated_at,
            'activated_at', new.activated_at,
            'activation_block', new.activation_block,
            'activation_network', new.activation_network,
            'eligibility_check_id', new.eligibility_check_id,
            'resolved_network', coalesce(new.activation_network, v_network),
            'entry_class', v_entry_class,
            'invitation_slot', new.invite_slot,
            'referral_link_id', new.referral_link_id
        )
    )
    on conflict (source_invitation_id) do nothing;

    return new;
end;
$$;
revoke all on function public.sync_referral_relationship_from_invitation()
  from public, anon, authenticated;

-- Atomically allocate one of two slots and reuse the already-hardened entry
-- proof claim function. Advisory locks serialize both inviter-slot allocation
-- and cross-link attempts by the same invitee.
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

  -- Serialize wallet identity first, then inviter capacity, to keep lock order
  -- deterministic across concurrent links.
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

  -- A new sponsor edge inviter -> invitee would cycle when the inviter is
  -- already somewhere below the invitee in the immutable sponsor graph.
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

revoke all on function public.claim_permanent_referral_with_entry_proof(
  text,text,text,text,bigint,text,text,jsonb
) from public, anon, authenticated;
grant execute on function public.claim_permanent_referral_with_entry_proof(
  text,text,text,text,bigint,text,text,jsonb
) to service_role;
