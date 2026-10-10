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

test('user X promotion state is hidden while LIVE is disabled', () => {
  assert.match(
    route,
    /reward_x_promotion_enabled,reward_x_promotion_live_started_at/,
  );
  assert.match(
    route,
    /if \(!live\)[\s\S]*live: false,[\s\S]*promotion: null/,
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

test('share token is exposed only while the offer is open', () => {
  assert.match(
    route,
    /shareToken:[\s\S]*state === 'OPEN'/,
  );
});

test('promotion state preserves verification and terminal outcomes', () => {
  for (const state of [
    'OPEN',
    'VERIFYING',
    'RETENTION',
    'REVIEW_REQUIRED',
    'PAYOUT_PENDING',
    'PAID',
    'RELEASED',
  ]) {
    assert.match(route, new RegExp(`'${state}'`));
  }
});
