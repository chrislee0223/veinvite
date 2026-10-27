'use client';

import { useEffect, useState } from 'react';

import type {
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import type { ProgressClaimCopy } from '@/lib/i18n/progressClaimCopy';
import type { SupportedLocale } from '@/lib/i18n/locales';
import { REWARD_X_PROMOTION_AUTO_COPY } from '@/lib/i18n/rewardXPromotionAutoCopy';
import {
  rewardReceiptShareLabel,
  rewardReceiptXIntentUrl,
  rewardXPromotionShareUrl,
} from '@/lib/rewards/rewardReceiptShare';
import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';
import {
  REWARD_ACTION_PENDING_TRANSFER_POLL_MS,
  REWARD_ACTION_IDLE_POLL_MS,
} from '@/lib/notifications/rewardActionPolling';
import {
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';

const FAST_CONFIRMATION_WINDOW_MS = 2 * 60 * 1000;
const TX_ID_PATTERN = /^0x[0-9a-f]{64}$/iu;

/**
 * Read-only early feedback for an already-claimed B3TR transfer.
 * Only the server's manifest-verified canonical broadcast marker is trusted.
 * This never creates a PAID receipt, advances a payout, or opens X sharing.
 */
export function TransferStatus({
  inviteCode,
  wallet,
  copy,
  locale,
  rewardShareUrl,
  amountWei,
}: {
  inviteCode: string;
  wallet: string;
  copy: Pick<ProgressClaimCopy, 'claimQueued' | 'finalCheck'>;
  locale: SupportedLocale;
  rewardShareUrl: string;
  amountWei: string | null;
}) {
  const identity = `${wallet.toLowerCase()}:${inviteCode.toUpperCase()}`;
  const [confirmedIdentity, setConfirmedIdentity] = useState<string | null>(null);
  const [earlyX, setEarlyX] = useState<{
    intentUrl: string | null;
    deadline: number;
    bonus: string;
    connectX: boolean;
  } | null>(null);

  useEffect(() => {
    if (!wallet || !inviteCode) return;

    let disposed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const scheduleNext = () => {
      if (disposed || timer !== null) return;

      // Poll only briefly at 5s while a freshly claimed transfer appears on
      // chain; fall back to the existing 60s cadence to limit DB/API costs.
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
      let confirmed = false;
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

        if (response.ok) {
          const body = (await response.json()) as RewardActionResponse;

          // Responses from a previous wallet session must never mark a new
          // wallet's payment as confirmed after a rapid wallet switch.
          if (body.walletAddress?.toLowerCase() !== wallet.toLowerCase()) {
            return;
          }

          const action = body.actions?.find(
            (candidate) => candidate.inviteCode === inviteCode.toUpperCase(),
          );
          confirmed = Boolean(
            action?.status !== 'AWAITING_CLAIM' &&
            action?.broadcastConfirmedAt &&
            action?.txId &&
            TX_ID_PATTERN.test(action.txId),
          );

          if (confirmed && !disposed) {
            setConfirmedIdentity(identity);
          }
        }
      } catch {
        // Temporary read failures must never affect transfer authorization.
      } finally {
        inFlight = false;
        if (!confirmed && !terminalAuth) scheduleNext();
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

  const confirmed = confirmedIdentity === identity;

  // Persist the bonus action in the processing row. If the user closes the
  // popup, switches tabs or completes X OAuth, the verified opportunity is
  // still accessible before base payout finality. No payout mutation here.
  useEffect(() => {
    if (!confirmed || !rewardShareUrl || !wallet) {
      setEarlyX(null);
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const end = Date.now() + 2 * 60_000;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/rewards/x-promotion?inviteCode=${encodeURIComponent(inviteCode)}`,
          { cache: 'no-store', credentials: 'include', signal: AbortSignal.timeout(8_000) },
        );
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
          return;
        }
        if (!response.ok || disposed) return;
        const data = await response.json() as {
          promotion?: {
            state?: string;
            shareToken?: string | null;
            postDeadlineAt?: string;
            amountB3tr?: string;
          } | null;
          xUrlLessEnabled?: boolean;
          xConnected?: boolean;
          xConnectAvailable?: boolean;
        };
        const offer = data.promotion;
        if (!offer || offer.state !== 'OPEN' ||
            !offer.shareToken || !offer.amountB3tr || !offer.postDeadlineAt ||
            Date.now() >= Date.parse(offer.postDeadlineAt) || disposed) return;
        const deadline = Date.parse(offer.postDeadlineAt);
        if (data.xUrlLessEnabled && !data.xConnected) {
          if (data.xConnectAvailable) {
            setEarlyX({ intentUrl: null, deadline, bonus: offer.amountB3tr, connectX: true });
          }
          return;
        }
        const bonusUrl = rewardXPromotionShareUrl({
          referralUrl: rewardShareUrl,
          shareToken: offer.shareToken,
        });
        const amount = amountWei && /^[0-9]+$/u.test(amountWei) &&
          BigInt(amountWei) > 0n ? formatWeiAsB3tr(amountWei, 18) : null;
        const intentUrl = bonusUrl && amount
          ? rewardReceiptXIntentUrl({
              locale,
              amountB3tr: amount,
              referralUrl: bonusUrl,
            })
          : null;
        if (!intentUrl) return;
        setEarlyX({ intentUrl, deadline, bonus: offer.amountB3tr, connectX: false });
      } catch {
        // UI enhancement may fail; the canonical transfer stays verified.
      } finally {
        if (!disposed && Date.now() < end) timer = setTimeout(() => void load(), 5_000);
      }
    };
    void load();
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [confirmed, identity, inviteCode, locale, amountWei, rewardShareUrl, wallet]);

  const bonusVisible = Boolean(
    confirmed && earlyX && Date.now() < earlyX.deadline &&
    (earlyX.intentUrl || earlyX.connectX)
  );

  return (
    <div style={{ display: 'grid', justifyItems: 'end', gap: 6, minWidth: 0 }}>
      <span className="processingBadge" role="status" aria-live="polite">
        {confirmed
          ? `✓ B3TR · ${copy.finalCheck}`
          : copy.claimQueued}
      </span>
      {bonusVisible ? (
        <button
          type="button"
          onClick={() => {
            if (!earlyX || Date.now() >= earlyX.deadline) return;
            if (earlyX.connectX) {
              window.location.assign(
                `/api/rewards/x-promotion/x-connect/start?inviteCode=${encodeURIComponent(inviteCode)}`,
              );
            } else if (earlyX.intentUrl) {
              window.open(earlyX.intentUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          style={{
            border: '1px solid rgba(255,205,80,.4)',
            borderRadius: 8,
            background: 'rgba(255,205,80,.12)',
            padding: '7px 9px',
            color: '#f1cf65',
            font: 'inherit',
            fontSize: '.69rem',
            fontWeight: 850,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          }}
        >
          {earlyX?.connectX
            ? REWARD_X_PROMOTION_AUTO_COPY[locale].connectX
            : `${rewardReceiptShareLabel(locale)} · +${earlyX?.bonus} B3TR`}
        </button>
      ) : null}
    </div>
  );
}
