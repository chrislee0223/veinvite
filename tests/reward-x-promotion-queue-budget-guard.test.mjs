import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261011150000_align_queue_budget_guard_with_x_promotion_release_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('queue budget guard uses canonical cohort commitment authority', () => {
  assert.match(
    migration,
    /read_reward_cohort_committed_wei/,
  );
  assert.match(
    migration,
    /read_reward_cohort_effective_budget_wei/,
  );
  assert.doesNotMatch(
    migration,
    /select coalesce\(sum\(q\.reserved_amount_wei\),0\)/,
  );
  assert.doesNotMatch(
    migration,
    /select coalesce\(sum\(s\.offset_amount_wei\),0\)/,
  );
});

test('insert adds only the new reservation to existing commitment', () => {
  assert.match(
    migration,
    /if tg_op='INSERT' then\s+v_delta:=new\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /if v_committed\+v_delta>v_budget then/,
  );
});

test('committed-state updates do not double count the current queue row', () => {
  assert.match(
    migration,
    /old\.status='CANCELLED'[\s\S]*new\.status in \('AWAITING_CLAIM','QUEUED','ASSIGNED'\)[\s\S]*v_delta:=new\.reserved_amount_wei/,
  );
  assert.match(
    migration,
    /else\s+v_delta:=0/,
  );
});

test('cancellation remains release-only and does not run the budget guard', () => {
  assert.match(
    migration,
    /new\.reserved_amount_wei is null or new\.status='CANCELLED'[\s\S]*return new/,
  );
});
