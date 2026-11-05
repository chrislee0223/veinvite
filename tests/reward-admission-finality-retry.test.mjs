import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const activation = readFileSync(
  new URL('../src/lib/rewards/admissionGuaranteeActivation.ts', import.meta.url), 'utf8',
);
const retry = readFileSync(
  new URL('../src/lib/rewards/admissionGuaranteeRecovery.ts', import.meta.url), 'utf8',
);
const recovery = readFileSync(
  new URL('../src/lib/rewards/rewardRecoveryMaintenance.ts', import.meta.url), 'utf8',
);
test('admission never promises older referrals or without explicit rollout epoch', () => {
  assert.match(activation, /VEINVITE_ADMISSION_GUARANTEE_ENABLED !== 'true'/);
  assert.match(activation, /VEINVITE_ADMISSION_ROLLOUT_NOT_BEFORE/);
  assert.match(activation, /if \(!rollout\) return 'NOT_READY'/);
  assert.match(activation, /Date\.parse\(inv\.activated_at\) < Date\.parse\(rollout\)/);
  assert.match(activation, /read_reward_admission_hold_for_reservation_v1/);
  assert.match(activation, /create_reward_admission_hold_v1/);
});
test('retries are bounded by existing five-minute lease and cannot sign or write directly', () => {
  assert.match(retry, /if \(!rollout\) return result/);
  assert.match(retry, /admissionEnabled !== true/);
  assert.match(retry, /\.gte\('activated_at', rollout\)/);
  assert.match(retry, /\.limit\(72\)/);
  assert.match(retry, /const pageSize = 6/);
  assert.match(retry, /Date\.now\(\) \/ 300_000/);
  assert.match(retry, /maybeReserveFundedReferralMinimumAfterActivation/);
  assert.doesNotMatch(retry, /\.insert\(|\.update\(|sendTransaction|grant execute/i);
  assert.match(recovery, /await runRewardReservationRecovery\(\)/);
  assert.match(recovery, /await retryAdmissionGuaranteesAfterFinality\(\)/);
  assert.match(recovery, /catch \(error\)[\s\S]*Admission finality recovery deferred/);
});
