import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QaStudio } from '@/qa/QaStudio';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite QA Studio',
  robots: {
    index: false,
    follow: false,
  },
};

export default function QaStudioPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return <QaStudio />;
}
