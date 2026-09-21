import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [
  finalityQueue,
  rewardActionType,
  rewardActionRoute,
  notificationCenter,
  operationsMonitoring,
] = await Promise.all([
  read('src/app/api/queues/reward-finality/route.ts'),
  read('src/lib/notifications/rewardAction.ts'),
  read('src/app/api/notifications/reward-actions/route.ts'),
  read('src/components/UnifiedInviteNotificationHistoryCenter.tsx'),
  read('src/lib/rewards/operationsMonitoring.ts'),
]);

test('finality queue drains multiple already-finalized payouts without weakening retry safety', () => {
  assert.match(finalityQueue, /const maxSettlementPasses = 6/);
  assert.match(
    finalityQueue,
    /result\.submittedRecovery\?\.status === 'PAID'/,
  );
  assert.match(
    finalityQueue,
    /recoveredPaidRound && transferWorkerIdle[\s\S]*continue;/,
  );
  assert.match(
    finalityQueue,
    /needsDurableClaimPayoutContinuation\(result\)/,
  );
  assert.match(
    finalityQueue,
    /bounded settlement-drain limit/,
  );
  assert.match(
    finalityQueue,
    /readClaimPayoutManualIntervention\(result\)/,
  );
});

test('reward actions expose only canonically confirmed broadcast metadata', () => {
  assert.match(
    rewardActionType,
    /broadcastConfirmedAt: string \| null;/,
  );
  assert.match(rewardActionType, /txId: string \| null;/);
  assert.match(
    rewardActionRoute,
    /assigned_round_id/,
  );
  assert.match(
    rewardActionRoute,
    /reward_payout_transaction_submissions/,
  );
  assert.match(
    rewardActionRoute,
    /broadcastConfirmedAt &&[\s\S]*submission\?\.tx_id/,
  );
  assert.match(
    rewardActionRoute,
    /broadcastConfirmedAt,[\s\S]*txId,/,
  );
});

test('notification UI distinguishes sent rewards from ordinary payout processing', () => {
  assert.match(
    notificationCenter,
    /const transferConfirmed = Boolean\([\s\S]*action\.broadcastConfirmedAt[\s\S]*action\.txId/,
  );
  assert.match(notificationCenter, />B3TR TX</);
  assert.match(
    notificationCenter,
    /transferConfirmed[\s\S]*progressCopy\.finalCheck[\s\S]*progressCopy\.claimQueued/,
  );
});

test('reward operations monitoring observes the oldest open round', () => {
  const activeRoundStart = operationsMonitoring.indexOf(
    ".from('reward_rounds')",
  );
  const signedStart = operationsMonitoring.indexOf(
    ".from('reward_payout_signed_transactions')",
  );
  assert.ok(activeRoundStart >= 0);
  assert.ok(signedStart > activeRoundStart);

  const activeRoundQuery = operationsMonitoring.slice(
    activeRoundStart,
    signedStart,
  );
  assert.match(
    activeRoundQuery,
    /\.in\('status', \['CREATED', 'PAYING'\]\)[\s\S]*\.order\('id', \{[\s\S]*ascending: true/,
  );
});
