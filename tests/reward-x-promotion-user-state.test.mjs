import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL(
    '../src/app/api/rewards/x-promotion/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('LIVE gate controls new availability without hiding existing obligations', () => {
  assert.match(
    route,
    /reward_x_promotion_enabled,reward_x_promotion_live_started_at/,
  );
  assert.doesNotMatch(route, /if \(!live\)[\s\S]{0,300}promotion: null/);
  assert.match(
    route,
    /if \\(!opportunityRow\\)[\s\S]*newOffersEnabled,[\s\S]*promotion: null/,
  );
  assert.match(
    route,
    /newOffersEnabled,[\s\S]*promotion: \{/,
  );
});

test('user X promotion state is wallet-bound and invite-bound', () => {
  assert.match(route, /requireWalletSession/);
  assert.match(
    route,
    /\.eq\('invite_code', inviteCode\)[\s\S]*\.eq\('recipient_wallet', wallet\)/,
  );
});

test('user X promotion state is read-only and isolated from core reward authority', () => {
  assert.doesNotMatch(
    route,
    /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/,
  );
  assert.doesNotMatch(
    route,
    /reward_queue_entries|reward_payouts|reward_receipts/,
  );
});

test('share token is validated and exposed only while the offer is open', () => {
  assert.match(
    route,
    /now <= postDeadline[\s\S]*'OPEN'[\s\S]*'SUBMISSION_GRACE'[\s\S]*'EXPIRED'/,
  );
  assert.match(route, /UUID_PATTERN/);
  assert.match(route, /Stored X promotion share token is malformed/);

  assert.match(
    route,
    /shareToken:[\s\S]*state === 'OPEN'/,
  );
});

test('promotion state preserves verification and terminal outcomes', () => {
  for (const state of [
    'OPEN',
    'SUBMISSION_GRACE',
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
    'PAID',
    'EXPIRED',
    'RELEASED',
  ]) {
    assert.match(route, new RegExp(`'${state}'`));
  }
});
