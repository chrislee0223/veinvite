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
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '24px',
        background: '#080807',
        color: '#fff',
      }}
    >
      <div
        data-qa-x-promotion-shell
        style={{
          width: 'min(400px, calc(100vw - 28px))',
          boxSizing: 'border-box',
          margin: '0 auto',
          padding: '16px',
          border: '1px solid rgba(255,205,80,.18)',
          borderRadius: '18px',
          background: '#11110f',
        }}
      >
        <RewardXPromotionPanel
          locale={locale}
          inviteCode="QA-X-PROMO-1"
          receiptAmountB3tr="262.97"
          rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promotion-preview"
        />
      </div>
    </main>
  );
}
