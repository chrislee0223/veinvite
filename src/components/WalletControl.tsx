'use client';

import dynamic from 'next/dynamic';
import { useWallet } from '@vechain/dapp-kit-react';

const WalletButton = dynamic(
  () => import('@vechain/vechain-kit').then((mod) => mod.WalletButton),
  { ssr: false },
);

export function useActiveWallet(): string | null {
  const { account } = useWallet();
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  return account ?? (demoMode ? process.env.NEXT_PUBLIC_DEMO_WALLET ?? null : null);
}

export function WalletControl() {
  const wallet = useActiveWallet();
  return (
    <div className="walletControl">
      {wallet ? <span className="walletAddress">{wallet.slice(0, 6)}···{wallet.slice(-4)}</span> : null}
      <WalletButton />
    </div>
  );
}
