import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(
  new URL(
    '../src/app/promotion-proofs/[proofId]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('X promotion public proof has its own route and semantics', () => {
  assert.match(
    page,
    /VeInvite X Promotion Proof/,
  );
  assert.match(
    page,
    /VeInvite verified X promotion bonus\./,
  );
  assert.match(
    page,
    /separate from the[\s\S]*referral-onboarding reward/,
  );
});

test('public proof validates immutable manifest identity before rendering', () => {
  assert.match(
    page,
    /reward_x_promotion_payout_manifests/,
  );
  assert.match(
    page,
    /verifyManifestClause/,
  );
  assert.match(
    page,
    /veinvite:x-promotion:v1:proof:/,
  );
  assert.match(
    page,
    /promotion-proofs\/\$\{args\.publicProofId\}/,
  );
  assert.match(
    page,
    /impactCodes\.length === 0/,
  );
  assert.match(
    page,
    /impactValues\.length === 0/,
  );
});

test('public proof cross-checks intent and paid receipt instead of trusting URL alone', () => {
  assert.match(
    page,
    /reward_x_promotion_payout_intents/,
  );
  assert.match(
    page,
    /reward_x_promotion_receipts/,
  );
  assert.match(
    page,
    /String\(receipt\.intent_id\) !== intentId/,
  );
  assert.match(
    page,
    /BigInt\(String\(receipt\.amount_wei\)\)\.toString\(\) !== amountWei/,
  );
});

test('public proof exposes only public chain and X evidence', () => {
  assert.match(
    page,
    /getVeChainExplorerAddressUrl/,
  );
  assert.match(
    page,
    /getVeChainExplorerTransactionUrl/,
  );
  assert.match(
    page,
    /https:\/\/x\.com\/i\/web\/status/,
  );
  assert.doesNotMatch(
    page,
    /device|ip_address|security_client/i,
  );
});
