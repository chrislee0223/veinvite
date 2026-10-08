import { InviteeClient } from '@/components/InviteeClient';
import { ReferralWalletBootstrapBoundary } from '@/components/ReferralWalletBootstrapBoundary';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readWalletSessionBootstrap } from '@/lib/walletSessionBootstrapServer';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, bootstrap] = await Promise.all([
    params,
    readWalletSessionBootstrap(),
  ]);
  const normalizedCode = code.toUpperCase();

  return (
    <ReferralWalletBootstrapBoundary
      initialSessionWallet={bootstrap.initialSessionWallet}
    >
      <WalletSessionGate
        initialSessionWallet={bootstrap.initialSessionWallet}
        initialRestrictionKind={bootstrap.initialRestrictionKind}
        initialLegalConsentStatus={bootstrap.initialLegalConsentStatus}
      >
        <InviteeClient code={normalizedCode} />
      </WalletSessionGate>
    </ReferralWalletBootstrapBoundary>
  );
}
