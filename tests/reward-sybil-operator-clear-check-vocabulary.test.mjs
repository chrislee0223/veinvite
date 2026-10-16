import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile('src/app/api/admin/sybil/review/route.ts', 'utf8');
const migration = await readFile(
  'supabase/migrations/20261017095000_require_core_decision_check_vocabulary.sql',
  'utf8',
);

const CORE = [
  'HISTORICAL_CHAIN',
  'FUNDING_CHAIN',
  'MISSION_BEHAVIOR',
  'SECURITY_IDENTITY',
  'VEPASSPORT',
];

function safeToClear(required, completed) {
  return CORE.every((value) => required.includes(value)) &&
    required.filter((value) => value !== 'CHAIN_FINALITY')
      .every((value) => completed.includes(value));
}

test('malformed HOLD check metadata cannot permit an operator CLEAR', () => {
  assert.equal(safeToClear([], []), false);
  assert.equal(safeToClear([], CORE), false);
  assert.equal(safeToClear(CORE.slice(0, 4), CORE), false);
  assert.equal(safeToClear([...CORE, 'CHAIN_FINALITY'], CORE.slice(0, 4)), false);
});

test('all five core checks permit a manual verdict without pre-vote CHAIN_FINALITY', () => {
  assert.equal(safeToClear([...CORE, 'CHAIN_FINALITY'], CORE), true);
  assert.equal(safeToClear([...CORE, 'CHAIN_FINALITY'], [...CORE, 'CHAIN_FINALITY']), true);
  assert.equal(safeToClear([...CORE, 'CHAIN_FINALITY', 'FUTURE_CHECK'], CORE), false);
});

test('database trigger and API both require the complete known core check vocabulary', () => {
  for (const code of CORE) {
    assert.match(route, new RegExp("'" + code + "'", 'u'));
    assert.match(migration, new RegExp('"' + code + '"', 'u'));
  }
  assert.match(route, /MANDATORY_CORE_DECISION_CHECKS\.every/u);
  assert.match(route, /required\.every\(\(check\) => completed\.has\(check\)\)/u);
  assert.match(migration, /new\.source = 'OPERATOR'/u);
  assert.match(migration, /old\.state = 'HOLD'/u);
  assert.match(migration, /new\.state = 'CLEAR'/u);
  assert.match(migration, /<@ coalesce\(old\.required_checks, '\[\]'::jsonb\)/u);
  assert.match(migration, /- 'CHAIN_FINALITY'/u);
  assert.match(migration, /SYBIL_V2_CLEAR_CHECKS_INCOMPLETE/u);
});

test('fail-closed guard cannot issue rewards or change HOLD outcomes by itself', () => {
  assert.doesNotMatch(migration, /\b(update|delete|insert)\s+(?:into|from)?\s*public\.(invitations|reward_queue_entries|sybil_v2_wallet_restrictions)/iu);
  assert.match(migration, /return new;/u);
  assert.match(route, /decision === 'CLEAR'/u);
  assert.match(route, /hasCompletedDecisionChecks\(v2Assessment\)/u);
});
