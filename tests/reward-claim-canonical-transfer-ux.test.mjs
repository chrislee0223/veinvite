import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [home, label, actionRoute, recovery, verifier, legacy, monitoring] =
  await Promise.all([
    read('src/components/HomeClient.tsx'),
    read('src/components/RewardTransferConfirmationLabel.tsx'),
    read('src/app/api/notifications/reward-actions/route.ts'),
    read('src/lib/rewards/submittedPayoutRecovery.ts'),
    read('src/lib/rewards/transactionVerification.ts'),
    read('src/lib/rewards/transactionVerificationLegacy.ts'),
    read('src/lib/rewards/operationsMonitoring.ts'),
  ]);

test('Home shows transfer confirmation separately from final PAID receipt', () => {
  assert.match(home, /RewardTransferConfirmationLabel/u);
  assert.match(home, /inviteCode=\{invite\.code\}/u);
  assert.match(label, /✓ B3TR/u);
  assert.match(label, /finalCheckText/u);
  assert.match(label, /queuedText/u);
  assert.match(label, /broadcastConfirmedAt/u);
  assert.match(label, /TX_ID_PATTERN\.test\(action\.txId\)/u);
  assert.match(actionRoute, /broadcastConfirmedAt &&[\s\S]*submission\?\.tx_id/u);
  assert.doesNotMatch(label, /\/api\/rewards\/claims/u);
  assert.doesNotMatch(label, /method:\s*'POST'/u);
  assert.doesNotMatch(label, /reward_receipts/u);
  assert.doesNotMatch(label, /REWARD_PAID/u);
});

test('confirmation reads are wallet-bound and stop fast polling after two minutes', () => {
  assert.match(label, /wallet\.toLowerCase\(\)/u);
  assert.match(label, /body\.walletAddress\?\.toLowerCase\(\) !== wallet\.toLowerCase\(\)/u);
  assert.match(label, /disposed = true/u);
  assert.match(label, /REWARD_ACTION_PENDING_TRANSFER_POLL_MS/u);
  assert.match(label, /REWARD_ACTION_IDLE_POLL_MS/u);
  assert.match(label, /FAST_CONFIRMATION_WINDOW_MS = 2 \* 60 \* 1000/u);
  assert.match(label, /document\.visibilityState !== 'visible'/u);
  assert.match(label, /AbortSignal\.timeout\(8_000\)/u);
});

test('canonical early confirmation validates the exact event and never finalizes reward money', () => {
  assert.match(recovery, /verifyCanonicalRewardTransactionOnChain/u);
  assert.match(recovery, /verifyFinalizedRewardTransactionOnChain/u);
  assert.match(verifier, /requireFinality: false/u);
  assert.match(legacy, /rewardEvent\.receiver !==[\s\S]*expectedClause\.recipientWallet/u);
  assert.match(legacy, /rewardEvent\.amountWei !==[\s\S]*expectedClause\.amountWei/u);
  assert.match(legacy, /manifest\.totalAmountWei/u);
  assert.match(
    recovery,
    /await markBroadcastConfirmed\(manifestId, txId\)/u,
  );
  assert.match(
    recovery,
    /p_finalized_head_number: verified\.finalizedHeadNumber/u,
  );
  assert.doesNotMatch(label, /finalize_reward_payout_manifest/u);
  assert.doesNotMatch(label, /reward_x_promotion/u);
});

test('monitor only escalates aged canonical finality and still catches missing transfers', () => {
  assert.match(
    monitoring,
    /CONFIRMED_FINALITY_WARNING_MS = 2 \* 60 \* 60 \* 1000/u,
  );
  assert.match(
    monitoring,
    /CONFIRMED_FINALITY_CRITICAL_MS = 3 \* 60 \* 60 \* 1000/u,
  );
  assert.match(
    monitoring,
    /activeRoundCanonical/u,
  );
  assert.match(
    monitoring,
    /SIGNED_TX_WARNING_MS = 10 \* 60 \* 1000/u,
  );
  assert.match(
    monitoring,
    /SIGNED_TX_CRITICAL_MS = 30 \* 60 \* 1000/u,
  );
});
