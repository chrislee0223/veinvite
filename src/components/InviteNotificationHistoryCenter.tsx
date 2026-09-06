'use client';

import {
  type ComponentProps,
  useEffect,
  useState,
} from 'react';

import {
  InviteNotificationHistoryCenter as UnifiedInviteNotificationHistoryCenter,
} from './UnifiedInviteNotificationHistoryCenter';
import { PROGRESS_CLAIM_COPY } from '@/lib/i18n/progressClaimCopy';
import type {
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';

const REWARD_RESERVATION_READY_EVENT =
  'veinvite-reward-reservation-ready';
const REWARD_CLAIM_UPDATED_EVENT =
  'veinvite-reward-claim-updated';
const WALLET_SESSION_INVALID_EVENT =
  'veinvite-wallet-session-invalid';

type Props = ComponentProps<
  typeof UnifiedInviteNotificationHistoryCenter
>;

export function InviteNotificationHistoryCenter(props: Props) {
  const [needsRewardClaim, setNeedsRewardClaim] = useState(false);

  useEffect(() => {
    let disposed = false;
    let requestVersion = 0;

    const refreshClaimAttention = async () => {
      const requestId = requestVersion + 1;
      requestVersion = requestId;

      try {
        const response = await fetch('/api/notifications/reward-actions', {
          cache: 'no-store',
        });
        const body = (await response.json()) as RewardActionResponse;

        if (disposed || requestId !== requestVersion) return;

        if (response.status === 401) {
          setNeedsRewardClaim(false);
          return;
        }

        if (!response.ok) {
          return;
        }

        setNeedsRewardClaim(
          (body.actions ?? []).some(
            (action) => action.status === 'AWAITING_CLAIM',
          ),
        );
      } catch {
        // Keep the last verified attention state on transient network errors.
      }
    };

    // History identity changes when the active wallet changes, so clear any
    // previous wallet's attention before resolving the new authenticated state.
    setNeedsRewardClaim(false);
    void refreshClaimAttention();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshClaimAttention();
      }
    };
    const onRewardStateChanged = () => {
      void refreshClaimAttention();
    };
    const onWalletSessionInvalid = () => {
      requestVersion += 1;
      setNeedsRewardClaim(false);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(
      REWARD_RESERVATION_READY_EVENT,
      onRewardStateChanged,
    );
    window.addEventListener(
      REWARD_CLAIM_UPDATED_EVENT,
      onRewardStateChanged,
    );
    window.addEventListener(
      WALLET_SESSION_INVALID_EVENT,
      onWalletSessionInvalid,
    );

    return () => {
      disposed = true;
      requestVersion += 1;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(
        REWARD_RESERVATION_READY_EVENT,
        onRewardStateChanged,
      );
      window.removeEventListener(
        REWARD_CLAIM_UPDATED_EVENT,
        onRewardStateChanged,
      );
      window.removeEventListener(
        WALLET_SESSION_INVALID_EVENT,
        onWalletSessionInvalid,
      );
    };
  }, [props.items]);

  const showClaimAttention =
    needsRewardClaim && props.unreadCount < 1;
  const claimAttentionText =
    PROGRESS_CLAIM_COPY[props.locale].rewardAvailable;

  return (
    <div className="notificationRewardAttentionShell">
      <UnifiedInviteNotificationHistoryCenter {...props} />
      {showClaimAttention ? (
        <>
          <span
            className="notificationRewardAttentionDot"
            aria-hidden="true"
          />
          <span
            className="notificationRewardAttentionSrOnly"
            role="status"
          >
            {claimAttentionText}
          </span>
        </>
      ) : null}

      <style jsx>{`
        .notificationRewardAttentionShell{
          position:relative;
          display:flex;
          align-items:center;
        }
        .notificationRewardAttentionDot{
          position:absolute;
          z-index:2;
          top:-3px;
          inset-inline-end:-3px;
          width:9px;
          height:9px;
          box-sizing:border-box;
          border:2px solid #080807;
          border-radius:50%;
          background:#f4b728;
          pointer-events:none;
        }
        .notificationRewardAttentionSrOnly{
          position:absolute;
          width:1px;
          height:1px;
          padding:0;
          margin:-1px;
          overflow:hidden;
          clip:rect(0,0,0,0);
          white-space:nowrap;
          border:0;
        }
      `}</style>
    </div>
  );
}
