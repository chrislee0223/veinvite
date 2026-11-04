import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const audit = readFileSync(
  new URL('../scripts/audit-protected-reward-reserve.sql', import.meta.url),
  'utf8',
);
const query = audit.replace(/--[^\n]*/g, '');

test('historical protection audit is genuinely read-only and never grants release authority', () => {
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE|CALL|DO)\b/i);
  assert.match(query, /^\s*WITH\s+latest_destination\s+AS/i);
  assert.match(query, /FALSE\s+AS\s+authorizes_transfer_or_release/i);
});

test('release ledger is deducted exactly once from the same destination and receipt', () => {
  assert.match(query, /d\.destination_reward_cohort_round_id=l\.destination_reward_cohort_round_id/i);
  assert.match(query, /d\.destination_allocation_receipt_id=l\.destination_allocation_receipt_id/i);
  assert.match(query, /l\.entry_kind='BOOST_RELEASE'/i);
  assert.match(query, /GREATEST\(d\.max_boost_release_wei-r\.released_wei,0\)/i);
  assert.match(query, /r\.released_wei>d\.max_boost_release_wei/i);
  assert.match(query, /r\.released_wei=d\.max_boost_release_wei/i);
});

test('unreviewed or eligible unpaid referrals block an additional release recommendation', () => {
  assert.match(query, /i\.sybil_status='NOT_CHECKED'/);
  assert.match(query, /i\.reward_paid_at IS NULL/);
  assert.match(query, /i\.reward_eligible_at IS NOT NULL/);
  assert.match(query, /p\.unreviewed_unpaid_invites>0 OR p\.eligible_unpaid_invites>0/);
  assert.match(query, /h\.active_held_count>0/);
  assert.match(query, /ONCHAIN_AND_ALLOCATION_RECONCILIATION_REQUIRED/);
  assert.match(query, /f\.created_at<now\(\)-interval '30 minutes'/);
});
