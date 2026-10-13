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
  const startupRetryAttemptsRef = useRef(0);
  const startupRetryAllowedRef = useRef(true);
  useEffect(() => {
    startupRetryAttemptsRef.current = 0;
    startupRetryAllowedRef.current = true;
  }, [wallet]);

  const load = useCallback(async (quiet = false) => {
    if (!wallet) return;
    const requestWallet = wallet;

    // The authorization failure latch is only rearmed when the wallet changes.
    // A transient automatic retry must never undo a 401/403/429 decision.

    try {
      const [inviteResult, linkResult] = await Promise.allSettled([
        fetch(
          `/api/invites?inviter=${encodeURIComponent(requestWallet)}`,
          { cache: 'no-store' },
        ),
        fetch('/api/referral-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviterAddress: requestWallet }),
        }),
      ]);

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

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
          if (!sameWallet(activeWalletRef.current, requestWallet)) return;
          setInvites(inviteData.invites ?? []);
          setInvitesReady(true);
          setInvitesFailed(false);
        } catch (error) {
          if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
            setInvitesReady(false);
            setInvitesFailed(true);
            showFeedback(
              'error',
              error instanceof Error ? error.message : t.loadError,
            );
          }
        }
      }

      if (!sameWallet(activeWalletRef.current, requestWallet)) return;

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
        if (!sameWallet(activeWalletRef.current, requestWallet)) return;

        setReferralLink(linkData.referralLink);
        setReferralLinkVerified(true);
        setReferralLinkFailed(false);
        writeCachedReferralLink(requestWallet, linkData.referralLink);
      } catch (error) {
        if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
          setReferralLinkVerified(false);
          setReferralLinkFailed(true);
          showFeedback(
            'error',
            error instanceof Error ? error.message : t.createError,
          );
        }
      }
    } catch (error) {
      if (!quiet && sameWallet(activeWalletRef.current, requestWallet)) {
        setInvitesReady(false);
        setInvitesFailed(true);
        setReferralLinkVerified(false);
        setReferralLinkFailed(true);
        showFeedback(
          'error',
          error instanceof Error ? error.message : t.genericError,
        );
      }
    }
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
