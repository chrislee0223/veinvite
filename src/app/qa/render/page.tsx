import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QAScenarioRenderer } from '@/components/qa/QAScenarioRenderer';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';
import { getQaScenario } from '@/qa/scenarioRegistry';
import { isQaStudioAllowed } from '@/qa/serverGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite QA Renderer',
  robots: { index: false, follow: false },
};

type QaRenderSearchParams = Promise<{
  scenario?: string | string[];
  locale?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function QaRenderPage({
  searchParams,
}: {
  searchParams: QaRenderSearchParams;
}) {
  if (!isQaStudioAllowed()) {
    notFound();
  }

  const params = await searchParams;
  const scenario = getQaScenario(first(params.scenario));
  const requestedLocale = first(params.locale);
  const locale: SupportedLocale = isLocale(requestedLocale)
    ? requestedLocale
    : scenario.defaultLocale;

  return (
    <QAScenarioRenderer
      scenarioId={scenario.id}
      initialLocale={locale}
    />
  );
}
