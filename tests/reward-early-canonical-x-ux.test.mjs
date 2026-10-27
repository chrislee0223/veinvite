import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const early = read('src/lib/rewards/earlyRewardTransferFeedback.ts');
const hook = read('src/hooks/useRewardPaidTransientFeedback.ts');
const actions = read('src/app/api/notifications/reward-actions/route.ts');
const recovery = read('src/lib/rewards/submittedPayoutRecovery.ts');
const migrations = read('supabase/migrations/20261027131000_allow_safe_early_x_promotion_after_canonical_transfer.sql');
const notice = read('src/lib/notifications/rewardPaidToast.ts');
const copy = read('src/lib/i18n/earlyRewardTransferCopy.ts');
const processing = read('src/components/RewardTransferConfirmationLabel.tsx');
const home = read('src/components/HomeClient.tsx');

const locales = read('src/lib/i18n/locales.ts');

test('canonical feedback requires wallet-scoped, immutable, event-verified broadcast', () => {
  assert.match(actions, /broadcastConfirmedAt &&[\s\S]*submission\?\.tx_id/u);
  assert.match(hook, /body\.walletAddress\?\.toLowerCase\(\) !== wallet\.toLowerCase\(\)/u);
  assert.match(hook, /action\.broadcastConfirmedAt/u);
  assert.match(hook, /CANONICAL_TX_PATTERN\.test\(action\.txId\)/u);
  assert.match(hook, /BigInt\(amountWei\) <= 0n/u);
  assert.match(recovery, /verifyCanonicalRewardTransactionOnChain/u);
  assert.doesNotMatch(early, /finalize_reward_payout_manifest|status='PAID'|reward_receipts/u);
});

test('early notice does not acknowledge finalized PAID receipt or forge one', () => {
  assert.match(early, /veinvite:early-transfer-shown:v1:/u);
  assert.match(early, /localStorage\.setItem/u);
  assert.match(early, /wallet\.toLowerCase\(\)/u);
  assert.match(early, /inviteCode\.toUpperCase\(\)/u);
  assert.match(early, /txId\.toLowerCase\(\)/u);
  assert.match(hook, /wasEarlyRewardTransferAcknowledged\([\s\S]*pendingReward\.txId/u);
  assert.match(hook, /onConfirm: \(\) => markEarlyRewardTransferAcknowledged\(wallet, code, tx\)/u);
  assert.match(hook, /void acknowledgeReward\(pendingReward\)/u);
  assert.match(hook, /clearRewardPaidToast\(wallet, pendingReward\.receiptId\)/u);
  assert.match(hook, /Never acknowledges or creates a PAID receipt/u);
  assert.match(notice, /txId: receipt\.txId/u);
  assert.match(hook, /EARLY_REWARD_TRANSFER_COPY\[locale\]/u);
});

test('early X offer only opens with canonical linked signed and submitted payout', () => {
  assert.match(migrations, /r\.broadcast_confirmed_at is not null/u);
  assert.match(migrations, /p\.status='PENDING'/u);
  assert.match(migrations, /sub\.tx_id=sig\.tx_id/u);
  assert.match(migrations, /sig\.manifest_hash=m\.manifest_hash/u);
  assert.match(migrations, /reward_x_promotion_canonical_base_ready_v1\(/u);
  assert.match(migrations, /reward_x_promotion_security_clear_v1\(/u);
  assert.match(recovery, /sync_reward_x_promotion_opportunities_v1/u);
  assert.match(recovery, /Early X opportunity is deferred to regular maintenance/u);
});

test('no bonus payout intent can be signed without finalized base PAID receipt', () => {
  assert.match(migrations, /REWARD_X_PROMOTION_BASE_NOT_FINALIZED/u);
  assert.match(migrations, /p\.status='PAID'/u);
  assert.match(migrations, /join public\.reward_receipts r on r\.payout_id=p\.id/u);
  assert.match(migrations, /revoke all on function public\.reward_x_promotion_canonical_base_ready_v1/u);
  assert.match(migrations, /to service_role;/u);
});

test('early incentive link waits for immutable OPEN offer and expires at deadline', () => {
  assert.match(hook, /offer\.state !== 'OPEN'/u);
  assert.match(hook, /rewardXPromotionShareUrl\(\{/u);
  assert.match(hook, /!offer\.shareToken/u);
  assert.match(hook, /body\.xUrlLessEnabled && body\.xConnected !== true/u);
  assert.match(hook, /Date\.now\(\) >= deadline/u);
  assert.match(hook, /shareLabel: undefined, onShare: undefined/u);
  assert.doesNotMatch(early, /reward_x_promotion_post_submissions/u);
});

test('early reward copy is available for every VeInvite locale', () => {
  const known = [...locales.matchAll(/\{ locale: '([^']+)'/gu)].map((m) => m[1]);
  for (const locale of known) {
    assert.ok(
      copy.includes(JSON.stringify(locale) + ': { title:'),
      'missing early copy for ' + locale,
    );
  }
});

test('authenticated early offer remains discoverable after popup close or OAuth return', () => {
  assert.match(home, /<TransferStatus[\s\S]*rewardShareUrl=\{referralLinkVerified/u);
  assert.match(processing, /confirmedIdentity === identity/u);
  assert.match(processing, /offer\.state !== 'OPEN'/u);
  assert.match(processing, /rewardXPromotionShareUrl/u);
  assert.match(processing, /body\.walletAddress\?\.toLowerCase\(\) !== wallet\.toLowerCase\(\)/u);
  assert.match(processing, /x-connect\/start\?inviteCode/u);
  assert.match(processing, /Date\.now\(\) >= earlyX\.deadline/u);
  assert.doesNotMatch(processing, /status='PAID'|finalize_reward_payout_manifest/u);
});
