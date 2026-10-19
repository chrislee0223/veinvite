'use client';

import type { SupportedLocale } from '@/lib/i18n/locales';
import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';

export function QaXPromotionI18nHarness({
  locale,
}: {
  locale: SupportedLocale;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        padding: '16px 12px 40px',
        background: '#0b0b0a',
        color: '#f4efe6',
      }}
      lang={locale}
    >
      <div
        data-qa-x-promotion-shell
        style={{
          width: 'min(400px, calc(100vw - 24px))',
          margin: '0 auto',
          minWidth: 0,
        }}
      >
        <RewardXPromotionPanel
          locale={locale}
          inviteCode="QA-X-PROMO-I18N"
          receiptAmountB3tr="193.91"
          rewardShareUrl="https://veinvite.vercel.app/s/qa-x-promo-i18n"
        />
      </div>
    </main>
  );
}
