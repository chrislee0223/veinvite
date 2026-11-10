'use client';

import { useEffect, useState } from 'react';

import type { RewardActionResponse } from '@/lib/notifications/rewardAction';
import type { ProgressClaimCopy } from '@/lib/i18n/progressClaimCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
import {
  REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
  REWARD_ACTION_IDLE_POLL_MS,
} from '@/lib/notifications/rewardActionPolling';
import { notifyRewardClaimSessionInvalid } from '@/lib/rewards/rewardClaimClient';
import { markEarlyRewardTransferAcknowledged } from '@/lib/rewards/earlyRewardTransferFeedback';
import { RewardXPromotionPanel } from './RewardXPromotionPanel';

const FAST_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;
const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/iu;

/**
 * Read-only canonical transfer feedback. On-chain confirmation is separate
 * from a finalized PAID receipt; this component never advances payout state.
 * Reuse the authenticated X panel for immediate sharing and post submission
 * during finality, without a second duplicated X button implementation.
 */
export function TransferStatus({
  inviteCode,
  wallet,
  copy,
  locale,
  rewardShareUrl,
}: {
  inviteCode: string;
  wallet: string;
  copy: Pick<ProgressClaimCopy, 'claimQueued' | 'transferConfirmed'>;
  locale: SupportedLocale;
  rewardShareUrl: string;
}) {
  const identity = `${wallet.toLowerCase()}:${inviteCode.toUpperCase()}`;
  const [confirmed, setConfirmed] = useState<{
    identity: string;
    txId: string;
    amountWei: string | null;
  } | null>(null);

  useEffect(() => {
    if (!wallet || !inviteCode) return;
    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const scheduleNext = () => {
      if (disposed || timer !== null) return;
      const interval = Date.now() - startedAt < FAST_CONFIRMATION_WINDOW_MS
        ? REWARD_ACTION_PENDING_TRANSFER_POLL_MS
        : REWARD_ACTION_IDLE_POLL_MS;
      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, interval);
    };

    const poll = async () => {
      if (disposed || inFlight) return;
      if (document.visibilityState !== 'visible') {
        scheduleNext();
        return;
      }
      inFlight = true;
      let transferConfirmed = false;
      let terminalAuth = false;
      try {
        const response = await fetch('/api/notifications/reward-actions', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 401 || response.status === 403) {
          terminalAuth = true;
          notifyRewardClaimSessionInvalid();
          return;
        }
        if (!response.ok) return;
        const body = (await response.json()) as RewardActionResponse;
        // Do not adopt another wallet's canonical proof on session switches.
        if (body.walletAddress?.toLowerCase() !== wallet.toLowerCase()) return;
        const action = body.actions?.find(
          candidate => candidate.inviteCode === inviteCode.toUpperCase(),
        );
        transferConfirmed = Boolean(
          action?.status !== 'AWAITING_CLAIM' &&
          action?.broadcastConfirmedAt &&
          action?.txId &&
          TX_ID_PATTERN.test(action.txId),
        );
        if (transferConfirmed && action?.txId && !disposed) {
          // Optional invalid X split must not fabricate an X share amount.
          // The already proven transfer remains visible without that offer.
          const amount = action?.claimAmountWei;
          const verifiedAmount = amount && /^[0-9]+$/u.test(amount) &&
            BigInt(amount) > 0n ? amount : null;
          setConfirmed({
            identity,
            txId: action.txId.toLowerCase(),
            amountWei: verifiedAmount,
          });
        }
      } catch {
        // Client status reads must never authorize or mutate a payout.
      } finally {
        inFlight = false;
        if (!transferConfirmed && !terminalAuth) scheduleNext();
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      void poll();
    };

    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [identity, inviteCode, wallet]);

  const proof = confirmed?.identity === identity ? confirmed : null;

  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0, width: '100%' }}>
      <span className="processingBadge" role="status" aria-live="polite">
        {proof
          ? `✓ B3TR · ${copy.transferConfirmed}`
          : copy.claimQueued}
      </span>
      {proof?.amountWei && rewardShareUrl ? (
        <RewardXPromotionPanel
          key={identity}
          locale={locale}
          inviteCode={inviteCode}
          receiptAmountB3tr={formatWeiAsB3tr(proof.amountWei, 18)}
          rewardShareUrl={rewardShareUrl}
          bonusOnly
          onRewardShare={intentUrl => {
            // X share click is an acknowledgment, not proof of publication.
            markEarlyRewardTransferAcknowledged(wallet, inviteCode, proof.txId);
            window.open(intentUrl, '_blank', 'noopener,noreferrer');
          }}
        />
      ) : null}
    </div>
  );
}
