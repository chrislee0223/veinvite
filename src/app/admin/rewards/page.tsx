import type { Metadata } from 'next';

import {
  RewardOperationsStatusClient,
} from '@/components/RewardOperationsStatusClient';
import {
  RewardPayoutAdminClient,
} from '@/components/RewardPayoutAdminClient';
import {
  RewardPayoutAutomationClient,
} from '@/components/RewardPayoutAutomationClient';
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
      <RewardOperationsStatusClient />
      <RewardPayoutAutomationClient />
      <RewardPayoutAdminClient />
    </WalletSessionGate>
  );
}
