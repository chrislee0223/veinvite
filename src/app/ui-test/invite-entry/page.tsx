import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InviteEntryVisualPreview } from '@/components/InviteEntryVisualPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Invite Entry Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function InviteEntryPreviewPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) notFound();

  return <InviteEntryVisualPreview />;
}
