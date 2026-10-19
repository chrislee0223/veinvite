import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/i18n/locales';
import { QaRewardXPromotionHarness } from '@/qa/QaRewardXPromotionHarness';

export const dynamic = 'force-dynamic';

export default async function QaXPromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;
  if (locale && !isLocale(locale)) {
    notFound();
  }

  return (
    <QaRewardXPromotionHarness
      locale={isLocale(locale) ? locale : 'en'}
    />
  );
}
