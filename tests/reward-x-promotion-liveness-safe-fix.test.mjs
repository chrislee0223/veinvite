import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const route=read('src/app/api/cron/x-promotion-maintenance/route.ts');
const sql=read('supabase/migrations/20261112141000_x_promotion_safe_retry_cadence_v1.sql');
const executor=read('src/lib/rewards/rewardXPromotionPayoutExecutor.ts');
const verification=read('src/lib/rewards/rewardXPromotionPayoutVerification.ts');
const xapi=read('src/lib/rewards/rewardXPromotionXApi.ts');

test('retry timing: original 15m cron, ordinary 12m eligibility, provider throttling 60m',()=>{
 const vercel=JSON.parse(read('vercel.json'));
 assert.equal(vercel.crons.filter(c=>c.path==='/api/cron/x-promotion-maintenance').length,1);
 assert.equal(vercel.crons.find(c=>c.path==='/api/cron/x-promotion-maintenance').schedule,'*/15 * * * *');
 assert.match(sql,/else interval '12 minutes'/);
 assert.match(sql,/retry\.latest_reason in \('X_API_RATE_LIMITED','X_API_AUTH_FAILED'\)/);
 assert.match(sql,/X_API_BUDGET_EXHAUSTED/);
 assert.match(sql,/interval '60 minutes'/);
 assert.match(sql,/u\.submitted_at <= now\(\)-interval '10 minutes'/);
 assert.match(sql,/o\.financial_state='HELD'/);
 assert.match(sql,/u\.submission_state='PENDING'/);
 assert.match(sql,/X_PROMOTION_PENDING_CANDIDATE_FUNCTION_DRIFT/);
});
test('finality still authorizes DB paid settlement; cannot turn send into paid',()=>{
 assert.match(executor,/verifyFinalizedXPromotionTransactionOnChain\(/);
 assert.match(executor,/finalize_reward_x_promotion_payout_v1/);
 assert.ok(executor.indexOf('verifyFinalizedXPromotionTransactionOnChain({')<executor.indexOf("'finalize_reward_x_promotion_payout_v1'"));
 assert.match(verification,/verifyFinalizedRewardTransactionOnChain\(/);
 assert.match(executor,/'WAITING_FINALITY'/);
});
test('paid notification created only after an immutable verified receipt exists',()=>{
 const helper=route.slice(route.indexOf('async function reconcileFinalXPromotionPaidNotice('),route.indexOf('async function runPayoutJob():'));
 assert.ok(helper.length>500);
 assert.match(helper,/result\.status !== 'PAID'/);
 assert.match(helper,/reward_x_promotion_receipts/);
 assert.match(helper,/\.eq\('intent_id', result\.intentId\)/);
 assert.match(helper,/reconcile_verified_x_promotion_paid_history/);
 assert.doesNotMatch(helper,/sendTransaction|signed_submission|finalize_reward_x_promotion_payout_v1/);
 const payout=route.slice(route.indexOf('async function runPayoutJob():'),route.indexOf('export async function GET('));
 assert.match(payout,/if \(result\.status === 'PAID'\)/);
 assert.match(payout,/catch \(noticeError\)/);
 assert.match(payout,/await markCronJobSucceeded\(\s*PAYOUT_JOB_NAME/);
 assert.doesNotMatch(payout,/catch \(noticeError\)[\s\S]*?throw noticeError/);
});
test('monthly $5 budget reserves both X provider requests, and stops on cap',()=>{
 assert.match(xapi,/if \(!await reserveXApiReadBudget\('POST_LOOKUP'\)\)/);
 assert.match(xapi,/if \(response\.status === 400\) \{[\s\S]*?reserveXApiReadBudget\('POST_LOOKUP'\)/);
 assert.match(xapi,/return \{ status: 'RETRY', reason: 'X_API_BUDGET_EXHAUSTED' \}/);
});
