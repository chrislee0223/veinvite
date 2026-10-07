import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cron = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);
const vercel = JSON.parse(
  await readFile(
    new URL('../vercel.json', import.meta.url),
    'utf8',
  ),
);

test('reward boost reserve rebalances from the existing vote cron every 30 minutes', () => {
  assert.match(
    cron,
    /REWARD_BOOST_REBALANCE_INTERVAL_SECONDS\s*=\s*30 \* 60/,
  );
  assert.match(
    cron,
    /vote-reconcile:reward-boost-reserve/,
  );
  assert.match(
    cron,
    /tryClaimCronJob\([\s\S]*REWARD_BOOST_REBALANCE_JOB[\s\S]*REWARD_BOOST_REBALANCE_INTERVAL_SECONDS/,
  );
});

test('allocation receipts refresh before reserve rebalance and before reward recovery', () => {
  const syncIndex = cron.indexOf(
    'await syncVeInviteAllocationReceipts()',
  );
  const rebalanceIndex = cron.indexOf(
    'await runRewardBoostReserveRebalance()',
  );
  const recoveryIndex = cron.indexOf(
    'const voteTriggeredRecovery',
  );

  assert.ok(syncIndex >= 0);
  assert.ok(rebalanceIndex > syncIndex);
  assert.ok(recoveryIndex > rebalanceIndex);
});

test('reserve rebalance heartbeat releases failed work for the next minute retry', () => {
  assert.match(
    cron,
    /markCronJobSucceeded\([\s\S]*REWARD_BOOST_REBALANCE_JOB/,
  );
  assert.match(
    cron,
    /markCronJobFailed\([\s\S]*REWARD_BOOST_REBALANCE_JOB/,
  );
  assert.match(
    cron,
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
