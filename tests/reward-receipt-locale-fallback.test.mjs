import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const receiptView = await readFile(
  new URL('../src/components/RewardReceiptView.tsx', import.meta.url),
  'utf8',
);
const historyCenter = await readFile(
  new URL(
    '../src/components/UnifiedInviteNotificationHistoryCenter.tsx',
    import.meta.url,
  ),
  'utf8',
);

test('reward receipt surfaces fall back safely when a locale-specific pack is missing', () => {
  assert.match(
    receiptView,
    /REWARD_RECEIPT_COPY\[locale\] \?\? REWARD_RECEIPT_COPY\.en/,
  );
  assert.match(
    historyCenter,
    /REWARD_RECEIPT_COPY\[locale\] \?\? REWARD_RECEIPT_COPY\.en/,
  );
});

test('missing locale copy cannot block reward receipt rendering', () => {
  assert.doesNotMatch(
    receiptView,
    /const copy = REWARD_RECEIPT_COPY\[locale\];/,
  );
  assert.doesNotMatch(
    historyCenter,
    /const receiptCopy = REWARD_RECEIPT_COPY\[locale\];/,
  );
});
