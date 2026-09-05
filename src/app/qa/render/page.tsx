import { notFound } from 'next/navigation';

import { QaScenarioRenderer } from '@/qa/QaScenarioRenderer';

export const dynamic = 'force-dynamic';

type QaRenderPageProps = {
  searchParams: Promise<{
    scenario?: string;
    locale?: string;
  }>;
};

export default async function QaRenderPage({ searchParams }: QaRenderPageProps) {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  const params = await searchParams;

  return (
    <QaScenarioRenderer
      scenarioId={params.scenario ?? 'invite-landing-ko-mobile'}
      localeOverride={params.locale ?? null}
    />
  );
}
