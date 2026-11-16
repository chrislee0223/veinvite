import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const src=readFileSync('src/lib/rewards/payoutObservability.ts','utf8');
const history=readFileSync('src/components/RewardPayoutHistoryClient.tsx','utf8');
const claims=readFileSync('src/components/RestrictedApprovedRewardClaims.tsx','utf8');
test('canonical broadcast marker is required before showing onchain transfer',{timeout:10000},()=>{
  assert.match(src,/const onchainSubmittedTxId = broadcastConfirmedAt/);
  assert.match(src,/submissionByRound\.get\(roundId\)/);
  assert.match(src,/broadcast_confirmed_at/);
  assert.match(src,/onchainTransferredPayouts: pending\.filter/);
  assert.match(history,/payout\.status !== 'PAID' && payout\.broadcastConfirmedAt && payout\.txId/);
  assert.match(history,/온체인 송금 확인 · 최종 확정 대기/);
});
test('wallet Claim reuses all-locale confirmed transfer message rather than generic final check',()=>{
  assert.match(claims,/\? copy\.transferConfirmed/);
});
test('status-only change cannot sign or finalize a payout',()=>{
  assert.doesNotMatch(src,/finalize_reward_payout_manifest|\.rpc\('mark_reward_payout/);
});
