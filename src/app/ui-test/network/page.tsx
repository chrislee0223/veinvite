import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InfiniteNetworkCanvasV26Preview } from '@/components/InfiniteNetworkCanvasV26Preview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Infinite Network v2.6 Preview',
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

  return <InfiniteNetworkCanvasV26Preview />;
}
