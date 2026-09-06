import { QaKnownStateRenderer } from '@/qa/QaKnownStateRenderer';

export const dynamic = 'force-dynamic';

type QaStatePageProps = {
  searchParams: Promise<{
    state?: string;
    locale?: string;
  }>;
};

export default async function QaStatePage({ searchParams }: QaStatePageProps) {
  const params = await searchParams;

  return (
    <QaKnownStateRenderer
      stateId={params.state ?? 'PRI-LANDING'}
      localeOverride={params.locale ?? null}
    />
  );
}
