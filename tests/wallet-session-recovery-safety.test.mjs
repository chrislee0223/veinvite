import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { settleOptionalSecurityObservation } from '../src/lib/securityClientBestEffort.ts';
import {
  clearActiveWalletAuthentication,
  createWalletAuthenticationGeneration,
  getActiveWalletAuthentication,
  runWalletProviderReconciliation,
  setActiveWalletAuthentication,
  waitForWalletProviderReconciliation,
} from '../src/lib/walletAuthenticationCoordinator.ts';

test('successful supplemental browser observation remains non-authoritative', async () => {
  let invoked = 0;
  assert.equal(await settleOptionalSecurityObservation(async () => {
    invoked += 1;
  }, 100), 'ok');
  assert.equal(invoked, 1);
});

test('a rejected supplemental observation cannot fail session validation', async () => {
  assert.equal(await settleOptionalSecurityObservation(async () => {
    throw new Error('simulated Supabase outage');
  }, 100), 'failed');
});

test('a permanently pending security observation cannot strand the verified session', async () => {
  const start = Date.now();
  const result = await settleOptionalSecurityObservation(
    () => new Promise(() => {}),
    20,
  );
  assert.equal(result, 'timed_out');
  assert.ok(Date.now() - start < 500);
});

test('late failure from a timed-out optional observation has a rejection handler', async () => {
  let rejectLate;
  const operation = () => new Promise((_, reject) => { rejectLate = reject; });
  assert.equal(await settleOptionalSecurityObservation(operation, 10), 'timed_out');
  rejectLate(new Error('late failure'));
  await Promise.resolve();
});

test('authenticated session read and session renewal both isolate optional observation', async () => {
  const route = await readFile('src/app/api/auth/session/route.ts', 'utf8');
  const times = route.match(/settleOptionalSecurityObservation\(/g) ?? [];
  assert.equal(times.length, 2);
  assert.match(route, /await settleOptionalSecurityObservation\([\s\S]*ensureSecurityClientForWallet/);
  assert.match(route, /Optional security client observation incomplete/);
  assert.doesNotMatch(route, /console\.warn\('Optional security client observation incomplete\.', \{[\s\S]{0,120}walletAddress/);
  assert.match(route, /getWalletSession\(request\)/);
  assert.match(route, /setSessionCookie\(/);
});

test('slow VeWorld prompt is shown as still pending with disconnect but without Retry', async () => {
  const gate = await readFile('src/components/WalletSessionGate.tsx', 'utf8');
  assert.match(gate, /WALLET_AUTH_SLOW_NOTICE_MS = 45_000/);
  assert.match(gate, /setState\('slow'\)/);
  assert.match(gate, /const isSlow = state === 'slow'/);
  assert.match(gate, /: isSlow\s*\? t\.slowVerificationDescription/);
  assert.match(gate, /\{hasError \? \([\s\S]*onClick=\{onRetry\}/);
  assert.match(gate, /isSlow=\{isSlow\}/);
  assert.match(gate, /const slowNotice = window\.setTimeout\([\s\S]*setState\('slow'\)/);
  assert.doesNotMatch(gate, /const slowNotice = window\.setTimeout\([\s\S]{0,450}setState\('error'\)/);
});

test('provider reconciliation holds its lock until original transport settles', async () => {
  let releaseProvider;
  let entered = 0;
  const slowRun = runWalletProviderReconciliation(() => new Promise((resolve) => {
    entered += 1;
    releaseProvider = resolve;
  }));
  let nextDone = false;
  const nextRun = runWalletProviderReconciliation(async () => {
    entered += 1;
    nextDone = true;
  });
  await Promise.resolve();
  assert.equal(entered, 1, 'no overlapping SDK provider calls');
  const pendingSign = waitForWalletProviderReconciliation();
  releaseProvider();
  await Promise.all([slowRun, nextRun, pendingSign]);
  assert.equal(entered, 2);
  assert.equal(nextDone, true);
});

test('pending global signing lock cannot be silently freed by UI delay', () => {
  const pending = new Promise(() => {});
  const generation = createWalletAuthenticationGeneration();
  setActiveWalletAuthentication({
    walletAddress: '0x1111111111111111111111111111111111111111',
    promise: pending,
    generation,
    cancel: () => {},
  });
  assert.equal(getActiveWalletAuthentication()?.promise, pending);
  clearActiveWalletAuthentication(Promise.resolve());
  assert.equal(getActiveWalletAuthentication()?.promise, pending);
  clearActiveWalletAuthentication(pending);
  assert.equal(getActiveWalletAuthentication(), null);
});
