import { isLocale } from '@/lib/i18n/locales';
import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';

export const dynamic = 'force-dynamic';

export default async function QaXPromotionI18nPage({
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
