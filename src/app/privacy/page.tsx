import type { Metadata } from 'next';

import { LocalizedLegalPage } from '@/components/LocalizedLegalPage';

export const metadata: Metadata = {
  title: 'VeInvite Privacy Policy',
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return <LocalizedLegalPage kind="privacy" />;
}
