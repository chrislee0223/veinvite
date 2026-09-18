import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { VeWorldTypedAuthProbe } from '@/components/VeWorldTypedAuthProbe';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite VeWorld Auth Probe',
  robots: {
    index: false,
    follow: false,
  },
};

export default function VeWorldAuthProbePage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return <VeWorldTypedAuthProbe />;
}
