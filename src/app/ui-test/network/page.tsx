import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InfiniteNetworkCanvasV21Preview } from '@/components/InfiniteNetworkCanvasV21Preview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Infinite Network Canvas v2.1 Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NetworkPreviewPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return <InfiniteNetworkCanvasV21Preview />;
}
