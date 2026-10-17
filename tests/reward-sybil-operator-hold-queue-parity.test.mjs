import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20261017110000_align_operator_sybil_hold_review_queue.sql',
  'utf8',
);
const api = await readFile('src/app/api/admin/sybil/review/route.ts', 'utf8');

const CORE = [
  'HISTORICAL_CHAIN',
  'FUNDING_CHAIN',
  'MISSION_BEHAVIOR',
  'SECURITY_IDENTITY',
  'VEPASSPORT',
];

const isReady = (required, completed) =>
  CORE.every((check) => required.includes(check)) &&
  required.filter((check) => check !== 'CHAIN_FINALITY')
    .every((check) => completed.includes(check));

test('core-ready manual queue agrees with pre-vote CLEAR verification boundary', () => {
  assert.equal(isReady([], []), false);
  assert.equal(isReady([...CORE, 'CHAIN_FINALITY'], CORE.slice(0, 4)), false);
  assert.equal(isReady([...CORE, 'CHAIN_FINALITY'], CORE), true);
  assert.equal(isReady([...CORE, 'CHAIN_FINALITY', 'FUTURE_CHECK'], CORE), false);

  for (const check of CORE) assert.ok(migration.includes(check));
  assert.match(migration, /coalesce\(a\.required_checks,'\[\]'::jsonb\)/u);
  assert.match(migration, /- 'CHAIN_FINALITY'/u);
});

test('first held time is episode-bound and independent of refreshed assessment timestamps', () => {
  assert.match(migration, /min\(e\.created_at\)/u);
  assert.match(migration, /e\.state = 'HOLD'/u);
  assert.match(migration, /prior\.state <> 'HOLD'/u);
  assert.match(migration, /e\.revision > coalesce/u);
  assert.match(migration, /a\.assessed_at\) as first_held_at/u);
  assert.match(api, /\.from\('operator_sybil_v2_operator_action_candidates'\)/u);
  assert.match(api, /source,assessed_at,updated_at,first_held_at/u);
  assert.match(api, /v2_first_held_at: assessment\?\.first_held_at \?\? null/u);
});

test('operator list order does not reset after non-terminal rechecks', () => {
  assert.match(api, /left\.v2_first_held_at \?\?/u);
  assert.match(api, /right\.v2_first_held_at \?\?/u);
});

test('queue parity is read-only and does not grant a wallet payout authority', () => {
  assert.match(migration, /create or replace view public\.operator_sybil_v2_operator_action_candidates/u);
  assert.match(migration, /create or replace view public\.operator_sybil_v2_manual_review_candidates/u);
  assert.match(migration, /security_invoker = true/u);
  assert.doesNotMatch(
    migration,
    /\b(update|insert into|delete from|grant execute|alter table)\b/iu,
  );
});
