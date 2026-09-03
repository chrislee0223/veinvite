import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { WalletSessionGate } from '@/components/WalletSessionGate';
import {
  isVeInviteRewardOperator,
  readVeInviteOperatorAccess,
} from '@/lib/rewards/operatorAccess';
import {
  getWalletSessionFromTokens,
  LEGACY_WALLET_SESSION_COOKIE_NAME,
  WALLET_SESSION_COOKIE_NAME,
} from '@/lib/walletAuthServer';

// Every admin request depends on the caller's wallet-session cookie and live
// operator membership. Prevent Next.js from attempting a build-time static
// render, which would both be meaningless for authorization and emit
// DYNAMIC_SERVER_USAGE noise during Production builds.
export const dynamic = 'force-dynamic';

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

  const operatorAccess =
    await readVeInviteOperatorAccess();

  return isVeInviteRewardOperator(
    session.walletAddress,
    operatorAccess,
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
