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
  runWalletProviderReconciliation,
} from '@/lib/walletAuthenticationCoordinator';

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const PROVIDER_MISMATCH_GRACE_MS = 700;
const PROVIDER_HANDOFF_GRACE_MS = 700;
const PROVIDER_REPAIR_SETTLE_MS = 350;
const AUTH_HANDOFF_SETTLE_MS = 1_000;
const VEWORLD_REBIND_TIMEOUT_MS = 5_000;
const VEWORLD_REBIND_SETTLE_MS = 250;
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
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
    connectV2,
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
  // During an actual stale-session handoff only, re-run VeWorld v2 account
  // binding with connectV2(null) before retiring A or opening B's ownership
  // signature. Normal first login and same-wallet restores never take this path.
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

          // DAppKit initializeAsync() cannot authoritatively read VeWorld's
          // current v2 signer; it may reuse the persisted account. An explicit
          // v2 account bind uses eth_requestAccounts underneath and returns the
          // signer VeWorld currently exposes. This runs only for a confirmed
          // A-session -> B-UI handoff, not on ordinary ownership checks.
          if (dappKitSource === 'veworld') {
            const rebound =
              await withTimeout(
                runWalletProviderReconciliation(
                  async () =>
                    connectV2(null),
                ),
                VEWORLD_REBIND_TIMEOUT_MS,
                'VeWorld account synchronization timed out.',
              );

            const reboundWallet =
              normalizeWallet(rebound.signer);

            if (
              reboundWallet !== targetWallet
            ) {
              console.info(
                'VeInvite deferred wallet-session handoff because VeWorld still exposed a different active signer.',
              );
              return;
            }

            await wait(VEWORLD_REBIND_SETTLE_MS);

            if (
              cancelled ||
              sessionHandoffGenerationRef.current !== generation ||
              canonicalWalletRef.current !== targetWallet ||
              dappWalletRef.current !== targetWallet
            ) {
              return;
            }
          }

          const clearBrowserSession = async () => {
            const clearResponse = await fetch('/api/auth/session', {
              method: 'DELETE',
              cache: 'no-store',
              credentials: 'include',
            });
            return clearResponse.ok;
          };

          // Only now retire the known-good A session. A second delete keeps the
          // handoff race-safe if an old fetch crossed cancellation just before
          // its promise settled.
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
    connectV2,
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
