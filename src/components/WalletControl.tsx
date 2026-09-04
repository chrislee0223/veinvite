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
  clearPersistedVeWorldConnectionState,
  markWalletConnectIntent,
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

const WALLET_RELEASE_TIMEOUT_MS = 3_000;
const WALLET_TRANSPORT_SETTLE_MS = 900;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

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

  const waitForWalletRelease = useCallback(
    async (previousWallet: string | null) => {
      if (!previousWallet) {
        return;
      }

      const previous = previousWallet.toLowerCase();
      const deadline =
        Date.now() + WALLET_RELEASE_TIMEOUT_MS;

      // VeChainKit clears the local account synchronously, but dapp-kit's
      // wallet-manager starts the provider/WalletConnect disconnect without
      // awaiting that remote teardown. Wait until React has observed the
      // cleared account before allowing another login attempt.
      while (
        walletRef.current?.toLowerCase() === previous &&
        Date.now() < deadline
      ) {
        await wait(50);
      }

      // Give the underlying transport a short window to finish its remote
      // disconnect. Without this guard a fast reconnect can race the old
      // session teardown: VeWorld may show "App connected" while VeInvite
      // never receives a fresh account.
      await wait(WALLET_TRANSPORT_SETTLE_MS);
    },
    [],
  );

  const performDisconnect = useCallback(
    async ({
      ignoreSessionCleanupError,
    }: {
      ignoreSessionCleanupError: boolean;
    }) => {
      const previousWallet = walletRef.current;
      let sessionError: unknown;
      let disconnectError: unknown;

      try {
        await clearWalletSession();
      } catch (error) {
        sessionError = error;
        console.error(
          'Failed to clear VeInvite wallet session:',
          error,
        );
      }

      try {
        await disconnect();
      } catch (error) {
        disconnectError = error;
        console.error(
          'Failed to disconnect wallet:',
          error,
        );
      } finally {
        // Explicit disconnect/switch must not leave VeWorld provider evidence
        // behind for startup recovery. The next connection attempt will write
        // a fresh account/source and explicit connect intent.
        clearPersistedVeWorldConnectionState();
      }

      await waitForWalletRelease(previousWallet);

      if (disconnectError) {
        throw disconnectError;
      }

      // A transient server-session cleanup failure must not trap the user on
      // the old wallet when they explicitly chose "connect another wallet".
      // The authentication gate also replaces any mismatched session during
      // the next successful wallet verification.
      if (sessionError && !ignoreSessionCleanupError) {
        throw sessionError;
      }
    },
    [
      clearWalletSession,
      disconnect,
      waitForWalletRelease,
    ],
  );

  const disconnectWallet = useCallback(async () => {
    if (isWalletActionPending) {
      return;
    }

    setIsWalletActionPending(true);

    try {
      await performDisconnect({
        ignoreSessionCleanupError: false,
      });
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
          await performDisconnect({
            ignoreSessionCleanupError: true,
          });
        }

        // At this point the previous VeChainKit account has been released and
        // the old wallet transport has had time to settle, so the connect modal
        // starts a genuinely new login instead of reusing a half-closed session.
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
      } finally {
        clearPersistedVeWorldConnectionState();
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
