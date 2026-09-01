-- Store historical NEW/RETURNING/ACTIVE_EXISTING reconstruction separately
-- from live eligibility evidence. These rows are operator/audit evidence only
-- and must never confer reward eligibility or populate eligibility_check_id.

begin;

create table if not exists public.legacy_entry_classification_backfill (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references public.invitations(id) on delete restrict,
  invite_code text not null,
  wallet_address text not null,
  classification_status text not null
    check (classification_status in ('VERIFIED', 'UNRESOLVED')),
  entry_class text null
    check (entry_class in ('NEW', 'RETURNING', 'ACTIVE_EXISTING')),
  outcome text null
    check (outcome in ('ELIGIBLE', 'EXISTING_VEBETTER_USER')),
  network text null,
  checked_block bigint null
    check (checked_block is null or checked_block > 0),
  entry_block_source text not null,
  entry_block_at timestamptz null,
  rule_version text null,
  prior_reward_tx_id text null,
  prior_reward_block bigint null,
  prior_vote_tx_id text null,
  prior_vote_block bigint null,
  recent_reward_tx_id text null,
  recent_reward_block bigint null,
  recent_vote_tx_id text null,
  recent_vote_block bigint null,
  dormancy_start_block bigint null,
  oldest_completed_round_id bigint null,
  newest_completed_round_id bigint null,
  completed_round_ids bigint[] null,
  evidence jsonb not null default '{}'::jsonb,
  note text null,
  recorded_at timestamptz not null default now(),
  constraint legacy_entry_classification_verified_shape check (
    classification_status <> 'VERIFIED'
    or (
      entry_class is not null
      and outcome is not null
      and network is not null
      and checked_block is not null
      and rule_version is not null
      and dormancy_start_block is not null
    )
  )
);

create index if not exists legacy_entry_classification_invitation_idx
  on public.legacy_entry_classification_backfill (
    invitation_id,
    recorded_at desc
  );

create index if not exists legacy_entry_classification_wallet_idx
  on public.legacy_entry_classification_backfill (
    lower(wallet_address),
    recorded_at desc
  );

alter table public.legacy_entry_classification_backfill
  enable row level security;

revoke all on public.legacy_entry_classification_backfill
  from public, anon, authenticated;
grant select, insert on public.legacy_entry_classification_backfill
  to service_role;

create or replace function public.prevent_legacy_entry_classification_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'legacy entry classification backfill rows are append-only';
end;
$$;

revoke all on function public.prevent_legacy_entry_classification_mutation()
  from public, anon, authenticated;
grant execute on function public.prevent_legacy_entry_classification_mutation()
  to service_role;

drop trigger if exists legacy_entry_classification_prevent_update_delete
  on public.legacy_entry_classification_backfill;
create trigger legacy_entry_classification_prevent_update_delete
before update or delete on public.legacy_entry_classification_backfill
for each row execute function public.prevent_legacy_entry_classification_mutation();

comment on table public.legacy_entry_classification_backfill is
  'Append-only operator evidence for historical NEW/RETURNING/ACTIVE_EXISTING classification. It is deliberately separate from live eligibility_check_events and cannot confer reward eligibility.';

commit;
