import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gate = await readFile(
  'src/components/WalletSessionGate.tsx',
  'utf8',
);

test('verified session never flashes logged-out Home during a transient provider gap', () => {
  assert.match(
    gate,
    /if \(!walletAddress\) \{[\s\S]*sessionWalletRef\.current[\s\S]*verifiedWallet[\s\S]*state === 'verified'[\s\S]*return <WalletSessionBrandSurface \/>/,
  );
  assert.match(
    gate,
    /handleSessionCleared[\s\S]*sessionWalletRef\.current = null[\s\S]*setVerifiedWallet\(null\)[\s\S]*setState\('idle'\)/,
  );
});
