import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMultilevelRound,
  forecastDirectOnboardingWei,
  splitXShareWithinGross,
} from '../src/lib/rewards/multilevelRewardPolicy.ts';

const wallet = (n) => '0x' + n.toString(16).padStart(40, '0');
const event = (id, actor, ancestors, options = {}) => ({
  eventId: id,
  actorWallet: wallet(actor),
  proofId: 'chain-proof-' + id,
  uplines: ancestors.map(([who, active]) => ({
    wallet: who === null ? null : wallet(who),
    active,
  })),
  ...options,
});
const run = ({
  pool = '1000', onboarding = [], active = [], carry,
} = {}) => calculateMultilevelRound({
  roundId: 130,
  participantPoolWei: pool,
  previousCategoryCarryWei: carry,
  onboardingEvents: onboarding,
  activeEvents: active,
});
const by = (out, category, level) => out.entitlements.filter(
  (entry) => entry.category === category && entry.level === level,
);
const assertBalanced = (out) => {
  const payout = out.entitlements.reduce((sum, e) => {
    assert.equal(BigInt(e.baseClaimWei) + BigInt(e.xShareHeldWei), BigInt(e.grossWei));
    return sum + BigInt(e.grossWei);
  }, 0n);
  const carry = Object.values(out.categoryCarryNextWei).reduce(
    (sum, x) => sum + BigInt(x), 0n,
  );
  assert.equal(
    payout + carry + BigInt(out.generalReturnNextWei), BigInt(out.totalBudgetWei),
  );
  assert.equal(payout.toString(), out.grossEntitlementsWei);
  const returns = out.generalReturnDetails;
  assert.equal(returns.reduce((sum,item)=>sum + BigInt(item.amountWei),0n).toString(),
    out.generalReturnNextWei);
  assert.equal(new Set(returns.map(item=>item.returnId)).size,returns.length);
};

test('1000 already-net participant pool splits 60:30:10 and five levels with no new 20% fee', () => {
  const uplines = [[2, true], [3, true], [4, true], [5, true], [6, true]];
  const out = run({
    onboarding: [event('new-1', 1, uplines)],
    active: [event('active-1', 7, uplines)],
  });
  assert.deepEqual(out.budgetByCategoryWei,
    { onboarding: '600', active: '300', leader: '100' });
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((level) => by(out, 'onboarding', level)[0].grossWei),
    ['420', '90', '48', '30', '12'],
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((level) => by(out, 'active', level)[0].grossWei),
    ['210', '45', '24', '15', '6'],
  );
  assert.equal(by(out, 'leader', 0)[0].grossWei, '100');
  assert.equal(out.generalReturnNextWei, '0');
  assertBalanced(out);
});

test('onboarding direct inviter is paid despite inactivity; inactive uplines never inherit missing shares', () => {
  const out = run({
    onboarding: [event('new-1', 1, [
      [2, false], [3, false], [4, true], [null, false], [5, false],
    ])],
  });
  assert.equal(by(out, 'onboarding', 1)[0].grossWei, '420');
  assert.equal(by(out, 'onboarding', 2).length, 0);
  assert.equal(by(out, 'onboarding', 3)[0].grossWei, '48');
  assert.equal(by(out, 'onboarding', 5).length, 0);
  assert.equal(out.categoryCarryNextWei.active, '150');
  // Empty active category: 150 same-category carry, 150 general.
  // New onboarding missing ancestors: 132 general.
  assert.equal(out.generalReturnNextWei, '282');
  assertBalanced(out);
});

test('active network requires each upstream inviter to be active in same round', () => {
  const out = run({
    onboarding: [event('new-1', 1, [[2, false]])],
    active: [event('active-1', 7, [[2, false], [3, true]])],
  });
  assert.equal(by(out, 'active', 1).length, 0);
  assert.equal(by(out, 'active', 2)[0].grossWei, '45');
  // We never reassign unclaimed first-level 210 to second-level.
  assert.equal(out.generalReturnNextWei, '435'); // new missing 180 + active missing 255
  assertBalanced(out);
});

test('no category participants => half retained in same category, half general', () => {
  const out = run();
  assert.deepEqual(out.categoryCarryNextWei, {
    onboarding: '300', active: '150', leader: '50',
  });
  assert.equal(out.generalReturnNextWei, '500');
  assert.equal(out.entitlements.length, 0);
  assertBalanced(out);
});

test('active users exist but every inviter is inactive => full active amount returns, not 50:50', () => {
  const out = run({
    onboarding: [event('new-1', 1, [[2, true]])],
    active: [event('active-1', 7, [[8, false]])],
  });
  assert.equal(by(out, 'active', 1).length, 0);
  assert.equal(out.categoryCarryNextWei.active, '0');
  assert.equal(out.generalReturnNextWei, '480');
  assertBalanced(out);
});

test('leader is based only on direct first-ever onboarding count, ties are equal', () => {
  const out = run({ onboarding: [
    event('new-1', 1, [[2, false], [3, true]]),
    event('new-2', 4, [[8, true]]),
  ] });
  const leaders = by(out, 'leader', 0);
  assert.equal(leaders.length, 2);
  assert.deepEqual(leaders.map(e => e.grossWei), ['50', '50']);
  assert.deepEqual(leaders.map(e => e.recipientWallet).sort(), [wallet(2), wallet(8)].sort());
  assertBalanced(out);
});

