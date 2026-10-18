'use client';

import { useEffect, useState } from 'react';

import { RewardReceiptView } from '@/components/RewardReceiptView';
import type { SupportedLocale } from '@/lib/i18n/locales';
import type { RewardReceipt } from '@/lib/rewards/rewardReceipt';

export function QaRewardXPromotionHarness({
  locale,
  receipt,
}: {
  locale: SupportedLocale;
  receipt: RewardReceipt;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      data-qa-x-promotion-hydrated={
        hydrated ? 'true' : 'false'
      }
    >
      <RewardReceiptView
        locale={locale}
        receipt={receipt}
        loading={false}
        error=""
        rewardShareUrl="https://veinvite.vercel.app/s/AbCdEfGhIjKlMnOp"
      />
    </div>
  );
}
