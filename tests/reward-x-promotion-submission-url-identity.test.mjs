import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009033500_harden_x_promotion_submission_url_identity_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('submission URL must contain the exact X Post ID with a path boundary', () => {
  assert.ok(
    migration.includes("'/status/' || x_post_id || '([/?#]|$)'"),
  );
  assert.ok(
    migration.includes("'/status/' || v_post_id || '([/?#]|$)'"),
  );
});

test('prefix Post IDs cannot be accepted by a simple substring check', () => {
  assert.doesNotMatch(
    migration,
    /position\('\/status\/'\|\|v_post_id in v_url\)/,
  );
});

test('hardening remains dormant and cannot enable LIVE', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SUBMISSION_URL_HARDENING_REQUIRES_LIVE_DISABLED/,
  );
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
});

test('hardening creates no payout path', () => {
  assert.doesNotMatch(migration, /insert into public\.reward_payouts/i);
});
