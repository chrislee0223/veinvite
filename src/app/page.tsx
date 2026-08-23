import { HomeClient } from '@/components/HomeClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';

export default function HomePage() {
  return (
    <WalletSessionGate>
      <HomeClient />
    </WalletSessionGate>
  );
}
