import { cookies } from 'next/headers';

import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { RewardForecastSeedProvider } from '@/components/RewardForecastSeedProvider';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import {
  readCurrentLegalConsent,
} from '@/lib/legalConsentServer';
import { readPublicRewardForecastSeed } from '@/lib/rewards/publicRewardForecastSeedServer';
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

  let initialLegalConsentAccepted = false;
  if (initialSessionWallet) {
    try {
      initialLegalConsentAccepted = Boolean(
        await readCurrentLegalConsent(
          initialSessionWallet,
        ),
      );
    } catch (error) {
      // Fall back to the client consent check rather than failing Home. The
      // server bootstrap is an optimization only; consent remains authoritative.
      console.error(
        'Failed to bootstrap VeInvite legal consent:',
        error,
      );
    }
  }

  return (
    <>
      <span
        hidden
        data-veinvite-session-bootstrap={
          initialSessionWallet
            ? 'verified'
            : 'none'
        }
      />
      <span
        hidden
        data-veinvite-legal-consent-bootstrap={
          initialLegalConsentAccepted
            ? 'accepted'
            : 'unknown'
        }
        data-veinvite-legal-consent-wallet={
          initialLegalConsentAccepted && initialSessionWallet
            ? initialSessionWallet.toLowerCase()
            : ''
        }
      />
      <WalletSessionGate
        initialSessionWallet={
          initialSessionWallet
        }
      >
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
