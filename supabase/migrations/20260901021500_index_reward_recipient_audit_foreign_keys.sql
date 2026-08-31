-- Cover the two foreign-key access paths introduced by the recipient audit
-- ledger so deletes/checks on referenced rows and operator lookups remain
-- efficient as payout history grows.
create index if not exists reward_recipient_audit_ledger_payout_id_idx
  on public.reward_recipient_audit_ledger (payout_id)
  where payout_id is not null;

create index if not exists reward_recipient_risk_events_related_receipt_id_idx
  on public.reward_recipient_risk_events (related_receipt_id)
  where related_receipt_id is not null;
