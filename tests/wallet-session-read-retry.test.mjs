import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  fetchWalletSessionWithTransientRetry,
  isTransientWalletSessionStatus,
} from '../src/lib/walletSessionReadRetry.ts';

test('retry classification is limited to transient server errors', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(isTransientWalletSessionStatus(status), true);
  }
  for (const status of [200, 201, 301, 400, 401, 403, 404, 409, 429, 501]) {
    assert.equal(isTransientWalletSessionStatus(status), false);
  }
});

test('a transient 503 retries exactly once and returns the successful GET response', async () => {
  let attempts = 0;
  const result = await fetchWalletSessionWithTransientRetry({
    signal: new AbortController().signal,
    fetchSession: async () => {
      attempts++;
      return new Response(
        JSON.stringify({ authenticated: attempts === 2 }),
        { status: attempts === 1 ? 503 : 200 },
      );
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).authenticated, true);
});

test('a network TypeError retries once while a repeated outage remains a failure', async () => {
  let recoveredAttempts = 0;
  const recovered = await fetchWalletSessionWithTransientRetry({
    signal: new AbortController().signal,
    fetchSession: async () => {
      recoveredAttempts++;
      if (recoveredAttempts === 1) throw new TypeError('network failed');
      return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
    },
  });
  assert.equal(recoveredAttempts, 2);
  assert.equal((await recovered.json()).authenticated, false);

  let rejectedAttempts = 0;
  await assert.rejects(
    fetchWalletSessionWithTransientRetry({
      signal: new AbortController().signal,
      fetchSession: async () => {
        rejectedAttempts++;
        throw new TypeError('network failed');
      },
    }),
    TypeError,
  );
  assert.equal(rejectedAttempts, 2);
});

test('an unauthenticated 200, invalid cookie 401, or 429 is not retried', async () => {
  for (const status of [200, 401, 403, 429]) {
    let attempts = 0;
    const result = await fetchWalletSessionWithTransientRetry({
      signal: new AbortController().signal,
      fetchSession: async () => {
        attempts++;
        return new Response('ok', { status });
      },
    });
    assert.equal(result.status, status);
    assert.equal(attempts, 1);
  }
});

test('an abort during backoff stops without sending another GET', async () => {
  const controller = new AbortController();
  let attempts = 0;
  let notifyFirst;
  const firstAttempt = new Promise((resolve) => { notifyFirst = resolve; });
  const pending = fetchWalletSessionWithTransientRetry({
    signal: controller.signal,
    fetchSession: async () => {
      attempts++;
      notifyFirst();
      return new Response('unavailable', { status: 503 });
    },
  });
  await firstAttempt;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(attempts, 1);
});

test('session resiliency stays GET-only and distinguishes precheck versus cookie failures', async () => {
  const [hook, helper, sessionGate, provider, shield, documentSync] = await Promise.all([
    readFile('src/hooks/useWalletAuthentication.ts', 'utf8'),
    readFile('src/lib/walletSessionReadRetry.ts', 'utf8'),
    readFile('src/components/WalletSessionGate.tsx', 'utf8'),
    readFile('src/components/VeChainProvider.tsx', 'utf8'),
    readFile('src/components/LocaleHydrationShield.tsx', 'utf8'),
    readFile('src/components/LocaleDocumentSync.tsx', 'utf8'),
  ]);
  assert.match(hook, /const readCurrentSession = async \(\) => \{/);
  assert.match(hook, /await fetchWalletSessionWithTransientRetry\(\{/);
  assert.match(hook, /method: 'GET'/);
  assert.match(hook, /failureStage = 'AUTH_SESSION_PERSISTENCE';[\s\S]*await readCurrentSession\(\)/);
  assert.match(hook, /AUTH_SESSION_PRECHECK_FAILED/);
  assert.match(hook, /AUTH_SESSION_COOKIE_PERSISTENCE_FAILED/);
  assert.match(hook, /sessionFailurePhase === 'precheck'[\s\S]*VeInvite wallet session precheck failed/);
  assert.match(hook, /Sentry.captureMessage\(/);
  assert.match(hook, /phase: sessionFailurePhase/);
  for (const forbidden of ['/api/auth/verify', '/api/auth/challenge', 'requestCertificate(', 'signMessage(']) {
    assert.equal(helper.includes(forbidden), false, `session GET retry must not call ${forbidden}`);
  }
  assert.match(helper, /attempt < 2/);
  assert.match(helper, /signal\.addEventListener\('abort'/);
  assert.match(hook, /await requestCertificate\(/);
  assert.match(hook, /proofType =\s*'certificate'/);
  for (const code of [sessionGate, provider, shield, documentSync]) {
    assert.match(code, /window\.localStorage\.getItem\([\s\S]*LANGUAGE_STORAGE_KEY/);
    assert.match(code, /catch \{/);
    assert.match(code, /return resolveBrowserLocale\(/);
  }
});
