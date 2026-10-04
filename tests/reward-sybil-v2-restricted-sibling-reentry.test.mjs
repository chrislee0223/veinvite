import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  pipeline,
  reentryMigration,
  clusterMigration,
  inviterBoundaryMigration,
  inviterReviewOnlyMigration,
] = await Promise.all([
  readFile('src/lib/sybil/v2/pipeline.ts', 'utf8'),
  readFile(
    'supabase/migrations/20261004101116_harden_restricted_sibling_reentry.sql',
    'utf8',
  ),
  readFile(
    'supabase/migrations/20261004103141_surface_inviter_related_wallet_observation_cluster.sql',
    'utf8',
  ),
  readFile(
    'supabase/migrations/20260930134000_align_sybil_operator_decision_boundaries.sql',
    'utf8',
  ),
  readFile(
    'supabase/migrations/20260930114500_make_inviter_escalation_hold_review_only.sql',
    'utf8',
  ),
]);

test('restricted sibling reentry requires a currently restricted peer from the same inviter', () => {
  assert.match(
    reentryMigration,
    /join public\.sybil_v2_wallet_restrictions r[\s\S]*r\.status = 'ACTIVE'[\s\S]*r\.resolved_at is null/u,
  );
  assert.match(
    reentryMigration,
    /lower\(p\.inviter_wallet\) = lower\(v_invitation\.inviter_wallet\)/u,
  );
  assert.match(
    reentryMigration,
    /r\.related_invite_code = p\.invite_code/u,
  );
  assert.match(
    reentryMigration,
    /lower\(r\.wallet_address\) = lower\(p\.invitee_wallet\)/u,
  );
});

test('restricted sibling reentry requires a sequential wallet switch near activation', () => {
  assert.match(
    reentryMigration,
    /peer_obs\.client_id = current_obs\.client_id/u,
  );
  assert.match(
    reentryMigration,
    /current_obs\.first_seen_at >= peer_obs\.last_seen_at/u,
  );
  assert.match(
    reentryMigration,
    /peer_obs\.last_seen_at \+ interval '10 minutes'/u,
  );
  assert.match(
    reentryMigration,
    /v_invitation\.activated_at - current_obs\.first_seen_at[\s\S]*<= 600/u,
  );
  assert.match(
    reentryMigration,
    /'restrictionScope', 'INVITEE_ONLY'/u,
  );
});

test('restricted sibling reentry protects final rewards and operator/admin exclusions', () => {
  assert.match(
    reentryMigration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    reentryMigration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    reentryMigration,
    /is_analytics_excluded_wallet\(v_invitation\.inviter_wallet\)/u,
  );
  assert.match(
    reentryMigration,
    /is_analytics_excluded_wallet\(v_invitation\.invitee_wallet\)/u,
  );
});

test('pipeline invokes restricted sibling reentry only from a high immediate sibling switch HOLD', () => {
  assert.match(
    pipeline,
    /restrictedSiblingReentryCandidate =[\s\S]*policy\.state === 'HOLD'[\s\S]*SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH/u,
  );
  assert.match(
    pipeline,
    /apply_sybil_v2_restricted_sibling_reentry_restriction/u,
  );
  assert.match(
    pipeline,
    /policy\.state === 'HOLD'[\s\S]*restrictedSiblingReentryCandidate[\s\S]*applyRestrictedSiblingReentryRestriction/u,
  );
  assert.match(
    pipeline,
    /AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION/u,
  );
});

test('existing HOLDs with sibling-switch evidence are reassessed exactly through an enforcement version marker', () => {
  assert.match(
    pipeline,
    /SYBIL_V2_RESTRICTED_SIBLING_REENTRY_VERSION =[\s\S]*restricted-sibling-reentry-v1/u,
  );
  assert.match(
    pipeline,
    /restrictedSiblingReentryEnforcementVersion/u,
  );
  assert.match(
    pipeline,
    /hasRestrictedSiblingReentrySignal[\s\S]*SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH/u,
  );
  assert.match(
    pipeline,
    /restrictedSiblingReentryStale/u,
  );
});

test('inviter related-wallet cluster is observation-only and service-only', () => {
  assert.match(
    clusterMigration,
    /'OBSERVED_ONLY'::text as cluster_status/u,
  );
  assert.match(
    clusterMigration,
    /'sanctionAuthority', false/u,
  );
  assert.match(
    clusterMigration,
    /'requiresIndependentBehavioralCorroboration', true/u,
  );
  assert.match(
    clusterMigration,
    /revoke all on public\.operator_sybil_v2_inviter_related_wallet_clusters[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    clusterMigration,
    /grant select on public\.operator_sybil_v2_inviter_related_wallet_clusters[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(
    clusterMigration,
    /insert\s+into\s+public\.sybil_v2_wallet_restrictions/iu,
  );
  assert.doesNotMatch(
    clusterMigration,
    /update\s+public\.invitations/iu,
  );
  assert.doesNotMatch(
    clusterMigration,
    /update\s+public\.reward_/iu,
  );
});

test('repeat-only inviter incidents stay watch/review-only and never block normal invitations', () => {
  assert.match(
    inviterBoundaryMigration,
    /when incident_count_90d >= 2 then 'WATCH'/u,
  );
  assert.doesNotMatch(
    inviterBoundaryMigration,
    /incident_count_90d >= 3 then 'HOLD'/u,
  );
  assert.match(
    inviterBoundaryMigration,
    /'manualReviewRequiresStrongDirectLink', true/u,
  );
  assert.match(
    inviterReviewOnlyMigration,
    /Inviter escalation HOLD is review-only and does not block normal invitations/u,
  );
  assert.doesNotMatch(
    inviterReviewOnlyMigration,
    /'INVITER_ESCALATION_HOLD'/u,
  );
});
