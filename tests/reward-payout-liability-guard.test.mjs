import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const payoutWorker = readFileSync(
  new URL('../src/lib/rewards/automaticRewardPayout.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260909023000_add_reward_liability_signing_guard.sql',
    import.meta.url,
  ),
  'utf8',
);

test('outstanding liability mirrors fixed reservations plus uncovered legacy payouts', () => {
  assert.match(
    migration,
    /create or replace function public\.read_outstanding_reward_liability/u,
  );
  assert.match(
    migration,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/u,
  );
  assert.match(
    migration,
    /paid\.status = 'PAID'/u,
  );
  assert.match(
    migration,
    /rp\.status in \('PENDING','SENDING','FAILED'\)/u,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*q\.invite_code = rp\.invite_code[\s\S]*q\.reserved_amount_wei is not null/u,
  );
});

test('outstanding liability reader is service-role only', () => {
  assert.match(migration, /security definer/u);
  assert.match(
    migration,
    /set search_path to 'pg_catalog', 'public'/u,
  );
  assert.match(
    migration,
    /revoke execute on function public\.read_outstanding_reward_liability\(text,text\)[\s\S]*from anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_outstanding_reward_liability\(text,text\)[\s\S]*to service_role/u,
  );
});

test('automatic payout refreshes funding and runtime safety immediately before signing', () => {
  const signerStart = payoutWorker.indexOf(
    'async function signAndJournalTransaction',
  );
  const signerEnd = payoutWorker.indexOf(
    'function isNotFoundError',
  );

  assert.ok(signerStart >= 0 && signerEnd > signerStart);

  const signer = payoutWorker.slice(signerStart, signerEnd);
  const freshPoolIndex = signer.indexOf(
    'readVeInviteRewardPoolStatus()',
  );
  const liabilityIndex = signer.indexOf(
    'readOutstandingRewardLiability(network, appId)',
  );
  const privateKeyIndex = signer.indexOf(
    'Hex.of(privateKeyHex).bytes',
  );

  assert.ok(freshPoolIndex >= 0);
  assert.ok(liabilityIndex >= 0);
  assert.ok(privateKeyIndex > freshPoolIndex);
  assert.ok(privateKeyIndex > liabilityIndex);
  assert.match(signer, /readRewardRuntimeSafety\(\)/u);
  assert.match(signer, /freshRuntime\.emergencyRewardsPaused/u);
  assert.match(signer, /freshPool\.distributionPaused/u);
  assert.match(signer, /freshPool\.rewardDistributors\.includes/u);
  assert.match(
    signer,
    /freshPoolBalanceWei < outstandingLiability/u,
  );
  assert.match(
    signer,
    /freshPoolBalanceWei <[\s\S]*BigInt\(manifest\.totalAmountWei\)/u,
  );
  assert.doesNotMatch(signer, /poolBalanceWei/u);
});
