import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/i18n/locales';
import { QaXPromotionI18nHarness } from '@/qa/QaXPromotionI18nHarness';

export const dynamic = 'force-dynamic';

export default async function QaXPromotionI18nPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; mode?: string }>;
}) {
  const { locale, mode } = await searchParams;
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <QaXPromotionI18nHarness
      locale={locale}
      mode={mode === 'receipt' ? 'receipt' : 'promotion'}
    />
  );
}
