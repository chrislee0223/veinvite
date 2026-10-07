import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cron = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);
const scheduler = await readFile(
  new URL('../src/lib/rewards/rewardBoostReserveScheduler.ts', import.meta.url),
  'utf8',
);
const vercel = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('reward boost reserve scheduler runs at most every 30 minutes', () => {
  assert.match(
    scheduler,
    /REWARD_BOOST_REBALANCE_INTERVAL_SECONDS\s*=\s*30 \* 60/,
  );
  assert.match(
    scheduler,
    /vote-reconcile:reward-boost-reserve/,
  );
  assert.match(
    scheduler,
    /tryClaimCronJob\([\s\S]*REWARD_BOOST_REBALANCE_JOB[\s\S]*REWARD_BOOST_REBALANCE_INTERVAL_SECONDS/,
  );
});

test('allocation receipts refresh before reserve rebalance and reward maintenance runs before reward recovery', () => {
  const syncIndex = scheduler.indexOf(
    'await syncVeInviteAllocationReceipts()',
  );
  const rebalanceIndex = scheduler.indexOf(
    'await runRewardBoostReserveRebalance()',
  );
  const scheduleIndex = cron.indexOf(
    'await runScheduledRewardMaintenance()',
  );
  const recoveryIndex = cron.indexOf(
    'const voteTriggeredRecovery',
  );

  assert.ok(syncIndex >= 0);
  assert.ok(rebalanceIndex > syncIndex);
  assert.ok(scheduleIndex >= 0);
  assert.ok(recoveryIndex > scheduleIndex);
});

test('reserve rebalance heartbeat releases failed work for the next minute retry', () => {
  assert.match(
    scheduler,
    /markCronJobSucceeded\([\s\S]*REWARD_BOOST_REBALANCE_JOB/,
  );
  assert.match(
    scheduler,
    /markCronJobFailed\([\s\S]*REWARD_BOOST_REBALANCE_JOB/,
  );
  assert.match(
    scheduler,
    /REWARD_BOOST_RESERVE_REBALANCE_FAILED/,
  );
});

test('reserve automation reuses the existing minute cron instead of adding a new Vercel cron', () => {
  const cronPaths = (vercel.crons ?? []).map(
    (entry) => entry.path,
  );
  assert.equal(
    cronPaths.includes('/api/cron/reward-boost-reserve'),
    false,
  );
  assert.equal(
    cronPaths.includes('/api/cron/vote-reconcile'),
    true,
  );
});


test('intentional reward runtime closure skips reserve work without failing the cron', () => {
  assert.match(
    scheduler,
    /readRewardRuntimeSafety/,
  );
  assert.match(
    scheduler,
    /runtime\.emergencyRewardsPaused/,
  );
  assert.match(
    scheduler,
    /!runtime\.mainnetFundedRewardsEnabled/,
  );
  assert.match(
    scheduler,
    /skippedReason: 'RUNTIME_CLOSED'/,
  );
  assert.match(
    scheduler,
    /markCronJobSucceeded\([\s\S]*REWARD_BOOST_REBALANCE_JOB/,
  );
});
