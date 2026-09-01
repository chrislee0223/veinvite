import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { UiTestHub } from '@/components/UiTestHub';

// PRODUCTION PARITY: UiTestHub renders the real AppGuide directly for the
// clean app-like flow. GuideUiPreview remains the audited wrapper baseline,
// while InviteRejectionPreview stays available in the participant-only area
// so production invite-ineligibility feedback remains covered without
// stacking every preview on one long page.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite UI Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function UiTestPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return <UiTestHub />;
}
