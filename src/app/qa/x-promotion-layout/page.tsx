import { RewardXPromotionPanel } from '@/components/RewardXPromotionPanel';
import { isLocale } from '@/lib/i18n/locales';

// QA access is enforced by the existing /qa layout and proxy.
// This isolated page renders the real panel without any wallet provider,
// reward mutation, or production data fixture.
export const dynamic = 'force-dynamic';

export default async function QaXPromotionLayoutPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;
  const selectedLocale = isLocale(locale) ? locale : 'en';

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
          boxSizing: 'border-box',
          width: 'min(400px, 100%)',
          padding: '14px',
          border: '1px solid rgba(255,255,255,.08)',
          borderRadius: '18px',
          background: '#11110f',
        }}
      >
        <RewardXPromotionPanel
          locale={selectedLocale}
          inviteCode="QA-X-PROMO-LAYOUT"
          receiptAmountB3tr="262.97"
          rewardShareUrl="https://veinvite.vercel.app/s/abcdefghijklmnop"
        />
      </div>
    </main>
  );
}
