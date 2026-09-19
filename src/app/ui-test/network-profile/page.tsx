import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale, type Locale } from '@/lib/i18n/locales';
import { QaNetworkProfileHarness } from '@/qa/QaNetworkProfileHarness';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Network Profile QA',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function NetworkProfileQaPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  const params = await searchParams;
  const locale: Locale = isLocale(params.locale) ? params.locale : 'ko';

  return <QaNetworkProfileHarness locale={locale} />;
}
