import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { isQaStudioAllowed } from '@/qa/serverGate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite QA Studio',
  robots: {
    index: false,
    follow: false,
  },
};

export default function UiTestPage() {
  if (!isQaStudioAllowed()) {
    notFound();
  }

  // Keep existing developer bookmarks/share links useful while making the new
  // QA Studio the single source of truth for interactive UI/UX verification.
  redirect('/qa');
}
