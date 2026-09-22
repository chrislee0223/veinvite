import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Wallet,
  verifyTypedData,
} from 'ethers';

import {
  buildWalletAuthTypedData,
} from '../src/lib/walletAuthTypedData.ts';

test('fresh and database-reloaded expiry strings verify the same EIP-712 signature', async () => {
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
    'equal instants must produce identical EIP-712 payloads after a database round-trip',
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
    'a fresh challenge signature must verify against the Supabase-reloaded representation',
  );
});
