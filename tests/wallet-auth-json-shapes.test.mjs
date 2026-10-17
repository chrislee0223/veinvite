import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  isWalletChallengeRequestBody,
  isWalletVerifyRequestBody,
  isWalletSessionRenewalRequestBody,
} from '../src/lib/walletAuthRequestValidation.ts';

const WALLET = '0x' + 'ab'.repeat(20);
const NONCE = 'be'.repeat(32);
const SIGNATURE = '0x' + '12'.repeat(65);
const CERTIFICATE = {
  purpose: 'agreement',
  payload: { type: 'text', content: 'Exact challenge-bound VeInvite login text' },
  domain: 'veinvite.vercel.app',
  timestamp: 1792224000,
  signer: WALLET,
  signature: SIGNATURE,
};
const VERIFY = {
  walletAddress: WALLET,
  nonce: NONCE,
  signature: SIGNATURE,
  proofType: 'certificate',
  certificate: CERTIFICATE,
};

test('both authentication endpoints accept the existing valid wallet request shapes', () => {
  assert.equal(isWalletChallengeRequestBody({ walletAddress: WALLET }), true);
  assert.equal(isWalletVerifyRequestBody(VERIFY), true);
  assert.equal(isWalletVerifyRequestBody({ walletAddress: WALLET, nonce: NONCE, signature: SIGNATURE, proofType: 'message' }), true);
  assert.equal(isWalletVerifyRequestBody({ walletAddress: WALLET, nonce: NONCE, signature: SIGNATURE, proofType: 'typed_data' }), true);
  assert.equal(isWalletVerifyRequestBody({ walletAddress: WALLET, nonce: NONCE, certificate: CERTIFICATE, proofType: 'certificate' }), true);
  // These are valid JSON shapes; the pre-existing route returns its specific
  // required-field/unsupported-proof errors without throwing.
  assert.equal(isWalletChallengeRequestBody({}), true);
  assert.equal(isWalletVerifyRequestBody({}), true);
  assert.equal(isWalletVerifyRequestBody({ ...VERIFY, proofType: 'unsupported' }), true);
});

test('challenge route rejects null, arrays, primitives and wrong wallet types before address normalization', () => {
  for (const value of [
    null, undefined, '', '0x' + '11'.repeat(20),
    5, true, [], [{}],
    { walletAddress: 123 },
    { walletAddress: [WALLET] },
    { walletAddress: { address: WALLET } },
    { walletAddress: null },
  ]) {
    assert.equal(isWalletChallengeRequestBody(value), false, JSON.stringify(value));
  }
});

test('verify route rejects malformed top-level values and wallet/nonce/signature types', () => {
  for (const value of [
    null, undefined, false, 'invalid', 42, [],
    [VERIFY], { walletAddress: [WALLET] },
    { ...VERIFY, walletAddress: 3 },
    { ...VERIFY, walletAddress: null },
    { ...VERIFY, nonce: 100 },
    { ...VERIFY, nonce: ['nonce'] },
    { ...VERIFY, signature: 44 },
    { ...VERIFY, signature: [SIGNATURE] },
    { ...VERIFY, proofType: { type: 'certificate' } },
    { ...VERIFY, proofType: null },
  ]) {
    assert.equal(isWalletVerifyRequestBody(value), false, JSON.stringify(value));
  }
});

test('verify route deeply rejects malformed certificate fields before diagnostic .trim and .toLowerCase', () => {
  for (const badCertificate of [
    null, [], 'certificate', 99, true,
    { ...CERTIFICATE, purpose: [1] },
    { ...CERTIFICATE, payload: null },
    { ...CERTIFICATE, payload: [] },
    { ...CERTIFICATE, payload: { type: { invalid: true }, content: 'text' } },
    { ...CERTIFICATE, payload: { type: 'text', content: 3 } },
    { ...CERTIFICATE, domain: ['veinvite.vercel.app'] },
    { ...CERTIFICATE, timestamp: '1792224000' },
    { ...CERTIFICATE, timestamp: 1.5 },
    { ...CERTIFICATE, timestamp: Number.MAX_SAFE_INTEGER + 1 },
    { ...CERTIFICATE, signer: { address: WALLET } },
    { ...CERTIFICATE, signature: [SIGNATURE] },
  ]) {
    assert.equal(isWalletVerifyRequestBody({ ...VERIFY, certificate: badCertificate }), false, JSON.stringify(badCertificate));
  }
});


test('wallet session renewal accepts a valid address but rejects unsafe JSON shapes', () => {
  assert.equal(isWalletSessionRenewalRequestBody({ walletAddress: WALLET }), true);
  assert.equal(isWalletSessionRenewalRequestBody({ walletAddress: '' }), true); // Address regexp still rejects this.
  for (const value of [
    null, undefined, false, '', WALLET, 5, [], [WALLET],
    {}, { walletAddress: null }, { walletAddress: 15 },
    { walletAddress: [WALLET] }, { walletAddress: { address: WALLET } },
  ]) {
    assert.equal(isWalletSessionRenewalRequestBody(value), false, JSON.stringify(value));
  }
});

