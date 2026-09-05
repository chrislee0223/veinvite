import { QaScenarioRenderer } from '@/qa/QaScenarioRenderer';

export const dynamic = 'force-dynamic';

type QaRenderPageProps = {
  searchParams: Promise<{
    scenario?: string;
    locale?: string;
  }>;
};

export default async function QaRenderPage({ searchParams }: QaRenderPageProps) {
  const params = await searchParams;

  return (
    <QaScenarioRenderer
      scenarioId={params.scenario ?? 'invite-landing-ko-mobile'}
      localeOverride={params.locale ?? null}
    />
  );
}
