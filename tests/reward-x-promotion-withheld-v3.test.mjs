import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  validateDisplayXPromotionSplit,
  X_PROMOTION_ADDITIVE_POLICY,
  X_PROMOTION_WITHHELD_POLICY,
} from '../src/lib/rewards/rewardXPromotionPolicy.ts';

const migration = await readFile(
  new URL('../docs/staged-sql/20261123191000_prepare_x_promotion_withheld_ten_percent_v3.sql',import.meta.url),
  'utf8',
);
const B3TR = 10n ** 18n;

const validate = (policyVersion, gross, base, x) =>
  validateDisplayXPromotionSplit({
    policyVersion,
    grossWei: gross.toString(),
    baseWei: base.toString(),
    promotionWei: x.toString(),
  });

test('legacy bonus remains additive, and only the original 10 B3TR is valid', () => {
  assert.equal(validate(X_PROMOTION_ADDITIVE_POLICY,1000n*B3TR,1000n*B3TR,10n*B3TR),'ADDITIVE');
  assert.equal(validate(X_PROMOTION_ADDITIVE_POLICY,1000n*B3TR,900n*B3TR,100n*B3TR),null);
});

test('v3 withholds exactly 10 percent with no extra or fixed cap', () => {
  for(const b3tr of [100n,500n,1000n,1255n,2500n,7000n]){
    const gross=b3tr*B3TR,x=gross/10n,base=gross-x;
    assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,gross,base,x),'WITHHELD');
    assert.equal(base+x,gross);
    assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,gross,gross,10n*B3TR),null);
    assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,gross,base+1n,x),null);
  }
});

test('v3 handles non-round B3TR and tiny Wei amounts precisely', () => {
  const gross=125573n*10n**16n; // 1255.73 B3TR
  const x=gross/10n,base=gross-x;
  assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,gross,base,x),'WITHHELD');
  assert.equal(base,1130157n*10n**15n); // 1130.157 B3TR
  assert.equal(x,125573n*10n**15n); // 125.573 B3TR
  assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,11n,10n,1n),'WITHHELD');
  assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,1n,1n,0n),'WITHHELD');
  assert.equal(validate(X_PROMOTION_WITHHELD_POLICY,0n,0n,0n),null);
});

test('v3 explicitly rejects unknown policies and malformed Wei', () => {
  assert.equal(validate('x-promotion-unexpected',1000n*B3TR,900n*B3TR,100n*B3TR),null);
  assert.equal(validateDisplayXPromotionSplit({
    policyVersion:X_PROMOTION_WITHHELD_POLICY,
    grossWei:'1.0',baseWei:'1',promotionWei:'0',
  }),null);
});

test('database computes withheld v3 exact integer floor and preserves legacy calculator', () => {
  assert.match(migration,/calculate_reward_x_promotion_withheld_v3/);
  assert.match(migration,/v_x:=div\(v_gross,10::numeric\)/);
  assert.match(migration,/v_gross-v_x,v_x,1000,v_gross/);
  assert.match(migration,/calculate_reward_x_promotion_additive_v2/);
  assert.match(migration,/reward_x_promotion_policy_for_invitation_v3/);
  assert.match(migration,/v_created_at>=v_cutover/);
});

test('new-v3 split failure must fail closed, never fall back to a full-gross payout', () => {
  assert.match(migration,/REWARD_X_V3_LIVE_SPLIT_MISSING/);
  assert.match(migration,/REWARD_X_V3_PAUSED_NO_UNSPLIT_FALLBACK/);
  assert.match(migration,/exception when others then\s*if v_policy='x-promotion-withheld-10pct-v3' then raise;/);
  assert.match(migration,/read_reward_batch_transfer_amount_wei_v1/);
});

test('pool liability must count v3 X only once, and release remains separate', () => {
  assert.match(migration,/read_reward_cohort_committed_wei/);
  assert.match(migration,/and s\.policy_version='x-promotion-additive-v2'/);
  assert.match(migration,/read_reward_x_promotion_post_base_liability_wei/);
  assert.match(migration,/paid\.status='PAID'/);
  assert.match(migration,/reward_x_promotion_splits_withheld_v3_conservation_check/);
});

test('staged SQL must not itself activate v3 or mutate existing reward receipts', () => {
  assert.doesNotMatch(migration,/update\s+public\.reward_runtime_config\s+set\s+reward_x_promotion_policy_version/i);
  assert.doesNotMatch(migration,/delete\s+from\s+public\.reward_/i);
  assert.doesNotMatch(migration,/update\s+public\.reward_receipts/i);
});
