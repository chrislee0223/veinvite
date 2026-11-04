-- PROPOSAL / NOT AN APPLIED MIGRATION.
-- Run ONLY after reward_unified_v3_shadow_ledger.sql in an isolated database.
-- This adds v3 payment states and a ledger authority, with NO legacy RPC
-- replacement, application permissions, or production activation.
--
-- Amounts are obligations, not additive funding. In particular,
-- outstanding X is part of each entitlement's total, not +10 beyond it.
begin;

create table reward_unified_v3.base_events (
  id bigint generated always as identity primary key,
  entitlement_id bigint not null,
  network text not null,
  event_type text not null,
  amount_wei numeric(78,0) not null,
  reference text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint unified_base_event_entitlement_fkey
    foreign key (entitlement_id,network)
    references reward_unified_v3.entitlements(id,network)
    on delete restrict,
  constraint unified_base_event_type
    check (event_type in ('PAYOUT_SIGNED','PAID')),
  constraint unified_base_event_amount
    check (amount_wei>0),
  constraint unified_base_event_reference
    check (length(btrim(reference))>0),
  unique (entitlement_id,event_type),
  unique (network,event_type,reference)
);

-- Verified X proof must retain the original post and submission timestamps.
-- The external X API identity check stays in the authenticated backend.
alter table reward_unified_v3.x_events
  add column x_post_created_at timestamptz,
  add column x_submitted_at timestamptz,
  add constraint unified_x_post_proof_timestamps check (
    (event_type='POST_VERIFIED' and x_post_created_at is not null
      and x_submitted_at is not null)
    or (event_type<>'POST_VERIFIED' and x_post_created_at is null
      and x_submitted_at is null)
  );

-- Exactly one event of each type; concurrent attempts cannot bypass these.
-- A payout cannot be finalized twice or signed with a different transaction.
create unique index unified_x_event_single_transition_idx
on reward_unified_v3.x_events (entitlement_id,event_type);

create or replace function reward_unified_v3.guard_base_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public, reward_unified_v3
as $fn$
declare
  v_entitlement reward_unified_v3.entitlements%rowtype;
begin
  select * into v_entitlement
  from reward_unified_v3.entitlements e
  where e.id=new.entitlement_id and e.network=new.network
  for update;
  if not found or new.amount_wei <> v_entitlement.base_reward_wei then
    raise exception 'UNIFIED_V3_BASE_AMOUNT_MISMATCH';
  end if;

  -- Every new payout signing must revalidate current Sybil and restrictions.
  -- This is a last guard; the signer must repeat immediately before send.
  if new.event_type='PAYOUT_SIGNED' then
    if not public.reward_x_promotion_security_clear_v1(
      v_entitlement.invite_code,v_entitlement.network
    ) then
      raise exception 'UNIFIED_V3_BASE_SECURITY_REJECTED';
    end if;
  elsif new.event_type='PAID' then
    if not exists (
      select 1 from reward_unified_v3.base_events b
      where b.entitlement_id=new.entitlement_id
        and b.event_type='PAYOUT_SIGNED'
    ) then
      raise exception 'UNIFIED_V3_BASE_PAID_WITHOUT_SIGNING';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger unified_base_event_guard
before insert on reward_unified_v3.base_events
for each row execute function reward_unified_v3.guard_base_event();

create trigger unified_base_event_immutable
before update or delete on reward_unified_v3.base_events
for each row execute function reward_unified_v3.reject_mutation();

create or replace function reward_unified_v3.guard_x_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public, reward_unified_v3
as $fn$
declare
  v_entitlement reward_unified_v3.entitlements%rowtype;
  v_post_verified_at timestamptz;
  v_offer_opened_at timestamptz;
  v_signed boolean;
  v_released boolean;
