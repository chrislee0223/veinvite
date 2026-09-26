import { cookies } from 'next/headers';

import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { RewardForecastSeedProvider } from '@/components/RewardForecastSeedProvider';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { readPublicRewardForecastSeed } from '@/lib/rewards/publicRewardForecastSeedServer';
import { loadActiveSybilV2Restriction } from '@/lib/sybil/v2/restrictions';
import { getVeBetterNetwork } from '@/lib/vebetter/network';
import {
  getWalletSessionFromTokens,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

export default async function HomePage() {
  const cookieStore = await cookies();
  const cookieNames = Array.from(
    new Set([
      WALLET_SESSION_COOKIE_NAME,
      LEGACY_WALLET_SESSION_COOKIE_NAME,
    ]),
  );
  const sessionTokens = cookieNames.flatMap(
    (name) =>
      cookieStore
        .getAll(name)
        .map((cookie) => cookie.value),
  );

  const [initialSession, initialRewardForecast] = await Promise.all([
    getWalletSessionFromTokens(sessionTokens).catch((error) => {
      console.error(
        'Failed to bootstrap VeInvite wallet session:',
        error,
      );
      return null;
    }),
    readPublicRewardForecastSeed(),
  ]);
  const initialSessionWallet =
    initialSession?.walletAddress ?? null;
  const initialRestriction = initialSessionWallet
    ? await loadActiveSybilV2Restriction({
        walletAddress: initialSessionWallet,
        network: getVeBetterNetwork(),
      }).catch((error) => {
        console.error(
          'Failed to bootstrap VeInvite participation restriction:',
          error,
        );
        return null;
      })
    : null;

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
          initialRestriction?.restriction_kind === 'BLACKLIST'
            ? 'BLACKLIST'
            : null
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
