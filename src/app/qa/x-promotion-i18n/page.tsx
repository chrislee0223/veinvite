import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/i18n/locales';
import { QaXPromotionI18nHarness } from '@/qa/QaXPromotionI18nHarness';

export const dynamic = 'force-dynamic';

export default async function QaXPromotionI18nPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const { locale } = await searchParams;
  if (!isLocale(locale)) {
    notFound();
  }

  return <QaXPromotionI18nHarness locale={locale} />;
}
