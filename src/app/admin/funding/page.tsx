import {
  FundingAdminClient,
} from '@/components/FundingAdminClient';
import {
  WalletSessionGate,
} from '@/components/WalletSessionGate';

export default function FundingAdminPage() {
  return (
    <WalletSessionGate>
      <FundingAdminClient />
    </WalletSessionGate>
  );
}
