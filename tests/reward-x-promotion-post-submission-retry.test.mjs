import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009032000_add_x_promotion_post_submission_retry_foundation_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('submission eligibility is durable before X API verification', () => {
  assert.match(
    migration,
    /create table if not exists public\.reward_x_promotion_post_submissions/,
  );
  assert.match(
    migration,
    /submission_state text not null default 'PENDING'/,
  );
  assert.match(
    migration,
    /record_reward_x_promotion_post_submission_v1/,
  );
});

test('submission deadline keeps the 24h offer plus only a 15 minute technical grace', () => {
  assert.match(
    migration,
    /post_deadline_at\+[\s\S]*submission_grace_seconds/,
  );
  assert.match(
    migration,
    /submission_grace_seconds<>900/,
  );
});

test('initial X verification requires a durable pending submission', () => {
  assert.match(
    migration,
    /REWARD_X_PROMOTION_POST_SUBMISSION_MISSING/,
  );
  assert.match(
    migration,
    /v_submission\.submission_state<>'PENDING'/,
  );
  assert.match(
    migration,
    /submission_id/,
  );
});

test('X API verification may succeed after submission grace without forfeiting a timely submission', () => {
  const initialFn = migration.slice(
    migration.indexOf(
      'create or replace function public.record_reward_x_promotion_initial_post_verification_v1',
    ),
    migration.indexOf(
      'create or replace function public.read_reward_x_promotion_post_verification_audit',
    ),
  );
  assert.doesNotMatch(
    initialFn,
    /v_now>[\s\S]*post_deadline_at[\s\S]*submission_grace_seconds/,
  );
  assert.match(
    initialFn,
    /p_x_post_created_at>v_opportunity\.post_deadline_at/,
  );
});

test('real Post creation still must be inside the original 24h posting window', () => {
  assert.match(
    migration,
    /p_x_post_created_at<v_opportunity\.opened_at/,
  );
  assert.match(
    migration,
    /p_x_post_created_at>v_opportunity\.post_deadline_at/,
  );
});

test('one active submission per opportunity and one global use per Post ID', () => {
  assert.match(
    migration,
    /unique\(x_post_id\)/,
  );
  assert.match(
    migration,
    /unique index[\s\S]*active_opportunity_uidx[\s\S]*submission_state in \('PENDING','VERIFIED'\)/,
  );
});

test('successful initial verification atomically consumes the pending submission', () => {
  assert.match(
    migration,
    /set submission_state='VERIFIED'/,
  );
  assert.match(
    migration,
    /verified_at=v_now/,
  );
});

test('submission rows are server-only and cannot be mutated directly by service clients', () => {
  assert.match(
    migration,
    /alter table public\.reward_x_promotion_post_submissions enable row level security/,
  );
  assert.match(
    migration,
    /grant select on table public\.reward_x_promotion_post_submissions to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete)[^;]*reward_x_promotion_post_submissions/i,
  );
});

test('foundation still creates no reward payout path', () => {
  assert.doesNotMatch(migration, /insert into public\.reward_payouts/i);
  assert.match(
    migration,
    /REWARD_X_PROMOTION_SUBMISSION_FOUNDATION_REQUIRES_LIVE_DISABLED/,
  );
});
