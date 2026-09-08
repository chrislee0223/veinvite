import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(
  join(root, 'src/lib/notifications/inviteNotificationState.ts'),
  'utf8',
);
const notificationModule = await import(
  `../src/lib/notifications/inviteNotificationState.ts?test=${Date.now()}`
);
const {
  deriveInviteNotification,
  selectUnreadInviteNotification,
} = notificationModule;

const BASE_INVITE = {
  invite_code: 'ABCDEFG',
  invitee_wallet: `0x${'1'.repeat(40)}`,
  status: 'ACCEPTED',
  updated_at: '2026-08-31T00:00:00.000Z',
  activated_at: '2026-08-31T00:00:00.000Z',
  apps_completed: 0,
  apps_completed_at: null,
  vot3_converted: false,
  vot3_converted_at: null,
  vote_completed: false,
  vote_completed_at: null,
  reward_status: 'PENDING',
  ineligibility_check_id: null,
  ineligible_at: null,
};

test('does not create extra progress notifications for one or two dApps', () => {
  const one = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 1,
    },
    null,
  );
  const two = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 2,
    },
    null,
  );

  assert.equal(one?.kind, 'INVITE_ACCEPTED');
  assert.equal(two?.kind, 'INVITE_ACCEPTED');
  assert.doesNotMatch(source, /apps_completed\s*===\s*1/);
  assert.doesNotMatch(source, /apps_completed\s*===\s*2/);
});

test('does not claim downstream milestones are complete while the dApp mission is incomplete', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 2,
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'INVITE_ACCEPTED');
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
  assert.equal(notification?.stage, 3);
  assert.equal(notification?.eventAt, '2026-08-31T02:00:00.000Z');
});

test('uses the later dApp completion time when conversion happened first', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T03:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'VOT3_CONVERTED');
  assert.equal(notification?.eventAt, '2026-08-31T03:00:00.000Z');
});

test('shows all-missions-complete only after all three milestones exist and final checks are pending', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'ALL_MISSIONS_COMPLETED');
  assert.equal(notification?.stage, 4);
});

test('all-missions event time reflects the milestone that actually completed last', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T04:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
    },
    null,
  );

  assert.equal(notification?.kind, 'ALL_MISSIONS_COMPLETED');
  assert.equal(notification?.eventAt, '2026-08-31T04:00:00.000Z');
});

test('does not say final checks are still running after the referral is already eligible', () => {
  const notification = deriveInviteNotification(
    {
      ...BASE_INVITE,
      apps_completed: 3,
      apps_completed_at: '2026-08-31T01:00:00.000Z',
      vot3_converted: true,
      vot3_converted_at: '2026-08-31T02:00:00.000Z',
      vote_completed: true,
      vote_completed_at: '2026-08-31T03:00:00.000Z',
      reward_status: 'ELIGIBLE',
    },
    null,
  );

  assert.equal(notification, null);
});

test('reward notification requires finalized paid payout evidence and uses the actual payout amount', () => {
  const invitation = {
    ...BASE_INVITE,
    status: 'COMPLETED',
    reward_status: 'PAID',
  };

  assert.equal(deriveInviteNotification(invitation, null), null);
  assert.equal(
    deriveInviteNotification(invitation, {
      invite_code: 'ABCDEFG',
      amount_wei: '1000000000000000000',
      status: 'PAID',
      tx_id: null,
      paid_at: '2026-08-31T04:00:00.000Z',
    }),
    null,
  );

  const paid = deriveInviteNotification(invitation, {
    invite_code: 'ABCDEFG',
    amount_wei: '1000000000000000000',
    status: 'PAID',
    tx_id: `0x${'a'.repeat(64)}`,
    paid_at: '2026-08-31T04:00:00.000Z',
  });

  assert.equal(paid?.kind, 'REWARD_PAID');
  assert.equal(paid?.stage, 5);
  assert.equal(paid?.rewardAmountWei, '1000000000000000000');
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

test('forfeited accepted referrals replace stale success with the terminal ineligible notice', () => {
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

  assert.equal(notification?.kind, 'INVITE_INELIGIBLE');
  assert.equal(notification?.stage, 6);
  assert.equal(notification?.eventAt, BASE_INVITE.updated_at);
  assert.equal(notification?.rewardAmountWei, null);
});
