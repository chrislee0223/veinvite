import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveOptionalPrefillWithin } from '../src/lib/rewards/resolveOptionalPrefillWithin.ts';

test('returns a ready forecast before the first-render budget expires', async () => {
  const ready = { status: 'ready', estimatedRewardWei: '123' };
  const result = await resolveOptionalPrefillWithin(Promise.resolve(ready), null, 400);
  assert.equal(result, ready);
});

test('falls back without cancelling a slow optional forecast read', async () => {
  let finishRead = () => {};
  const slowRead = new Promise((resolve) => {
    finishRead = () => resolve({ status: 'ready', estimatedRewardWei: '456' });
  });
  const value = await resolveOptionalPrefillWithin(slowRead, null, 5);
  assert.equal(value, null);
  finishRead();
  assert.deepEqual(await slowRead, { status: 'ready', estimatedRewardWei: '456' });
});

test('a failed prefill propagates so its caller can choose a safe fallback', async () => {
  await assert.rejects(
    resolveOptionalPrefillWithin(Promise.reject(new Error('read failed')), null, 400),
    /read failed/,
  );
});

test('rejects invalid optional prefill budgets', async () => {
  await assert.rejects(
    resolveOptionalPrefillWithin(Promise.resolve('ok'), null, -1),
    RangeError,
  );
});
