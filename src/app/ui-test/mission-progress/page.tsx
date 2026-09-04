import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InviteMissionActionPreview } from '@/components/InviteMissionActionPreview';

export const metadata: Metadata = {
  title: 'VeInvite Mission Progress Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';

export default function MissionProgressPreviewPage() {
  const previewAllowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!previewAllowed) notFound();

  return <InviteMissionActionPreview />;
}
