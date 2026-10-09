import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutExecutor.ts',
    import.meta.url,
  ),
  'utf8',
);

const candidates = await readFile(
  new URL(
    '../src/lib/rewards/rewardXPromotionPayoutCandidates.ts',
    import.meta.url,
  ),
  'utf8',
);

const cron = await readFile(
  new URL(
    '../src/app/api/cron/x-promotion-maintenance/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('new X promotion signing requires independent worker and DB LIVE gates', () => {
  assert.match(source, /VEINVITE_X_PROMOTION_PAYOUT_WORKER_ENABLED/);
  assert.match(source, /VEINVITE_AUTOMATIC_REWARDS_ENABLED/);
  assert.match(
    source,
    /reward_x_promotion_enabled,reward_x_promotion_live_started_at/,
  );
  assert.match(source, /X promotion LIVE is disabled/);
});

test('promotion payout shares the core global signer lock', () => {
  assert.match(source, /automatic_reward_payout:\$\{network\}/);
  assert.doesNotMatch(source, /x_promotion_payout:\$\{network\}/);
});

test('core referral payouts retain priority over new promotion signing', () => {
  assert.match(source, /reward_queue_entries/);
  assert.match(source, /reward_rounds/);
  assert.match(source, /Core referral reward payout has priority/);
  assert.match(
    source,
    /Core referral reward appeared before X promotion signing/,
  );
});

test('signing rechecks pool safety and total outstanding liability', () => {
  assert.match(source, /readVeInviteRewardPoolStatus/);
  assert.match(source, /read_outstanding_reward_liability/);
  assert.match(source, /poolBalance < outstandingLiability/);
  assert.match(source, /distributionPaused/);
  assert.match(source, /rewardDistributors/);
});

test('LIVE, security and core priority are rechecked immediately before private-key use', () => {
  const runtime = source.indexOf('runtimeBeforeSign');
  const security = source.indexOf('securityBeforeSign', runtime);
  const core = source.indexOf('coreRewardWorkPending(network)', security);
  const key = source.indexOf('Hex.of(privateKeyHex).bytes', core);

  assert.ok(runtime >= 0);
  assert.ok(security > runtime);
  assert.ok(core > security);
  assert.ok(key > core);
  assert.match(
    source,
    /X promotion security clearance changed before signing/,
  );
  assert.match(
    source,
    /X promotion LIVE was disabled before signing/,
  );
});

test('signed transaction is atomically journaled before any broadcast', () => {
  const journal = source.indexOf(
    'register_reward_x_promotion_signed_submission_v1',
  );
  const broadcast = source.indexOf(
    'broadcastExactSignedTransaction',
    journal,
  );

  assert.ok(journal >= 0);
  assert.ok(broadcast > journal);
});

test('committed signed transaction recovery does not depend on new signing gates', () => {
  const exported = source.indexOf(
    'export async function runRewardXPromotionPayout',
  );
  const committedLookup = source.indexOf(
    'findCommittedPromotionIntentId',
    exported,
  );
  const committedRecovery = source.indexOf(
    'recoverCommittedLocked',
    committedLookup,
  );
  const runtimeGate = source.indexOf(
    'const runtime = await readRuntimeGate',
    committedRecovery,
  );

  assert.ok(committedLookup >= 0);
  assert.ok(committedRecovery > committedLookup);
  assert.ok(runtimeGate > committedRecovery);
  assert.match(source, /raw_tx_hex/);
  assert.match(source, /verifyFinalizedXPromotionTransactionOnChain/);
  assert.match(source, /finalize_reward_x_promotion_payout_v1/);
});

test('executor reuses the exact signed transaction instead of resigning on retry', () => {
  assert.match(source, /Transaction\.decode/);
  assert.match(source, /getTransaction\(txId\)/);
  assert.match(source, /sendTransaction/);
  assert.match(
    source,
    /VeChain returned a different transaction id/,
  );
});

test('journaled raw transaction identity is verified before any chain lookup or broadcast', () => {
  const decode = source.indexOf('Transaction.decode');
  const identityCheck = source.indexOf('decodedTxId !== txId', decode);
  const chainLookup = source.indexOf('getTransaction(txId)', decode);
  const send = source.indexOf('sendTransaction', decode);

  assert.ok(decode >= 0);
  assert.ok(identityCheck > decode);
  assert.ok(chainLookup > identityCheck);
  assert.ok(send > chainLookup);
  assert.match(
    source,
    /Journaled X promotion raw transaction does not match its transaction id/,
  );
});

test('candidate scans paginate and cannot starve entries beyond a fixed first page', () => {
  assert.match(candidates, /const PAGE_SIZE = 100/);
  assert.match(
    candidates,
    /\.range\(offset, offset \+ PAGE_SIZE - 1\)/,
  );
  assert.match(candidates, /offset \+= PAGE_SIZE/);
});

test('candidate history checks batch settled and already-used ids', () => {
  assert.match(
    candidates,
    /\.in\('intent_id', intentIds\)/,
  );
  assert.match(
    candidates,
    /\.in\('verification_id', verificationIds\)/,
  );
});

test('unsigned existing intent must remain payable before executor can select it', () => {
  const start = candidates.indexOf(
    'export async function findPayablePromotionIntentId',
  );
  const end = candidates.indexOf(
    'export async function findEligibleFinalPromotionVerificationId',
    start,
  );
  const block = candidates.slice(start, end);

  assert.match(block, /financial_state !== 'HELD'/);
  assert.match(block, /verification_state !== 'FINAL_VERIFIED'/);
  assert.match(block, /invalidated_at/);
  assert.match(block, /securityClear/);
});

test('already committed promotion payouts are selected before fresh intents', () => {
  const exported = source.indexOf(
    'export async function runRewardXPromotionPayout',
  );
  const committed = source.indexOf(
    'findCommittedPromotionIntentId',
    exported,
  );
  const fresh = source.indexOf(
    'findPayablePromotionIntentId',
    committed,
  );

  assert.ok(committed >= 0);
  assert.ok(fresh > committed);
});

test('promotion executor is not yet wired into lifecycle cron', () => {
  assert.doesNotMatch(cron, /rewardXPromotionPayoutExecutor/);
  assert.doesNotMatch(cron, /runRewardXPromotionPayout/);
});
