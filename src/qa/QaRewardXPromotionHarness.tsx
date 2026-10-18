'use client';

import type { SupportedLocale } from '@/lib/i18n/locales';
import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';

export function QaRewardXPromotionHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <main
      data-qa-x-promotion-root
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '16px 12px',
        background: '#080807',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '430px',
          margin: '0 auto',
          minWidth: 0,
        }}
      >
        <RewardXPromotionPanel
          locale={locale}
          inviteCode="QA-X-PROMOTION"
          receiptAmountB3tr="262.97"
          rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promotion"
          onRewardShare={() => {}}
        />
      </div>
    </main>
  );
}
