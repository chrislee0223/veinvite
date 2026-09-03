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
  RewardPayoutHistoryClient,
} from '@/components/RewardPayoutHistoryClient';

export const metadata: Metadata = {
  title: 'VeInvite Admin | Reward Payouts',
};

export default function RewardPayoutAdminPage() {
  return (
    <>
      <RewardOperationsStatusClient />
      <RewardPayoutHistoryClient />
      <RewardPayoutAutomationClient />
      <RewardPayoutAdminClient />
    </>
  );
}
