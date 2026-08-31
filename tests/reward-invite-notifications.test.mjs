import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveInviteNotification,
  selectUnreadInviteNotification,
} from '../src/lib/notifications/inviteNotificationState.ts';

const BASE_INVITE = {
  invite_code: 'ABCDEFG',
  invitee_wallet: '0x1111111111111111111111111111111111111111',
  status: 'ACTIVATING',
  updated_at: '2026-08-31T00:00:00.000Z',
  activated_at: '2026-08-31T00:00:00.000Z',
  apps_completed: 0,
  apps_completed_at: null,
  vot3_converted: false,
  vot3_converted_at: null,
  vote_completed: false,
  vote_completed_at: null,
  reward_status: 'PENDING',
};

test('does not create extra progress notifications for one or two dApps', () => {
  for (const appsCompleted of [1, 2]) {
    const notification = deriveInviteNotification(
      {
        ...BASE_INVITE,
        apps_completed: appsCompleted,
      },
      null,
    );

    assert.equal(notification?.kind, 'INVITE_ACCEPTED');

    const unread = selectUnreadInviteNotification([
      {
        notification,
        acknowledgedStage: 1,
      },
    ]);

    assert.equal(unread.notification, null);
    assert.equal(unread.unreadCount, 0);
  }
});

test('creates the dApp milestone only after three distinct-app completions are recorded', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'DAPP_MISSION_COMPLETED');
  assert.equal(notification?.stage, 2);
});

test('collapses unseen dApp and VOT3 progress into the latest meaningful update', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'VOT3_CONVERTED');

  const unread = selectUnreadInviteNotification([
    {
      notification,
      acknowledgedStage: 1,
    },
  ]);

  assert.equal(unread.notification?.collapsedProgress, true);
  assert.equal(unread.notification?.stage, 3);
});

test('shows all-missions-complete instead of earlier milestones after the governance vote', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
      status: 'UNDER_REVIEW',
    },
    null,
  );

  assert.equal(notification?.kind, 'ALL_MISSIONS_COMPLETED');
  assert.equal(notification?.stage, 4);
});

test('reward notification requires finalized paid payout evidence and uses the actual payout amount', () => {
  const paidInvite = {
    ...BASE_INVITE,
    apps_completed: 3,
    apps_completed_at: '2026-08-31T01:00:00.000Z',
    vot3_converted: true,
    vot3_converted_at: '2026-08-31T02:00:00.000Z',
    vote_completed: true,
    vote_completed_at: '2026-08-31T03:00:00.000Z',
    status: 'COMPLETED',
    reward_status: 'PAID',
  };

  const withoutFinalizedPayout = deriveInviteNotification(
    paidInvite,
    null,
  );
  assert.equal(
    withoutFinalizedPayout?.kind,
    'ALL_MISSIONS_COMPLETED',
  );

  const notification = deriveInviteNotification(
    paidInvite,
    {
      invite_code: BASE_INVITE.invite_code,
      amount_wei: '123450000000000000000',
      status: 'PAID',
      tx_id: `0x${'a'.repeat(64)}`,
      paid_at: '2026-08-31T04:00:00.000Z',
    },
  );

  assert.equal(notification?.kind, 'REWARD_PAID');
  assert.equal(notification?.stage, 5);
  assert.equal(
    notification?.rewardAmountWei,
    '123450000000000000000',
  );
});

test('a paid reward outranks lower-priority unread progress from another invitation', () => {
  const progress = deriveInviteNotification(
    {
      ...BASE_INVITE,
      invite_code: 'BCDEFGH',
      apps_completed: 3,
      apps_completed_at: '2026-08-31T05:00:00.000Z',
    },
    null,
  );
  const paid = deriveInviteNotification(
    {
      ...BASE_INVITE,
      invite_code: 'CDEFGHJ',
      status: 'COMPLETED',
      reward_status: 'PAID',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
    },
    {
      invite_code: 'CDEFGHJ',
      amount_wei: '1000000000000000000',
      status: 'PAID',
      tx_id: `0x${'b'.repeat(64)}`,
      paid_at: '2026-08-31T04:00:00.000Z',
    },
  );

  const selected = selectUnreadInviteNotification([
    { notification: progress, acknowledgedStage: 0 },
    { notification: paid, acknowledgedStage: 0 },
  ]);

  assert.equal(selected.notification?.kind, 'REWARD_PAID');
  assert.equal(selected.unreadCount, 2);
});

test('forfeited referrals do not surface stale success notifications', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
      reward_status: 'FORFEITED',
    },
    null,
  );

  assert.equal(notification, null);
});
