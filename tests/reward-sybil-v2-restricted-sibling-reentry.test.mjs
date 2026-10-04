import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pipeline = await readFile(
  'src/lib/sybil/v2/pipeline.ts',
  'utf8',
);
const helper = await readFile(
  'src/lib/sybil/v2/restrictedSiblingReentry.ts',
  'utf8',
);
const migration = await readFile(
  'supabase/migrations/20261004101116_harden_restricted_sibling_reentry.sql',
  'utf8',
);
const version = await readFile(
  'src/lib/sybil/v2/version.ts',
  'utf8',
);

test('restricted sibling reentry requires a confirmed prior referral plus wallet-switch timing', () => {
  assert.match(
    pipeline,
    /SECURITY_CLIENT_RESTRICTED_SIBLING_REENTRY/u,
  );
  assert.match(
    helper,
    /peerConfirmedRestricted[\s\S]*currentFirstSeen >= peerLastSeen/u,
  );
  assert.match(
    helper,
    /switchGapSeconds <= 10 \* 60/u,
  );
  assert.match(
    helper,
    /activationGapSeconds <= 10 \* 60/u,
  );
  assert.match(
    helper,
    /loadRestrictedSiblingReferralKeys/u,
  );
});

test('generic shared-client siblings remain observation evidence instead of automatic restriction', () => {
  assert.match(
    pipeline,
    /code: 'SECURITY_CLIENT_SIBLING_LINK'[\s\S]*strength: 'MEDIUM'/u,
  );
  assert.match(
    migration,
    /Shared-client membership alone never restricts/u,
  );
});

test('runtime restriction re-verifies same inviter, active peer restriction, client switch, and activation timing', () => {
  assert.match(
    migration,
    /r\.related_invite_code = p\.invite_code/u,
  );
  assert.match(
    migration,
    /lower\(p\.inviter_wallet\) = lower\(v_invitation\.inviter_wallet\)/u,
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
    /v_invitation\.activated_at - current_obs\.first_seen_at/u,
  );
  assert.match(
    migration,
    /RESTRICTED_SIBLING_REENTRY_NOT_CONFIRMED/u,
  );
});

test('paid or already-assigned rewards remain immutable', () => {
  assert.match(
    migration,
    /v_invitation\.reward_status = 'PAID'/u,
  );
  assert.match(
    migration,
    /q\.status = 'ASSIGNED'/u,
  );
  assert.match(
    migration,
    /REWARD_ALREADY_FINAL/u,
  );
});

test('inviter related wallets are exposed only as an observed risk cluster', () => {
  assert.match(
    migration,
    /operator_sybil_v2_inviter_related_wallet_clusters/u,
  );
  assert.match(
    migration,
    /'OBSERVED_ONLY'::text as cluster_status/u,
  );
  assert.match(
    migration,
    /'sanctionAuthority', false/u,
  );
  assert.match(
    migration,
    /requiresIndependentBehavioralCorroboration/u,
  );
  assert.doesNotMatch(
    migration,
    /update\s+public\.sybil_v2_inviter_incidents/iu,
  );
});

test('automatic enforcement is invitee-only and never restricts the inviter by incident count', () => {
  assert.match(
    migration,
    /'restrictionScope', 'INVITEE_ONLY'/u,
  );
  assert.doesNotMatch(
    migration,
    /wallet_address\s*,[\s\S]*lower\(v_invitation\.inviter_wallet\)[\s\S]*'ACTIVE'/iu,
  );
  assert.match(
    pipeline,
    /applyRestrictedSiblingReentryRestriction/u,
  );
  assert.match(
    pipeline,
    /AUTO_RESTRICTED_SIBLING_REENTRY_RESTRICTION/u,
  );
});

test('analyzer version advances for the new evidence detector', () => {
  assert.match(
    version,
    /SYBIL_V2_ANALYZER_VERSION = 'sybil-v2\.2'/u,
  );
});
