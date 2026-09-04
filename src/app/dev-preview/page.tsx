import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DeveloperPreview } from '@/components/DeveloperPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Developer Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DeveloperPreviewPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return <DeveloperPreview />;
}
