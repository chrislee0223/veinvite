'use client';

import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';
import type { SupportedLocale } from '@/lib/i18n/locales';

export function QaRewardXPromotionHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <main
      data-qa-x-promotion-ready="true"
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '16px',
        background: '#080807',
        color: '#fff',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div
        className="qaXPromotionCard"
        style={{
          width: '100%',
          maxWidth: '430px',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '14px',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: '16px',
          background: '#11110f',
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
