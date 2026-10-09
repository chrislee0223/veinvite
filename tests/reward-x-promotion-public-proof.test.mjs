import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const proof = readFileSync(
  'src/lib/rewards/rewardXPromotionProof.ts',
  'utf8',
);
const page = readFileSync(
  'src/app/proofs/x/[proofId]/page.tsx',
  'utf8',
);

test('X promotion public proof uses an isolated namespace and route', () => {
  assert.match(
    proof,
    /veinvite:x-promotion:v1:proof:/,
  );
  assert.match(
    proof,
    /\/proofs\/x\/\$\{normalized\}/,
  );
  assert.match(
    proof,
    /VeInvite verified X promotion reward\./,
  );
  assert.doesNotMatch(
    proof,
    /referral-onboarding/,
  );
});

test('X promotion proof page is fail-closed on immutable verification evidence', () => {
  assert.match(
    page,
    /reward_x_promotion_payout_intents/,
  );
  assert.match(
    page,
    /reward_x_promotion_post_verifications/,
  );
  assert.match(
    page,
    /verification_state !==[\s\S]*'FINAL_VERIFIED'/,
  );
  assert.match(
    page,
    /verification\.invalidated_at !==[\s\S]*null/,
  );
  assert.match(
    page,
    /verification\.x_post_id[\s\S]*intent\.x_post_id/,
  );
  assert.match(
    page,
    /verification\.x_author_id[\s\S]*intent\.x_author_id/,
  );
});

test('paid X promotion proof must match the immutable payout intent', () => {
  assert.match(
    page,
    /reward_x_promotion_receipts/,
  );
  assert.match(
    page,
    /receipt\.public_proof_id/,
  );
  assert.match(
    page,
    /receipt\.amount_wei/,
  );
  assert.match(
    page,
    /receipt\.x_post_id/,
  );
  assert.match(
    page,
    /receipt\.x_author_id/,
  );
  assert.match(
    page,
    /does not match its immutable payout intent/,
  );
});

test('public X proof does not expose private anti-abuse evidence', () => {
  for (const forbidden of [
    'security_clients',
    'security_client_wallet_observations',
    'sybil_v2_evidence_records',
    'sybil_onchain_snapshots',
    'ip_address',
    'device_id',
  ]) {
    assert.doesNotMatch(
      page,
      new RegExp(forbidden, 'i'),
    );
  }

  assert.match(
    page,
    /does not expose device, IP,[\s\S]*location, or internal anti-abuse signals/,
  );
});
