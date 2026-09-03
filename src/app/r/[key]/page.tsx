import type { Metadata } from 'next';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export const metadata: Metadata = {
  title: 'VeInvite',
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
