import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helper = await readFile(
  new URL(
    '../src/lib/reporting/rewardXPromotionReporting.ts',
    import.meta.url,
  ),
  'utf8',
);

const route = await readFile(
  new URL(
    '../src/app/api/admin/reports/vebetter-round/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const report = await readFile(
  new URL(
    '../src/lib/reporting/veBetterRoundReport.ts',
    import.meta.url,
  ),
  'utf8',
);

test('VeBetter report reads finalized X promotion reporting totals', () => {
  assert.match(
    helper,
    /read_reward_x_promotion_reporting_totals_v1/,
  );
  assert.match(
    route,
    /readRewardXPromotionReportingTotals/,
  );
  assert.match(
    route,
    /addPaidXPromotionToVeBetterRoundReport/,
  );
});

test('paid promotion value is attributed without changing referral counts', () => {
  assert.match(
    helper,
    /BigInt\(report\.rewards\.distributedWei\)[\s\S]*currentPaid/,
  );
  assert.match(
    helper,
    /BigInt\(report\.cumulative\.distributedWei\)[\s\S]*cumulativePaid/,
  );

  const helperStart = helper.indexOf(
    'export function addPaidXPromotionToVeBetterRoundReport',
  );
  assert.ok(helperStart >= 0);
  const source = helper.slice(helperStart);

  for (const field of [
    'successfulReferralsPaid',
    'rewardedInviters',
    'newUserReferralsPaid',
    'returningUserReferralsPaid',
    'paidReferralRewards',
    'queuedCandidatesAwaitingReward',
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`${field}\\\\s*:`),
      `${field} must not be mutated by promotion reporting`,
    );
  }
});

test('prior paid promotion reduces only ledger-derived opening carryover', () => {
  assert.match(
    helper,
    /report\.funding\.ledgerOpeningCarryoverWei[\s\S]*totals\.priorPaidWei/,
  );
  assert.match(
    helper,
    /carryoverSource ===[\s\S]*'RECORDED_ALLOCATION_LEDGER'[\s\S]*ledgerOpeningCarryoverWei[\s\S]*report\.funding\.openingCarryoverWei/,
  );
});

test('closing carryover includes paid promotion from the source allocation', () => {
  assert.match(
    helper,
    /BigInt\(openingCarryoverWei\)[\s\S]*rewardPoolAllocationWei[\s\S]*distributedWei/,
  );
  assert.match(
    helper,
    /closingCarryoverWei/,
  );
});

test('unresolved promotion keeps report non-final without double-counting queued referrals', () => {
  assert.match(
    helper,
    /report\.reportComplete &&[\s\S]*totals\.unresolvedCurrentCount === 0/,
  );
  assert.doesNotMatch(
    helper,
    /queuedCandidatesAwaitingReward\s*:/,
  );
});

test('zero promotion activity remains a no-op', () => {
  assert.match(
    helper,
    /currentPaid === 0n[\s\S]*priorPaid === 0n[\s\S]*cumulativePaid === 0n[\s\S]*unresolvedCurrentCount === 0[\s\S]*return report/,
  );
});

test('pending copy does not claim zero queued referrals when only promotion is unresolved', () => {
  assert.match(
    report,
    /queuedCandidatesAwaitingReward > 0/,
  );
  assert.match(
    report,
    /Reward processing is not final yet\.'/,
  );
  assert.match(
    report,
    /아직 보상 처리가 최종 완료되지 않았습니다\.'/,
  );
});
