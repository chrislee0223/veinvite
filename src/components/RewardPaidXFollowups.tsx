'use client';

import { useEffect, useMemo, useState } from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import { REWARD_X_PROMOTION_COPY } from '@/lib/i18n/rewardXPromotionCopy';
import type { InviteRecord } from '@/lib/types';
import { formatB3trWei } from '@/lib/homeClientHelpers';
import { notifyRewardClaimSessionInvalid } from '@/lib/rewards/rewardClaimClient';
import { RewardXPromotionPanel } from './RewardXPromotionPanel';

const INVITE_CODE = /^[A-HJ-NP-Z2-9]{7}$/u;
const REFRESH_ON_FOCUS_MS = 15_000;

/**
 * Don't use claim age (previously 26h) to hide an ongoing X bonus. A user
 * may post near the 24h deadline and still be waiting for 24h retention,
 * a review or payout preparation. Query only server-owned HELD/RESERVED
 * obligations; inactive/expired offers are hidden by RewardXPromotionPanel.
 *
 * No payout/verification state can be changed from this component.
 */
export function RewardPaidXFollowups({
  invites,
  locale,
  rewardShareUrl,
}: {
  invites: readonly InviteRecord[];
  locale: SupportedLocale;
  rewardShareUrl: string;
}) {
  const [active, setActive] = useState<{
    wallet: string;
    inviteCodes: readonly string[];
  } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  // Invites are already scoped to the wallet-authenticated Home response.
  // A changed wallet invalidates any prior fetch result before rendering.
  const wallet = invites[0]?.inviterAddress.toLowerCase() ?? '';
  const paidInvites = useMemo(() => invites.filter((invite) => {
    if (
      invite.status !== 'COMPLETED' ||
      invite.rewardEligibility !== 'PAID' ||
      !invite.rewardReservedAmountWei ||
      invite.rewardQueueStatus === 'CANCELLED'
    ) return false;
    const amount = invite.rewardClaimAmountWei ?? '';
    return /^[0-9]+$/u.test(amount) && BigInt(amount) > 0n;
  }), [invites]);
  const paidKey = paidInvites.map(invite => invite.code).join('|');

  useEffect(() => {
    if (!wallet || !paidKey || !rewardShareUrl) {
      return;
    }
    let disposed = false;
    let inFlight = false;
    let lastReadAt = 0;

    const load = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      lastReadAt = Date.now();
      try {
        const response = await fetch('/api/rewards/x-promotion/active', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 401 || response.status === 403) {
          notifyRewardClaimSessionInvalid();
          return;
        }
        if (!response.ok) throw new Error('Active X promotion lookup failed.');
        const body = (await response.json()) as { inviteCodes?: unknown };
        if (!Array.isArray(body.inviteCodes)) throw new Error('Malformed active X response.');

        const codes = body.inviteCodes.filter(
          (value): value is string => typeof value === 'string' && INVITE_CODE.test(value),
        );
        if (disposed) return;
        setActive({ wallet, inviteCodes: [...new Set(codes)] });
        setReadFailed(false);
      } catch {
        if (!disposed) setReadFailed(true);
      } finally {
        inFlight = false;
      }
    };

    const refreshOnFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastReadAt < REFRESH_ON_FOCUS_MS) return;
      void load();
    };
    void load();
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [wallet, paidKey, rewardShareUrl, retry]);

  const activeCodes = active?.wallet === wallet
    ? new Set(active.inviteCodes)
    : new Set<string>();
  const recentPaidXBonuses = paidInvites.filter(invite => activeCodes.has(invite.code));

  return (
    <>
      {readFailed && paidInvites.length > 0 ? (
        <button
          type="button"
          onClick={() => setRetry(value => value + 1)}
          style={{ minHeight: 40, padding: '9px 12px', borderRadius: 12 }}
        >
          {REWARD_X_PROMOTION_COPY[locale].title} · {REWARD_X_PROMOTION_COPY[locale].retry}
        </button>
      ) : null}
      {recentPaidXBonuses.map((invite) => (
        <RewardXPromotionPanel
          key={`paid-x-offer:${invite.code}`}
          locale={locale}
          inviteCode={invite.code}
          receiptAmountB3tr={formatB3trWei(invite.rewardClaimAmountWei!)}
          rewardShareUrl={rewardShareUrl}
          bonusOnly
        />
      ))}
    </>
  );
}
