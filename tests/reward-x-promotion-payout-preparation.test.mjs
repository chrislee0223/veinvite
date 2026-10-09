import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutPreparation.ts',
    import.meta.url,
  ),
  'utf8',
);

test('preparation is hard gated by X Promotion LIVE before distributor or chain work', () => {
  const gate = source.indexOf(
    'const liveGate',
  );
  const readiness = source.indexOf(
    'readAutomaticRewardDistributorReadiness',
    gate,
  );

  assert.ok(gate >= 0);
  assert.ok(readiness > gate);
  assert.match(
    source,
    /!liveGate\.enabled \|\|[\s\S]*!liveGate\.startedAt/,
  );
});

test('preparation can never sign or broadcast B3TR', () => {
  assert.doesNotMatch(
    source,
    /PRIVATE_KEY|privateKey|Transaction\.of|\.sign\(|sendTransaction|sendRawTransaction|raw_tx_hex/i,
  );
  assert.match(
    source,
    /transfersPerformed: false/,
  );
});

test('core referral payouts have priority before and after the shared payout lock', () => {
  assert.match(
    source,
    /automatic_reward_payout:\$\{network\}/,
  );
  const checks = [
    ...source.matchAll(
      /await hasCoreRewardPriority\(network\)/g,
    ),
  ];
  assert.ok(checks.length >= 2);
  assert.match(
    source,
    /CORE_REWARD_PENDING/,
  );
});

test('preparation only advances final verified held promotion obligations', () => {
  assert.match(
    source,
    /verification_state'[\s\S]*'FINAL_VERIFIED'/,
  );
  assert.match(
    source,
    /obligation\.financial_state !== 'HELD'/,
  );
  assert.match(
    source,
    /create_reward_x_promotion_payout_intent_v1/,
  );
});

test('preparation freezes immutable manifest and chain checkpoint before any future signer exists', () => {
  assert.match(
    source,
    /buildXPromotionPayoutManifest/,
  );
  assert.match(
    source,
    /create_reward_x_promotion_payout_manifest_v1/,
  );
  assert.match(
    source,
    /create_reward_x_promotion_payout_checkpoint_v1/,
  );
  assert.match(
    source,
    /status: 'PREPARED'/,
  );
});

test('preparation reuses reviewed pool and distributor safety checks', () => {
  assert.match(
    source,
    /readVeInviteRewardPoolStatus/,
  );
  assert.match(
    source,
    /mainnetFundedRewardsEnabled/,
  );
  assert.match(
    source,
    /distributionPaused/,
  );
  assert.match(
    source,
    /rewardDistributors\.includes/,
  );
  assert.match(
    source,
    /distributorAddress ===[\s\S]*pool\.appAdmin/,
  );
});
