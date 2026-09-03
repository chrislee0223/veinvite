import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProgressClaimV2Preview } from '@/components/ProgressClaimV2Preview';

export const metadata: Metadata = {
  title: 'VeInvite · Progress & Claim Preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function ProgressClaimV2PreviewPage() {
  const previewAllowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!previewAllowed) notFound();

  return <ProgressClaimV2Preview />;
}
