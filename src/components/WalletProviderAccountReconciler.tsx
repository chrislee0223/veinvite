'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

import {
  WALLET_AUTH_ACTIVITY_EVENT,
  cancelActiveWalletAuthentication,
  isWalletAuthenticationInProgress,
} from '@/lib/walletAuthenticationCoordinator';

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

    // Provider repair itself never destroys a valid A session. The separate
    // stable-provider handoff below owns automatic A -> B switching once both
    // VeChainKit and DAppKit independently agree on B. If they do not agree,
    // WalletSessionGate keeps the existing explicit mismatch fallback.
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
    // available if the session check itself is temporarily unavailable.
  }
}

/**
 * VeChainKit is VeInvite's canonical account source, while VeWorld certificate
 * signing is performed by DAppKit. Switching accounts inside VeWorld while the
 * app is closed can restore those two provider layers at slightly different
 * times. If that mismatch persists beyond the normal settle window, repair the
 * DAppKit layer in place instead of forcing the user into a disconnect loop.
 *
 * Provider repair and ownership signing are deliberately serialized. Calling
 * initializeAsync while requestCertificate owns the VeWorld signing transport
 * can leave the wallet UI spinner orphaned even after the certificate reached
 * VeInvite successfully.
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
  const sessionHandoffTargetRef = useRef<string | null>(null);
  const [authActivityEpoch, setAuthActivityEpoch] =
    useState(0);

  useEffect(() => {
    canonicalWalletRef.current = canonicalWallet;
  }, [canonicalWallet]);

  useEffect(() => {
    dappWalletRef.current = dappWallet;
  }, [dappWallet]);

  useEffect(() => {
    const handleAuthActivity = () => {
      setAuthActivityEpoch((current) => current + 1);
    };

    window.addEventListener(
      WALLET_AUTH_ACTIVITY_EVENT,
      handleAuthActivity,
    );

    return () => {
      window.removeEventListener(
        WALLET_AUTH_ACTIVITY_EVENT,
        handleAuthActivity,
      );
    };
  }, []);

  // A real external VeWorld account change can leave the browser authenticated
  // as wallet A while BOTH provider layers already agree that wallet B is now
  // active. That is stronger evidence than a one-layer provider wobble. In this
  // exact state, retire only this browser's old A session and immediately re-arm
  // WalletSessionGate for B. This keeps the brand surface continuous and avoids
  // routing a normal VeWorld switch through the generic mismatch screen.
  //
  // If provider alignment changes, the session request fails, or DELETE fails,
  // do nothing destructive beyond cancelling a stale in-flight proof. The
  // existing WalletSessionGate mismatch surface remains the fallback.
  useEffect(() => {
    if (
      !connection.isConnectedWithDappKit ||
      connection.isLoading ||
      !canonicalWallet ||
      dappWallet !== canonicalWallet ||
      sessionHandoffTargetRef.current === canonicalWallet
    ) {
      return;
    }

    let cancelled = false;
    const targetWallet = canonicalWallet;
    sessionHandoffTargetRef.current = targetWallet;

    void (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        });

        if (
          cancelled ||
          canonicalWalletRef.current !== targetWallet ||
          dappWalletRef.current !== targetWallet ||
          !response.ok
        ) {
          return;
        }

        const session = (await response.json()) as SessionResponse;
        const sessionWallet = normalizeWallet(session.walletAddress);

        if (
          session.authenticated !== true ||
          !sessionWallet ||
          sessionWallet === targetWallet
        ) {
          return;
        }

        // The old verification attempt may already have observed A and be on
        // its way to the 600ms mismatch fallback. Invalidate that proof before
        // revoking A so its delayed error cannot flash over the brand surface.
        cancelActiveWalletAuthentication();

        const clearResponse = await fetch('/api/auth/session', {
          method: 'DELETE',
          cache: 'no-store',
          credentials: 'include',
        });

        if (!clearResponse.ok) {
          return;
        }

        // Even if the user moved again while DELETE was in flight, the old A
        // browser session is now gone and the gate must re-read the CURRENT
        // provider wallet rather than preserving stale A state.
        window.dispatchEvent(
          new Event(WALLET_SESSION_INVALID_EVENT),
        );
      } catch (error) {
        console.warn(
          'VeInvite could not hand off the stale browser session to the current VeWorld wallet.',
          error,
        );
      } finally {
        if (
          sessionHandoffTargetRef.current === targetWallet
        ) {
          sessionHandoffTargetRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canonicalWallet,
    connection.isConnectedWithDappKit,
    connection.isLoading,
    dappWallet,
  ]);

  useEffect(() => {
    const generation = repairGenerationRef.current + 1;
    repairGenerationRef.current = generation;

    if (
      isWalletAuthenticationInProgress() ||
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
          isWalletAuthenticationInProgress() ||
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
            isWalletAuthenticationInProgress() ||
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
    authActivityEpoch,
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
