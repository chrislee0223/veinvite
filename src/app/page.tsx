import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export default function HomePage() {
  return (
    <WalletSessionGate>
      <InviteStatusAutoRefresh />
      <HomeClient />
    </WalletSessionGate>
  );
}
