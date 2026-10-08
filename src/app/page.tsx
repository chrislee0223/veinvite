import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { RewardForecastSeedProvider } from '@/components/RewardForecastSeedProvider';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readPublicRewardForecastSeed } from '@/lib/rewards/publicRewardForecastSeedServer';
import { readWalletSessionBootstrap } from '@/lib/walletSessionBootstrapServer';

export default async function HomePage() {
  const [bootstrap, initialRewardForecast] = await Promise.all([
    readWalletSessionBootstrap(),
    readPublicRewardForecastSeed(),
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
        <RewardForecastSeedProvider
          initialForecast={initialRewardForecast}
        >
          <HomeClient />
        </RewardForecastSeedProvider>
        <ActiveWalletRewardReceiptNotice />
      </WalletSessionGate>
    </>
  );
}
