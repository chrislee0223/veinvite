import { QaNetworkSamplePreview } from '@/qa/QaNetworkSamplePreview';
import { isLocale, type Locale } from '@/lib/i18n/locales';

export const dynamic = 'force-dynamic';

type QaNetworkSamplePageProps = {
  searchParams: Promise<{
    locale?: string;
  }>;
};

export default async function QaNetworkSamplePage({ searchParams }: QaNetworkSamplePageProps) {
  const params = await searchParams;
  const locale: Locale = isLocale(params.locale) ? params.locale : 'ko';

  return <QaNetworkSamplePreview locale={locale} />;
}
