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
const earlyDecisionMigration = await readFile(
  'supabase/migrations/20261001082500_allow_early_sybil_operator_blacklist.sql',
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

test('fully assessed HOLD view remains intact for monitoring readiness', () => {
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
    /manualReviewReadyReferrals/u,
  );
});

test('early HOLDs are operator-visible for BLACKLIST while CLEAR stays gated', () => {
  assert.match(
    earlyDecisionMigration,
    /operator_sybil_v2_operator_action_candidates/u,
  );
  assert.match(
    earlyDecisionMigration,
    /a\.state = 'HOLD'/u,
  );
  assert.match(
    earlyDecisionMigration,
    /new\.state = 'CLEAR'/u,
  );
  assert.match(
    earlyDecisionMigration,
    /- 'CHAIN_FINALITY'/u,
  );
  assert.match(
    earlyDecisionMigration,
    /SYBIL_V2_CLEAR_CHECKS_INCOMPLETE/u,
  );
  assert.doesNotMatch(
    earlyDecisionMigration,
    /new\.state in \('CLEAR','RESTRICTED'\)/u,
  );
  assert.match(
    reviewRoute,
    /operator_sybil_v2_operator_action_candidates/u,
  );
  assert.match(
    reviewRoute,
    /hasCompletedDecisionChecks/u,
  );
  assert.match(
    reviewRoute,
    /value !== 'CHAIN_FINALITY'/u,
  );
  assert.match(
    reviewRoute,
    /v2CanResolve && !v2CanClear[\s\S]*\['BLOCKED'\]/u,
  );
  assert.match(
    reviewRoute,
    /decision === 'CLEAR'[\s\S]*Core Sybil decision checks are still in progress/u,
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


test('inviter notification history uses the same direct-evidence HOLD rule', () => {
  assert.match(
    migration,
    /v_previous_hold := v_previous_strong > 0/u,
  );
  assert.doesNotMatch(
    migration,
    /v_previous_count >= 3\s*\n\s*or v_previous_strong > 0/u,
  );
  assert.match(
    migration,
    /v_posture\.posture = 'WATCH'[\s\S]*v_previous_count < 2/u,
  );
});
