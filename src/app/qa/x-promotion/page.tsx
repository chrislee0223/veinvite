import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';
import { isLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

// Protected by the shared /qa layout access policy. This page renders the
// production X promotion component directly so multilingual layout QA is not
// coupled to wallet providers or notification-history hydration.
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
