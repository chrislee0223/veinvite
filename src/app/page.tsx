import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { RewardReceiptNotice } from '@/components/RewardReceiptNotice';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export default function HomePage() {
  return (
    <WalletSessionGate>
      <InviteStatusAutoRefresh />
      <HomeClient />
      <RewardReceiptNotice />
    </WalletSessionGate>
  );
}
