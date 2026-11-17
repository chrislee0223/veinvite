import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const helper = readFileSync('src/lib/notifications/materializePaidRewardNotices.ts','utf8');
const recovery = readFileSync('src/lib/rewards/submittedPayoutRecovery.ts','utf8');
const automatic = readFileSync('src/lib/rewards/automaticRewardPayout.ts','utf8');

test('both finalized payout paths materialize the existing paid receipt alert',()=>{
  assert.match(recovery,/finalize_reward_payout_manifest[\s\S]*await safelyMaterializePaidRewardNoticesForRound\(roundId\)/);
  assert.match(automatic,/finalize_reward_payout_manifest[\s\S]*await safelyMaterializePaidRewardNoticesForRound\(/);
  assert.match(helper,/reconcile_verified_paid_reward_history/);
});
test('notification errors cannot interrupt or re-send a finalized payout',()=>{
  assert.match(helper,/try \{/);
  assert.match(helper,/catch \(error\)/);
  assert.match(helper,/console\.error\('Post-finality paid notification reconciliation deferred:'/);
  assert.doesNotMatch(helper,/sendTransaction|register_reward_payout_signed_transaction|finalize_reward_payout_manifest|INSERT INTO/);
});
test('financially authoritative, idempotent and bounded reconciliation',()=>{
  assert.match(helper,/\.eq\('status', 'PAID'\)/);
  assert.match(helper,/\.eq\('round_id', roundId\)/);
  assert.match(helper,/MAX_ROWS = 10_000/);
  assert.match(helper,/\.range\(offset, offset \+ PAGE_SIZE - 1\)/);
  assert.match(helper,/p_inviter_wallet: wallet/);
  assert.doesNotMatch(helper,/setTimeout|setInterval|notification_type|invite_notification_history.*insert/i);
});
