import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  route,
  runner,
  qaSql,
] = await Promise.all([
  readFile(
    'src/app/qa/sybil-e2e/run/route.ts',
    'utf8',
  ),
  readFile(
    'src/qa/QaSybilE2eRunner.tsx',
    'utf8',
  ),
  readFile(
    'supabase/qa/sybil-e2e-self-test.sql',
    'utf8',
  ),
]);

test('Sybil E2E runner is Preview-only and pinned to the reviewed Preview database', () => {
  assert.match(
    route,
    /process\.env\.VERCEL_ENV ===\s*'preview'/u,
  );
  assert.match(
    route,
    /bpppslplhmppxzvdkwxs/u,
  );
  assert.match(
    route,
    /VEINVITE_QA_STUDIO !==\s*'true'/u,
  );
  assert.match(
    route,
    /requestHasSameOrigin/u,
  );
  assert.doesNotMatch(
    route,
    /upfjvkidaqtnbmmnhupz/u,
  );
});

test('Sybil E2E SQL exercises real security lifecycle state and always rolls fixture writes back', () => {
  assert.match(
    qaSql,
    /insert into public\.sybil_v2_referral_assessments/iu,
  );
  assert.match(
    qaSql,
    /set_invitation_sybil_decision[\s\S]*'BLOCKED'/u,
  );
  assert.match(
    qaSql,
    /insert into public\.sybil_v2_wallet_restrictions/iu,
  );
  assert.match(
    qaSql,
    /SECURITY_INVITER_WATCH/u,
  );
  assert.match(
    qaSql,
    /SECURITY_INVITER_HOLD/u,
  );
  assert.match(
    qaSql,
    /raise exception 'QA_E2E_ROLLBACK'/u,
  );
  assert.match(
    qaSql,
    /fixtureResidue/u,
  );
});

test('Sybil E2E never invokes token transfer or payout mutation code', () => {
  assert.match(
    qaSql,
    /'transfersPerformed',false/u,
  );
  assert.doesNotMatch(
    qaSql,
    /insert\s+into\s+public\.reward_payouts/iu,
  );
  assert.doesNotMatch(
    qaSql,
    /update\s+public\.reward_payouts/iu,
  );
  assert.doesNotMatch(
    route,
    /automaticRewardPayout|reserveEligibleReferralRewards|reward-finality/iu,
  );
});

test('QA UI runs the complete Sybil E2E flow with one explicit action', () => {
  assert.match(
    runner,
    /\/qa\/sybil-e2e\/run/u,
  );
  assert.match(
    runner,
    /method:\s*'POST'/u,
  );
  assert.match(
    runner,
    /전체 Sybil E2E 테스트 실행/u,
  );
  assert.match(
    runner,
    /writesRolledBack/u,
  );
  assert.match(
    runner,
    /transfersPerformed/u,
  );
});

test('Preview-only QA installer is outside production migration history', () => {
  assert.ok(
    !'supabase/qa/sybil-e2e-self-test.sql'
      .startsWith('supabase/migrations/'),
  );
  assert.match(
    qaSql,
    /Install this file only on the reviewed Preview Supabase project/u,
  );
});
