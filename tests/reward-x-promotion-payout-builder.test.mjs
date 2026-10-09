import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutManifest.ts',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion manifest uses a dedicated proof namespace and description', () => {
  assert.match(
    source,
    /veinvite:x-promotion:v1:proof:/,
  );
  assert.match(
    source,
    /https:\/\/veinvite\.vercel\.app\/promotion-proofs/,
  );
  assert.match(
    source,
    /VeInvite verified X promotion bonus\./,
  );
  assert.doesNotMatch(
    source,
    /referral-onboarding/,
  );
});

test('X promotion manifest encodes exactly one structured Rewards Pool clause', () => {
  assert.match(
    source,
    /distributeRewardWithProof/,
  );
  assert.match(
    source,
    /\['text', 'link'\]/,
  );
  assert.match(
    source,
    /const impactCodes: \[\] = \[\]/,
  );
  assert.match(
    source,
    /const impactValues: \[\] = \[\]/,
  );
  assert.match(
    source,
    /value: '0x0'/,
  );
});

test('X promotion manifest is bound to VeInvite app, intent, wallet and exact amount', () => {
  assert.match(
    source,
    /X_PROMOTION_VEINVITE_APP_ID/,
  );
  assert.match(
    source,
    /intentId: normalizedIntentId/,
  );
  assert.match(
    source,
    /recipientWallet:\s*normalizedRecipient/,
  );
  assert.match(
    source,
    /amountWei: normalizedAmount/,
  );
  assert.match(
    source,
    /publicProofId:\s*normalizedProofId/,
  );
});

test('X promotion manifest hash covers the financial and proof identity', () => {
  const hashStart = source.indexOf(
    'function hashManifest',
  );
  const hashEnd = source.indexOf(
    'export function buildXPromotionPayoutManifest',
  );

  assert.ok(hashStart >= 0);
  assert.ok(hashEnd > hashStart);

  const hashBlock =
    source.slice(hashStart, hashEnd);

  for (const field of [
    'intentId',
    'appId',
    'x2EarnRewardsPoolAddress',
    'operatorWallet',
    'inviteCode',
    'recipientWallet',
    'amountWei',
    'publicProofId',
    'proofText',
    'proofLink',
    'description',
    'clause',
  ]) {
    assert.match(
      hashBlock,
      new RegExp(field),
    );
  }
});

test('X promotion manifest rejects invalid financial identity before signing code can use it', () => {
  assert.match(
    source,
    /must be a positive integer/,
  );
  assert.match(
    source,
    /manifest can only target the VeInvite app/,
  );
  assert.match(
    source,
    /public Proof ID is invalid/,
  );
  assert.match(
    source,
    /invite code is invalid/,
  );
});
