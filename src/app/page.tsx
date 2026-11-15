import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readWalletSessionBootstrapForFirstPaint } from '@/lib/walletSessionBootstrapServer';
import { readPublicSharedPoolFirstPaintForecast } from '@/lib/rewards/publicRewardForecastFirstPaint';

// Seed only the approved current-cohort quote, never historical reward estimates.
export default async function HomePage() {
  const [bootstrap, initialRewardForecast] = await Promise.all([
    readWalletSessionBootstrapForFirstPaint(),
    readPublicSharedPoolFirstPaintForecast(),
  ]);

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
        <HomeClient initialRewardForecast={initialRewardForecast} />
        <ActiveWalletRewardReceiptNotice />
      </WalletSessionGate>
    </>
  );
}
