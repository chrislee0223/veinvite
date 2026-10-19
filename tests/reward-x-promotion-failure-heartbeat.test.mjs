import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(
  new URL('../src/app/api/cron/x-promotion-maintenance/route.ts', import.meta.url),
  'utf8',
);

test('X promotion lifecycle heartbeat must detect failed candidates', () => {
  assert.match(route, /result\.opportunitySync/);
  assert.match(route, /failedCount/);
  assert.match(route, /result\.pending\.failed/);
  assert.match(route, /result\.final\.failed/);
  assert.match(route, /markCronJobFailed\(\s*LIFECYCLE_JOB_NAME/);
});

const migration = await readFile(
  new URL('../supabase/migrations/20261019183000_fix_x_promotion_lifecycle_privileges.sql', import.meta.url),
  'utf8',
);

test('migration refuses to reopen already-paid historical offers', () => {
  assert.match(migration, /historical_offer_guard/);
  assert.match(migration, /X_PROMOTION_HISTORICAL_BASE_PAID_RESERVATIONS_NEED_DISPOSITION/);
  assert.match(migration, /o\.financial_state in \('RESERVED','HELD'\)/);
  assert.match(migration, /not exists \([\s\S]*?reward_x_promotion_opportunities/);
  assert.ok(
    migration.indexOf('historical_offer_guard') <
      migration.indexOf('grant update (financial_state'),
  );
});

test('migration restricts update privileges to server-only transition columns', () => {
  assert.match(migration, /grant update \(financial_state,held_at,released_at,release_reason,updated_at\)/);
  assert.match(migration, /on table public\.reward_x_promotion_obligations to service_role/);
  assert.match(migration, /on table public\.reward_x_promotion_post_submissions to service_role/);
  assert.match(migration, /on table public\.reward_x_promotion_post_verifications to service_role/);
  assert.doesNotMatch(migration, /grant update on table public\.reward_x_promotion_obligations/i);
});

test('opportunity sync returns meaningful per-candidate failure evidence', () => {
  assert.match(migration, /get stacked diagnostics/);
  assert.match(migration, /'sqlstate',v_failure_sqlstate/);
  assert.match(migration, /'reason',left\(v_failure_message,240\)/);
  assert.match(migration, /'failures',v_failures/);
});

test('rolled-back opportunity creation never counts as successful activation', () => {
  const activationIncrement = migration.indexOf('v_activated:=v_activated+1;');
  const creationStatement = migration.indexOf('v_creation :=');
  assert.ok(activationIncrement > creationStatement);
  assert.match(migration, /v_candidate_activated:=false/);
  assert.match(migration, /if v_candidate_activated then/);
});
