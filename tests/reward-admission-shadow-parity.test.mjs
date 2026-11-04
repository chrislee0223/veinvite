import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  shouldReadRewardAdmissionShadow,
  compareRewardAdmissionShadow,
} from '../src/lib/rewards/rewardAdmissionShadowParity.ts';

const validEnv = {
  VERCEL_ENV: 'preview',
  VEINVITE_QA_STUDIO: 'false',
  VEINVITE_ADMISSION_SHADOW_READ_ENABLED: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://bpppslplhmppxzvdkwxs.supabase.co',
};

test('funding shadow is opt-in and restricted to isolated testnet Preview', () => {
  assert.equal(shouldReadRewardAdmissionShadow('testnet', validEnv), true);
  for (const env of [
    { ...validEnv, VERCEL_ENV: 'production' },
    { ...validEnv, VERCEL_ENV: 'development' },
    { ...validEnv, VEINVITE_QA_STUDIO: 'true' },
    { ...validEnv, VEINVITE_ADMISSION_SHADOW_READ_ENABLED: 'false' },
    { ...validEnv, VEINVITE_ADMISSION_SHADOW_READ_ENABLED: undefined },
    { ...validEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://upfjvkidaqtnbmmnhupz.supabase.co' },
  ]) {
    assert.equal(shouldReadRewardAdmissionShadow('testnet', env), false);
  }
  assert.equal(shouldReadRewardAdmissionShadow('mainnet', validEnv), false);
  assert.equal(shouldReadRewardAdmissionShadow('testnet-staging', validEnv), false);
});

const snapshot = {
  status: 'STAGING_DISABLED',
  originalOutstandingWei: '100000000000000000000',
  totalPhysicalLiabilityWei: '100000000000000000000',
  cohortLifetimeIncludingUnconvertedWei: '120000000000000000000',
};
const expected = {
  reservedExistingWei: '100000000000000000000',
  cohortReservedWei: '120000000000000000000',
};

test('exact-WeI preview shadow compares existing reserve and lifetime without double counting', () => {
  assert.deepEqual(compareRewardAdmissionShadow(snapshot, expected), {
    status: 'MATCH',
    mismatches: [],
  });
  assert.deepEqual(compareRewardAdmissionShadow({
    ...snapshot,
    totalPhysicalLiabilityWei: '100000000000000000001',
  }, expected), { status: 'DRIFT', mismatches: ['globalOutstanding'] });
  assert.deepEqual(compareRewardAdmissionShadow({
    ...snapshot,
    cohortLifetimeIncludingUnconvertedWei: '1',
  }, expected), { status: 'DRIFT', mismatches: ['cohortLifetime'] });
});

test('legitimate HELD is counted once in global and cohort totals', () => {
  const held = {
    ...snapshot,
    originalOutstandingWei: '100000000000000000000',
    totalPhysicalLiabilityWei: '106000000000000000000',
    cohortLifetimeIncludingUnconvertedWei: '126000000000000000000',
  };
  assert.deepEqual(compareRewardAdmissionShadow(held, {
    reservedExistingWei: '106000000000000000000',
    cohortReservedWei: '126000000000000000000',
  }), { status: 'MATCH', mismatches: [] });
  assert.deepEqual(compareRewardAdmissionShadow(held, {
    reservedExistingWei: '100000000000000000000',
    cohortReservedWei: '126000000000000000000',
  }), { status: 'DRIFT', mismatches: ['globalOutstanding'] });
});

test('shadow never treats overcommitment as approval or accepts malformed liabilities', () => {
  assert.deepEqual(compareRewardAdmissionShadow({
    ...snapshot,
    status: 'COHORT_OVERCOMMITTED',
  }, expected), { status: 'OVERCOMMITTED', mismatches: ['cohortBudget'] });
  assert.throws(() => compareRewardAdmissionShadow({
    ...snapshot,
    status: 'ENABLED',
  }, expected), /not hard-disabled/);
  for (const value of ['-1', '1.5', '1e18', '', '001', 'NaN']) {
    assert.throws(() => compareRewardAdmissionShadow({
      ...snapshot,
      originalOutstandingWei: value,
    }, expected), /Invalid exact Wei/);
  }
});

test('preview-only read does not replace existing reservation writer or payment authority', () => {
  const src = readFileSync(new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url), 'utf8');
  assert.match(src, /shouldReadRewardAdmissionShadow\(network, process\.env\)/);
  assert.match(src, /readStagedAdmissionFundingStatus/);
  assert.match(src, /compareRewardAdmissionShadow/);
  assert.match(src, /commit_reward_reservation_with_late_reserve/);
  assert.doesNotMatch(src, /commit_held_to_fixed_v1/);
  assert.match(src, /catch \(shadowError\)/);
});
