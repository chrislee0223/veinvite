import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20261014230000_add_x_promotion_reporting_totals_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

const helper = await readFile(
  new URL(
    '../src/lib/reporting/rewardXPromotionReporting.ts',
    import.meta.url,
  ),
  'utf8',
);

const veBetterRoute = await readFile(
  new URL(
    '../src/app/api/admin/reports/vebetter-round/route.ts',
    import.meta.url,
  ),
  'utf8',
);

const legacyRoute = await readFile(
  new URL(
    '../src/app/api/admin/reports/round/route.ts',
    import.meta.url,
  ),
  'utf8',
);

test('promotion reporting is attributed to the original funding allocation', () => {
  assert.match(
    migration,
    /r\.source_allocation_receipt_id=v_current\.id/,
  );
  assert.match(
    migration,
    /a\.id=r\.source_allocation_receipt_id/,
  );
  assert.match(
    migration,
    /a\.vebetter_round_id<=v_current\.vebetter_round_id/,
  );
});

test('reporting counts only finalized promotion receipts as distributed', () => {
  assert.match(
    migration,
    /from public\.reward_x_promotion_receipts r/,
  );
  assert.doesNotMatch(
    migration,
    /reward_x_promotion_obligations o[\s\S]*sum\(o\.promotion_amount_wei\)/,
  );
});

test('unresolved promotion obligations keep the VeBetter report non-final', () => {
  assert.match(
    migration,
    /o\.financial_state in \('RESERVED','HELD'\)/,
  );
  assert.match(
    helper,
    /report\.reportComplete &&[\s\S]*totals\.unresolvedCurrentCount === 0/,
  );
});

test('promotion reporting never changes referral counts', () => {
  const veStart = helper.indexOf(
    'export function addPaidXPromotionToVeBetterRoundReport',
  );
  const legacyStart = helper.indexOf(
    'export function addPaidXPromotionToRoundReport',
  );
  assert.ok(veStart >= 0);
  assert.ok(legacyStart > veStart);

  const veHelper = helper.slice(
    veStart,
    legacyStart,
  );
  const legacyHelper = helper.slice(
    legacyStart,
  );

  for (const source of [veHelper, legacyHelper]) {
    assert.doesNotMatch(
      source,
      /successfulReferralsPaid\s*:/,
    );
    assert.doesNotMatch(
      source,
      /rewardedInviters\s*:/,
    );
    assert.doesNotMatch(
      source,
      /newUserReferralsPaid\s*:/,
    );
    assert.doesNotMatch(
      source,
      /returningUserReferralsPaid\s*:/,
    );
  }
});

test('both admin report surfaces apply the same paid-promotion totals', () => {
  assert.match(
    veBetterRoute,
    /readRewardXPromotionReportingTotals/,
  );
  assert.match(
    veBetterRoute,
    /addPaidXPromotionToVeBetterRoundReport/,
  );
  assert.match(
    legacyRoute,
    /readRewardXPromotionReportingTotals/,
  );
  assert.match(
    legacyRoute,
    /addPaidXPromotionToRoundReport/,
  );
});

test('zero promotion activity is a no-op', () => {
  assert.match(
    helper,
    /currentPaid === 0n[\s\S]*priorPaid === 0n[\s\S]*cumulativePaid === 0n[\s\S]*unresolvedCurrentCount === 0[\s\S]*return report/,
  );
  assert.match(
    helper,
    /currentPaid === 0n[\s\S]*cumulativePaid === 0n[\s\S]*return report/,
  );
});

test('reporting RPC remains server-only', () => {
  assert.match(
    migration,
    /revoke all on function public\.read_reward_x_promotion_reporting_totals_v1\(text,text,bigint\)[\s\S]*from public,anon,authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_reward_x_promotion_reporting_totals_v1\(text,text,bigint\)[\s\S]*to service_role/,
  );
});
