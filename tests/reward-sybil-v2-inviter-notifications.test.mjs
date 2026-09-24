import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INVITER_SECURITY_NOTIFICATION_COPY,
} from '../src/lib/i18n/inviterSecurityNotificationCopy.ts';
import {
  SUPPORTED_LOCALES,
} from '../src/lib/i18n/locales.ts';

const migrationPath =
  'supabase/migrations/20260924172000_add_sybil_v2_inviter_notifications.sql';

test('inviter security lifecycle kinds are persisted and security-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const kind of [
    'SECURITY_INVITER_WATCH',
    'SECURITY_INVITER_HOLD',
    'SECURITY_INVITER_RESTRICTED',
    'SECURITY_INVITER_ACCESS_RESTORED',
  ]) {
    assert.match(sql, new RegExp(kind, 'u'));
  }

  assert.match(sql, /v_row\.kind not like 'SECURITY_%'/u);
});

test('first confirmed incident does not add a duplicate security warning', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  const start = sql.indexOf(
    'create or replace function public.notify_sybil_v2_inviter_incident_history',
  );
  const end = sql.indexOf(
    'revoke all on function public.notify_sybil_v2_inviter_incident_history',
    start,
  );
  assert.ok(start >= 0 && end > start);
  const fn = sql.slice(start, end);

  assert.match(fn, /v_posture\.posture = 'WATCH'/u);
  assert.match(fn, /v_posture\.posture = 'HOLD'/u);
  assert.doesNotMatch(fn, /SECURITY_INVITER_RECORDED/u);
});

test('WATCH and HOLD notifications only fire on the escalation transition', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /v_previous_count := greatest\(v_posture\.incident_count_90d - 1, 0\)/u);
  assert.match(sql, /v_previous_hold :=[\s\S]*v_previous_count >= 3[\s\S]*v_previous_strong > 0/u);
  assert.match(sql, /v_posture\.posture = 'HOLD'[\s\S]*not v_previous_hold/u);
  assert.match(sql, /v_posture\.posture = 'WATCH'[\s\S]*v_previous_count < 2/u);
});

test('operator decisions and reinstatement create inviter result notifications', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /new\.decision = 'CLEAR'[\s\S]*SECURITY_INVITER_ACCESS_RESTORED/u);
  assert.match(sql, /new\.decision = 'RESTRICT'[\s\S]*SECURITY_INVITER_RESTRICTED/u);
  assert.match(sql, /sybil_v2_inviter_reinstatement_events/u);
  assert.match(sql, /SECURITY_INVITER_ACCESS_RESTORED[\s\S]*inviter-reinstated-/u);
});

test('operator monitoring warns on WATCH and keeps HOLD review alerts', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /'recordedInviters', v_recorded/u);
  assert.match(sql, /'watchInviters', v_watch/u);
  assert.match(sql, /'SYBIL_V2_INVITER_WATCH'/u);
  assert.match(sql, /'SYBIL_V2_INVITER_REVIEW_REQUIRED'/u);
  assert.match(sql, /'SYBIL_V2_INVITER_REVIEW_OVER_48H'/u);
});

test('history UI and live surface render all inviter security lifecycle kinds', async () => {
  const [history, surface] = await Promise.all([
    readFile(
      'src/components/UnifiedInviteNotificationHistoryCenter.tsx',
      'utf8',
    ),
    readFile(
      'src/components/InviteNotificationSurfaceV2.tsx',
      'utf8',
    ),
  ]);

  for (const source of [history, surface]) {
    assert.match(source, /INVITER_SECURITY_NOTIFICATION_COPY/u);
    assert.match(source, /SECURITY_INVITER_WATCH/u);
    assert.match(source, /SECURITY_INVITER_HOLD/u);
    assert.match(source, /SECURITY_INVITER_RESTRICTED/u);
    assert.match(source, /SECURITY_INVITER_ACCESS_RESTORED/u);
  }
});

test('warm notification cache accepts every inviter security lifecycle kind', async () => {
  const source = await readFile(
    'src/components/InAppInviteNotifications.tsx',
    'utf8',
  );

  for (const kind of [
    'SECURITY_INVITER_WATCH',
    'SECURITY_INVITER_HOLD',
    'SECURITY_INVITER_RESTRICTED',
    'SECURITY_INVITER_ACCESS_RESTORED',
  ]) {
    assert.match(
      source,
      new RegExp(`NOTIFICATION_HISTORY_KINDS[\\s\\S]*'${kind}'`, 'u'),
    );
  }
});

test('localized inviter security copy covers every supported locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = INVITER_SECURITY_NOTIFICATION_COPY[locale];
    assert.ok(copy, `missing inviter security copy for ${locale}`);

    for (const field of [
      'watchTitle',
      'watchBody',
      'holdTitle',
      'holdBody',
      'restrictedTitle',
      'restrictedBody',
      'restoredTitle',
      'restoredBody',
    ]) {
      assert.ok(
        typeof copy[field] === 'string' && copy[field].trim().length > 0,
        `missing ${field} for ${locale}`,
      );
    }
  }

  assert.match(
    INVITER_SECURITY_NOTIFICATION_COPY.ko.watchBody,
    /현재 VeInvite 이용 제한은 없으며/u,
  );
  assert.match(
    INVITER_SECURITY_NOTIFICATION_COPY.ko.holdBody,
    /이미 지급된 보상은 변경되지 않아요/u,
  );
});

test('all inviter security notification states are directly QA-renderable', async () => {
  const [harness, review, directCoverage, registry] = await Promise.all([
    readFile('src/qa/QaNotificationStateHarness.tsx', 'utf8'),
    readFile('src/qa/QaNotificationI18nReview.tsx', 'utf8'),
    readFile('src/qa/directStateCoverage.ts', 'utf8'),
    readFile('src/qa/stateRegistry.ts', 'utf8'),
  ]);

  for (const stateId of [
    'NOTI-INVITER-WATCH',
    'NOTI-INVITER-HOLD',
    'NOTI-INVITER-RESTRICTED',
    'NOTI-INVITER-RESTORED',
  ]) {
    assert.ok(harness.includes(stateId), `QA harness missing ${stateId}`);
    assert.ok(review.includes(stateId), `i18n review missing ${stateId}`);
    assert.ok(directCoverage.includes(stateId), `direct coverage missing ${stateId}`);
    assert.ok(registry.includes(stateId), `state registry missing ${stateId}`);
  }
});
