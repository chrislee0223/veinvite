import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261009143000_harden_x_promotion_expiry_candidate_fairness_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

test('expiry candidate selection excludes active submitted Posts before LIMIT', () => {
  const loopStart = migration.indexOf('for v_candidate in');
  const loopEnd = migration.indexOf('  loop', loopStart);
  const candidateQuery = migration.slice(loopStart, loopEnd);

  assert.match(
    candidateQuery,
    /not exists \([\s\S]*reward_x_promotion_post_submissions[\s\S]*submission_state in \('PENDING','VERIFIED'\)/,
  );
  assert.match(
    candidateQuery,
    /not exists \([\s\S]*reward_x_promotion_post_verifications[\s\S]*'INITIAL_VERIFIED','REVIEW_REQUIRED','FINAL_VERIFIED'/,
  );
  assert.ok(
    candidateQuery.indexOf('not exists') <
      candidateQuery.indexOf('limit v_limit'),
  );
});

test('expiry still rechecks protected states after invite lock', () => {
  const loopIndex = migration.indexOf('  loop');
  const body = migration.slice(loopIndex);

  assert.match(
    body,
    /pg_advisory_xact_lock/,
  );
  assert.match(
    body,
    /submission_state in \('PENDING','VERIFIED'\)/,
  );
  assert.match(
    body,
    /'INITIAL_VERIFIED','REVIEW_REQUIRED','FINAL_VERIFIED'/,
  );
});

test('expiry release semantics remain unchanged for genuinely unused offers', () => {
  assert.match(
    migration,
    /financial_state='RELEASED'/,
  );
  assert.match(
    migration,
    /release_reason='NO_VALID_POST_BEFORE_DEADLINE'/,
  );
});

test('expiry mutation remains service-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.expire_reward_x_promotion_opportunities_v1\(text,integer\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.expire_reward_x_promotion_opportunities_v1\(text,integer\)[\s\S]*to service_role/,
  );
});
