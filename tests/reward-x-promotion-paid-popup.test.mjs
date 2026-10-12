import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hook = await readFile(
  new URL('../src/hooks/useRewardPaidTransientFeedback.ts', import.meta.url),
  'utf8',
);

test('paid popup resolves X promotion state before choosing a share link', () => {
  assert.match(
    hook,
    /\/api\/rewards\/x-promotion\?inviteCode=/,
  );
  assert.match(
    hook,
    /parseRewardXPromotionSnapshot/,
  );
  assert.match(
    hook,
    /promotion\.state === 'OPEN'/,
  );
  assert.match(
    hook,
    /buildRewardXPromotionShareUrl/,
  );
});

test('uncertain or non-open promotion state fails closed for sharing only', () => {
  assert.match(
    hook,
    /Uncertain promotion state fails closed for sharing only/,
  );
  assert.match(
    hook,
    /PROMOTION_STATE_TIMEOUT_MS = 1_500/,
  );
  assert.match(
    hook,
    /body\.promotion === null[\s\S]*rewardReceiptXIntentUrl/,
  );
  assert.doesNotMatch(
    hook,
    /promotion\.state === 'PREPARING'[\s\S]{0,500}rewardReceiptXIntentUrl/,
  );
});

test('sharing no longer acknowledges the reward receipt', () => {
  const shareBlock =
    /onShare: \(\) => \{([\s\S]*?)\n\s*\},/u.exec(hook);
  assert.ok(shareBlock);
  assert.match(shareBlock[1], /window\.open/);
  assert.doesNotMatch(
    shareBlock[1],
    /acknowledgeReward/,
  );
});

test('explicit confirmation remains the receipt acknowledgement boundary', () => {
  assert.match(
    hook,
    /onConfirm:[\s\S]*acknowledgeReward\(payload\)/,
  );
});
