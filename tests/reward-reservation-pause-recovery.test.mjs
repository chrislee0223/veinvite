import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reservationServer = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL('../supabase/migrations/20260904214035_harden_reward_pause_and_sybil_recovery.sql', import.meta.url),
  'utf8',
);

test('new fixed reservations stop when runtime rewards are paused or disabled', () => {
  assert.match(reservationServer, /readRewardRuntimeSafety/);
  assert.match(reservationServer, /runtime\.emergencyRewardsPaused/);
  assert.match(reservationServer, /network === 'mainnet'[\s\S]*!runtime\.mainnetFundedRewardsEnabled/);

  const sweepGate = reservationServer.indexOf(
    'if (!(await rewardReservationRuntimeOpen(network)))',
  );
  const finalizedRead = reservationServer.indexOf(
    'const finalizedBlock = await readFinalizedBlockNumber()',
  );
  assert.ok(sweepGate >= 0 && sweepGate < finalizedRead);

  assert.match(migration, /veinvite_emergency_reward_pause/);
  assert.match(migration, /REWARD_RESERVATION_PAUSED/);
  assert.match(migration, /REWARD_RESERVATION_DISABLED/);
});

test('a pause activated during a reservation sweep stops the next quote', () => {
  const candidateStart = reservationServer.indexOf(
    'async function reserveCandidate',
  );
  const retryGate = reservationServer.indexOf(
    'if (!(await rewardReservationRuntimeOpen(network)))',
    candidateStart,
  );
  const poolRead = reservationServer.indexOf(
    'const pool = await readVeInviteRewardPoolStatus()',
    candidateStart,
  );

  assert.ok(retryGate >= 0 && poolRead >= 0 && retryGate < poolRead);
});

test('reactivating a cancelled fixed reservation rechecks cohort capacity', () => {
  assert.match(
    migration,
    /before insert or update of reserved_amount_wei, status/,
  );
  assert.match(migration, /veinvite_reward_reservation_/);
  assert.match(migration, /REWARD_COHORT_BUDGET_EXCEEDED/);
  assert.match(
    migration,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/,
  );
});

test('Sybil false-positive recovery preserves the fixed quote and requires a fresh claim', () => {
  assert.match(
    migration,
    /q\.cancel_reason in \('sybil_blocked','eligibility_revoked'\)/,
  );
  assert.match(migration, /set status='AWAITING_CLAIM'/);
  assert.match(migration, /eligible_at=new\.reward_eligible_at/);
  assert.match(migration, /claim_requested_at=null/);
  assert.match(migration, /claim_requested_by_wallet=null/);
  assert.doesNotMatch(
    migration,
    /set[\s\S]{0,250}reserved_amount_wei\s*=/,
  );
});

test('budget exhaustion leaves a recovered invitation cancelled instead of overcommitting', () => {
  assert.match(
    migration,
    /if sqlerrm = 'REWARD_COHORT_BUDGET_EXCEEDED' then\s*null;/,
  );
});

test('cohort funding joins have supporting receipt-first indexes', () => {
  assert.match(
    migration,
    /invitations_reward_funding_receipt_cohort_idx/,
  );
  assert.match(
    migration,
    /reward_cohort_funding_adjustments_receipt_cohort_idx/,
  );
});
