import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QAStudioClient } from '@/components/qa/QAStudioClient';
import { isQaStudioAllowed } from '@/qa/serverGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite QA Studio',
  description: 'Preview-only VeInvite UI/UX scenario simulator.',
  robots: { index: false, follow: false },
};

export default function QaStudioPage() {
  if (!isQaStudioAllowed()) {
    notFound();
  }

  const environment =
    process.env.VERCEL_ENV ??
    (process.env.NODE_ENV === 'development' ? 'development' : 'unknown');
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local';

  return (
    <QAStudioClient
      environment={environment}
      commitSha={commitSha}
    />
  );
}
