import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('future v3 payouts use structured Proof and validate the emitted JSON against the immutable manifest', () => {
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
    verifier,
    /JSON\.parse\(rawProof\)/u,
  );
  assert.match(
    verifier,
    /parsed\.version\s*!==\s*2/u,
  );
  assert.match(
    verifier,
    /parsed\.description\s*!==\s*clause\.description/u,
  );
  assert.match(
    verifier,
    /proof\.text\s*!==\s*clause\.proofValues\[0\]/u,
  );
  assert.match(
    verifier,
    /proof\.link\s*!==\s*clause\.proofValues\[1\]/u,
  );
  assert.match(
    verifier,
    /Object\.keys\(impact\)\.length\s*!==\s*0/u,
    'v3 must reject unexpected impact claims',
  );
  assert.match(
    verifier,
    /evidence:\s*sanitizedEvidence/u,
    'after structured proof verification, all legacy amount, receiver, operator, finality and exact calldata checks must still run',
  );
});
