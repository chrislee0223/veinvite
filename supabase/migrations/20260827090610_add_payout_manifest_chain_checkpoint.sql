-- Bind every immutable payout manifest to a sealed chain checkpoint captured
-- before the operator can sign a payout transaction. A verified payout must be
-- included strictly after this checkpoint, closing the residual timestamp-only
-- replay window. This migration cannot sign or submit VeChain transactions.

begin;

create table if not exists public.reward_payout_manifest_chain_checkpoints (
  manifest_id bigint primary key references public.reward_payout_manifests(id) on delete restrict,
  block_id text not null,
  block_number bigint not null,
  block_timestamp bigint not null,
  recorded_at timestamptz not null default now(),
  constraint reward_payout_manifest_checkpoint_block_id_check
    check (block_id ~ '^0x[0-9a-f]{64}$'),
  constraint reward_payout_manifest_checkpoint_block_number_check
    check (block_number >= 0),
  constraint reward_payout_manifest_checkpoint_block_timestamp_check
    check (block_timestamp >= 0)
);

alter table public.reward_payout_manifest_chain_checkpoints enable row level security;

revoke all on table public.reward_payout_manifest_chain_checkpoints
  from public, anon, authenticated;
grant select on table public.reward_payout_manifest_chain_checkpoints
  to service_role;

create or replace function public.enforce_reward_payout_manifest_checkpoint_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'reward payout manifest chain checkpoints are immutable';
end;
$$;

revoke all on function public.enforce_reward_payout_manifest_checkpoint_immutable()
  from public, anon, authenticated;

drop trigger if exists reward_payout_manifest_chain_checkpoints_immutable_guard
  on public.reward_payout_manifest_chain_checkpoints;
create trigger reward_payout_manifest_chain_checkpoints_immutable_guard
before update or delete on public.reward_payout_manifest_chain_checkpoints
for each row execute function public.enforce_reward_payout_manifest_checkpoint_immutable();

create or replace function public.create_reward_payout_manifest_chain_checkpoint(
  p_manifest_id bigint,
  p_block_id text,
  p_block_number bigint,
  p_block_timestamp bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manifest public.reward_payout_manifests%rowtype;
  v_existing public.reward_payout_manifest_chain_checkpoints%rowtype;
  v_recorded_at timestamptz;
begin
  p_block_id := lower(btrim(p_block_id));

  if p_manifest_id is null or p_manifest_id < 1 then
    raise exception 'manifest_id must be positive';
  end if;

  if p_block_id is null or p_block_id !~ '^0x[0-9a-f]{64}$' then
    raise exception 'block_id must be a lowercase 32-byte hex value';
  end if;

  if p_block_number is null or p_block_number < 0 then
    raise exception 'block_number must be non-negative';
  end if;

  if p_block_timestamp is null or p_block_timestamp < 0 then
    raise exception 'block_timestamp must be non-negative';
  end if;

  select *
  into v_manifest
  from public.reward_payout_manifests
  where id = p_manifest_id
  for share;

  if not found then
    raise exception 'reward payout manifest not found';
  end if;

  select *
  into v_existing
  from public.reward_payout_manifest_chain_checkpoints
  where manifest_id = p_manifest_id;

  if found then
    if v_existing.block_id = p_block_id
       and v_existing.block_number = p_block_number
       and v_existing.block_timestamp = p_block_timestamp then
      return jsonb_build_object(
        'manifest_id', v_existing.manifest_id,
        'created', false,
        'block_id', v_existing.block_id,
        'block_number', v_existing.block_number,
        'block_timestamp', v_existing.block_timestamp,
        'recorded_at', v_existing.recorded_at
      );
    end if;

    raise exception 'reward payout manifest already has a different immutable chain checkpoint';
  end if;

  insert into public.reward_payout_manifest_chain_checkpoints(
    manifest_id,
    block_id,
    block_number,
    block_timestamp
  ) values (
    p_manifest_id,
    p_block_id,
    p_block_number,
    p_block_timestamp
  )
  returning recorded_at into v_recorded_at;

  return jsonb_build_object(
    'manifest_id', p_manifest_id,
    'created', true,
    'block_id', p_block_id,
    'block_number', p_block_number,
    'block_timestamp', p_block_timestamp,
    'recorded_at', v_recorded_at
  );
end;
$$;

revoke all on function public.create_reward_payout_manifest_chain_checkpoint(
  bigint, text, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.create_reward_payout_manifest_chain_checkpoint(
  bigint, text, bigint, bigint
) to service_role;

create or replace function public.require_reward_settlement_after_manifest_checkpoint()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_checkpoint_block bigint;
begin
  select c.block_number
  into v_checkpoint_block
  from public.reward_payout_manifest_chain_checkpoints c
  where c.manifest_id = new.manifest_id;

  if not found then
    raise exception 'reward payout manifest is missing immutable chain checkpoint';
  end if;

  if new.block_number <= v_checkpoint_block then
    raise exception 'verified reward transaction must be after manifest chain checkpoint';
  end if;

  return new;
end;
$$;

revoke all on function public.require_reward_settlement_after_manifest_checkpoint()
  from public, anon, authenticated;

drop trigger if exists reward_payout_transaction_settlements_checkpoint_guard
  on public.reward_payout_transaction_settlements;
create trigger reward_payout_transaction_settlements_checkpoint_guard
before insert on public.reward_payout_transaction_settlements
for each row execute function public.require_reward_settlement_after_manifest_checkpoint();

commit;
