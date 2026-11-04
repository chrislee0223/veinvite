-- PROPOSAL / NOT AN APPLIED MIGRATION.
-- Sandbox-only Claim request journal. Mainnet, public and service-role access
-- are denied. A request does NOT perform transfers, sign, or release money.
-- Real request authentication must be enforced at the API boundary before
-- a future production RPC is considered.
begin;

create table reward_unified_v3.claim_requests (
  id bigint generated always as identity primary key,
  entitlement_id bigint not null,
  network text not null,
  invite_code text not null,
  recipient_wallet text not null,
  request_reference text not null,
  requested_at timestamptz not null default clock_timestamp(),
  constraint unified_claim_entitlement_fk
    foreign key (entitlement_id,network)
    references reward_unified_v3.entitlements(id,network)
    on delete restrict,
  constraint unified_claim_network check (network='testnet'),
  constraint unified_claim_wallet check
    (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint unified_claim_reference check (length(btrim(request_reference))>0),
  unique (network,invite_code),
  unique (entitlement_id)
);

create trigger unified_claim_immutable
before update or delete on reward_unified_v3.claim_requests
for each row execute function reward_unified_v3.reject_mutation();

alter table reward_unified_v3.claim_requests enable row level security;
revoke all on reward_unified_v3.claim_requests
  from public,anon,authenticated,service_role;
revoke all on sequence reward_unified_v3.claim_requests_id_seq
  from public,anon,authenticated,service_role;

create or replace function reward_unified_v3.sandbox_request_claim_v1(
  p_network text,p_invite_code text,p_authenticated_wallet text,
  p_server_request_reference text
) returns jsonb
language plpgsql
set search_path=pg_catalog,public,reward_unified_v3
as $fn$
declare
  v_network text:=lower(btrim(coalesce(p_network,'')));
  v_code text:=upper(btrim(coalesce(p_invite_code,'')));
  v_wallet text:=lower(btrim(coalesce(p_authenticated_wallet,'')));
  v_ref text:=btrim(coalesce(p_server_request_reference,''));
  v_ent reward_unified_v3.entitlements%rowtype;
  v_inserted_id bigint;
  v_existing reward_unified_v3.claim_requests%rowtype;
begin
  if v_network<>'testnet' then
    raise exception 'UNIFIED_V3_SANDBOX_TESTNET_ONLY';
  end if;
  if v_code !~ '^[A-HJ-NP-Z2-9]{7}$' or
     v_wallet !~ '^0x[0-9a-f]{40}$' or length(v_ref)<8 then
    raise exception 'UNIFIED_V3_CLAIM_INVALID_INPUT';
  end if;

  -- Keep the original reservation->signer ordering and protect requests from
  -- concurrent base event writes / Sybil changes until transaction commit.
  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_reward_reservation_'||v_network,0)
  );
  select * into v_ent
  from reward_unified_v3.entitlements e
  where e.network=v_network and e.invite_code=v_code
  for update;
  if not found then raise exception 'UNIFIED_V3_CLAIM_NOT_SETTLED'; end if;
  if v_wallet<>v_ent.recipient_wallet then
    raise exception 'UNIFIED_V3_CLAIM_WRONG_WALLET';
  end if;
  if not public.reward_x_promotion_security_clear_v1(v_code,v_network) then
    raise exception 'UNIFIED_V3_CLAIM_SYBIL_NOT_CLEAR';
  end if;
  if exists (
    select 1 from public.reward_queue_entries q
    where q.invite_code=v_code
  ) or exists (
    select 1 from public.reward_payouts p
    where p.invite_code=v_code
  ) then raise exception 'UNIFIED_V3_CLAIM_LEGACY_COLLISION'; end if;

  select * into v_existing from reward_unified_v3.claim_requests c
  where c.entitlement_id=v_ent.id;
  if found then
    return jsonb_build_object(
      'sandboxOnly',true,'accepted',true,'idempotent',true,
      'claimRequestId',v_existing.id,
      'entitlementId',v_ent.id,
      'baseWei',v_ent.base_reward_wei::text,
      'xHoldWei',v_ent.x_hold_wei::text
    );
  end if;

  -- An already signed/paid base transfer must not acquire a new claim.
  if exists (
    select 1 from reward_unified_v3.base_events b
    where b.entitlement_id=v_ent.id
      and b.event_type in ('PAYOUT_SIGNED','PAID')
  ) then raise exception 'UNIFIED_V3_CLAIM_ALREADY_SIGNED'; end if;

  insert into reward_unified_v3.claim_requests (
    entitlement_id,network,invite_code,recipient_wallet,request_reference
  ) values (
    v_ent.id,v_network,v_code,v_wallet,v_ref
  ) on conflict (entitlement_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    raise exception 'UNIFIED_V3_CLAIM_CONCURRENT_RECHECK_REQUIRED';
  end if;

  return jsonb_build_object(
    'sandboxOnly',true,'accepted',true,'idempotent',false,
    'claimRequestId',v_inserted_id,'entitlementId',v_ent.id,
    'baseWei',v_ent.base_reward_wei::text,
    'xHoldWei',v_ent.x_hold_wei::text
  );
end;
$fn$;

revoke all on function reward_unified_v3.sandbox_request_claim_v1(
  text,text,text,text
) from public,anon,authenticated,service_role;

commit;
