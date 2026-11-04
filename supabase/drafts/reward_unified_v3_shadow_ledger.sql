-- PROPOSAL / NOT AN APPLIED MIGRATION.
-- To be promoted to supabase/migrations ONLY after a working non-production
-- database validates this contract and round-close/Claim/X integration.
--
-- No triggers on legacy base/X tables, no public RPC, no production write.
-- Treat the existing VeInvite 80/20 split as an external invariant: only the
-- VeBetterDAO 80% user reward pool is ever entered in pool_balance_wei.
--
-- These are future immutable financial commitments, NOT a replacement for
-- existing finalization/payout audit journals. Never manually insert into
-- this ledger in production. The future commit RPC must atomically enforce
-- global payout lock, old/early admission liabilities and chain finality.

begin;

create schema if not exists reward_unified_v3;
revoke all on schema reward_unified_v3
  from public, anon, authenticated, service_role;

create table reward_unified_v3.settlements (
  id bigint generated always as identity primary key,
  network text not null,
  app_id text not null,
  veBetter_round_id bigint not null,
  cutoff_finalized_block bigint not null,
  pool_snapshot_finalized_block bigint not null,
  pool_balance_wei numeric(78,0) not null,
  existing_liability_wei numeric(78,0) not null,
  available_wei numeric(78,0) not null,
  recipient_count integer not null,
  base_total_wei numeric(78,0) not null,
  x_hold_total_wei numeric(78,0) not null,
  settled_total_wei numeric(78,0) not null,
  carry_forward_wei numeric(78,0) not null,
  calculation_policy text not null,
  snapshot_digest text not null,
  committed_at timestamptz not null default clock_timestamp(),
  constraint unified_settlement_network
    check (network in ('mainnet','testnet','testnet-staging')),
  constraint unified_settlement_app_id
    check (app_id ~ '^0x[0-9a-f]{64}$'),
  constraint unified_settlement_round
    check (veBetter_round_id > 0),
  constraint unified_settlement_cutoff
    check (cutoff_finalized_block > 0 and
           pool_snapshot_finalized_block = cutoff_finalized_block),
  constraint unified_settlement_nonnegative
    check (pool_balance_wei >= 0 and existing_liability_wei >= 0 and
           available_wei >= 0 and recipient_count >= 0 and
           base_total_wei >= 0 and x_hold_total_wei >= 0 and
           settled_total_wei >= 0 and carry_forward_wei >= 0),
  constraint unified_settlement_pool_conservation
    check (pool_balance_wei =
           existing_liability_wei + available_wei),
  constraint unified_settlement_commitment_conservation
    check (settled_total_wei =
           base_total_wei + x_hold_total_wei and
           available_wei = settled_total_wei + carry_forward_wei),
  constraint unified_settlement_zero_recipient_carryover
    check ((recipient_count = 0 and settled_total_wei = 0) or
           (recipient_count > 0 and settled_total_wei > 0 and
            carry_forward_wei = 0)),
  constraint unified_settlement_known_policy
    check (calculation_policy = 'unified-round-close-v3-shadow'),
  constraint unified_settlement_snapshot_digest
    check (snapshot_digest ~ '^[0-9a-f]{64}$'),
  unique (network,app_id,veBetter_round_id),
  unique (id,network,app_id)
);

create table reward_unified_v3.entitlements (
  id bigint generated always as identity primary key,
  settlement_id bigint not null,
  network text not null,
  app_id text not null,
  invite_code text not null,
  recipient_wallet text not null,
  completion_finalized_block bigint not null,
  sybil_assessment_revision text not null,
  total_reward_wei numeric(78,0) not null,
  base_reward_wei numeric(78,0) not null,
  x_hold_wei numeric(78,0) not null,
  committed_at timestamptz not null default clock_timestamp(),
  constraint unified_entitlement_settlement_fkey
    foreign key (settlement_id,network,app_id)
    references reward_unified_v3.settlements(id,network,app_id)
    on delete restrict,
  constraint unified_entitlement_network
    check (network in ('mainnet','testnet','testnet-staging')),
  constraint unified_entitlement_code
    check (invite_code ~ '^[A-HJ-NP-Z2-9]{7}$'),
  constraint unified_entitlement_wallet
    check (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint unified_entitlement_evidence
    check (completion_finalized_block > 0 and
           length(btrim(sybil_assessment_revision)) > 0),
  constraint unified_entitlement_amounts
    check (
      total_reward_wei > 0 and base_reward_wei > 0 and x_hold_wei >= 0
      and base_reward_wei + x_hold_wei = total_reward_wei
    ),
  constraint unified_entitlement_x_within_total
    check (
      (total_reward_wei <= 10000000000000000000::numeric and
       x_hold_wei = 0) or
      (total_reward_wei > 10000000000000000000::numeric and
       x_hold_wei = 10000000000000000000::numeric)
    ),
  unique (network,invite_code),
  unique (settlement_id,invite_code),
  unique (id,network)
);

-- The X obligation is already part of entitlements.x_hold_wei.
-- Events are immutable history: a later authorizing payout RPC must prevent
-- RELEASED and PAID from both becoming effective on the same entitlement.
-- Do not add up entitlements.x_hold_wei + event amounts (double counting).
create table reward_unified_v3.x_events (
  id bigint generated always as identity primary key,
  entitlement_id bigint not null,
  network text not null,
  event_type text not null,
  amount_wei numeric(78,0) not null,
  event_reference text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint unified_x_event_entitlement_fkey
    foreign key (entitlement_id,network)
    references reward_unified_v3.entitlements(id,network)
    on delete restrict,
  constraint unified_x_event_type
    check (event_type in ('OFFER_OPENED','POST_VERIFIED','FINAL_VERIFIED',
                         'RELEASED','PAYOUT_SIGNED','PAID')),
  constraint unified_x_event_amount
    check (amount_wei > 0 and amount_wei =
           10000000000000000000::numeric),
  constraint unified_x_event_reference
    check (length(btrim(event_reference)) > 0),
  unique (entitlement_id,event_type,event_reference)
);

create index unified_entitlement_settlement_idx
  on reward_unified_v3.entitlements (settlement_id);
create index unified_x_events_entitlement_idx
  on reward_unified_v3.x_events (entitlement_id,created_at);

-- Append-only: changes/retries must use new journal entries, never rewriting
-- signed payment history or modifying an immutable total reward.
create function reward_unified_v3.reject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'UNIFIED_REWARD_V3_APPEND_ONLY';
end;
$$;

create trigger unified_settlement_immutable
before update or delete on reward_unified_v3.settlements
for each row execute function reward_unified_v3.reject_mutation();

create trigger unified_entitlement_immutable
before update or delete on reward_unified_v3.entitlements
for each row execute function reward_unified_v3.reject_mutation();

create trigger unified_x_event_immutable
before update or delete on reward_unified_v3.x_events
for each row execute function reward_unified_v3.reject_mutation();

-- Defense in depth even though this schema is not exposed to PostgREST.
alter table reward_unified_v3.settlements enable row level security;
alter table reward_unified_v3.entitlements enable row level security;
alter table reward_unified_v3.x_events enable row level security;

revoke all on all tables in schema reward_unified_v3
  from public,anon,authenticated,service_role;
revoke all on all sequences in schema reward_unified_v3
  from public,anon,authenticated,service_role;
revoke all on all functions in schema reward_unified_v3
  from public,anon,authenticated,service_role;

-- Deliberately NO service_role inserts, no public APIs, no fund releases,
-- and no changes to existing payout/liability readers in this proposal.
commit;
