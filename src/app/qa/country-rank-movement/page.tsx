import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import { isLocale, isRtlLocale } from '@/lib/i18n/locales';

// QA-only render target for Playwright. Tests replace both public leaderboard
// GET responses at the browser boundary, so no wallet, payout, or Production
// database is required to exercise the actual ranking component.
type PageProps = {
  searchParams: Promise<{ locale?: string }>;
};

export default async function QaCountryRankMovementPage({ searchParams }: PageProps) {
  const { locale: requestedLocale } = await searchParams;
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';

  return (
    <main
      className="screen"
      dir={isRtlLocale(locale) ? 'rtl' : 'ltr'}
      style={{
        minHeight: '100dvh',
        padding: '24px 16px 100px',
        color: '#fff',
        background: '#080807',
      }}
    >
      <div style={{ width: 'min(100%, 520px)', marginInline: 'auto' }}>
        <PublicLeaderboard locale={locale} wallet={null} />
      </div>
    </main>
  );
}
