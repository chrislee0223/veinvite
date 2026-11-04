import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeRewardActivationReadiness as evaluate } from '../src/lib/rewards/rewardActivationReadiness.ts';

const E = 10n ** 18n;
const input = (patch = {}) => ({
  nowMs: Date.parse('2026-11-05T00:00:00Z'),
  latestForecastAt: '2026-11-04T23:55:00Z',
  liveOnchainPoolWei: String(8031n * E),
  sourceRetainedProtectionWei: '1685176573610723997917',
  recentCohortProtectedWei: '1930343858415207913627',
  bankBalanceWei: '232691422597025366016',
  bankStressReserveWei: '232691422597025366016',
  ordinaryBoostAvailableWei: '0',
  sourceOverrunCount: 0,
  destinationOverrunCount: 0,
  unprotectedMatureSourceCount: 0,
  conservationOk: true,
  stressReserveCovered: true,
  unreviewedUnpaidInvites: 24,
  eligibleUnpaidInvites: 0,
  threeAppsVoteMissingInvites: 4,
  admissionBridgeStatus: 'STAGING_DISABLED',
  distributionPaused: false,
  ...patch,
});

test('live readiness exposes historical protection exactly and never authorizes money', () => {
  const result = evaluate(input());
  assert.equal(result.mode, 'READ_ONLY');
  assert.equal(result.canActivate, false);
  assert.equal(result.canSign, false);
  assert.equal(result.canReleaseHistoricalProtection, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.transfersPerformed, false);
  assert.equal(result.historicalProtectedSnapshotWei, '3615520432020931911544');
  assert.equal(result.bankBalanceWei, result.bankStressReserveWei);
  assert.equal(result.ordinaryBoostAvailableWei, '0');
  assert.ok(result.blockers.includes('NO_FREE_RESERVE_BANK_CAPACITY'));
  assert.ok(result.blockers.includes('UNREVIEWED_UNPAID_INVITES'));
  assert.ok(result.blockers.includes('ADMISSION_WRITER_AND_PAYOUT_NOT_AUTHORIZED'));
});

test('fully clean accounting still cannot activate hard-disabled admission', () => {
  const result = evaluate(input({
    sourceRetainedProtectionWei: '0',
    recentCohortProtectedWei: '0',
    bankBalanceWei: '500',
    bankStressReserveWei: '100',
    ordinaryBoostAvailableWei: '400',
    unreviewedUnpaidInvites: 0,
    threeAppsVoteMissingInvites: 0,
  }));
  assert.deepEqual(result.blockers, ['ADMISSION_WRITER_AND_PAYOUT_NOT_AUTHORIZED']);
  assert.equal(result.canActivate, false);
});

test('bad ledger, missing stress, stale snapshots and overcommit block diagnosis', () => {
  const result = evaluate(input({
    nowMs: Date.parse('2026-11-06T00:00:00Z'),
    sourceOverrunCount: 1,
    conservationOk: false,
    stressReserveCovered: false,
    bankBalanceWei: '1',
    bankStressReserveWei: '2',
    ordinaryBoostAvailableWei: '0',
    admissionBridgeStatus: 'COHORT_OVERCOMMITTED',
    distributionPaused: true,
  }));
  for (const flag of [
    'POOL_OBSERVATION_STALE', 'RESERVE_LEDGER_DRIFT', 'STRESS_RESERVE_UNCOVERED',
    'COHORT_OVERCOMMITTED', 'DISTRIBUTION_PAUSED',
  ]) assert.ok(result.blockers.includes(flag), flag);
});

test('rejects invalid exact amounts, inconsistent bank arithmetic, unsafe counters and unknown scope', () => {
  for (const wrong of ['-1', '1.5', '1e18', '001', '', 'Infinity']) {
    assert.throws(() => evaluate(input({ liveOnchainPoolWei: wrong })), /Invalid exact Wei/);
  }
  assert.throws(() => evaluate(input({ bankBalanceWei: '100', ordinaryBoostAvailableWei: '20' })), /inconsistent/);
  assert.throws(() => evaluate(input({ unreviewedUnpaidInvites: -1 })), /readiness count/);
  assert.throws(() => evaluate(input({ unreviewedUnpaidInvites: 2, threeAppsVoteMissingInvites: 4 })), /subset/);
  assert.throws(() => evaluate(input({ admissionBridgeStatus: 'ENABLED' })), /Unreviewed bridge state/);
});

test('operator route requires signed wallet, live chain, service-only RPC and fail-closed errors', () => {
  const src = readFileSync(new URL('../src/app/api/admin/rewards/admission-readiness/route.ts', import.meta.url), 'utf8');
  assert.match(src, /requireWalletSession\(\{ request \}\)/);
  assert.match(src, /canOperateVeInviteRewards\(session\.walletAddress, pool\)/);
  assert.match(src, /readVeInviteRewardPoolStatus\(\)/);
  assert.match(src, /readStagedAdmissionFundingStatus/);
  assert.match(src, /read_reward_boost_reserve_audit_snapshot/);
  assert.match(src, /sourceRetainedProtectionWei: requiredString/);
  assert.match(src, /503, headers: HEADERS/);
  assert.match(src, /'Cache-Control': 'no-store'/);
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|commit_held_to_fixed_v1|sendTransaction|create_reward_x_promotion_payout_intent/);
  assert.ok(src.indexOf('requireWalletSession({ request })') < src.indexOf('readVeInviteRewardPoolStatus()'));
  assert.ok(src.indexOf('canOperateVeInviteRewards(session.walletAddress, pool)') < src.indexOf("supabaseAdmin.rpc('read_reward_boost_reserve_audit_snapshot'"));
});
