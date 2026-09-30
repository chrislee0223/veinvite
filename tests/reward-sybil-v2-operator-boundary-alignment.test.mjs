import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20260930134000_align_sybil_operator_decision_boundaries.sql',
  'utf8',
);
const reviewRoute = await readFile(
  'src/app/api/admin/sybil/review/route.ts',
  'utf8',
);

test('automatic and operator invitee restrictions both feed inviter incident history', () => {
  assert.match(
    migration,
    /new\.source not in \('OPERATOR','SYSTEM'\)/u,
  );
  assert.match(
    migration,
    /check \(source in \('OPERATOR','SYSTEM'\)\)/u,
  );
  assert.match(
    migration,
    /where r\.status = 'ACTIVE'[\s\S]*r\.source = 'SYSTEM'/u,
  );
  assert.match(
    migration,
    /disable trigger sybil_v2_inviter_incident_security_notification/u,
  );
  assert.match(
    migration,
    /enable trigger sybil_v2_inviter_incident_security_notification/u,
  );
});

test('repeat-only inviter history stays WATCH and direct evidence is required for HOLD', () => {
  assert.match(
    migration,
    /when strong_direct_link_incident_count_90d > 0 then 'HOLD'/u,
  );
  assert.match(
    migration,
    /when incident_count_90d >= 2 then 'WATCH'/u,
  );
  assert.doesNotMatch(
    migration,
    /incident_count_90d >= 3 then 'HOLD'/u,
  );
  assert.match(
    migration,
    /'manualReviewRequiresStrongDirectLink', true/u,
  );
  assert.match(
    migration,
    /'thirdIncident', 'WATCH'/u,
  );
});

test('intermediate HOLDs remain fail-closed but are not operator decisions yet', () => {
  assert.match(
    migration,
    /operator_sybil_v2_manual_review_candidates/u,
  );
  assert.match(
    migration,
    /coalesce\(a\.required_checks,'\[\]'::jsonb\)[\s\S]*<@[\s\S]*coalesce\(a\.completed_checks,'\[\]'::jsonb\)/u,
  );
  assert.match(
    migration,
    /SYBIL_V2_REVIEW_CHECKS_INCOMPLETE/u,
  );
  assert.match(
    reviewRoute,
    /operator_sybil_v2_manual_review_candidates/u,
  );
  assert.match(
    reviewRoute,
    /hasCompletedRequiredChecks\(v2Assessment\)/u,
  );
  assert.match(
    reviewRoute,
    /Automatic Sybil checks are still in progress/u,
  );
});

test('operator monitor alerts only on review-ready V2 HOLDs', () => {
  assert.match(
    migration,
    /manualReviewReadyReferrals/u,
  );
  assert.match(
    migration,
    /item ->> 'code' <> 'SYBIL_V2_OPERATOR_REVIEW_REQUIRED'/u,
  );
  assert.match(
    migration,
    /fully assessed Sybil v2 HOLD referrals require operator review/u,
  );
});

test('new reward decisions remain CLEAR-only; WATCH reward authority is not reopened', async () => {
  const watchRetirement = await readFile(
    'supabase/migrations/20260928190000_retire_sybil_watch_reward_state.sql',
    'utf8',
  );

  assert.match(
    watchRetirement,
    /REWARD_QUEUE_SYBIL_V2_CLEAR_ONLY_REQUIRED/u,
  );
  assert.doesNotMatch(
    migration,
    /verdict\s*=\s*'WATCH'/u,
  );
  assert.doesNotMatch(
    migration,
    /a\.state in \('CLEAR','WATCH'\)/u,
  );
});
