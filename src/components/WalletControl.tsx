'use client';

import {
  useCallback,
  useState,
} from 'react';
import dynamic from 'next/dynamic';

import {
  useAccountModal,
  useConnectModal,
} from '@vechain/vechain-kit';
import {
  useWallet,
} from '@vechain/dapp-kit-react';

import {
  useWalletAuthentication,
} from '@/hooks/useWalletAuthentication';

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

  // Never synthesize an authenticated identity from a public demo variable.
  // Preview testing should use a real test wallet and the same ownership proof
  // as production.
  return account ?? null;
}

export function useWalletLauncher() {
  const wallet = useActiveWallet();
  const { disconnect } = useWallet();
  const { clearWalletSession } =
    useWalletAuthentication();
  const [isWalletActionPending, setIsWalletActionPending] =
    useState(false);

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

  const disconnectWallet = useCallback(async () => {
    setIsWalletActionPending(true);
    let firstError: unknown;

    try {
      await clearWalletSession();
    } catch (error) {
      firstError = error;
      console.error(
        'Failed to clear VeInvite wallet session:',
        error,
      );
    }

    try {
      await disconnect();
    } catch (error) {
      firstError ??= error;
      console.error(
        'Failed to disconnect wallet:',
        error,
      );
    } finally {
      setIsWalletActionPending(false);
    }

    if (firstError) {
      throw firstError;
    }
  }, [clearWalletSession, disconnect]);

  const connectAnotherWallet =
    useCallback(async () => {
      if (wallet) {
        await disconnectWallet();
      }

      openConnectModal();
    }, [
      disconnectWallet,
      openConnectModal,
      wallet,
    ]);

  return {
    wallet,
    openWallet,
    connectAnotherWallet,
    disconnectWallet,
    isWalletActionPending,
    isWalletModalOpen:
      isConnectModalOpen ||
      isAccountModalOpen,
  };
}

export function WalletControl() {
  const wallet = useActiveWallet();
  const { disconnect } = useWallet();
  const { clearWalletSession } =
    useWalletAuthentication();

  const handleDisconnect =
    useCallback(async () => {
      try {
        await clearWalletSession();
      } catch (error) {
        console.error(
          'Failed to clear VeInvite wallet session:',
          error,
        );
      }

      try {
        await disconnect();
      } catch (error) {
        console.error(
          'Failed to disconnect wallet:',
          error,
        );
      }
    }, [
      clearWalletSession,
      disconnect,
    ]);

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
