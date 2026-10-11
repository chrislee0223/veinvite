import assert from 'node:assert/strict';
import { test } from 'node:test';

import { walletChallengeTraceId } from '../src/lib/walletChallengeTrace.ts';

test('retries of one challenge share one anonymous support trace', () => {
  const challenge = { id: 101, nonce: 'ab'.repeat(32) };
  const first = walletChallengeTraceId(challenge);
  const second = walletChallengeTraceId(challenge);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{16}$/);
  assert.notEqual(first, challenge.nonce);
});

test('new challenges cannot accidentally share the prior support trace', () => {
  const nonce = 'ab'.repeat(32);
  assert.notEqual(
    walletChallengeTraceId({ id: 101, nonce }),
    walletChallengeTraceId({ id: 102, nonce }),
  );
  assert.notEqual(
    walletChallengeTraceId({ id: 101, nonce }),
    walletChallengeTraceId({ id: 101, nonce: 'cd'.repeat(32) }),
  );
});
