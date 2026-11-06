import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const claim = read('src/app/api/rewards/claims/route.ts');
const fallback = read('src/app/api/cron/reward-claim-recovery/route.ts');
const queue = read('src/app/api/queues/reward-finality/route.ts');
const recovery = read('src/lib/rewards/automaticRewardPayoutWithMnemonic.ts');
const vercel = JSON.parse(read('vercel.json'));

test('button click starts signer before returning; does not wait for hourly or daily cron', () => {
  const claimRpc = claim.indexOf("'request_reward_claim'");
  const immediate = claim.indexOf('await runClaimPayoutKickoff()');
  const durable = claim.indexOf('await enqueueClaimPayoutContinuation({');
  const response = claim.indexOf('return NextResponse.json(', durable);
  assert.ok(claimRpc >= 0 && claimRpc < immediate);
  assert.ok(immediate < durable && durable < response);
  assert.match(claim, /CLAIM_PAYOUT_RETRY_DELAYS_MS = \[[\s\S]*?0,[\s\S]*?300,[\s\S]*?900,[\s\S]*?1_800,/);
});

test('queue remains the low-latency primary replay and uses same idempotent signer', () => {
  assert.match(queue, /runImmediateClaimRewardPayout\(\)/);
  assert.match(queue, /needsDurableClaimPayoutContinuation/);
  assert.match(recovery, /runBaseAutomaticRewardPayout\(\{[\s\S]*allowGeneralRoundPreparation: false/);
});

test('independent cron retries only overdue real Claims or immutable pending payouts', () => {
  const schedule = vercel.crons.find(
    (cron) => cron.path === '/api/cron/reward-claim-recovery',
  );
  assert.deepEqual(schedule, {
    path: '/api/cron/reward-claim-recovery',
    schedule: '* * * * *',
  });
  assert.match(fallback, /const CLAIM_STALL_AGE_MS = 45_000/);
  assert.match(fallback, /\.eq\('status', 'QUEUED'\)/);
  assert.match(fallback, /\.not\('claim_requested_at', 'is', null\)/);
  assert.match(fallback, /\.lte\('claim_requested_at', before\)/);
  assert.match(fallback, /\.in\('status', \['PENDING', 'SENDING', 'FAILED'\]\)/);
  assert.match(fallback, /if \(!\(await hasStaleClaimWork\(\)\)\)/);
  assert.match(fallback, /runImmediateClaimRewardPayout\(\)/);
  assert.doesNotMatch(fallback, /reserveEligibleReferralRewards|prepareRewardRound|commit_reward_reservation/);
  assert.doesNotMatch(fallback, /privateKey|signTransaction|sendTransaction/);
});

test('cron is authenticated, fails closed on DB errors, and never declares SUBMITTED paid', () => {
  assert.match(fallback, /CRON_SECRET/);
  assert.match(fallback, /timingSafeEqual/);
  assert.match(fallback, /status: 401/);
  assert.match(fallback, /if \(queuedError\)/);
  assert.match(fallback, /if \(pendingError\)/);
  assert.match(fallback, /MANUAL_INTERVENTION_REQUIRED/);
  assert.match(fallback, /CLAIM_PAYOUT_REQUIRES_OPERATOR/);
  assert.match(fallback, /txSubmitted: result.status === 'SUBMITTED'/);
  assert.doesNotMatch(fallback, /status: 'PAID'/);
});
