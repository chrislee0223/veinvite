import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const clientSource = readFileSync('src/lib/networkDataClient.ts', 'utf8');
const networkSource = readFileSync('src/components/AppNetwork.tsx', 'utf8');
const summaryRoute = readFileSync('src/app/api/network/summary/route.ts', 'utf8');
const initialConsistencyMigration = readFileSync(
  'supabase/migrations/20261004111500_harden_network_slot_status_consistency.sql',
  'utf8',
);
const releasedStatusMigration = readFileSync(
  'supabase/migrations/20261004120257_harden_released_network_status_guard.sql',
  'utf8',
);
const visibleRelationshipMigration = readFileSync(
  'supabase/migrations/20261004120334_remove_incomplete_legacy_network_edges.sql',
  'utf8',
);

test('Network exposes only current progress, qualified, or rewarded members', () => {
  assert.doesNotMatch(clientSource, /HISTORICAL/);
  assert.doesNotMatch(visibleRelationshipMigration, /'HISTORICAL'/);
  assert.match(
    releasedStatusMigration,
    /i\.sybil_status <> 'BLOCKED'[\s\S]*i\.slot_released_at is null[\s\S]*then 'IN_PROGRESS'/,
  );
  assert.match(
    visibleRelationshipMigration,
    /i\.reward_status = 'PAID'/,
  );
  assert.match(
    visibleRelationshipMigration,
    /i\.status = 'COMPLETED'[\s\S]*i\.vot3_converted is true[\s\S]*i\.vote_completed is true[\s\S]*i\.sybil_status = 'CLEAR'/,
  );
  assert.match(
    visibleRelationshipMigration,
    /i\.status in \('ACTIVATING', 'UNDER_REVIEW'\)[\s\S]*i\.eligibility_check_id is not null[\s\S]*i\.activation_network is not null/,
  );
  assert.match(networkSource, /child\.status === 'IN_PROGRESS' \? \(/);
});

test('incomplete legacy backfills and canary children are excluded at the shared edge source', () => {
  assert.match(
    visibleRelationshipMigration,
    /create or replace view public\.network_visible_referral_edges/,
  );
  assert.match(
    visibleRelationshipMigration,
    /join public\.invitations i[\s\S]*i\.id = e\.source_invitation_id/,
  );
  assert.match(
    visibleRelationshipMigration,
    /network_runtime_canary_wallets[\s\S]*lower\(cw\.wallet_address\) = lower\(e\.child_wallet\)/,
  );
  assert.match(
    visibleRelationshipMigration,
    /read_public_network_discovery_v1[\s\S]*public\.network_visible_referral_edges e/,
  );
  assert.match(
    initialConsistencyMigration,
    /read_public_referral_network_focus_v1[\s\S]*public\.network_visible_referral_edges e/,
  );
  assert.match(summaryRoute, /\.from\('network_visible_referral_edges'\)/);
  assert.doesNotMatch(summaryRoute, /\.from\('qualified_referral_network_edges'\)/);
});

test('Network visibility migrations preserve invitation audit authority', () => {
  assert.doesNotMatch(visibleRelationshipMigration, /update\s+public\.invitations/i);
  assert.doesNotMatch(visibleRelationshipMigration, /insert\s+into\s+public\.invitations/i);
  assert.doesNotMatch(visibleRelationshipMigration, /delete\s+from\s+public\.invitations/i);
});
