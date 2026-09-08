import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const verifier = await readFile(
  new URL('../src/lib/rewards/transactionVerification.ts', import.meta.url),
  'utf8',
);

test('reviewed reward verifier follows current X2EarnRewardsPool distributeReward event semantics', () => {
  assert.match(
    verifier,
    /rewardEvent\.proof\s*!==\s*''/u,
    'distributeReward emits RewardDistributed with an empty proof',
  );
  assert.doesNotMatch(
    verifier,
    /rewardEvent\.proof\s*!==\s*expectedClause\.proof/u,
    'the deprecated calldata proof must not be expected in RewardDistributed',
  );
});

test('empty event proof compatibility does not weaken immutable clause verification', () => {
  assert.match(
    verifier,
    /actual\.data\s*!==\s*expected\.data\.toLowerCase\(\)/u,
    'the exact signed calldata must still match the immutable manifest',
  );
  assert.match(
    verifier,
    /rewardEvent\.appId\s*!==[\s\S]*manifest\.appId\.toLowerCase\(\)/u,
  );
  assert.match(
    verifier,
    /rewardEvent\.receiver\s*!==[\s\S]*expectedClause\.recipientWallet/u,
  );
  assert.match(
    verifier,
    /rewardEvent\.amountWei\s*!==[\s\S]*expectedClause\.amountWei/u,
  );
  assert.match(
    verifier,
    /rewardEvent\.distributor\s*!==[\s\S]*normalizedOperator/u,
  );
});
