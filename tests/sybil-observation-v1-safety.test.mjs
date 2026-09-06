import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const batch = readFileSync('src/lib/sybil/observationBatch.ts', 'utf8');
const policy = readFileSync('src/lib/sybil/observationPolicy.ts', 'utf8');
const cron = readFileSync('src/app/api/cron/reconcile/route.ts', 'utf8');
const migration = readFileSync(
  'supabase/migrations/20260906083037_prepare_sybil_observation_v1.sql',
  'utf8',
);

test('Sybil observation remains explicitly gated and observation-only', () => {
  assert.match(batch, /SYBIL_OBSERVATION_ENABLED === 'true'/);
  assert.match(batch, /observation_only: true/);
  assert.doesNotMatch(batch, /\.from\('invitations'\)[\s\S]{0,200}\.update\(/);
  assert.doesNotMatch(batch, /sybil_status\s*:/);
  assert.doesNotMatch(batch, /reward_status\s*:/);
  assert.doesNotMatch(batch, /reward_eligible_at\s*:/);
  assert.match(migration, /observation_only is true/);
  assert.match(
    migration,
    /does not mutate invitation Sybil status, reward eligibility, queue state, or payout authority/,
  );
});

test('new-wallet and inviter-funded VTHO evidence stays weak by itself', () => {
  assert.match(policy, /case 'VERY_NEW_WALLET_ACTIVITY':[\s\S]*level: 'INFO'[\s\S]*score: 4/);
  assert.match(policy, /case 'NEW_WALLET_ACTIVITY':[\s\S]*level: 'INFO'[\s\S]*score: 2/);
  assert.match(policy, /case 'SAME_FUNDER_MULTI_ASSET':[\s\S]*level: 'INFO'[\s\S]*score: 3/);
  assert.match(policy, /case 'SHARED_VTHO_FUNDER':[\s\S]*level: 'LOW'[\s\S]*Math\.min\(15,/);
  assert.match(policy, /Small VTHO sponsorship is a legitimate onboarding pattern/);
});

test('scheduled observation failure is isolated from reconciliation and payout stages', () => {
  assert.match(cron, /'SYBIL_OBSERVATION'/);
  assert.match(cron, /await runSybilObservationBatch\(\)/);
  assert.match(cron, /failedStages\.push\('SYBIL_OBSERVATION'\)/);
  assert.match(cron, /await runAutomaticRewardPayout\(\)/);
});

test('observation snapshots are versioned and duplicate analyzer runs are prevented', () => {
  assert.match(batch, /SYBIL_ONCHAIN_ANALYZER_VERSION = 'onchain-funding-v1'/);
  assert.match(batch, /SYBIL_OBSERVATION_POLICY_VERSION/);
  assert.match(migration, /sybil_onchain_snapshots_invite_analyzer_unique/);
  assert.match(migration, /\(invite_code, analyzer_version\)/);
});
