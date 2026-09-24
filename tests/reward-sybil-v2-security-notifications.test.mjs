import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SECURITY_NOTIFICATION_COPY,
} from '../src/lib/i18n/securityNotificationCopy.ts';
import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';

const migrationPath =
  'supabase/migrations/20260923060900_add_sybil_v2_security_notifications.sql';

test('Sybil v2 security notifications are history-only events', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /SECURITY_REVIEW_STARTED/u);
  assert.match(sql, /SECURITY_RESTRICTION_CONFIRMED/u);

  const ackStart = sql.indexOf(
    'create or replace function public.acknowledge_invite_notification_history',
  );
  assert.ok(ackStart >= 0);
  const ackSql = sql.slice(ackStart);

  assert.match(
    ackSql,
    /v_row\.kind not in \(\s*'SECURITY_REVIEW_STARTED',\s*'SECURITY_RESTRICTION_CONFIRMED'/u,
  );
  assert.match(
    ackSql,
    /perform public\.acknowledge_invite_notification_v2/u,
  );
});

test('pre-claim HOLD creates a neutral security-review notification', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /new\.state = 'HOLD'/u,
  );
  assert.match(
    sql,
    /'SECURITY_REVIEW_STARTED'/u,
  );
  assert.match(
    sql,
    /'preclaim-r' \|\| new\.revision::text/u,
  );
});

test('post-payout restriction notification never implies reward reversal', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const postStart = sql.indexOf(
    'create or replace function public.notify_sybil_v2_post_payout_security_history',
  );
  assert.ok(postStart >= 0);
  const postSql = sql.slice(postStart);

  assert.match(postSql, /new\.state = 'RESTRICTED'/u);
  assert.match(
    postSql,
    /'SECURITY_RESTRICTION_CONFIRMED'/u,
  );
  assert.doesNotMatch(
    postSql,
    /update public\.reward_payouts/u,
  );
  assert.doesNotMatch(
    postSql,
    /update public\.reward_queue_entries/u,
  );
});

test('every supported locale has reviewed security notification copy', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = SECURITY_NOTIFICATION_COPY[locale];

    assert.ok(copy, `missing security copy for ${locale}`);
    assert.ok(copy.reviewTitle.trim().length > 0);
    assert.ok(copy.reviewBody.trim().length > 0);
    assert.ok(copy.restrictionTitle.trim().length > 0);
    assert.ok(copy.restrictionBody.trim().length > 0);
  }
});

test('notification UI renders both security event kinds', async () => {
  const source = await readFile(
    'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
    'utf8',
  );

  assert.match(
    source,
    /case 'SECURITY_REVIEW_STARTED'/u,
  );
  assert.match(
    source,
    /case 'SECURITY_RESTRICTION_CONFIRMED'/u,
  );
  assert.match(
    source,
    /SECURITY_NOTIFICATION_COPY/u,
  );
});


test('security history events remain warm-cache compatible and directly QA-renderable', async () => {
  const [
    notifications,
    harness,
    review,
    directCoverage,
    registry,
  ] = await Promise.all([
    readFile('src/components/InAppInviteNotifications.tsx', 'utf8'),
    readFile('src/qa/QaNotificationStateHarness.tsx', 'utf8'),
    readFile('src/qa/QaNotificationI18nReview.tsx', 'utf8'),
    readFile('src/qa/directStateCoverage.ts', 'utf8'),
    readFile('src/qa/stateRegistry.ts', 'utf8'),
  ]);

  for (const kind of [
    'SECURITY_REVIEW_STARTED',
    'SECURITY_RESTRICTION_CONFIRMED',
  ]) {
    assert.match(
      notifications,
      new RegExp(`NOTIFICATION_HISTORY_KINDS[\\s\\S]*'${kind}'`, 'u'),
      `warm history cache must accept ${kind}`,
    );
  }

  for (const stateId of [
    'NOTI-SECURITY-REVIEW',
    'NOTI-SECURITY-RESTRICTED',
  ]) {
    assert.ok(harness.includes(stateId), `QA harness is missing ${stateId}`);
    assert.ok(review.includes(stateId), `i18n review is missing ${stateId}`);
    assert.ok(directCoverage.includes(stateId), `direct QA coverage is missing ${stateId}`);
    assert.ok(registry.includes(stateId), `QA registry is missing ${stateId}`);
  }
});
