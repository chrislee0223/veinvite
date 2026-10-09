import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009030000_add_x_promotion_post_verification_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('post verification foundation requires LIVE to remain disabled', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_POST_FOUNDATION_REQUIRES_LIVE_DISABLED/,
  );
  assert.doesNotMatch(
    migration,
    /set\s+reward_x_promotion_enabled\s*=\s*true/i,
  );
});

test('opportunity gets an opaque share token and fixed submission grace', () => {
  assert.match(migration, /share_token uuid not null default gen_random_uuid\(\)/);
  assert.match(migration, /submission_grace_seconds integer not null default 900/);
  assert.match(migration, /unique index[\s\S]*share_token_uidx/i);
});

test('one X author is bound to one wallet per network', () => {
  assert.match(
    migration,
    /unique\(network,recipient_wallet\)/,
  );
  assert.match(
    migration,
    /unique\(network,x_author_id\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_AUTHOR_ALREADY_BOUND/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_WALLET_AUTHOR_MISMATCH/,
  );
});

test('one X Post can only serve one promotion opportunity', () => {
  assert.match(
    migration,
    /reward_x_promotion_post_verification_post_uidx[\s\S]*unique\(x_post_id\)/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_POST_ALREADY_USED/,
  );
});

test('actual post creation must occur inside the 24 hour offer window', () => {
  assert.match(
    migration,
    /p_x_post_created_at<v_opportunity\.opened_at/,
  );
  assert.match(
    migration,
    /p_x_post_created_at>v_opportunity\.post_deadline_at/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_POST_CREATED_OUTSIDE_WINDOW/,
  );
});

test('verification allows only a short submission grace, not a longer posting window', () => {
  assert.match(
    migration,
    /post_deadline_at \+[\s\S]*submission_grace_seconds/,
  );
  assert.match(
    migration,
    /submission_grace_seconds=900/,
  );
});

test('retention verification cannot finalize before 24 hours', () => {
  assert.match(migration, /retention_seconds integer not null default 86400/);
  assert.match(migration, /v_now<v_verification\.verify_after/);
  assert.match(migration, /REWARD_X_PROMOTION_POST_RETENTION_PENDING/);
  assert.match(migration, /final_verified_at<p\.verify_after/);
});

test('the same opaque VeInvite share token must survive final verification', () => {
  const matches = migration.match(/REWARD_X_PROMOTION_POST_SHARE_TOKEN_MISSING/g) ?? [];
  assert.ok(matches.length >= 2);
  assert.match(
    migration,
    /position\(v_opportunity\.share_token::text in v_url\)=0/,
  );
});

test('final verification re-checks current Sybil safety', () => {
  assert.match(
    migration,
    /is_sybil_v2_referral_invalidated/,
  );
  assert.match(
    migration,
    /REWARD_X_PROMOTION_POST_SECURITY_NOT_CLEAR/,
  );
});

test('foundation creates no payout path and keeps tables server-only', () => {
  assert.doesNotMatch(migration, /insert into public\.reward_payouts/i);
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_post_verifications enable row level security/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_post_verifications to service_role/,
  );
});
