import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { matchStructuredRewardProof } from '../src/lib/rewards/structuredProof.ts';

const verifier = await readFile(
  new URL('../src/lib/rewards/transactionVerification.ts', import.meta.url),
  'utf8',
);
const legacyVerifier = await readFile(
  new URL('../src/lib/rewards/transactionVerificationLegacy.ts', import.meta.url),
  'utf8',
);
const manifestBuilder = await readFile(
  new URL('../src/lib/rewards/payoutManifest.ts', import.meta.url),
  'utf8',
);

const PUBLIC_PROOF_ID = '123e4567-e89b-42d3-a456-426614174000';
const expectedProof = {
  proofText: `veinvite:referral-onboarding:v2:proof:${PUBLIC_PROOF_ID}`,
  proofLink: `https://veinvite.vercel.app/proofs/${PUBLIC_PROOF_ID}`,
  description: 'VeInvite verified referral onboarding reward.',
};

test('historical v2 verification keeps current distributeReward event semantics and exact calldata checks', () => {
  assert.match(
    legacyVerifier,
    /rewardEvent\.proof\s*!==\s*''/u,
    'legacy distributeReward emits RewardDistributed with an empty proof',
  );
  assert.doesNotMatch(
    legacyVerifier,
    /rewardEvent\.proof\s*!==\s*expectedClause\.proof/u,
    'the deprecated calldata proof must not be expected in RewardDistributed',
  );
  assert.match(
    legacyVerifier,
    /actual\.data\s*!==\s*expected\.data\.toLowerCase\(\)/u,
    'the exact signed calldata must still match the immutable v2 manifest',
  );
  assert.match(
    legacyVerifier,
    /rewardEvent\.appId\s*!==[\s\S]*manifest\.appId\.toLowerCase\(\)/u,
  );
  assert.match(
    legacyVerifier,
    /rewardEvent\.receiver\s*!==[\s\S]*expectedClause\.recipientWallet/u,
  );
  assert.match(
    legacyVerifier,
    /rewardEvent\.amountWei\s*!==[\s\S]*expectedClause\.amountWei/u,
  );
  assert.match(
    legacyVerifier,
    /rewardEvent\.distributor\s*!==[\s\S]*normalizedOperator/u,
  );
});

test('versioned verifier preserves v2 behavior by delegating to the reviewed legacy verifier', () => {
  assert.match(
    verifier,
    /manifest\.version\s*===\s*PAYOUT_MANIFEST_VERSION_V2/u,
  );
  assert.match(
    verifier,
    /return verifyLegacyPayoutTransactionEvidence\(\{[\s\S]*manifest,[\s\S]*operatorWallet,[\s\S]*manifestCreatedAt,[\s\S]*evidence,/u,
  );
});

test('official structured Proof JSON without impact matches when VeInvite declares no impact', () => {
  const rawProof = JSON.stringify({
    version: 2,
    description: expectedProof.description,
    proof: {
      text: expectedProof.proofText,
      link: expectedProof.proofLink,
    },
  });

  assert.equal(
    matchStructuredRewardProof(rawProof, expectedProof),
    'match',
  );
});

test('structured Proof verification rejects a synthetic empty impact object', () => {
  const rawProof = JSON.stringify({
    version: 2,
    description: expectedProof.description,
    proof: {
      text: expectedProof.proofText,
      link: expectedProof.proofLink,
    },
    impact: {},
  });

  assert.equal(
    matchStructuredRewardProof(rawProof, expectedProof),
    'mismatch',
  );
});

test('structured Proof verification rejects altered text, links and invalid JSON', () => {
  assert.equal(
    matchStructuredRewardProof(
      JSON.stringify({
        version: 2,
        description: expectedProof.description,
        proof: {
          text: 'altered',
          link: expectedProof.proofLink,
        },
      }),
      expectedProof,
    ),
    'mismatch',
  );

  assert.equal(
    matchStructuredRewardProof(
      JSON.stringify({
        version: 2,
        description: expectedProof.description,
        proof: {
          text: expectedProof.proofText,
          link: 'https://example.com/altered',
        },
      }),
      expectedProof,
    ),
    'mismatch',
  );

  assert.equal(
    matchStructuredRewardProof('{not-json', expectedProof),
    'invalid-json',
  );
});

test('future v3 payouts use structured Proof with an opaque public Proof ID and still run legacy settlement checks', () => {
  assert.match(
    manifestBuilder,
    /distributeRewardWithProof/u,
    'new manifests must call the structured-proof rewards-pool function',
  );
  assert.match(
    manifestBuilder,
    /const proofTypes = \['text', 'link'\]/u,
  );
  assert.match(
    manifestBuilder,
    /publicProofId/u,
  );
  assert.match(
    manifestBuilder,
    /veinvite:referral-onboarding:v2:proof:/u,
  );
  assert.match(
    verifier,
    /matchStructuredRewardProof/u,
    'v3 event verification must use the runtime structured-proof parser',
  );
  assert.match(
    verifier,
    /evidence:\s*sanitizedEvidence/u,
    'after structured proof verification, all legacy amount, receiver, operator, finality and exact calldata checks must still run',
  );
});