test('same direct inviter wins leader alone with multiple completed onboardings', () => {
  const out = run({ onboarding: [
    event('new-1', 1, [[2, false]]),
    event('new-2', 3, [[2, false]]),
    event('new-3', 4, [[8, false]]),
  ] });
  assert.deepEqual(by(out, 'leader', 0).map(x=>x.recipientWallet), [wallet(2)]);
  assertBalanced(out);
});

test('90 + 10 X promotion stays inside entitlement, is not additive', () => {
  assert.deepEqual(splitXShareWithinGross('101'), {
    baseClaimWei: '91', xShareHeldWei: '10',
  });
  assert.deepEqual(splitXShareWithinGross('9'), {
    baseClaimWei: '9', xShareHeldWei: '0',
  });
});

test('each event and each upline has a distinct stable entitlement ID', () => {
  const out = run({ onboarding: [
    event('new-1', 1, [[2, true], [3, true]]),
    event('new-2', 4, [[2, true], [3, true]]),
  ]});
  const allIds = out.entitlements.map(x => x.entitlementId);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.notEqual(by(out, 'onboarding', 1)[0].entitlementId,
    by(out, 'onboarding', 1)[1].entitlementId);
  assertBalanced(out);
});

test('onboarding in this round can never be counted again as active in same round', () => {
  assert.throws(() => run({
    onboarding: [event('new-1', 1, [[2, true]])],
    active: [event('active-1', 1, [[2, true]])],
  }), /DUPLICATE_ACTOR_IN_ROUND/);
});

test('active user counted once per round even with separate proofs', () => {
  assert.throws(() => run({
    active: [
      event('activity-1', 1, [[2, true]]),
      event('activity-2', 1, [[2, true]]),
    ],
  }), /DUPLICATE_ACTOR_IN_ROUND/);
});

test('duplicate proof event ids or circular/repeated ancestors fail closed', () => {
  assert.throws(() => run({
    onboarding: [event('duplicate', 1, [[2, true]])],
    active: [event('duplicate', 9, [[2, true]])],
  }), /DUPLICATE_EVENT_ID/);
  assert.throws(() => run({
    active: [event('cycle', 1, [[1, true]])],
  }), /CYCLIC_OR_DUPLICATE_UPLINE/);
  assert.throws(() => run({
    active: [event('double-ancestor', 1, [[2, true], [2, true]])],
  }), /CYCLIC_OR_DUPLICATE_UPLINE/);
});

test('onboarding cannot have no direct inviter; input proof and Wei must be exact', () => {
  assert.throws(() => run({ onboarding: [event('missing', 1, [])] }),
    /ONBOARDING_REQUIRES_DIRECT_INVITER/);
  assert.throws(() => run({ pool: '-1' }), /INVALID_EXACT_WEI/);
  assert.throws(() => run({ pool: '1.5' }), /INVALID_EXACT_WEI/);
  assert.throws(() => run({ pool: '01' }), /INVALID_EXACT_WEI/);
  assert.throws(() => run({
    active: [event('no-proof', 1, [[2, true]], { proofId: '' })],
  }), /INVALID_EVENT_PROOF/);
});

test('exact Wei arithmetic, previous same-category carryover, dust and audit balance', () => {
  const out = run({
    pool: '1000000000000000000000001',
    carry: { onboarding: '55', active: '11', leader: '7' },
    onboarding: [event('new-1', 1, [[2, true]])],
    active: [event('active-1', 3, [[4, true]])],
  });
  assert.equal(out.reconciled, true);
  assertBalanced(out);
});

test('direct home estimate is 70% of 600 / 3, with no fictitious extra promo', () => {
  assert.equal(forecastDirectOnboardingWei('600', 3), '140');
  assert.throws(() => forecastDirectOnboardingWei('600', 0), /INVALID_FORECAST_COUNT/);
});

test('every missing or inactive level is separately returned without double-counting', () => {
  const out = run({
    onboarding: [event('new-1',1,[[2,false],[3,false],[null,false],[5,true]])],
    active: [event('active-1',7,[[8,false],[null,false],[10,true]])],
  });
  const missing = out.generalReturnDetails.filter(x=>x.reason==='MISSING_UPLINE');
  const inactive = out.generalReturnDetails.filter(x=>x.reason==='INACTIVE_UPLINE');
  assert.ok(missing.length > 0);
  assert.ok(inactive.length > 0);
  assert.ok(out.generalReturnDetails.every(x=>BigInt(x.amountWei)>0n));
  assertBalanced(out);
});

test('tiny and odd budgets conserve every Wei, including zero-valued category balances', () => {
  for (const pool of ['0','1','2','3','9','11','19','37','101','999']) {
    const out = run({
      pool,
      onboarding: [event('new-1',1,[[2,true]])],
      active: [event('active-1',3,[[4,true]])],
    });
    assertBalanced(out);
  }
});
