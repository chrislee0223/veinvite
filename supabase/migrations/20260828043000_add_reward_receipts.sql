begin;

create table if not exists public.reward_receipts (
  id bigint generated always as identity primary key,
  receipt_version text not null default 'veinvite-reward-receipt-v1',
  payout_id bigint not null unique references public.reward_payouts(id) on delete restrict,
  round_id bigint not null references public.reward_rounds(id) on delete restrict,
  settlement_id bigint not null references public.reward_payout_transaction_settlements(id) on delete restrict,
  network text not null,
  vebetter_round_id bigint not null,
  invite_code text not null references public.invitations(invite_code) on delete restrict,
  recipient_wallet text not null,
  amount_wei numeric(78,0) not null,
  tx_id text not null,
  paid_at timestamptz not null,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reward_receipts_version_check
    check (receipt_version = 'veinvite-reward-receipt-v1'),
  constraint reward_receipts_network_check
    check (network in ('mainnet', 'testnet', 'testnet-staging')),
  constraint reward_receipts_vebetter_round_check
    check (vebetter_round_id >= 1),
  constraint reward_receipts_wallet_check
    check (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint reward_receipts_amount_check
    check (amount_wei > 0 and amount_wei = trunc(amount_wei)),
  constraint reward_receipts_tx_id_check
    check (tx_id ~ '^0x[0-9a-f]{64}$'),
  constraint reward_receipts_seen_after_paid_check
    check (seen_at is null or seen_at >= paid_at)
);

create index if not exists reward_receipts_wallet_paid_idx
  on public.reward_receipts(recipient_wallet, paid_at desc, id desc);

create index if not exists reward_receipts_unseen_wallet_idx
  on public.reward_receipts(recipient_wallet, paid_at desc, id desc)
  where seen_at is null;

alter table public.reward_receipts enable row level security;

revoke all on table public.reward_receipts from public, anon, authenticated;
grant select on table public.reward_receipts to service_role;
revoke insert, update, delete on table public.reward_receipts from service_role;

create or replace function public.guard_reward_receipt_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'reward receipts cannot be deleted';
  end if;

  if new.receipt_version is distinct from old.receipt_version
     or new.payout_id is distinct from old.payout_id
     or new.round_id is distinct from old.round_id
     or new.settlement_id is distinct from old.settlement_id
     or new.network is distinct from old.network
     or new.vebetter_round_id is distinct from old.vebetter_round_id
     or new.invite_code is distinct from old.invite_code
     or new.recipient_wallet is distinct from old.recipient_wallet
     or new.amount_wei is distinct from old.amount_wei
     or new.tx_id is distinct from old.tx_id
     or new.paid_at is distinct from old.paid_at
     or new.created_at is distinct from old.created_at then
    raise exception 'reward receipt economic evidence is immutable';
  end if;

  if old.seen_at is not null
     and new.seen_at is distinct from old.seen_at then
    raise exception 'a seen reward receipt cannot be changed';
  end if;

  if old.seen_at is null
     and new.seen_at is null then
    return new;
  end if;

  if old.seen_at is null
     and new.seen_at is not null
     and new.seen_at < new.paid_at then
    raise exception 'reward receipt cannot be seen before it was paid';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_reward_receipt_mutation() from public, anon, authenticated, service_role;

drop trigger if exists reward_receipts_guard_update on public.reward_receipts;
create trigger reward_receipts_guard_update
before update on public.reward_receipts
for each row execute function public.guard_reward_receipt_mutation();

drop trigger if exists reward_receipts_guard_delete on public.reward_receipts;
create trigger reward_receipts_guard_delete
before delete on public.reward_receipts
for each row execute function public.guard_reward_receipt_mutation();

create or replace function public.create_reward_receipt_from_paid_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.reward_rounds%rowtype;
  v_settlement public.reward_payout_transaction_settlements%rowtype;
  v_existing public.reward_receipts%rowtype;
begin
  if new.status <> 'PAID'
     or old.status = 'PAID' then
    return new;
  end if;

  if new.tx_id is null or new.paid_at is null then
    raise exception 'PAID payout is missing transaction evidence';
  end if;

  if not exists (
    select 1
    from public.invitations i
    where i.invite_code = new.invite_code
      and i.inviter_wallet = new.recipient_wallet
  ) then
    raise exception 'reward receipt recipient must be the invitation inviter';
  end if;

  select *
  into v_round
  from public.reward_rounds
  where id = new.round_id;

  if not found then
    raise exception 'reward receipt reward round was not found';
  end if;

  if v_round.vebetter_round_id is null
     or v_round.allocation_receipt_id is null
     or v_round.allocation_rewards_wei is null
     or v_round.opening_carryover_wei is null then
    raise exception 'reward receipt requires an allocation-bound reward round';
  end if;

  select *
  into v_settlement
  from public.reward_payout_transaction_settlements s
  where s.round_id = new.round_id
    and s.tx_id = new.tx_id;

  if not found then
    raise exception 'reward receipt requires a finalized payout settlement';
  end if;

  if v_settlement.network <> v_round.network
     or v_settlement.paid_at <> new.paid_at
     or v_settlement.finalized_head_number < v_settlement.block_number then
    raise exception 'reward receipt settlement evidence does not match the paid payout';
  end if;

  insert into public.reward_receipts(
    payout_id,
    round_id,
    settlement_id,
    network,
    vebetter_round_id,
    invite_code,
    recipient_wallet,
    amount_wei,
    tx_id,
    paid_at
  ) values (
    new.id,
    new.round_id,
    v_settlement.id,
    v_round.network,
    v_round.vebetter_round_id,
    new.invite_code,
    new.recipient_wallet,
    new.amount_wei,
    new.tx_id,
    new.paid_at
  )
  on conflict (payout_id) do nothing;

  if not found then
    select *
    into v_existing
    from public.reward_receipts
    where payout_id = new.id;

    if not found
       or v_existing.round_id <> new.round_id
       or v_existing.settlement_id <> v_settlement.id
       or v_existing.network <> v_round.network
       or v_existing.vebetter_round_id <> v_round.vebetter_round_id
       or v_existing.invite_code <> new.invite_code
       or v_existing.recipient_wallet <> new.recipient_wallet
       or v_existing.amount_wei <> new.amount_wei
       or v_existing.tx_id <> new.tx_id
       or v_existing.paid_at <> new.paid_at then
      raise exception 'existing reward receipt does not match immutable payout evidence';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.create_reward_receipt_from_paid_payout() from public, anon, authenticated, service_role;

drop trigger if exists reward_payouts_create_receipt on public.reward_payouts;
create trigger reward_payouts_create_receipt
after update of status on public.reward_payouts
for each row
when (new.status = 'PAID' and old.status is distinct from 'PAID')
execute function public.create_reward_receipt_from_paid_payout();

-- Fail closed if historical PAID payouts cannot be proven by the current
-- finalized settlement + allocation-bound round model.
do $$
begin
  if exists (
    select 1
    from public.reward_payouts rp
    left join public.reward_rounds rr
      on rr.id = rp.round_id
    left join public.reward_payout_transaction_settlements s
      on s.round_id = rp.round_id
     and s.tx_id = rp.tx_id
    left join public.invitations i
      on i.invite_code = rp.invite_code
    where rp.status = 'PAID'
      and (
        rp.tx_id is null
        or rp.paid_at is null
        or rr.id is null
        or rr.vebetter_round_id is null
        or rr.allocation_receipt_id is null
        or s.id is null
        or s.paid_at <> rp.paid_at
        or i.inviter_wallet <> rp.recipient_wallet
      )
  ) then
    raise exception 'cannot enable reward receipts while an unverifiable PAID payout exists';
  end if;
end;
$$;

insert into public.reward_receipts(
  payout_id,
  round_id,
  settlement_id,
  network,
  vebetter_round_id,
  invite_code,
  recipient_wallet,
  amount_wei,
  tx_id,
  paid_at
)
select
  rp.id,
  rp.round_id,
  s.id,
  rr.network,
  rr.vebetter_round_id,
  rp.invite_code,
  rp.recipient_wallet,
  rp.amount_wei,
  rp.tx_id,
  rp.paid_at
from public.reward_payouts rp
join public.reward_rounds rr
  on rr.id = rp.round_id
join public.reward_payout_transaction_settlements s
  on s.round_id = rp.round_id
 and s.tx_id = rp.tx_id
join public.invitations i
  on i.invite_code = rp.invite_code
 and i.inviter_wallet = rp.recipient_wallet
where rp.status = 'PAID'
  and rp.tx_id is not null
  and rp.paid_at is not null
  and rr.vebetter_round_id is not null
  and rr.allocation_receipt_id is not null
on conflict (payout_id) do nothing;

create or replace function public.mark_reward_receipt_seen(
  p_receipt_id bigint,
  p_wallet text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet text;
  v_receipt public.reward_receipts%rowtype;
begin
  if p_receipt_id is null or p_receipt_id < 1 then
    raise exception 'receipt_id must be positive';
  end if;

  v_wallet := lower(btrim(p_wallet));

  if v_wallet is null
     or v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'wallet must be a lowercase VeChain address';
  end if;

  update public.reward_receipts
  set seen_at = now()
  where id = p_receipt_id
    and recipient_wallet = v_wallet
    and seen_at is null
  returning * into v_receipt;

  if not found then
    select *
    into v_receipt
    from public.reward_receipts
    where id = p_receipt_id
      and recipient_wallet = v_wallet;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_receipt.id,
    'payout_id', v_receipt.payout_id,
    'round_id', v_receipt.round_id,
    'settlement_id', v_receipt.settlement_id,
    'network', v_receipt.network,
    'vebetter_round_id', v_receipt.vebetter_round_id,
    'invite_code', v_receipt.invite_code,
    'recipient_wallet', v_receipt.recipient_wallet,
    'amount_wei', v_receipt.amount_wei::text,
    'tx_id', v_receipt.tx_id,
    'paid_at', v_receipt.paid_at,
    'seen_at', v_receipt.seen_at,
    'created_at', v_receipt.created_at,
    'receipt_version', v_receipt.receipt_version
  );
end;
$$;

revoke all on function public.mark_reward_receipt_seen(bigint, text) from public, anon, authenticated;
grant execute on function public.mark_reward_receipt_seen(bigint, text) to service_role;

commit;
