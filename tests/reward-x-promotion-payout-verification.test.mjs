import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutVerification.ts',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion finality verification reuses the reviewed core verifier', () => {
  assert.match(
    source,
    /verifyFinalizedRewardTransactionOnChain/,
  );
  assert.match(
    source,
    /PAYOUT_MANIFEST_VERSION_V3/,
  );
  assert.doesNotMatch(
    source,
    /ThorClient|sendTransaction|sign\(/,
  );
});

test('verification adapter is exactly one payout clause and preserves X proof identity', () => {
  assert.match(source, /payoutCount: 1/);
  assert.match(
    source,
    /totalAmountWei: manifest\.amountWei/,
  );
  assert.match(
    source,
    /proof: manifest\.proofText/,
  );
  assert.match(
    source,
    /publicProofId:\s*manifest\.publicProofId/,
  );
  assert.match(
    source,
    /description:\s*manifest\.description/,
  );
  assert.match(
    source,
    /data: manifest\.clause\.data/,
  );
});

test('verification adapter never changes recipient, amount, pool or operator identity', () => {
  assert.match(
    source,
    /recipientWallet:\s*manifest\.recipientWallet/,
  );
  assert.match(
    source,
    /amountWei: manifest\.amountWei/,
  );
  assert.match(
    source,
    /x2EarnRewardsPoolAddress:\s*manifest\.x2EarnRewardsPoolAddress/,
  );
  assert.match(
    source,
    /operatorWallet:\s*manifest\.operatorWallet/,
  );
});
