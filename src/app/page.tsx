import { cookies } from 'next/headers';

import { ActiveWalletRewardReceiptNotice } from '@/components/ActiveWalletRewardReceiptNotice';
import { HomeClient } from '@/components/HomeClient';
import { InviteStatusAutoRefresh } from '@/components/InviteStatusAutoRefresh';
import { WalletSessionGate } from '@/components/WalletSessionGate';
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

  let initialSessionWallet: string | null = null;

  try {
    const initialSession =
      await getWalletSessionFromTokens(
        sessionTokens,
      );
    initialSessionWallet =
      initialSession?.walletAddress ?? null;
  } catch (error) {
    console.error(
      'Failed to bootstrap VeInvite wallet session:',
      error,
    );
  }

  return (
    <WalletSessionGate
      initialSessionWallet={
        initialSessionWallet
      }
    >
      <InviteStatusAutoRefresh />
      <HomeClient />
      <ActiveWalletRewardReceiptNotice />
    </WalletSessionGate>
  );
}
