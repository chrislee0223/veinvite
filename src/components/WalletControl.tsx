'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';

import {
  useAccountModal,
  useConnectModal,
  useWallet,
} from '@vechain/vechain-kit';

import {
  useWalletAuthentication,
} from '@/hooks/useWalletAuthentication';
import {
  markWalletConnectIntent,
  settleExplicitWalletDisconnect,
} from '@/lib/walletConnectionResume';

const WalletButton = dynamic(
  () =>
    import(
      '@vechain/vechain-kit'
    ).then((mod) => mod.WalletButton),
  {
    ssr: false,
  },
);

const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

export function useActiveWallet():
  | string
  | null {
  const { account } = useWallet();

  // VeChainKit is the canonical connection state for VeInvite because it
  // unifies VeWorld and WalletConnect. Keeping every screen on this same
  // source prevents stale DAppKit/VeChainKit connection state from diverging.
  return account?.address ?? null;
}

export function useWalletLauncher() {
  const wallet = useActiveWallet();
  const { disconnect } = useWallet();
  const { clearWalletSession } =
    useWalletAuthentication();
  const [isWalletActionPending, setIsWalletActionPending] =
    useState(false);
  const walletRef = useRef<string | null>(wallet);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  const {
    open: openConnectModal,
    isOpen: isConnectModalOpen,
  } = useConnectModal();

  const {
    open: openAccountModal,
    isOpen: isAccountModalOpen,
  } = useAccountModal();

  const openWallet = useCallback(() => {
    // During logout/switch the visible account can disappear before the
    // underlying VeWorld/WalletConnect transport has finished disconnecting.
    // Do not let any home/settings connect button start a new handshake inside
    // that short teardown window.
    if (isWalletActionPending) {
      return;
    }

    if (wallet) {
      openAccountModal();
      return;
    }

    // Mobile browsers can suspend JavaScript while VeWorld is approving the
    // connection. Record this explicit attempt so the provider can reconcile
    // persisted dapp-kit state as soon as the browser becomes active again.
    markWalletConnectIntent();
    openConnectModal();
  }, [
    isWalletActionPending,
    wallet,
    openAccountModal,
    openConnectModal,
  ]);

  const performDisconnect = useCallback(async () => {
    const previousWallet = walletRef.current;

    // Never tear down the provider if this browser's VeInvite session could not
    // be revoked. Keeping the current wallet connected leaves the user in a
    // recoverable state instead of producing a stale-cookie/startup deadlock.
    try {
      await clearWalletSession();
    } catch (error) {
      console.error(
        'Failed to clear VeInvite wallet session:',
        error,
      );
      throw error;
    }

    try {
      await disconnect();
    } catch (error) {
      console.error(
        'Failed to disconnect wallet:',
        error,
      );
      // The server session is already gone but the provider is still present.
      // Re-arm verification so the current wallet can recover instead of being
      // stranded behind a non-interactive loading surface.
      window.dispatchEvent(
        new Event(WALLET_SESSION_INVALID_EVENT),
      );
      throw error;
    }

    const released =
      await settleExplicitWalletDisconnect({
        previousWallet,
        readCurrentWallet: () => walletRef.current,
      });

    if (!released) {
      window.dispatchEvent(
        new Event(WALLET_SESSION_INVALID_EVENT),
      );
      throw new Error(
        'Wallet disconnect did not finish.',
      );
    }
  }, [
    clearWalletSession,
    disconnect,
  ]);

  const disconnectWallet = useCallback(async () => {
    if (isWalletActionPending) {
      return;
    }

    setIsWalletActionPending(true);

    try {
      await performDisconnect();
    } finally {
      setIsWalletActionPending(false);
    }
  }, [
    isWalletActionPending,
    performDisconnect,
  ]);

  const connectAnotherWallet =
    useCallback(async () => {
      if (isWalletActionPending) {
        return;
      }

      setIsWalletActionPending(true);

      try {
        if (walletRef.current) {
          await performDisconnect();
        }

        // The old browser session is gone, the provider account has actually
        // released, and stale VeWorld persistence has been removed twice around
        // transport settlement. Only now start a genuinely new handshake.
        markWalletConnectIntent();
        openConnectModal();
      } finally {
        setIsWalletActionPending(false);
      }
    }, [
      isWalletActionPending,
      openConnectModal,
      performDisconnect,
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
  const {
    wallet,
    disconnectWallet,
    isWalletActionPending,
  } = useWalletLauncher();

  const handleDisconnect =
    useCallback(async () => {
      try {
        await disconnectWallet();
      } catch (error) {
        console.error(
          'Failed to disconnect wallet:',
          error,
        );
      }
    }, [disconnectWallet]);

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
            disabled={isWalletActionPending}
            onClick={() => {
              void handleDisconnect();
            }}
          >
            Disconnect
          </button>
        </>
      ) : null}

      <WalletButton />
    </div>
  );
}
