'use client';

import { useMemo } from 'react';

import type { SupportedLocale } from '@/lib/i18n/locales';
import type { InviteRecord } from '@/lib/types';
import { formatB3trWei } from '@/lib/homeClientHelpers';
import { RewardXPromotionPanel } from './RewardXPromotionPanel';

/**
 * A canonical X bonus can open well before final PAID settlement.
 * Keep an eligible offer on Home through its server-defined 24h window.
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
  const recentPaidXBonuses = useMemo(() => {
    const now = Date.now();
    const earliest = now - 26 * 60 * 60 * 1000;
    return invites
      .filter((invite) => {
        if (
          invite.status !== 'COMPLETED' ||
          invite.rewardEligibility !== 'PAID' ||
          !invite.rewardReservedAmountWei ||
          invite.rewardQueueStatus === 'CANCELLED'
        ) return false;
        const requestedAt = Date.parse(invite.rewardClaimRequestedAt ?? '');
        const amount = invite.rewardClaimAmountWei ?? '';
        return Number.isFinite(requestedAt) &&
          requestedAt >= earliest && requestedAt <= now &&
          /^[0-9]+$/u.test(amount) && BigInt(amount) > 0n;
      })
      .sort((left, right) =>
        Date.parse(right.rewardClaimRequestedAt ?? '') -
        Date.parse(left.rewardClaimRequestedAt ?? ''),
      )
      .slice(0, 4);
  }, [invites]);

  return (
    <>
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
