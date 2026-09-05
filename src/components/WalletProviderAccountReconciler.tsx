'use client';

import {
  useEffect,
  useRef,
} from 'react';
import {
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const PROVIDER_MISMATCH_GRACE_MS = 700;
const PROVIDER_REPAIR_SETTLE_MS = 350;
const PROVIDER_REPAIR_RETRY_DELAYS_MS = [0, 450, 900] as const;
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
};

function normalizeWallet(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim().toLowerCase() ?? null;
  return normalized && WALLET_PATTERN.test(normalized)
    ? normalized
    : null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function resumeWalletSessionGate(
  walletAddress: string,
): Promise<void> {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      return;
    }

    const session = (await response.json()) as SessionResponse;
    const sessionWallet = normalizeWallet(session.walletAddress);

    // If the old A session is still valid, leave WalletSessionGate's explicit
    // A -> B confirmation intact. Once the user has already cleared A (or the
    // repaired provider is already authenticated as B), re-arm verification so
    // a previous provider-sync error recovers without another dead button tap.
    if (
      session.authenticated === true &&
      sessionWallet &&
      sessionWallet !== walletAddress
    ) {
      return;
    }

    window.dispatchEvent(
      new Event(WALLET_SESSION_INVALID_EVENT),
    );
  } catch {
    // Provider reconciliation is best-effort. The interactive wallet gate stays
    // visible if the session check itself is temporarily unavailable.
  }
}

/**
 * VeChainKit is VeInvite's canonical account source, while VeWorld certificate
 * signing is performed by DAppKit. Switching accounts inside VeWorld while the
 * app is closed can restore those two provider layers at slightly different
 * times. If that mismatch persists beyond the normal settle window, repair the
 * DAppKit layer in place instead of forcing the user into a disconnect loop.
 */
export function WalletProviderAccountReconciler() {
  const {
    account: veChainKitAccount,
    connection,
  } = useVeChainKitWallet();
  const {
    account: dappKitAccount,
    initializeAsync,
  } = useDappKitWallet();

  const canonicalWallet = normalizeWallet(
    veChainKitAccount?.address,
  );
  const dappWallet = normalizeWallet(dappKitAccount);
  const canonicalWalletRef = useRef<string | null>(
    canonicalWallet,
  );
  const dappWalletRef = useRef<string | null>(dappWallet);
  const repairTargetRef = useRef<string | null>(null);
  const repairGenerationRef = useRef(0);

  useEffect(() => {
    canonicalWalletRef.current = canonicalWallet;
  }, [canonicalWallet]);

  useEffect(() => {
    dappWalletRef.current = dappWallet;
  }, [dappWallet]);

  useEffect(() => {
    const generation = repairGenerationRef.current + 1;
    repairGenerationRef.current = generation;

    if (
      !connection.isConnectedWithDappKit ||
      connection.isLoading ||
      !canonicalWallet ||
      dappWallet === canonicalWallet
    ) {
      if (!canonicalWallet) {
        repairTargetRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const targetWallet = canonicalWallet;

    const graceTimer = window.setTimeout(() => {
      void (async () => {
        if (
          cancelled ||
          repairGenerationRef.current !== generation ||
          canonicalWalletRef.current !== targetWallet ||
          dappWalletRef.current === targetWallet
        ) {
          return;
        }

        repairTargetRef.current = targetWallet;

        for (
          let index = 0;
          index < PROVIDER_REPAIR_RETRY_DELAYS_MS.length;
          index += 1
        ) {
          const retryDelay = PROVIDER_REPAIR_RETRY_DELAYS_MS[index];
          if (retryDelay > 0) {
            await wait(retryDelay);
          }

          if (
            cancelled ||
            repairGenerationRef.current !== generation ||
            canonicalWalletRef.current !== targetWallet ||
            dappWalletRef.current === targetWallet
          ) {
            return;
          }

          try {
            await initializeAsync();
          } catch (error) {
            if (index === PROVIDER_REPAIR_RETRY_DELAYS_MS.length - 1) {
              console.warn(
                'VeInvite could not reconcile the VeWorld signing account.',
                error,
              );
            }
          }

          await wait(PROVIDER_REPAIR_SETTLE_MS);
        }
      })();
    }, PROVIDER_MISMATCH_GRACE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(graceTimer);
    };
  }, [
    canonicalWallet,
    connection.isConnectedWithDappKit,
    connection.isLoading,
    dappWallet,
    initializeAsync,
  ]);

  useEffect(() => {
    const repairTarget = repairTargetRef.current;

    if (
      !repairTarget ||
      canonicalWallet !== repairTarget ||
      dappWallet !== repairTarget
    ) {
      return;
    }

    repairTargetRef.current = null;
    void resumeWalletSessionGate(repairTarget);
  }, [canonicalWallet, dappWallet]);

  return null;
}
