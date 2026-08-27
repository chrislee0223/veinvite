import type { Metadata } from 'next';

import {
  FundingAdminClient,
} from '@/components/FundingAdminClient';
import {
  WalletSessionGate,
} from '@/components/WalletSessionGate';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Funding Split',
  robots: {
    index: false,
    follow: false,
  },
};

export default function FundingAdminPage() {
  return (
    <WalletSessionGate>
      <FundingAdminClient />
    </WalletSessionGate>
  );
}
