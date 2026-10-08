import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  pipeline,
  migration,
  inviterMigration,
  learnedPatternMigration,
  reviewedBehaviorPatterns,
  protocolDestinations,
  policy,
] = await Promise.all([
  readFile('src/lib/sybil/v2/pipeline.ts', 'utf8'),
  readFile(
    'supabase/migrations/20260929213000_detect_same_inviter_security_client_siblings.sql',
    'utf8',
  ),
  readFile(
    'supabase/migrations/20260929214500_review_same_client_sibling_inviter.sql',
    'utf8',
  ),
  readFile(
    'supabase/migrations/20261008153842_learn_reviewed_sybil_patterns_v1.sql',
    'utf8',
  ),
  readFile(
    'src/lib/sybil/v2/reviewedBehaviorPatterns.ts',
    'utf8',
  ),
  readFile(
    'src/lib/sybil/v2/protocolDestinations.ts',
    'utf8',
  ),
  readFile('src/lib/sybil/v2/policy.ts', 'utf8'),
]);

test('same-inviter sibling wallets on one security client are detected before payout', () => {
  assert.match(pipeline, /SECURITY_CLIENT_SIBLING_LINK/u);
  assert.match(pipeline, /SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH/u);
  assert.match(pipeline, /sameInviterSibling:\s*true/u);
  assert.match(pipeline, /switchGapSeconds <= 10 \* 60/u);
  assert.match(pipeline, /peerActivationGapSeconds/u);
  assert.match(pipeline, /preVoteDetection:\s*true/u);
});

test('generic sibling sharing is medium while an immediate switch is high evidence', () => {
  assert.match(
    pipeline,
    /code:\s*'SECURITY_CLIENT_SIBLING_LINK'[\s\S]*strength:\s*'MEDIUM'[\s\S]*score:\s*60/u,
  );
  assert.match(
    pipeline,
    /code:\s*'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH'[\s\S]*strength:\s*'HIGH'[\s\S]*score:\s*100/u,
  );
  assert.match(
    policy,
    /if \(highEvidenceDomains\.length >= 1\)[\s\S]*state:\s*'HOLD'/u,
  );
});

test('the inviter receives downstream corroboration without guilt-by-association blacklist', () => {
  assert.match(
    pipeline,
    /SECURITY_CLIENT_DOWNSTREAM_SIBLING_SWITCH/u,
  );
  assert.match(
    pipeline,
    /family:\s*'CLUSTER_LINK'[\s\S]*strength:\s*'MEDIUM'[\s\S]*score:\s*60/u,
  );
  assert.match(
    pipeline,
    /This does not[\s\S]*blacklist the inviter by association/u,
  );
});

test('database gate marks immediate sibling switches for early review and excludes operator wallets', () => {
  assert.match(migration, /same inviter plus an immediate <=10 minute/u);
  assert.match(migration, /is_analytics_excluded_wallet\(new\.wallet_address\)/u);
  assert.match(
    migration,
    /lower\(btrim\(i\.inviter_wallet\)\)[\s\S]*lower\(btrim\(v_current_invitation\.inviter_wallet\)\)/u,
  );
  assert.match(migration, /v_switch_gap_seconds <= 600/u);
  assert.match(migration, /identity_link_status = 'REVIEW'/u);
  assert.match(migration, /identity_link_risk_score = 100/u);
  assert.match(migration, /sameInviterSibling', true/u);
});

test('shared-client sibling detection is review-first and never auto-blacklists by itself', () => {
  assert.doesNotMatch(migration, /sybil_status\s*=\s*'BLOCKED'/u);
  assert.doesNotMatch(migration, /reward_status\s*=\s*'FORFEITED'/u);
  assert.match(migration, /reward_status <> 'PAID'/u);
  assert.match(migration, /q\.status = 'ASSIGNED'/u);
});

test('migration backfills already-observed unpaid sibling switches', () => {
  assert.match(migration, /Backfill already-observed unpaid sibling switches/u);
  assert.match(migration, /matched_pairs as/u);
  assert.match(migration, /b\.client_id = a\.client_id/u);
  assert.match(migration, /b\.inviter_wallet = a\.inviter_wallet/u);
  assert.match(migration, /'backfill', true/u);
});


test('the downstream inviter is review-only when an immediate sibling cluster appears', () => {
  assert.match(inviterMigration, /review_security_client_sibling_inviter_cluster/u);
  assert.match(inviterMigration, /identity_link_status = case[\s\S]*else 'REVIEW'/u);
  assert.match(inviterMigration, /identity_link_risk_score =[\s\S]*70/u);
  assert.match(inviterMigration, /downstreamSameClientSibling', true/u);
  assert.match(inviterMigration, /signalFamily', 'CLUSTER_LINK'/u);
  assert.match(inviterMigration, /v_switch_gap_seconds <= 600/u);
  assert.doesNotMatch(inviterMigration, /sybil_status\s*=\s*'BLOCKED'/u);
  assert.doesNotMatch(inviterMigration, /reward_status\s*=\s*'FORFEITED'/u);
  assert.match(inviterMigration, /reward_status <> 'PAID'/u);
  assert.match(inviterMigration, /q\.status = 'ASSIGNED'/u);
});


test('reviewed sibling-farming behavior only auto-restricts with independent same-app corroboration', () => {
  assert.match(
    pipeline,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    pipeline,
    /applyReviewedSiblingSyncRewardRestriction/u,
  );
  assert.match(
    reviewedBehaviorPatterns,
    /apply_sybil_v2_security_client_sibling_pattern_restriction/u,
  );
  assert.match(
    learnedPatternMigration,
    /same-inviter wallets immediately switched/u,
  );
  assert.match(
    learnedPatternMigration,
    /peer_sync\.app_id = subject_sync\.app_id/u,
  );
  assert.match(
    learnedPatternMigration,
    /HISTORICAL_SYNCHRONIZED_REWARD_CLUSTER/u,
  );
  assert.match(
    learnedPatternMigration,
    /<= 600/u,
  );
  assert.match(
    learnedPatternMigration,
    /AUTO_SECURITY_CLIENT_SIBLING_SYNC_REWARD_RESTRICTION/u,
  );
});

test('learned automatic restriction preserves reward finality and service-role-only execution', () => {
  assert.match(
    learnedPatternMigration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    learnedPatternMigration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    learnedPatternMigration,
    /revoke all on function public\.apply_sybil_v2_security_client_sibling_pattern_restriction/u,
  );
  assert.match(
    learnedPatternMigration,
    /grant execute on function public\.apply_sybil_v2_security_client_sibling_pattern_restriction[\s\S]*to service_role/u,
  );
});

test('known shared swap infrastructure is excluded from Sybil hub inference', () => {
  assert.match(
    protocolDestinations,
    /0xda5a60c8559a37eab5950a4ace9b77c25f6fde80/u,
  );
  assert.match(
    protocolDestinations,
    /0xc6de3b8e4a9bf4a6756e60f5cb6705cb7d3c1649/u,
  );
  assert.match(
    learnedPatternMigration,
    /Known BetterSwap aggregator contract/u,
  );
  assert.match(
    learnedPatternMigration,
    /Known VeChain AMM pool contract/u,
  );
});

test('reviewed behavior update advances the Sybil policy version', () => {
  assert.match(
    policy,
    /SYBIL_V2_POLICY_VERSION = 'sybil-v2\.17'/u,
  );
});
