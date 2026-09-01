-- Add the covering index required by the settlement foreign key used by
-- reward-recipient B3TR flow forensics. This keeps settlement joins and
-- referential-integrity maintenance efficient as payout history grows.

create index if not exists reward_recipient_b3tr_flow_settlement_idx
  on public.reward_recipient_b3tr_flow_snapshots (settlement_id);
