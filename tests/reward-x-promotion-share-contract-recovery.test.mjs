import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const [sql,life,cron,share,card] = await Promise.all([
 read('supabase/migrations/20261111233000_fix_x_promotion_share_url_and_retry_monitor.sql'),
 read('src/lib/rewards/rewardXPromotionLifecycle.ts'),
 read('src/app/api/cron/x-promotion-maintenance/route.ts'),
 read('src/lib/rewards/rewardReceiptShare.ts'),
 read('src/lib/socialShareCard.ts'),
]);
test('canonical versioned X URLs and historical xp-only URL are both recognized', () => {
 assert.match(sql, /\(v=\[A-Za-z0-9_-\]\{1,32\}&\)\?xp=/);
 assert.match(sql, /v_token:=lower\(v_match\[3\]\)/);
 assert.match(share, /url\.searchParams\.set\('xp', token\)/);
 assert.match(card, /SOCIAL_SHARE_CARD_VERSION/);
});
test('token, owned referral key, ACTIVE/REVOKED restrictions remain enforced', () => {
 assert.match(sql,/v_token<>lower\(p_share_token::text\)/);
 assert.match(sql,/r\.referral_key=v_referral_key/);
 assert.match(sql,/lower\(r\.inviter_wallet\)=v_wallet/);
 assert.match(sql,/r\.status<>'REVOKED'/);
 assert.match(sql,/p_require_active OR r\.status='ACTIVE'/);
 assert.doesNotMatch(sql,/update public\.reward_x_promotion_obligations/i);
 assert.doesNotMatch(sql,/insert into public\.reward_x_promotion_receipts/i);
});
test('preflight stops billable Post lookups without changing financial authority', () => {
 assert.match(sql,/SECURITY INVOKER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.read_reward_x_promotion_share_contract_ready_v1[\s\S]*PUBLIC,anon,authenticated/);
 assert.match(life,/await ensureXShareContract\(candidate\.inviteCode, false\);[\s\S]*const lookup =/);
 assert.match(life,/await ensureXShareContract\(candidate\.inviteCode, true\);[\s\S]*const lookup =/);
 assert.match(life,/X_PROMOTION_SHARE_URL_CONTRACT_NOT_READY/);
});
test('stuck held Post surfaces as an existing cron failure rather than silent success', () => {
 assert.match(sql,/s\.submission_state='PENDING'/);
 assert.match(sql,/o\.financial_state='HELD'/);
 assert.match(sql,/HAVING count\(a\.id\)>=3/);
 assert.match(cron,/read_reward_x_promotion_stuck_submissions_v1/);
 assert.match(cron,/X_PROMOTION_STUCK_INITIAL_VERIFICATION/);
 assert.ok(cron.indexOf('read_reward_x_promotion_stuck_submissions_v1') <
   cron.indexOf("await markCronJobSucceeded(\n      LIFECYCLE_JOB_NAME,"));
});