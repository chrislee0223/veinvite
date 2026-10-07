create index if not exists reward_boost_reserve_ledger_source_receipt_idx
  on public.reward_boost_reserve_ledger(source_allocation_receipt_id)
  where source_allocation_receipt_id is not null;

create index if not exists reward_boost_reserve_ledger_destination_receipt_idx
  on public.reward_boost_reserve_ledger(destination_allocation_receipt_id)
  where destination_allocation_receipt_id is not null;
