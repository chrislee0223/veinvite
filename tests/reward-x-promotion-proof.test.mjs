import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRewardXPromotionProof,
  isVeInviteXPromotionStructuredProof,
  VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
} from '../src/lib/rewards/rewardXPromotionProof.ts';

const proofId =
  '123e4567-e89b-42d3-a456-426614174000';

test('X promotion proof has its own exact namespace and public route', () => {
  const proof =
    buildRewardXPromotionProof(proofId);

  assert.equal(
    proof.proofText,
    `veinvite:x-promotion:v1:proof:${proofId}`,
  );
  assert.equal(
    proof.proofLink,
    `https://veinvite.vercel.app/proofs/x-promotion/${proofId}`,
  );
  assert.equal(
    proof.description,
    VEINVITE_X_PROMOTION_PROOF_DESCRIPTION,
  );
});

test('only exact X promotion structured proof is recognized', () => {
  const expected =
    buildRewardXPromotionProof(proofId);
  const raw = JSON.stringify({
    version: 2,
    description: expected.description,
    proof: {
      text: expected.proofText,
      link: expected.proofLink,
    },
  });

  assert.equal(
    isVeInviteXPromotionStructuredProof(raw),
    true,
  );

  assert.equal(
    isVeInviteXPromotionStructuredProof(
      JSON.stringify({
        version: 2,
        description:
          'VeInvite verified referral onboarding reward.',
        proof: {
          text:
            `veinvite:referral-onboarding:v2:proof:${proofId}`,
          link:
            `https://veinvite.vercel.app/proofs/${proofId}`,
        },
      }),
    ),
    false,
  );

  assert.equal(
    isVeInviteXPromotionStructuredProof(
      JSON.stringify({
        version: 2,
        description: expected.description,
        proof: {
          text: expected.proofText,
          link:
            'https://veinvite.vercel.app/proofs/x-promotion/not-the-proof-id',
        },
      }),
    ),
    false,
  );

  assert.equal(
    isVeInviteXPromotionStructuredProof('not-json'),
    false,
  );
});

test('promotion proof builder rejects non-v4 proof ids', () => {
  assert.throws(
    () =>
      buildRewardXPromotionProof(
        '00000000-0000-0000-0000-000000000000',
      ),
    /public Proof ID is invalid/,
  );
});
