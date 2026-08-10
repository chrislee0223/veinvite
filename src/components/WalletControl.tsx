'use client';

import {
  useCallback,
} from 'react';
import dynamic from 'next/dynamic';

import {
  useAccountModal,
  useConnectModal,
} from '@vechain/vechain-kit';

import {
  useWallet,
} from '@vechain/dapp-kit-react';

const WalletButton = dynamic(
  () =>
    import(
      '@vechain/vechain-kit'
    ).then((mod) => mod.WalletButton),
  {
    ssr: false,
  },
);

export function useActiveWallet():
  | string
  | null {
  const { account } = useWallet();

  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE ===
    'true';

  return (
    account ??
    (demoMode
      ? process.env
          .NEXT_PUBLIC_DEMO_WALLET ??
        null
      : null)
  );
}

export function useWalletLauncher() {
  const wallet = useActiveWallet();

  const {
    open: openConnectModal,
    isOpen: isConnectModalOpen,
  } = useConnectModal();

  const {
    open: openAccountModal,
    isOpen: isAccountModalOpen,
  } = useAccountModal();

  const openWallet = useCallback(() => {
    if (wallet) {
      openAccountModal();
      return;
    }

    openConnectModal();
  }, [
    wallet,
    openAccountModal,
    openConnectModal,
  ]);

  return {
    wallet,
    openWallet,
    isWalletModalOpen:
      isConnectModalOpen ||
      isAccountModalOpen,
  };
}

export function WalletControl() {
  const wallet = useActiveWallet();
  const { disconnect } = useWallet();

  const handleDisconnect =
    useCallback(async () => {
      try {
        await disconnect();
      } catch (error) {
        console.error(
          'Failed to disconnect wallet:',
          error,
        );
      }
    }, [disconnect]);

  return (
    <div className="walletControl">
      {wallet ? (
        <>
          <span className="walletAddress">
            {wallet.slice(0, 6)}
            ···
            {wallet.slice(-4)}
          </span>

          <button
            type="button"
            className="walletDisconnect"
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </>
      ) : null}

      <WalletButton />
    </div>
  );
}