test('session renewal rejects malformed input before ownership lookup and preserves CSRF/session checks', async () => {
  const [route, validators, runtime] = await Promise.all([
    readFile('src/app/api/auth/session/route.ts', 'utf8'),
    readFile('src/lib/walletAuthRequestValidation.ts', 'utf8'),
    readFile('src/components/WalletRuntimeLifecycle.tsx', 'utf8'),
  ]);
  assert.match(route, /if \(!renewalRequestIsAllowed\(request\)\)/);
  assert.match(route, /let rawBody: unknown;/);
  assert.match(route, /isWalletSessionRenewalRequestBody\(rawBody\)/);
  const guardIndex = route.indexOf('isWalletSessionRenewalRequestBody(rawBody)');
  assert.ok(guardIndex > 0);
  assert.ok(guardIndex < route.indexOf('const expectedWallet =', guardIndex));
  assert.ok(guardIndex < route.indexOf('await getWalletSession(request)', guardIndex));
  assert.match(route, /session\.walletAddress !== expectedWallet/);
  assert.match(route, /SESSION_RENEWAL_INTENT = 'renew'/);
  assert.match(route, /renewalRequestIsAllowed\(request\)/);
  assert.match(route, /readWalletSessionTokens\(request\)/);
  assert.match(route, /\.eq\('id', session\.id\)/);
  assert.match(route, /\.is\('revoked_at', null\)/);
  assert.match(route, /setSessionCookie\(\{/);
  assert.doesNotMatch(route, /issue_wallet_session_after_verified_challenge/);
  assert.match(validators, /isRecord\(value\) && typeof value\.walletAddress === 'string'/);
  assert.match(runtime, /X-VeInvite-Session-Intent/);
});

test('shape hardening never admits cryptographically unauthenticated certificates', async () => {
  const [verifyRoute, challengeRoute, crypto, coord, gate, handoff] = await Promise.all([
    readFile('src/app/api/auth/verify/route.ts', 'utf8'),
    readFile('src/app/api/auth/challenge/route.ts', 'utf8'),
    readFile('src/lib/walletCertificateVerification.ts', 'utf8'),
    readFile('src/lib/walletAuthenticationCoordinator.ts', 'utf8'),
    readFile('src/components/WalletSessionGate.tsx', 'utf8'),
    readFile('src/components/WalletProviderAccountReconciler.tsx', 'utf8'),
  ]);

  // Both endpoints parse into unknown, validate, then allow database lookup.
  assert.match(verifyRoute, /let rawBody: unknown;/);
  assert.match(verifyRoute, /isWalletVerifyRequestBody\(rawBody\)/);
  assert.ok(verifyRoute.indexOf('isWalletVerifyRequestBody(rawBody)') < verifyRoute.indexOf('normalizeAddress(\n      body.walletAddress'));
  assert.match(challengeRoute, /let body: unknown;/);
  assert.match(challengeRoute, /isWalletChallengeRequestBody\(body\)/);
  assert.ok(challengeRoute.indexOf('isWalletChallengeRequestBody(body)') < challengeRoute.indexOf('normalizeAddress(body.walletAddress)'));

  // Signature/challenge security is unchanged: shape validity never grants
  // a session, and an already-consumed proof is not reusable.
  assert.match(verifyRoute, /verifyVeWorldCertificate\(\{/);
  assert.match(verifyRoute, /if \(challenge.used_at\) \{/);
  assert.match(verifyRoute, /issue_wallet_session_after_verified_challenge/);
  assert.match(verifyRoute, /challenge.origin !==/);
  assert.match(verifyRoute, /challenge.network !==/);
  assert.match(crypto, /Certificate\.of\(\{/);
  assert.match(crypto, /\}\)\.verify\(\);/);
  assert.match(crypto, /certificate\.payload\.content !==\s*challenge\.message/);
  assert.match(crypto, /certificateSigner !==\s*walletAddress/);

  // Wallet A -> B changes cannot free the global signing slot until the
  // actual wallet prompt completes or the wallet confirms disconnect.
  assert.match(coord, /await current/); // Allow source to evolve below.
  assert.match(coord, /releaseCancelledWalletAuthenticationAfterDisconnect/);
  assert.match(coord, /cancelActiveWalletAuthentication/);
  assert.match(gate, /releaseCancelledWalletAuthenticationAfterDisconnect\(\)/);
  assert.match(handoff, /'X-VeInvite-Session-Handoff-Wallet': sessionWallet/);
  assert.match(handoff, /sessionWallet === targetWallet/);
});

test('concurrent browsers share only one pending challenge and never bypass consumed-challenge checks', async () => {
  const [challengeRoute, verifyRoute, hook] = await Promise.all([
    readFile('src/app/api/auth/challenge/route.ts', 'utf8'),
    readFile('src/app/api/auth/verify/route.ts', 'utf8'),
    readFile('src/hooks/useWalletAuthentication.ts', 'utf8'),
  ]);
  assert.match(challengeRoute, /loadActiveChallenge\(\{/);
  assert.match(challengeRoute, /insertError\.code === '23505'/);
  assert.match(challengeRoute, /if \(isUsableChallenge\(concurrentChallenge\)\)/);
  assert.match(verifyRoute, /if \(challenge.used_at\) \{[\s\S]*?409/);
  assert.match(verifyRoute, /issue_wallet_session_after_verified_challenge/);
  // Server 409 is exposed to the user; it never retries a signature in place
  // or turns a used nonce into an authenticated browser cookie.
  assert.match(hook, /const verification =\s*await verifyCurrentProof\(\);/);
  assert.doesNotMatch(hook, /await retryCertificateProof\(/);
  assert.match(hook, /throw new WalletAuthenticationFailure\(/);
});
