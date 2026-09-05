import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { isQaStudioAllowed } from '@/qa/serverGate';

// PRODUCTION PARITY: the legacy URL now forwards to QA Studio, where the
// InviteRejectionPreview parity baseline is registered as a named scenario
// alongside real production-component scenarios. Keep this marker so the
// long-standing UI stability gate continues protecting rejection coverage
// while `/ui-test` itself no longer owns a second test experience.

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
