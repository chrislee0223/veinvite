import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REWARD_ACTION_IDLE_POLL_MS,
  REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
  getRewardActionPollingMode,
  rewardActionPollingIntervalMs,
} from '../src/lib/notifications/rewardActionPolling.ts';

function action(overrides = {}) {
  return {
    inviteCode: 'ABC2345',
    status: 'AWAITING_CLAIM',
    reservedAmountWei: '1',
    reservedAt: '2026-09-30T00:00:00.000Z',
    friendWallet: null,
    broadcastConfirmedAt: null,
    txId: null,
    ...overrides,
  };
}

test('awaiting Claim stays on the idle polling cadence', () => {
  const mode = getRewardActionPollingMode([
    action(),
  ]);

  assert.equal(mode, 'idle');
  assert.equal(
    rewardActionPollingIntervalMs(mode),
    REWARD_ACTION_IDLE_POLL_MS,
  );
  assert.equal(REWARD_ACTION_IDLE_POLL_MS, 60_000);
});

test('queued reward polls quickly until canonical transfer metadata is complete', () => {
  for (const candidate of [
    action({
      status: 'QUEUED',
    }),
    action({
      status: 'QUEUED',
      broadcastConfirmedAt: '2026-09-30T00:01:00.000Z',
    }),
    action({
      status: 'ASSIGNED',
      txId: `0x${'1'.repeat(64)}`,
    }),
  ]) {
    const mode = getRewardActionPollingMode([candidate]);
    assert.equal(mode, 'pending-transfer');
    assert.equal(
      rewardActionPollingIntervalMs(mode),
      REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
    );
  }

  assert.equal(
    REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
    5_000,
  );
});

test('canonical transfer confirmation returns polling to the idle cadence', () => {
  const confirmed = action({
    status: 'ASSIGNED',
    broadcastConfirmedAt: '2026-09-30T00:01:00.000Z',
    txId: `0x${'2'.repeat(64)}`,
  });

  const mode = getRewardActionPollingMode([
    confirmed,
  ]);

  assert.equal(mode, 'idle');
  assert.equal(
    rewardActionPollingIntervalMs(mode),
    REWARD_ACTION_IDLE_POLL_MS,
  );
});

test('any still-unconfirmed transfer keeps a mixed action list on the fast cadence', () => {
  const mode = getRewardActionPollingMode([
    action(),
    action({
      status: 'ASSIGNED',
      broadcastConfirmedAt: '2026-09-30T00:01:00.000Z',
      txId: `0x${'3'.repeat(64)}`,
    }),
    action({
      status: 'QUEUED',
      broadcastConfirmedAt: '2026-09-30T00:02:00.000Z',
      txId: null,
    }),
  ]);

  assert.equal(mode, 'pending-transfer');
});
