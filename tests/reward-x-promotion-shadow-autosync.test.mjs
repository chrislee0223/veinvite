import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/lib/rewards/rewardReservation.ts', import.meta.url),
  'utf8',
);

test('reward reservation runs X promotion shadow projection only as fail-soft observability', () => {
  assert.match(
    source,
    /runRewardXPromotionShadowSync\(250\)/,
  );
  assert.match(
    source,
    /runRewardXPromotionShadowAudit\(\)/,
  );
  assert.match(
    source,
    /catch \(error\)[\s\S]*Shadow projection is deliberately non-authoritative/,
  );
  assert.match(
    source,
    /X promotion shadow observability failed after reward reservation sweep/,
  );
});

test('shadow observability runs after the real reservation loop and before returning the sweep result', () => {
  const loopIndex = source.indexOf('for (const candidate of candidates)');
  const shadowIndex = source.indexOf('await runRewardXPromotionShadowObservability();');
  const returnIndex = source.lastIndexOf('return result;');

  assert.ok(loopIndex >= 0);
  assert.ok(shadowIndex > loopIndex);
  assert.ok(returnIndex > shadowIndex);
});

test('shadow observability never mutates payout or claim state directly', () => {
  const helperStart = source.indexOf(
    'async function runRewardXPromotionShadowObservability()',
  );
  const helperEnd = source.indexOf(
    'export async function reserveEligibleReferralRewards()',
  );
  const helper = source.slice(helperStart, helperEnd);

  assert.doesNotMatch(helper, /reward_payouts|request_reward_claim|reward_queue_entries/);
  assert.doesNotMatch(helper, /update\(|insert\(|delete\(/);
});
