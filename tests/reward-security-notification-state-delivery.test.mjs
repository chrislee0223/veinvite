import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INVITER_HOLD_NOTIFICATION_COPY,
} from '../src/lib/i18n/inviterHoldNotificationCopy.ts';
import {
  SECURITY_REVIEW_CLEARED_COPY,
} from '../src/lib/i18n/securityReviewClearedCopy.ts';
import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('security history is recipient-aware and completes HOLD outcomes', async () => {
  const [sql, reinstatementSql] = await Promise.all([
    read(
      'supabase/migrations/20261002053000_complete_security_notification_state_delivery.sql',
    ),
    read(
      'supabase/migrations/20261002065500_deliver_invitee_reinstatement_notification.sql',
    ),
  ]);

  assert.match(sql, /add column if not exists recipient_wallet text/u);
  assert.match(sql, /SECURITY_REVIEW_CLEARED/u);
  assert.match(
    sql,
    /new\.state = 'CLEAR'[\s\S]*old\.state in \('HOLD', 'RESTRICTED'\)/u,
  );
  assert.match(
    sql,
    /v_kind in \([\s\S]*'SECURITY_REVIEW_STARTED'[\s\S]*'SECURITY_REVIEW_CLEARED'[\s\S]*'SECURITY_RESTRICTION_CONFIRMED'/u,
  );
  assert.match(
    reinstatementSql,
    /'SECURITY_REFERRAL_RESTORED'[\s\S]*then 'SECURITY_REVIEW_CLEARED'/u,
  );
  assert.match(sql, /coalesce\(h\.recipient_wallet, h\.inviter_wallet\) = v_wallet/u);
});

test('very short HOLD to BLOCK transitions are hidden from visible history', async () => {
  const sql = await read(
    'supabase/migrations/20261002053000_complete_security_notification_state_delivery.sql',
  );

  assert.match(
    sql,
    /h\.kind = 'SECURITY_REVIEW_STARTED'[\s\S]*later\.kind = 'SECURITY_RESTRICTION_CONFIRMED'[\s\S]*interval '10 seconds'/u,
  );
  assert.match(
    sql,
    /h\.kind = 'SECURITY_INVITER_HOLD'[\s\S]*later\.kind = 'SECURITY_INVITER_RESTRICTED'[\s\S]*interval '10 seconds'/u,
  );
});

test('wallet restriction state refreshes without requiring a page reload', async () => {
  const [gate, liveRestriction, visibleRefresh] = await Promise.all([
    read('src/components/WalletSessionGate.tsx'),
    read('src/hooks/useLiveWalletRestriction.ts'),
    read('src/hooks/useVisiblePeriodicRefresh.ts'),
  ]);

  assert.match(gate, /useLiveWalletRestriction<RestrictionKind>/u);
  assert.match(liveRestriction, /const RESTRICTION_REFRESH_MS = 30_000/u);
  assert.match(liveRestriction, /await readRestriction\(\)/u);
  assert.match(liveRestriction, /setRestrictionKind\(\(current\) =>/u);
  assert.match(liveRestriction, /SECURITY_STATUS_CHANGED_EVENT/u);
  assert.match(visibleRefresh, /'visibilitychange'/u);
  assert.match(visibleRefresh, /'focus'/u);
  assert.match(visibleRefresh, /'pageshow'/u);
  assert.match(
    liveRestriction,
    /must never silently unlock a held or blocked wallet/u,
  );
});

test('notification history follows security changes promptly and accepts CLEAR results', async () => {
  const [notifications, visibleRefresh] = await Promise.all([
    read('src/components/InAppInviteNotifications.tsx'),
    read('src/hooks/useVisiblePeriodicRefresh.ts'),
  ]);

  assert.match(notifications, /const REFRESH_MS = 30_000/u);
  assert.match(
    notifications,
    /NOTIFICATION_HISTORY_KINDS[\s\S]*'SECURITY_REVIEW_CLEARED'/u,
  );
  assert.match(notifications, /SECURITY_STATUS_CHANGED_EVENT/u);
  assert.match(notifications, /useVisiblePeriodicRefresh/u);
  assert.match(visibleRefresh, /'visibilitychange'/u);
  assert.match(visibleRefresh, /'focus'/u);
  assert.match(visibleRefresh, /'pageshow'/u);
});

test('new unread security history auto-opens once without changing the notification UI', async () => {
  const notifications = await read(
    'src/components/InAppInviteNotifications.tsx',
  );

  assert.match(
    notifications,
    /function notificationRequiresAutoOpen[\s\S]*readAt === null[\s\S]*startsWith\('SECURITY_'\)/u,
  );
  assert.match(
    notifications,
    /lastAutoOpenedSecurityHistoryIdRef/u,
  );
  assert.match(
    notifications,
    /history\.items\.filter\(notificationRequiresAutoOpen\)/u,
  );
  assert.match(
    notifications,
    /lastAutoOpenedSecurityHistoryIdRef\.current !== latestSecurityId/u,
  );
  assert.match(
    notifications,
    /isWalletModalOpen[\s\S]*hasBlockingDialogOpen\(\)[\s\S]*notificationCenterIsClosing\(\)/u,
  );
  assert.match(
    notifications,
    /lastAutoOpenedSecurityHistoryIdRef\.current = latestSecurityId[\s\S]*setOpen\(true\)/u,
  );
  assert.match(
    notifications,
    /\(cached\?\.items \?\? \[\]\)\.filter\(notificationRequiresAutoOpen\)/u,
  );
});

test('transient HOLD debounce remains authoritative before security auto-open', async () => {
  const debounce = await read(
    'supabase/migrations/20261002102500_debounce_transient_security_hold_notifications.sql',
  );

  assert.match(
    debounce,
    /clock_timestamp\(\) - interval '10 seconds'/u,
  );
  assert.match(
    debounce,
    /SECURITY_REVIEW_STARTED/u,
  );
  assert.match(
    debounce,
    /SECURITY_RESTRICTION_CONFIRMED/u,
  );
  assert.match(
    debounce,
    /SECURITY_REVIEW_CLEARED/u,
  );
});

test('new security outcome copy is localized for every supported locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const cleared = SECURITY_REVIEW_CLEARED_COPY[locale];
    const hold = INVITER_HOLD_NOTIFICATION_COPY[locale];

    assert.ok(cleared, `missing review-cleared copy for ${locale}`);
    assert.ok(hold, `missing inviter HOLD copy for ${locale}`);
    assert.ok(cleared.title.trim().length > 0);
    assert.ok(cleared.body.trim().length > 0);
    assert.ok(hold.title.trim().length > 0);
    assert.ok(hold.body.trim().length > 0);
  }
});
