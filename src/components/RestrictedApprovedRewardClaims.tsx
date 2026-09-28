'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  PROGRESS_CLAIM_COPY,
} from '@/lib/i18n/progressClaimCopy';
import {
  WALLET_SESSION_COPY,
} from '@/lib/i18n/walletSessionCopy';
import {
  isLocale,
  isRtlLocale,
  type Locale,
} from '@/lib/i18n/locales';
import type {
  RewardActionItem,
  RewardActionResponse,
} from '@/lib/notifications/rewardAction';
import {
  dispatchRewardClaimUpdated,
  notifyRewardClaimSessionInvalid,
} from '@/lib/rewards/rewardClaimClient';

const B3TR_SCALE = 10n ** 18n;

function formatB3trWei(value: string): string {
  if (!/^\d+$/u.test(value)) return '—';

  try {
    const amount = BigInt(value);
    const whole = amount / B3TR_SCALE;
    const fraction = (amount % B3TR_SCALE)
      .toString()
      .padStart(18, '0')
      .slice(0, 4)
      .replace(/0+$/u, '');

    return `${whole.toString()}${fraction ? `.${fraction}` : ''}`;
  } catch {
    return '—';
  }
}

export function RestrictedApprovedRewardClaims({
  locale,
}: {
  locale: Locale;
}) {
  const supportedLocale = isLocale(locale) ? locale : 'en';
  const copy = PROGRESS_CLAIM_COPY[supportedLocale];
  const sessionCopy = WALLET_SESSION_COPY[supportedLocale];
  const [actions, setActions] =
    useState<RewardActionItem[]>([]);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState('');
  const [claimPendingCode, setClaimPendingCode] =
    useState<string | null>(null);

  const loadActions = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/notifications/reward-actions',
        {
          cache: 'no-store',
          credentials: 'include',
        },
      );

      let body: RewardActionResponse;
      try {
        body = (await response.json()) as RewardActionResponse;
      } catch {
        throw new Error('INVALID_REWARD_ACTION_RESPONSE');
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
        }
        throw new Error(
          body.error || 'REWARD_ACTION_LOAD_FAILED',
        );
      }

      setActions(
        Array.isArray(body.actions)
          ? body.actions
          : [],
      );
      setError('');
    } catch (loadError) {
      console.warn(
        'Restricted approved reward actions could not be loaded:',
        loadError,
      );
      setError(copy.claimFailed);
    } finally {
      setResolved(true);
    }
  }, [copy.claimFailed]);

  useEffect(() => {
    void loadActions();

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadActions();
      }
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [loadActions]);

  const claimReward = useCallback(async (
    action: RewardActionItem,
  ) => {
    if (
      claimPendingCode ||
      action.status !== 'AWAITING_CLAIM'
    ) {
      return;
    }

    setClaimPendingCode(action.inviteCode);
    setError('');

    try {
      const response = await fetch('/api/rewards/claims', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          inviteCode: action.inviteCode,
        }),
      });

      let body: {
        claim?: { status?: string };
        error?: string;
      } = {};

      try {
        body = (await response.json()) as typeof body;
      } catch {
        // The durable Claim boundary remains authoritative even if the
        // response body is malformed. A refresh below reconciles state.
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
        }
        throw new Error(
          body.error || 'REWARD_CLAIM_FAILED',
        );
      }

      dispatchRewardClaimUpdated(action.inviteCode);
      await loadActions();
    } catch (claimError) {
      console.warn(
        'Restricted approved reward Claim failed:',
        claimError,
      );
      setError(copy.claimFailed);
      await loadActions();
    } finally {
      setClaimPendingCode(null);
    }
  }, [
    claimPendingCode,
    copy.claimFailed,
    loadActions,
  ]);

  if (
    resolved &&
    actions.length === 0 &&
    !error
  ) {
    return null;
  }

  return (
    <section
      data-veinvite-restricted-approved-rewards="true"
      aria-live="polite"
      dir={isRtlLocale(supportedLocale) ? 'rtl' : 'ltr'}
      style={{
        display: 'grid',
        gap: '10px',
        width: '100%',
        padding: '14px',
        boxSizing: 'border-box',
        border:
          '1px solid rgba(255,210,77,0.2)',
        borderRadius: '16px',
        background:
          'rgba(255,210,77,0.06)',
        textAlign: 'start',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <strong
          style={{
            fontSize: '0.86rem',
          }}
        >
          {copy.rewardsTitle}
        </strong>
        {actions.length > 0 ? (
          <span
            style={{
              opacity: 0.72,
              fontSize: '0.74rem',
              fontWeight: 800,
            }}
          >
            {copy.rewardsCount(actions.length)}
          </span>
        ) : null}
      </div>

      {!resolved ? (
        <span
          aria-busy="true"
          style={{
            opacity: 0.64,
            fontSize: '0.78rem',
          }}
        >
          {copy.finalCheck}
        </span>
      ) : null}

      {actions.map((action) => {
        const waiting =
          action.status === 'AWAITING_CLAIM';
        const pending =
          claimPendingCode === action.inviteCode;
        const amount =
          formatB3trWei(action.reservedAmountWei);

        return (
          <article
            key={action.inviteCode}
            style={{
              display: 'grid',
              gridTemplateColumns:
                'minmax(0,1fr) auto',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
              borderRadius: '13px',
              background:
                'rgba(255,255,255,0.045)',
            }}
          >
            <div
              style={{
                minWidth: 0,
                display: 'grid',
                gap: '3px',
              }}
            >
              <span
                style={{
                  opacity: 0.7,
                  fontSize: '0.72rem',
                }}
              >
                {copy.rewardAvailable}
              </span>
              <strong
                style={{
                  fontSize: '0.98rem',
                }}
              >
                {amount} B3TR
              </strong>
              <small
                dir="ltr"
                style={{
                  opacity: 0.52,
                  fontSize: '0.68rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {action.inviteCode}
              </small>
            </div>

            {waiting ? (
              <button
                type="button"
                disabled={Boolean(claimPendingCode)}
                onClick={() => {
                  void claimReward(action);
                }}
                style={{
                  minHeight: '40px',
                  padding: '0 13px',
                  border: 0,
                  borderRadius: '11px',
                  background:
                    'linear-gradient(135deg, #ffd24d, #efa718)',
                  color: '#17120a',
                  cursor: claimPendingCode
                    ? 'wait'
                    : 'pointer',
                  font: 'inherit',
                  fontSize: '0.75rem',
                  fontWeight: 850,
                  opacity: claimPendingCode
                    ? 0.62
                    : 1,
                }}
              >
                {pending
                  ? copy.claiming
                  : copy.claimReward}
              </button>
            ) : (
              <span
                style={{
                  maxWidth: '120px',
                  textAlign: 'end',
                  opacity: 0.74,
                  fontSize: '0.72rem',
                  fontWeight: 750,
                  lineHeight: 1.35,
                }}
              >
                {action.broadcastConfirmedAt &&
                action.txId
                  ? copy.finalCheck
                  : copy.claimQueued}
              </span>
            )}
          </article>
        );
      })}

      {error ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            fontSize: '0.74rem',
            color: '#ffb0bc',
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              void loadActions();
            }}
            style={{
              flex: '0 0 auto',
              border:
                '1px solid rgba(255,255,255,0.16)',
              borderRadius: '9px',
              padding: '7px 10px',
              background:
                'rgba(255,255,255,0.04)',
              color: '#ffffff',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '0.7rem',
              fontWeight: 750,
            }}
          >
            {sessionCopy.tryAgain}
          </button>
        </div>
      ) : null}
    </section>
  );
}
