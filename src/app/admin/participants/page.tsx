import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  ParticipantsAdminClient,
} from '@/components/ParticipantsAdminClient';
import {
  WalletSessionGate,
} from '@/components/WalletSessionGate';
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
  title: 'VeInvite Admin | Participants',
  robots: {
    index: false,
    follow: false,
  },
};

async function readOperatorSession() {
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

export default async function ParticipantsAdminPage() {
  let operatorSession:
    Awaited<ReturnType<typeof readOperatorSession>> = null;

  try {
    operatorSession = await readOperatorSession();
  } catch (error) {
    console.error(
      'Failed to validate VeInvite admin page access:',
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
      <ParticipantsAdminClient />
    </WalletSessionGate>
  );
}
