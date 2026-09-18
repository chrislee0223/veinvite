'use client';

import {
  useCallback,
  useState,
} from 'react';
import {
  useSignMessage,
  useWallet as useVeChainKitWallet,
} from '@vechain/vechain-kit';
import {
  useWallet as useDappKitWallet,
} from '@vechain/dapp-kit-react';

import {
  cancelActiveWalletAuthentication,
  clearActiveWalletAuthentication,
  createWalletAuthenticationGeneration,
  getActiveWalletAuthentication,
  isWalletAuthenticationGenerationCurrent,
  setActiveWalletAuthentication,
  waitForWalletProviderReconciliation,
} from '@/lib/walletAuthenticationCoordinator';
import {
  reportProductAnalyticsEvent,
} from '@/lib/productAnalytics';
import { USAGE_ANALYTICS_WALLET_AUTH_EVENT } from '@/lib/usageAnalyticsPreference';

const WALLET_PATTERN =
  /^0x[0-9a-fA-F]{40}$/;
const WALLET_SIGNATURE_TIMEOUT_MS = 15_000;
const WALLET_SIGNATURE_SETTLE_MS = 350;
const WALLET_PROVIDER_SETTLE_TIMEOUT_MS = 5_000;
const CANCEL_SETTLE_TIMEOUT_MS = 1_000;
const SESSION_CLEAR_RETRY_DELAYS_MS =
  [0, 180, 420] as const;

type SessionResponse = {
  authenticated?: boolean;
  walletAddress?: string;
  expiresAt?: string;
  error?: string;
};

type ChallengeResponse = {
  walletAddress?: string;
  nonce?: string;
  expiresAt?: string;
  message?: string;
  error?: string;
};

type VerifyResponse = {
  walletAddress?: string;
  expiresAt?: string;
  error?: string;
};

type WalletCertificate = {
  purpose: 'agreement';
  payload: {
    type: 'text';
    content: string;
  };
  domain: string;
  timestamp: number;
  signer: string;
  signature: string;
};

type ClearWalletSessionOptions = {
  confirmedDisconnected?: boolean;
};

