import type { Metadata } from 'next';

import {
  RewardPayoutAdminClient,
} from '@/components/RewardPayoutAdminClient';
import {
  WalletSessionGate,
} from '@/components/WalletSessionGate';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Reward Payouts',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RewardPayoutAdminPage() {
  return (
    <WalletSessionGate>
      <RewardPayoutAdminClient />
    </WalletSessionGate>
  );
}
