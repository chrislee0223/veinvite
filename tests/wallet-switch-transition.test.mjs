import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  isWalletSessionMismatch,
} from '../src/lib/walletConnectionResume.ts';

const WALLET_A =
  '0x1111111111111111111111111111111111111111';
const WALLET_B =
  '0x2222222222222222222222222222222222222222';

test('A -> B and B -> A are explicit wallet mismatches while same-wallet restores are not', () => {
  assert.equal(
    isWalletSessionMismatch(WALLET_A, WALLET_B),
    true,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_B, WALLET_A),
    true,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_A, WALLET_A),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(
      WALLET_A.toUpperCase(),
      WALLET_A,
    ),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(null, WALLET_A),
    false,
  );
  assert.equal(
    isWalletSessionMismatch(WALLET_A, null),
    false,
  );
});

test('explicit A -> B continuation clears the old browser session but keeps B connected for verification', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /isWalletSessionMismatch\([\s\S]*sessionWallet,[\s\S]*walletAddress[\s\S]*\)[\s\S]*await clearWalletSession\(\);[\s\S]*await verify\(\);/,
  );
  assert.doesNotMatch(
    source,
    /const retryVerification[\s\S]*await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*await verify\(\);/,
  );
});

test('choosing another wallet waits for provider release before a fresh connect intent', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /const chooseAnotherWallet[\s\S]*await clearWalletSession\(\);[\s\S]*await disconnect\(\);[\s\S]*settleExplicitWalletDisconnect[\s\S]*markWalletConnectIntent\(\);[\s\S]*openConnectModal\(\);/,
  );
});

test('confirmed external VeWorld disconnect can clear a stale session after the grace window', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletSessionGate.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /PASSIVE_DISCONNECT_GRACE_MS\s*=\s*7_000/,
  );
  assert.match(
    source,
    /clearWalletSession\(\{[\s\S]*confirmedDisconnected:\s*true/,
  );
  assert.match(source, /'pageshow'/);
  assert.match(source, /'visibilitychange'/);
});

test('an external VeWorld account switch repairs a persistent VeChainKit/DAppKit mismatch in place', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  const providers = await readFile(
    new URL(
      '../src/components/AppProviders.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /PROVIDER_MISMATCH_GRACE_MS\s*=\s*700/,
  );
  assert.match(
    source,
    /PROVIDER_REPAIR_RETRY_DELAYS_MS\s*=\s*\[0,\s*450,\s*900\]/,
  );
  assert.match(
    source,
    /connection\.isConnectedWithDappKit/,
  );
  assert.match(source, /connection\.isLoading/);
  assert.match(
    source,
    /dappWallet\s*===\s*canonicalWallet/,
  );
  assert.match(source, /await initializeAsync\(\)/);
  assert.match(
    providers,
    /<WalletProviderAccountReconciler\s*\/>/,
  );
});

test('provider repair preserves the old A-session confirmation and only re-arms auth after it is safe', async () => {
  const source = await readFile(
    new URL(
      '../src/components/WalletProviderAccountReconciler.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(
    source,
    /fetch\('\/api\/auth\/session',[\s\S]*credentials:\s*'include'/,
  );
  assert.match(
    source,
    /session\.authenticated\s*===\s*true[\s\S]*sessionWallet[\s\S]*sessionWallet\s*!==\s*walletAddress[\s\S]*return;/,
  );
  assert.match(
    source,
    /new Event\(WALLET_SESSION_INVALID_EVENT\)/,
  );
  assert.doesNotMatch(
    source,
    /clearWalletSession|disconnect\(\)|clearPersistedVeWorldConnectionState/,
  );
});
