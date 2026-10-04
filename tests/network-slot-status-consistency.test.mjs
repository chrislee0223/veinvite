import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientSource = readFileSync('src/lib/networkDataClient.ts', 'utf8');
const networkSource = readFileSync('src/components/AppNetwork.tsx', 'utf8');
const summaryRoute = readFileSync('src/app/api/network/summary/route.ts', 'utf8');
const migrationSource = readFileSync(
  'supabase/migrations/20261004111500_harden_network_slot_status_consistency.sql',
  'utf8',
);

test('lifetime Network relationships have a neutral historical state', () => {
  assert.match(clientSource, /\| 'HISTORICAL'/);
  assert.match(migrationSource, /else 'HISTORICAL'\s+end as member_status/);
  assert.match(
    migrationSource,
    /i\.status in \('ACTIVATING', 'UNDER_REVIEW'\)[\s\S]*i\.eligibility_check_id is not null[\s\S]*i\.activation_network is not null/,
  );
  assert.match(
    migrationSource,
    /i\.status = 'COMPLETED'[\s\S]*i\.slot_released_at is null[\s\S]*then 'IN_PROGRESS'/,
  );
  assert.match(networkSource, /child\.status === 'IN_PROGRESS' \? \(/);
  assert.doesNotMatch(networkSource, /child\.status !== 'REWARDED'.*inProgress/);
});

test('all Network graph readers share the canary-filtered lifetime edge source', () => {
  assert.match(
    migrationSource,
    /create or replace view public\.network_visible_referral_edges/,
  );
  assert.match(
    migrationSource,
    /network_runtime_canary_wallets[\s\S]*lower\(cw\.wallet_address\) = lower\(e\.child_wallet\)/,
  );
  assert.equal(
    (migrationSource.match(/public\.network_visible_referral_edges e/g) ?? []).length >= 6,
    true,
  );
  assert.match(summaryRoute, /\.from\('network_visible_referral_edges'\)/);
  assert.doesNotMatch(summaryRoute, /\.from\('qualified_referral_network_edges'\)/);
});

test('Network consistency migration does not rewrite reward or Sybil authority', () => {
  assert.doesNotMatch(migrationSource, /update\s+public\.invitations/i);
  assert.doesNotMatch(migrationSource, /reward_status\s*=/i);
  assert.doesNotMatch(migrationSource, /sybil_status\s*=/i);
});
