import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { WalletSessionGate } from '@/components/WalletSessionGate';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  getWalletSessionFromTokens,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

async function readVerifiedOperatorSession() {
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

  const session =
    await getWalletSessionFromTokens(sessionTokens);

  if (!session) {
    return null;
  }

  const pool = await readVeInviteRewardPoolStatus();

  return canOperateVeInviteRewards(
    session.walletAddress,
    pool,
  )
    ? session
    : null;
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let operatorSession:
    Awaited<ReturnType<typeof readVerifiedOperatorSession>> = null;

  try {
    operatorSession =
      await readVerifiedOperatorSession();
  } catch (error) {
    console.error(
      'Failed to validate VeInvite admin access:',
      error,
    );
  }

  if (!operatorSession) {
    notFound();
  }

  return (
    <WalletSessionGate
      initialSessionWallet={
        operatorSession.walletAddress
      }
    >
      {children}
    </WalletSessionGate>
  );
}
