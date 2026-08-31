import type { Metadata } from 'next';

import { LocalizedLegalPage } from '@/components/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'VeInvite Privacy Policy',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'VeInvite Privacy Policy',
    url: '/privacy',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return <LocalizedLegalPage kind="privacy" />;
}
