import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261004100947_harden_restricted_sibling_reentry.sql';

const migration = await readFile(migrationPath, 'utf8');
const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const reentry = await readFile(
  'src/lib/sybil/v2/restrictedSiblingReentry.ts',
  'utf8',
);

test('incident inviter client aliases are observation-only and cannot sanction by membership', () => {
  assert.match(
    migration,
    /operator_sybil_v2_inviter_related_wallet_clusters/u,
  );
  assert.match(migration, /'OBSERVED_ONLY'::text as cluster_status/u);
  assert.match(migration, /'sanctionAuthority', false/u);
  assert.match(
    migration,
    /'requiresIndependentBehavioralCorroboration', true/u,
  );
  assert.match(
    migration,
    /Membership is evidence for follow-up only and never creates a restriction by itself/u,
  );

  const viewEnd = migration.indexOf(
    'create or replace function public.apply_sybil_v2_restricted_sibling_reentry_restriction',
  );
  const viewSql = migration.slice(0, viewEnd);
  assert.doesNotMatch(viewSql, /insert\s+into\s+public\.sybil_v2_wallet_restrictions/iu);
  assert.doesNotMatch(viewSql, /update\s+public\.invitations/iu);
});

test('restricted sibling reentry requires same inviter, active restricted peer, same client, and tight timing', () => {
  assert.match(
    migration,
    /lower\(p\.inviter_wallet\) = lower\(v_invitation\.inviter_wallet\)/u,
  );
  assert.match(
    migration,
    /r\.status = 'ACTIVE'[\s\S]*r\.resolved_at is null/u,
  );
  assert.match(
    migration,
    /peer_obs\.client_id = current_obs\.client_id/u,
  );
  assert.match(
    migration,
    /current_obs\.first_seen_at >= peer_obs\.last_seen_at/u,
  );
  assert.match(
    migration,
    /current_obs\.first_seen_at <= peer_obs\.last_seen_at \+ interval '10 minutes'/u,
  );
  assert.match(
    migration,
    /abs\(extract\(epoch from \([\s\S]*v_invitation\.activated_at - current_obs\.first_seen_at[\s\S]*\)\)\) <= 600/u,
  );
});

test('irreversible action is invitee-only and protects paid or assigned rewards', () => {
  assert.match(migration, /v_invitation\.reward_status = 'PAID'/u);
  assert.match(migration, /q\.status = 'ASSIGNED'/u);
  assert.match(migration, /'restrictionScope', 'INVITEE_ONLY'/u);
  assert.match(migration, /where invite_code = v_code/u);
  assert.doesNotMatch(
    migration,
    /where\s+wallet_address\s*=\s*lower\(v_invitation\.inviter_wallet\)/iu,
  );
});

test('pipeline emits high evidence only for restricted sibling wallet replacement', () => {
  assert.match(
    pipeline,
    /loadRestrictedSiblingReentrySignals/u,
  );
  assert.match(
    reentry,
    /SECURITY_CLIENT_RESTRICTED_SIBLING_REENTRY/u,
  );
  assert.match(
    reentry,
    /sameInviterRestrictedSibling:\s*true/u,
  );
  assert.match(
    reentry,
    /sequentialWalletReplacement:\s*true/u,
  );
  assert.match(
    reentry,
    /switchGapSeconds > 10 \* 60/u,
  );
  assert.match(
    reentry,
    /activationGapSeconds > 10 \* 60/u,
  );
  assert.match(
    reentry,
    /family:\s*'SECURITY_IDENTITY'[\s\S]*strength:\s*'HIGH'[\s\S]*score:\s*100/u,
  );
});

test('pipeline re-verifies the restricted sibling pattern in the database before restricting', () => {
  assert.match(
    pipeline,
    /enforceRestrictedSiblingReentryRestriction/u,
  );
  assert.match(
    reentry,
    /apply_sybil_v2_restricted_sibling_reentry_restriction/u,
  );
  assert.match(
    pipeline,
    /restrictedSiblingReentryAutomaticRestrictionCandidate/u,
  );
  assert.match(
    pipeline,
    /AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION/u,
  );
  assert.match(
    reentry,
    /sybil_v2_referral_assessments/u,
  );
  assert.match(
    reentry,
    /data\?\.state === 'RESTRICTED'/u,
  );
});
