import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261016003000_add_x_promotion_financial_integrity_audit_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('financial integrity audit is read-only and service-only', () => {
  assert.match(
    migration,
    /create or replace function public\.read_reward_x_promotion_financial_integrity_audit_v1/,
  );
  assert.match(migration, /language plpgsql\s+stable/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(
    migration,
    /\b(insert|update|delete)\s+(?:into|public\.)/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_financial_integrity_audit_v1\(text\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_financial_integrity_audit_v1\(text\)[\s\S]*to service_role/,
  );
});

test('audit checks split conservation and canonical calculation', () => {
  assert.match(
    migration,
    /s\.reservation_amount_wei<>s\.base_amount_wei\+s\.promotion_amount_wei/,
  );
  assert.match(
    migration,
    /calculate_reward_x_promotion_split_v1/,
  );
  assert.match(
    migration,
    /splitCalculation/,
  );
});

test('audit binds LIVE split to queue, invitation and core base payout', () => {
  assert.match(migration, /reward_queue_entries/);
  assert.match(migration, /public\.invitations/);
  assert.match(migration, /reward_payouts/);
  assert.match(migration, /reward_receipts/);
  assert.match(migration, /corePayoutAmount/);
  assert.match(migration, /corePaidWithoutReceipt/);
  assert.match(migration, /is distinct from/);
});

test('audit detects irreversible release and journal contradictions', () => {
  assert.match(
    migration,
    /financial_state='RELEASED'[\s\S]*reward_x_promotion_payout_signed_transactions/,
  );
  assert.match(migration, /signedWithoutSubmission/);
  assert.match(migration, /submissionWithoutSigned/);
  assert.match(migration, /releasedWithSignedCommit/);
});

test('audit requires payout intent to come from final verified identity', () => {
  assert.match(
    migration,
    /verification_state<>'FINAL_VERIFIED'/,
  );
  assert.match(migration, /pv\.x_post_id<>pi\.x_post_id/);
  assert.match(migration, /pv\.x_author_id<>pi\.x_author_id/);
  assert.match(migration, /intentVerification/);
});

test('audit closes settlement, receipt and paid-obligation loop', () => {
  assert.match(migration, /settlementWithoutReceipt/);
  assert.match(migration, /receiptWithoutPaidObligation/);
  assert.match(migration, /paidObligationWithoutReceipt/);
  assert.match(migration, /receiptBinding/);
});
