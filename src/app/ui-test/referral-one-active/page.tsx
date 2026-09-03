import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ReferralOneActivePreview } from '@/components/ReferralOneActivePreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite · 1 Friend Active Preview',
  robots: { index: false, follow: false },
};

export default function ReferralOneActivePreviewPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) notFound();
  return <ReferralOneActivePreview />;
}
