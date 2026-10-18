import { isLocale } from '@/lib/i18n/locales';
import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';

export const dynamic = 'force-dynamic';

// Protected by the existing /qa/layout access policy. This route renders the
// real Production X promotion component without wallet or VeChain providers.
// Playwright intercepts the component's API calls with deterministic fixtures.
export default async function QaXPromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;

  return (
    <QaRewardXPromotionHarness
      locale={isLocale(locale) ? locale : 'en'}
    />
  );
}
