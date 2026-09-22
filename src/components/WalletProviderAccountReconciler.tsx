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
  clearPendingVeWorldWalletHandoff,
  getPendingVeWorldWalletHandoff,
  isWalletAuthenticationInProgress,
  markPendingVeWorldWalletHandoff,
  runWalletProviderReconciliation,
} from '@/lib/walletAuthenticationCoordinator';

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const PROVIDER_MISMATCH_GRACE_MS = 700;
const PROVIDER_HANDOFF_GRACE_MS = 700;
const PROVIDER_REPAIR_SETTLE_MS = 350;
const AUTH_HANDOFF_SETTLE_MS = 1_000;
const VEWORLD_HANDOFF_STABILITY_MS = 10_000;
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
    // stable-provider handoff below owns automatic A -> B switching. VeChainKit
    // direct-wallet account state is derived from DAppKit, so visual agreement
    // is not treated as independent proof of VeWorld's real signing account.
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
    source: dappKitSource,
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
  const sessionHandoffGenerationRef = useRef(0);
  const [authActivityEpoch, setAuthActivityEpoch] =
    useState(0);

  useEffect(() => {
    canonicalWalletRef.current = canonicalWallet;
  }, [canonicalWallet]);

  useEffect(() => {
    dappWalletRef.current = dappWallet;
  }, [dappWallet]);

  useEffect(() => {
    const pending =
      getPendingVeWorldWalletHandoff();

    if (
      pending &&
      canonicalWallet !== pending.walletAddress
    ) {
      clearPendingVeWorldWalletHandoff(
        pending.walletAddress,
      );
    }
  }, [canonicalWallet]);

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
  // as wallet A while the app UI already displays wallet B. VeChainKit's direct
  // wallet account is derived from DAppKit, so B/B at the React layer is not
  // authoritative evidence that VeWorld's signing transport has switched.
  // During an actual stale-session handoff only, mark B for one combined
  // VeWorld v2 connect+typed-data request. Normal first login and same-wallet
  // restores never take this path.
  //
  // If provider alignment changes, the session request fails, or DELETE fails,
  // the existing WalletSessionGate mismatch surface remains the safe fallback.
  useEffect(() => {
    const generation = sessionHandoffGenerationRef.current + 1;
    sessionHandoffGenerationRef.current = generation;

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

    const handoffTimer = window.setTimeout(() => {
      void (async () => {
        try {
          if (
            cancelled ||
            sessionHandoffGenerationRef.current !== generation ||
            canonicalWalletRef.current !== targetWallet ||
            dappWalletRef.current !== targetWallet
          ) {
            return;
          }

          const response = await fetch('/api/auth/session', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
          });

          if (
            cancelled ||
            sessionHandoffGenerationRef.current !== generation ||
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
          // its way to the mismatch fallback. Invalidate and settle it before
          // touching VeWorld's account transport.
          const staleAuthentication =
            cancelActiveWalletAuthentication();

          if (staleAuthentication) {
            await Promise.race([
              staleAuthentication.promise.catch(
                () => undefined,
              ),
              wait(AUTH_HANDOFF_SETTLE_MS),
            ]);
          }

          if (
            cancelled ||
            sessionHandoffGenerationRef.current !== generation
          ) {
            return;
          }

          if (dappKitSource === 'veworld') {
            // Keep the known-good A browser session until B proves ownership.
            // The next auth attempt will consume this marker only after a
            // bounded stability window. Production traces showed VeWorld's
            // visible account can lead its signing transport by several
            // seconds after an external wallet switch; waiting here prevents
            // an avoidable stale-A signature prompt.
            markPendingVeWorldWalletHandoff(
              targetWallet,
              Date.now() + VEWORLD_HANDOFF_STABILITY_MS,
            );
            window.dispatchEvent(
              new Event(WALLET_SESSION_INVALID_EVENT),
            );
            return;
          }

          // Non-VeWorld DAppKit sources keep the previous conservative handoff:
          // retire A, then let WalletSessionGate verify the newly connected
          // wallet through that connector's normal proof path.
          const clearBrowserSession = async () => {
            const clearResponse = await fetch('/api/auth/session', {
              method: 'DELETE',
              cache: 'no-store',
              credentials: 'include',
            });
            return clearResponse.ok;
          };

          if (!(await clearBrowserSession())) {
            return;
          }
          if (!(await clearBrowserSession())) {
            return;
          }

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
    }, PROVIDER_HANDOFF_GRACE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(handoffTimer);
      if (
        sessionHandoffTargetRef.current === targetWallet
      ) {
        sessionHandoffTargetRef.current = null;
      }
    };
  }, [
    canonicalWallet,
    connection.isConnectedWithDappKit,
    connection.isLoading,
    dappKitSource,
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
            await runWalletProviderReconciliation(
              async () => {
                await initializeAsync();
              },
            );
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
