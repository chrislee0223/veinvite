import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readWalletSessionBootstrapForFirstPaint } from '@/lib/walletSessionBootstrapServer';

// The current shared-pool preview is fetched client-side after app readiness.
// Do not server-seed the retired recipient-floor per-person quote.
export default async function HomePage() {
  const bootstrap = await readWalletSessionBootstrapForFirstPaint();

  const initialSessionWallet =
    bootstrap.initialSessionWallet;

  return (
    <>
      <span
        hidden
        data-veinvite-session-bootstrap={
          initialSessionWallet
            ? 'verified'
            : 'none'
        }
        data-veinvite-session-wallet={
          initialSessionWallet ?? ''
        }
      />
      <WalletSessionGate
        initialSessionWallet={
          initialSessionWallet
        }
        initialRestrictionKind={
          bootstrap.initialRestrictionKind === 'BLACKLIST'
            ? 'BLACKLIST'
            : null
        }
        initialLegalConsentStatus={
          bootstrap.initialLegalConsentStatus
        }
      >
        <InviteStatusAutoRefresh />
        <HomeClient />
        <ActiveWalletRewardReceiptNotice />
      </WalletSessionGate>
    </>
  );
}
