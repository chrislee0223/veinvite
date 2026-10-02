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
  'supabase/migrations/20260930114500_make_inviter_escalation_hold_review_only.sql';

test('inviter escalation HOLD is review-only and no longer enters the participation block view', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /'PRE_CLAIM_HOLD'/u);
  assert.match(sql, /'POST_PAYOUT_HOLD'/u);
  assert.doesNotMatch(sql, /'INVITER_ESCALATION_HOLD'/u);
  assert.match(
    sql,
    /Inviter escalation HOLD is review-only and does not block normal invitations/u,
  );
  assert.doesNotMatch(
    sql,
    /drop\s+view\s+public\.operator_sybil_v2_inviter_review_candidates/iu,
  );
});

test('inviter HOLD notifications say review is in progress without claiming access is restricted', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = INVITER_SECURITY_NOTIFICATION_COPY[locale];
    assert.equal(
      copy.holdTitle,
      copy.watchTitle,
      `holdTitle must stay review-only for ${locale}`,
    );
    assert.equal(
      copy.holdBody,
      copy.watchBody,
      `holdBody must stay review-only for ${locale}`,
    );
  }

  assert.match(
    INVITER_SECURITY_NOTIFICATION_COPY.ko.holdBody,
    /현재 이용 제한은 없고 평소처럼 계속 초대할 수 있어요/u,
  );
});
test('application restriction reads also exclude inviter escalation HOLD', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/restrictions.ts',
    'utf8',
  );

  const filters =
    source.match(
      /\.in\('restriction_kind', \[\s*'PRE_CLAIM_HOLD',\s*'POST_PAYOUT_HOLD',\s*\]\)/gu,
    ) ?? [];

  assert.equal(
    filters.length,
    2,
    'single- and multi-wallet restriction reads must both exclude inviter HOLD',
  );
});

