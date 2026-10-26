import { notFound } from 'next/navigation';

import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';
import { isLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

export default async function XPromotionLayoutQaPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;
  if (locale && !isLocale(locale)) {
    notFound();
  }

  const resolvedLocale = isLocale(locale) ? locale : 'en';

  return (
    <main
      data-qa-x-promotion-layout
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '10px',
        background: '#080807',
        color: '#fff',
      }}
    >
      <div
        style={{
          width: 'min(400px, calc(100vw - 20px))',
          margin: '0 auto',
          padding: '14px',
          boxSizing: 'border-box',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: '18px',
          background: '#11110f',
        }}
      >
        <RewardXPromotionPanel
          locale={resolvedLocale}
          inviteCode="QA-X-PROMO-LAYOUT"
          receiptAmountB3tr="262.97"
          rewardShareUrl="https://veinvite.vercel.app/s/abcdefghijklmnop"
        />
      </div>
    </main>
  );
}
