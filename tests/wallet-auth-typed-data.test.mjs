import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  Wallet,
  verifyTypedData,
} from 'ethers';

import {
  buildWalletAuthTypedData,
} from '../src/lib/walletAuthTypedData.ts';

const [
  authHook,
  challengeRoute,
  verifyRoute,
  typedDataSource,
] = await Promise.all([
  readFile('src/hooks/useWalletAuthentication.ts', 'utf8'),
  readFile('src/app/api/auth/challenge/route.ts', 'utf8'),
  readFile('src/app/api/auth/verify/route.ts', 'utf8'),
  readFile('src/lib/walletAuthTypedData.ts', 'utf8'),
]);

test('VeWorld ownership auth uses one established-wallet EIP-712 prompt', () => {
  assert.match(authHook, /dappKitSource === 'veworld'/);
  assert.match(authHook, /await requestTypedData\(/);
  assert.match(authHook, /typedData\.domain/);
  assert.match(authHook, /typedData\.types/);
  assert.match(authHook, /typedData\.value/);
  assert.doesNotMatch(authHook, /await connectV2\(/);
  assert.doesNotMatch(authHook, /getPendingVeWorldWalletHandoffDelay/);
  assert.match(authHook, /proofType\s*=\s*'typed_data'/);
});

test('fresh and database-reloaded expiry strings produce identical EIP-712 data and signature verification', async () => {
  const privateKey =
    '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const wallet = new Wallet(privateKey);
  const walletAddress = wallet.address.toLowerCase();
  const common = {
    walletAddress,
    nonce:
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    origin: 'https://veinvite.vercel.app',
    network: 'mainnet',
    message: [
      'Verify your wallet for VeInvite',
      '',
      'Expires at: 2026-09-22T05:16:59.584Z',
    ].join('\n'),
  };

  const fresh = buildWalletAuthTypedData({
    ...common,
    expiresAt: '2026-09-22T05:16:59.584Z',
  });
  const reloaded = buildWalletAuthTypedData({
    ...common,
    expiresAt: '2026-09-22T05:16:59.584+00:00',
  });

  assert.deepEqual(
    fresh,
    reloaded,
    'the same instant must never produce different EIP-712 payloads after a database round-trip',
  );
  assert.equal(
    fresh.value.expiresAt,
    '2026-09-22T05:16:59.584Z',
  );

  const signature = await wallet.signTypedData(
    fresh.domain,
    fresh.types,
    fresh.value,
  );
  const recovered = verifyTypedData(
    reloaded.domain,
    reloaded.types,
    reloaded.value,
    signature,
  );

  assert.equal(
    recovered.toLowerCase(),
    walletAddress,
    'a signature from a fresh 201 challenge must verify against the database-reloaded representation',
  );
});

test('wallet challenge returns one canonical expiry representation for both fresh and reused challenges', () => {
  assert.match(
    challengeRoute,
    /expiresAt:[\s\S]*new Date\([\s\S]*challenge\.expires_at[\s\S]*\)\.toISOString\(\)/,
  );
  assert.match(
    challengeRoute,
    /message: challenge\.message,[\s\S]*origin,[\s\S]*network/,
  );
  assert.match(
    challengeRoute,
    /CHALLENGE_LIFETIME_MINUTES\s*=\s*5/,
  );
});

test('server reconstructs typed auth through the same canonicalizing builder', () => {
  assert.match(verifyRoute, /verifyTypedData/);
  assert.match(verifyRoute, /buildWalletAuthTypedData\(\{/);
  assert.match(verifyRoute, /nonce: challenge\.nonce/);
  assert.match(verifyRoute, /expiresAt:\s*challenge\.expires_at/);
  assert.match(verifyRoute, /origin:\s*challenge\.origin/);
  assert.match(verifyRoute, /network:\s*challenge\.network/);
  assert.match(verifyRoute, /message:\s*challenge\.message/);
  assert.match(verifyRoute, /proofType === 'typed_data'/);
  assert.match(verifyRoute, /issue_wallet_session_after_verified_challenge/);
  assert.match(
    typedDataSource,
    /canonicalizeWalletAuthExpiresAt[\s\S]*toISOString\(\)/,
  );
});

test('typed auth keeps reviewed VeChain chain ids and legacy proof compatibility', () => {
  assert.match(typedDataSource, /100009/);
  assert.match(typedDataSource, /100010/);
  assert.match(typedDataSource, /walletAddress/);
  assert.match(typedDataSource, /nonce/);
  assert.match(typedDataSource, /expiresAt/);
  assert.match(typedDataSource, /origin/);
  assert.match(typedDataSource, /network/);
  assert.match(verifyRoute, /verifyVeWorldCertificate/);
  assert.match(verifyRoute, /verifyMessage/);
});
