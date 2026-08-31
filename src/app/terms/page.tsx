import type { Metadata } from 'next';

import { LocalizedLegalPage } from '@/components/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'VeInvite Terms of Use',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'VeInvite Terms of Use',
    url: '/terms',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return <LocalizedLegalPage kind="terms" />;
}
