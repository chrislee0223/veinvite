import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { isQaStudioAccessAllowed } from '@/qa/access';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite QA Studio',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function QaLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host');

  if (!isQaStudioAccessAllowed(host)) {
    notFound();
  }

  return children;
}
