'use client';

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { InviteRecord } from '@/lib/types';
import type { ReferralLinkRecord } from '@/lib/referralLinks';
import type { TransientFeedbackKind } from '@/components/TransientSnackbar';
import { sameWallet, writeCachedReferralLink } from '@/lib/homeClientHelpers';

type SetState<T> = Dispatch<SetStateAction<T>>;

// Keep network retries out of HomeClient's rendering/claim logic. This hook
// never changes verification, restriction, wallet identity or settlement.
export function useHomeStartupLoader({
  wallet, copy: t, activeWalletRef,
  setInvites, setInvitesReady, setInvitesFailed,
  setReferralLink, setReferralLinkVerified, setReferralLinkFailed,
  invitesReady, referralLinkVerified, invitesFailed, referralLinkFailed,
  showFeedback,
}: {
  wallet: string | null;
  copy: { loadError: string; createError: string; genericError: string };
  activeWalletRef: MutableRefObject<string | null>;
  setInvites: SetState<InviteRecord[]>;
  setInvitesReady: SetState<boolean>;
  setInvitesFailed: SetState<boolean>;
  setReferralLink: SetState<ReferralLinkRecord | null>;
  setReferralLinkVerified: SetState<boolean>;
  setReferralLinkFailed: SetState<boolean>;
  invitesReady: boolean;
  referralLinkVerified: boolean;
  invitesFailed: boolean;
  referralLinkFailed: boolean;
  showFeedback: (kind: TransientFeedbackKind, message: string) => void;
}) {
  const requestGenerationRef = useRef(0);
  const activeRequestRef = useRef<number | null>(null);
  const deferredQuietRefreshRef = useRef(false);
  // Silent polling cannot supersede the wallet's authoritative first read.
  const homeReadyRef = useRef(invitesReady && referralLinkVerified);
  homeReadyRef.current = invitesReady && referralLinkVerified;
  const startupRetryAttemptsRef = useRef(0);
  const startupRetryAllowedRef = useRef(true);
  useEffect(() => {
    startupRetryAttemptsRef.current = 0;
    startupRetryAllowedRef.current = true;
  }, [wallet]);

  const load = useCallback(async (quiet = false, manualRetry = false): Promise<boolean> => {
    if (!wallet) return false;
    if (quiet && !homeReadyRef.current) return false;
    if (quiet && activeRequestRef.current !== null) {
      // One queued refresh covers all overlapping polls and claim updates.
      deferredQuietRefreshRef.current = true;
      return false;
    }
    const requestWallet = wallet;
    // Concurrent Home refreshes can resolve out of order. The newest
    // request alone may publish state for this wallet.
    const requestGeneration = ++requestGenerationRef.current;
    activeRequestRef.current = requestGeneration;
    let invitesSucceeded = false;
    let linkSucceeded = false;
    const isCurrentRequest = () =>
      sameWallet(activeWalletRef.current, requestWallet) &&
      requestGenerationRef.current === requestGeneration;

    if (manualRetry) {
      // User-initiated recovery gets a fresh bounded retry budget. Automatic
      // retries still never override 401/403/429 authorization decisions.
      startupRetryAttemptsRef.current = 0;
      startupRetryAllowedRef.current = true;
      setInvitesFailed(false);
      setReferralLinkFailed(false);
    }

    // The authorization failure latch is only rearmed when the wallet changes.
    // A transient automatic retry must never undo a 401/403/429 decision.

    try {
      // A stalled Supabase request must settle before the global 18-second
      // Home startup watchdog expires. Both reads are recoverable and the
      // permanent referral-link ensure endpoint is idempotent.
      const startupRequestSignal = AbortSignal.timeout(10_000);
      const [inviteResult, linkResult] = await Promise.allSettled([
        fetch(
          `/api/invites?inviter=${encodeURIComponent(requestWallet)}`,
          { cache: 'no-store', signal: startupRequestSignal },
        ),
        fetch('/api/referral-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: requestWallet }),
          signal: startupRequestSignal,
        }),
      ]);

      if (!isCurrentRequest()) return false;

      if (inviteResult.status === 'rejected') {
        if (!quiet) {
          setInvitesReady(false);
          setInvitesFailed(true);
          showFeedback('error', t.loadError);
        }
      } else {
        try {
          const inviteResponse = inviteResult.value;
          const inviteData = (await inviteResponse.json()) as {
            invites?: InviteRecord[];
            error?: string;
          };
          if (!inviteResponse.ok) {
            if (inviteResponse.status < 500) {
              startupRetryAllowedRef.current = false;
            }
            throw new Error(inviteData.error ?? t.loadError);
          }
          if (!isCurrentRequest()) return false;
          setInvites(inviteData.invites ?? []);
          setInvitesReady(true);
          setInvitesFailed(false);
          invitesSucceeded = true;
        } catch (error) {
          if (!quiet && isCurrentRequest()) {
            setInvitesReady(false);
            setInvitesFailed(true);
            showFeedback(
              'error',
              error instanceof Error ? error.message : t.loadError,
            );
          }
        }
      }

      if (!isCurrentRequest()) return false;

      if (linkResult.status === 'rejected') {
        if (!quiet) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback('error', t.createError);
        }
        return;
      }

      try {
        const linkResponse = linkResult.value;
        const linkData = (await linkResponse.json()) as {
          referralLink?: ReferralLinkRecord | null;
          error?: string;
        };
        if (!linkResponse.ok || !linkData.referralLink) {
          if (linkResponse.status < 500) {
            startupRetryAllowedRef.current = false;
          }
          throw new Error(linkData.error ?? t.createError);
        }
        if (!isCurrentRequest()) return false;

        setReferralLink(linkData.referralLink);
        setReferralLinkVerified(true);
        setReferralLinkFailed(false);
        writeCachedReferralLink(requestWallet, linkData.referralLink);
        linkSucceeded = true;
      } catch (error) {
        if (!quiet && isCurrentRequest()) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback(
            'error',
            error instanceof Error ? error.message : t.createError,
          );
        }
      }
    } catch (error) {
      if (!quiet && isCurrentRequest()) {
        setInvitesReady(false);
        setInvitesFailed(true);
        setReferralLinkVerified(false);
        setReferralLinkFailed(true);
        showFeedback(
          'error',
          error instanceof Error ? error.message : t.genericError,
        );
      }
    } finally {
      if (activeRequestRef.current === requestGeneration) {
        activeRequestRef.current = null;
        if (deferredQuietRefreshRef.current) {
          deferredQuietRefreshRef.current = false;
          if (homeReadyRef.current && sameWallet(activeWalletRef.current, requestWallet)) {
            // Schedule after the current Promise settles. All background
            // callers coalesce into one wallet-scoped recovery read.
            window.setTimeout(() => {
              if (sameWallet(activeWalletRef.current, requestWallet)) {
                window.dispatchEvent(new Event('veinvite-home-data-refresh-requested'));
              }
            }, 0);
          }
        }
      }
    }
    return invitesSucceeded && linkSucceeded && isCurrentRequest();
  }, [wallet, t.loadError, t.createError, t.genericError, showFeedback]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!wallet) return;
    if (invitesReady && referralLinkVerified) {
      startupRetryAttemptsRef.current = 0;
      return;
    }
    if (
      (!invitesFailed && !referralLinkFailed) ||
      !startupRetryAllowedRef.current ||
      startupRetryAttemptsRef.current >= 3
    ) {
      return;
    }

    // A cold database read or brief transport failure must not strand Home
    // behind a full-page Retry. Preserve both server-side ownership gates.
    // The POST endpoint is an idempotent "ensure" (existing permanent link
    // is returned rather than creating a new one).
    const retryDelays = [650, 1500, 3000] as const;
    const retryDelay = retryDelays[startupRetryAttemptsRef.current];
    const timer = window.setTimeout(() => {
      startupRetryAttemptsRef.current += 1;
      // Re-publish loading while the next attempt is in flight; only terminal
      // errors or exhausted retries may return the startup failure surface.
      setInvitesFailed(false);
      setReferralLinkFailed(false);
      void load();
    }, retryDelay);

    return () => window.clearTimeout(timer);
  }, [
    wallet, invitesReady, referralLinkVerified, invitesFailed,
    referralLinkFailed, load,
  ]);

  return load;
}
