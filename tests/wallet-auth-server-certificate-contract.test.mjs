import assert from 'node:assert/strict';
import test from 'node:test';

import { Certificate } from '@vechain/sdk-core';
import { getBytes, Wallet } from 'ethers';
import { verifyVeWorldCertificate } from '../src/lib/walletCertificateVerification.ts';

const NOW = new Date('2026-10-10T00:00:00.000Z');
const ORIGIN = 'https://veinvite.vercel.app';
const KEY = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const WALLET = new Wallet(KEY);
const ADDRESS = WALLET.address.toLowerCase();
const NONCE = '42'.repeat(32);
const EXPIRES = new Date(NOW.getTime() + 5 * 60_000).toISOString();
const MESSAGE = [
  'Verify your wallet for VeInvite',
  '',
  'Domain: veinvite.vercel.app',
  'URI: https://veinvite.vercel.app',
  'Network: mainnet',
  'Wallet: ' + ADDRESS,
  'Nonce: ' + NONCE,
  'Expires at: ' + EXPIRES,
  '',
  'This request does not create a transaction or cost gas.',
  'Only sign this message on the VeInvite site shown above.',
].join('\n');
const CHALLENGE = {
  expires_at: EXPIRES,
  message: MESSAGE,
  origin: ORIGIN,
};

function walletResponse({
  privateKey = KEY,
  content = MESSAGE,
  domain = 'veinvite.vercel.app',
  timestamp = Math.floor(NOW.getTime() / 1000),
} = {}) {
  const wallet = new Wallet(privateKey);
  const signed = Certificate.of({
    purpose: 'agreement',
    payload: { type: 'text', content },
    domain,
    timestamp,
    signer: wallet.address,
  });
  signed.sign(getBytes(privateKey));
  // Mirror DAppKit's actual response shape and VeInvite's client mapping:
  // { annex: { domain, timestamp, signer }, signature }.
  const response = {
    annex: {
      domain: signed.domain,
      timestamp: signed.timestamp,
      signer: signed.signer,
    },
    signature: signed.signature,
  };
  return {
    purpose: 'agreement',
    payload: { type: 'text', content },
    domain: response.annex.domain,
    timestamp: response.annex.timestamp,
    signer: response.annex.signer,
    signature: response.signature,
  };
}

function verify(certificate, challenge = CHALLENGE, walletAddress = ADDRESS, now = NOW) {
  return verifyVeWorldCertificate({
    certificate, challenge, walletAddress, now,
  });
}

test('the exact production verifier accepts native DAppKit certificate login proof', () => {
  assert.equal(verify(walletResponse()), null);
  assert.equal(verify(walletResponse({ domain: ORIGIN })), null);
});

test('different authenticated address cannot borrow a valid signed certificate', () => {
  const other = new Wallet('0x' + '12'.repeat(32)).address.toLowerCase();
  assert.equal(
    verify(walletResponse(), CHALLENGE, other),
    'The certificate does not match the connected wallet.',
  );
});

test('VeWorld signing a different approved account cannot falsely authenticate the requested account', () => {
  const anotherKey = '0x' + '34'.repeat(32);
  assert.equal(
    verify(walletResponse({ privateKey: anotherKey })),
    'The certificate does not match the connected wallet.',
  );
});

test('a nonce from one challenge cannot be replayed for another challenge', () => {
  const freshChallenge = {
    ...CHALLENGE,
    message: MESSAGE.replace(NONCE, '77'.repeat(32)),
  };
  assert.equal(verify(walletResponse(), freshChallenge), 'Invalid VeWorld certificate payload.');
});

test('a proof for another origin cannot authenticate VeInvite', () => {
  assert.equal(
    verify(walletResponse({ domain: 'not-veinvite.example' })),
    'The VeWorld certificate was signed for a different site.',
  );
  assert.equal(
    verify(walletResponse(), { ...CHALLENGE, origin: 'https://another.example' }),
    'The VeWorld certificate was signed for a different site.',
  );
});

test('a tampered signer, signature, or domain fails real cryptographic verification', () => {
  const valid = walletResponse();
  const signer = ADDRESS;
  assert.equal(
    verify({ ...valid, signer }),
    null,
    'address casing is normalized when signatures are checked',
  );
  assert.equal(
    verify({ ...valid, signature: '0x' + '00'.repeat(65) }),
    'Invalid VeWorld certificate signature.',
  );
  // This domain still maps to the same origin but is NOT the signed bytes.
  assert.equal(
    verify({ ...valid, domain: 'https://veinvite.vercel.app' }),
    'Invalid VeWorld certificate signature.',
  );
});

test('malformed proof, wrong purpose, future time and stale signing time all fail closed', () => {
  const valid = walletResponse();
  assert.equal(
    verify({ ...valid, purpose: 'identification' }),
    'Invalid VeWorld certificate payload.',
  );
  assert.equal(
    verify({ ...valid, timestamp: 0 }),
    'Invalid VeWorld certificate payload.',
  );
  assert.equal(
    verify(walletResponse({ timestamp: Math.floor(NOW.getTime()/1000)+600 })),
    'The VeWorld certificate timestamp is outside the verification window.',
  );
  assert.equal(
    verify(walletResponse({ timestamp: Math.floor(NOW.getTime()/1000)-900 })),
    'The VeWorld certificate timestamp is outside the verification window.',
  );
});

test('production route and client use the directly tested contract without bypassing proof checks', async () => {
  const { readFile } = await import('node:fs/promises');
  const [route, hook] = await Promise.all([
    readFile('src/app/api/auth/verify/route.ts', 'utf8'),
    readFile('src/hooks/useWalletAuthentication.ts', 'utf8'),
  ]);
  assert.match(route, /import \{ verifyVeWorldCertificate, type WalletCertificate \} from '@\/lib\/walletCertificateVerification'/);
  assert.match(route, /verifyVeWorldCertificate\(\{/);
  assert.match(route, /if \(certificateError\) \{/);
  assert.match(hook, /await requestCertificate\(/);
  assert.match(hook, /content:\s*challenge\.message!/);
  assert.match(hook, /signer,/);
  assert.match(hook, /proofType\s*=\s*'certificate'/);
  assert.doesNotMatch(hook, /await requestTypedData\(/);
  assert.match(route, /issue_wallet_session_after_verified_challenge/);
});
