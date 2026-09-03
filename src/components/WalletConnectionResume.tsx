'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useConnectModal,
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

import { Brand } from './Brand';
import {
  WALLET_CONNECT_INTENT_EVENT,
  clearWalletConnectIntent,
  readPersistedDappKitAccount,
  readWalletConnectIntentAt,
} from '@/lib/walletConnectionResume';

const CONNECT_INTENT_TTL_MS = 2 * 60_000;
const RECONCILE_SETTLE_MS = 450;
const RECONCILE_COOLDOWN_MS = 750;
const RESUME_RETRY_WINDOW_MS = 12_000;
const RELOAD_GUARD_TTL_MS = 30_000;
const RELOAD_GUARD_STORAGE_KEY =
  'veinvite_wallet_resume_reload_v1';

type ReloadGuard = {
  walletAddress: string;
  at: number;
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function normalizeWallet(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? null;
  return normalized && /^0x[0-9a-f]{40}$/.test(normalized)
    ? normalized
    : null;
}

function readReloadGuard(): ReloadGuard | null {
  try {
    const raw = window.sessionStorage.getItem(
      RELOAD_GUARD_STORAGE_KEY,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReloadGuard>;
    const walletAddress = normalizeWallet(parsed.walletAddress);
    if (!walletAddress || typeof parsed.at !== 'number') {
      return null;
    }
    return { walletAddress, at: parsed.at };
  } catch {
    return null;
  }
}

function writeReloadGuard(walletAddress: string): void {
  try {
    window.sessionStorage.setItem(
      RELOAD_GUARD_STORAGE_KEY,
      JSON.stringify({
        walletAddress,
        at: Date.now(),
      } satisfies ReloadGuard),
    );
  } catch {
    // A failed guard write only disables the one-time reload fallback.
  }
}

function clearReloadGuard(): void {
  try {
    window.sessionStorage.removeItem(
      RELOAD_GUARD_STORAGE_KEY,
    );
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function WalletConnectionResume() {
  const {
    account: veChainKitAccount,
  } = useVeChainKitWallet();
  const {
    account: dappKitAccount,
    initializeAsync,
  } = useDappKitWallet();
  const {
    close: closeConnectModal,
    isOpen: isConnectModalOpen,
  } = useConnectModal();

  const [recovering, setRecovering] =
    useState(false);
  const veChainKitWalletRef = useRef<string | null>(
    normalizeWallet(veChainKitAccount?.address),
  );
  const dappKitWalletRef = useRef<string | null>(
    normalizeWallet(dappKitAccount),
  );
  const modalOpenRef = useRef(isConnectModalOpen);
  const inFlightRef = useRef(false);
  const lastAttemptAtRef = useRef(0);
  const leftPageForWalletRef = useRef(false);
  const resumeWindowUntilRef = useRef(0);

  useEffect(() => {
    veChainKitWalletRef.current = normalizeWallet(
      veChainKitAccount?.address,
    );
  }, [veChainKitAccount?.address]);

  useEffect(() => {
    dappKitWalletRef.current = normalizeWallet(
      dappKitAccount,
    );
  }, [dappKitAccount]);

  useEffect(() => {
    modalOpenRef.current = isConnectModalOpen;
  }, [isConnectModalOpen]);

  useEffect(() => {
    if (!veChainKitWalletRef.current) {
      return;
    }

    clearWalletConnectIntent();
    clearReloadGuard();
    leftPageForWalletRef.current = false;
    resumeWindowUntilRef.current = 0;
    setRecovering(false);

    if (isConnectModalOpen) {
      closeConnectModal();
    }
  }, [
    closeConnectModal,
    isConnectModalOpen,
    veChainKitAccount?.address,
  ]);

  const hasRecentConnectIntent = useCallback(() => {
    const intentAt = readWalletConnectIntentAt();
    if (intentAt === null) {
      return false;
    }

    if (Date.now() - intentAt > CONNECT_INTENT_TTL_MS) {
      clearWalletConnectIntent();
      return false;
    }

    return true;
  }, []);

  const reconcile = useCallback(async () => {
    if (
      document.visibilityState === 'hidden' ||
      veChainKitWalletRef.current ||
      inFlightRef.current ||
      Date.now() > resumeWindowUntilRef.current
    ) {
      return;
    }

    const now = Date.now();
    if (!hasRecentConnectIntent() && !modalOpenRef.current) {
      return;
    }

    const persistedWallet =
      readPersistedDappKitAccount();
    const directWallet = dappKitWalletRef.current;

    // Do not use an old persisted account merely because the connect modal is
    // open. This path is armed only after the browser actually left for a
    // wallet app and returned, and still requires dapp-kit evidence to exist.
    if (!persistedWallet && !directWallet) {
      return;
    }

    if (
      now - lastAttemptAtRef.current <
      RECONCILE_COOLDOWN_MS
    ) {
      return;
    }

    lastAttemptAtRef.current = now;
    inFlightRef.current = true;
    setRecovering(true);

    try {
      // VeWorld can persist a successful v2 connection while iOS is switching
      // back from the wallet app, but the React provider subscription may miss
      // that transition. Re-initialize dapp-kit from its persisted state so the
      // current page receives the account without requiring a manual refresh.
      await initializeAsync();
    } catch (error) {
      console.warn(
        'VeInvite could not rehydrate the VeWorld connection in place.',
        error,
      );
    }

    await wait(RECONCILE_SETTLE_MS);

    if (veChainKitWalletRef.current) {
      clearWalletConnectIntent();
      clearReloadGuard();
      leftPageForWalletRef.current = false;
      resumeWindowUntilRef.current = 0;
      if (modalOpenRef.current) {
        closeConnectModal();
      }
      setRecovering(false);
      inFlightRef.current = false;
      return;
    }

    const recoverableWallet =
      readPersistedDappKitAccount() ??
      dappKitWalletRef.current;

    if (recoverableWallet) {
      const guard = readReloadGuard();
      const alreadyReloaded =
        guard?.walletAddress === recoverableWallet &&
        Date.now() - guard.at <= RELOAD_GUARD_TTL_MS;

      // A wallet-app return plus persisted connection evidence means VeWorld
      // completed enough of the handshake to survive reload. If the provider
      // still did not publish it after an explicit rehydrate, perform one
      // bounded automatic reload. The guard prevents reload loops.
      if (!alreadyReloaded) {
        writeReloadGuard(recoverableWallet);
        window.location.reload();
        return;
      }
    }

    setRecovering(false);
    inFlightRef.current = false;
  }, [
    closeConnectModal,
    hasRecentConnectIntent,
    initializeAsync,
  ]);

  useEffect(() => {
    const armDeparture = () => {
      if (
        modalOpenRef.current ||
        hasRecentConnectIntent()
      ) {
        leftPageForWalletRef.current = true;
      }
    };

    const handleConnectIntent = () => {
      // Opening the connect modal itself is not proof that the user left for
      // VeWorld. Wait for pagehide/hidden/blur before recovery is allowed.
      leftPageForWalletRef.current = false;
      resumeWindowUntilRef.current = 0;
    };

    const handleResume = () => {
      if (
        document.visibilityState === 'hidden' ||
        veChainKitWalletRef.current ||
        !leftPageForWalletRef.current
      ) {
        return;
      }

      if (!hasRecentConnectIntent() && !modalOpenRef.current) {
        leftPageForWalletRef.current = false;
        return;
      }

      leftPageForWalletRef.current = false;
      resumeWindowUntilRef.current =
        Date.now() + RESUME_RETRY_WINDOW_MS;
      window.setTimeout(
        () => void reconcile(),
        120,
      );
      window.setTimeout(
        () => void reconcile(),
        950,
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        armDeparture();
      } else {
        handleResume();
      }
    };

    window.addEventListener('pagehide', armDeparture);
    window.addEventListener('blur', armDeparture);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener(
      WALLET_CONNECT_INTENT_EVENT,
      handleConnectIntent,
    );
    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      window.removeEventListener('pagehide', armDeparture);
      window.removeEventListener('blur', armDeparture);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener(
        WALLET_CONNECT_INTENT_EVENT,
        handleConnectIntent,
      );
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [
    hasRecentConnectIntent,
    reconcile,
  ]);

  if (!recovering) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 50% 38%, rgba(244,183,40,0.10), transparent 32%), #080807',
        pointerEvents: 'none',
      }}
    >
      <Brand compact />
    </div>
  );
}
