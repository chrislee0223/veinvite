import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';
import { isLocale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

export default async function QaXPromotionLocalePage({
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
