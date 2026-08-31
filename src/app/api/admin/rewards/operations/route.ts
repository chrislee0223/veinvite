import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  readRewardOperationsHealth,
} from '@/lib/rewards/operationsMonitoring';
import {
  canOperateVeInviteRewards,
  readVeInviteRewardPoolStatus,
} from '@/lib/rewards/onchainPool';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export async function GET(
  request: NextRequest,
) {
  try {
    const session =
      await requireWalletSession({ request });
    const pool =
      await readVeInviteRewardPoolStatus();

    if (
      !canOperateVeInviteRewards(
        session.walletAddress,
        pool,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The verified wallet is not the VeInvite reward operator.',
        },
        {
          status: 403,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const operations =
      await readRewardOperationsHealth();

    return NextResponse.json(
      {
        ...operations,
        verifiedOperator:
          session.walletAddress,
        writesPerformed: false,
        transfersPerformed: false,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof WalletAuthenticationError
    ) {
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    console.error(
      'Failed to load VeInvite reward operations status:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'VeInvite reward operations status could not be loaded.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
