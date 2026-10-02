import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261002102500_debounce_transient_security_hold_notifications.sql',
    import.meta.url,
  ),
  'utf8',
);

test('security HOLD notices wait for a short stabilization window', () => {
  const occurrences =
    migration.match(/clock_timestamp\(\) - interval '10 seconds'/gu) ?? [];

  assert.equal(occurrences.length, 3);
  assert.match(
    migration,
    /h\.kind not in \(\s*'SECURITY_REVIEW_STARTED',\s*'SECURITY_INVITER_HOLD'\s*\)/u,
  );
});

test('fast referral HOLD outcomes collapse to CLEAR or BLOCK', () => {
  assert.match(
    migration,
    /h\.kind = 'SECURITY_REVIEW_STARTED'[\s\S]*later\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_REVIEW_CLEARED'\)[\s\S]*interval '10 seconds'/u,
  );
});


test('fast post-payout HOLD outcomes collapse to cleared or restricted', () => {
  assert.match(
    migration,
    /h\.kind = 'SECURITY_POST_PAYOUT_REVIEW_STARTED'[\s\S]*later\.kind in \('SECURITY_RESTRICTION_CONFIRMED', 'SECURITY_POST_PAYOUT_REVIEW_CLEARED'\)[\s\S]*interval '10 seconds'/u,
  );
});

test('fast inviter HOLD outcomes collapse to restored or restricted', () => {
  assert.match(
    migration,
    /h\.kind = 'SECURITY_INVITER_HOLD'[\s\S]*later\.kind in \('SECURITY_INVITER_RESTRICTED', 'SECURITY_INVITER_ACCESS_RESTORED'\)[\s\S]*interval '10 seconds'/u,
  );
});

test('history, unread count, and acknowledgement share the same HOLD visibility rule', () => {
  for (const fn of [
    'get_invite_notification_history',
    'count_invite_notification_history_unread',
    'acknowledge_invite_notification_history',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create or replace function public\\.${fn}[\\s\\S]*clock_timestamp\\(\\) - interval '10 seconds'`,
        'u',
      ),
    );
  }
});
