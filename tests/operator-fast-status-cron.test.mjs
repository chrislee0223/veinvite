import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [cron, helper] = await Promise.all([
  read('src/app/api/cron/reconcile/route.ts'),
  read('src/lib/reporting/operatorFastStatus.ts'),
]);

test('daily cron surfaces fast-status drift without becoming reward authority', () => {
  assert.match(cron, /FAST_STATUS_RECONCILIATION/u);
  assert.match(cron, /reconcileOperatorFastStatus\(\)/u);
  assert.match(cron, /fastStatusReconciliation/u);
  assert.match(helper, /reconcile_operator_fast_status/u);
  assert.match(helper, /if \(!result\.matches\)/u);
  assert.doesNotMatch(helper, /reward_payout/u);
  assert.doesNotMatch(helper, /reward_queue/u);
});
