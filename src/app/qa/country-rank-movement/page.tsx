import { PublicLeaderboard } from '@/components/PublicLeaderboard';
import { isLocale, isRtlLocale } from '@/lib/i18n/locales';

// QA-only render target for Playwright. Tests replace both public leaderboard
// GET responses at the browser boundary, so no wallet, payout, or Production
// database is required to exercise the actual ranking component.
type PageProps = {
  searchParams: Promise<{ locale?: string; demoWallet?: string }>;
};

export default async function QaCountryRankMovementPage({ searchParams }: PageProps) {
  const { locale: requestedLocale, demoWallet } = await searchParams;
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';
  // A fixed, non-owned synthetic wallet exercises the inviter footer while
  // browser QA mocks public read-only responses. No wallet session is created.
  const wallet = demoWallet === 'unranked'
    ? '0x0000000000000000000000000000000000000cab'
    : null;

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
        <PublicLeaderboard locale={locale} wallet={wallet} />
      </div>
    </main>
  );
}