begin
  select * into v_entitlement
  from reward_unified_v3.entitlements e
  where e.id=new.entitlement_id and e.network=new.network
  for update;
  if not found or v_entitlement.x_hold_wei <> 10000000000000000000::numeric
      or new.amount_wei<>v_entitlement.x_hold_wei then
    raise exception 'UNIFIED_V3_X_HOLD_AMOUNT_MISMATCH';
  end if;

  select exists (
    select 1 from reward_unified_v3.x_events x
    where x.entitlement_id=new.entitlement_id
      and x.event_type='PAYOUT_SIGNED'
  ),exists (
    select 1 from reward_unified_v3.x_events x
    where x.entitlement_id=new.entitlement_id
      and x.event_type='RELEASED'
  )
  into v_signed,v_released;

  if v_released then
    raise exception 'UNIFIED_V3_X_ALREADY_RELEASED';
  end if;

  if new.event_type='RELEASED' then
    if v_signed or exists (
      select 1 from reward_unified_v3.x_events x
      where x.entitlement_id=new.entitlement_id and x.event_type='PAID'
    ) then
      raise exception 'UNIFIED_V3_X_SIGNED_CANNOT_RELEASE';
    end if;
  elsif new.event_type='OFFER_OPENED' then
    if not exists (
      select 1 from reward_unified_v3.base_events b
      where b.entitlement_id=new.entitlement_id and b.event_type='PAID'
    ) then
      raise exception 'UNIFIED_V3_X_BASE_NOT_PAID';
    end if;
  elsif new.event_type='POST_VERIFIED' then
    select x.created_at into v_offer_opened_at
    from reward_unified_v3.x_events x
    where x.entitlement_id=new.entitlement_id
      and x.event_type='OFFER_OPENED';
    if v_offer_opened_at is null then
      raise exception 'UNIFIED_V3_X_OFFER_NOT_OPENED';
    end if;
    if new.x_post_created_at < v_offer_opened_at
       or new.x_post_created_at >
          v_offer_opened_at + interval '24 hours'
       or new.x_submitted_at < new.x_post_created_at
       or new.x_submitted_at >
          v_offer_opened_at + interval '24 hours 15 minutes'
       or new.created_at < new.x_submitted_at then
      raise exception 'UNIFIED_V3_X_POST_WINDOW_INVALID';
    end if;
  elsif new.event_type='FINAL_VERIFIED' then
    select x.created_at into v_post_verified_at
    from reward_unified_v3.x_events x
    where x.entitlement_id=new.entitlement_id and x.event_type='POST_VERIFIED';
    if v_post_verified_at is null or
      clock_timestamp()<v_post_verified_at+interval '24 hours' then
      raise exception 'UNIFIED_V3_X_24H_RETENTION_NOT_PROVEN';
    end if;
  elsif new.event_type='PAYOUT_SIGNED' then
    if not exists (
      select 1 from reward_unified_v3.x_events x
      where x.entitlement_id=new.entitlement_id and x.event_type='FINAL_VERIFIED'
    ) then
      raise exception 'UNIFIED_V3_X_FINAL_PROOF_REQUIRED';
    end if;
    if not public.reward_x_promotion_security_clear_v1(
      v_entitlement.invite_code,v_entitlement.network
    ) then
      raise exception 'UNIFIED_V3_X_SECURITY_REJECTED';
    end if;
  elsif new.event_type='PAID' then
    if not v_signed then
      raise exception 'UNIFIED_V3_X_PAID_WITHOUT_SIGNING';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger unified_x_event_guard
before insert on reward_unified_v3.x_events
for each row execute function reward_unified_v3.guard_x_event();

create or replace function reward_unified_v3.read_outstanding_wei_v1(
  p_network text,p_app_id text
) returns numeric
language plpgsql
stable
set search_path = pg_catalog, reward_unified_v3
as $fn$
declare
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_app text:=lower(btrim(coalesce(p_app_id,'')));
  v_base numeric(78,0):=0;
  v_x numeric(78,0):=0;
begin
  if v_network not in ('mainnet','testnet','testnet-staging')
    or v_app !~ '^0x[0-9a-f]{64}$' then
    raise exception 'UNIFIED_V3_INVALID_LIABILITY_SCOPE';
  end if;

  select coalesce(sum(e.base_reward_wei),0),
         coalesce(sum(e.x_hold_wei) filter (
           where not exists (
             select 1 from reward_unified_v3.x_events x
             where x.entitlement_id=e.id
               and x.event_type in ('RELEASED','PAID')
           )
         ),0)
  into v_base,v_x
  from reward_unified_v3.entitlements e
  where e.network=v_network and e.app_id=v_app
    and not exists (
      select 1 from reward_unified_v3.base_events b
      where b.entitlement_id=e.id and b.event_type='PAID'
    );

  -- Include X holds after base has been paid but X has not been released.
  select v_x + coalesce(sum(e.x_hold_wei),0)
  into v_x
  from reward_unified_v3.entitlements e
  where e.network=v_network and e.app_id=v_app
    and exists (
      select 1 from reward_unified_v3.base_events b
      where b.entitlement_id=e.id and b.event_type='PAID'
    )
    and not exists (
      select 1 from reward_unified_v3.x_events x
      where x.entitlement_id=e.id and x.event_type in ('RELEASED','PAID')
    );

  return v_base + v_x;
end;
$fn$;

-- Private and inert until future authenticated cutover. The canonical old
-- public.read_outstanding_reward_liability RPC is intentionally UNCHANGED.
alter table reward_unified_v3.base_events enable row level security;
revoke all on table reward_unified_v3.base_events
  from public,anon,authenticated,service_role;
revoke all on sequence reward_unified_v3.base_events_id_seq
  from public,anon,authenticated,service_role;
revoke all on function reward_unified_v3.guard_base_event()
  from public,anon,authenticated,service_role;
revoke all on function reward_unified_v3.guard_x_event()
  from public,anon,authenticated,service_role;
revoke all on function reward_unified_v3.read_outstanding_wei_v1(text,text)
  from public,anon,authenticated,service_role;
commit;
