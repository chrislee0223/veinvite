'use client';

import {
  useCallback,
  useEffect,
  useRef,
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
import {
  buildWalletAuthTypedData,
} from '@/lib/walletAuthTypedData';
import { USAGE_ANALYTICS_WALLET_AUTH_EVENT } from '@/lib/usageAnalyticsPreference';

const WALLET_PATTERN =
  /^0x[0-9a-fA-F]{40}$/;
const WALLET_SIGNATURE_TIMEOUT_MS = 15_000;
const WALLET_SIGNATURE_SETTLE_MS = 350;
const WALLET_PROVIDER_SETTLE_TIMEOUT_MS = 5_000;
const DAPP_KIT_SOURCE_SETTLE_DELAYS_MS =
  [120, 240, 480, 750] as const;
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
  origin?: string;
  network?: string;
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
    source: dappKitSource,
    requestTypedData,
    requestCertificate,
  } = useDappKitWallet();

  const dappKitSourceRef =
    useRef(dappKitSource);

  useEffect(() => {
    dappKitSourceRef.current =
      dappKitSource;
  }, [dappKitSource]);

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
            let proofType:
              | 'typed_data'
              | 'certificate'
              | 'message'
              | undefined;

            if (
              connection.isConnectedWithDappKit
            ) {
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

              await wait(
                WALLET_SIGNATURE_SETTLE_MS,
              );
              assertStillCurrent();

              const signCertificateFallback =
                async () => {
                  const certResponse =
                    await requestCertificate(
                      {
                        purpose:
                          'agreement',
                        payload: {
                          type:
                            'text',
                          content:
                            challenge.message!,
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
                    purpose:
                      'agreement',
                    payload: {
                      type:
                        'text',
                      content:
                        challenge.message!,
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
                  proofType =
                    'certificate';
                };

              let settledDappKitSource =
                dappKitSourceRef.current;

              if (!settledDappKitSource) {
                for (
                  const delayMs of
                  DAPP_KIT_SOURCE_SETTLE_DELAYS_MS
                ) {
                  await wait(delayMs);
                  assertStillCurrent();

                  settledDappKitSource =
                    dappKitSourceRef.current;

                  if (settledDappKitSource) {
                    break;
                  }
                }
              }

              // During a VeWorld account switch DAppKit can briefly publish
              // the account before its source. Never reopen the legacy
              // certificate flow just because that source snapshot is late.
              if (!settledDappKitSource) {
                throw new Error(
                  'Wallet connection is still synchronizing. Please try again.',
                );
              }

              const shouldUseVeWorldTypedData =
                settledDappKitSource ===
                  'veworld' &&
                Boolean(
                  challenge.origin &&
                    challenge.network,
                );

              if (shouldUseVeWorldTypedData) {
                const typedData =
                  buildWalletAuthTypedData({
                    walletAddress,
                    nonce:
                      challenge.nonce,
                    expiresAt:
                      challenge.expiresAt,
                    origin:
                      challenge.origin!,
                    network:
                      challenge.network!,
                    message:
                      challenge.message,
                  });

                // The wallet is already connected at this point. Calling
                // connectV2() again re-enters VeWorld's connection/login flow
                // and can show a second login screen even though the first
                // connection succeeded. Request only the EIP-712 signature
                // from the established signer instead.
                signature =
                  await requestTypedData(
                    typedData.domain,
                    typedData.types,
                    typedData.value,
                    {
                      signer,
                    },
                  );

                assertStillCurrent();
                proofType =
                  'typed_data';
              } else {
                await signCertificateFallback();
              }
            } else {
              signature =
                await withTimeout(
                  signMessage(
                    challenge.message,
                  ),
                  WALLET_SIGNATURE_TIMEOUT_MS,
                  'Wallet signature request timed out.',
                );
              proofType =
                'message';
              assertStillCurrent();
            }

            if (
              !signature ||
              !proofType
            ) {
              throw new Error(
                'Wallet verification proof was not returned.',
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
                    proofType,
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
        dappKitSource,
        requestTypedData,
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
