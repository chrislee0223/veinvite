import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helper = await readFile(
  new URL('../src/lib/rewards/rewardRecoveryMaintenance.ts', import.meta.url),
  'utf8',
);
const cron = await readFile(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);

test('reward maintenance runs shadow projection after reservation recovery', () => {
  const rewardIndex = helper.indexOf('await runRewardReservationRecovery()');
  const shadowIndex = helper.indexOf('await runRewardXPromotionShadowSync(250)');
  const auditIndex = helper.indexOf('await runRewardXPromotionShadowAudit()');

  assert.ok(rewardIndex >= 0);
  assert.ok(shadowIndex > rewardIndex);
  assert.ok(auditIndex > shadowIndex);
});

test('shadow failures are log-only and never poison reward recovery', () => {
  assert.match(
    helper,
    /X promotion shadow audit reported invariant violations/,
  );
  assert.match(
    helper,
    /X promotion shadow sync\/audit failed/,
  );
  assert.match(
    helper,
    /Shadow accounting is non-authoritative/,
  );
  assert.doesNotMatch(helper, /rewardRecovery\.failure\s*=/);
  assert.doesNotMatch(helper, /rewardRecovery\.errors\.push/);
});

test('vote cron consumes combined maintenance without direct shadow logic', () => {
  assert.match(cron, /await runRewardRecoveryMaintenance\(\)/);
  assert.doesNotMatch(cron, /runRewardXPromotionShadowSync/);
  assert.doesNotMatch(cron, /runRewardXPromotionShadowAudit/);
});
