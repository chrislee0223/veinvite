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
  const sql = await read(
    'supabase/migrations/20261002053000_complete_security_notification_state_delivery.sql',
  );

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
  assert.match(sql, /h\.recipient_wallet = v_wallet/u);
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
  const gate = await read('src/components/WalletSessionGate.tsx');

  assert.match(gate, /const RESTRICTION_REFRESH_MS = 30_000/u);
  assert.match(gate, /const refreshRestrictionState = useCallback/u);
  assert.match(gate, /await readWalletRestriction\(\)/u);
  assert.match(gate, /setRestrictionKind\(\(current\) =>/u);
  assert.match(gate, /SECURITY_STATUS_CHANGED_EVENT/u);
  assert.match(gate, /'visibilitychange'/u);
  assert.match(gate, /'focus'/u);
  assert.match(gate, /'pageshow'/u);
  assert.match(
    gate,
    /failed refresh must never silently unlock a held or blocked wallet/u,
  );
});

test('notification history follows security changes promptly and accepts CLEAR results', async () => {
  const notifications = await read(
    'src/components/InAppInviteNotifications.tsx',
  );

  assert.match(notifications, /const REFRESH_MS = 30_000/u);
  assert.match(
    notifications,
    /NOTIFICATION_HISTORY_KINDS[\s\S]*'SECURITY_REVIEW_CLEARED'/u,
  );
  assert.match(notifications, /SECURITY_STATUS_CHANGED_EVENT/u);
  assert.match(notifications, /'visibilitychange'/u);
  assert.match(notifications, /'focus'/u);
  assert.match(notifications, /'pageshow'/u);
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
