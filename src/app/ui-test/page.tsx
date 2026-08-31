import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { UiTestLab } from '@/components/UiTestLab';
import './ui-test.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite UI Test Lab',
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

  return <UiTestLab />;
}
