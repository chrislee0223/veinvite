import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { UiTestHub } from '@/components/UiTestHub';

// PRODUCTION PARITY: UiTestHub keeps InviteRejectionPreview in the
// participant-only section so the test surface continues to mirror the
// production invite-ineligibility feedback without stacking every preview.

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
