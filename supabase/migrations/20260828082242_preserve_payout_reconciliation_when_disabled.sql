begin;

-- The funded-rewards gate blocks creation of new financial commitments, but
-- immutable recording/reconciliation of a transaction that may already have
-- been broadcast must remain possible. Otherwise an emergency pause could
-- leave real on-chain payments unrecorded in the audit ledger.
drop trigger if exists reward_tx_submissions_mainnet_funded_gate
  on public.reward_payout_transaction_submissions;
drop trigger if exists reward_tx_settlements_mainnet_funded_gate
  on public.reward_payout_transaction_settlements;

commit;