function wait(
  milliseconds: number,
): Promise<void> {
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

  const timeout = new Promise<never>(
    (_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error(message)),
        timeoutMs,
      );
    },
  );

  try {
    return await Promise.race([
      promise,
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(
      `VeInvite returned an invalid response (${response.status}).`,
    );
  }
}

function isCancelledAuthentication(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  return (
    error instanceof Error &&
    error.message === 'Wallet verification was cancelled.'
  );
}

export function useWalletAuthentication() {
  const { signMessage } =
    useSignMessage();
  const {
    connection,
    account,
  } = useVeChainKitWallet();
  const {
    account: dappKitAccount,
    requestCertificate,
  } = useDappKitWallet();

  const [
    isAuthenticating,
    setIsAuthenticating,
  ] = useState(false);

  const ensureWalletSession =
    useCallback(
      async (
        rawWalletAddress: string,
      ): Promise<void> => {
        const walletAddress =
          rawWalletAddress
            .trim()
            .toLowerCase();

        if (
          !WALLET_PATTERN.test(
            walletAddress,
          )
        ) {
          throw new Error(
            'Connected wallet address is invalid.',
          );
        }

        // Wallet authentication is browser-global, not hook-instance-local.
        // WalletSessionGate and WalletControl both consume this hook, so a
        // component-local ref can otherwise leave an old signature request
        // alive while another component starts or clears a new wallet flow.
        while (true) {
          const currentAuthentication =
            getActiveWalletAuthentication();

          if (!currentAuthentication) {
            break;
          }

          const currentIsLive =
            isWalletAuthenticationGenerationCurrent(
              currentAuthentication.generation,
            );

          if (
            currentIsLive &&
            currentAuthentication.walletAddress ===
              walletAddress
          ) {
            return currentAuthentication.promise;
          }

          // Invalidate and abort stale fetch work immediately, but keep the
          // browser-global slot occupied until the wallet-owned signing promise
          // settles. VeWorld requestCertificate cannot always be dismissed by
          // AbortController, so this also serializes rapid A -> B -> C switches.
          const staleAuthentication = currentIsLive
            ? cancelActiveWalletAuthentication()
            : currentAuthentication;

          try {
            await staleAuthentication?.promise;
          } catch {
            // The stale wallet proof is intentionally invalidated. Continue
            // only after its wallet-owned signing request has settled.
          }
        }

        const generation =
          createWalletAuthenticationGeneration();
        const controller =
          new AbortController();

        const assertStillCurrent = () => {
          if (
            !isWalletAuthenticationGenerationCurrent(
              generation,
            )
          ) {
            throw new Error(
              'Wallet verification was cancelled.',
            );
          }
        };

        const readCurrentSession = async () => {
          const response = await fetch(
            '/api/auth/session',
            {
              method: 'GET',
              cache: 'no-store',
              credentials: 'include',
              signal: controller.signal,
            },
          );
          const session =
            await readJson<SessionResponse>(response);

          if (!response.ok) {
            throw new Error(
              session.error ||
                'Could not check wallet verification.',
            );
          }

          return session;
        };

        let run!: Promise<void>;

        run = (async () => {
          setIsAuthenticating(true);

          try {
            const session =
              await readCurrentSession();

            assertStillCurrent();

            if (
              session.authenticated &&
              session.walletAddress
                ?.toLowerCase() ===
                walletAddress
            ) {
              return;
            }

            if (session.authenticated) {
              // A provider can momentarily report a different account while
              // VeWorld/WalletConnect is restoring or while locale/UI state is
              // changing. Never destroy the known-good browser session or open
              // a new phone Sign prompt from that transient mismatch. A real
              // wallet switch must go through VeInvite's explicit switch flow,
              // which clears this browser session before connecting the next
              // wallet.
              throw new Error(
                'The connected wallet changed while a verified VeInvite session is active. Use Connect another wallet to switch wallets.',
              );
            }

            const challengeResponse =
              await fetch(
                '/api/auth/challenge',
                {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                  }),
                  signal: controller.signal,
                },
              );

            const challenge =
              await readJson<ChallengeResponse>(
                challengeResponse,
              );

            if (
              !challengeResponse.ok ||
              !challenge.message ||
              !challenge.nonce ||
              !challenge.expiresAt
            ) {
              throw new Error(
                challenge.error ||
                  'Could not create wallet verification.',
              );
            }

            assertStillCurrent();

            let signature: string | undefined;
            let certificate:
              | WalletCertificate
              | undefined;

            // VeWorld/DAppKit signs a VeChain certificate, not an Ethereum
            // personal_sign message. Preserve the certificate annex so the
            // backend can verify it with the VeChain SDK. A reconnect can leave
            // VeChainKit and DAppKit briefly out of sync, so reject a mismatched
            // signer instead of opening a request against stale wallet state.
            if (
              connection.isConnectedWithDappKit
            ) {
              // A VeWorld account restore can still have initializeAsync()
              // running when VeChainKit publishes the new account. Wait for
              // that provider mutation to finish before opening the native
              // certificate prompt; otherwise VeWorld can complete the
              // signature while leaving its confirmation sheet stuck loading.
              await withTimeout(
                waitForWalletProviderReconciliation(),
                WALLET_PROVIDER_SETTLE_TIMEOUT_MS,
                'Wallet connection is still synchronizing. Please try again.',
              );
              assertStillCurrent();

              const signer =
                account?.address
                  ?.trim()
                  .toLowerCase() ||
                walletAddress;
              const dappSigner =
                dappKitAccount
                  ?.trim()
                  .toLowerCase() || null;

              if (
                signer !== walletAddress ||
                dappSigner !== walletAddress
              ) {
                throw new Error(
                  'Wallet connection is still synchronizing. Please disconnect and reconnect the wallet.',
                );
              }

              // Let the newly established provider transport settle before the
              // ownership prompt is opened. VeWorld/VeChainKit can report the
              // account slightly before the signing channel is fully ready.
              await wait(
                WALLET_SIGNATURE_SETTLE_MS,
              );
              assertStillCurrent();

              // Do not time out the native VeWorld certificate prompt here.
              // requestCertificate() owns wallet UI that AbortController cannot
              // reliably dismiss. Releasing VeInvite's auth lock while that
              // sheet is still alive can open a second certificate request and
              // recreate the orphaned spinner race. The user can cancel the
              // wallet sheet explicitly; until it settles, this authentication
              // remains the single browser-global signing flow.
              const certResponse =
                await requestCertificate(
                  {
                    purpose: 'agreement',
                    payload: {
                      type: 'text',
                      content:
                        challenge.message,
                    },
                  },
                  {
                    signer,
                  },
                );

              assertStillCurrent();

              signature =
                certResponse.signature;
              certificate = {
                purpose: 'agreement',
                payload: {
                  type: 'text',
                  content:
                    challenge.message,
                },
                domain:
                  certResponse.annex.domain,
                timestamp:
                  certResponse.annex.timestamp,
                signer:
                  certResponse.annex.signer,
                signature:
                  certResponse.signature,
              };
            } else {
              signature =
                await withTimeout(
                  signMessage(
                    challenge.message,
                  ),
                  WALLET_SIGNATURE_TIMEOUT_MS,
                  'Wallet signature request timed out.',
                );
              assertStillCurrent();
            }

            if (!signature) {
              throw new Error(
                'Wallet verification signature was not returned.',
              );
            }

            assertStillCurrent();

            const verifyResponse =
              await fetch(
                '/api/auth/verify',
                {
                  method: 'POST',
                  credentials: 'include',
                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                  body: JSON.stringify({
                    walletAddress,
                    nonce:
                      challenge.nonce,
                    signature,
                    certificate,
                  }),
                  signal: controller.signal,
                },
              );

            const verified =
              await readJson<VerifyResponse>(
                verifyResponse,
              );

            assertStillCurrent();

            if (
              !verifyResponse.ok ||
              verified.walletAddress
                ?.toLowerCase() !==
                walletAddress
            ) {
              throw new Error(
                verified.error ||
                  'Wallet verification failed.',
              );
            }

            // Do not claim the wallet is verified until the browser actually
            // returns the newly issued persistent cookie. This catches cookie
            // storage problems immediately instead of surprising the user with
            // another phone signature after the next refresh.
            const persistedSession =
              await readCurrentSession();

            assertStillCurrent();

            if (
              !persistedSession.authenticated ||
              persistedSession.walletAddress
                ?.toLowerCase() !==
                walletAddress
            ) {
              throw new Error(
                'The browser did not retain the VeInvite wallet session. Please allow site cookies and try once more.',
              );
            }
          } finally {
            setIsAuthenticating(false);
          }
        })();

        setActiveWalletAuthentication({
          walletAddress,
          promise: run,
          cancel: () => {
            controller.abort();
          },
          generation,
        });

        try {
          await run;
          assertStillCurrent();
          window.dispatchEvent(
            new Event(
              USAGE_ANALYTICS_WALLET_AUTH_EVENT,
            ),
          );
          reportProductAnalyticsEvent({
            eventName: 'wallet_auth_succeeded',
            outcome: 'success',
          });
        } catch (error) {
          if (!isCancelledAuthentication(error)) {
            reportProductAnalyticsEvent({
              eventName: 'wallet_auth_failed',
              outcome: 'failure',
              failureCode: 'wallet_auth',
            });
          }
          throw error;
        } finally {
          clearActiveWalletAuthentication(run);
        }
      },
      [
        account?.address,
        connection.isConnectedWithDappKit,
        dappKitAccount,
        requestCertificate,
        signMessage,
      ],
    );

  const clearWalletSession =
    useCallback(
      async (
        options: ClearWalletSessionOptions = {},
      ) => {
        const connectedWallet =
          account?.address
            ?.trim()
            .toLowerCase() ?? null;

        // Passive provider churn must remain non-destructive. A caller may
        // bypass the live-account requirement only after a visible grace period
        // has confirmed that the wallet really stayed disconnected.
        if (
          !options.confirmedDisconnected &&
          (
            !connectedWallet ||
            !WALLET_PATTERN.test(connectedWallet)
          )
        ) {
          return;
        }

        // This is intentionally browser-global. A disconnect action can be
        // initiated from WalletControl while WalletSessionGate owns the active
        // signature request, and both must cancel the same proof flow.
        const current =
          cancelActiveWalletAuthentication();

        const clearServerSession = async () => {
          let lastError: unknown;

          for (
            let index = 0;
            index < SESSION_CLEAR_RETRY_DELAYS_MS.length;
            index += 1
          ) {
            const delay =
              SESSION_CLEAR_RETRY_DELAYS_MS[index];
            if (delay > 0) {
              await wait(delay);
            }

            try {
              const response = await fetch(
                '/api/auth/session',
                {
                  method: 'DELETE',
                  credentials: 'include',
                },
              );

              if (response.ok) {
                return;
              }

              lastError = new Error(
                `Could not clear wallet verification (${response.status}).`,
              );
            } catch (error) {
              lastError = error;
            }
          }

          throw (
            lastError ??
            new Error(
              'Could not clear wallet verification.',
            )
          );
        };

        let firstClearError: unknown;

        try {
          await clearServerSession();
        } catch (error) {
          firstClearError = error;
        }

        if (current) {
          // Do not let a frozen wallet prompt freeze the disconnect button. Give
          // an already-finishing verification a short bounded window, then
          // clear the cookie once more. This final clear is authoritative and
          // covers a verify request that was already in flight when cancellation
          // started.
          try {
            await Promise.race([
              current.promise.catch(
                () => undefined,
              ),
              wait(
                CANCEL_SETTLE_TIMEOUT_MS,
              ),
            ]);
          } catch {
            // The final session clear below is authoritative.
          }

          await clearServerSession();
        } else if (firstClearError) {
          throw firstClearError;
        }

        // This event means the browser session is now actually gone. Emitting it
        // only after the authoritative server DELETE succeeds keeps the wallet
        // gate, startup bootstrap marker and persistent cookie consistent.
        window.dispatchEvent(
          new Event(
            'veinvite-wallet-session-cleared',
          ),
        );
      },
      [account?.address],
    );

  return {
    ensureWalletSession,
    clearWalletSession,
    isAuthenticating,
  };
}
