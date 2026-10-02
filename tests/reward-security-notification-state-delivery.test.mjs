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
      'supabase/migrations/20261002054758_complete_security_notification_state_delivery.sql',
    ),
    read(
      'supabase/migrations/20261002065105_deliver_invitee_reinstatement_notification.sql',
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

test('very short HOLD outcomes are delayed and collapsed to the final result', async () => {
  const sql = await read(
    'supabase/migrations/20261002102428_debounce_transient_security_hold_notifications.sql',
  );

  assert.match(
    sql,
    /h\.kind not in \('SECURITY_REVIEW_STARTED', 'SECURITY_POST_PAYOUT_REVIEW_STARTED', 'SECURITY_INVITER_HOLD'\)[\s\S]*clock_timestamp\(\) - interval '10 seconds'/u,
  );
  assert.match(
    sql,
    /h\.kind = 'SECURITY_REVIEW_STARTED'[\s\S]*later\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED'\)[\s\S]*interval '10 seconds'/u,
  );
  assert.match(
    sql,
    /h\.kind = 'SECURITY_INVITER_HOLD'[\s\S]*later\.kind in \('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED'\)[\s\S]*interval '10 seconds'/u,
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
