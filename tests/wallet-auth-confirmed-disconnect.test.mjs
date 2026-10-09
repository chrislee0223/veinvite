import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  cancelActiveWalletAuthentication,
  clearActiveWalletAuthentication,
  createWalletAuthenticationGeneration,
  getActiveWalletAuthentication,
  isWalletAuthenticationGenerationCurrent,
  releaseCancelledWalletAuthenticationAfterDisconnect,
  setActiveWalletAuthentication,
} from '../src/lib/walletAuthenticationCoordinator.ts';

test('pending signer remains protected until explicit confirmed disconnect', () => {
  let resolveOld;
  let cancellations = 0;
  const oldPromise = new Promise((resolve) => { resolveOld = resolve; });
  const oldGeneration = createWalletAuthenticationGeneration();
  setActiveWalletAuthentication({
    walletAddress: '0x1111111111111111111111111111111111111111',
    promise: oldPromise,
    cancel: () => { cancellations += 1; },
    generation: oldGeneration,
  });

  assert.equal(releaseCancelledWalletAuthenticationAfterDisconnect(), false);
  assert.equal(getActiveWalletAuthentication()?.promise, oldPromise);
  cancelActiveWalletAuthentication();
  assert.equal(cancellations, 1);
  assert.equal(isWalletAuthenticationGenerationCurrent(oldGeneration), false);

  // The caller can release this stale slot ONLY after it has verified
  // provider disconnect; late signatures remain invalidated by generation.
  assert.equal(releaseCancelledWalletAuthenticationAfterDisconnect(), true);
  assert.equal(getActiveWalletAuthentication(), null);
  assert.equal(releaseCancelledWalletAuthenticationAfterDisconnect(), false);

  const newGeneration = createWalletAuthenticationGeneration();
  const newPromise = Promise.resolve();
  setActiveWalletAuthentication({
    walletAddress: '0x1111111111111111111111111111111111111111',
    promise: newPromise,
    cancel: () => {},
    generation: newGeneration,
  });
  resolveOld();
  clearActiveWalletAuthentication(oldPromise);
  assert.equal(getActiveWalletAuthentication()?.promise, newPromise);
  assert.equal(isWalletAuthenticationGenerationCurrent(oldGeneration), false);
  clearActiveWalletAuthentication(newPromise);
  assert.equal(getActiveWalletAuthentication(), null);
});

test('stalled verification shows a recoverable status but never aborts or restarts signing', async () => {
  const [gate, control, coordinator] = await Promise.all([
    readFile(new URL('../src/components/WalletSessionGate.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/WalletControl.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/walletAuthenticationCoordinator.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(gate, /WALLET_AUTH_SLOW_NOTICE_MS = 45_000/);
  assert.match(gate, /code: checkingParticipation[\s\S]*'AUTH_VERIFICATION_SLOW'/);
  assert.match(gate, /window\.clearTimeout\(slowNotice\)/);
  assert.match(gate, /releaseCancelledWalletAuthenticationAfterDisconnect\(\);/);
  assert.match(control, /if \(!released\)[\s\S]*releaseCancelledWalletAuthenticationAfterDisconnect\(\)/);
  assert.match(coordinator, /isWalletAuthenticationGenerationCurrent\(active\.generation\)/);
  assert.doesNotMatch(gate, /slowNotice[\s\S]{0,600}cancelActiveWalletAuthentication/);
});
