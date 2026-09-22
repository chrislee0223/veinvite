import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  authHook,
  challengeRoute,
  verifyRoute,
  typedData,
] = await Promise.all([
  readFile('src/hooks/useWalletAuthentication.ts', 'utf8'),
  readFile('src/app/api/auth/challenge/route.ts', 'utf8'),
  readFile('src/app/api/auth/verify/route.ts', 'utf8'),
  readFile('src/lib/walletAuthTypedData.ts', 'utf8'),
]);

test('VeWorld ownership auth prefers EIP-712 over certificates when supported', () => {
  assert.match(authHook, /dappKitSource === 'veworld'/);
  assert.match(authHook, /await requestTypedData\(/);
  assert.match(authHook, /typedData\.domain/);
  assert.match(authHook, /typedData\.types/);
  assert.match(authHook, /typedData\.value/);
  assert.doesNotMatch(authHook, /await connectV2\(/);
  assert.match(authHook, /proofType\s*=\s*'typed_data'/);
  assert.match(
    authHook,
    /The wallet is already connected at this point/,
  );
});

test('VeWorld refreshes the existing signing transport before the first ownership prompt', () => {
  const refresh = authHook.indexOf(
    'await initializeAsync();',
  );
  const typedPrompt = authHook.indexOf(
    'await requestTypedData(',
  );

  assert.ok(refresh >= 0);
  assert.ok(typedPrompt > refresh);
  assert.match(
    authHook,
    /dappKitSource === 'veworld'[\s\S]*runWalletProviderReconciliation\([\s\S]*await initializeAsync\(\)[\s\S]*requestTypedData\(/,
  );
  assert.doesNotMatch(authHook, /await connectV2\(/);
});

test('wallet challenge exposes the exact EIP-712 binding inputs', () => {
  assert.match(challengeRoute, /message: challenge\.message,[\s\S]*origin,[\s\S]*network/);
  assert.match(challengeRoute, /CHALLENGE_LIFETIME_MINUTES\s*=\s*5/);
});

test('server reconstructs and verifies typed auth from stored challenge data', () => {
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
    verifyRoute,
    /Wallet typed proof rejected\.[\s\S]*typed_signature_invalid[\s\S]*typed_signer_mismatch/,
  );
  const diagnosticStart = verifyRoute.indexOf(
    'function logTypedProofRejection',
  );
  const diagnosticEnd = verifyRoute.indexOf(
    'function certificateDomainMatchesOrigin',
    diagnosticStart,
  );
  const diagnosticBlock = verifyRoute.slice(
    diagnosticStart,
    diagnosticEnd,
  );
  assert.ok(diagnosticStart >= 0);
  assert.ok(diagnosticEnd > diagnosticStart);
  assert.doesNotMatch(
    diagnosticBlock,
    /console\.info\([\s\S]*walletAddress/,
  );
});

test('typed auth uses reviewed VeChain chain ids and keeps legacy proof compatibility', () => {
  assert.match(typedData, /100009/);
  assert.match(typedData, /100010/);
  assert.match(typedData, /walletAddress/);
  assert.match(typedData, /nonce/);
  assert.match(typedData, /expiresAt/);
  assert.match(typedData, /origin/);
  assert.match(typedData, /network/);
  assert.match(verifyRoute, /verifyVeWorldCertificate/);
  assert.match(verifyRoute, /verifyMessage/);
});
