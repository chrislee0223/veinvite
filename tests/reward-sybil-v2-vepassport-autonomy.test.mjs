import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  pipeline,
  policy,
  passport,
  network,
  migration,
  evidenceFamilyMigration,
] = await Promise.all([
    readFile(
      'src/lib/sybil/v2/pipeline.ts',
      'utf8',
    ),
    readFile(
      'src/lib/sybil/v2/policy.ts',
      'utf8',
    ),
    readFile(
      'src/lib/sybil/vePassportSignals.ts',
      'utf8',
    ),
    readFile(
      'src/lib/vebetter/network.ts',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20260929223000_add_sybil_v2_vepassport_identity_restriction.sql',
      'utf8',
    ),
    readFile(
      'supabase/migrations/20260929224500_allow_sybil_v2_ecosystem_reputation_evidence.sql',
      'utf8',
    ),
  ]);

test('Sybil v2 reads the reviewed VePassport as an independent evidence source', () => {
  assert.match(
    pipeline,
    /readVePassportReferralSnapshot/u,
  );
  assert.match(
    policy,
    /ECOSYSTEM_REPUTATION/u,
  );
  assert.match(
    policy,
    /sybil-v2\.16/u,
  );
  assert.match(
    network,
    /veBetterPassportAddress/u,
  );
  assert.match(
    network,
    /0x35a267671d8EDD607B2056A9a13E7ba7CF53c8b3/u,
  );
});

test('same VePassport identity is a high direct identity conflict and automatic restriction candidate', () => {
  assert.match(
    pipeline,
    /VEPASSPORT_SAME_PASSPORT_INVITER[\s\S]*family:\s*'SECURITY_IDENTITY'[\s\S]*strength:\s*'HIGH'[\s\S]*score:\s*100/u,
  );
  assert.match(
    pipeline,
    /VEPASSPORT_SHARED_PASSPORT_PARTICIPANT[\s\S]*family:\s*'SECURITY_IDENTITY'[\s\S]*strength:\s*'HIGH'[\s\S]*score:\s*100/u,
  );
  assert.match(
    pipeline,
    /applyVePassportSamePassportRestriction/u,
  );
  assert.match(
    migration,
    /VEPASSPORT_SAME_PASSPORT_INVITER/u,
  );
  assert.match(
    migration,
    /VEPASSPORT_SHARED_PASSPORT_PARTICIPANT/u,
  );
  assert.match(
    migration,
    /reward_status = 'FORFEITED'/u,
  );
  assert.match(
    migration,
    /sybil_status = 'BLOCKED'/u,
  );
});

test('VePassport blacklist and bot signals pause for review only when their protocol checks are enabled', () => {
  assert.match(
    pipeline,
    /snapshot\.enabledChecks\.signaling[\s\S]*VEPASSPORT_SIGNAL_THRESHOLD_REACHED[\s\S]*family:\s*'ECOSYSTEM_REPUTATION'[\s\S]*strength:\s*'HIGH'/u,
  );
  assert.match(
    pipeline,
    /snapshot\.enabledChecks\.blacklist[\s\S]*VEPASSPORT_BLACKLISTED[\s\S]*family:\s*'ECOSYSTEM_REPUTATION'[\s\S]*strength:\s*'HIGH'/u,
  );
  assert.match(
    passport,
    /signalingCheckEnabled/u,
  );
  assert.match(
    passport,
    /blacklistCheckEnabled/u,
  );
  assert.doesNotMatch(
    migration,
    /VEPASSPORT_SIGNAL_THRESHOLD_REACHED/u,
  );
  assert.doesNotMatch(
    migration,
    /VEPASSPORT_BLACKLISTED/u,
  );
});

test('pre-activation Passport activity corroborates historical activity with one Passport-level cumulative score read', () => {
  assert.match(
    pipeline,
    /VEPASSPORT_PREACTIVATION_ACTIVITY[\s\S]*family:\s*'HISTORICAL_REWARD'[\s\S]*strength:\s*'MEDIUM'/u,
  );
  assert.match(
    pipeline,
    /entryClass === 'NEW'/u,
  );
  assert.match(
    passport,
    /preActivationCumulativeScore/u,
  );
  assert.match(
    passport,
    /getCumulativeScoreWithDecay\([\s\S]*resolvedPassport[\s\S]*BigInt\(preActivationRound\)/u,
  );
});

test('personhood and delegation are audit context, not direct adverse signals', () => {
  assert.match(
    passport,
    /isPerson/u,
  );
  assert.match(
    passport,
    /getDelegatee/u,
  );
  assert.match(
    passport,
    /getDelegator/u,
  );
  assert.doesNotMatch(
    pipeline,
    /code:\s*'VEPASSPORT_NOT_PERSON'/u,
  );
  assert.doesNotMatch(
    pipeline,
    /code:\s*'VEPASSPORT_DELEGATION'/u,
  );
});

test('VePassport-related holds are automatically revisited on a bounded cadence', () => {
  assert.match(
    pipeline,
    /VEPASSPORT_RECHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/u,
  );
  assert.match(
    pipeline,
    /hasVePassportSignal/u,
  );
  assert.match(
    pipeline,
    /vePassportStale/u,
  );
});

test('same-identity restriction preserves already-final rewards', () => {
  assert.match(
    migration,
    /reward_status = 'PAID'/u,
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


test('VePassport evidence is fail-closed and its evidence family is accepted by the database', () => {
  assert.match(
    pipeline,
    /const DECISION_CHECKS = \[[\s\S]*'VEPASSPORT'/u,
  );
  assert.match(
    evidenceFamilyMigration,
    /ECOSYSTEM_REPUTATION/u,
  );
  assert.match(
    evidenceFamilyMigration,
    /sybil_v2_evidence_records_evidence_family_check/u,
  );
});
