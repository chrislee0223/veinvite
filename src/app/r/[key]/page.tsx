import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export const metadata: Metadata = {
  title: 'VeInvite',
  description:
    'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
  twitter: {
    card: 'summary_large_image',
    title: 'VeInvite',
    description:
      'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
  },
  openGraph: {
    title: 'VeInvite',
    description:
      'Invite your friends through VeInvite and help them get started with VeBetterDAO.',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function PermanentReferralPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  return (
    <WalletSessionGate>
      <PermanentReferralClient referralKey={key.trim()} />
    </WalletSessionGate>
  );
}
