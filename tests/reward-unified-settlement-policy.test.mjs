import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B3TR_WEI,
  X_PROMOTION_FIXED_WEI,
  calculateUnifiedRewardSettlement,
} from '../src/lib/rewards/unifiedSettlementPolicy.ts';

const b3tr = (n) => (BigInt(n) * B3TR_WEI).toString();
const eligible = (inviteCode) => ({
  inviteCode,
  completionFinalizedBeforeCutoff: true,
  sybilClearAtSettlement: true,
  walletRestrictionsClear: true,
  alreadyRewardedOrReserved: false,
});
const codes = ['ABCDEFG', 'BCDEFGH', 'CDEFGHJ'];

test('no valid recipients: preserve all uncommitted tokens for next round', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(8000),
    outstandingLiabilityWei: b3tr(100),
    candidates: [],
  });
  assert.equal(result.settledTotalWei, '0');
  assert.equal(result.carryForwardWei, b3tr(7900));
  assert.equal(result.recipientCount, 0);
});

test('one completed user receives entire spendable pool with fixed 10 already included', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(8000),
    outstandingLiabilityWei: '0',
    candidates: [eligible(codes[0])],
  });
  assert.equal(result.splits[0].totalRewardWei, b3tr(8000));
  assert.equal(result.splits[0].baseRewardWei, b3tr(7990));
  assert.equal(result.splits[0].xPromotionHoldWei, b3tr(10));
  assert.equal(result.carryForwardWei, '0');
});

test('two completed users split available funds equally, including X escrow', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(300),
    outstandingLiabilityWei: '0',
    candidates: [eligible(codes[1]), eligible(codes[0])],
  });
  assert.deepEqual(result.splits.map(x=>x.inviteCode), [codes[0],codes[1]]);
  assert.deepEqual(result.splits.map(x=>x.baseRewardWei), [b3tr(140),b3tr(140)]);
  assert.equal(result.xPromotionHoldTotalWei, b3tr(20));
});

test('old fixed base/X liabilities are deducted once and never overwritten', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(8031),
    outstandingLiabilityWei: b3tr(100),
    candidates: [eligible(codes[0])],
  });
  assert.equal(result.splits[0].totalRewardWei, b3tr(7931));
  assert.equal(result.splits[0].baseRewardWei, b3tr(7921));
});

test('exactly 10 B3TR is fully paid as base; never offer a zero-base promotion', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(10),
    outstandingLiabilityWei: '0',
    candidates: [eligible(codes[0])],
  });
  assert.equal(result.splits[0].baseRewardWei, b3tr(10));
  assert.equal(result.splits[0].xPromotionHoldWei, '0');
});

test('1000 users cannot turn 8000 B3TR into a 10000 B3TR X liability', () => {
  const candidates = Array.from({length:1000},(_,i) => eligible(
    'A' + i.toString(32).toUpperCase().padStart(6,'A').replace(/[01IO]/g,'Z')
  ));
  // Uniform seven-character codes that meet the invitation alphabet:
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const unique = Array.from({length:1000},(_,i) => {
    let k = i, suffix='';
    for(let j=0;j<6;j++){ suffix = alphabet[k%alphabet.length]+suffix; k=Math.floor(k/alphabet.length); }
    return eligible('A'+suffix);
  });
  void candidates;
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(8000),
    outstandingLiabilityWei: '0',
    candidates: unique,
  });
  assert.equal(result.recipientCount, 1000);
  assert.equal(result.xPromotionHoldTotalWei, '0');
  assert.equal(result.baseTotalWei, b3tr(8000));
});

test('tiny remainder goes deterministically to lowest invite code, never disappears', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei: (b3tr(45) && (45n*B3TR_WEI + 1n).toString()),
    outstandingLiabilityWei: '0',
    candidates: [eligible(codes[1]), eligible(codes[0])],
  });
  assert.equal(BigInt(result.splits[0].totalRewardWei)-BigInt(result.splits[1].totalRewardWei),1n);
  assert.equal(result.settledTotalWei, (45n*B3TR_WEI+1n).toString());
});

test('outstanding liabilities greater than actual pool fail closed', () => {
  assert.throws(()=>calculateUnifiedRewardSettlement({
    poolBalanceWei: b3tr(10),outstandingLiabilityWei:b3tr(11),
    candidates:[eligible(codes[0])],
  }),/EXISTING_LIABILITIES_UNDERFUNDED/);
});

test('reject Sybil, unfinalized, restricted, and previously paid referrals', () => {
  for (const change of [
    {sybilClearAtSettlement:false},
    {completionFinalizedBeforeCutoff:false},
    {walletRestrictionsClear:false},
    {alreadyRewardedOrReserved:true},
  ]) {
    assert.throws(()=>calculateUnifiedRewardSettlement({
      poolBalanceWei:b3tr(150),outstandingLiabilityWei:'0',
      candidates:[{...eligible(codes[0]),...change}],
    }),/CANDIDATE_NOT_ELIGIBLE/);
  }
});

test('duplicate referrals, malformed values, empty capacity fail closed', () => {
  assert.throws(()=>calculateUnifiedRewardSettlement({
    poolBalanceWei:b3tr(20),outstandingLiabilityWei:'0',
    candidates:[eligible(codes[0]),eligible(codes[0])],
  }),/DUPLICATE_INVITE/);
  assert.throws(()=>calculateUnifiedRewardSettlement({
    poolBalanceWei:'20.5',outstandingLiabilityWei:'0',
    candidates:[],
  }),/integer/);
  assert.throws(()=>calculateUnifiedRewardSettlement({
    poolBalanceWei:'0',outstandingLiabilityWei:'0',
    candidates:[eligible(codes[0])],
  }),/ZERO_AVAILABLE/);
});

test('X exposure is always part of the fixed total, never an additive promise', () => {
  const result = calculateUnifiedRewardSettlement({
    poolBalanceWei:b3tr(450),outstandingLiabilityWei:'0',
    candidates:[eligible(codes[0]),eligible(codes[1]),eligible(codes[2])],
  });
  assert.equal(result.xPromotionHoldTotalWei,(3n*X_PROMOTION_FIXED_WEI).toString());
  for (const split of result.splits) {
    assert.equal(BigInt(split.baseRewardWei)+BigInt(split.xPromotionHoldWei),BigInt(split.totalRewardWei));
  }
  assert.equal(BigInt(result.baseTotalWei)+BigInt(result.xPromotionHoldTotalWei),BigInt(result.settledTotalWei));
});
