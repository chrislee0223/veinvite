import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  WALLET_VERIFY_FAILURE_CODES,
  walletVerifyFailureCodeForMessage,
} from '../src/lib/walletAuthFailureCodes.ts';

test('wallet verification denials have stable, non-secret and distinct support codes', () => {
  const entries = Object.entries(WALLET_VERIFY_FAILURE_CODES);
  assert.ok(entries.length >= 20);
  assert.equal(new Set(entries.map(([, code]) => code)).size, entries.length);

  for (const [message, code] of entries) {
    assert.match(code, /^AUTH_[A-Z0-9_]+$/);
    assert.equal(walletVerifyFailureCodeForMessage(message), code);
    assert.equal(/0x[a-fA-F0-9]{40}/.test(code), false);
  }

  assert.equal(
    walletVerifyFailureCodeForMessage('Invalid typed wallet signature.'),
    'AUTH_TYPED_SIGNATURE_INVALID',
  );
  assert.equal(
    walletVerifyFailureCodeForMessage('The typed signature does not match the connected wallet.'),
    'AUTH_TYPED_SIGNER_MISMATCH',
  );
  assert.equal(
    walletVerifyFailureCodeForMessage('Wallet verification request was already used.'),
    'AUTH_CHALLENGE_USED',
  );
  assert.equal(
    walletVerifyFailureCodeForMessage('The VeWorld certificate was signed for a different site.'),
    'AUTH_CERTIFICATE_DOMAIN_MISMATCH',
  );
  assert.equal(
    walletVerifyFailureCodeForMessage('unexpected'),
    'AUTH_UNKNOWN_VERIFICATION_FAILURE',
  );
});

test('proof rejection diagnostics expose reference and reason without wallet or proof material', async () => {
  const route = await readFile(
    new URL('../src/app/api/auth/verify/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(route, /walletVerifyFailureCodeForMessage\(message\)/);
  assert.match(route, /const referenceId = randomBytes\(8\)\.toString\('hex'\)/);
  assert.match(route, /console\.warn\('Wallet verification denied\.', \{\s*code,\s*status,\s*referenceId,/);
  assert.match(route, /\{ error: message, code, referenceId \}/);
  const logStart = route.indexOf("console.warn('Wallet verification denied.'");
  const logEnd = route.indexOf('});', logStart);
  assert.ok(logStart >= 0 && logEnd > logStart);
  assert.doesNotMatch(
    route.slice(logStart, logEnd),
    /walletAddress|nonce|signature|sessionToken|cookie/i,
  );
});

test('mobile auth sends server diagnostic codes to visible support UI without changing signature policy', async () => {
  const [hook, gate] = await Promise.all([
    readFile(new URL('../src/hooks/useWalletAuthentication.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/WalletSessionGate.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(hook, /class WalletAuthenticationFailure extends Error/);
  assert.match(hook, /\^AUTH_\[A-Z0-9_\]/);
  assert.match(hook, /verified\.referenceId/);
  assert.match(hook, /failureStage = 'AUTH_CHALLENGE_REQUEST'/);
  assert.match(hook, /failureStage = 'AUTH_WALLET_SIGNATURE'/);
  assert.match(hook, /failureStage = 'AUTH_SESSION_PERSISTENCE'/);
  assert.match(gate, /data-veinvite-wallet-auth-error-code=\{errorCode\}/);
  assert.match(gate, /AUTH_PARTICIPATION_CHECK/);
  assert.match(gate, /referenceId=\{errorDetails\?\.referenceId\}/);
  assert.match(gate, /await ensureWalletSession\(walletAddress\);\s*checkingParticipation = true;\s*const activeRestriction = await readWalletRestriction/);
  assert.doesNotMatch(hook, /await connectV2\(/);
  assert.match(hook, /await requestTypedData\(/);
  assert.match(hook, /proofType =\s*'typed_data'/);
});
