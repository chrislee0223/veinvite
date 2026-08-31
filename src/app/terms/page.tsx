import type { Metadata } from 'next';

import { LocalizedLegalPage } from '@/components/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'VeInvite Terms of Use',
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
  return <LocalizedLegalPage kind="terms" />;
}
