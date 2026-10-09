import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  matchStructuredRewardProof,
} from '../src/lib/rewards/structuredProof.ts';

const clauseBuilder = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutClause.ts',
    import.meta.url,
  ),
  'utf8',
);
const proofBuilder = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionProof.ts',
    import.meta.url,
  ),
  'utf8',
);

const PUBLIC_PROOF_ID =
  '123e4567-e89b-42d3-a456-426614174000';
const expected = {
  proofText:
    `veinvite:x-promotion:v1:proof:${PUBLIC_PROOF_ID}`,
  proofLink:
    `https://veinvite.vercel.app/proofs/x/${PUBLIC_PROOF_ID}`,
  description:
    'VeInvite verified X promotion reward.',
};

test('X promotion payout uses its own structured-proof namespace', () => {
  assert.match(
    clauseBuilder,
    /distributeRewardWithProof/,
  );
  assert.match(
    clauseBuilder,
    /buildRewardXPromotionProof/,
  );
  assert.match(
    clauseBuilder,
    /VEINVITE_APP_ID/,
  );
  assert.match(
    proofBuilder,
    /veinvite:x-promotion:v1:proof:/,
  );
  assert.doesNotMatch(
    clauseBuilder,
    /referral-onboarding/,
  );
});

test('X promotion declares proof evidence without synthetic impact claims', () => {
  assert.match(
    clauseBuilder,
    /const proofTypes:[\s\S]*\['text', 'link'\]/,
  );
  assert.match(
    clauseBuilder,
    /const impactCodes: \[\] = \[\]/,
  );
  assert.match(
    clauseBuilder,
    /const impactValues: \[\] = \[\]/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.impactCodes\.length !==[\s\S]*0/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.impactValues\.length !==[\s\S]*0/,
  );
});

test('official structured Proof parser accepts the X promotion proof shape', () => {
  const raw = JSON.stringify({
    version: 2,
    description:
      expected.description,
    proof: {
      text:
        expected.proofText,
      link:
        expected.proofLink,
    },
  });

  assert.equal(
    matchStructuredRewardProof(
      raw,
      expected,
    ),
    'match',
  );
});

test('X promotion clause self-check binds app, amount, recipient, proof and description', () => {
  assert.match(
    clauseBuilder,
    /decoded\.appId !==[\s\S]*VEINVITE_APP_ID/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.amountWei !==[\s\S]*clause\.amountWei/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.recipientWallet !==[\s\S]*clause\.recipientWallet/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.proofValues\[0\] !==[\s\S]*clause\.proof/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.proofValues\[1\] !==[\s\S]*clause\.proofValues\[1\]/,
  );
  assert.match(
    clauseBuilder,
    /decoded\.description !==[\s\S]*clause\.description/,
  );
});
