import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { RewardForecastSeedProvider } from '@/components/RewardForecastSeedProvider';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readPublicRewardForecastSeed } from '@/lib/rewards/publicRewardForecastSeedServer';
import { resolveOptionalPrefillWithin } from '@/lib/rewards/resolveOptionalPrefillWithin';
import { readWalletSessionBootstrap } from '@/lib/walletSessionBootstrapServer';

// A public estimate is optional. Keep the first Home render bounded even when a
// cold Vercel -> Supabase connection exceeds the seed reader's own timeout.
// The client forecast card already fetches the authoritative current estimate.
const HOME_FORECAST_PREFILL_BUDGET_MS = 400;

export default async function HomePage() {
  const [bootstrap, initialRewardForecast] = await Promise.all([
    readWalletSessionBootstrap(),
    resolveOptionalPrefillWithin(
      readPublicRewardForecastSeed(),
      null,
      HOME_FORECAST_PREFILL_BUDGET_MS,
    ),
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
