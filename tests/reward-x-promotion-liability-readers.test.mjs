import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261008140000_harden_x_promotion_liability_readers_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('post-base liability covers the PAID-to-HELD activation gap', () => {
  assert.match(
    migration,
    /o\.financial_state='HELD'/,
  );
  assert.match(
    migration,
    /o\.financial_state='RESERVED'[\s\S]*p\.status='PAID'/,
  );
  assert.match(
    migration,
    /p\.amount_wei=s\.base_amount_wei/,
  );
  assert.match(
    migration,
    /r\.amount_wei=s\.base_amount_wei/,
  );
  assert.match(
    migration,
    /r\.paid_at is not null/,
  );
});

test('released promotion only offsets queue commitment that still exists', () => {
  assert.match(
    migration,
    /o\.financial_state='RELEASED'/,
  );
  assert.match(
    migration,
    /q\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)/,
  );
  assert.doesNotMatch(
    migration,
    /q\.status in \([^)]*'CANCELLED'/,
  );
  assert.match(
    migration,
    /double-free the same B3TR/,
  );
});

test('readers remain server-side and do not mutate core reward state', () => {
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_post_base_liability_wei\(text,text\)[\s\S]*to service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_cohort_released_wei\(text,text,bigint,bigint\)[\s\S]*to service_role/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.read_outstanding_reward_liability/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.read_reward_cohort_committed_wei/,
  );
  assert.doesNotMatch(migration, /update public|insert into|delete from/i);
});
